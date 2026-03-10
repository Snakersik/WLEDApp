// app/setup.tsx — Setup Wizard: Hub BLE provisioning + WLED auto-config
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

import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import WifiManager from "react-native-wifi-reborn";
import axios from "axios";

import { useAuth } from "../src/context/AuthContext";
import { useHub }  from "../src/context/HubContext";
import {
  destroyBleManager,
  findHubOnLan,
  provisionHub,
  scanForHub,
  scanForWledAps,
  startWledProvision,
  waitForHubOnline,
  waitForLanScan,
  waitForProvision,
} from "../src/services/bleService";

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "") + "/api";

const STORAGE_SSID = "hub_wifi_ssid";
const STORAGE_PASS = "hub_wifi_pass";

// ─────────────────────────────────────────────────────────────
type Step =
  | "intro"
  | "ble_scan"
  | "wifi_form"
  | "ble_send"
  | "hub_wait"
  | "hub_lan_scan"
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

  const [step, setStep]               = useState<Step>("intro");
  const [statusMsg, setStatusMsg]     = useState("");
  const [foundDevice, setFoundDevice] = useState<Device | null>(null);

  // WiFi form
  const [ssid, setSsid]               = useState("");
  const [wifiPass, setWifiPass]       = useState("");
  const [wifiNetworks, setWifiNetworks] = useState<string[]>([]);
  const [scanningWifi, setScanningWifi] = useState(false);

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

    // Load saved credentials + auto-detect SSID from current WiFi
    (async () => {
      const [savedSsid, savedPass] = await Promise.all([
        AsyncStorage.getItem(STORAGE_SSID),
        AsyncStorage.getItem(STORAGE_PASS),
      ]);

      // Request location permission solely for WiFi SSID detection.
      // This is independent of BLE — BLE works regardless of this result.
      let detectedSsid: string | undefined;
      if (Platform.OS === "android") {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Dostęp do lokalizacji",
            message: "Potrzebny do automatycznego wykrycia nazwy sieci WiFi.",
            buttonPositive: "Zezwól",
            buttonNegative: "Pomiń",
          },
        ).catch(() => {});
        NetInfo.configure({ shouldFetchWiFiSSID: true });
        const netInfo = await NetInfo.fetch();
        detectedSsid = (netInfo as any)?.details?.ssid as string | undefined;
      }

      if (isMounted.current) {
        setSsid(detectedSsid || savedSsid || "");
        if (savedPass) setWifiPass(savedPass);
      }
    })();

    return () => {
      isMounted.current = false;
      destroyBleManager();
    };
  }, []);

  // ── WiFi network scan ────────────────────────────────────────
  const scanWifiNetworks = useCallback(async () => {
    setScanningWifi(true);
    try {
      const nets = await WifiManager.loadWifiList();
      const ssids = [...new Set((nets as any[]).map((n) => n.SSID).filter(Boolean))].sort() as string[];
      setWifiNetworks(ssids);
    } catch {
      setWifiNetworks([]);
    } finally {
      setScanningWifi(false);
    }
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

    // Request permissions to show system dialog on first run.
    // We do NOT block on the result — OEM ROMs (MIUI etc.) return incorrect values.
    // The BLE library itself reports a permission error (errorCode 102) if truly missing.
    if (Platform.OS === "android") {
      const sdk = Platform.Version as number;
      if (sdk >= 31) {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]).catch(() => {});
      } else {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ).catch(() => {});
      }
    }

    const result = await scanForHub(20_000);
    if (!isMounted.current) return;

    if (result.status === "found") {
      setFoundDevice(result.device);
      go("wifi_form");
      scanWifiNetworks();
    } else if (result.status === "timeout") {
      Alert.alert(
        "Nie znaleziono huba",
        "Upewnij się, że hub jest włączony i Bluetooth jest aktywny. Hub musi być w trybie konfiguracji (pierwsze uruchomienie lub reset).",
        [{ text: "Spróbuj ponownie", onPress: startBleScan }, { text: "Anuluj" }],
      );
      go("intro");
    } else if (result.isPermissionError) {
      Alert.alert(
        "Brak uprawnień Bluetooth",
        "Zezwól na 'Urządzenia w pobliżu' w ustawieniach aplikacji.",
        [
          { text: "Anuluj", style: "cancel", onPress: () => go("intro") },
          { text: "Otwórz ustawienia", onPress: () => { Linking.openSettings(); go("intro"); } },
        ],
      );
    } else {
      Alert.alert("Błąd BLE", result.message);
      go("intro");
    }
  }, [go, scanWifiNetworks]);

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
      // Save credentials for next time
      await Promise.all([
        AsyncStorage.setItem(STORAGE_SSID, ssid.trim()),
        AsyncStorage.setItem(STORAGE_PASS, wifiPass),
      ]);

      // JSON protocol guarantees result.ip is a valid IP
      setHubIpInput(result.ip);
      await registerHubAt(result.ip);
    } else if (result.message?.includes("Timeout")) {
      // Hub may have connected but STATUS notify was lost — try LAN scan as fallback
      go("hub_lan_scan", "Hub mógł się połączyć z WiFi. Szukam go w sieci…");
      const foundIp = await findHubOnLan(30_000);
      if (!isMounted.current) return;
      if (foundIp) {
        setHubIpInput(foundIp);
        await registerHubAt(foundIp);
      } else {
        go("hub_ip");
      }
    } else {
      Alert.alert("Błąd BLE", result.message, [
        { text: "Spróbuj ponownie", onPress: () => go("wifi_form") },
      ]);
    }
  }, [foundDevice, ssid, wifiPass, go]);

  // ── Register hub in backend (core logic) ─────────────────────
  const registerHubAt = useCallback(async (ip: string) => {
    go("hub_register", "Sprawdzam połączenie z hubem…");

    const online = await waitForHubOnline(ip, 15_000, 1_500);
    if (!online) {
      Alert.alert(
        "Hub niedostępny",
        `Nie można połączyć z http://${ip}/json/info\nUpewnij się, że hub jest w tej samej sieci i adres IP jest poprawny.`,
        [{ text: "Wróć", onPress: () => go("hub_ip") }],
      );
      return;
    }

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
  }, [hubName, token, go, refreshHub]);

  // ── Register hub (manual IP fallback button) ─────────────────
  const registerHub = useCallback(async () => {
    const ip = hubIpInput.trim();
    if (!ip) {
      Alert.alert("Uzupełnij IP", "Wpisz adres IP huba (znajdziesz go w panelu routera).");
      return;
    }
    await registerHubAt(ip);
  }, [hubIpInput, registerHubAt]);

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

    const status = await waitForProvision(ip, 120_000, 2_500);
    if (!isMounted.current) return;

    setConfiguredWled(status.configured.map((c: any) => c.name ?? c.ap));

    if (status.error && status.configured.length === 0) {
      Alert.alert("Błąd konfiguracji", status.error, [
        { text: "Pomiń", onPress: () => go("done") },
      ]);
      return;
    }

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

              {/* Network picker */}
              {scanningWifi ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <ActivityIndicator size="small" color="#6366f1" />
                  <Text style={s.hint}>Szukam dostępnych sieci…</Text>
                </View>
              ) : wifiNetworks.length > 0 ? (
                <>
                  <Text style={s.hint}>Wybierz sieć lub wpisz ręcznie poniżej:</Text>
                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                    {wifiNetworks.map((net) => (
                      <TouchableOpacity
                        key={net}
                        style={[s.netRow, ssid === net && s.netRowSelected]}
                        onPress={() => setSsid(net)}
                      >
                        <Ionicons name="wifi-outline" size={16} color={ssid === net ? "#6366f1" : "#94a3b8"} />
                        <Text style={[s.netText, ssid === net && s.netTextSelected]}>{net}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <TouchableOpacity onPress={scanWifiNetworks} style={s.scanNetBtn}>
                  <Ionicons name="search-outline" size={15} color="#6366f1" />
                  <Text style={s.scanNetBtnText}>Szukaj dostępnych sieci</Text>
                </TouchableOpacity>
              )}

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
                Za chwilę automatycznie wyszukam go w sieci.
              </Text>
            </Card>
          )}

          {/* ── HUB LAN SCAN ── */}
          {step === "hub_lan_scan" && (
            <Card>
              <ActivityIndicator size="large" color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Szukam huba w sieci</Text>
              <Text style={s.body}>{statusMsg}</Text>
              <Text style={s.hint}>
                Hub właśnie dołączył do WiFi. To może zająć ~30 sekund.
              </Text>
            </Card>
          )}

          {/* ── HUB IP (fallback manual entry) ── */}
          {step === "hub_ip" && (
            <Card>
              <Ionicons name="globe-outline" size={48} color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Adres IP huba</Text>
              <Text style={s.body}>
                Nie udało się automatycznie znaleźć huba. Wpisz adres IP ręcznie
                (znajdziesz go w panelu routera — szukaj "DDP-Hub" lub "esp32").
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
                </>
              )}

              {foundDevices.length === 0 && configuredWled.length === 0 && (
                <Text style={s.body}>
                  Hub jest podłączony i gotowy do pracy.{"\n"}
                  Możesz dodać urządzenia w zakładce "Urządzenia".
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
  "hub_wait", "hub_lan_scan", "hub_ip", "hub_register",
  "wled_scan", "wled_provision", "lan_scan", "done",
];

function StepIndicator({ step }: { step: Step }) {
  const idx   = STEPS.indexOf(step);
  const total = STEPS.length - 1;
  return (
    <View style={s.stepRow}>
      {STEPS.slice(0, total).map((_, i) => (
        <View key={i} style={[s.stepDot, i <= idx && s.stepDotActive]} />
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

  stepRow:       { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 },
  stepDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: "#334155" },
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

  netRow:          { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#334155", marginTop: 4 },
  netRowSelected:  { borderColor: "#6366f1", backgroundColor: "#1e1b4b" },
  netText:         { color: "#94a3b8", fontSize: 14, flex: 1 },
  netTextSelected: { color: "#6366f1", fontWeight: "700" },
  scanNetBtn:      { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginTop: 4 },
  scanNetBtnText:  { color: "#6366f1", fontSize: 13, fontWeight: "600" },
});
