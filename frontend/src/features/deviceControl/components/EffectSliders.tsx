// src/features/deviceControl/components/EffectSliders.tsx
import React from "react";
import { Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";

import { styles } from "../styles";
import { useLanguage } from "../../../context/LanguageContext";

export function EffectSliders(props: {
  speed: number;
  intensity: number;
  controlling: boolean;
  isOnline: boolean;
  /** When provided, renders an "Active Effect" banner with the preset name */
  presetName?: string;
  onSpeedChange: (v: number) => void;
  onSpeedComplete: (v: number) => void;
  onIntensityChange: (v: number) => void;
  onIntensityComplete: (v: number) => void;
}) {
  const {
    speed,
    intensity,
    controlling,
    isOnline,
    presetName,
    onSpeedChange,
    onSpeedComplete,
    onIntensityChange,
    onIntensityComplete,
  } = props;

  const { t } = useLanguage();

  return (
    <View style={styles.section}>
      {/* Active effect banner */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
        <Text style={styles.sectionTitle}>{t("activeEffect")}</Text>
        {!!presetName && (
          <Text style={{ color: "#6366f1", fontSize: 13, fontWeight: "600", flexShrink: 1 }}>
            {presetName}
          </Text>
        )}
      </View>

      <View style={styles.pickerCard}>
        <Text style={styles.subLabel}>
          {t("speed")}: <Text style={styles.subValue}>{Math.round(speed)}</Text>
        </Text>
        <View style={styles.sliderRow}>
          <Ionicons name="turtle-outline" size={18} color="#94a3b8" />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={255}
            step={1}
            value={speed}
            onValueChange={onSpeedChange}
            onSlidingComplete={onSpeedComplete}
            minimumTrackTintColor="#6366f1"
            maximumTrackTintColor="#334155"
            thumbTintColor="#6366f1"
            disabled={controlling || !isOnline}
          />
          <Ionicons name="flash-outline" size={18} color="#94a3b8" />
        </View>

        <View style={{ height: 10 }} />

        <Text style={styles.subLabel}>
          {t("intensity")}: <Text style={styles.subValue}>{Math.round(intensity)}</Text>
        </Text>
        <View style={styles.sliderRow}>
          <Ionicons name="water-outline" size={18} color="#94a3b8" />
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={255}
            step={1}
            value={intensity}
            onValueChange={onIntensityChange}
            onSlidingComplete={onIntensityComplete}
            minimumTrackTintColor="#f59e0b"
            maximumTrackTintColor="#334155"
            thumbTintColor="#f59e0b"
            disabled={controlling || !isOnline}
          />
          <Ionicons name="flame-outline" size={18} color="#94a3b8" />
        </View>
      </View>
    </View>
  );
}
