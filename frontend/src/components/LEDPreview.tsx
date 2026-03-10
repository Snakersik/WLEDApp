// src/components/LEDPreview.tsx
import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Równomierne “rozsiewanie” punktów (LED) po łamanej
function samplePolyline(points: Pt[], n: number): Pt[] {
  if (points.length < 2 || n <= 0) return [];
  if (n === 1) return [points[0]];

  const segLens = points.slice(0, -1).map((p, i) => dist(p, points[i + 1]));
  const total = segLens.reduce((s, v) => s + v, 0) || 1;

  const targets = Array.from({ length: n }, (_, i) => (i / (n - 1)) * total);

  const out: Pt[] = [];
  let segIdx = 0;
  let segAccum = 0;
  let segLen = segLens[0] || 1;
  let a = points[0];
  let b = points[1];

  for (const tDist of targets) {
    while (segIdx < segLens.length - 1 && segAccum + segLen < tDist) {
      segAccum += segLen;
      segIdx++;
      a = points[segIdx];
      b = points[segIdx + 1];
      segLen = segLens[segIdx] || 1;
    }
    const local = (tDist - segAccum) / segLen;
    out.push(lerp(a, b, Math.max(0, Math.min(1, local))));
  }
  return out;
}

// U-shape layout
function generateUShapeLayoutTotal(totalLeds: number, topRatio = 0.18): Pt[] {
  const leds: Pt[] = [];

  const padding = 20;
  const width = 280;
  const height = 120;

  const n = Math.max(1, Math.floor(totalLeds || 1));

  let topLeds = Math.round(n * topRatio);
  topLeds = Math.max(3, Math.min(topLeds, n));

  let remaining = n - topLeds;
  let sideLeds = Math.floor(remaining / 2);

  if (sideLeds < 1) {
    topLeds = n;
    sideLeds = 0;
    remaining = 0;
  }

  const leftover = n - topLeds - sideLeds * 2;
  topLeds += leftover;

  // TOP
  for (let i = 0; i < topLeds; i++) {
    const t = topLeds > 1 ? i / (topLeds - 1) : 0;
    leds.push({ x: padding + t * width, y: padding });
  }

  // LEFT
  for (let i = 1; i <= sideLeds; i++) {
    const t = sideLeds > 1 ? i / sideLeds : 1;
    leds.push({ x: padding, y: padding + t * height });
  }

  // RIGHT
  for (let i = 1; i <= sideLeds; i++) {
    const t = sideLeds > 1 ? i / sideLeds : 1;
    leds.push({ x: padding + width, y: padding + t * height });
  }

  if (leds.length > n) return leds.slice(0, n);
  while (leds.length < n) leds.push(leds[leds.length - 1]);

  return leds;
}

export function LEDPreview({
  width = 320,
  height = 140,
  points,
  ledCount,
  colorHex,
  brightness,
  isOn,
  label,
  layoutType = "polyline",
  topLeds = 9,
  sideLeds = 55,
}: {
  width?: number;
  height?: number;
  points?: Pt[];
  ledCount: number;
  colorHex: string;
  brightness: number;
  isOn: boolean;
  label?: string;
  layoutType?: "polyline" | "u-shape";
  topLeds?: number;
  sideLeds?: number;
}) {
  const { leds, rendered } = useMemo(() => {
    if (layoutType === "u-shape") {
      const total = Math.max(1, ledCount || 1);
      const generated = generateUShapeLayoutTotal(total, 0.18);
      return { leds: generated, rendered: generated.length };
    } else {
      const finalPoints = points || [];
      const renderedCount = Math.max(2, Math.min(ledCount || 2, 240));
      return {
        leds: samplePolyline(finalPoints, renderedCount),
        rendered: renderedCount,
      };
    }
  }, [layoutType, topLeds, sideLeds, ledCount, points]);

  const poly = useMemo(() => {
    if (layoutType === "polyline" && points) {
      return points.map((p) => `${p.x},${p.y}`).join(" ");
    }
    return "";
  }, [layoutType, points]);

  const opacity = isOn ? Math.max(0.05, Math.min(1, brightness / 255)) : 0.05;
  const fill = isOn ? colorHex : "rgba(148,163,184,0.35)";

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.card}>
        <Svg width={width} height={height}>
          <Polyline
            points={poly}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {leds.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3.1}
              fill={fill}
              opacity={opacity}
            />
          ))}
        </Svg>

        <Text style={styles.meta}>
          Podgląd: {rendered}/{ledCount || 0} LED
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  label: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f1f5f9",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
  },
  meta: {
    marginTop: 10,
    fontSize: 12,
    color: "#94a3b8",
  },
});
