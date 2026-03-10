// src/features/deviceControl/PaletteSection.tsx
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";

import { rgbToHex } from "./utils/color"; // ✅ NIE z "./index"
import { styles } from "./styles";
import type { RGB } from "./usePaletteControl";

function clamp255(x: any) {
  const n = Math.round(Number(x) || 0);
  return Math.max(0, Math.min(255, n));
}

function safeRgb(v: any): RGB {
  if (!Array.isArray(v) || v.length < 3) return [0, 0, 0];
  return [clamp255(v[0]), clamp255(v[1]), clamp255(v[2])];
}

export function PaletteSection(props: {
  visible: boolean;
  paletteSize: number;
  palette?: RGB[];
  paletteSlot: number;
  disabled: boolean;
  title: string;
  onPickSlot: (slot: number) => void;
}) {
  const {
    visible,
    paletteSize,
    palette,
    paletteSlot,
    disabled,
    title,
    onPickSlot,
  } = props;

  const size = Math.max(0, Math.min(16, Math.round(paletteSize || 0)));

  const slots: RGB[] = useMemo(() => {
    const arr: RGB[] = [];
    for (let i = 0; i < size; i++) arr.push(safeRgb(palette?.[i]));
    return arr;
  }, [palette, size]);

  const safeSlot = Math.max(
    0,
    Math.min(size - 1, Math.round(paletteSlot || 0)),
  );

  if (!visible || size <= 1) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {slots.map((rgb, i) => {
          const hex = rgbToHex(rgb as any);
          const active = i === safeSlot;

          return (
            <TouchableOpacity
              key={`pal-${i}`}
              disabled={disabled}
              onPress={() => onPickSlot(i)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: hex,
                borderWidth: active ? 3 : 1,
                borderColor: active ? "#EAB308" : "rgba(255,255,255,0.18)",
                opacity: disabled ? 0.55 : 1,
              }}
            />
          );
        })}
      </View>

      {/* nie masz sectionHint, więc używamy istniejących stylów */}
      <Text style={[styles.subLabel, { marginTop: 10 }]}>
        Slot: <Text style={styles.subValue}>{safeSlot + 1}</Text>/{size}
      </Text>
    </View>
  );
}
