// src/features/deviceControl/components/ColorSection.tsx
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import ColorPicker, { Panel3 } from "reanimated-color-picker";

import { styles } from "../styles";

export function ColorSection(props: {
  title: string;

  baseHex: string;
  adjustedHex: string;
  adjustedRgb: [number, number, number];

  temperature: number;
  brightness: number;

  controlling: boolean;
  isOnline: boolean;

  /** true = algorithmic effect, hub ignores col — hide picker + temperature */
  colorLocked?: boolean;
  /** called when user taps "Reset colors" — only shown when not colorLocked */
  onResetColors?: () => void;

  onPickerChange: (payload: any) => void;
  onPickerComplete: (payload: any) => void;

  onTemperatureChange: (v: number) => void;
  onTemperatureComplete: () => void;

  onBrightnessChange: (v: number) => void;
  onBrightnessComplete: () => void;
}) {
  const {
    title,
    baseHex,
    adjustedHex,
    adjustedRgb,
    temperature,
    brightness,
    controlling,
    isOnline,
    colorLocked = false,
    onResetColors,
    onPickerChange,
    onPickerComplete,
    onTemperatureChange,
    onTemperatureComplete,
    onBrightnessChange,
    onBrightnessComplete,
  } = props;

  return (
    <View style={styles.section}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!colorLocked && onResetColors && (
          <TouchableOpacity
            onPress={onResetColors}
            disabled={controlling || !isOnline}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: (controlling || !isOnline) ? 0.4 : 1 }}
          >
            <Ionicons name="refresh-outline" size={15} color="#94a3b8" />
            <Text style={{ color: "#94a3b8", fontSize: 13 }}>Reset colors</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pickerCard}>
        {colorLocked ? (
          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <Ionicons name="lock-closed-outline" size={18} color="#64748b" />
            <Text style={{ color: "#64748b", fontSize: 13, marginTop: 6, textAlign: "center" }}>
              Colors are generated automatically by this effect.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.pickerHeader}>
              <View
                style={[styles.colorPreviewDot, { backgroundColor: adjustedHex }]}
              />
              <Text style={styles.pickerHex}>{adjustedHex}</Text>
              <Text style={styles.pickerRgb}>
                {adjustedRgb[0]}, {adjustedRgb[1]}, {adjustedRgb[2]}
              </Text>
            </View>

            <ColorPicker
              value={baseHex}
              onChangeJS={onPickerChange}
              onCompleteJS={onPickerComplete}
              style={{ width: "100%", alignItems: "center" }}
            >
              <Panel3 style={{ width: 230, height: 230 }} />
            </ColorPicker>

            <View style={{ height: 18 }} />
            <Text style={styles.subLabel}>
              Temperature:{" "}
              <Text style={styles.subValue}>
                {temperature === 0 ? "neutral" : temperature > 0 ? "warm" : "cool"}{" "}
                ({temperature})
              </Text>
            </Text>

            <View style={styles.sliderRow}>
              <Ionicons name="snow-outline" size={18} color="#94a3b8" />
              <Slider
                style={styles.slider}
                minimumValue={-100}
                maximumValue={100}
                value={temperature}
                onValueChange={onTemperatureChange}
                onSlidingComplete={onTemperatureComplete}
                minimumTrackTintColor="#6366f1"
                maximumTrackTintColor="#334155"
                thumbTintColor="#6366f1"
                disabled={controlling || !isOnline}
              />
              <Ionicons name="flame-outline" size={18} color="#94a3b8" />
            </View>
          </>
        )}

        <View style={{ height: 18 }} />
        <Text style={styles.subLabel}>
          Brightness:{" "}
          <Text style={styles.subValue}>{Math.round(brightness)}</Text>
        </Text>

        <View style={styles.sliderRow}>
          <Ionicons name="sunny-outline" size={18} color="#94a3b8" />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={255}
            value={brightness}
            onValueChange={onBrightnessChange}
            onSlidingComplete={onBrightnessComplete}
            minimumTrackTintColor="#6366f1"
            maximumTrackTintColor="#334155"
            thumbTintColor="#6366f1"
            disabled={controlling || !isOnline}
          />
          <Text style={styles.rightValue}>{Math.round(brightness)}</Text>
        </View>
      </View>
    </View>
  );
}
