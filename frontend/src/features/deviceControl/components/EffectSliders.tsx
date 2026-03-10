// src/features/deviceControl/components/EffectSliders.tsx
import React from "react";
import { Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";

import { styles } from "../styles";

export function EffectSliders(props: {
  speed: number;
  intensity: number;
  controlling: boolean;
  isOnline: boolean;
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
    onSpeedChange,
    onSpeedComplete,
    onIntensityChange,
    onIntensityComplete,
  } = props;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Effect Controls</Text>

      <View style={styles.pickerCard}>
        <Text style={styles.subLabel}>
          Speed: <Text style={styles.subValue}>{Math.round(speed)}</Text>
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
          Intensity: <Text style={styles.subValue}>{Math.round(intensity)}</Text>
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
