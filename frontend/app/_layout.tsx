import { Stack } from 'expo-router';
import React from 'react';
import { AuthProvider } from '../src/context/AuthContext';
import { LanguageProvider } from '../src/context/LanguageContext';

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/register" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthProvider>
    </LanguageProvider>
  );
}
