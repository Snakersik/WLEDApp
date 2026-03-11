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
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  const { token, user } = useAuth() as any;
  const { refreshHub } = useHub();
  const flagKey = `onboarding_completed_${user?.id}`;

  const [step, setStep]           = useState<OStep>("welcome");
  const [loading, setLoading]     = useState(false);

  // Backend state
  const [hub, setHub]             = useState<HubInfo | null>(null);
  const [devices, setDevices]     = useState<Device[]>([]);
  const [hasGroups, setHasGroups] = useState(false);

  // Group form
  const [groupName, setGroupName] = useState("Moje kinkiety");
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
    await AsyncStorage.setItem(flagKey, "1");
    router.replace("/(tabs)/devices");
  }, [router, flagKey]);

  const finishOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(flagKey, "1");
    await refreshHub();
    router.replace("/(tabs)/devices");
  }, [router, refreshHub, flagKey]);

  // ── Group creation ────────────────────────────────────────────
  const createGroup = useCallback(async () => {
    if (!groupName.trim()) {
      Alert.alert("Uzupełnij nazwę", "Podaj nazwę grupy.");
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      Alert.alert("Wybierz urządzenia", "Zaznacz co najmniej jedno urządzenie.");
      return;
    }
    setCreatingGroup(true);
    try {
      await axios.post(
        `${API_URL}/groups`,
        { name: groupName.trim(), device_ids: ids },
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
                <Ionicons name="hardware-chip-outline" size={64} color="#6366f1" style={s.icon} />
                <Text style={s.heading}>Witaj w systemie!</Text>
                <Text style={s.body}>
                  Skonfigurujemy Twój system w kilku krokach:{"\n\n"}
                  {"  "}1. Połącz Hub z siecią WiFi{"\n"}
                  {"  "}2. Automatycznie skonfiguruj kinkiety WLED{"\n"}
                  {"  "}3. Utwórz pierwszą grupę sterowania
                </Text>
                <PrimaryBtn
                  label="Rozpocznij konfigurację"
                  onPress={() => router.push("/setup?returnTo=/onboarding" as any)}
                />
                <TouchableOpacity onPress={skipOnboarding} style={s.skipBtn}>
                  <Text style={s.skipText}>Pomiń na razie</Text>
                </TouchableOpacity>
              </Card>
            )}

            {/* ── CHECK ── */}
            {step === "check" && (
              <Card>
                <Ionicons name="checkmark-circle" size={56} color="#22c55e" style={s.icon} />
                <Text style={s.heading}>Hub skonfigurowany!</Text>

                {hub && (
                  <View style={s.infoRow}>
                    <Ionicons name="hardware-chip" size={16} color="#22c55e" />
                    <Text style={s.infoText}>{hub.name ?? "Hub"} — {hub.ip_address}</Text>
                  </View>
                )}

                {devices.length > 0 ? (
                  <>
                    <Text style={s.label}>Znalezione urządzenia ({devices.length}):</Text>
                    <View style={s.chipRow}>
                      {devices.map(d => (
                        <View key={d.id} style={s.deviceChip}>
                          <Ionicons name="bulb" size={12} color="#a5b4fc" />
                          <Text style={s.deviceChipText}>{d.name}</Text>
                        </View>
                      ))}
                    </View>
                    <PrimaryBtn label="Dalej — utwórz grupę" onPress={() => setStep("group")} />
                  </>
                ) : (
                  <>
                    <Text style={s.body}>
                      Hub jest online, ale nie znaleziono jeszcze kinkietów.{"\n"}
                      Upewnij się, że kinkiety są włączone i spróbuj ponownie.
                    </Text>
                    <PrimaryBtn label="Wróć do setupu" onPress={() => router.push("/setup?returnTo=/onboarding" as any)} />
                    <TouchableOpacity onPress={() => setStep("group")} style={s.skipBtn}>
                      <Text style={s.skipText}>Pomiń — przejdź dalej</Text>
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
                  Grupa pozwala sterować wieloma kinkietami jednocześnie.
                </Text>

                <Text style={s.label}>Nazwa grupy</Text>
                <TextInput
                  style={s.input}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="np. Salon"
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
  skipText:    { color: "#64748b", fontSize: 14 },
});
