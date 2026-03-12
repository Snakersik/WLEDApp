#pragma once
#include "config.h"
#include "hub_meta.h"
#include <ESPAsyncWebServer.h>
#include <AsyncJson.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClient.h>

// ── LAN scan state ────────────────────────────────────────────
struct ScanEntry { String name; String ip; };
static std::vector<ScanEntry> g_scanFound;
static volatile bool g_scanRunning = false;
static volatile bool g_scanDone    = false;

static void scanTask(void*) {
  g_scanFound.clear();
  g_scanDone = false;

  // Brief pause so WLED devices finish DHCP negotiation before we query
  delay(3000);

  // 1. Try mDNS first — WLED devices advertise _wled._tcp on the local network.
  //    MDNS.begin() restarts mDNS after the WiFi reconnect that happened in provisionTask.
  Serial.println("[SCAN] mDNS query for _wled._tcp...");
  MDNS.begin(g_hubMeta.mdns_name.c_str());
  int mdnsN = MDNS.queryService("wled", "tcp");
  for (int i = 0; i < mdnsN; i++) {
    String ip   = MDNS.IP(i).toString();
    String name = MDNS.hostname(i);
    if (name.endsWith(".local")) name = name.substring(0, name.length() - 6);
    if (name.isEmpty()) name = ip;
    if (ip == WiFi.localIP().toString()) continue; // skip self
    g_scanFound.push_back({ name, ip });
    Serial.printf("[SCAN] mDNS WLED: %s @ %s\n", name.c_str(), ip.c_str());
  }

  if (!g_scanFound.empty()) {
    Serial.printf("[SCAN] mDNS found %d device(s), skipping IP probe\n", g_scanFound.size());
  } else {
    // 2. Fallback: probe all IPs in subnet (slow but reliable when mDNS fails)
    Serial.println("[SCAN] mDNS found nothing, falling back to IP probe...");

    IPAddress local  = WiFi.localIP();
    IPAddress mask   = WiFi.subnetMask();
    uint8_t b0 = local[0] & mask[0];
    uint8_t b1 = local[1] & mask[1];
    uint8_t b2 = local[2] & mask[2];

    WiFiClient client;
    HTTPClient http;
    for (int i = 1; i <= 254 && g_scanRunning; i++) {
      uint8_t host = local[3] == i ? 0 : i; // skip self
      if (!host) continue;
      String ip  = String(b0)+"."+String(b1)+"."+String(b2)+"."+String(i);
      String url = "http://" + ip + "/json/info";
      http.begin(client, url);
      http.setTimeout(200);
      int code = http.GET();
      if (code == 200) {
        String body = http.getString();
        // WLED responds with {"leds":{...},"ver":"...",...}
        if (body.indexOf("\"leds\"") >= 0) {
          JsonDocument doc;
          String name = ip;
          if (deserializeJson(doc, body) == DeserializationError::Ok) {
            name = doc["name"] | ip.c_str();
          }
          // Skip ourselves (hub)
          if (name != "DDP Hub") {
            g_scanFound.push_back({ name, ip });
            Serial.printf("[SCAN] WLED: %s @ %s\n", name.c_str(), ip.c_str());
          }
        }
      }
      http.end();
      delay(5);
    }
  }

  g_scanDone    = true;
  g_scanRunning = false;
  Serial.printf("[SCAN] done, found %d device(s)\n", g_scanFound.size());
  vTaskDelete(nullptr);
}

// ── WLED AP provisioning state ────────────────────────────────
struct WledApEntry { String ssid; uint8_t bssid[6]; int channel; String bssidStr; };
struct ProvEntry { String ap; String ip; String bssid; };
static std::vector<ProvEntry> g_provConfigured;
static volatile bool g_provRunning = false;
static volatile bool g_provDone    = false;

static void provisionTask(void*) {
  g_provConfigured.clear();
  g_provDone = false;

  // Read wifi.json to get main network credentials to push to WLED devices
  String mainSsid, mainPass;
  File wf = LittleFS.open("/wifi.json", "r");
  if (wf) {
    JsonDocument wd;
    deserializeJson(wd, wf); wf.close();
    mainSsid = wd["ssid"]     | "";
    mainPass = wd["password"] | "";
  }
  if (mainSsid.isEmpty()) {
    Serial.println("[PROV] No wifi.json — aborting");
    g_provDone = true; g_provRunning = false; vTaskDelete(nullptr); return;
  }

  // Scan WiFi for WLED APs — store BSSID+channel to connect to specific device
  int n = WiFi.scanNetworks(false, false);
  std::vector<WledApEntry> wledAps;
  std::vector<String> seenBssids;
  for (int i = 0; i < n; i++) {
    String ssid     = WiFi.SSID(i);
    String bssidStr = WiFi.BSSIDstr(i);
    if ((ssid.startsWith("WLED") || ssid.indexOf("wled") >= 0) && WiFi.RSSI(i) > -80) {
      bool dup = false;
      for (auto& b : seenBssids) { if (b == bssidStr) { dup = true; break; } }
      if (!dup) {
        seenBssids.push_back(bssidStr);
        WledApEntry e;
        e.ssid    = ssid;
        e.channel = WiFi.channel(i);
        e.bssidStr = bssidStr;
        const uint8_t* b = WiFi.BSSID(i);
        memcpy(e.bssid, b, 6);
        wledAps.push_back(e);
        Serial.printf("[PROV] Found AP: %s (%s) ch=%d\n", ssid.c_str(), bssidStr.c_str(), e.channel);
      }
    }
  }
  WiFi.scanDelete();

  WiFiClient client;
  HTTPClient http;

  for (auto& entry : wledAps) {
    if (!g_provRunning) break;
    Serial.printf("[PROV] Connecting to %s (%s) ch=%d\n",
                  entry.ssid.c_str(), entry.bssidStr.c_str(), entry.channel);

    WiFi.disconnect(true); delay(300);
    WiFi.mode(WIFI_STA);
    // Connect by BSSID+channel — targets the specific physical device, not just any SSID match
    WiFi.begin(entry.ssid.c_str(), "wled1234", entry.channel, entry.bssid, true);
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 12000) delay(200);
    if (WiFi.status() != WL_CONNECTED) {
      Serial.printf("[PROV] Could not connect to %s (%s)\n",
                    entry.ssid.c_str(), entry.bssidStr.c_str());
      continue;
    }
    Serial.printf("[PROV] Connected, sending WiFi config\n");
    String gatewayIp = WiFi.gatewayIP().toString();
    Serial.printf("[PROV] Gateway: %s\n", gatewayIp.c_str());

    // POST WiFi credentials to WLED device via its gateway IP
    // URL-encode SSID and password to handle special chars (&, =, space, #, etc.)
    auto urlEncode = [](const String& s) -> String {
      String out; out.reserve(s.length() * 3);
      for (char c : s) {
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
          out += c;
        } else {
          char buf[4]; snprintf(buf, sizeof(buf), "%%%02X", (uint8_t)c);
          out += buf;
        }
      }
      return out;
    };
    // Send both CS/CP (older WLED) and CS0/PW0 (newer WLED multi-network) for compatibility
    String eSsid = urlEncode(mainSsid);
    String ePass = urlEncode(mainPass);
    // Unique mDNS name from last 3 BSSID bytes — e.g. "wled-e61438"
    // This enables _wled._tcp mDNS discovery after device joins network
    char mdnsBuf[16];
    snprintf(mdnsBuf, sizeof(mdnsBuf), "wled-%02x%02x%02x",
             entry.bssid[3], entry.bssid[4], entry.bssid[5]);
    String wledMdns = String(mdnsBuf);
    Serial.printf("[PROV] Setting mDNS: %s\n", wledMdns.c_str());
    // AS=AP SSID, AP=AP password, CM=mDNS name (confirmed WLED form field names)
    String body = "CS=" + eSsid + "&CP=" + ePass + "&CS0=" + eSsid + "&PW0=" + ePass
                + "&AS=WLED-AP&AP=wled1234&CM=" + wledMdns;
    Serial.printf("[PROV] Sending: CS=%s (pass len=%d)\n", mainSsid.c_str(), mainPass.length());
    http.begin(client, "http://" + gatewayIp + "/settings/wifi");
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    http.setTimeout(6000);
    int code = http.POST(body);
    http.end();
    Serial.printf("[PROV] settings/wifi → %d\n", code);
    // NOTE: do NOT send {"rb":true} after this — WLED auto-reboots after /settings/wifi.
    // A second explicit reboot before flash write completes corrupts wled_cfg.json
    // and causes ESP-XXXXXX fallback AP instead of normal WLED-AP / home WiFi join.

    if (code > 0) {
      delay(3000); // wait for WLED to finish serializeConfig() before we disconnect
      g_provConfigured.push_back({ entry.ssid, gatewayIp, entry.bssidStr });
    }
    WiFi.disconnect(true); delay(300);
  }

  // Reconnect hub to main WiFi
  Serial.printf("[PROV] Reconnecting to %s\n", mainSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(g_hubMeta.mdns_name.c_str());
  WiFi.begin(mainSsid.c_str(), mainPass.c_str());
  unsigned long rt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - rt < 20000) delay(200);
  Serial.printf("[PROV] Hub back online: %s\n", WiFi.localIP().toString().c_str());

  // Mark provision done immediately — app can start scanning from phone side
  // WLED is typically already on the network by the time hub reconnects
  g_provDone    = true;
  g_provRunning = false;
  Serial.printf("[PROV] Done, configured %d device(s)\n", g_provConfigured.size());

  // Start LAN scan in background (scanTask tries mDNS first, then IP probe)
  if (!g_scanRunning) {
    g_scanRunning = true;
    xTaskCreate(scanTask, "scan_post_prov", 8192, nullptr, 1, nullptr);
  }
  vTaskDelete(nullptr);
}

static AsyncWebServer _srv(80);

static void addCors(AsyncWebServerResponse* r) {
  r->addHeader("Access-Control-Allow-Origin",  "*");
  r->addHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,PATCH,OPTIONS");
  r->addHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void sendJson(AsyncWebServerRequest* req, const JsonDocument& doc, int code = 200) {
  String body; serializeJson(doc, body);
  auto* r = req->beginResponse(code, "application/json", body);
  addCors(r); req->send(r);
}

static void sendOk(AsyncWebServerRequest* req) {
  auto* r = req->beginResponse(200, "application/json", "{\"ok\":true}");
  addCors(r); req->send(r);
}

static void sendErr(AsyncWebServerRequest* req, const char* msg, int code = 400) {
  JsonDocument d; d["error"] = msg;
  sendJson(req, d, code);
}

static String bodyOf(AsyncWebServerRequest* req, uint8_t* data, size_t len) {
  return String((char*)data, len);
}

// Find group by id (must hold mux or be on same core)
static Group* findGroup(const String& id) {
  for (auto& g : g_groups) if (g.id == id) return &g;
  return nullptr;
}

void setupServer() {
  // OPTIONS preflight
  _srv.on("/*", HTTP_OPTIONS, [](AsyncWebServerRequest* req) {
    auto* r = req->beginResponse(200);
    addCors(r); req->send(r);
  });

  // GET /json/info
  _srv.on("/json/info", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["name"]      = g_hubMeta.name.length() ? g_hubMeta.name : "DDP Hub";
    d["hub_id"]    = g_hubMeta.hub_id;
    d["mdns_name"] = g_hubMeta.mdns_name;
    d["ver"]       = "3.0.0";
    d["ip"]        = WiFi.localIP().toString();
    uint8_t mac[6]; WiFi.macAddress(mac);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    d["mac"] = macStr;
    d["leds"]["count"] = NUM_LEDS;
    d["live"] = true;
    taskENTER_CRITICAL(&g_mux);
    d["groups"] = g_groups.size();
    taskEXIT_CRITICAL(&g_mux);
    sendJson(req, d);
  });

  // GET /json/state — returns state of first group (WLED compat)
  _srv.on("/json/state", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    taskENTER_CRITICAL(&g_mux);
    SegState s = g_groups.empty()
      ? SegState{}
      : g_groups[0].state;
    taskEXIT_CRITICAL(&g_mux);
    d["on"]  = s.on;  d["bri"] = s.bri;
    d["fx"]  = s.fx;  d["sx"]  = s.sx;  d["ix"] = s.ix;
    JsonArray col = d["col"].to<JsonArray>();
    JsonArray c0  = col.add<JsonArray>();
    c0.add(s.col[0]); c0.add(s.col[1]); c0.add(s.col[2]);
    sendJson(req, d);
  });

  // POST /json/state — apply to all groups
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/json/state",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      taskENTER_CRITICAL(&g_mux);
      for (auto& g : g_groups) applyState(g.state, jv.as<JsonObjectConst>());
      taskEXIT_CRITICAL(&g_mux);
      saveConfig();
      sendOk(req);
    }
  ));

  // GET /devices
  _srv.on("/devices", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d; JsonArray arr = d.to<JsonArray>();
    taskENTER_CRITICAL(&g_mux);
    for (auto& ds : g_devices) {
      JsonDocument tmp;
      if (!deserializeJson(tmp, ds)) arr.add(tmp.as<JsonObjectConst>());
    }
    taskEXIT_CRITICAL(&g_mux);
    sendJson(req, d);
  });

  // POST /devices
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/devices",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      if (!jv["ip"].is<const char*>()) { sendErr(req, "missing ip"); return; }
      JsonDocument dev;
      taskENTER_CRITICAL(&g_mux);
      uint32_t newId = 1;
      for (auto& ds : g_devices) {
        JsonDocument tmp; deserializeJson(tmp, ds);
        uint32_t n = String(tmp["id"].as<const char*>()).toInt();
        if (n >= newId) newId = n + 1;
      }
      dev["id"]   = String(newId);
      dev["ip"]   = jv["ip"].as<String>();
      dev["name"] = jv["name"].is<const char*>() ? jv["name"].as<String>() : jv["ip"].as<String>();
      String ds; serializeJson(dev, ds);
      g_devices.push_back(ds);
      taskEXIT_CRITICAL(&g_mux);
      saveConfig();
      sendJson(req, dev);
    }
  ));

  // GET /groups
  _srv.on("/groups", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d; JsonArray arr = d.to<JsonArray>();
    taskENTER_CRITICAL(&g_mux);
    for (auto& g : g_groups) {
      JsonObject obj = arr.add<JsonObject>();
      obj["id"] = g.id; obj["name"] = g.name;
      JsonArray devs = obj["devices"].to<JsonArray>();
      for (auto& ip : g.devices) devs.add(ip);
      JsonObject st = obj["state"].to<JsonObject>();
      stateToJson(g.state, st);
    }
    taskEXIT_CRITICAL(&g_mux);
    sendJson(req, d);
  });

  // POST /groups/{id}/state — registered BEFORE POST /groups so wildcard wins
  // (AsyncCallbackJsonWebHandler uses startsWith, so "/groups" would match "/groups/*/state")
  static String _grpStateBody;
  _srv.on("/groups/*", HTTP_POST,
    [](AsyncWebServerRequest* req) {
      String path = req->url();
      int sl = path.lastIndexOf('/');
      if (path.substring(sl + 1) != "state") { sendErr(req, "not found", 404); return; }
      String gid = path.substring(8, sl);
      JsonDocument jv;
      if (deserializeJson(jv, _grpStateBody)) { sendErr(req, "invalid json"); return; }
      taskENTER_CRITICAL(&g_mux);
      Group* g = findGroup(gid);
      if (!g) { taskEXIT_CRITICAL(&g_mux); sendErr(req, "not found", 404); return; }
      applyState(g->state, jv.as<JsonObjectConst>());
      taskEXIT_CRITICAL(&g_mux);
      saveConfig(); sendOk(req);
    },
    nullptr,
    [](AsyncWebServerRequest*, uint8_t* data, size_t len, size_t index, size_t) {
      if (index == 0) _grpStateBody = "";
      _grpStateBody.concat((char*)data, len);
    }
  );

  // PATCH /groups/{id} — update name/devices
  static String _grpPatchBody;
  _srv.on("/groups/*", HTTP_PATCH,
    [](AsyncWebServerRequest* req) {
      String path = req->url();
      String gid  = path.substring(8);
      if (gid.indexOf('/') != -1) { sendErr(req, "not found", 404); return; }
      JsonDocument jv;
      if (deserializeJson(jv, _grpPatchBody)) { sendErr(req, "invalid json"); return; }
      JsonDocument resp;
      taskENTER_CRITICAL(&g_mux);
      Group* g = findGroup(gid);
      if (!g) { taskEXIT_CRITICAL(&g_mux); sendErr(req, "not found", 404); return; }
      if (jv["name"].is<const char*>()) g->name = jv["name"].as<String>();
      if (jv["devices"].is<JsonArrayConst>()) {
        g->devices.clear();
        for (auto d : jv["devices"].as<JsonArrayConst>()) g->devices.push_back(d.as<String>());
      }
      resp["id"] = g->id; resp["name"] = g->name;
      taskEXIT_CRITICAL(&g_mux);
      saveConfig(); sendJson(req, resp);
    },
    nullptr,
    [](AsyncWebServerRequest*, uint8_t* data, size_t len, size_t index, size_t) {
      if (index == 0) _grpPatchBody = "";
      _grpPatchBody.concat((char*)data, len);
    }
  );

  // POST /groups — create or upsert (registered AFTER wildcard handlers)
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/groups",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      if (!jv["name"].is<const char*>()) { sendErr(req, "missing name"); return; }
      JsonDocument resp;
      taskENTER_CRITICAL(&g_mux);
      String explicitId = jv["id"].is<const char*>() ? jv["id"].as<String>() : "";
      if (explicitId.length()) {
        Group* existing = findGroup(explicitId);
        if (existing) {
          existing->name = jv["name"].as<String>();
          if (jv["devices"].is<JsonArrayConst>()) {
            existing->devices.clear();
            for (auto d : jv["devices"].as<JsonArrayConst>()) existing->devices.push_back(d.as<String>());
          }
          resp["id"] = existing->id; resp["name"] = existing->name;
          taskEXIT_CRITICAL(&g_mux);
          saveConfig(); sendJson(req, resp); return;
        }
      }
      Group g;
      g.id   = explicitId.length() ? explicitId : String(nextId(g_groups));
      g.name = jv["name"].as<String>();
      if (jv["devices"].is<JsonArrayConst>())
        for (auto d : jv["devices"].as<JsonArrayConst>()) g.devices.push_back(d.as<String>());
      resp["id"] = g.id; resp["name"] = g.name;
      g_groups.push_back(std::move(g));
      taskEXIT_CRITICAL(&g_mux);
      saveConfig(); sendJson(req, resp);
    }
  ));

  // GET /groups/{id}/state
  _srv.on("/groups/*", HTTP_GET, [](AsyncWebServerRequest* req) {
    String path = req->url();
    // /groups/{id}/state
    int sl = path.lastIndexOf('/');
    String sub = path.substring(sl + 1);
    String gid;
    if (sub == "state") {
      gid = path.substring(8, sl); // strip /groups/ and /state
    } else {
      // /groups/{id} GET — not separately implemented, reuse groups list
      sendErr(req, "use GET /groups"); return;
    }
    JsonDocument d;
    taskENTER_CRITICAL(&g_mux);
    Group* g = findGroup(gid);
    if (!g) { taskEXIT_CRITICAL(&g_mux); sendErr(req, "not found", 404); return; }
    stateToJson(g->state, d.to<JsonObject>());
    taskEXIT_CRITICAL(&g_mux);
    sendJson(req, d);
  });

  // DELETE /groups/{id}
  _srv.on("/groups/*", HTTP_DELETE, [](AsyncWebServerRequest* req) {
    String path = req->url();
    String gid  = path.substring(8);
    taskENTER_CRITICAL(&g_mux);
    for (size_t i = 0; i < g_groups.size(); i++) {
      if (g_groups[i].id == gid) { g_groups.erase(g_groups.begin() + i); break; }
    }
    taskEXIT_CRITICAL(&g_mux);
    saveConfig(); sendOk(req);
  });

  // DELETE /devices/{id}
  _srv.on("/devices/*", HTTP_DELETE, [](AsyncWebServerRequest* req) {
    String path = req->url();
    String did  = path.substring(9);
    taskENTER_CRITICAL(&g_mux);
    for (size_t i = 0; i < g_devices.size(); i++) {
      JsonDocument tmp; deserializeJson(tmp, g_devices[i]);
      if (tmp["id"].as<String>() == did) { g_devices.erase(g_devices.begin() + i); break; }
    }
    taskEXIT_CRITICAL(&g_mux);
    saveConfig(); sendOk(req);
  });

  // POST /tz — set timezone offset (seconds east of UTC) and re-sync NTP
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/tz",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      long tz = jv["tz_offset"] | 3600L;
      JsonDocument d; d["tz_offset"] = tz;
      File f = LittleFS.open("/tz.json", "w");
      if (f) { serializeJson(d, f); f.close(); }
      _tzOffset = tz;
      configTime(_tzOffset, 0, "pool.ntp.org", "time.google.com");
      Serial.printf("[SCHED] tz_offset updated: %ld\n", _tzOffset);
      sendOk(req);
    }
  ));

  // GET /schedules
  _srv.on("/schedules", HTTP_GET, [](AsyncWebServerRequest* req) {
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
      o["time"]    = s.time;
      o["enabled"] = s.enabled;
      JsonObject st = o["state"].to<JsonObject>();
      stateToJson(s.state, st);
    }
    sendJson(req, doc);
  });

  // POST /schedules — create
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/schedules",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      if (!jv["name"].is<const char*>() || !jv["time"].is<const char*>()) {
        sendErr(req, "missing name/time"); return;
      }
      HubSchedule s;
      // Auto-generate ID
      uint32_t newId = 1;
      for (auto& x : g_schedules) {
        uint32_t n = x.id.toInt();
        if (n >= newId) newId = n + 1;
      }
      s.id          = String(newId);
      s.name        = jv["name"].as<String>();
      s.target_type = jv["target_type"].is<const char*>() ? jv["target_type"].as<String>() : "all";
      s.target_id   = jv["target_id"].is<const char*>()   ? jv["target_id"].as<String>()   : "";
      for (JsonVariantConst d : jv["days"].as<JsonArrayConst>()) {
        int idx = d.as<int>(); if (idx >= 0 && idx < 7) s.days[idx] = true;
      }
      s.time    = jv["time"].as<String>();
      s.enabled = jv["enabled"] | true;
      if (jv["state"].is<JsonObjectConst>()) applyState(s.state, jv["state"].as<JsonObjectConst>());
      JsonDocument resp;
      resp["id"] = s.id; resp["name"] = s.name;
      g_schedules.push_back(std::move(s));
      saveSchedules();
      sendJson(req, resp);
    }
  ));

  // PATCH /schedules/* — update or toggle
  static String _schPatchBody;
  _srv.on("/schedules/*", HTTP_PATCH,
    [](AsyncWebServerRequest* req) {
      String path = req->url();
      // /schedules/{id}/toggle  OR  /schedules/{id}
      int sl = path.lastIndexOf('/');
      String last = path.substring(sl + 1);
      String sid;
      bool isToggle = false;
      if (last == "toggle") {
        sid = path.substring(11, sl);  // strip /schedules/ and /toggle
        isToggle = true;
      } else {
        sid = path.substring(11);
      }
      JsonDocument jv;
      if (!isToggle && deserializeJson(jv, _schPatchBody)) { sendErr(req, "invalid json"); return; }

      for (auto& s : g_schedules) {
        if (s.id != sid) continue;
        if (isToggle) {
          s.enabled = !s.enabled;
        } else {
          if (jv["name"].is<const char*>())        s.name        = jv["name"].as<String>();
          if (jv["target_type"].is<const char*>()) s.target_type = jv["target_type"].as<String>();
          if (jv["target_id"].is<const char*>())   s.target_id   = jv["target_id"].as<String>();
          if (jv["time"].is<const char*>())         s.time        = jv["time"].as<String>();
          if (jv["enabled"].is<bool>())             s.enabled     = jv["enabled"].as<bool>();
          if (jv["days"].is<JsonArrayConst>()) {
            for (int i = 0; i < 7; i++) s.days[i] = false;
            for (JsonVariantConst d : jv["days"].as<JsonArrayConst>()) {
              int idx = d.as<int>(); if (idx >= 0 && idx < 7) s.days[idx] = true;
            }
          }
          if (jv["state"].is<JsonObjectConst>()) applyState(s.state, jv["state"].as<JsonObjectConst>());
        }
        JsonDocument resp;
        resp["id"] = s.id; resp["enabled"] = s.enabled;
        saveSchedules();
        sendJson(req, resp);
        return;
      }
      sendErr(req, "not found", 404);
    },
    nullptr,
    [](AsyncWebServerRequest*, uint8_t* data, size_t len, size_t index, size_t) {
      if (index == 0) _schPatchBody = "";
      _schPatchBody.concat((char*)data, len);
    }
  );

  // DELETE /schedules/{id}
  _srv.on("/schedules/*", HTTP_DELETE, [](AsyncWebServerRequest* req) {
    String sid = req->url().substring(11);
    for (size_t i = 0; i < g_schedules.size(); i++) {
      if (g_schedules[i].id == sid) {
        g_schedules.erase(g_schedules.begin() + i);
        saveSchedules();
        sendOk(req);
        return;
      }
    }
    sendErr(req, "not found", 404);
  });

  // GET /api/scan-wled — WiFi scan for WLED AP SSIDs.
  // Use async scan + esp_task_wdt_reset() to avoid blocking async_tcp WDT
  // AND avoid use-after-free (xTaskCreate + req->send() crashes if client disconnects
  // before the task finishes — ESPAsyncWebServer frees req on disconnect).
  _srv.on("/api/scan-wled", HTTP_GET, [](AsyncWebServerRequest* req) {
    WiFi.scanNetworks(true); // start async scan, returns immediately
    while (WiFi.scanComplete() == WIFI_SCAN_RUNNING) {
      vTaskDelay(pdMS_TO_TICKS(100));   // yield — resets WDT via idle task
    }
    int n = WiFi.scanComplete();
    JsonDocument doc;
    JsonArray aps = doc["aps"].to<JsonArray>();
    std::vector<String> seen;
    for (int i = 0; i < n; i++) {
      String s = WiFi.SSID(i);
      String b = WiFi.BSSIDstr(i);
      if (s.startsWith("WLED") || s.indexOf("wled") >= 0) {
        bool dup = false;
        for (auto& x : seen) { if (x == b) { dup = true; break; } }
        if (!dup) {
          seen.push_back(b);
          JsonObject o = aps.add<JsonObject>();
          o["ssid"]    = s;
          o["bssid"]   = b;
          o["channel"] = WiFi.channel(i);
        }
      }
    }
    WiFi.scanDelete();
    sendJson(req, doc);
  });

  // POST /api/provision-wled — start async provisioning of all found WLED APs
  _srv.on("/api/provision-wled", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (g_provRunning) { sendOk(req); return; }
    g_provRunning = true;
    xTaskCreate(provisionTask, "prov_wled", 8192, nullptr, 1, nullptr);
    sendOk(req);
  });

  // GET /api/provision-status — poll provisioning progress
  _srv.on("/api/provision-status", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["running"] = (bool)g_provRunning;
    doc["done"]    = (bool)g_provDone;
    doc["error"]   = nullptr;
    JsonArray arr  = doc["configured"].to<JsonArray>();
    for (auto& e : g_provConfigured) {
      JsonObject o = arr.add<JsonObject>();
      o["ap"] = e.ap; o["ip"] = e.ip; o["mac"] = e.bssid;
    }
    sendJson(req, doc);
  });

  // POST /api/scan-devices — trigger async LAN scan for WLED devices
  _srv.on("/api/scan-devices", HTTP_POST, [](AsyncWebServerRequest* req) {
    if (g_scanRunning) { sendOk(req); return; } // already running
    g_scanRunning = true;
    xTaskCreate(scanTask, "scan_wled", 8192, nullptr, 1, nullptr);
    sendOk(req);
  });

  // GET /api/scan-status — poll results
  _srv.on("/api/scan-status", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["running"] = (bool)g_scanRunning;
    doc["done"]    = (bool)g_scanDone;
    JsonArray arr  = doc["found"].to<JsonArray>();
    for (auto& e : g_scanFound) {
      JsonObject o = arr.add<JsonObject>();
      o["name"] = e.name;
      o["ip"]   = e.ip;
    }
    sendJson(req, doc);
  });

  // POST /restart — reboot the hub
  _srv.on("/restart", HTTP_POST, [](AsyncWebServerRequest* req) {
    sendOk(req);
    delay(200); ESP.restart();
  });

  // DELETE /wifi — remove wifi.json and reboot into AP mode
  _srv.on("/wifi", HTTP_DELETE, [](AsyncWebServerRequest* req) {
    LittleFS.remove("/wifi.json");
    sendOk(req);
    delay(500); ESP.restart();
  });

  // POST /wifi — change WiFi credentials and reboot
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/wifi",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      if (!jv["ssid"].is<const char*>() || !jv["password"].is<const char*>()) {
        sendErr(req, "missing ssid/password"); return;
      }
      File f = LittleFS.open("/wifi.json", "w");
      if (f) { serializeJson(jv, f); f.close(); }
      sendOk(req);
      delay(500); ESP.restart();
    }
  ));

  // POST /api/identify — blink a specific device red for 4s so user can identify it
  _srv.addHandler(new AsyncCallbackJsonWebHandler("/api/identify",
    [](AsyncWebServerRequest* req, JsonVariant& jv) {
      if (!jv["ip"].is<const char*>()) { sendErr(req, "missing ip"); return; }
      extern String   g_identifyIp;
      extern uint32_t g_identifyUntil;
      g_identifyIp    = jv["ip"].as<String>();
      g_identifyUntil = millis() + 4000;
      sendOk(req);
    }
  ));

  // GET /debug — real-time system diagnostics (heap, WiFi, uptime)
  _srv.on("/debug", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument d;
    d["free_heap"]     = (uint32_t)ESP.getFreeHeap();
    d["min_free_heap"] = (uint32_t)ESP.getMinFreeHeap();
    d["rssi"]          = (int8_t)WiFi.RSSI();
    d["uptime_s"]      = (uint32_t)(millis() / 1000);
    d["cpu_mhz"]       = (uint32_t)ESP.getCpuFreqMHz();
    taskENTER_CRITICAL(&g_mux);
    d["groups"]        = (uint32_t)g_groups.size();
    uint32_t devTotal  = 0;
    for (auto& g : g_groups) devTotal += g.devices.size();
    taskEXIT_CRITICAL(&g_mux);
    d["devices_total"] = devTotal;
    extern uint32_t g_frameCount;
    d["frames_sent"]   = g_frameCount;
    d["expected_fps"]  = (uint32_t)FPS;
    sendJson(req, d);
  });

  _srv.begin();
  Serial.println("HTTP server started on :80");
}
