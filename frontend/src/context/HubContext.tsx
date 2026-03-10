import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useAuth } from "./AuthContext";

const HUB_IP_KEY = "hub_ip_cache";
const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.10.42:8002") + "/api";

interface HubContextValue {
  hubIp: string | null;
  hubLoading: boolean;
  refreshHub: () => Promise<void>;
}

const HubContext = createContext<HubContextValue>({
  hubIp: null,
  hubLoading: true,
  refreshHub: async () => {},
});

export function HubProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth() as any;
  const [hubIp, setHubIp] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(true);

  const refreshHub = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/hubs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hubs: any[] = res.data ?? [];
      const hub = hubs.find((h) => h.ip_address) ?? hubs[0];
      const ip: string | null = hub?.ip_address || null;
      setHubIp(ip);
      if (ip) await AsyncStorage.setItem(HUB_IP_KEY, ip);
    } catch {
      const cached = await AsyncStorage.getItem(HUB_IP_KEY);
      if (cached) setHubIp(cached);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setHubLoading(false);
      return;
    }
    (async () => {
      const cached = await AsyncStorage.getItem(HUB_IP_KEY);
      if (cached) setHubIp(cached);
      await refreshHub();
      setHubLoading(false);
    })();
  }, [token]);

  return (
    <HubContext.Provider value={{ hubIp, hubLoading, refreshHub }}>
      {children}
    </HubContext.Provider>
  );
}

export const useHub = () => useContext(HubContext);
