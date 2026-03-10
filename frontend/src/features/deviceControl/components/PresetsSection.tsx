// src/features/deviceControl/components/PresetsSection.tsx
import React, { useState, useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Preset } from "../types";
import { styles } from "../styles";
import { PresetPreviewModal } from "../../../components/PresetPreviewModal";
import { PRESET_COLOR_MAPPING, PRESET_COLORS } from "../constants";

const CATEGORY_ORDER = [
  "Ambient", "Dynamic", "Rainbow", "Nature", "Twinkle", "Party", "Special",
];

export function PresetsSection(props: {
  title: string;
  presets: Preset[];
  selectedPreset: string | null;
  controlling: boolean;
  isOnline: boolean;
  lockedFn:       (preset: Preset) => boolean;
  trialActiveFn:  (preset: Preset) => boolean;
  onSelect:       (preset: Preset) => void;
}) {
  const {
    presets, selectedPreset,
    controlling, isOnline,
    lockedFn, trialActiveFn, onSelect,
  } = props;

  const [previewPreset, setPreviewPreset] = useState<Preset | null>(null);

  const categories = useMemo(() => {
    const present = new Set(presets.map((p) => p.category ?? "Other"));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    if (present.has("Other")) ordered.push("Other");
    return ordered;
  }, [presets]);

  const [activeCategory, setActiveCategory] = useState<string>(() => categories[0] ?? "Ambient");

  const filtered = useMemo(
    () => presets.filter((p) => (p.category ?? "Other") === activeCategory),
    [presets, activeCategory],
  );

  return (
    <View style={styles.section}>
      {/* Category tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={tabBarContainer}
        contentContainerStyle={tabBarContent}
      >
        {categories.map((cat) => {
          const active = cat === activeCategory;
          return (
            <TouchableOpacity
              key={cat}
              style={[tabStyle, active && tabActiveStyle]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[tabText, active && tabTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.presetsGrid}>
        {filtered.map((preset) => {
          const locked     = lockedFn(preset);
          const isSelected = selectedPreset === preset.id;

          return (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.presetCard,
                isSelected && styles.presetCardSelected,
                locked && styles.presetCardLocked,
              ]}
              onPress={() => onSelect(preset)}
              disabled={controlling || !isOnline}
            >
              {/* Lock / trial badges (top-right) */}
              {locked && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={12} color="#f59e0b" />
                </View>
              )}
              {!locked && trialActiveFn(preset) && (
                <View style={styles.trialBadge}>
                  <Ionicons name="time" size={12} color="#a5b4fc" />
                </View>
              )}

              {/* Preview button (top-left, absolute) */}
              <TouchableOpacity
                style={previewBtnStyle}
                hitSlop={6}
                onPress={(e) => {
                  e.stopPropagation();
                  setPreviewPreset(preset);
                }}
              >
                <Ionicons name="eye-outline" size={14} color="#94A3B8" />
              </TouchableOpacity>

              {/* Card content */}
              <Ionicons
                name="color-palette"
                size={30}
                color={locked ? "#f59e0b" : isSelected ? "#6366f1" : "#818cf8"}
              />
              <Text
                style={[
                  styles.presetName,
                  isSelected && styles.presetNameSelected,
                ]}
              >
                {preset.name}
              </Text>

              {preset.pack_id ? (
                <Text style={styles.packLabel}>{preset.pack_id}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Preview modal */}
      <PresetPreviewModal
        visible={!!previewPreset}
        onClose={() => setPreviewPreset(null)}
        preset={previewPreset}
        baseRgb={
          previewPreset
            ? (PRESET_COLOR_MAPPING[previewPreset.id] ?? PRESET_COLORS[0]).rgb
            : [99, 102, 241]
        }
      />
    </View>
  );
}

const tabBarContainer = { marginBottom: 12 };

const tabBarContent = {
  paddingHorizontal: 2,
  gap: 8,
  flexDirection: "row" as const,
};

const tabStyle = {
  paddingHorizontal: 14,
  paddingVertical: 7,
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
};

const tabActiveStyle = {
  backgroundColor: "#6366f1",
  borderColor: "#6366f1",
};

const tabText = {
  fontSize: 13,
  fontWeight: "500" as const,
  color: "#94A3B8",
};

const tabTextActive = { color: "#ffffff" };

// Absolute-positioned eye button in the top-left corner of each card
const previewBtnStyle = {
  position: "absolute" as const,
  top: 8,
  left: 8,
  width: 28,
  height: 28,
  borderRadius: 9,
  backgroundColor: "rgba(255,255,255,0.09)",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  zIndex: 10,
};
