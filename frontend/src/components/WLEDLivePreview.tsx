// src/components/WLEDLivePreview.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { LEDPreview } from "./LEDPreview";

type WledState = {
  on?: boolean;
  bri?: number;
  seg?: Array<{
    id?: number;
    on?: boolean;
    bri?: number;
    col?: number[][]; // [[r,g,b], ...]
    fx?: number;
    sx?: number;
    ix?: number;
    pal?: number;
  }>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function rgbToHex(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map((x) => clamp(Math.round(x), 0, 255));
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function parseTopColor(state: WledState): {
  isOn: boolean;
  brightness: number;
  hex: string;
  rgb: [number, number, number];
  meta: string;
} {
  const seg0 =
    Array.isArray(state.seg) && state.seg.length > 0 ? state.seg[0] : undefined;

  const isOn = Boolean(seg0?.on ?? state.on ?? true);

  const bri = clamp(Number(seg0?.bri ?? state.bri ?? 0), 0, 255);

  const col0 = seg0?.col?.[0];
  const rgb: [number, number, number] =
    Array.isArray(col0) && col0.length >= 3
      ? [Number(col0[0]), Number(col0[1]), Number(col0[2])]
      : [255, 255, 255];

  const hex = rgbToHex(rgb);
  const meta = `on=${isOn ? "1" : "0"} bri=${bri} fx=${seg0?.fx ?? "-"} pal=${
    seg0?.pal ?? "-"
  }`;
  return { isOn, brightness: bri, hex, rgb, meta };
}

export function WLEDLivePreview({
  ip,
  ledCount = 120,
  height = 160,
  label,
  layoutType = "u-shape",
  topLeds = 9,
  sideLeds = 55,
  pollMs = 1000,
  paused = false,
}: {
  ip: string;
  ledCount?: number;
  height?: number;
  label?: string;
  layoutType?: "polyline" | "u-shape";
  topLeds?: number;
  sideLeds?: number;
  pollMs?: number;
  paused?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [isOn, setIsOn] = useState(true);
  const [brightness, setBrightness] = useState(0);
  const [colorHex, setColorHex] = useState("#ffffff");
  const [meta, setMeta] = useState("");

  const cleanIp = useMemo(
    () => (ip || "").trim().replace(/^https?:\/\//, ""),
    [ip],
  );

  const inFlightRef = useRef(false);
  const timerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let stopped = false;

    async function tick() {
      if (stopped) return;
      if (!cleanIp) {
        timerRef.current = setTimeout(tick, 500);
        return;
      }

      // Pauza polling np. podczas sterowania/syncu
      if (paused) {
        timerRef.current = setTimeout(tick, 300);
        return;
      }

      // Jeśli poprzedni request jeszcze leci – skip (to usuwa "thrash")
      if (inFlightRef.current) {
        timerRef.current = setTimeout(tick, clamp(pollMs, 250, 2500));
        return;
      }

      inFlightRef.current = true;

      try {
        const res = await fetch(`http://${cleanIp}/json/state`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as WledState;
        const p = parseTopColor(json);

        if (!mountedRef.current) return;
        setIsOn(p.isOn);
        setBrightness(p.brightness);
        setColorHex(p.hex);
        setMeta(p.meta);
        setErr(null);
        setLoading(false);
      } catch (e: any) {
        if (!mountedRef.current) return;
        setErr(e?.message ? String(e.message) : "Failed to read /json/state");
        setLoading(false);
      } finally {
        inFlightRef.current = false;
        if (stopped) return;
        timerRef.current = setTimeout(tick, clamp(pollMs, 250, 2500));
      }
    }

    setLoading(true);
    setErr(null);
    tick();

    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cleanIp, pollMs, paused]);

  return (
    <View style={[styles.card, { height }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.hint}>Loading preview…</Text>
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.errTitle}>Preview error</Text>
          <Text style={styles.errText} selectable>
            {err}
          </Text>
          <Text style={styles.errText} selectable>
            http://{cleanIp}/json/state
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <LEDPreview
            width={320}
            height={110}
            ledCount={ledCount}
            colorHex={colorHex}
            brightness={brightness}
            isOn={isOn}
            label={label}
            layoutType={layoutType}
            topLeds={topLeds}
            sideLeds={sideLeds}
          />
          <Text style={styles.meta} numberOfLines={1}>
            {meta} {paused ? " • paused" : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
    padding: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  hint: { color: "#94a3b8", fontSize: 12 },
  errTitle: { color: "#fca5a5", fontWeight: "700", fontSize: 14 },
  errText: { color: "#e2e8f0", fontSize: 12, textAlign: "center" },
  meta: { color: "#94a3b8", fontSize: 12, textAlign: "center" },
});
