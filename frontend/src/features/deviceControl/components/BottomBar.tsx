// src/features/deviceControl/components/BottomBar.tsx
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../../ui/theme";

interface Props {
  isOnline:     boolean;
  controlling:  boolean;
  isOn:         boolean;
  hasSleep:     boolean;
  syncing:      boolean;
  isStreaming?: boolean;
  onPower:      () => void;
  onSleep:      () => void;
  onSync:       () => void;
  onStop?:      () => void;
  t?:           (k: string) => string;
}

function BarBtn({
  icon,
  iconFilled,
  label,
  active,
  activeColor,
  onPress,
  disabled,
  loading,
}: {
  icon:        string;
  iconFilled:  string;
  label:       string;
  active:      boolean;
  activeColor: string;
  onPress:     () => void;
  disabled:    boolean;
  loading?:    boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 8 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={press}
      disabled={disabled}
      activeOpacity={0.7}
      style={[s.btnWrap, disabled && { opacity: 0.4 }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={[s.iconCircle, active && { backgroundColor: activeColor + "28", borderColor: activeColor + "55" }]}>
          {loading ? (
            <ActivityIndicator size="small" color={active ? activeColor : C.text2} />
          ) : (
            <Ionicons
              name={(active ? iconFilled : icon) as any}
              size={22}
              color={active ? activeColor : C.text2}
            />
          )}
        </View>
      </Animated.View>
      <Text style={[s.label, active && { color: activeColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function BottomBar({
  isOnline, controlling, isOn, hasSleep, syncing, isStreaming,
  onPower, onSleep, onSync, onStop, t,
}: Props) {
  const disCtrl = controlling || !isOnline;
  const disSync = syncing     || !isOnline;

  // Pulse animation when actively controlling
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!controlling) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [controlling, pulseAnim]);

  const Inner = (
    <View style={s.row}>
      <BarBtn
        icon="alarm-outline"
        iconFilled="alarm"
        label={t?.("sleep") ?? "Sleep"}
        active={hasSleep}
        activeColor="#C084FC"
        onPress={onSleep}
        disabled={disCtrl}
      />

      {/* Center — big power ring */}
      <TouchableOpacity
        onPress={onPower}
        disabled={disCtrl}
        activeOpacity={0.8}
        style={[s.centerWrap, !isOnline && { opacity: 0.35 }]}
      >
        <Animated.View style={[s.centerBtn, { transform: [{ scale: pulseAnim }] },
          isOn && { shadowColor: C.primary, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10 }
        ]}>
          <View style={[s.centerInner, isOn ? s.centerOn : s.centerOff]}>
            <Ionicons name={isOn ? "power" : "power-outline"} size={26} color={isOn ? "#fff" : C.text2} />
          </View>
        </Animated.View>
        <Text style={[s.label, { marginTop: 6 }, isOn && { color: C.primary2 }]}>
          {isOn ? (t?.("on") ?? "On") : (t?.("off") ?? "Off")}
        </Text>
      </TouchableOpacity>

      {onStop ? (
        <BarBtn
          icon="stop-circle-outline"
          iconFilled="stop-circle"
          label={isStreaming ? "Stop" : "Stopped"}
          active={isStreaming ?? false}
          activeColor="#ef4444"
          onPress={onStop}
          disabled={controlling}
        />
      ) : (
        <BarBtn
          icon="sync-outline"
          iconFilled="sync"
          label={t?.("sync") ?? "Sync"}
          active={false}
          activeColor={C.green}
          onPress={onSync}
          disabled={disSync}
          loading={syncing}
        />
      )}
    </View>
  );

  return (
    <View style={s.container}>
      {Platform.OS === "ios" ? (
        <BlurView tint="dark" intensity={85} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.androidBg]} />
      )}
      {/* Top separator glow */}
      <View style={s.topLine} />
      {Inner}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.borderMd,
    overflow: "hidden",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    paddingHorizontal: 8,
  },
  androidBg: {
    backgroundColor: "rgba(7,7,26,0.97)",
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
  },
  topLine: {
    position: "absolute",
    top: 0, left: 48, right: 48,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingHorizontal: 4,
  },

  // Side buttons
  btnWrap:   { alignItems: "center", gap: 5, paddingHorizontal: 6, paddingTop: 6 },
  iconCircle: {
    width: 44, height: 44,
    borderRadius: 14,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: C.text3, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  // Center button
  centerWrap:  { alignItems: "center", marginBottom: -4 },
  centerBtn:   {
    width: 62, height: 62,
    borderRadius: 31,
    padding: 3,
    backgroundColor: "rgba(99,102,241,0.15)",
    borderWidth: 1.5,
    borderColor: C.border,
  },
  centerInner: {
    flex: 1,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  centerOn:  {
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  centerOff: { backgroundColor: "rgba(255,255,255,0.06)" },
});
