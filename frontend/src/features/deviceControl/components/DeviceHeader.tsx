// src/features/deviceControl/components/DeviceHeader.tsx
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "../types";
import { C } from "../../../ui/theme";

interface Props {
  device:     Device | null;
  colorHex?:  string;          // current LED color → ambient glow
  isOn?:      boolean;
  onBack:     () => void;
  onLayout?:  (h: number) => void;
  t?:         (k: string) => string;
}

export function DeviceHeader({ device, colorHex = "#6366F1", isOn = true, onBack, onLayout, t }: Props) {
  // Fade-in ambient glow opacity when color changes
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(glowOpacity, {
      toValue: isOn ? 0.55 : 0.12,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [colorHex, isOn, glowOpacity]);

  const online = !!device?.is_online;

  return (
    <View
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
      style={s.wrapper}
    >
      {/* Ambient color glow behind header */}
      <Animated.View
        pointerEvents="none"
        style={[
          s.glow,
          { backgroundColor: colorHex, opacity: glowOpacity },
        ]}
      />

      {/* Top row: back + title + placeholder */}
      <View style={s.row}>
        <TouchableOpacity
          onPress={onBack}
          style={s.backBtn}
          hitSlop={10}
          activeOpacity={0.7}
        >
          <View style={s.backCircle}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </View>
        </TouchableOpacity>

        <View style={s.center}>
          {/* Color dot */}
          <View style={[s.colorDot, { backgroundColor: colorHex, opacity: isOn ? 1 : 0.35 }]} />
          <Text style={s.name} numberOfLines={1}>{device?.name ?? "—"}</Text>
        </View>

        {/* Status pill */}
        <View style={[s.statusPill, online ? s.pillOnline : s.pillOffline]}>
          <View style={[s.statusDot, online ? s.dotGreen : s.dotGray]} />
          <Text style={[s.statusTxt, online ? s.txtGreen : s.txtGray]}>
            {online ? (t?.("online") ?? "online") : (t?.("offline") ?? "offline")}
          </Text>
        </View>
      </View>

      {/* Subtitle: IP + LED count */}
      {device && (
        <View style={s.meta}>
          {device.ip_address ? (
            <Text style={s.metaTxt}>{device.ip_address}</Text>
          ) : null}
          {device.ip_address && device.led_count ? (
            <View style={s.dot3} />
          ) : null}
          {device.led_count ? (
            <Text style={s.metaTxt}>{device.led_count} LEDs</Text>
          ) : null}
        </View>
      )}

      {/* Bottom border line with glow */}
      <Animated.View style={[s.borderLine, { backgroundColor: colorHex, opacity: glowOpacity }]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: "hidden",
  },

  glow: {
    position: "absolute",
    top: -80, left: -40, right: -40,
    height: 180,
    borderRadius: 999,
    // blur simulated via large radius
    shadowColor: "#fff",
    shadowRadius: 60,
    shadowOpacity: 1,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  backBtn:   { padding: 2 },
  backCircle: {
    width: 38, height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  center: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  colorDot: {
    width: 10, height: 10,
    borderRadius: 5,
    shadowRadius: 6,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
  },
  name: {
    fontSize: 18,
    fontWeight: "800",
    color: C.text,
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 72,
    justifyContent: "center",
  },
  pillOnline:  { backgroundColor: C.greenGlow,  borderColor: "rgba(16,185,129,0.35)" },
  pillOffline: { backgroundColor: C.bgCard,      borderColor: C.border },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotGreen:  { backgroundColor: C.green },
  dotGray:   { backgroundColor: C.text3 },
  statusTxt: { fontSize: 11, fontWeight: "700" },
  txtGreen:  { color: C.green },
  txtGray:   { color: C.text3 },

  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  metaTxt: { color: C.text3, fontSize: 12, fontWeight: "600" },
  dot3: {
    width: 3, height: 3,
    borderRadius: 1.5,
    backgroundColor: C.text3,
  },

  borderLine: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: 1,
  },
});
