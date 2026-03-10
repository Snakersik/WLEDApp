// app/setup.tsx — Setup Wizard: Hub BLE provisioning + WLED auto-config
// Navigation: push from hubs.tsx via router.push('/setup')
//
// REQUIRES:  npx expo install react-native-ble-plx buffer
// iOS extra: app.json → expo.ios.infoPlist.NSBluetoothAlwaysUsageDescription
// Android:   react-native-ble-plx handles permissions automatically

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const sdk = Platform.Version as number;

  if (sdk >= 31) {
    // Android 12+ (API 31+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT are sufficient for BLE
    const perms = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];
    // Check first — if already granted, skip the dialog (fast path)
    const checks = await Promise.all(perms.map((p) => PermissionsAndroid.check(p)));
    if (checks.every(Boolean)) return true;

    const grants = await PermissionsAndroid.requestMultiple(perms);
    // Accept GRANTED or NEVER_ASK_AGAIN — on MIUI/OEM ROMs, NEVER_ASK_AGAIN can mean
    // the permission is actually granted as part of a grouped "Nearby devices" permission.
    // Only block if explicitly DENIED.
    return Object.values(grants).every(
      (v) => v === PermissionsAndroid.RESULTS.GRANTED ||
             v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    );
  } else {
    // Android < 12: only ACCESS_FINE_LOCATION needed for BLE
    const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (already) return true;
    const grant = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return grant === PermissionsAndroid.RESULTS.GRANTED;
  }
}
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";
import axios from "axios";

import { useAuth } from "../src/context/AuthContext";
import { useHub }  from "../src/context/HubContext";
import {
  destroyBleManager,
  provisionHub,
  scanForHub,
  scanForWledAps,
  startLanScan,
  startWledProvision,
  waitForHubOnline,
  waitForLanScan,
  waitForProvision,
} from "../src/services/bleService";

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "") + "/api";

// ─────────────────────────────────────────────────────────────
type Step =
  | "intro"
  | "ble_scan"
  | "wifi_form"
  | "ble_send"
  | "hub_wait"
  | "hub_ip"
  | "hub_register"
  | "wled_scan"
  | "wled_provision"
  | "lan_scan"
  | "done";

// ─────────────────────────────────────────────────────────────
export default function SetupScreen() {
  const router = useRouter();
  const { token } = useAuth() as any;
  const { refreshHub } = useHub();

  const [step, setStep]             = useState<Step>("intro");
  const [statusMsg, setStatusMsg]   = useState("");
  const [foundDevice, setFoundDevice] = useState<Device | null>(null);

  // WiFi form
  const [ssid, setSsid]       = useState("");
  const [wifiPass, setWifiPass] = useState("");

  // Hub registration
  const [hubIpInput, setHubIpInput] = useState("");
  const [hubName, setHubName]       = useState("Mój Hub");
  const [registeredHubIp, setRegisteredHubIp] = useState("");

  // Results
  const [configuredWled, setConfiguredWled] = useState<string[]>([]);
  const [foundDevices, setFoundDevices]     = useState<Array<{ ip: string; name: string }>>([]);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      destroyBleManager();
    };
  }, []);

  // ── Step helpers ─────────────────────────────────────────────
  const go = useCallback((s: Step, msg = "") => {
    if (!isMounted.current) return;
    setStep(s);
    setStatusMsg(msg);
  }, []);

  // ── BLE scan ─────────────────────────────────────────────────
  const startBleScan = useCallback(async () => {
    go("ble_scan", "Szukam huba w pobliżu…");
    const hasPerms = await requestBlePermissions();
    if (!hasPerms) {
      Alert.alert(
        "Brak uprawnień Bluetooth",
        "Zezwól na 'Urządzenia w pobliżu' (Bluetooth) w ustawieniach aplikacji.",
        [
          { text: "Anuluj", style: "cancel", onPress: () => go("intro") },
          { text: "Otwórz ustawienia", onPress: () => { Linking.openSettings(); go("intro"); } },
        ],
      );
      return;
    }
    const result = await scanForHub(20_000);
    if (!isMounted.current) return;

    if (result.status === "found") {
      setFoundDevice(result.device);
      go("wifi_form");
    } else if (result.status === "timeout") {
      Alert.alert(
        "Nie znaleziono huba",
        "Upewnij się, że hub jest włączony i Bluetooth jest aktywny. Hub musi być w trybie konfiguracji (pierwsze uruchomienie lub reset).",
        [{ text: "Spróbuj ponownie", onPress: startBleScan }, { text: "Anuluj" }],
      );
      go("intro");
    } else {
      Alert.alert("Błąd BLE", result.message);
      go("intro");
    }
  }, [go]);

  // ── BLE send WiFi credentials ─────────────────────────────────
  const sendWifiViaBle = useCallback(async () => {
    if (!ssid.trim() || !wifiPass) {
      Alert.alert("Uzupełnij dane", "Wpisz nazwę sieci (SSID) i hasło.");
      return;
    }
    if (!foundDevice) return;

    go("ble_send", "Wysyłam dane WiFi do huba…");

    const result = await provisionHub(foundDevice, ssid.trim(), wifiPass);
    if (!isMounted.current) return;

    if (result.status === "ok") {
      go("hub_wait", "Hub zapisał dane i restartuje się…");
      // Give hub some time to reboot
      await delay(5_000);
      go("hub_ip");
    } else {
      Alert.alert("Błąd BLE", result.message, [
        { text: "Spróbuj ponownie", onPress: () => go("wifi_form") },
      ]);
    }
  }, [foundDevice, ssid, wifiPass, go]);

  // ── Register hub in backend ───────────────────────────────────
  const registerHub = useCallback(async () => {
    const ip = hubIpInput.trim();
    if (!ip) {
      Alert.alert("Uzupełnij IP", "Wpisz adres IP huba (znajdziesz go w panelu routera).");
      return;
    }

    go("hub_register", "Sprawdzam połączenie z hubem…");

    // Verify hub is reachable
    const online = await waitForHubOnline(ip, 10_000, 1_500);
    if (!online) {
      Alert.alert(
        "Hub niedostępny",
        `Nie można połączyć z http://${ip}/json/info\nUpewnij się, że hub jest w tej samej sieci i adres IP jest poprawny.`,
        [{ text: "Wróć", onPress: () => go("hub_ip") }],
      );
      return;
    }

    // Register in backend
    try {
      await axios.post(
        `${API_URL}/hubs`,
        { name: hubName.trim() || "Mój Hub", ip_address: ip },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRegisteredHubIp(ip);
      await refreshHub();
      go("wled_scan", "Hub zarejestrowany! Szukam urządzeń WLED…");
      await startWledScan(ip);
    } catch (e: any) {
      Alert.alert("Błąd rejestracji", e?.response?.data?.detail ?? e?.message ?? "Nieznany błąd");
      go("hub_ip");
    }
  }, [hubIpInput, hubName, token, go, refreshHub]);

  // ── WLED scan + provision ─────────────────────────────────────
  const startWledScan = useCallback(async (ip: string) => {
    go("wled_scan", "Szukam sieci WLED-AP w pobliżu…");

    let aps: string[] = [];
    try {
      aps = await scanForWledAps(ip);
    } catch {
      aps = [];
    }

    if (!isMounted.current) return;

    if (aps.length === 0) {
      Alert.alert(
        "Brak urządzeń WLED",
        "Nie wykryto żadnych sieci WLED-AP.\nUpewnij się, że kinkiety są włączone i świecą na pomarańczowo (tryb AP).",
        [
          { text: "Szukaj ponownie", onPress: () => startWledScan(ip) },
          { text: "Pomiń", onPress: () => go("done") },
        ],
      );
      return;
    }

    go("wled_provision", `Konfigurowanie ${aps.length} urządzenia/-ń…`);

    try {
      await startWledProvision(ip);
    } catch {}

    // Poll until done (hub is briefly offline during provisioning)
    const status = await waitForProvision(ip, 120_000, 2_500);
    if (!isMounted.current) return;

    setConfiguredWled(status.configured.map((c: any) => c.name ?? c.ap));

    if (status.error && status.configured.length === 0) {
      Alert.alert("Błąd konfiguracji", status.error, [
        { text: "Pomiń", onPress: () => go("done") },
      ]);
      return;
    }

    // LAN scan started automatically by hub after provisioning
    go("lan_scan", "Szukam urządzeń w sieci lokalnej…");
    const scan = await waitForLanScan(ip, 60_000, 2_500);
    if (!isMounted.current) return;

    setFoundDevices(scan.found);
    go("done");
  }, [go]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color="#94a3b8" />
            </TouchableOpacity>
            <Text style={s.title}>Konfiguracja</Text>
            <View style={{ width: 24 }} />
          </View>

          <StepIndicator step={step} />

          {/* ── INTRO ── */}
          {step === "intro" && (
            <Card>
              <Ionicons name="hardware-chip-outline" size={48} color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Witaj w kreatorze!</Text>
              <Text style={s.body}>
                Ten kreator pomoże Ci:{"\n\n"}
                {"  "}1. Połączyć Hub z Twoją siecią WiFi{"\n"}
                {"  "}2. Automatycznie skonfigurować kinkiety WLED{"\n\n"}
                Upewnij się, że:{"\n"}
                {"  "}• Hub jest włączony{"\n"}
                {"  "}• Bluetooth jest aktywny w telefonie{"\n"}
                {"  "}• Kinkiety są włączone
              </Text>
              <PrimaryBtn label="Rozpocznij" onPress={startBleScan} />
            </Card>
          )}

          {/* ── BLE SCAN ── */}
          {step === "ble_scan" && (
            <Card>
              <ActivityIndicator size="large" color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Wyszukiwanie huba</Text>
              <Text style={s.body}>{statusMsg}</Text>
              <Text style={s.hint}>Szukam urządzenia "WLED-Hub" przez Bluetooth…</Text>
            </Card>
          )}

          {/* ── WIFI FORM ── */}
          {step === "wifi_form" && (
            <Card>
              <Ionicons name="wifi" size={48} color="#22c55e" style={s.icon} />
              <Text style={s.heading}>Dane sieci WiFi</Text>
              <Text style={s.body}>
                Podaj dane sieci, do której hub ma się podłączyć.
              </Text>
              <Text style={s.label}>Nazwa sieci (SSID)</Text>
              <TextInput
                style={s.input}
                value={ssid}
                onChangeText={setSsid}
                placeholder="np. MojaDomowaSiec"
                placeholderTextColor="#475569"
                autoCapitalize="none"
              />
              <Text style={s.label}>Hasło WiFi</Text>
              <TextInput
                style={s.input}
                value={wifiPass}
                onChangeText={setWifiPass}
                placeholder="Hasło"
                placeholderTextColor="#475569"
                secureTextEntry
              />
              <PrimaryBtn label="Wyślij do huba" onPress={sendWifiViaBle} />
            </Card>
          )}

          {/* ── BLE SEND ── */}
          {step === "ble_send" && (
            <Card>
              <ActivityIndicator size="large" color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Wysyłanie danych</Text>
              <Text style={s.body}>{statusMsg}</Text>
            </Card>
          )}

          {/* ── HUB WAIT ── */}
          {step === "hub_wait" && (
            <Card>
              <ActivityIndicator size="large" color="#f59e0b" style={s.icon} />
              <Text style={s.heading}>Hub się restartuje</Text>
              <Text style={s.body}>
                Hub zapisał dane WiFi i restartuje się.{"\n\n"}
                Poczekaj ~30 sekund, aż wskaźnik LED zmieni kolor.
              </Text>
            </Card>
          )}

          {/* ── HUB IP ── */}
          {step === "hub_ip" && (
            <Card>
              <Ionicons name="globe-outline" size={48} color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Adres IP huba</Text>
              <Text style={s.body}>
                Znajdź adres IP huba w panelu swojego routera (lista podłączonych urządzeń, szukaj "DDP-Hub" lub "esp32").
              </Text>
              <Text style={s.label}>Nazwa huba</Text>
              <TextInput
                style={s.input}
                value={hubName}
                onChangeText={setHubName}
                placeholder="Mój Hub"
                placeholderTextColor="#475569"
              />
              <Text style={s.label}>Adres IP huba</Text>
              <TextInput
                style={s.input}
                value={hubIpInput}
                onChangeText={setHubIpInput}
                placeholder="np. 192.168.1.42"
                placeholderTextColor="#475569"
                keyboardType="decimal-pad"
                autoCapitalize="none"
              />
              <PrimaryBtn label="Połącz z hubem" onPress={registerHub} />
            </Card>
          )}

          {/* ── HUB REGISTER ── */}
          {step === "hub_register" && (
            <Card>
              <ActivityIndicator size="large" color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Łączenie z hubem</Text>
              <Text style={s.body}>{statusMsg}</Text>
            </Card>
          )}

          {/* ── WLED SCAN ── */}
          {step === "wled_scan" && (
            <Card>
              <ActivityIndicator size="large" color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Wykrywanie kinkietów</Text>
              <Text style={s.body}>{statusMsg}</Text>
              <Text style={s.hint}>
                Hub szuka sieci "WLED-AP-XXXXXX" w pobliżu…
              </Text>
            </Card>
          )}

          {/* ── WLED PROVISION ── */}
          {step === "wled_provision" && (
            <Card>
              <ActivityIndicator size="large" color="#f59e0b" style={s.icon} />
              <Text style={s.heading}>Konfiguracja kinkietów</Text>
              <Text style={s.body}>{statusMsg}</Text>
              <Text style={s.hint}>
                Hub tymczasowo rozłączy się z WiFi (~20s) aby skonfigurować kinkiety.
                Połączenie z aplikacją zostanie przywrócone automatycznie.
              </Text>
            </Card>
          )}

          {/* ── LAN SCAN ── */}
          {step === "lan_scan" && (
            <Card>
              <ActivityIndicator size="large" color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Szukam urządzeń w sieci</Text>
              <Text style={s.body}>{statusMsg}</Text>
              <Text style={s.hint}>
                Skanowanie sieci lokalnej może potrwać do 30 sekund.
              </Text>
            </Card>
          )}

          {/* ── DONE ── */}
          {step === "done" && (
            <Card>
              <Ionicons name="checkmark-circle" size={56} color="#22c55e" style={s.icon} />
              <Text style={s.heading}>Gotowe!</Text>

              {configuredWled.length > 0 && (
                <>
                  <Text style={s.label}>Skonfigurowane kinkiety:</Text>
                  {configuredWled.map((name, i) => (
                    <Text key={i} style={s.listItem}>{"✓ " + name}</Text>
                  ))}
                </>
              )}

              {foundDevices.length > 0 && (
                <>
                  <Text style={[s.label, { marginTop: 16 }]}>Znalezione urządzenia:</Text>
                  {foundDevices.map((d, i) => (
                    <Text key={i} style={s.listItem}>{"📡 " + d.name + " (" + d.ip + ")"}</Text>
                  ))}
                  <Text style={[s.hint, { marginTop: 8 }]}>
                    Przejdź do zakładki "Urządzenia" i dodaj je ręcznie podając powyższe adresy IP.
                  </Text>
                </>
              )}

              {foundDevices.length === 0 && configuredWled.length === 0 && (
                <Text style={s.body}>
                  Hub jest podłączony i gotowy do pracy.{"\n"}
                  Możesz dodać urządzenia ręcznie w zakładce "Urządzenia".
                </Text>
              )}

              <PrimaryBtn label="Zakończ" onPress={() => router.back()} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────
const STEPS: Step[] = [
  "intro", "ble_scan", "wifi_form", "ble_send",
  "hub_wait", "hub_ip", "hub_register",
  "wled_scan", "wled_provision", "lan_scan", "done",
];

function StepIndicator({ step }: { step: Step }) {
  const idx  = STEPS.indexOf(step);
  const total = STEPS.length - 1;
  return (
    <View style={s.stepRow}>
      {STEPS.slice(0, total).map((_, i) => (
        <View
          key={i}
          style={[s.stepDot, i <= idx && s.stepDotActive]}
        />
      ))}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function PrimaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.btn} onPress={onPress} activeOpacity={0.8}>
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#0f172a" },
  scroll:  { padding: 20, paddingBottom: 60 },
  header:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title:   { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },

  stepRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#334155" },
  stepDotActive: { backgroundColor: "#6366f1" },

  card:    { backgroundColor: "#1e293b", borderRadius: 16, padding: 24, gap: 12 },
  icon:    { alignSelf: "center", marginBottom: 4 },
  heading: { color: "#f1f5f9", fontSize: 20, fontWeight: "700", textAlign: "center" },
  body:    { color: "#94a3b8", fontSize: 15, lineHeight: 22 },
  hint:    { color: "#64748b", fontSize: 13, lineHeight: 18 },
  label:   { color: "#cbd5e1", fontSize: 13, fontWeight: "600", marginTop: 8 },
  listItem:{ color: "#86efac", fontSize: 14 },

  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    padding: 12,
    color: "#f1f5f9",
    fontSize: 15,
  },
  btn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
