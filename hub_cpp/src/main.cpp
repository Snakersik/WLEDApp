#include <Arduino.h>
#include <WiFi.h>
#include "esp_task_wdt.h"
#include <WiFiUdp.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <ESPmDNS.h>
#include "config.h"
#include "hub_meta.h"
#include "effects.h"
#include "scheduler.h"
#include "webserver.h"

// ── Global state ───────────────────────────────────────────────
std::vector<Group>  g_groups;
std::vector<String> g_devices;
portMUX_TYPE        g_mux = portMUX_INITIALIZER_UNLOCKED;
HubMeta             g_hubMeta;

// ── Identify blink ─────────────────────────────────────────────
String   g_identifyIp    = "";
uint32_t g_identifyUntil = 0;

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

// ── Hub identity (/hub.json) ───────────────────────────────────
static void ensureHubMeta() {
  if (LittleFS.exists("/hub.json")) {
    File f = LittleFS.open("/hub.json", "r");
    JsonDocument doc;
    if (deserializeJson(doc, f) == DeserializationError::Ok) {
      g_hubMeta.hub_id    = doc["hub_id"]    | "";
      g_hubMeta.name      = doc["name"]      | "DDP Hub";
      g_hubMeta.mdns_name = doc["mdns_name"] | "";
    }
    f.close();
    if (g_hubMeta.hub_id.length()) return;
  }
  // Generate from Efuse MAC
  uint64_t chipid = ESP.getEfuseMac();
  char hex[13];
  snprintf(hex, sizeof(hex), "%012llx", chipid);
  g_hubMeta.hub_id    = String("hub_") + hex;
  g_hubMeta.name      = "DDP Hub";
  g_hubMeta.mdns_name = String("ddp-hub-") + String(hex + 6); // last 6 hex chars
  JsonDocument doc;
  doc["hub_id"]    = g_hubMeta.hub_id;
  doc["name"]      = g_hubMeta.name;
  doc["mdns_name"] = g_hubMeta.mdns_name;
  File f = LittleFS.open("/hub.json", "w");
  if (f) { serializeJson(doc, f); f.close(); }
  Serial.printf("[HUB] ID: %s  mDNS: %s\n",
                g_hubMeta.hub_id.c_str(), g_hubMeta.mdns_name.c_str());
}

// ── BLE provisioning ───────────────────────────────────────────
#define BLE_SVC_UUID    "12340000-1234-1234-1234-123456789012"
#define BLE_CONFIG_UUID "12340001-1234-1234-1234-123456789012"
#define BLE_STATUS_UUID "12340002-1234-1234-1234-123456789012"
#define BLE_META_UUID   "12340003-1234-1234-1234-123456789012"

static NimBLECharacteristic* _statusChar = nullptr;

// Sends identity hello as soon as phone subscribes to STATUS_CHAR notifications.
// This is reliable (uses push, not read) and not affected by Android GATT cache.
class StatusCharCB : public NimBLECharacteristicCallbacks {
  void onSubscribe(NimBLECharacteristic* c, ble_gap_conn_desc*, uint16_t subValue) override {
    if (subValue == 0) return; // unsubscribe event — ignore
    String hello = "{\"state\":\"hello\",\"hub_id\":\"" + g_hubMeta.hub_id +
                   "\",\"mdns_name\":\"" + g_hubMeta.mdns_name + "\"}";
    c->setValue(hello.c_str());
    c->notify();
    Serial.printf("[BLE] hello sent → %s\n", hello.c_str());
  }
};

class ConfigCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    std::string raw = c->getValue();
    JsonDocument doc;
    if (deserializeJson(doc, raw) != DeserializationError::Ok) return;

    const char* cmd = doc["cmd"];
    if (!cmd || strcmp(cmd, "provision_wifi") != 0) return;

    const char* ssid = doc["ssid"];
    const char* pass = doc["password"];
    if (!ssid || !pass) return;

    Serial.printf("[BLE] Provisioning WiFi: %s\n", ssid);

    // Save wifi.json synchronously (fast, before callback returns)
    {
      JsonDocument wifiDoc;
      wifiDoc["ssid"] = ssid;
      wifiDoc["password"] = pass;
      File f = LittleFS.open("/wifi.json", "w");
      if (f) { serializeJson(wifiDoc, f); f.close(); }
    }

    // Notify "connecting" immediately so app knows the command was received
    if (_statusChar) {
      _statusChar->setValue("{\"state\":\"connecting\"}");
      _statusChar->notify();
    }

    // Heap-copy ssid/pass — xTaskCreate lambda needs them after callback returns
    char** args = (char**)malloc(2 * sizeof(char*));
    if (!args) return;
    args[0] = strdup(ssid);
    args[1] = strdup(pass);
    if (!args[0] || !args[1]) {
      free(args[0]); free(args[1]); free(args); return;
    }

    if (xTaskCreate([](void* arg) {
      char** a = (char**)arg;
      char* ssid = a[0];
      char* pass = a[1];

      WiFi.disconnect(true, true);
      delay(200);
      WiFi.mode(WIFI_STA);
      WiFi.setHostname(g_hubMeta.mdns_name.c_str());
      WiFi.begin(ssid, pass);
      free(ssid); free(pass); free(a);

      unsigned long start = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
        delay(200);
      }
      if (WiFi.status() == WL_CONNECTED) {
        String ip = WiFi.localIP().toString();
        Serial.printf("[BLE] WiFi OK — IP: %s\n", ip.c_str());
        if (_statusChar) {
          String msg = "{\"state\":\"success\",\"ip\":\"" + ip +
                       "\",\"hub_id\":\"" + g_hubMeta.hub_id +
                       "\",\"mdns_name\":\"" + g_hubMeta.mdns_name + "\"}";
          _statusChar->setValue(msg.c_str());
          _statusChar->notify();
        }
        delay(5000);
      } else {
        Serial.println("[BLE] WiFi failed");
        if (_statusChar) {
          _statusChar->setValue("{\"state\":\"error\",\"reason\":\"wifi_failed\"}");
          _statusChar->notify();
        }
        delay(500);
      }
      Serial.println("[BLE] Rebooting...");
      ESP.restart();
      vTaskDelete(nullptr);
    }, "ble_wifi", 16384, args, 1, nullptr) != pdPASS) {
      free(args[0]); free(args[1]); free(args);
    }
  }
};

static void startBLE() {
  NimBLEDevice::init("WLED-Hub");
  NimBLEServer* srv = NimBLEDevice::createServer();
  NimBLEService* svc = srv->createService(BLE_SVC_UUID);

  auto* configChar = svc->createCharacteristic(BLE_CONFIG_UUID, NIMBLE_PROPERTY::WRITE);
  configChar->setCallbacks(new ConfigCB());

  _statusChar = svc->createCharacteristic(
    BLE_STATUS_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  _statusChar->setValue("{\"state\":\"idle\"}");
  _statusChar->setCallbacks(new StatusCharCB());

  // META_CHAR — read-only, exposes hub_id + mdns_name before WiFi starts
  // Phone reads this BEFORE sending WiFi credentials (while BLE is stable)
  auto* metaChar = svc->createCharacteristic(BLE_META_UUID, NIMBLE_PROPERTY::READ);
  String metaJson = "{\"hub_id\":\"" + g_hubMeta.hub_id +
                    "\",\"mdns_name\":\"" + g_hubMeta.mdns_name + "\"}";
  metaChar->setValue(metaJson.c_str());

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
  esp_task_wdt_init(30, false); // 30s WDT, no panic — prevents async_tcp crash

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  }

  ensureHubMeta();

  bool wifiOk = connectWifi();
  if (!wifiOk) { startBLE(); return; } // BLE provisioning mode — don't start HTTP/DDP

  loadConfig();
  loadTzOffset();
  loadSchedules();
  if (wifiOk) ntpSync();

  if (MDNS.begin(g_hubMeta.mdns_name.c_str())) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[mDNS] http://%s.local\n", g_hubMeta.mdns_name.c_str());
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
uint32_t        g_frameCount        = 0;

void loop() {
  uint32_t now = millis();

  // Schedule check — once per minute (blocks ~4s max)
  if (now - _lastScheduleCheck >= 60000) {
    _lastScheduleCheck = now;
    checkSchedules();
  }

  if (now - _lastFrame < _frameMs) return;
  _lastFrame = now;
  g_frameCount++;

  // 1. Render effects (no heap alloc — safe inside critical section)
  taskENTER_CRITICAL(&g_mux);
  for (auto& g : g_groups) renderGroup(g, now);
  taskEXIT_CRITICAL(&g_mux);

  // 2. Copy pixels under lock (memcpy only — no heap alloc)
  //    Copy device IPs WITHOUT lock — String heap alloc inside critical section
  //    can crash on ESP32 when allocator needs an OS mutex. Slightly stale IPs
  //    are acceptable for DDP (worst case: one frame to wrong IP).
  struct Snapshot { std::vector<String> devs; CRGB leds[NUM_LEDS]; };
  std::vector<Snapshot> snaps;
  snaps.reserve(g_groups.size());
  for (size_t i = 0; i < g_groups.size(); i++) {
    Snapshot s;
    s.devs = g_groups[i].devices;            // String copy — outside lock (heap safe)
    taskENTER_CRITICAL(&g_mux);
    memcpy(s.leds, g_groups[i].leds, sizeof(s.leds)); // pixel copy — under lock
    taskEXIT_CRITICAL(&g_mux);
    snaps.push_back(std::move(s));
  }

  // Send DDP outside lock
  static CRGB _blinkBuf[NUM_LEDS];
  for (auto& s : snaps) {
    for (auto& ip : s.devs) {
      if (!g_identifyIp.isEmpty() && ip == g_identifyIp && millis() < g_identifyUntil) {
        // Identify blink: alternate red / black at ~3Hz
        bool redOn = (millis() / 160) % 2 == 0;
        fill_solid(_blinkBuf, NUM_LEDS, redOn ? CRGB::Red : CRGB::Black);
        ddpSend(ip.c_str(), _blinkBuf);
      } else {
        if (!g_identifyIp.isEmpty() && ip == g_identifyIp && millis() >= g_identifyUntil) {
          g_identifyIp = ""; // done — clear flag
        }
        ddpSend(ip.c_str(), s.leds);
      }
      delay(2); // prevent lwIP buffer overflow
      yield();  // let async_tcp task run
    }
  }
}
