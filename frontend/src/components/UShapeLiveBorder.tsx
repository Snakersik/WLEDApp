// src/components/UShapeLiveBorder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";

type RGB = [number, number, number];

interface Props {
  hubIp: string;    // hub IP — polls /groups/{groupId}/avgcolor
  groupId: string;  // hub group ID (device or group id)

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

  const url = useMemo(() => {
    const ip = (hubIp || "").trim().replace(/^https?:\/\//, "");
    const gid = (groupId || "").trim();
    if (!ip || !gid) return "";
    return `http://${ip}/groups/${gid}/avgcolor`;
  }, [hubIp, groupId]);

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
      if (!url) {
        timerRef.current = setTimeout(tick, 500);
        return;
      }
      if (inFlightRef.current) {
        timerRef.current = setTimeout(tick, clamp(pollMs, 100, 2000));
        return;
      }

      inFlightRef.current = true;
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const raw: RGB = [
          Number(json?.r ?? 0),
          Number(json?.g ?? 0),
          Number(json?.b ?? 0),
        ];

        if (!mountedRef.current) return;
        const smooth = smoothAdaptive(prevColor.current, raw, smoothing);
        prevColor.current = smooth;
        setColor(smooth);
      } catch {
        // silently ignore — hub may be temporarily unreachable
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
  }, [url, pollMs, smoothing]);

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
