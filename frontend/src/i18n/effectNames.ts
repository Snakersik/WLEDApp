// Maps English effect name (as stored in DB/hub) → translation key
const EFFECT_NAME_MAP: Record<string, string> = {
  "Solid":                "fxSolid",
  "Solid Color":          "fxSolid",
  "Blink":                "fxBlink",
  "Breathe":              "fxBreathe",
  "Color Wipe":           "fxColorWipe",
  "Wipe Random":          "fxWipeRandom",
  "Color Wipe Reversed":  "fxColorWipeReversed",
  "Color Loop":           "fxColorLoop",
  "Rainbow":              "fxRainbow",
  "Fade":                 "fxFade",
  "Larson Scanner":       "fxLarsonScanner",
  "Knight Rider":         "fxLarsonScanner",
  "Larson Scanner (Knight Rider)": "fxLarsonScanner",
  "Strobe":               "fxStrobe",
  "Strobe Rainbow":       "fxStrobeRainbow",
  "Running Lights":       "fxRunningLights",
  "Twinkle":              "fxTwinkle",
  "Twinkle Random":       "fxTwinkleRandom",
  "Twinkle Fade":         "fxTwinkleFade",
  "Dissolve":             "fxDissolve",
  "Comet":                "fxComet",
  "Chase Rainbow":        "fxChaseRainbow",
  "Colorful":             "fxColorful",
  "Juggle":               "fxJuggle",
  "Sparkle":              "fxSparkle",
  "Sparkle Dark":         "fxSparkleDark",
  "Fireworks":            "fxFireworks",
  "Fireworks 1D":         "fxFireworks1D",
  "Rain":                 "fxRain",
  "Scanner Dual":         "fxScannerDual",
  "Bouncing Balls":       "fxBouncingBalls",
  "Lightning":            "fxLightning",
  "Halloween Eyes":       "fxHalloweenEyes",
  "Fire2012":             "fxFire2012",
  "Fire Flicker":         "fxFireFlicker",
  "Gradient":             "fxGradient",
  "Meteor":               "fxMeteor",
  "Ripple":               "fxRipple",
  "Colorwaves":           "fxColorwaves",
  "BPM":                  "fxBPM",
  "Fill Noise8":          "fxFillNoise8",
  "Sunrise":              "fxSunrise",
  "Sunrise / Sunset":     "fxSunrise",
  "Sunset":               "fxSunrise",
  "Twinklefox":           "fxTwinklefox",
  "Heartbeat":            "fxHeartbeat",
  "Candle":               "fxCandle",
  "Starburst":            "fxStarburst",
  "Pacifica":             "fxPacifica",
  "Theater Chase":        "fxTheaterChase",
  "Scanner":              "fxScanner",
  "Plasma":               "fxPlasma",
  "Breathing":            "fxBreathe",
};

/**
 * Returns translated effect name. Falls back to original English name if no translation found.
 */
export function getEffectName(name: string, t: (key: string) => string): string {
  const key = EFFECT_NAME_MAP[name];
  if (!key) return name;
  const translated = t(key);
  // t() returns the key itself when translation is missing — fallback to original
  return translated === key ? name : translated;
}
