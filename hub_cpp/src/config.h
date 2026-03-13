#pragma once
#include <Arduino.h>
#include <FastLED.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <vector>

// ── Hardware config ────────────────────────────────────────────
#define NUM_LEDS   30
#define DDP_PORT   4048
#define FPS        40

// ── State ──────────────────────────────────────────────────────
struct SegState {
  bool    on  = true;
  uint8_t bri = 220;
  uint8_t fx  = 5;  // Wipe Reversed (was 9 = Rainbow)
  uint8_t sx  = 128;
  uint8_t ix  = 128;
  uint8_t col[3] = {0, 120, 255};
};

struct Group {
  String              id;
  String              name;
  std::vector<String> devices;
  SegState            state;
  CRGB                leds[NUM_LEDS];

  // ── Per-effect state buffers ───────────────────────────────
  uint8_t  heat[NUM_LEDS];      // Fire2012, FireFlicker
  uint8_t  tw[NUM_LEDS];        // Twinkle, TwinkleFade
  uint8_t  efxBuf[NUM_LEDS];    // Dissolve, Rain, Gradient
  uint16_t pixelState[NUM_LEDS];// TwinkleFox per-pixel clock offset

  // Wipe Random
  uint32_t wrCycle = UINT32_MAX;
  CRGB     wrCol   = CRGB::White;

  // Bouncing Balls (fx=53)
  struct Ball { float pos; float vel; uint8_t colIdx; bool active; };
  Ball     balls[8];
  bool     ballsInit = false;

  // Ripple (fx=79)
  int16_t  ripCenter = -1;
  int16_t  ripAge    = 255;

  // Lightning (fx=57)
  uint8_t  ltgFlash = 0;
  int16_t  ltgStart = -1;
  int16_t  ltgLen   = -1;
  uint32_t ltgNext  = 0;

  // Candle (fx=116)
  uint8_t  candleVal = 128;

  // Starburst (fx=117)
  struct Spark { float pos; float vel; uint8_t hue; uint8_t life; };
  std::vector<Spark> sparks;
  uint32_t           burstNext = 0;

  // Fireworks 1D (fx=44)
  struct Particle { int32_t pos; int32_t vel; uint8_t life; uint8_t r, g, b; bool isSpark; };
  std::vector<Particle> fw;

  Group() {
    memset(leds,       0, sizeof(leds));
    memset(heat,       0, sizeof(heat));
    memset(tw,         0, sizeof(tw));
    memset(efxBuf,     0, sizeof(efxBuf));
    memset(pixelState, 0, sizeof(pixelState));
    memset(balls,      0, sizeof(balls));
  }
};

// ── Global state ───────────────────────────────────────────────
extern std::vector<Group>  g_groups;
extern std::vector<String> g_devices;
extern portMUX_TYPE        g_mux;

// ── JSON helpers ───────────────────────────────────────────────
inline void stateToJson(const SegState& s, JsonObject obj) {
  obj["on"]  = s.on;  obj["bri"] = s.bri;
  obj["fx"]  = s.fx;  obj["sx"]  = s.sx;  obj["ix"] = s.ix;
  JsonArray col = obj["col"].to<JsonArray>();
  JsonArray c0  = col.add<JsonArray>();
  c0.add(s.col[0]); c0.add(s.col[1]); c0.add(s.col[2]);
  col.add<JsonArray>(); col.add<JsonArray>();
}

inline void applyState(SegState& s, JsonObjectConst p) {
  if (p["on"].is<bool>())  s.on  = p["on"].as<bool>();
  if (p["bri"].is<int>())  s.bri = constrain(p["bri"].as<int>(), 0, 255);
  if (p["fx"].is<int>())   s.fx  = p["fx"].as<int>();
  if (p["sx"].is<int>())   s.sx  = p["sx"].as<int>();
  if (p["ix"].is<int>())   s.ix  = p["ix"].as<int>();
  if (p["col"].is<JsonArrayConst>()) {
    auto c0 = p["col"][0];
    if (c0.is<JsonArrayConst>()) { s.col[0]=c0[0]; s.col[1]=c0[1]; s.col[2]=c0[2]; }
  }
  if (p["seg"].is<JsonArrayConst>()) {
    auto seg = p["seg"][0];
    if (seg["col"].is<JsonArrayConst>()) {
      auto c0 = seg["col"][0];
      if (c0.is<JsonArrayConst>()) { s.col[0]=c0[0]; s.col[1]=c0[1]; s.col[2]=c0[2]; }
    }
    if (seg["fx"].is<int>()) s.fx = seg["fx"].as<int>();
    if (seg["sx"].is<int>()) s.sx = seg["sx"].as<int>();
    if (seg["ix"].is<int>()) s.ix = seg["ix"].as<int>();
  }
}

// ── Persistence ────────────────────────────────────────────────
inline void saveConfig() {
  File f = LittleFS.open("/hub_config.json", "w");
  if (!f) return;
  JsonDocument doc;
  JsonArray grps = doc["groups"].to<JsonArray>();
  taskENTER_CRITICAL(&g_mux);
  for (auto& g : g_groups) {
    JsonObject obj = grps.add<JsonObject>();
    obj["id"] = g.id; obj["name"] = g.name;
    JsonArray devs = obj["devices"].to<JsonArray>();
    for (auto& d : g.devices) devs.add(d);
    JsonObject st = obj["state"].to<JsonObject>();
    stateToJson(g.state, st);
  }
  JsonArray devList = doc["devices"].to<JsonArray>();
  for (auto& d : g_devices) devList.add(d);
  taskEXIT_CRITICAL(&g_mux);
  serializeJson(doc, f); f.close();
}

inline uint32_t nextId(const std::vector<Group>& v) {
  uint32_t mx = 0;
  for (auto& g : v) { uint32_t n = g.id.toInt(); if (n > mx) mx = n; }
  return mx + 1;
}

inline void loadConfig() {
  if (!LittleFS.exists("/hub_config.json")) { Serial.println("No config"); return; }
  File f = LittleFS.open("/hub_config.json", "r");
  if (!f) return;
  JsonDocument doc;
  if (deserializeJson(doc, f)) { f.close(); return; }
  f.close();
  taskENTER_CRITICAL(&g_mux);
  g_groups.clear(); g_devices.clear();
  for (JsonObjectConst obj : doc["groups"].as<JsonArrayConst>()) {
    Group g;
    g.id   = obj["id"].as<String>();
    g.name = obj["name"].as<String>();
    for (auto d : obj["devices"].as<JsonArrayConst>()) g.devices.push_back(d.as<String>());
    if (obj["state"].is<JsonObjectConst>()) applyState(g.state, obj["state"].as<JsonObjectConst>());
    g_groups.push_back(std::move(g));
  }
  for (auto d : doc["devices"].as<JsonArrayConst>()) g_devices.push_back(d.as<String>());
  taskEXIT_CRITICAL(&g_mux);
  Serial.printf("Loaded %d groups, %d devices\n", (int)g_groups.size(), (int)g_devices.size());
}
