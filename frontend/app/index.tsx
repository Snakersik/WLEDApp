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
    // If onboarding already completed locally, go straight to tabs
    try {
      const done = await AsyncStorage.getItem('onboarding_completed');
      if (done === '1') {
        router.replace('/(tabs)/devices');
        return;
      }
    } catch {}

    // Check if user already has a hub in backend
    try {
      const res = await fetch(`${API_URL}/hubs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hubs = await res.json();
      if (Array.isArray(hubs) && hubs.length > 0) {
        router.replace('/(tabs)/devices');
      } else {
        router.replace('/onboarding');
      }
    } catch {
      // Network error or backend down — don't block user, go to tabs
      router.replace('/(tabs)/devices');
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
