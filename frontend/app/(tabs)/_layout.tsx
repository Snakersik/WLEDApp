import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useLanguage } from "../../src/context/LanguageContext";
import { useAuth } from "../../src/context/AuthContext";
import { C } from "../../src/ui/theme";

// Floating glass tab bar height + bottom offset
const TAB_H   = 68;
const TAB_BOT = 20;
export const TAB_SAFE_BOTTOM = TAB_H + TAB_BOT + 8; // padding for screens

function TabBackground() {
  return (
    <BlurView
      tint="dark"
      intensity={75}
      style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: "hidden" }]}
    >
      {/* Subtle inner glow at top edge */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 24,
          right: 24,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.12)",
        }}
      />
    </BlurView>
  );
}

export default function TabsLayout() {
  const { t } = useLanguage();
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!token) router.replace("/(auth)/login");
  }, [token, loading]);

  if (loading || !token) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // ── Floating pill tab bar ───────────────────────────────
        tabBarStyle: {
          position: "absolute",
          bottom: TAB_BOT,
          left: 16,
          right: 16,
          height: TAB_H,
          borderRadius: 28,
          backgroundColor:
            Platform.OS === "ios"
              ? "rgba(7,7,26,0.55)"
              : "rgba(7,7,26,0.96)",
          borderWidth: 1,
          borderColor: C.borderMd,

          // iOS shadow
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.45,
          shadowRadius: 24,

          // Android elevation
          elevation: 24,
        },

        // Blur background (iOS only — Android uses solid)
        tabBarBackground: Platform.OS === "ios" ? () => <TabBackground /> : undefined,

        tabBarActiveTintColor:   C.primary2,
        tabBarInactiveTintColor: C.text3,

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.2,
          marginBottom: 6,
        },

        tabBarItemStyle: {
          paddingTop: 10,
        },

        // Screen background
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="devices"
        options={{
          title: t("devices") ?? "Lights",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.iconActive : styles.iconInactive}>
              <Ionicons
                name={focused ? "bulb" : "bulb-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: t("groups") ?? "Groups",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.iconActive : styles.iconInactive}>
              <Ionicons
                name={focused ? "layers" : "layers-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: t("schedules") ?? "Schedule",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.iconActive : styles.iconInactive}>
              <Ionicons
                name={focused ? "time" : "time-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="hubs"
        options={{
          title: "Hub",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.iconActive : styles.iconInactive}>
              <Ionicons
                name={focused ? "hardware-chip" : "hardware-chip-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile") ?? "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.iconActive : styles.iconInactive}>
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={22}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconActive: {
    width: 36,
    height: 30,
    borderRadius: 12,
    backgroundColor: "rgba(99,102,241,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconInactive: {
    width: 36,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
