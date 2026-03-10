import { Stack } from "expo-router";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../src/context/AuthContext";
import { LanguageProvider } from "../src/context/LanguageContext";
import { SubscriptionProvider } from "../src/billing/SubscriptionContext";
import { HubProvider } from "../src/context/HubContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <HubProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </HubProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
