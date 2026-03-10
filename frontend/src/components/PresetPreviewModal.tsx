// src/components/PresetPreviewModal.tsx
// Animated local simulation of a WLED effect on the ∩-shaped kinkiet strip
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { C, R } from "../ui/theme";
import type { Preset } from "../features/deviceControl/types";

// ── LED strip config (matches physical kinkiet) ───────────────────────────────
const LEFT_COUNT  = 55;
const TOP_COUNT   = 10;
const RIGHT_COUNT = 55;
const TOTAL       = LEFT_COUNT + TOP_COUNT + RIGHT_COUNT; // 120

// ── SVG canvas ────────────────────────────────────────────────────────────────
const SVG_W  = 220;   // narrower – arms closer together, more like physical kinkiet
const SVG_H  = 300;   // tall – arms ~1.7x taller than top width (180px gap)
const PAD    = 20;
const DOT_R  = 2;
const FPS_MS = 50; // 20 fps

// ── Generate LED positions ────────────────────────────────────────────────────
type Pt = { x: number; y: number };

function buildPositions(): Pt[] {
  const pts: Pt[] = [];

  // Left arm: index 0 at BOTTOM, index LEFT_COUNT-1 at TOP
  for (let i = 0; i < LEFT_COUNT; i++) {
    const t = i / (LEFT_COUNT - 1); // 0=bottom → 1=top
    pts.push({ x: PAD, y: SVG_H - PAD - t * (SVG_H - 2 * PAD) });
  }

  // Top strip: index 0 at LEFT, index TOP_COUNT-1 at RIGHT
  for (let i = 0; i < TOP_COUNT; i++) {
    const t = i / (TOP_COUNT - 1);
    pts.push({ x: PAD + t * (SVG_W - 2 * PAD), y: PAD });
  }

  // Right arm: index 0 at TOP, index RIGHT_COUNT-1 at BOTTOM
  for (let i = 0; i < RIGHT_COUNT; i++) {
    const t = i / (RIGHT_COUNT - 1); // 0=top → 1=bottom
    pts.push({ x: SVG_W - PAD, y: PAD + t * (SVG_H - 2 * PAD) });
  }

  return pts;
}

const POSITIONS = buildPositions();

// ── Color helpers ─────────────────────────────────────────────────────────────
function clamp255(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => clamp255(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [
    clamp255((r + m) * 255),
    clamp255((g + m) * 255),
    clamp255((b + m) * 255),
  ];
}

// Cheap deterministic "random" from seed
function hash(n: number) {
  let x = n;
  x = ((x >> 16) ^ x) * 0x45d9f3b;
  x = ((x >> 16) ^ x) * 0x45d9f3b;
  x = (x >> 16) ^ x;
  return x & 0x7fffffff;
}

// ── Effect engine ─────────────────────────────────────────────────────────────
function computeColors(
  tick: number,
  fx: number,
  rgb: [number, number, number],
  sx: number,
  ix: number,
): string[] {
  const [r, g, b] = rgb;
  const speed = sx / 255; // 0..1
  const intensity = ix / 255; // 0..1
  const N = TOTAL;

  switch (fx) {
    // ── Solid ────────────────────────────────────────────────────────
    default:
    case 0: {
      const hex = toHex(r, g, b);
      return new Array(N).fill(hex);
    }

    // ── Blink ────────────────────────────────────────────────────────
    case 1: {
      const period = Math.max(1, Math.round(40 - speed * 36)); // frames
      const on = (tick % (period * 2)) < period;
      const hex = on ? toHex(r, g, b) : "#030303";
      return new Array(N).fill(hex);
    }

    // ── Breathe ──────────────────────────────────────────────────────
    case 2: {
      const rate = 0.015 + speed * 0.07;
      const bri  = (Math.sin(tick * rate) + 1) / 2; // 0..1
      const dim  = 0.05 + bri * 0.95;
      const hex  = toHex(r * dim, g * dim, b * dim);
      return new Array(N).fill(hex);
    }

    // ── Color Wipe ───────────────────────────────────────────────────
    case 3: {
      const wipeRate = 0.4 + speed * 3;
      const head = Math.floor(tick * wipeRate) % (N * 2);
      return Array.from({ length: N }, (_, i) => {
        if (head < N)   return i < head ? toHex(r, g, b) : "#060606";
        else            return i >= (head - N) ? "#060606" : toHex(r, g, b);
      });
    }

    // ── Rainbow ──────────────────────────────────────────────────────
    case 9: {
      const shift = tick * (0.8 + speed * 4);
      return Array.from({ length: N }, (_, i) => {
        const hue = ((i / N) * 360 + shift) % 360;
        const [rr, gg, bb] = hslToRgb(hue, 1, 0.5);
        return toHex(rr, gg, bb);
      });
    }

    // ── Twinkle ──────────────────────────────────────────────────────
    case 17: {
      const frameSeed = Math.floor(tick * (0.5 + speed * 3));
      const thresh = Math.floor(15 + intensity * 35); // 15..50% sparkle
      return Array.from({ length: N }, (_, i) => {
        const h = hash(i * 997 + frameSeed * 31);
        const on = (h % 100) < thresh;
        const bri = on ? 0.5 + (h & 0xff) / 255 * 0.5 : 0.04;
        return toHex(r * bri, g * bri, b * bri);
      });
    }

    // ── Comet ────────────────────────────────────────────────────────
    case 25: {
      const cometSpeed = 0.5 + speed * 3;
      const tail = Math.floor(8 + intensity * 20);
      const pos  = (tick * cometSpeed) % N;
      return Array.from({ length: N }, (_, i) => {
        const d = ((pos - i) % N + N) % N;
        if (d === 0)    return toHex(255, 255, 255);
        if (d < tail) {
          const fade = 1 - d / tail;
          return toHex(r * fade * 0.9, g * fade * 0.9, b * fade * 0.9);
        }
        return "#040404";
      });
    }

    // ── Fire ─────────────────────────────────────────────────────────
    case 66: {
      const flickerRate = 0.08 + speed * 0.3;
      return Array.from({ length: N }, (_, i) => {
        const base   = Math.max(0, 1 - i / N * 1.4);
        const flick  = Math.sin(i * 3.7 + tick * flickerRate) * 0.25;
        const heat   = Math.max(0, Math.min(1, base + flick));
        if (heat < 0.33) {
          return toHex(heat * 3 * 200, 0, 0);
        } else if (heat < 0.66) {
          const t = (heat - 0.33) / 0.33;
          return toHex(200, t * 110, 0);
        } else {
          const t = (heat - 0.66) / 0.34;
          return toHex(220, 110 + t * 120, t * 60);
        }
      });
    }

    // ── Meteor ───────────────────────────────────────────────────────
    case 76: {
      const meteorSpeed = 0.3 + speed * 2;
      const trail = Math.floor(12 + intensity * 30);
      const pos   = (tick * meteorSpeed) % N;
      return Array.from({ length: N }, (_, i) => {
        const d = ((pos - i) % N + N) % N;
        if (d === 0)    return toHex(255, 255, 255);
        if (d < trail) {
          const fade = Math.pow(1 - d / trail, 1.5);
          return toHex(r * fade, g * fade, b * fade);
        }
        return "#030303";
      });
    }
  }
}

// ── Effect name lookup ────────────────────────────────────────────────────────
const FX_NAMES: Record<number, string> = {
  0:  "Solid",
  1:  "Blink",
  2:  "Breathe",
  3:  "Color Wipe",
  9:  "Rainbow",
  17: "Twinkle",
  25: "Comet",
  66: "Fire",
  76: "Meteor",
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface PresetPreviewModalProps {
  visible:  boolean;
  onClose:  () => void;
  preset:   Preset | null;
  baseRgb?: [number, number, number];
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PresetPreviewModal({
  visible,
  onClose,
  preset,
  baseRgb = [99, 102, 241],
}: PresetPreviewModalProps) {
  const [colors, setColors] = useState<string[]>(() =>
    new Array(TOTAL).fill(C.primary),
  );
  const tickRef = useRef(0);

  const animate = useCallback(() => {
    if (!preset) return;
    tickRef.current += 1;
    const next = computeColors(
      tickRef.current,
      preset.wled_fx ?? 0,
      (preset.color as [number, number, number] | undefined) ?? baseRgb,
      preset.sx  ?? 128,
      preset.ix  ?? 128,
    );
    setColors(next);
  }, [preset, baseRgb]);

  useEffect(() => {
    if (!visible) return;
    tickRef.current = 0;
    const id = setInterval(animate, FPS_MS);
    return () => clearInterval(id);
  }, [visible, animate]);

  if (!preset) return null;

  const fxName = FX_NAMES[preset.wled_fx ?? 0] ?? "Effect";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.fxBadge}>
                <Ionicons name="color-palette" size={14} color={C.primary2} />
                <Text style={s.fxBadgeText}>{fxName}</Text>
              </View>
              <Text style={s.presetName} numberOfLines={1}>{preset.name}</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={18} color={C.text2} />
            </TouchableOpacity>
          </View>

          {/* U-shape SVG preview */}
          <View style={s.svgWrap}>
            {/* Guide lines (arm connectors) */}
            <View style={s.svgBg}>
              <Svg width={SVG_W} height={SVG_H}>
                {/* Left arm guide */}
                <Line
                  x1={PAD} y1={PAD}
                  x2={PAD} y2={SVG_H - PAD}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
                {/* Top guide */}
                <Line
                  x1={PAD} y1={PAD}
                  x2={SVG_W - PAD} y2={PAD}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
                {/* Right arm guide */}
                <Line
                  x1={SVG_W - PAD} y1={PAD}
                  x2={SVG_W - PAD} y2={SVG_H - PAD}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />

                {/* Continuous LED strip – one segment per pair of adjacent LEDs */}
                {POSITIONS.slice(0, -1).map((pt, i) => (
                  <Line
                    key={i}
                    x1={pt.x} y1={pt.y}
                    x2={POSITIONS[i + 1].x} y2={POSITIONS[i + 1].y}
                    stroke={colors[i] ?? "#111"}
                    strokeWidth={5}
                    strokeLinecap="round"
                  />
                ))}
                {/* Cap the last LED */}
                <Circle
                  cx={POSITIONS[TOTAL - 1].x}
                  cy={POSITIONS[TOTAL - 1].y}
                  r={2.5}
                  fill={colors[TOTAL - 1] ?? "#111"}
                />
              </Svg>
            </View>
          </View>

          {/* Footer info */}
          <View style={s.footer}>
            <View style={s.footerChip}>
              <Ionicons name="flash-outline" size={12} color={C.text3} />
              <Text style={s.footerText}>{LEFT_COUNT} · {TOP_COUNT} · {RIGHT_COUNT} LEDs</Text>
            </View>
            <View style={s.footerChip}>
              <Ionicons name="speedometer-outline" size={12} color={C.text3} />
              <Text style={s.footerText}>sx {preset.sx ?? 128} · ix {preset.ix ?? 128}</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: C.bgOverlay,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#07071C",
    borderRadius: R.xxl,
    borderWidth: 1,
    borderColor: C.borderMd,
    overflow: "hidden",
    paddingBottom: 4,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerLeft: { flex: 1, gap: 6 },
  fxBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(99,102,241,0.12)",
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
  },
  fxBadgeText: { color: C.primary2, fontSize: 11, fontWeight: "800" },
  presetName:  { color: C.text, fontSize: 20, fontWeight: "900", letterSpacing: 0.1 },
  closeBtn: {
    width: 32, height: 32,
    borderRadius: 10,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  // ── SVG ─────────────────────────────────────────────────────────────────
  svgWrap: { alignItems: "center", paddingHorizontal: 0 },
  svgBg: {
    backgroundColor: "#020209",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    width: "100%",
    alignItems: "center",
  },

  // ── Footer ──────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: "center",
  },
  footerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
  },
  footerText: { color: C.text3, fontSize: 11, fontWeight: "700" },
});
