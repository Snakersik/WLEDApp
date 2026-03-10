// src/features/deviceControl/types.ts

export interface Device {
  id: string;
  name: string;
  ip_address: string;
  led_count: number;
  is_online: boolean;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  is_premium: boolean;
  pack_id?: string | null;

  effect_id?: number;
  speed?: number;
  intensity?: number;
  palette?: number;

  palette_size?: number;
  palette_default?: number[][];

  color_locked?: boolean;  // true = hub ignores col (fire, rainbow) — hide color picker
  category?: string;

  // WLED / hub fields (from backend)
  wled_fx?: number;
  sx?: number;
  ix?: number;
  bri?: number;
  color?: number[];
}

export type WLEDState = {
  on?: boolean;
  bri?: number;
  seg?: { col?: [number, number, number, number?][] }[];
};

export type ModalMode = "power" | "sleep";
export type SleepData = { targetTs: number };

export type NightSnapshot = {
  isOn: boolean;
  brightness: number;
  baseHex: string;
  baseRgb: [number, number, number];
  temperature: number;
};
