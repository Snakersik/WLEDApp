#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <mbedtls/base64.h>
#include "config.h"
#include "effects.h"
#include "scheduler.h"
#include "webserver.h"

// ── Global state ───────────────────────────────────────────────
std::vector<Group>  g_groups;
std::vector<String> g_devices;
portMUX_TYPE        g_mux = portMUX_INITIALIZER_UNLOCKED;

// ── DDP packet ─────────────────────────────────────────────────
static WiFiUDP     _udp;
static uint8_t     _ddpPkt[10 + NUM_LEDS * 3];

static void ddpSend(const char* ip, const CRGB* leds) {
  _ddpPkt[0] = 0x41; _ddpPkt[1] = 0x01;
  _ddpPkt[8] = 0x00; _ddpPkt[9] = NUM_LEDS * 3;
  for (int i = 0; i < NUM_LEDS; i++) {
    _ddpPkt[10 + i * 3]     = leds[i].r;
    _ddpPkt[10 + i * 3 + 1] = leds[i].g;
    _ddpPkt[10 + i * 3 + 2] = leds[i].b;
  }
  _udp.beginPacket(ip, DDP_PORT);
  _udp.write(_ddpPkt, sizeof(_ddpPkt));
  _udp.endPacket();
}

// ── WiFi ───────────────────────────────────────────────────────
static bool connectWifi() {
  if (!LittleFS.exists("/wifi.json")) {
    Serial.println("No wifi.json");
    return false;
  }
  File f = LittleFS.open("/wifi.json", "r");
  JsonDocument doc;
  if (deserializeJson(doc, f)) { f.close(); return false; }
  f.close();
  const char* ssid = doc["ssid"];
  const char* pass = doc["password"];
  if (!ssid) return false;

  Serial.printf("Connecting to %s\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  for (int i = 0; i < 40; i++) {
    if (WiFi.status() == WL_CONNECTED) break;
    delay(500);
  }
  if (WiFi.status() != WL_CONNECTED) { Serial.println("WiFi failed"); return false; }
  Serial.printf("WiFi OK: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

// ── BLE provisioning ───────────────────────────────────────────
#define BLE_SVC_UUID  "12340000-1234-1234-1234-123456789012"
#define BLE_SSID_UUID "12340001-1234-1234-1234-123456789012"
#define BLE_PASS_UUID "12340002-1234-1234-1234-123456789012"
#define BLE_IP_UUID   "12340003-1234-1234-1234-123456789012"

static String _bleSsid, _blePass;
static NimBLECharacteristic* _ipChar = nullptr;

static String b64decode(const std::string& input) {
  size_t olen = 0;
  unsigned char buf[256] = {};
  mbedtls_base64_decode(buf, sizeof(buf), &olen,
    (const unsigned char*)input.c_str(), input.size());
  return String((char*)buf, olen);
}

class SsidCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    // ble-plx decodes base64 before sending — hub receives raw UTF-8 bytes
    std::string v = c->getValue();
    _bleSsid = String(v.c_str(), v.length());
    Serial.printf("[BLE] SSID received: %s\n", _bleSsid.c_str());
  }
};

class PassCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    std::string v = c->getValue();
    _blePass = String(v.c_str(), v.length());
    Serial.println("[BLE] PASS received — saving wifi.json");
    if (!_bleSsid.length()) return;

    // Save wifi.json
    JsonDocument doc;
    doc["ssid"] = _bleSsid;
    doc["password"] = _blePass;
    File f = LittleFS.open("/wifi.json", "w");
    if (f) { serializeJson(doc, f); f.close(); }

    // Connect to WiFi and send IP back via BLE before restarting
    Serial.printf("[BLE] Connecting to WiFi: %s\n", _bleSsid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(_bleSsid.c_str(), _blePass.c_str());
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
      delay(200);
    }

    if (WiFi.status() == WL_CONNECTED) {
      String ip = WiFi.localIP().toString();
      Serial.printf("[BLE] WiFi OK — IP: %s\n", ip.c_str());
      if (_ipChar) {
        _ipChar->setValue(ip.c_str());
        _ipChar->notify();
      }
      delay(2000); // give BLE time to deliver notify
    } else {
      Serial.println("[BLE] WiFi failed — notifying ERROR");
      if (_ipChar) {
        _ipChar->setValue("ERROR");
        _ipChar->notify();
      }
      delay(500);
    }

    Serial.println("[BLE] Rebooting...");
    ESP.restart();
  }
};

static void startBLE() {
  NimBLEDevice::init("WLED-Hub");
  NimBLEServer* srv = NimBLEDevice::createServer();
  NimBLEService* svc = srv->createService(BLE_SVC_UUID);

  auto* ssidChar = svc->createCharacteristic(BLE_SSID_UUID, NIMBLE_PROPERTY::WRITE);
  ssidChar->setCallbacks(new SsidCB());

  auto* passChar = svc->createCharacteristic(BLE_PASS_UUID, NIMBLE_PROPERTY::WRITE);
  passChar->setCallbacks(new PassCB());

  _ipChar = svc->createCharacteristic(
    BLE_IP_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  _ipChar->setValue("");

  svc->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SVC_UUID);
  adv->start();
  Serial.println("[BLE] Advertising as 'WLED-Hub' — waiting for provisioning");
}

// ── Setup ──────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[HUB] Booting DDP Hub v3.0.0 (C++)");

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  }

  bool wifiOk = connectWifi();
  if (!wifiOk) { startBLE(); return; } // BLE provisioning mode — don't start HTTP/DDP

  loadConfig();
  loadTzOffset();
  loadSchedules();
  if (wifiOk) ntpSync();

  // If no groups exist, create a default group with the two kinkiety
  if (g_groups.empty()) {
    Group g;
    g.id   = "1";
    g.name = "Kinkiety";
    g.devices.push_back("192.168.10.169");
    g.devices.push_back("192.168.10.210");
    g.state.fx  = 9;   // rainbow default
    g.state.bri = 220;
    g.state.sx  = 150;
    g_groups.push_back(std::move(g));
    saveConfig();
    Serial.println("Created default group");
  }

  _udp.begin(4049); // local port (any unused)
  setupServer();

  Serial.printf("Free heap: %d\n", ESP.getFreeHeap());
  Serial.println("[HUB] Ready");
}

// ── Loop ───────────────────────────────────────────────────────
static uint32_t _lastFrame          = 0;
static uint32_t _lastScheduleCheck  = 0;
static const uint32_t _frameMs      = 1000 / FPS;

void loop() {
  uint32_t now = millis();

  // Schedule check — once per minute (blocks ~4s max)
  if (now - _lastScheduleCheck >= 60000) {
    _lastScheduleCheck = now;
    checkSchedules();
  }

  if (now - _lastFrame < _frameMs) return;
  _lastFrame = now;

  // Snapshot groups under lock, render outside lock
  taskENTER_CRITICAL(&g_mux);
  // We render directly — effects only touch leds[], heat[], tw[] (no heap alloc)
  // Safe because HTTP callbacks don't touch pixel buffers
  for (auto& g : g_groups) {
    renderGroup(g, now);
  }
  // Copy device list per group while locked
  struct Snapshot { std::vector<String> devs; CRGB leds[NUM_LEDS]; };
  std::vector<Snapshot> snaps;
  for (auto& g : g_groups) {
    Snapshot s;
    s.devs = g.devices;
    memcpy(s.leds, g.leds, sizeof(g.leds));
    snaps.push_back(std::move(s));
  }
  taskEXIT_CRITICAL(&g_mux);

  // Send DDP outside lock
  for (auto& s : snaps) {
    for (auto& ip : s.devs) {
      ddpSend(ip.c_str(), s.leds);
      delay(5); // prevent lwIP buffer overflow
    }
  }
}
