import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import axios from "axios";
import { useAuth } from "../src/context/AuthContext";
import { useHub } from "../src/context/HubContext";

const HUB_AP_IP = "192.168.4.1";
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

type Step = "connect" | "configure" | "done";

export default function HubSetupScreen() {
  const router = useRouter();
  const { token } = useAuth() as any;
  const { refreshHub } = useHub();

  const [step, setStep] = useState<Step>("connect");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");

  // ── Step 1: verify phone is connected to DDP-Hub AP ──────────
  const checkApConnection = async () => {
    setChecking(true);
    try {
      const res = await fetch(`http://${HUB_AP_IP}/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        setStep("configure");
      } else {
        Alert.alert("Nie połączono", "Nie można dosięgnąć huba pod 192.168.4.1. Upewnij się że jesteś podłączony do sieci DDP-Hub.");
      }
    } catch {
      Alert.alert("Nie połączono", "Nie można dosięgnąć huba pod 192.168.4.1. Upewnij się że jesteś podłączony do sieci DDP-Hub.");
    } finally {
      setChecking(false);
    }
  };

  // ── Step 2: register hub in backend, then send WiFi config ───
  const sendWifiConfig = async () => {
    if (!ssid.trim()) {
      Alert.alert("Błąd", "Podaj nazwę sieci WiFi (SSID)");
      return;
    }
    setSending(true);
    try {
      // Register hub in backend → get hub_id + hub_secret
      const hubRes = await axios.post(
        `${API_URL}/hubs`,
        { name: "Mój Hub" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const { id: hub_id, hub_secret } = hubRes.data;

      // Send WiFi credentials + hub identity to hub AP
      const payload = {
        ssid: ssid.trim(),
        password: password,
        hub_id,
        hub_secret,
        backend_url: BACKEND_URL,
      };
      const apRes = await fetch(`http://${HUB_AP_IP}/wifi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!apRes.ok) throw new Error("Hub odrzucił konfigurację");

      setStep("done");
    } catch (e: any) {
      Alert.alert("Błąd", e?.message ?? "Nie udało się skonfigurować huba");
    } finally {
      setSending(false);
    }
  };

  const handleDone = async () => {
    // Refresh HubContext so the app picks up the new hub IP once hub checks in
    await refreshHub();
    router.back();
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={s.title}>Konfiguracja Huba</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ── Step indicator ─────────────────────────────────── */}
        <View style={s.steps}>
          {(["connect", "configure", "done"] as Step[]).map((st, i) => (
            <View key={st} style={s.stepRow}>
              <View style={[s.stepDot, step === st && s.stepDotActive,
                (step === "configure" && i === 0) || (step === "done" && i < 2)
                  ? s.stepDotDone : null]}>
                <Text style={s.stepDotText}>{i + 1}</Text>
              </View>
              {i < 2 && <View style={s.stepLine} />}
            </View>
          ))}
        </View>

        {/* ── STEP 1: Connect to DDP-Hub WiFi ────────────────── */}
        {step === "connect" && (
          <View style={s.card}>
            <Ionicons name="wifi-outline" size={48} color="#6366f1" style={s.icon} />
            <Text style={s.cardTitle}>Podłącz się do huba</Text>
            <Text style={s.cardText}>
              1. Otwórz ustawienia WiFi na telefonie{"\n"}
              2. Połącz się z siecią <Text style={s.bold}>DDP-Hub</Text>{"\n"}
              3. Wróć tutaj i kliknij "Sprawdź połączenie"
            </Text>
            <TouchableOpacity
              style={s.btn}
              onPress={checkApConnection}
              disabled={checking}
            >
              {checking
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Sprawdź połączenie</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Enter home WiFi credentials ────────────── */}
        {step === "configure" && (
          <View style={s.card}>
            <Ionicons name="home-outline" size={48} color="#6366f1" style={s.icon} />
            <Text style={s.cardTitle}>Podaj dane domowej sieci</Text>
            <Text style={s.cardText}>
              Hub połączy się z tą siecią i będzie dostępny lokalnie.
            </Text>
            <TextInput
              style={s.input}
              placeholder="Nazwa sieci WiFi (SSID)"
              placeholderTextColor="#475569"
              value={ssid}
              onChangeText={setSsid}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={s.input}
              placeholder="Hasło WiFi"
              placeholderTextColor="#475569"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={s.btn}
              onPress={sendWifiConfig}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Skonfiguruj Hub</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 3: Done ────────────────────────────────────── */}
        {step === "done" && (
          <View style={s.card}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#22c55e" style={s.icon} />
            <Text style={s.cardTitle}>Hub skonfigurowany!</Text>
            <Text style={s.cardText}>
              Hub uruchamia się i łączy z Twoją siecią WiFi.{"\n\n"}
              Wróć do ustawień WiFi telefonu i ponownie połącz się ze swoją domową siecią.{"\n\n"}
              Po chwili hub pojawi się automatycznie w aplikacji.
            </Text>
            <TouchableOpacity style={s.btn} onPress={handleDone}>
              <Text style={s.btnText}>Gotowe</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },

  content: { padding: 20, paddingBottom: 60 },

  steps: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 32 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1e293b", borderWidth: 2, borderColor: "#334155", justifyContent: "center", alignItems: "center" },
  stepDotActive: { borderColor: "#6366f1", backgroundColor: "#312e81" },
  stepDotDone: { borderColor: "#22c55e", backgroundColor: "#14532d" },
  stepDotText: { color: "#f1f5f9", fontWeight: "700", fontSize: 13 },
  stepLine: { width: 40, height: 2, backgroundColor: "#334155", marginHorizontal: 4 },

  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#334155" },
  icon: { marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: "#f1f5f9", marginBottom: 12, textAlign: "center" },
  cardText: { fontSize: 15, color: "#94a3b8", lineHeight: 22, textAlign: "center", marginBottom: 24 },
  bold: { color: "#f1f5f9", fontWeight: "700" },

  input: { width: "100%", backgroundColor: "#0f172a", borderRadius: 10, padding: 13, color: "#f1f5f9", fontSize: 15, borderWidth: 1, borderColor: "#334155", marginBottom: 12 },

  btn: { backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: "100%", alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
