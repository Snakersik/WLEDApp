// src/components/UShapeLiveBorder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";

type RGB = [number, number, number];

interface Props {
  hubIp: string;      // hub IP — polls /groups/{groupId}/avgcolor
  groupId: string;    // hub group ID (device or group id)
  deviceIp?: string;  // fallback: poll device /json/state when hub doesn't support avgcolor

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
  hubIp,
  groupId,
  deviceIp,
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
  // false = try hub avgcolor first, true = hub doesn't support it, use device fallback
  const useFallbackRef = useRef(false);

  const hubUrl = useMemo(() => {
    const ip = (hubIp || "").trim().replace(/^https?:\/\//, "");
    const gid = (groupId || "").trim();
    if (!ip || !gid) return "";
    return `http://${ip}/groups/${gid}/avgcolor`;
  }, [hubIp, groupId]);

  const deviceUrl = useMemo(() => {
    const ip = (deviceIp || "").trim().replace(/^https?:\/\//, "");
    if (!ip) return "";
    return `http://${ip}/json/state`;
  }, [deviceIp]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    useFallbackRef.current = false; // reset on url change

    async function tick() {
      if (stopped) return;
      if (inFlightRef.current) {
        timerRef.current = setTimeout(tick, clamp(pollMs, 100, 2000));
        return;
      }

      const url = !useFallbackRef.current ? hubUrl : deviceUrl;
      if (!url) {
        timerRef.current = setTimeout(tick, 500);
        return;
      }

      inFlightRef.current = true;
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });

        if (!res.ok) {
          // Hub doesn't support avgcolor — switch to device fallback
          if (!useFallbackRef.current) {
            useFallbackRef.current = true;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        let raw: RGB;
        if (useFallbackRef.current) {
          // Device /json/state format: { on, bri, seg:[{col:[[r,g,b]]}] }
          const isOn: boolean = json?.on ?? true;
          const bri: number = clamp(Number(json?.bri ?? 255), 0, 255);
          const col0 = json?.seg?.[0]?.col?.[0];
          const base: RGB = Array.isArray(col0) && col0.length >= 3
            ? [Number(col0[0]), Number(col0[1]), Number(col0[2])]
            : [255, 255, 255];
          const scale = isOn ? bri / 255 : 0;
          raw = [base[0] * scale, base[1] * scale, base[2] * scale];
        } else {
          // Hub avgcolor format: { r, g, b }
          raw = [Number(json?.r ?? 0), Number(json?.g ?? 0), Number(json?.b ?? 0)];
        }

        if (!mountedRef.current) return;
        const smooth = smoothAdaptive(prevColor.current, raw, smoothing);
        prevColor.current = smooth;
        setColor(smooth);
      } catch {
        // silently ignore — device/hub temporarily unreachable
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
  }, [hubUrl, deviceUrl, pollMs, smoothing]);

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
