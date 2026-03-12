#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "config.h"

// ── Timezone ────────────────────────────────────────────────────

static long _tzOffset = 3600;  // seconds east of UTC, default UTC+1

inline void loadTzOffset() {
  if (!LittleFS.exists("/tz.json")) return;
  File f = LittleFS.open("/tz.json", "r");
  JsonDocument d; deserializeJson(d, f); f.close();
  _tzOffset = d["tz_offset"] | 3600L;
  Serial.printf("[SCHED] tz_offset loaded: %ld\n", _tzOffset);
}

inline void ntpSync() {
  configTime(_tzOffset, 0, "pool.ntp.org", "time.google.com");
  struct tm t;
  for (int i = 0; i < 10; i++) {
    if (getLocalTime(&t)) {
      Serial.printf("[SCHED] NTP OK %02d:%02d day=%d\n", t.tm_hour, t.tm_min, t.tm_wday);
      return;
    }
    delay(500);
  }
  Serial.println("[SCHED] NTP sync failed");
}

// ── Schedule struct ─────────────────────────────────────────────

struct HubSchedule {
  String id, name;
  String target_type;  // "group" | "all"
  String target_id;
  bool   days[7] = {};  // [0]=Sun [1]=Mon ... [6]=Sat
  String date;          // "YYYY-MM-DD" — specific date (overrides days when non-empty)
  String time;          // "HH:MM"
  bool   enabled = true;
  SegState state;
};

static std::vector<HubSchedule> g_schedules;

// ── Persistence ─────────────────────────────────────────────────

inline void saveSchedules() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (auto& s : g_schedules) {
    JsonObject o = arr.add<JsonObject>();
    o["id"]          = s.id;
    o["name"]        = s.name;
    o["target_type"] = s.target_type;
    o["target_id"]   = s.target_id;
    JsonArray days = o["days"].to<JsonArray>();
    for (int i = 0; i < 7; i++) if (s.days[i]) days.add(i);
    if (s.date.length() > 0) o["date"] = s.date;
    o["time"]    = s.time;
    o["enabled"] = s.enabled;
    JsonObject st = o["state"].to<JsonObject>();
    stateToJson(s.state, st);
  }
  File f = LittleFS.open("/schedules.json", "w");
  if (f) { serializeJson(doc, f); f.close(); }
}

inline void loadSchedules() {
  if (!LittleFS.exists("/schedules.json")) return;
  File f = LittleFS.open("/schedules.json", "r");
  JsonDocument doc; deserializeJson(doc, f); f.close();
  g_schedules.clear();
  for (JsonObjectConst o : doc.as<JsonArrayConst>()) {
    HubSchedule s;
    s.id          = o["id"].as<String>();
    s.name        = o["name"].as<String>();
    s.target_type = o["target_type"].as<String>();
    s.target_id   = o["target_id"].as<String>();
    for (JsonVariantConst d : o["days"].as<JsonArrayConst>()) {
      int idx = d.as<int>();
      if (idx >= 0 && idx < 7) s.days[idx] = true;
    }
    s.date    = o["date"].as<String>();
    s.time    = o["time"].as<String>();
    s.enabled = o["enabled"] | true;
    applyState(s.state, o["state"].as<JsonObjectConst>());
    g_schedules.push_back(std::move(s));
  }
  Serial.printf("[SCHED] Loaded %d schedule(s)\n", (int)g_schedules.size());
}

// ── State copy (SegState → SegState) ────────────────────────────

inline void copyState(SegState& dst, const SegState& src) {
  dst.on     = src.on;
  dst.bri    = src.bri;
  dst.fx     = src.fx;
  dst.sx     = src.sx;
  dst.ix     = src.ix;
  dst.col[0] = src.col[0];
  dst.col[1] = src.col[1];
  dst.col[2] = src.col[2];
}

// ── Execution ────────────────────────────────────────────────────

inline void checkSchedules() {
  if (g_schedules.empty()) return;
  struct tm t;
  if (!getLocalTime(&t)) return;

  char now[6];
  snprintf(now, sizeof(now), "%02d:%02d", t.tm_hour, t.tm_min);

  char today[11];
  snprintf(today, sizeof(today), "%04d-%02d-%02d", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);

  int fired = 0;
  taskENTER_CRITICAL(&g_mux);
  for (auto& s : g_schedules) {
    if (!s.enabled)    continue;
    if (s.time != now) continue;
    // Specific date takes priority; fall back to weekday mask
    if (s.date.length() > 0) {
      if (s.date != today) continue;
    } else {
      if (!s.days[t.tm_wday]) continue;
    }

    if (s.target_type == "group") {
      for (auto& g : g_groups) {
        if (g.id == s.target_id) { copyState(g.state, s.state); fired++; break; }
      }
    } else {
      for (auto& g : g_groups) { copyState(g.state, s.state); fired++; }
    }
  }
  taskEXIT_CRITICAL(&g_mux);

  if (fired > 0) {
    Serial.printf("[SCHED] Executed %d schedule(s) at %s\n", fired, now);
    saveConfig();
  }
}
