import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.1.83:8002") + "/api";

interface User {
  id: string;
  email: string;
  name: string;
  has_subscription: boolean;
  created_at: string;

  // ✅ NEW: mapa triali packów: { "christmas": "2026-02-16T12:34:56Z" }
  pro_trials?: Record<string, string>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  upgradeSubscription: () => Promise<void>;

  // ✅ NEW
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem("token");
      const storedUser = await AsyncStorage.getItem("user");

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to load auth:", error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: refresh user from backend + persist
  const refreshMe = async () => {
    if (!token) return;
    const res = await axios.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const freshUser = res.data as User;
    setUser(freshUser);
    await AsyncStorage.setItem("user", JSON.stringify(freshUser));
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });
      const { access_token, user: userData } = response.data;

      await AsyncStorage.setItem("token", access_token);
      await AsyncStorage.setItem("user", JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || "Login failed");
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        name,
      });
      const { access_token, user: userData } = response.data;

      await AsyncStorage.setItem("token", access_token);
      await AsyncStorage.setItem("user", JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || "Registration failed");
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem("token");
    await AsyncStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  const upgradeSubscription = async () => {
    try {
      await axios.post(
        `${API_URL}/auth/upgrade-subscription`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // Update user in state + persist
      if (user) {
        const updatedUser = { ...user, has_subscription: true };
        setUser(updatedUser);
        await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
      } else {
        // jakby user był null (edge case) to dociągnij
        await refreshMe();
      }
    } catch (error: any) {
      throw new Error(
        error.response?.data?.detail || "Subscription upgrade failed",
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        upgradeSubscription,
        refreshMe, // ✅ wystawione
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
