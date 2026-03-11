import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '') + '/api';

export default function Index() {
  const { user, token, loading } = useAuth() as any;
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    checkAndRoute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  async function checkAndRoute() {
    // If user explicitly completed or skipped onboarding, go straight to tabs
    let onboardingDone = false;
    try {
      onboardingDone = (await AsyncStorage.getItem('onboarding_completed')) === '1';
    } catch {}

    if (onboardingDone) {
      router.replace('/(tabs)/devices');
      return;
    }

    // Check if user already has a hub in backend
    try {
      const res = await fetch(`${API_URL}/hubs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('not ok');
      const hubs = await res.json();
      if (Array.isArray(hubs) && hubs.length > 0) {
        // Has a hub — mark done and go to tabs
        await AsyncStorage.setItem('onboarding_completed', '1').catch(() => {});
        router.replace('/(tabs)/devices');
      } else {
        router.replace('/onboarding');
      }
    } catch {
      // Backend unreachable and no completion flag → show onboarding
      router.replace('/onboarding');
    }
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
