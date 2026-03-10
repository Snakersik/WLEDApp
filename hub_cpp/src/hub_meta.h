#pragma once
#include <Arduino.h>

struct HubMeta {
  String hub_id;    // e.g. "hub_8c4fa51234ab"
  String name;      // "DDP Hub"
  String mdns_name; // e.g. "ddp-hub-1234ab"
};

extern HubMeta g_hubMeta;
