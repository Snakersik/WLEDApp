import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";

export default function AuthLayout() {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (token) router.replace("/(tabs)/devices");
  }, [token, loading]);

  if (loading) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}
