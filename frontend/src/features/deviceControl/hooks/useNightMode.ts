// src/features/deviceControl/hooks/useNightMode.ts
import { useRef, useState } from "react";
import { NightSnapshot } from "../types";
import { NIGHT_MODE_DEFAULTS } from "../constants";
import { applyTemperatureTint, rgbToHex } from "../utils/color";

export function useNightMode() {
  const [nightMode, setNightMode] = useState(false);
  const snapshotRef = useRef<NightSnapshot | null>(null);

  const buildNightState = () => {
    const nightTemp = NIGHT_MODE_DEFAULTS.temp;
    const nightBrightness = NIGHT_MODE_DEFAULTS.brightness;
    const nightBaseRgb = NIGHT_MODE_DEFAULTS.baseRgb;
    const adjusted = applyTemperatureTint(nightBaseRgb, nightTemp);

    return {
      nightTemp,
      nightBrightness,
      nightBaseRgb,
      nightBaseHex: rgbToHex(nightBaseRgb),
      adjusted,
    };
  };

  return { nightMode, setNightMode, snapshotRef, buildNightState };
}
