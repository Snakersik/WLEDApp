// app/onboarding.tsx — First-run onboarding wizard
import React, { useCallback, useRef, useState } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";

import { useAuth } from "../src/context/AuthContext";
import { useHub } from "../src/context/HubContext";

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "") + "/api";

type OStep = "welcome" | "check" | "group" | "finish";

interface Device { id: string; name: string; ip_address?: string; location?: string; }
interface HubInfo  { id: string; name: string; ip_address?: string; }

const STEP_LABELS: Record<OStep, string> = {
  welcome: "Witaj",
  check:   "Urządzenia",
  group:   "Grupa",
  finish:  "Gotowe",
};
const STEPS: OStep[] = ["welcome", "check", "group", "finish"];

// ─────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router = useRouter();
  const { token, completeOnboarding } = useAuth() as any;
  const { refreshHub } = useHub();

  const [step, setStep]           = useState<OStep>("welcome");
  const [loading, setLoading]     = useState(false);

  // Backend state
  const [hub, setHub]             = useState<HubInfo | null>(null);
  const [devices, setDevices]     = useState<Device[]>([]);
  const [hasGroups, setHasGroups] = useState(false);

  // Group form
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  const stepRef = useRef(step);
  stepRef.current = step;

  const headers = { Authorization: `Bearer ${token}` };

  // ── Refresh backend state on every focus ─────────────────────
  useFocusEffect(useCallback(() => {
    refreshState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  async function refreshState() {
    if (!token) return;
    setLoading(true);
    try {
      const [hubsRes, devsRes, groupsRes] = await Promise.all([
        fetch(`${API_URL}/hubs`,    { headers }),
        fetch(`${API_URL}/devices`, { headers }),
        fetch(`${API_URL}/groups`,  { headers }),
      ]);
      const hubs   = await hubsRes.json().catch(() => []);
      const devs   = await devsRes.json().catch(() => []);
      const groups = await groupsRes.json().catch(() => []);

      const hubList  = Array.isArray(hubs)   ? hubs   : [];
      const devList  = Array.isArray(devs)   ? devs   : [];
      const grpList  = Array.isArray(groups) ? groups : [];

      setHub(hubList[0] ?? null);
      setDevices(devList);
      setHasGroups(grpList.length > 0);

      // Pre-select all devices for group creation
      if (devList.length > 0) {
        setSelectedIds(new Set(devList.map((d: Device) => d.id)));
      }

      // If we're returning from setup, advance past welcome automatically
      if (stepRef.current === "welcome" && hubList.length > 0) {
        if (grpList.length > 0) {
          setStep("finish");
        } else if (devList.length > 0) {
          setStep("group");
        } else {
          setStep("check");
        }
      }
    } catch {
      // network error — stay on current step
    } finally {
      setLoading(false);
    }
  }

  // ── Skip / finish handlers ────────────────────────────────────
  const skipOnboarding = useCallback(async () => {
    await completeOnboarding().catch(() => {});
    router.replace("/(tabs)/devices");
  }, [router, completeOnboarding]);

  const finishOnboarding = useCallback(async () => {
    await completeOnboarding().catch(() => {});
    await refreshHub();
    router.replace("/(tabs)/devices");
  }, [router, refreshHub, completeOnboarding]);

  // ── Group creation ────────────────────────────────────────────
  const createGroup = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      Alert.alert("Wybierz urządzenia", "Zaznacz co najmniej jedno urządzenie.");
      return;
    }
    const selectedDevs = devices.filter(d => selectedIds.has(d.id));
    const finalName = groupName.trim() || suggestGroupName(selectedDevs) || "Moje kinkiety";
    setCreatingGroup(true);
    try {
      await axios.post(
        `${API_URL}/groups`,
        { name: finalName, device_ids: ids },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 8_000 },
      );
      setHasGroups(true);
      setStep("finish");
    } catch (e: any) {
      Alert.alert("Błąd", e?.response?.data?.detail ?? e?.message ?? "Nie udało się utworzyć grupy.");
    } finally {
      setCreatingGroup(false);
    }
  }, [groupName, selectedIds, token]);

  const toggleDevice = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ─── Render ────────────────────────────────────────────────────
  const stepIdx = STEPS.indexOf(step);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Konfiguracja systemu</Text>
          <Text style={s.subtitle}>Krok {stepIdx + 1} z {STEPS.length} — {STEP_LABELS[step]}</Text>
        </View>

        {/* Progress dots */}
        <View style={s.dotsRow}>
          {STEPS.map((_, i) => (
            <View key={i} style={[s.dot, i <= stepIdx && s.dotActive]} />
          ))}
        </View>

        {/* Loading overlay for initial state check */}
        {loading && step === "welcome" ? (
          <Card>
            <ActivityIndicator size="large" color="#6366f1" style={{ marginVertical: 32 }} />
            <Text style={[s.body, { textAlign: "center" }]}>Sprawdzam stan systemu…</Text>
          </Card>
        ) : (
          <>
            {/* ── WELCOME ── */}
            {step === "welcome" && (
              <Card>
                {/* Hero */}
                <View style={s.heroWrap}>
                  <View style={s.heroCircle}>
                    <Ionicons name="bulb" size={40} color="#fff" />
                  </View>
                </View>

                <Text style={s.heading}>Inteligentne oświetlenie{"\n"}w Twoim domu</Text>
                <Text style={s.heroSub}>
                  Skonfiguruj swój system w 3 minuty — bez kabli, bez technika.
                </Text>

                {/* Feature rows */}
                <View style={s.featureList}>
                  <FeatureRow
                    icon="hardware-chip-outline"
                    color="#6366f1"
                    title="Podłącz Hub"
                    desc="Łącznik WiFi który zarządza wszystkimi lampami w sieci lokalnej."
                  />
                  <FeatureRow
                    icon="flash-outline"
                    color="#f59e0b"
                    title="Wykryj kinkiety"
                    desc="Aplikacja automatycznie znajdzie lampy WLED w Twojej sieci."
                  />
                  <FeatureRow
                    icon="layers-outline"
                    color="#22c55e"
                    title="Steruj jako grupą"
                    desc="Jeden suwak jasności i jeden efekt dla wszystkich lamp naraz."
                  />
                </View>

                <PrimaryBtn
                  label="Zaczynamy →"
                  onPress={() => router.push("/setup?returnTo=/onboarding" as any)}
                />
                <TouchableOpacity onPress={skipOnboarding} style={s.skipBtn}>
                  <Text style={s.skipText}>Mam już skonfigurowany system — pomiń</Text>
                </TouchableOpacity>
              </Card>
            )}

            {/* ── CHECK ── */}
            {step === "check" && (
              <Card>
                {/* Hub status bar */}
                <View style={s.statusBar}>
                  <View style={s.statusBarLeft}>
                    <View style={s.statusDotGreen} />
                    <Ionicons name="hardware-chip" size={16} color="#22c55e" />
                    <Text style={s.statusBarText}>{hub?.name ?? "Hub"} połączony</Text>
                  </View>
                  {hub?.ip_address ? (
                    <Text style={s.statusBarIp}>{hub.ip_address}</Text>
                  ) : null}
                </View>

                {devices.length > 0 ? (
                  <>
                    <View style={s.devFoundWrap}>
                      <Ionicons name="bulb" size={32} color="#f59e0b" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.devFoundTitle}>
                          Znaleziono {devices.length} {devices.length === 1 ? "kinkiet" : devices.length < 5 ? "kinkiety" : "kinkietów"}
                        </Text>
                        <Text style={s.devFoundSub}>Wszystkie gotowe do sterowania</Text>
                      </View>
                    </View>

                    <View style={s.devList}>
                      {devices.map((d, i) => (
                        <View key={d.id} style={[s.devListRow, i < devices.length - 1 && s.devListRowBorder]}>
                          <View style={s.devListDot} />
                          <Text style={s.devListName}>{d.name}</Text>
                          {d.ip_address ? <Text style={s.devListIp}>{d.ip_address}</Text> : null}
                        </View>
                      ))}
                    </View>

                    <PrimaryBtn label="Dalej — utwórz grupę →" onPress={() => setStep("group")} />
                  </>
                ) : (
                  <>
                    <View style={s.devFoundWrap}>
                      <Ionicons name="bulb-outline" size={32} color="#64748b" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.devFoundTitle}>Brak kinkietów</Text>
                        <Text style={s.devFoundSub}>Upewnij się że lampy są włączone i w tej samej sieci WiFi co Hub.</Text>
                      </View>
                    </View>
                    <PrimaryBtn label="Wróć i wyszukaj ponownie" onPress={() => router.push("/setup?returnTo=/onboarding" as any)} />
                    <TouchableOpacity onPress={() => setStep("group")} style={s.skipBtn}>
                      <Text style={s.skipText}>Dodaj kinkiety później</Text>
                    </TouchableOpacity>
                  </>
                )}
              </Card>
            )}

            {/* ── GROUP ── */}
            {step === "group" && (
              <Card>
                <Ionicons name="layers-outline" size={56} color="#6366f1" style={s.icon} />
                <Text style={s.heading}>Utwórz pierwszą grupę</Text>
                <Text style={s.body}>
                  Grupa to zestaw kinkietów, którymi sterujesz razem — jeden suwak jasności, jeden efekt dla wszystkich.{"\n\n"}
                  Nadaj jej nazwę odpowiadającą miejscu montażu, np.{" "}
                  <Text style={{ color: "#a5b4fc" }}>
                    {suggestGroupName(devices.filter(d => selectedIds.has(d.id))) || "Kinkiety garaż"}
                  </Text>.
                </Text>

                <Text style={s.label}>Nazwa grupy</Text>
                <TextInput
                  style={s.input}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder={suggestGroupName(devices.filter(d => selectedIds.has(d.id))) || "np. Kinkiety garaż"}
                  placeholderTextColor="#475569"
                />

                {devices.length > 0 && (
                  <>
                    <Text style={s.label}>Urządzenia w grupie</Text>
                    {devices.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={s.deviceRow}
                        onPress={() => toggleDevice(d.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[s.checkbox, selectedIds.has(d.id) && s.checkboxChecked]}>
                          {selectedIds.has(d.id) && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <Ionicons name="bulb-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
                        <Text style={s.deviceRowText}>{d.name}</Text>
                        {d.location ? <Text style={s.deviceRowLoc}>{d.location}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                <PrimaryBtn
                  label={creatingGroup ? "Tworzę grupę…" : "Utwórz grupę"}
                  onPress={createGroup}
                  disabled={creatingGroup}
                />
                <TouchableOpacity onPress={() => setStep("finish")} style={s.skipBtn}>
                  <Text style={s.skipText}>Pomiń</Text>
                </TouchableOpacity>
              </Card>
            )}

            {/* ── FINISH ── */}
            {step === "finish" && (
              <Card>
                <Ionicons name="checkmark-circle" size={64} color="#22c55e" style={s.icon} />
                <Text style={s.heading}>System gotowy!</Text>

                <View style={s.summaryBox}>
                  <SummaryRow icon="hardware-chip" label="Hub" value={hub?.name ?? hub?.ip_address ?? "—"} ok={!!hub} />
                  <SummaryRow icon="bulb"          label="Urządzenia" value={devices.length > 0 ? `${devices.length} szt.` : "—"} ok={devices.length > 0} />
                  <SummaryRow icon="layers"        label="Grupa" value={hasGroups ? "Skonfigurowana" : "Pominięta"} ok={hasGroups} />
                </View>

                <Text style={s.body}>
                  Możesz teraz sterować swoim systemem oświetlenia.
                </Text>

                <PrimaryBtn label="Przejdź do aplikacji" onPress={finishOnboarding} />
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Small sub-components ─────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function PrimaryBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[s.btn, disabled && s.btnDisabled]} onPress={onPress} activeOpacity={0.8} disabled={disabled}>
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SummaryRow({ icon, label, value, ok }: { icon: any; label: string; value: string; ok: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Ionicons name={icon} size={16} color={ok ? "#22c55e" : "#475569"} />
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, ok && s.summaryValueOk]}>{value}</Text>
      <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={16} color={ok ? "#22c55e" : "#475569"} />
    </View>
  );
}

function FeatureRow({ icon, color, title, desc }: { icon: any; color: string; title: string; desc: string }) {
  return (
    <View style={s.featureRow}>
      <View style={[s.featureIcon, { backgroundColor: color + "22", borderColor: color + "44" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.featureTitle}>{title}</Text>
        <Text style={s.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function suggestGroupName(devs: Device[]): string {
  const locs = devs.map(d => d.location?.trim() ?? "").filter(Boolean);
  if (locs.length === 0) return "";

  // All devices have the same location → "Kinkiety [location]"
  if (new Set(locs.map(l => l.toLowerCase())).size === 1) {
    return `Kinkiety ${locs[0].toLowerCase()}`;
  }

  // Find a shared keyword among the locations
  const keywords = ["garaż", "drzwi", "taras", "ogród", "wejście", "balkon"];
  for (const kw of keywords) {
    if (locs.filter(l => l.toLowerCase().includes(kw)).length >= 2) {
      return `Kinkiety ${kw}`;
    }
  }

  // Fallback: use first device's location
  return `Kinkiety ${locs[0].toLowerCase()}`;
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#0f172a" },
  scroll: { padding: 20, paddingBottom: 60 },

  header:   { marginBottom: 8, alignItems: "center" },
  title:    { color: "#f1f5f9", fontSize: 20, fontWeight: "700" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 4 },

  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  dot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: "#334155" },
  dotActive: { backgroundColor: "#6366f1" },

  card:    { backgroundColor: "#1e293b", borderRadius: 16, padding: 24, gap: 12 },
  icon:    { alignSelf: "center", marginBottom: 4 },
  heading: { color: "#f1f5f9", fontSize: 22, fontWeight: "700", textAlign: "center" },
  body:    { color: "#94a3b8", fontSize: 15, lineHeight: 22 },
  label:   { color: "#cbd5e1", fontSize: 13, fontWeight: "600", marginTop: 4 },

  infoRow:  { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0f172a", borderRadius: 10, padding: 10 },
  infoText: { color: "#86efac", fontSize: 14, flex: 1 },

  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  deviceChip:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0f172a", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#334155" },
  deviceChipText: { color: "#a5b4fc", fontSize: 13 },

  input: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    padding: 12,
    color: "#f1f5f9",
    fontSize: 15,
  },

  deviceRow:      { flexDirection: "row", alignItems: "center", gap: 0, backgroundColor: "#0f172a", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#334155" },
  deviceRowText:  { color: "#f1f5f9", fontSize: 14, flex: 1 },
  deviceRowLoc:   { color: "#64748b", fontSize: 12 },
  checkbox:       { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#334155", backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center", marginRight: 10 },
  checkboxChecked:{ borderColor: "#6366f1", backgroundColor: "#6366f1" },

  summaryBox: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, gap: 8 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryLabel: { color: "#94a3b8", fontSize: 14, flex: 1 },
  summaryValue: { color: "#64748b", fontSize: 14 },
  summaryValueOk: { color: "#86efac" },

  btn:         { backgroundColor: "#6366f1", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipBtn:     { alignItems: "center", paddingVertical: 8 },
  skipText:    { color: "#64748b", fontSize: 14, textAlign: "center" },

  // Welcome hero
  heroWrap:   { alignItems: "center", marginBottom: 8 },
  heroCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", shadowColor: "#6366f1", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  heroSub:    { color: "#64748b", fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: -4 },

  // Feature rows
  featureList: { gap: 14, marginVertical: 4 },
  featureRow:  { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  featureIcon: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featureTitle:{ color: "#f1f5f9", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featureDesc: { color: "#64748b", fontSize: 13, lineHeight: 18 },

  // Check step
  statusBar:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(34,197,94,0.08)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", paddingHorizontal: 14, paddingVertical: 10 },
  statusBarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDotGreen:{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  statusBarText: { color: "#86efac", fontSize: 14, fontWeight: "600" },
  statusBarIp:   { color: "#475569", fontSize: 12, fontFamily: "monospace" as any },

  devFoundWrap:  { flexDirection: "row", alignItems: "flex-start", gap: 14, backgroundColor: "#0f172a", borderRadius: 12, padding: 14 },
  devFoundTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" },
  devFoundSub:   { color: "#64748b", fontSize: 13, marginTop: 2, lineHeight: 18 },

  devList:       { backgroundColor: "#0f172a", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#1e293b" },
  devListRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  devListRowBorder: { borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  devListDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: "#6366f1" },
  devListName:   { color: "#f1f5f9", fontSize: 14, fontWeight: "600", flex: 1 },
  devListIp:     { color: "#475569", fontSize: 12 },
});
