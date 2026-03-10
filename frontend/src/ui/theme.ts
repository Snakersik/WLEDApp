// src/ui/theme.ts — Single source of truth for design tokens
// Premium dark glassmorphism · OLED-first · Indigo/Purple accent

export const C = {
  // ── Backgrounds ───────────────────────────────────────────────
  bgDeep:    '#04040C',   // deepest OLED black
  bg:        '#07071A',   // main screen background
  bgCard:    'rgba(255,255,255,0.045)', // glass card fill
  bgCard2:   'rgba(255,255,255,0.07)',  // elevated glass
  bgInput:   'rgba(255,255,255,0.05)',  // input background
  bgOverlay: 'rgba(4,4,12,0.82)',       // modal backdrop

  // ── Borders ───────────────────────────────────────────────────
  border:    'rgba(255,255,255,0.08)',
  borderMd:  'rgba(255,255,255,0.12)',
  borderLg:  'rgba(255,255,255,0.18)',

  // ── Text ──────────────────────────────────────────────────────
  text:      '#F1F5F9',    // primary
  text2:     '#94A3B8',    // secondary
  text3:     '#475569',    // muted

  // ── Brand ─────────────────────────────────────────────────────
  primary:   '#6366F1',    // indigo
  primary2:  '#818CF8',    // indigo light
  purple:    '#8B5CF6',
  purpleGlow:'rgba(139,92,246,0.25)',
  primaryGlow:'rgba(99,102,241,0.3)',

  // ── Status ────────────────────────────────────────────────────
  green:     '#10B981',
  greenGlow: 'rgba(16,185,129,0.2)',
  amber:     '#F59E0B',
  amberGlow: 'rgba(245,158,11,0.18)',
  red:       '#EF4444',
  redGlow:   'rgba(239,68,68,0.2)',
} as const;

export const R = {
  xs:  8,
  sm:  12,
  md:  16,
  lg:  20,
  xl:  24,
  xxl: 32,
  pill: 999,
} as const;

export const F = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  24,
  xxxl: 28,
} as const;
