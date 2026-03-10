// src/components/UShapeLiveBorder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";

type RGB = [number, number, number];

interface Props {
  ip: string; // WLED device IP — polls /json/state directly

  leftCount?: number;  // kept for API compat, unused (no per-LED data from /json/state)
  topCount?: number;
  rightCount?: number;

  pollMs?: number;
  thickness?: number;
  smoothing?: number; // 0..1 — higher = faster color tracking
  topOffset?: number; // header height — border starts below it
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const rgbCss = (rgb: RGB) =>
  `rgb(${clamp255(rgb[0])},${clamp255(rgb[1])},${clamp255(rgb[2])})`;

function smoothAdaptive(prev: RGB, next: RGB, k: number): RGB {
  const delta =
    Math.abs(next[0] - prev[0]) +
    Math.abs(next[1] - prev[1]) +
    Math.abs(next[2] - prev[2]);
  if (delta > 120) return next;
  const kk = Math.max(0, Math.min(1, k));
  return [
    prev[0] + (next[0] - prev[0]) * kk,
    prev[1] + (next[1] - prev[1]) * kk,
    prev[2] + (next[2] - prev[2]) * kk,
  ];
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export const UShapeLiveBorder: React.FC<Props> = ({
  ip,
  pollMs = 150,
  thickness = 5,
  smoothing = 0.65,
  topOffset = 80,
}) => {
  const [color, setColor] = useState<RGB>([0, 0, 0]);
  const prevColor = useRef<RGB>([0, 0, 0]);
  const inFlightRef = useRef(false);
  const timerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const cleanIp = useMemo(
    () => (ip || "").trim().replace(/^https?:\/\//, ""),
    [ip],
  );

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
      if (inFlightRef.current) {
        timerRef.current = setTimeout(tick, clamp(pollMs, 100, 2000));
        return;
      }

      inFlightRef.current = true;
      try {
        const res = await fetch(`http://${cleanIp}/json/state`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const isOn: boolean = json?.on ?? true;
        const bri: number = clamp(Number(json?.bri ?? 255), 0, 255);
        const col0 = json?.seg?.[0]?.col?.[0];
        const raw: RGB =
          Array.isArray(col0) && col0.length >= 3
            ? [Number(col0[0]), Number(col0[1]), Number(col0[2])]
            : [255, 255, 255];

        // Scale by brightness and apply on/off
        const scale = isOn ? bri / 255 : 0;
        const scaled: RGB = [raw[0] * scale, raw[1] * scale, raw[2] * scale];

        if (!mountedRef.current) return;
        const smooth = smoothAdaptive(prevColor.current, scaled, smoothing);
        prevColor.current = smooth;
        setColor(smooth);
      } catch {
        // silently ignore — device may be temporarily unreachable
      } finally {
        inFlightRef.current = false;
        if (!stopped) {
          timerRef.current = setTimeout(tick, clamp(pollMs, 100, 2000));
        }
      }
    }

    tick();
    return () => {
      stopped = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cleanIp, pollMs, smoothing]);

  const { height } = Dimensions.get("window");
  const css = useMemo(() => rgbCss(color), [color]);
  const borderHeight = Math.max(0, height - topOffset);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* LEFT */}
      <View
        style={[
          styles.strip,
          { left: 0, top: topOffset, width: thickness, height: borderHeight, backgroundColor: css },
        ]}
      />
      {/* RIGHT */}
      <View
        style={[
          styles.strip,
          { right: 0, top: topOffset, width: thickness, height: borderHeight, backgroundColor: css },
        ]}
      />
      {/* TOP */}
      <View
        style={[
          styles.strip,
          { left: 0, right: 0, top: topOffset, height: thickness, backgroundColor: css },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    position: "absolute",
  },
});
