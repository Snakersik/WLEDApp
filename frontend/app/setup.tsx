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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import WifiManager from "react-native-wifi-reborn";
import axios from "axios";

import { useAuth } from "../src/context/AuthContext";
import { useHub }  from "../src/context/HubContext";
import { WLEDDiscovery } from "../src/services/discoveryService";
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
  | "device_names"
  | "done";

const LOCATIONS = [
  "Prawe drzwi", "Lewe drzwi", "Drzwi garaż prawy", "Drzwi garaż lewy",
  "Wejście główne", "Taras", "Balkon", "Ogród", "Inne",
];

// ─────────────────────────────────────────────────────────────
export default function SetupScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
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
  const [deviceForms, setDeviceForms]       = useState<Array<{ ip: string; name: string; location: string; customLocation: string }>>([]);

  // Identify
  const [identifyingIp, setIdentifyingIp] = useState<string | null>(null);

  // Debug log
  const [debugMsg, setDebugMsg] = useState("");
  const addDebug = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setDebugMsg(prev => prev ? `${prev}\n[${ts}] ${msg}` : `[${ts}] ${msg}`);
  }, []);

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

    // Helper: try mDNS probe then LAN scan
    const findAndRegister = async (mdnsName?: string, hubId?: string) => {
      if (mdnsName) {
        addDebug(`Probe mDNS: ${mdnsName}.local`);
        const mdnsOk = await waitForHubOnline(`${mdnsName}.local`, 8_000, 1_500);
        if (mdnsOk && isMounted.current) {
          addDebug("mDNS ok!");
          await registerHubAt(`${mdnsName}.local`, mdnsName, hubId);
          return;
        }
        addDebug("mDNS fail → LAN scan");
      }
      addDebug("Skan LAN start…");
      const foundIp = await findHubOnLan(30_000);
      addDebug(`Skan LAN: ${foundIp ?? "nie znaleziono"}`);
      if (!isMounted.current) return;
      if (foundIp) {
        setHubIpInput(foundIp);
        await registerHubAt(foundIp, mdnsName, hubId);
      } else {
        addDebug("Nie znaleziono — ręczny IP");
        go("hub_ip");
      }
    };

    if (result.status === "ok") {
      addDebug(`BLE ok — IP: ${result.ip} mdns: ${result.mdnsName ?? "?"}`);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_SSID, ssid.trim()),
        AsyncStorage.setItem(STORAGE_PASS, wifiPass),
      ]);
      go("hub_wait", "Hub restartuje się i dołącza do sieci…");
      addDebug("hub_wait — czekam 3s…");
      await delay(3000);
      setHubIpInput(result.ip);
      await registerHubAt(result.ip, result.mdnsName, result.hubId);

    } else if (result.status === "handoff") {
      // BLE dropped when WiFi started — hub is connecting, we have mdns_name from META read
      addDebug(`BLE handoff mdns=${result.mdnsName ?? "?"}`);
      await Promise.all([
        AsyncStorage.setItem(STORAGE_SSID, ssid.trim()),
        AsyncStorage.setItem(STORAGE_PASS, wifiPass),
      ]);
      go("hub_lan_scan", "Hub łączy się z WiFi. Szukam go w sieci…");
      addDebug("Czekam aż hub wstanie…");
      // Poll instead of fixed delay — ESP32 typically boots in 3-5s, no need to wait 20s.
      // waitForHubOnline tries mDNS first, falls through to LAN scan in findAndRegister.
      await findAndRegister(result.mdnsName, result.hubId);

    } else if (result.message?.includes("Timeout")) {
      // 25s timeout — hub connected but notify lost; likely online already
      addDebug("BLE timeout — fallback");
      go("hub_lan_scan", "Hub mógł się połączyć z WiFi. Szukam go w sieci…");
      await findAndRegister(undefined, undefined);

    } else {
      Alert.alert("Błąd BLE", result.message, [
        { text: "Spróbuj ponownie", onPress: () => go("wifi_form") },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundDevice, ssid, wifiPass, go, addDebug]);

  // ── Register hub in backend (core logic) ─────────────────────
  const registerHubAt = useCallback(async (
    ip: string,
    mdnsName?: string,
    hubId?: string,
  ) => {
    go("hub_register", "Sprawdzam połączenie z hubem…");

    // 1. Try IP directly
    addDebug(`probe IP: ${ip}`);
    let effectiveHost = ip;
    let online = await waitForHubOnline(ip, 15_000, 1_500);
    addDebug(`probe IP result: ${online ? "ok" : "fail"}`);

    // 2. Try mDNS .local if IP failed
    if (!online && mdnsName) {
      effectiveHost = `${mdnsName}.local`;
      addDebug(`probe mDNS: ${effectiveHost}`);
      online = await waitForHubOnline(effectiveHost, 10_000, 1_500);
      addDebug(`probe mDNS result: ${online ? "ok" : "fail"}`);
    }

    if (!online) {
      Alert.alert(
        "Hub niedostępny",
        `Nie można połączyć z hubem.\nSprawdź czy hub jest w tej samej sieci WiFi.`,
        [{ text: "Wróć", onPress: () => go("hub_ip") }],
      );
      return;
    }

    // Fetch /json/info to get firmware version
    let firmwareVer: string | undefined;
    try {
      const info = await fetch(`http://${effectiveHost}/json/info`).then(r => r.json());
      firmwareVer = info?.ver;
    } catch {}

    addDebug(`Rejestruję hub w backendzie…`);
    try {
      await axios.post(
        `${API_URL}/hubs`,
        {
          name: hubName.trim() || "Mój Hub",
          ip_address: effectiveHost,
          hub_id: hubId,
          mdns_name: mdnsName,
          firmware_version: firmwareVer,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
      );
      addDebug(`Rejestracja OK`);
      setRegisteredHubIp(effectiveHost);
      await refreshHub();
      go("wled_scan", "Hub zarejestrowany! Szukam urządzeń WLED…");
      await startWledScan(effectiveHost);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? "Nieznany błąd";
      addDebug(`Błąd rejestracji: ${msg}`);
      Alert.alert("Błąd rejestracji", msg);
      go("hub_ip");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubName, token, go, refreshHub, addDebug]);

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

    let aps: Awaited<ReturnType<typeof scanForWledAps>> = [];
    try {
      aps = await scanForWledAps(ip);
    } catch {
      aps = [];
    }

    if (!isMounted.current) return;

    addDebug(`[WLED-AP] znaleziono ${aps.length}: ${aps.map(a => `${a.ssid}(${a.bssid})`).join(', ') || '—'}`);

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

    const status = await waitForProvision(ip, 120_000, 2_500, (s) => {
      addDebug(`[PROV] running=${s.running} done=${s.done} configured=${s.configured.length}${s.error ? ' err=' + s.error : ''}`);
    });
    if (!isMounted.current) return;

    setConfiguredWled(status.configured.map((c: any) => c.name ?? c.ap));

    if (status.error && status.configured.length === 0) {
      Alert.alert("Błąd konfiguracji", status.error, [
        { text: "Pomiń", onPress: () => go("done") },
      ]);
      return;
    }

    go("lan_scan", "Szukam urządzeń (mDNS)…");

    // 1. Try mDNS first — fast (2-5s) when WLED devices advertise _wled._tcp
    addDebug(`[SCAN] Próba mDNS (_wled._tcp)...`);
    const mdnsFound = await new Promise<Array<{ name: string; ip: string }>>((resolve) => {
      const found: Array<{ name: string; ip: string }> = [];
      WLEDDiscovery.startMDNSScan(
        (d) => found.push({ name: d.name, ip: d.ip }),
        () => resolve(found),
      );
      setTimeout(() => { WLEDDiscovery.stopMDNSScan(); resolve(found); }, 8_000);
    });
    if (!isMounted.current) return;
    addDebug(`[SCAN] mDNS: znaleziono ${mdnsFound.length} urządzenia`);

    const foundDevices = mdnsFound.length > 0
      ? mdnsFound
      : await (async () => {
          // 2. Fallback: poll hub's LAN scan (hub also tries mDNS then IP probe)
          addDebug(`[SCAN] mDNS nic nie znalazło — czekam na skan huba...`);
          go("lan_scan", "Szukam urządzeń w sieci (skan IP)…");
          const scan = await waitForLanScan(ip, 150_000, 2_500, (s) => {
            const ips = s.found.map(d => `${d.name}@${d.ip}`).join(', ') || '—';
            addDebug(`[SCAN] running=${s.running} done=${s.done} found=${s.found.length} [${ips}]`);
          });
          return scan.found;
        })();
    if (!isMounted.current) return;

    setFoundDevices(foundDevices);

    if (foundDevices.length === 0) {
      go("done");
      return;
    }

    // Let user name devices and pick locations before registering
    setDeviceForms(foundDevices.map(d => ({ ip: d.ip, name: '', location: '', customLocation: '' })));
    go("device_names", "");
  }, [go]);

  // ── Register devices with chosen names/locations ──────────────
  const registerDevices = useCallback(async () => {
    go("done");
    for (const d of deviceForms) {
      addDebug(`[REG] Rejestruję ${d.name} @ ${d.ip}…`);
      try {
        await axios.post(
          `${API_URL}/devices`,
          { name: d.name || deviceDefaultName(d.location, d.customLocation) || 'WLED Device', ip_address: d.ip, led_count: 30, location: (d.location === "Inne" ? d.customLocation : d.location) || undefined },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 8_000 },
        );
        addDebug(`[REG] OK — ${d.name}`);
      } catch (e: any) {
        addDebug(`[REG] Błąd: ${e?.response?.status ?? e?.message ?? 'unknown'}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceForms, token, go, addDebug]);

  // ── Identify device (blink red for 4s via hub DDP) ───────────
  const identifyDevice = useCallback(async (ip: string) => {
    if (!registeredHubIp || identifyingIp) return;
    setIdentifyingIp(ip);
    try {
      await fetch(`http://${registeredHubIp}/api/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
    } catch {}
    setTimeout(() => setIdentifyingIp(null), 4200);
  }, [registeredHubIp, identifyingIp]);

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
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ opacity: returnTo ? 0 : 1 }} disabled={!!returnTo}>
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
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={s.hint}>Wybierz sieć lub wpisz ręcznie poniżej:</Text>
                    <TouchableOpacity onPress={scanWifiNetworks} style={s.refreshNetBtn}>
                      <Ionicons name="refresh-outline" size={14} color="#6366f1" />
                      <Text style={s.scanNetBtnText}>Odśwież</Text>
                    </TouchableOpacity>
                  </View>
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

          {/* ── DEVICE NAMES ── */}
          {step === "device_names" && (
            <Card>
              <Ionicons name="pencil-outline" size={48} color="#6366f1" style={s.icon} />
              <Text style={s.heading}>Nazwij urządzenia</Text>
              <Text style={s.body}>
                Znaleziono {deviceForms.length} {deviceForms.length === 1 ? "urządzenie" : "urządzenia/-ń"}.{"\n"}
                Podaj nazwy i wybierz pomieszczenia.
              </Text>

              {deviceForms.map((form, idx) => (
                <View key={form.ip} style={s.deviceFormCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={s.deviceFormIp}>📡 {form.ip}</Text>
                    <TouchableOpacity
                      style={[s.identifyBtn, identifyingIp === form.ip && s.identifyBtnActive]}
                      onPress={() => identifyDevice(form.ip)}
                      disabled={!!identifyingIp}
                    >
                      {identifyingIp === form.ip
                        ? <ActivityIndicator size="small" color="#ef4444" />
                        : <Ionicons name="flashlight-outline" size={14} color="#ef4444" />
                      }
                      <Text style={s.identifyBtnText}>
                        {identifyingIp === form.ip ? "Miga…" : "Wykryj"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.label}>Nazwa</Text>
                  <TextInput
                    style={s.input}
                    value={form.name}
                    onChangeText={(v) =>
                      setDeviceForms(prev => prev.map((d, i) => i === idx ? { ...d, name: v } : d))
                    }
                    placeholder={deviceDefaultName(form.location, form.customLocation) || "np. Kinkiet wejściowy"}
                    placeholderTextColor="#475569"
                  />
                  <Text style={s.label}>Lokalizacja</Text>
                  <View style={s.chipRow}>
                    {LOCATIONS.map(loc => (
                      <TouchableOpacity
                        key={loc}
                        style={[s.chip, form.location === loc && s.chipSelected]}
                        onPress={() =>
                          setDeviceForms(prev => prev.map((d, i) =>
                            i === idx ? { ...d, location: d.location === loc ? '' : loc } : d
                          ))
                        }
                      >
                        <Text style={[s.chipText, form.location === loc && s.chipTextSelected]}>{loc}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {form.location === "Inne" && (
                    <TextInput
                      style={[s.input, { marginTop: 6 }]}
                      value={form.customLocation}
                      onChangeText={(v) =>
                        setDeviceForms(prev => prev.map((d, i) => i === idx ? { ...d, customLocation: v } : d))
                      }
                      placeholder="Wpisz lokalizację…"
                      placeholderTextColor="#475569"
                      autoFocus
                    />
                  )}
                </View>
              ))}

              <PrimaryBtn label="Dodaj urządzenia" onPress={registerDevices} />
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

              <PrimaryBtn label="Zakończ" onPress={() => returnTo ? router.replace(returnTo as any) : router.back()} />
            </Card>
          )}
          {/* ── DEBUG PANEL ── */}
          {!!debugMsg && (
            <View style={s.debugPanel}>
              <Text style={s.debugTitle}>Debug log</Text>
              <Text style={s.debugText} selectable>{debugMsg}</Text>
            </View>
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
  "wled_scan", "wled_provision", "lan_scan", "device_names", "done",
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

function deviceDefaultName(location: string, customLocation: string): string {
  const loc = location === "Inne" ? customLocation : location;
  if (!loc) return "";
  // Capitalize first letter, rest lowercase
  const lower = loc.charAt(0).toUpperCase() + loc.slice(1).toLowerCase();
  return `Kinkiet ${lower}`;
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
  refreshNetBtn:   { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8 },

  identifyBtn:       { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#ef4444" },
  identifyBtnActive: { backgroundColor: "#1f1010" },
  identifyBtnText:   { color: "#ef4444", fontSize: 12, fontWeight: "600" },

  debugPanel: { marginTop: 24, backgroundColor: "#0f172a", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#334155" },
  debugTitle:  { color: "#64748b", fontSize: 11, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" },
  debugText:   { color: "#475569", fontSize: 11, fontFamily: "monospace", lineHeight: 16 },

  deviceFormCard: { backgroundColor: "#0f172a", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#334155", gap: 4 },
  deviceFormIp:   { color: "#64748b", fontSize: 12, fontFamily: "monospace" },
  chipRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#334155", backgroundColor: "#1e293b" },
  chipSelected:   { borderColor: "#6366f1", backgroundColor: "#1e1b4b" },
  chipText:       { color: "#94a3b8", fontSize: 13 },
  chipTextSelected: { color: "#a5b4fc", fontWeight: "700" },
});
