// src/features/deviceControl/hooks/useWledSync.ts
import { useState } from "react";
import { WLEDState } from "../types";
import { clamp255, rgbToHex } from "../utils/color";

export function useWledSync() {
  const [syncing, setSyncing] = useState(false);

  const syncFromDevice = async (ip: string) => {
    setSyncing(true);
    try {
      const res = await fetch(`http://${ip}/json/state`, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const state = (await res.json()) as WLEDState;

      const next: {
        isOn?: boolean;
        brightness?: number;
        baseRgb?: [number, number, number];
        baseHex?: string;
      } = {};

      if (typeof state.on === "boolean") next.isOn = state.on;
      if (typeof state.bri === "number") next.brightness = state.bri;

      const col = state?.seg?.[0]?.col?.[0];
      if (Array.isArray(col) && col.length >= 3) {
        const rgb: [number, number, number] = [
          clamp255(col[0]),
          clamp255(col[1]),
          clamp255(col[2]),
        ];
        next.baseRgb = rgb;
        next.baseHex = rgbToHex(rgb);
      }

      return { ok: true as const, next };
    } catch {
      return { ok: false as const, error: "Sync failed" };
    } finally {
      setSyncing(false);
    }
  };

  return { syncing, syncFromDevice };
}
