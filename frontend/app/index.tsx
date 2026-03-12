import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';


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
    if (!user?.id) { router.replace('/onboarding'); return; }
    const flagKey = `onboarding_completed_${user.id}`;
    let onboardingDone = false;
    try { onboardingDone = (await AsyncStorage.getItem(flagKey)) === '1'; } catch {}
    router.replace(onboardingDone ? '/(tabs)/devices' : '/onboarding');
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
