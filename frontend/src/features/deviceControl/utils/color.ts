// src/features/deviceControl/utils/color.ts

export function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;

  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map(clamp255);
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/**
 * ✅ Reanimated Color Picker payload parser
 * (żeby nie było: rgbFromPickerPayload is not a function)
 *
 * Działa z payload.hex (najczęściej), payload.rgb oraz payload.rgba.
 */
export function rgbFromPickerPayload(payload: any): [number, number, number] {
  if (!payload) return [255, 0, 0];

  // 1) najczęściej: { hex: "#RRGGBB" }
  const hex = payload?.hex;
  if (typeof hex === "string" && hex.length >= 4) {
    return hexToRgb(hex);
  }

  // 2) czasem: { rgb: { r,g,b } }
  const rgbObj = payload?.rgb;
  if (
    rgbObj &&
    typeof rgbObj.r === "number" &&
    typeof rgbObj.g === "number" &&
    typeof rgbObj.b === "number"
  ) {
    return [clamp255(rgbObj.r), clamp255(rgbObj.g), clamp255(rgbObj.b)];
  }

  // 3) czasem: { rgba: { r,g,b,a } }
  const rgbaObj = payload?.rgba;
  if (
    rgbaObj &&
    typeof rgbaObj.r === "number" &&
    typeof rgbaObj.g === "number" &&
    typeof rgbaObj.b === "number"
  ) {
    return [clamp255(rgbaObj.r), clamp255(rgbaObj.g), clamp255(rgbaObj.b)];
  }

  return [255, 0, 0];
}

/**
 * sRGB gamma helpers.
 *
 * Uwaga: WLED ma własne gamma tables / korekcję w firmware,
 * a dodatkowo sam LED-strip “zjada” kolory.
 * To narzędzie da Ci możliwość “dopalenia”/dopasowania w UI.
 */
function srgbToLinear(v01: number): number {
  return v01 <= 0.04045 ? v01 / 12.92 : Math.pow((v01 + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v01: number): number {
  return v01 <= 0.0031308
    ? 12.92 * v01
    : 1.055 * Math.pow(v01, 1 / 2.4) - 0.055;
}

/**
 * ✅ “WLED look” booster (opcjonalnie):
 * - podbija “żywość” przez delikatne zwiększenie saturacji + gamma feel.
 *
 * strength: 0..1 (0 = off)
 */
export function boostVibrance(
  rgb: [number, number, number],
  strength: number = 0.18,
): [number, number, number] {
  const s = Math.max(0, Math.min(1, strength));
  if (s === 0) return rgb;

  // prosty “saturation boost” w linear space:
  // konwertujemy do linear 0..1
  const rL = srgbToLinear(clamp255(rgb[0]) / 255);
  const gL = srgbToLinear(clamp255(rgb[1]) / 255);
  const bL = srgbToLinear(clamp255(rgb[2]) / 255);

  // luminancja (linear)
  const y = 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;

  const r2 = y + (rL - y) * (1 + s);
  const g2 = y + (gL - y) * (1 + s);
  const b2 = y + (bL - y) * (1 + s);

  // back to sRGB
  return [
    clamp255(linearToSrgb(Math.max(0, Math.min(1, r2))) * 255),
    clamp255(linearToSrgb(Math.max(0, Math.min(1, g2))) * 255),
    clamp255(linearToSrgb(Math.max(0, Math.min(1, b2))) * 255),
  ];
}

function kelvinToRgb(kelvin: number): [number, number, number] {
  const k = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r: number, g: number, b: number;

  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }

  return [clamp255(r), clamp255(g), clamp255(b)];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * ✅ WLED-like temperature (stabilne, bez “odwracania” kolorów):
 * - zamiast mieszać bazę z “tint kolorem”, robimy “white balance” jako
 *   mnożenie kanałów przez korekcję z Kelvina (jak WLED colorBalanceFromKelvin).
 *
 * temp: -100..100
 *  0   => ~6500K neutral
 *  >0  => warm (w dół do ~2000K)
 *  <0  => cool (w górę do ~9000K)
 */
export function applyTemperatureTint(
  baseRgb: [number, number, number],
  temp: number,
): [number, number, number] {
  const t = Math.max(-100, Math.min(100, temp));
  if (t === 0) return baseRgb;

  const kelvin =
    t > 0 ? lerp(6500, 2000, t / 100) : lerp(6500, 9000, Math.abs(t) / 100);

  const corr = kelvinToRgb(kelvin);

  // full correction like WLED: channel = corr * channel / 255
  const full: [number, number, number] = [
    clamp255((corr[0] * baseRgb[0]) / 255),
    clamp255((corr[1] * baseRgb[1]) / 255),
    clamp255((corr[2] * baseRgb[2]) / 255),
  ];

  // siła korekcji (tweak). 0.55 daje fajny efekt bez “brudzenia” barw.
  const strength = (Math.abs(t) / 100) * 0.55;

  return [
    clamp255(lerp(baseRgb[0], full[0], strength)),
    clamp255(lerp(baseRgb[1], full[1], strength)),
    clamp255(lerp(baseRgb[2], full[2], strength)),
  ];
}
