// src/features/deviceControl/usePaletteControl.ts
import { useCallback, useEffect, useMemo, useState } from "react";

export type RGB = [number, number, number];

function clamp255(x: any) {
  const n = Math.round(Number(x) || 0);
  return Math.max(0, Math.min(255, n));
}

function safeRgb(v: any): RGB {
  if (!Array.isArray(v) || v.length < 3) return [0, 0, 0];
  return [clamp255(v[0]), clamp255(v[1]), clamp255(v[2])];
}

export function usePaletteControl(
  cfg: {
    selectedPreset?: string | null;
    presets?: Array<any>;
    defaultPaletteSize?: number;
    defaultPalette?: RGB[];
  } = {}, // ✅ kluczowe: cfg nigdy nie będzie undefined
) {
  const selectedPreset = cfg.selectedPreset ?? null;
  const presets = cfg.presets ?? [];

  const fallbackSize = Math.max(
    1,
    Math.min(16, Math.round(cfg.defaultPaletteSize ?? 1)),
  );

  const paletteSize = useMemo(() => {
    if (!selectedPreset) return fallbackSize;

    const p = presets.find((x) => x?.id === selectedPreset);
    const ps = Number(p?.palette_size);

    if (Number.isFinite(ps) && ps >= 1) {
      return Math.max(1, Math.min(16, Math.round(ps)));
    }

    return fallbackSize;
  }, [selectedPreset, presets, fallbackSize]);

  const [palette, setPalette] = useState<RGB[]>(() => {
    const init = cfg.defaultPalette?.length ? cfg.defaultPalette : undefined;
    if (init) return init.map(safeRgb).slice(0, 16);
    return Array.from({ length: fallbackSize }, () => [0, 0, 0] as RGB);
  });

  const [paletteSlot, _setPaletteSlot] = useState(0);

  useEffect(() => {
    setPalette((prev) => {
      const next = prev.map(safeRgb).slice(0, 16);
      while (next.length < paletteSize) next.push([0, 0, 0]);
      return next.slice(0, paletteSize);
    });

    _setPaletteSlot((s) => Math.max(0, Math.min(paletteSize - 1, s)));
  }, [paletteSize]);

  const pickSlot = useCallback(
    (slot: number) => {
      const s = Math.max(0, Math.min(paletteSize - 1, Math.round(slot)));
      _setPaletteSlot(s);
    },
    [paletteSize],
  );

  const setSlotColor = useCallback(
    (slot: number, rgb: RGB) => {
      const s = Math.max(0, Math.min(paletteSize - 1, Math.round(slot)));
      const col = safeRgb(rgb);

      setPalette((prev) => {
        const next = prev.slice();
        while (next.length < paletteSize) next.push([0, 0, 0]);
        next[s] = col;
        return next;
      });
    },
    [paletteSize],
  );

  const initPalette = useCallback((colors: RGB[]) => {
    if (!colors.length) return;
    setPalette(colors.slice(0, 16).map(safeRgb));
    _setPaletteSlot(0);
  }, []);

  const visible = paletteSize > 1;

  return { visible, paletteSize, palette, paletteSlot, pickSlot, setSlotColor, initPalette };
}
