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
const SVG_W  = 220;
const SVG_H  = 300;
const PAD    = 20;
const FPS_MS = 50; // 20 fps

// ── Generate LED positions ────────────────────────────────────────────────────
type Pt = { x: number; y: number };

function buildPositions(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < LEFT_COUNT; i++) {
    const t = i / (LEFT_COUNT - 1);
    pts.push({ x: PAD, y: SVG_H - PAD - t * (SVG_H - 2 * PAD) });
  }
  for (let i = 0; i < TOP_COUNT; i++) {
    const t = i / (TOP_COUNT - 1);
    pts.push({ x: PAD + t * (SVG_W - 2 * PAD), y: PAD });
  }
  for (let i = 0; i < RIGHT_COUNT; i++) {
    const t = i / (RIGHT_COUNT - 1);
    pts.push({ x: SVG_W - PAD, y: PAD + t * (SVG_H - 2 * PAD) });
  }
  return pts;
}

const POSITIONS = buildPositions();

// ── Color helpers ─────────────────────────────────────────────────────────────
function clamp255(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => clamp255(c).toString(16).padStart(2, '0')).join('');
}

// FastLED colorWheel: 0-255 → smooth rainbow RGB
function colorWheel(pos: number): [number, number, number] {
  pos = ((Math.round(pos) % 256) + 256) % 256;
  if (pos < 85)  return [255 - pos * 3, pos * 3, 0];
  if (pos < 170) { pos -= 85;  return [0, 255 - pos * 3, pos * 3]; }
  pos -= 170;    return [pos * 3, 0, 255 - pos * 3];
}

// Triangle wave: 0-127→0-254, 128-255→254-0
function triwave8(pos: number): number {
  pos = ((Math.round(pos) % 256) + 256) % 256;
  return pos < 128 ? pos * 2 : (255 - pos) * 2;
}

function qadd8(a: number, b: number): number { return Math.min(255, a + b); }
function qsub8(a: number, b: number): number { return Math.max(0, a - b); }

// Deterministic pseudo-random hash
function hash(n: number): number {
  let x = (n >>> 0);
  x = (((x >> 16) ^ x) * 0x45d9f3b) >>> 0;
  x = (((x >> 16) ^ x) * 0x45d9f3b) >>> 0;
  x = ((x >> 16) ^ x) >>> 0;
  return x;
}
function rnd8(seed: number): number { return hash(seed >>> 0) & 0xff; }

// ── Palettes ──────────────────────────────────────────────────────────────────
// Colorwaves palette (deep-sea: near-black → dark blue → teal/green)
const COLORWAVES_PAL: [number, number, number][] = [
  [0,5,7],[0,4,9],[0,3,11],[0,3,13],[0,2,16],[0,2,18],[0,1,20],[0,1,23],
  [0,0,25],[0,0,28],[0,0,38],[0,0,49],[0,0,59],[0,0,70],[20,85,75],[40,170,80],
];
function colorwavesPalette(pos: number): [number, number, number] {
  pos = ((pos % 256) + 256) % 256;
  const f   = pos / 16;
  const i0  = Math.floor(f) % 16;
  const i1  = (i0 + 1) % 16;
  const t   = f - Math.floor(f);
  const c0  = COLORWAVES_PAL[i0];
  const c1  = COLORWAVES_PAL[i1];
  return [c0[0]+(c1[0]-c0[0])*t, c0[1]+(c1[1]-c0[1])*t, c0[2]+(c1[2]-c0[2])*t];
}

// Party colors
const PARTY_PAL: [number, number, number, number][] = [
  [0,255,0,0],[32,255,100,0],[64,255,200,0],[96,0,220,0],
  [128,0,20,255],[160,130,0,255],[192,255,0,130],[224,255,0,20],[256,255,0,0],
];
function partyPalette(pos: number): [number, number, number] {
  pos = ((pos % 256) + 256) % 256;
  for (let i = 0; i < PARTY_PAL.length - 1; i++) {
    const [p0,r0,g0,b0] = PARTY_PAL[i];
    const [p1,r1,g1,b1] = PARTY_PAL[i+1];
    if (pos >= p0 && pos < p1) {
      const t = (pos - p0) / (p1 - p0);
      return [r0+(r1-r0)*t, g0+(g1-g0)*t, b0+(b1-b0)*t];
    }
  }
  return [255, 0, 0];
}

// Sunrise palette
const SUNRISE_PAL: [number, number, number, number][] = [
  [0,0,0,0],[16,10,0,0],[32,40,5,0],[48,80,15,0],[64,150,30,0],
  [96,200,70,0],[128,255,120,0],[160,255,160,20],[192,255,190,60],
  [224,255,230,150],[255,255,255,255],
];
function sunrisePalette(pos: number): [number, number, number] {
  pos = ((pos % 256) + 256) % 256;
  for (let i = 0; i < SUNRISE_PAL.length - 1; i++) {
    const [p0,r0,g0,b0] = SUNRISE_PAL[i];
    const [p1,r1,g1,b1] = SUNRISE_PAL[i+1];
    if (pos >= p0 && pos <= p1) {
      const t = (pos - p0) / (p1 - p0);
      return [r0+(r1-r0)*t, g0+(g1-g0)*t, b0+(b1-b0)*t];
    }
  }
  return [255, 255, 255];
}

// ── Effect state (stateful effects mutate this each frame) ────────────────────
type EffectState = {
  leds:      Float32Array;   // persistent led buffer [r,g,b,...] TOTAL*3
  tw:        Uint8Array;     // twinkle brightness per LED
  efxBuf:    Uint8Array;     // general per-LED byte buffer (dissolve, rain)
  heat:      Uint8Array;     // fire heat
  fw:        Array<{pos:number;vel:number;life:number;r:number;g:number;b:number;isSpark:boolean}>;
  balls:     Array<{pos:number;vel:number;colIdx:number}>;
  ballsInit: boolean;
  ripAge:    number;
  ripCenter: number;
  ltgNext:   number;
  ltgStart:  number;
  ltgLen:    number;
  ltgFlash:  number;
  burstNext: number;
  sparks:    Array<{pos:number;vel:number;hue:number;life:number}>;
  wrCycle:   number;
  wrHue:     number;
};

function makeState(): EffectState {
  return {
    leds:      new Float32Array(TOTAL * 3),
    tw:        new Uint8Array(TOTAL),
    efxBuf:    new Uint8Array(TOTAL),
    heat:      new Uint8Array(TOTAL),
    fw:        [],
    balls:     [],
    ballsInit: false,
    ripAge:    255,
    ripCenter: 0,
    ltgNext:   0,
    ltgStart:  0,
    ltgLen:    5,
    ltgFlash:  0,
    burstNext: 0,
    sparks:    [],
    wrCycle:   -1,
    wrHue:     0,
  };
}

// ── Effect engine ─────────────────────────────────────────────────────────────
function computeColors(
  tick:  number,
  fx:    number,
  rgb:   [number, number, number],
  sx:    number,
  ix:    number,
  state: EffectState,
): string[] {
  const [r, g, b] = rgb;
  const N = TOTAL;
  const t = tick * 50; // ms approximation (20 fps)
  const leds = state.leds;

  function setLed(i: number, rr: number, gg: number, bb: number) {
    leds[i*3]   = Math.max(0, Math.min(255, rr));
    leds[i*3+1] = Math.max(0, Math.min(255, gg));
    leds[i*3+2] = Math.max(0, Math.min(255, bb));
  }
  function fillSolid(rr: number, gg: number, bb: number) {
    for (let i = 0; i < N; i++) setLed(i, rr, gg, bb);
  }
  function fadeAll(fade: number) {
    const f = fade / 255;
    for (let i = 0; i < N * 3; i++) leds[i] = Math.floor(leds[i] * f);
  }

  switch (fx) {
    default:
    case 0: { // Solid
      fillSolid(r, g, b);
      break;
    }

    case 1: { // Blink
      const period = Math.max(80, 1000 - sx * 4);
      const on = Math.floor(t / period) % 2 === 0;
      fillSolid(on ? r : 0, on ? g : 0, on ? b : 0);
      break;
    }

    case 2: { // Breathe (quadratic easing like WLED)
      const breath = (Math.exp(Math.sin(t * sx / 100000)) - 0.36788) / 2.3504;
      const dim = Math.max(0, Math.min(1, breath));
      fillSolid(r * dim, g * dim, b * dim);
      break;
    }

    case 3: { // Color Wipe
      const cy = Math.floor(t * sx / 5000) % (2 * N);
      for (let i = 0; i < N; i++) {
        const on = cy < N ? i <= cy : i > (cy - N);
        setLed(i, on ? r : 0, on ? g : 0, on ? b : 0);
      }
      break;
    }

    case 4: { // Wipe Random
      const cy  = Math.floor(t * sx / 5000) % (2 * N);
      const cn  = Math.floor(Math.floor(t * sx / 5000) / (2 * N));
      if (state.wrCycle !== cn) {
        state.wrCycle = cn;
        state.wrHue   = hash(cn * 1337 + 7) & 0xff;
      }
      const wc = colorWheel(state.wrHue);
      for (let i = 0; i < N; i++) {
        const on = cy < N ? i <= cy : i > (cy - N);
        setLed(i, on ? wc[0] : 0, on ? wc[1] : 0, on ? wc[2] : 0);
      }
      break;
    }

    case 5: { // Color Wipe Reversed
      const cy = Math.floor(t * sx / 5000) % (2 * N);
      for (let i = 0; i < N; i++) {
        const ri = N - 1 - i;
        const on = cy < N ? ri <= cy : ri > (cy - N);
        setLed(i, on ? r : 0, on ? g : 0, on ? b : 0);
      }
      break;
    }

    case 8: { // Color Loop
      const it = Math.floor((t * sx) / 4096) & 0xff;
      const c  = colorWheel(it);
      fillSolid(c[0], c[1], c[2]);
      break;
    }

    case 9: { // Rainbow
      const phase = Math.floor((t * sx) / 2048) & 0xff;
      for (let i = 0; i < N; i++) {
        const c = colorWheel(Math.floor(i * 256 / N + phase) & 0xff);
        setLed(i, c[0], c[1], c[2]);
      }
      break;
    }

    case 10: { // Fade
      const v   = triwave8(Math.floor((t * sx) / 4096) & 0xff);
      const dim = v / 255;
      fillSolid(r * dim, g * dim, b * dim);
      break;
    }

    case 11: { // Larson Scanner (Knight Rider)
      const period = Math.max(200, 2000000 / Math.max(1, sx));
      const tp     = t % (2 * period);
      const frac   = tp < period ? tp / period : 2 - tp / period;
      const pos    = Math.round(frac * (N - 1));
      fadeAll(192);
      for (let j = 0; j < 5; j++) {
        const idx = Math.max(0, Math.min(N-1, pos - j));
        const v   = Math.max(0, 1 - j * 0.22);
        leds[idx*3]   = Math.max(leds[idx*3],   r * v);
        leds[idx*3+1] = Math.max(leds[idx*3+1], g * v);
        leds[idx*3+2] = Math.max(leds[idx*3+2], b * v);
      }
      break;
    }

    case 12: { // Strobe
      const p  = Math.max(25, 270 - sx);
      const on = (t % p) < 25;
      fillSolid(on ? r : 0, on ? g : 0, on ? b : 0);
      break;
    }

    case 13: { // Strobe Rainbow
      const p = Math.max(25, 270 - sx);
      if ((t % p) < 25) {
        const c = colorWheel((t >> 3) & 0xff);
        fillSolid(c[0], c[1], c[2]);
      } else {
        fillSolid(0, 0, 0);
      }
      break;
    }

    case 16: { // Running Lights
      const phase = t * sx / 25000;
      const waves = Math.max(1, Math.floor(ix / 64)) + 1;
      for (let i = 0; i < N; i++) {
        const v = (Math.sin(i / N * 6.2832 * waves - phase) + 1) / 2;
        setLed(i, r * v, g * v, b * v);
      }
      break;
    }

    case 17: { // Twinkle
      const fade  = Math.max(1, 32 - sx / 8);
      const spawn = Math.max(1, ix / 8);
      for (let i = 0; i < N; i++) {
        if (state.tw[i] > 0) {
          state.tw[i] = qsub8(state.tw[i], fade);
        } else if (rnd8(i * 997 + tick * 31 + i) < spawn) {
          state.tw[i] = 255;
        }
        const v = state.tw[i] / 255;
        setLed(i, r * v, g * v, b * v);
      }
      break;
    }

    case 18: { // Twinkle Random
      const fade  = Math.max(1, 32 - sx / 8);
      const spawn = Math.max(1, ix / 8);
      for (let i = 0; i < N; i++) {
        if (state.tw[i] > 0) {
          state.tw[i] = qsub8(state.tw[i], fade);
          const c = colorWheel((i * 37) & 0xff);
          const v = state.tw[i] / 255;
          setLed(i, c[0] * v, c[1] * v, c[2] * v);
        } else {
          if (rnd8(i * 997 + tick * 31 + i) < spawn) state.tw[i] = 255;
          setLed(i, 0, 0, 0);
        }
      }
      break;
    }

    case 19: { // Twinkle Fade
      const fade  = Math.max(2, 40 - sx / 7);
      const spawn = Math.max(1, ix / 10);
      for (let i = 0; i < N * 3; i++) leds[i] = Math.max(0, leds[i] - fade);
      const cnt = Math.max(1, Math.floor(N * spawn / 128));
      for (let n = 0; n < cnt; n++) {
        const i = hash(n * 7 + tick * 3 + 1) % N;
        setLed(i, r, g, b);
      }
      break;
    }

    case 21: { // Dissolve
      const rate = Math.max(1, Math.floor(sx * sx / 6400));
      for (let i = 0; i < N; i++) {
        if (state.efxBuf[i] === 0) {
          if (rnd8(i * 313 + tick * 17) < rate) state.efxBuf[i] = 255;
          setLed(i, 0, 0, 0);
        } else {
          state.efxBuf[i] = qsub8(state.efxBuf[i], Math.max(1, Math.floor(ix / 16)));
          const v = state.efxBuf[i] / 255;
          setLed(i, r * v, g * v, b * v);
        }
      }
      break;
    }

    case 25: { // Comet
      const pos  = (t * sx / 50000) % N;
      const tail = Math.max(3, Math.floor(ix / 16));
      for (let i = 0; i < N; i++) {
        let d = Math.abs(i - pos);
        if (d > N / 2) d = N - d;
        const v = Math.max(0, 1 - d / tail);
        setLed(i, r * v, g * v, b * v);
      }
      break;
    }

    case 28: { // Chase Rainbow
      const pos = Math.floor(t * sx / 3000) % N;
      const hue = Math.floor((t * sx) / 1024) & 0xff;
      fillSolid(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const idx = ((pos - j) + N * 10) % N;
        const c   = colorWheel((hue + j * 8) & 0xff);
        const dim = Math.max(0, 1 - j * 55 / 255);
        setLed(idx, c[0] * dim, c[1] * dim, c[2] * dim);
      }
      break;
    }

    case 35: { // Colorful (random colored segments)
      const segLen = Math.max(2, Math.floor(N / (Math.max(2, Math.floor(ix / 40)) + 2)));
      const phase  = Math.floor(t * sx / 8000) & 0xff;
      for (let i = 0; i < N; i++) {
        const seg = Math.floor(i / segLen) + phase;
        const c   = colorWheel((seg * 37) & 0xff);
        setLed(i, c[0], c[1], c[2]);
      }
      break;
    }

    case 38: { // Juggle
      fadeAll(224);
      const numdots = Math.max(2, Math.floor(ix / 32));
      for (let i = 0; i < numdots; i++) {
        const bpm  = i * (Math.floor(sx / 16) + 1) + 1;
        const beat = (t * bpm / 60000) * Math.PI * 2;
        const s    = (Math.sin(beat) + 1) / 2;
        const idx  = Math.max(0, Math.min(N - 1, Math.round(s * (N - 1))));
        const c    = colorWheel(Math.floor((i * 255 / numdots) + (t / 64)) & 0xff);
        leds[idx*3]   = Math.min(255, leds[idx*3]   + c[0]);
        leds[idx*3+1] = Math.min(255, leds[idx*3+1] + c[1]);
        leds[idx*3+2] = Math.min(255, leds[idx*3+2] + c[2]);
      }
      break;
    }

    case 40: { // Sparkle (fill solid + white sparks)
      fillSolid(r, g, b);
      const cnt = Math.max(1, Math.floor(ix / 64));
      for (let i = 0; i < cnt; i++) {
        const idx = hash(tick * 97 + i * 37 + 1) % N;
        setLed(idx, 255, 255, 255);
      }
      break;
    }

    case 41: { // Sparkle Dark
      fillSolid(0, 0, 0);
      const cnt = Math.max(1, Math.floor(ix / 40));
      for (let i = 0; i < cnt; i++) {
        const idx = hash(tick * 97 + i * 37 + 2) % N;
        setLed(idx, r, g, b);
      }
      break;
    }

    case 42: { // Fireworks multicolor
      const fwPal: [number,number,number][] = [
        [255,0,0],[255,80,0],[255,200,0],[0,200,0],
        [0,180,255],[100,0,255],[255,0,150],[255,255,255],
      ];
      const fadeAmt = Math.max(4, Math.floor(28 - ix / 10));
      for (let i = 0; i < N * 3; i++) leds[i] = Math.max(0, leds[i] - fadeAmt);
      if (rnd8(tick * 7 + 3) < Math.floor(sx / 5)) {
        const center = hash(tick * 31 + 1) % N;
        const c      = fwPal[hash(tick * 13 + 2) % 8];
        const spread = Math.max(2, Math.floor(ix / 25));
        for (let j = -spread; j <= spread; j++) {
          const idx = Math.max(0, Math.min(N-1, center + j));
          const v   = Math.max(0, 1 - Math.abs(j) / (spread + 1));
          leds[idx*3]   = Math.min(255, leds[idx*3]   + c[0] * v);
          leds[idx*3+1] = Math.min(255, leds[idx*3+1] + c[1] * v);
          leds[idx*3+2] = Math.min(255, leds[idx*3+2] + c[2] * v);
        }
      }
      break;
    }

    case 44: { // Fireworks 1D (physics)
      const fw1Pal: [number,number,number][] = [
        [255,30,0],[255,130,0],[255,230,0],[80,255,0],
        [0,180,255],[160,0,255],[255,0,150],[0,255,160],
      ];
      for (let i = 0; i < N * 3; i++) leds[i] = Math.max(0, leds[i] - 55);
      if (rnd8(tick * 11 + 3) < 12 + (sx >> 3) && state.fw.length < 30) {
        const h  = hash(tick * 71 + 1) % (N / 3) + Math.floor(N / 3);
        const v0 = Math.round(Math.sqrt(2 * 60 * 100 * h));
        const fc = fw1Pal[hash(tick * 37 + 1) % 8];
        state.fw.push({ pos: 0, vel: v0, life: 255, r: fc[0], g: fc[1], b: fc[2], isSpark: false });
      }
      const GRAV = 60;
      const nxt: typeof state.fw = [];
      for (const p of state.fw) {
        p.vel -= GRAV;
        p.pos += p.vel;
        p.life = Math.max(0, p.life - (p.isSpark ? 18 : 15));
        if (!p.isSpark && p.vel <= 0) {
          const nsp = 8 + (ix >> 4);
          const spd = 80 + (ix >> 1);
          for (let i = 0; i < nsp; i++) {
            const sv = (rnd8(i * 13 + tick + i) - 128) * spd / 128;
            nxt.push({ pos: p.pos, vel: sv, life: 230, r: p.r, g: p.g, b: p.b, isSpark: true });
          }
          continue;
        }
        if (p.life > 0 && p.pos >= -300 && p.pos <= N * 100 + 300) nxt.push(p);
      }
      if (nxt.length > 40) nxt.splice(0, nxt.length - 40);
      state.fw = nxt;
      for (const p of state.fw) {
        const idx = Math.floor(p.pos / 100);
        if (idx >= 0 && idx < N) {
          const v = p.life / 255;
          leds[idx*3]   = Math.min(255, leds[idx*3]   + p.r * v);
          leds[idx*3+1] = Math.min(255, leds[idx*3+1] + p.g * v);
          leds[idx*3+2] = Math.min(255, leds[idx*3+2] + p.b * v);
        }
      }
      break;
    }

    case 45: { // Rain
      const spawnRate = Math.max(1, Math.floor(sx / 16));
      const fadeRate  = Math.max(2, 30 - Math.floor(ix / 10));
      for (let i = 0; i < N - 1; i++) {
        state.efxBuf[i] = qsub8(state.efxBuf[i + 1], 1);
      }
      state.efxBuf[N - 1] = 0;
      if (rnd8(tick * 17 + 1) < spawnRate) {
        state.efxBuf[N - 1] = 180 + (rnd8(tick * 23 + 2) % 75);
      }
      for (let i = 0; i < N; i++) {
        const v = state.efxBuf[i] / 255;
        setLed(i, r * v, g * v, b * v);
      }
      break;
    }

    case 51: { // Scanner Dual
      const period = Math.max(200, 2000000 / Math.max(1, sx));
      const tp     = t % (2 * period);
      const frac   = tp < period ? tp / period : 2 - tp / period;
      const pos    = Math.round(frac * (N / 2 - 1));
      fadeAll(192);
      for (let j = 0; j < 4; j++) {
        const v    = Math.max(0, 1 - j * 0.25);
        const idx1 = Math.max(0, Math.min(N-1, pos - j));
        const idx2 = Math.max(0, Math.min(N-1, N - 1 - pos + j));
        leds[idx1*3]   = Math.max(leds[idx1*3],   r * v);
        leds[idx1*3+1] = Math.max(leds[idx1*3+1], g * v);
        leds[idx1*3+2] = Math.max(leds[idx1*3+2], b * v);
        leds[idx2*3]   = Math.max(leds[idx2*3],   r * v);
        leds[idx2*3+1] = Math.max(leds[idx2*3+1], g * v);
        leds[idx2*3+2] = Math.max(leds[idx2*3+2], b * v);
      }
      break;
    }

    case 53: { // Bouncing Balls
      const GRAVITY  = -9.81 * 0.5;
      const numBalls = Math.min(8, Math.max(1, Math.floor(ix / 32)));
      if (!state.ballsInit) {
        for (let i = 0; i < 8; i++) {
          state.balls.push({
            pos:    N - 1,
            vel:    -Math.sqrt(-2 * GRAVITY * (N / 3 + i * N / 8)),
            colIdx: Math.floor(i * 255 / 8),
          });
        }
        state.ballsInit = true;
      }
      const dt = 1 / 20;
      fillSolid(0, 0, 0);
      for (let i = 0; i < numBalls; i++) {
        const ball = state.balls[i];
        ball.vel += GRAVITY * dt;
        ball.pos += ball.vel * dt;
        if (ball.pos <= 0) {
          ball.pos = 0;
          ball.vel = Math.abs(ball.vel) * 0.88;
          if (ball.vel < 0.5) ball.vel = -Math.sqrt(-2 * GRAVITY * (N / 3));
        }
        const idx = Math.max(0, Math.min(N-1, Math.round(ball.pos)));
        const c   = colorWheel(ball.colIdx);
        setLed(idx, c[0], c[1], c[2]);
        if (idx > 0)   { leds[(idx-1)*3] = Math.min(255, leds[(idx-1)*3] + c[0]*0.39); leds[(idx-1)*3+1] = Math.min(255, leds[(idx-1)*3+1] + c[1]*0.39); leds[(idx-1)*3+2] = Math.min(255, leds[(idx-1)*3+2] + c[2]*0.39); }
        if (idx < N-1) { leds[(idx+1)*3] = Math.min(255, leds[(idx+1)*3] + c[0]*0.39); leds[(idx+1)*3+1] = Math.min(255, leds[(idx+1)*3+1] + c[1]*0.39); leds[(idx+1)*3+2] = Math.min(255, leds[(idx+1)*3+2] + c[2]*0.39); }
      }
      break;
    }

    case 57: { // Lightning
      if (t >= state.ltgNext) {
        state.ltgStart = hash(tick * 31 + 1) % N;
        state.ltgLen   = 2 + hash(tick * 37 + 1) % Math.max(3, Math.floor(N / 4));
        state.ltgFlash = 6 + hash(tick * 41 + 1) % 4;
        state.ltgNext  = t + 500 + hash(tick * 43 + 1) % Math.max(1, 1000 - sx * 3);
      }
      fillSolid(0, 0, 0);
      if (state.ltgFlash > 0) {
        if (state.ltgFlash % 2 === 0) {
          const end = Math.min(N - 1, state.ltgStart + state.ltgLen);
          for (let i = state.ltgStart; i <= end; i++) setLed(i, 200, 200, 255);
        }
        state.ltgFlash = qsub8(state.ltgFlash, 1 + (sx >> 6));
      }
      break;
    }

    case 65: { // Halloween Eyes
      fillSolid(0, 0, 0);
      const blinkPhase = Math.floor((t * sx / 5000) / 8) % 16;
      if (blinkPhase !== 0) {
        const beat   = (t * 20 / 60000) * Math.PI * 2;
        const eyePos = Math.round(1 + ((Math.sin(beat) + 1) / 2) * (N / 2 - 3));
        setLed(eyePos,             r, g, b);
        setLed(eyePos + 1,         r, g, b);
        setLed(N - 2 - eyePos,     r, g, b);
        setLed(N - 1 - eyePos,     r, g, b);
        if (eyePos > 0)       setLed(eyePos - 1,     r * 0.23, g * 0.23, b * 0.23);
        if (eyePos + 2 < N)   setLed(eyePos + 2,     r * 0.23, g * 0.23, b * 0.23);
      }
      break;
    }

    case 66: { // Fire2012
      const co      = (11 * (255 - Math.min(255, sx))) >> 4;
      const coolMax = Math.floor(co * 10 / N) + 2;
      const sk      = (ix >> 1) + 64;
      for (let i = 0; i < N; i++) {
        state.heat[i] = Math.max(0, state.heat[i] - (rnd8(i * 7 + tick) % Math.max(1, coolMax)));
      }
      for (let i = N - 1; i > 1; i--) {
        state.heat[i] = Math.floor((state.heat[i-1] + state.heat[i-2] + state.heat[i-2]) / 3);
      }
      if (rnd8(tick * 13 + 1) < sk) {
        const j = rnd8(tick * 17 + 1) % Math.min(6, N - 1);
        state.heat[j] = Math.min(255, state.heat[j] + 160 + rnd8(tick * 19 + 1) % 95);
      }
      for (let i = 0; i < N; i++) {
        const h    = state.heat[i];
        const t192 = Math.floor(h * 191 / 256);
        const hr   = (t192 & 0x3f) << 2;
        let rv, gv, bv: number;
        if (t192 & 0x80)      { rv = 255; gv = 255; bv = hr; }
        else if (t192 & 0x40) { rv = 255; gv = hr;  bv = 0;  }
        else                  { rv = hr;  gv = 0;   bv = 0;  }
        setLed(N - 1 - i, rv, gv, bv);
      }
      break;
    }

    case 67: { // Fire Flicker
      const flickDepth = Math.max(10, 255 - ix);
      for (let i = 0; i < N; i++) {
        const flicker = hash(i * 997 + tick * 31 + 1) % flickDepth;
        const bri     = Math.max(0, 1 - flicker / 255);
        setLed(i, r * bri, g * bri, b * bri);
      }
      break;
    }

    case 68: { // Gradient (cycling rainbow per position)
      const phase = Math.floor(t * sx / 6000) & 0xff;
      for (let i = 0; i < N; i++) {
        const pos = Math.floor(i * 256 / N + phase) & 0xff;
        const c   = colorWheel(pos);
        setLed(i, c[0], c[1], c[2]);
      }
      break;
    }

    case 76: { // Meteor
      const pos   = Math.floor(t * sx / 3000) % N;
      const trail = Math.max(2, Math.floor(ix / 8));
      for (let i = 0; i < N * 3; i++) leds[i] = Math.max(0, leds[i] - 20);
      for (let j = 0; j < trail; j++) {
        const idx = ((pos - j) + N * 100) % N;
        const v   = 1 - j / trail;
        setLed(idx, r * v, g * v, b * v);
      }
      break;
    }

    case 77: { // Meteor Smooth
      const fpos  = (t * sx / 3000) % N;
      const trail = Math.max(3, Math.floor(ix / 6));
      fadeAll(240);
      for (let j = 0; j < trail; j++) {
        let fjpos = fpos - j;
        if (fjpos < 0) fjpos += N;
        const ipos = Math.floor(fjpos);
        const frac = fjpos - ipos;
        const v1   = (1 - j / trail) * (1 - frac);
        const v2   = (1 - j / trail) * frac;
        setLed(ipos,           r * v1, g * v1, b * v1);
        setLed((ipos + 1) % N, r * v2, g * v2, b * v2);
      }
      break;
    }

    case 79: { // Ripple
      const maxAge = Math.max(40, 255 - sx);
      fadeAll(220);
      if (state.ripAge >= maxAge) {
        state.ripCenter = hash(tick * 31 + 1) % N;
        state.ripAge    = 0;
      }
      const v      = 1 - state.ripAge / maxAge;
      const spread = Math.round(state.ripAge * N / (maxAge * 2));
      for (const side of [-1, 1]) {
        const idx = state.ripCenter + side * spread;
        if (idx >= 0 && idx < N) {
          leds[idx*3]   = Math.min(255, leds[idx*3]   + r * v);
          leds[idx*3+1] = Math.min(255, leds[idx*3+1] + g * v);
          leds[idx*3+2] = Math.min(255, leds[idx*3+2] + b * v);
        }
      }
      state.ripAge++;
      break;
    }

    case 88: { // Colorwaves
      const sHue = Math.floor(sx * t / 1000) & 0xff;
      for (let i = 0; i < N; i++) {
        const pos = (sHue + Math.floor(ix * i / N)) & 0xff;
        const c   = colorwavesPalette(pos);
        setLed(i, c[0], c[1], c[2]);
      }
      break;
    }

    case 90: { // BPM (party palette pulse)
      const bpm8 = Math.floor(sx / 4) + 10;
      const beat = Math.round(64 + ((Math.sin(t * bpm8 / 60000 * Math.PI * 2) + 1) / 2) * 191);
      for (let i = 0; i < N; i++) {
        const c   = partyPalette((Math.floor(t / 16) + i * 2) & 0xff);
        const dim = Math.max(0, beat - i * 10) / 255;
        setLed(i, c[0] * dim, c[1] * dim, c[2] * dim);
      }
      break;
    }

    case 91: { // Fill Noise8 (ocean perlin approximation)
      const x = Math.floor(t * sx / 200);
      for (let i = 0; i < N; i++) {
        const noise = ((Math.sin((x + i * 16) * 0.01) + Math.sin((t / 4) * 0.003 + i * 0.1)) / 2 + 1) / 2;
        const c     = colorwavesPalette(Math.floor(noise * 240));
        setLed(i, c[0], c[1], c[2]);
      }
      break;
    }

    case 100: { // Sunrise
      const cycle = Math.max(10000, 60000 - sx * 230);
      const phase = ((t % cycle) / cycle) * 255;
      const c     = sunrisePalette(phase);
      fillSolid(c[0], c[1], c[2]);
      break;
    }

    case 109: // Twinklefox Rainbow
    case 110: { // Twinklefox Party
      const palFn = fx === 110 ? partyPalette : (p: number) => colorWheel(p);
      const clock32 = t * (Math.floor(sx / 8) + 1);
      let prng16 = 2048;
      for (let i = 0; i < N; i++) {
        prng16 = ((prng16 * 2053) + 1384) & 0xffff;
        const myOffset = (prng16 >> 8) + (~prng16 & 0x00ff);
        const myTime   = (clock32 + myOffset) & 0xffff;
        const myTri    = triwave8((myTime >> 4) & 0xff);
        const myBright = myTri < 86 ? myTri * 3 : 255 - ((myTri - 86) + ((myTri - 86) >> 1));
        const hue8     = prng16 >> 8;
        const c        = palFn(hue8);
        const dim      = myBright / 255;
        setLed(i, c[0] * dim, c[1] * dim, c[2] * dim);
      }
      break;
    }

    case 112: { // Heartbeat (lub-dub pulse)
      const bpm   = 40 + sx * 100 / 255;
      const phase = ((t / 1000) * bpm / 60) % 1;
      const p1    = Math.exp(-((phase - 0.15) * 60) ** 2);
      const p2    = Math.exp(-((phase - 0.30) * 80) ** 2) * 0.6;
      const pulse = Math.max(p1, p2);
      fillSolid(r * pulse, g * pulse, b * pulse);
      break;
    }

    case 116: { // Candle
      for (let i = 0; i < N; i++) {
        const flicker = hash(i * 997 + tick * 7 + 1) % 80;
        const base    = Math.max(0, 1 - flicker / 255);
        const heatIdx = Math.round(base * 255);
        const rv      = Math.min(255, heatIdx + 40);
        const gv      = Math.round(heatIdx * 60 / 255);
        setLed(i, rv, gv, 0);
      }
      // Blend adjacent for smooth look
      for (let i = 1; i < N - 1; i++) {
        leds[i*3]   = Math.floor(leds[(i-1)*3] / 4   + leds[i*3] / 2   + leds[(i+1)*3] / 4);
        leds[i*3+1] = Math.floor(leds[(i-1)*3+1] / 4 + leds[i*3+1] / 2 + leds[(i+1)*3+1] / 4);
      }
      break;
    }

    case 117: { // Starburst
      fadeAll(200);
      if (t >= state.burstNext) {
        state.burstNext = t + Math.max(200, 600 - sx * 2);
        const hue    = hash(tick * 31 + 1) & 0xff;
        const center = hash(tick * 37 + 1) % N;
        const nsp    = Math.max(4, Math.floor(ix / 16));
        for (let i = 0; i < nsp; i++) {
          const spd = (hash(i * 13 + tick + 1) % 40 + 10) / 10 * (hash(i * 7 + tick + 1) % 2 === 0 ? 1 : -1);
          state.sparks.push({ pos: center, vel: spd, hue, life: 255 });
        }
      }
      const alive: typeof state.sparks = [];
      for (const sp of state.sparks) {
        sp.pos  += sp.vel;
        sp.vel  *= 0.93;
        sp.life  = qsub8(sp.life, 12);
        if (sp.life > 0 && sp.pos >= 0 && sp.pos < N) {
          const idx = Math.floor(sp.pos);
          const c   = colorWheel(sp.hue);
          const v   = sp.life / 255;
          leds[idx*3]   = Math.min(255, leds[idx*3]   + c[0] * v);
          leds[idx*3+1] = Math.min(255, leds[idx*3+1] + c[1] * v);
          leds[idx*3+2] = Math.min(255, leds[idx*3+2] + c[2] * v);
          alive.push(sp);
        }
      }
      state.sparks = alive;
      break;
    }

    case 126: { // Pacifica (ocean waves — 4 layers)
      const sf = 1 + Math.floor(sx / 32);
      const sA = Math.floor(t * sf / 8)  & 0xffff;
      const sB = Math.floor(t * sf / 16) & 0xffff;
      const sC = Math.floor(t * sf / 32) & 0xffff;
      const sD = Math.floor(t * sf / 64) & 0xffff;
      fillSolid(2, 6, 10); // deep water base
      const addWave = (ciStart: number, waveScale: number, bri: number) => {
        let ci = ciStart;
        for (let i = 0; i < N; i++) {
          ci += waveScale;
          const sIndex = Math.floor(((Math.sin(ci * Math.PI / 32768) + 1) / 2) * 240);
          const c = colorwavesPalette(sIndex);
          const d = bri / 255;
          leds[i*3]   = Math.min(255, leds[i*3]   + c[0] * d);
          leds[i*3+1] = Math.min(255, leds[i*3+1] + c[1] * d);
          leds[i*3+2] = Math.min(255, leds[i*3+2] + c[2] * d);
        }
      };
      addWave(sA, Math.floor(11 * 256 / N), 170);
      addWave(sB, Math.floor(7  * 256 / N), 160);
      addWave(sC, Math.floor(5  * 256 / N), 130);
      addWave(sD, Math.floor(16 * 256 / N), 120);
      break;
    }
  }

  return Array.from({ length: N }, (_, i) =>
    toHex(leds[i*3], leds[i*3+1], leds[i*3+2]),
  );
}

// ── Effect name lookup ────────────────────────────────────────────────────────
const FX_NAMES: Record<number, string> = {
  0: "Solid", 1: "Blink", 2: "Breathe", 3: "Color Wipe", 4: "Wipe Random",
  5: "Wipe Reversed", 8: "Color Loop", 9: "Rainbow", 10: "Fade",
  11: "Scanner", 12: "Strobe", 13: "Strobe Rainbow", 16: "Running Lights",
  17: "Twinkle", 18: "Twinkle Random", 19: "Twinkle Fade", 21: "Dissolve",
  25: "Comet", 28: "Chase Rainbow", 35: "Colorful", 38: "Juggle",
  40: "Sparkle", 41: "Sparkle Dark", 42: "Fireworks", 44: "Fireworks 1D",
  45: "Rain", 51: "Scanner Dual", 53: "Bouncing Balls", 57: "Lightning",
  65: "Halloween Eyes", 66: "Fire", 67: "Fire Flicker", 68: "Gradient",
  76: "Meteor", 77: "Meteor Smooth", 79: "Ripple", 88: "Colorwaves",
  90: "BPM", 91: "Fill Noise", 100: "Sunrise", 109: "Twinklefox",
  110: "Twinklefox Party", 112: "Heartbeat", 116: "Candle", 117: "Starburst",
  126: "Pacifica",
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
  const tickRef  = useRef(0);
  const stateRef = useRef<EffectState | null>(null);

  const animate = useCallback(() => {
    if (!preset) return;
    if (!stateRef.current) stateRef.current = makeState();
    tickRef.current += 1;
    const next = computeColors(
      tickRef.current,
      preset.wled_fx ?? 0,
      (preset.color as [number, number, number] | undefined) ?? baseRgb,
      preset.sx  ?? 128,
      preset.ix  ?? 128,
      stateRef.current,
    );
    setColors(next);
  }, [preset, baseRgb]);

  useEffect(() => {
    if (!visible) return;
    tickRef.current  = 0;
    stateRef.current = null; // reset state on each open
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
            <View style={s.svgBg}>
              <Svg width={SVG_W} height={SVG_H}>
                {/* Guide lines */}
                <Line x1={PAD} y1={PAD} x2={PAD} y2={SVG_H-PAD} stroke="rgba(255,255,255,0.05)" strokeWidth={4} strokeLinecap="round" />
                <Line x1={PAD} y1={PAD} x2={SVG_W-PAD} y2={PAD}  stroke="rgba(255,255,255,0.05)" strokeWidth={4} strokeLinecap="round" />
                <Line x1={SVG_W-PAD} y1={PAD} x2={SVG_W-PAD} y2={SVG_H-PAD} stroke="rgba(255,255,255,0.05)" strokeWidth={4} strokeLinecap="round" />

                {/* Continuous LED strip */}
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
                {/* Cap last LED */}
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
  svgWrap: { alignItems: "center", paddingHorizontal: 0 },
  svgBg: {
    backgroundColor: "#020209",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    width: "100%",
    alignItems: "center",
  },
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
