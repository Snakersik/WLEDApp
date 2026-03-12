// app/(tabs)/schedules.tsx — Harmonogramy (hub-only)
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import { useAuth } from "../../src/context/AuthContext";
import { useHub } from "../../src/context/HubContext";
import { C } from "../../src/ui/theme";
import { PresetPreviewModal } from "../../src/components/PresetPreviewModal";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";

const DAY_LABELS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ── Types ─────────────────────────────────────────────────────

interface HubState {
  on: boolean;
  bri?: number;
  fx?: number;
  sx?: number;
  ix?: number;
  col?: number[];
}

interface Schedule {
  id: string;
  name: string;
  target_type: string;
  target_id: string;
  days: number[];
  date?: string;   // "YYYY-MM-DD" — specific date (overrides days)
  time: string;    // "HH:MM"
  enabled: boolean;
  state: HubState;
}

interface Preset {
  id: string;
  name: string;
  wled_fx: number;
  bri: number;
  color: number[];
  sx: number;
  ix: number;
  color_locked: boolean;
  category?: string;
}

interface Group { id: string; name: string; }

// ── Helpers ────────────────────────────────────────────────────

function fmtDays(days: number[]): string {
  if (days.length === 0) return "Brak dni";
  if (days.length === 7) return "Codziennie";
  const wkd = [1,2,3,4,5];
  if (wkd.every(d => days.includes(d)) && days.length === 5) return "Pon–Pt";
  return [...days].sort().map(d => DAY_LABELS[d]).join(", ");
}

function fmtDate(d: string): string {
  const [y, m, dd] = d.split("-");
  return `${dd}.${m}.${y}`;
}

function dateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function resolvePreset(preset: Preset, on: boolean): HubState {
  return {
    on,
    bri: preset.bri,
    fx:  preset.wled_fx,
    sx:  preset.sx,
    ix:  preset.ix,
    col: preset.color_locked ? undefined : preset.color,
  };
}

// ── Form state type ─────────────────────────────────────────────

interface FormState {
  name: string;
  target_type: "group" | "all";
  target_id: string;
  date_mode: "days" | "specific";
  days: number[];
  date: string | null;
  time: string;
  enabled: boolean;
  on: boolean;
  preset_id: string | null;
}

const defaultForm = (): FormState => ({
  name: "", target_type: "group", target_id: "",
  date_mode: "days", days: [1,2,3,4,5], date: null,
  time: "22:00", enabled: true,
  on: true, preset_id: null,
});

// ── Main component ─────────────────────────────────────────────

export default function SchedulesScreen() {
  const { token } = useAuth() as any;
  const { hubIp }  = useHub();

  const [schedules,  setSchedules]  = useState<Schedule[]>([]);
  const [presets,    setPresets]    = useState<Preset[]>([]);
  const [groups,     setGroups]     = useState<Group[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hubOffline, setHubOffline] = useState(false);

  const [modalOpen,      setModalOpen]      = useState(false);
  const [editId,         setEditId]         = useState<string | null>(null);
  const [form,           setForm]           = useState<FormState>(defaultForm());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [previewPreset,  setPreviewPreset]  = useState<Preset | null>(null);

  // Android hardware back button closes modal
  useEffect(() => {
    if (!modalOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setModalOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [modalOpen]);

  // ── Fetch ───────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const preRes = await axios.get(`${API_URL}/presets`, { headers });
      setPresets(preRes.data ?? []);

      if (hubIp) {
        try {
          const schCtrl = new AbortController(); const schT = setTimeout(() => schCtrl.abort(), 3000);
          const grpCtrl = new AbortController(); const grpT = setTimeout(() => grpCtrl.abort(), 3000);
          const [schRes, grpRes] = await Promise.all([
            fetch(`http://${hubIp}/schedules`, { signal: schCtrl.signal }).finally(() => clearTimeout(schT)),
            fetch(`http://${hubIp}/groups`,    { signal: grpCtrl.signal }).finally(() => clearTimeout(grpT)),
          ]);
          if (schRes.ok) setSchedules(await schRes.json());
          if (grpRes.ok) setGroups(await grpRes.json());
          setHubOffline(!schRes.ok);
        } catch {
          setHubOffline(true);
        }
      }
    } catch (e) {
      console.error("Schedules fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, hubIp]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── CRUD helpers ────────────────────────────────────────────

  const hubFetch = async (path: string, init?: RequestInit) => {
    if (!hubIp) throw new Error("Brak IP huba");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      return await fetch(`http://${hubIp}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
    } finally {
      clearTimeout(t);
    }
  };

  const toggleSchedule = async (sc: Schedule) => {
    try {
      const res = await hubFetch(`/schedules/${sc.id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSchedules(prev => prev.map(x => x.id === sc.id ? { ...x, enabled: data.enabled } : x));
    } catch {
      Alert.alert("Błąd", "Nie można zmienić statusu");
    }
  };

  const deleteSchedule = (sc: Schedule) => {
    Alert.alert("Usuń harmonogram", `Usunąć "${sc.name}"?`, [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Usuń", style: "destructive",
        onPress: async () => {
          try {
            await hubFetch(`/schedules/${sc.id}`, { method: "DELETE" });
            setSchedules(prev => prev.filter(x => x.id !== sc.id));
          } catch {
            Alert.alert("Błąd", "Nie można usunąć harmonogramu");
          }
        },
      },
    ]);
  };

  // ── Modal ───────────────────────────────────────────────────

  const openCreate = () => {
    setEditId(null);
    setForm({ ...defaultForm(), target_id: groups[0]?.id ?? "" });
    setModalOpen(true);
  };

  const openEdit = (sc: Schedule) => {
    const matchPreset = presets.find(p => p.wled_fx === sc.state.fx) ?? null;
    setEditId(sc.id);
    setForm({
      name:        sc.name,
      target_type: (sc.target_type as "group" | "all"),
      target_id:   sc.target_id,
      date_mode:   sc.date ? "specific" : "days",
      days:        sc.days,
      date:        sc.date ?? null,
      time:        sc.time,
      enabled:     sc.enabled,
      on:          sc.state.on,
      preset_id:   matchPreset?.id ?? null,
    });
    setModalOpen(true);
  };

  const saveSchedule = async () => {
    if (!form.name.trim()) { Alert.alert("Błąd", "Podaj nazwę"); return; }
    if (form.date_mode === "days" && (form.days?.length ?? 0) === 0) {
      Alert.alert("Błąd", "Wybierz co najmniej jeden dzień"); return;
    }
    if (form.date_mode === "specific" && !form.date) {
      Alert.alert("Błąd", "Wybierz datę"); return;
    }
    if (!hubIp) { Alert.alert("Błąd", "Hub offline"); return; }

    // Duplicate check — same target + same time + overlapping days/date
    const conflict = schedules.find(sc => {
      if (editId && sc.id === editId) return false;
      if (sc.target_type !== form.target_type) return false;
      if (form.target_type === "group" && sc.target_id !== form.target_id) return false;
      if (sc.time !== form.time) return false;
      if (form.date_mode === "specific") return sc.date === form.date;
      return form.days.some(d => sc.days.includes(d));
    });
    if (conflict) {
      Alert.alert(
        "Konflikt harmonogramów",
        `"${conflict.name}" już istnieje dla tego celu o tej godzinie. Zmień godzinę lub dni.`,
      );
      return;
    }

    const preset = form.preset_id ? presets.find(p => p.id === form.preset_id) : null;
    const state: HubState = preset ? resolvePreset(preset, form.on) : { on: form.on };

    const body: Record<string, unknown> = {
      name:        form.name.trim(),
      target_type: form.target_type,
      target_id:   form.target_id,
      time:        form.time,
      enabled:     form.enabled,
      state,
    };

    if (form.date_mode === "specific" && form.date) {
      body.date = form.date;
      body.days = [];
    } else {
      body.days = form.days;
    }

    setSaving(true);
    try {
      const res = editId
        ? await hubFetch(`/schedules/${editId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await hubFetch("/schedules", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setModalOpen(false);
      fetchAll();
    } catch {
      Alert.alert("Błąd", "Nie można zapisać harmonogramu");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day],
    }));
  };

  const handleTimeChange = (_: any, date?: Date) => {
    if (Platform.OS === "android") setShowTimePicker(false);
    if (!date) return;
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    setForm(f => ({ ...f, time: `${h}:${m}` }));
  };

  const handleDateChange = (_: any, date?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (!date) return;
    setForm(f => ({ ...f, date: dateToYMD(date) }));
  };

  const getTargetName = (sc: Schedule) =>
    sc.target_type === "group"
      ? (groups.find(g => g.id === sc.target_id)?.name ?? "Nieznana grupa")
      : "Wszystkie";

  const getPresetName = (sc: Schedule) =>
    presets.find(p => p.wled_fx === sc.state.fx)?.name ?? null;

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const timeDate = (() => {
    const [h, m] = (form.time ?? "22:00").split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
  })();

  const specificDateObj = form.date ? new Date(form.date + "T12:00:00") : new Date();

  const targetOptions = form.target_type === "group"
    ? groups.map(g => ({ id: g.id, label: g.name }))
    : [];

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Harmonogramy</Text>
          <TouchableOpacity style={s.addBtn} onPress={openCreate} disabled={!hubIp}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {hubOffline && (
          <View style={s.offlineBanner}>
            <Ionicons name="wifi-outline" size={16} color={C.amber} />
            <Text style={s.offlineText}>Hub offline — harmonogramy niedostępne</Text>
          </View>
        )}

        {schedules.length === 0 && !hubOffline ? (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={64} color={C.text3} />
            <Text style={s.emptyTitle}>Brak harmonogramów</Text>
            <Text style={s.emptyText}>Ustaw automatyczne włączanie efektów o określonych porach</Text>
            <TouchableOpacity style={s.addBtn2} onPress={openCreate} disabled={!hubIp}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.addBtnText}>Dodaj harmonogram</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {schedules.map(sc => (
              <TouchableOpacity key={sc.id} style={s.card} onPress={() => openEdit(sc)} activeOpacity={0.8}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{sc.name}</Text>
                    <Text style={s.cardTarget}>
                      {sc.target_type === "group" ? "Grupa" : "Wszystkie"}: {getTargetName(sc)}
                    </Text>
                    {sc.date
                      ? <Text style={s.cardDays}>{fmtDate(sc.date)}</Text>
                      : <Text style={s.cardDays}>{fmtDays(sc.days)}</Text>
                    }
                    {getPresetName(sc) && (
                      <Text style={s.cardPreset}>Efekt: {getPresetName(sc)}</Text>
                    )}
                  </View>
                  <View style={s.cardRight}>
                    <Text style={[s.cardTime, sc.state.on ? s.cardTimeOn : s.cardTimeOff]}>
                      {sc.time}
                    </Text>
                    <Switch
                      value={sc.enabled}
                      onValueChange={() => toggleSchedule(sc)}
                      trackColor={{ false: C.bgCard2, true: C.primary }}
                      thumbColor={sc.enabled ? C.primary2 : C.text3}
                    />
                    <TouchableOpacity onPress={() => deleteSchedule(sc)} style={s.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={C.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Add / Edit modal ─────────────────────────────────── */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={s.overlay}>
          <ScrollView style={s.modal} contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">

            {/* Header row with X button */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editId ? "Edytuj harmonogram" : "Nowy harmonogram"}</Text>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setModalOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={C.text2} />
              </TouchableOpacity>
            </View>

            {/* Name */}
            <Text style={s.label}>Nazwa</Text>
            <TextInput
              style={s.input}
              placeholder="np. Wieczorny tryb"
              placeholderTextColor={C.text3}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
            />

            {/* Target type */}
            <Text style={s.label}>Cel</Text>
            <View style={s.toggle}>
              {(["group", "all"] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[s.toggleBtn, form.target_type === type && s.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, target_type: type, target_id: "" }))}
                >
                  <Text style={[s.toggleBtnText, form.target_type === type && s.toggleBtnTextActive]}>
                    {type === "group" ? "Grupa" : "Wszystkie"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Group picker */}
            {form.target_type === "group" && (
              <>
                <Text style={s.label}>Grupa</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pickerRow}>
                  {targetOptions.map(opt => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[s.chip, form.target_id === opt.id && s.chipActive]}
                      onPress={() => setForm(f => ({ ...f, target_id: opt.id }))}
                    >
                      <Text style={[s.chipText, form.target_id === opt.id && s.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                  {targetOptions.length === 0 && (
                    <Text style={s.hintText}>Brak grup</Text>
                  )}
                </ScrollView>
              </>
            )}

            {/* Date mode selector */}
            <Text style={s.label}>Powtarzanie</Text>
            <View style={s.toggle}>
              {(["days", "specific"] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[s.toggleBtn, form.date_mode === mode && s.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, date_mode: mode }))}
                >
                  <Text style={[s.toggleBtnText, form.date_mode === mode && s.toggleBtnTextActive]}>
                    {mode === "days" ? "Dni tygodnia" : "Konkretna data"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Days of week */}
            {form.date_mode === "days" && (
              <>
                <Text style={s.label}>Dni tygodnia</Text>
                <View style={s.daysRow}>
                  {ALL_DAYS.map(day => {
                    const active = form.days.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[s.dayBtn, active && s.dayBtnActive]}
                        onPress={() => toggleDay(day)}
                      >
                        <Text style={[s.dayBtnText, active && s.dayBtnTextActive]}>{DAY_LABELS[day]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Specific date */}
            {form.date_mode === "specific" && (
              <>
                <Text style={s.label}>Data</Text>
                {Platform.OS === "android" ? (
                  <TouchableOpacity style={s.timeBtn} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={18} color={C.primary2} />
                    <Text style={s.timeBtnText}>
                      {form.date ? fmtDate(form.date) : "Wybierz datę…"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <DateTimePicker
                    value={specificDateObj}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    themeVariant="dark"
                    minimumDate={new Date()}
                    style={{ alignSelf: "flex-start" }}
                  />
                )}
                {showDatePicker && Platform.OS === "android" && (
                  <DateTimePicker
                    value={specificDateObj}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                    minimumDate={new Date()}
                  />
                )}
              </>
            )}

            {/* Time */}
            <Text style={s.label}>Godzina</Text>
            {Platform.OS === "android" ? (
              <TouchableOpacity style={s.timeBtn} onPress={() => setShowTimePicker(true)}>
                <Ionicons name="time-outline" size={18} color={C.primary2} />
                <Text style={s.timeBtnText}>{form.time}</Text>
              </TouchableOpacity>
            ) : (
              <DateTimePicker
                value={timeDate}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                themeVariant="dark"
                style={{ alignSelf: "flex-start" }}
              />
            )}
            {showTimePicker && Platform.OS === "android" && (
              <DateTimePicker value={timeDate} mode="time" display="default" onChange={handleTimeChange} />
            )}

            {/* Action — explicit Włącz / Wyłącz buttons */}
            <Text style={s.label}>Akcja</Text>
            <View style={s.actionBtns}>
              <TouchableOpacity
                style={[s.actionBtn, form.on && s.actionBtnOn]}
                onPress={() => setForm(f => ({ ...f, on: true }))}
              >
                <Ionicons name="power" size={16} color={form.on ? "#fff" : C.text3} />
                <Text style={[s.actionBtnText, form.on && s.actionBtnTextActive]}>Włącz</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, !form.on && s.actionBtnOff]}
                onPress={() => setForm(f => ({ ...f, on: false }))}
              >
                <Ionicons name="power-outline" size={16} color={!form.on ? "#fff" : C.text3} />
                <Text style={[s.actionBtnText, !form.on && s.actionBtnTextActive]}>Wyłącz</Text>
              </TouchableOpacity>
            </View>

            {/* Effect picker — vertical list with preview buttons */}
            {form.on && (
              <>
                <Text style={[s.label, { marginTop: 8 }]}>Efekt (opcjonalnie)</Text>
                <View style={s.effectList}>
                  <TouchableOpacity
                    style={[s.effectRow, !form.preset_id && s.effectRowActive]}
                    onPress={() => setForm(f => ({ ...f, preset_id: null }))}
                  >
                    <View style={s.effectRowLeft}>
                      <View style={[s.effectDot, !form.preset_id && s.effectDotActive]} />
                      <Text style={[s.effectRowText, !form.preset_id && s.effectRowTextActive]}>
                        Brak efektu
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {presets.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[s.effectRow, form.preset_id === p.id && s.effectRowActive]}
                      onPress={() => setForm(f => ({ ...f, preset_id: p.id }))}
                    >
                      <View style={s.effectRowLeft}>
                        <View style={[s.effectDot, form.preset_id === p.id && s.effectDotActive]} />
                        <Text style={[s.effectRowText, form.preset_id === p.id && s.effectRowTextActive]} numberOfLines={1}>
                          {p.name}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={s.previewBtn}
                        hitSlop={8}
                        onPress={() => setPreviewPreset(p)}
                      >
                        <Ionicons name="eye-outline" size={16} color={C.text3} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Buttons */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancel} onPress={() => setModalOpen(false)}>
                <Text style={s.btnCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnSave} onPress={saveSchedule} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnSaveText}>{editId ? "Zapisz" : "Dodaj"}</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Effect preview modal */}
      <PresetPreviewModal
        visible={!!previewPreset}
        onClose={() => setPreviewPreset(null)}
        preset={previewPreset}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  center:     { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" },
  scroll:     { padding: 16, paddingBottom: 120, gap: 16 },

  header:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title:      { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  addBtn:     { backgroundColor: C.primary, borderRadius: 12, padding: 8 },
  addBtn2:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.amber + "44", padding: 12 },
  offlineText:   { fontSize: 13, color: C.amber, flex: 1 },

  empty:      { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: C.text2, marginTop: 8 },
  emptyText:  { fontSize: 14, color: C.text3, textAlign: "center", maxWidth: 260 },

  list:       { gap: 12 },

  card:       { backgroundColor: C.bgCard2, borderRadius: 18, borderWidth: 1, borderColor: C.borderMd, padding: 16 },
  cardTop:    { flexDirection: "row", gap: 12 },
  cardName:   { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 4 },
  cardTarget: { fontSize: 13, color: C.text2, marginBottom: 2 },
  cardDays:   { fontSize: 12, color: C.primary2, marginBottom: 2 },
  cardPreset: { fontSize: 12, color: C.amber },
  cardRight:  { alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  cardTime:   { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  cardTimeOn: { color: C.text },
  cardTimeOff:{ color: C.text3 },
  deleteBtn:  { padding: 4 },

  overlay:    { flex: 1, backgroundColor: C.bgOverlay, justifyContent: "flex-end" },
  modal:      { backgroundColor: "#0b1120", maxHeight: "92%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.borderMd },
  modalScroll:{ padding: 24, gap: 4, paddingBottom: 40 },

  modalHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle:    { fontSize: 20, fontWeight: "800", color: C.text },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },

  label:      { fontSize: 12, fontWeight: "700", color: C.text3, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 14, marginBottom: 6 },
  input:      { backgroundColor: C.bgInput, borderRadius: 12, padding: 14, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },

  toggle:         { flexDirection: "row", gap: 8 },
  toggleBtn:      { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center", backgroundColor: C.bgCard },
  toggleBtnActive:{ backgroundColor: "rgba(99,102,241,0.2)", borderColor: C.primary },
  toggleBtnText:  { fontSize: 14, color: C.text2, fontWeight: "600" },
  toggleBtnTextActive: { color: C.primary2 },

  pickerRow:  { marginBottom: 4 },

  chip:           { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgCard, marginRight: 8, marginBottom: 4 },
  chipActive:     { backgroundColor: "rgba(99,102,241,0.2)", borderColor: C.primary },
  chipText:       { fontSize: 13, color: C.text2, fontWeight: "600" },
  chipTextActive: { color: C.primary2 },

  daysRow:          { flexDirection: "row", gap: 6 },
  dayBtn:           { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgCard, alignItems: "center" },
  dayBtnActive:     { backgroundColor: "rgba(99,102,241,0.2)", borderColor: C.primary },
  dayBtnText:       { fontSize: 12, color: C.text2, fontWeight: "700" },
  dayBtnTextActive: { color: C.primary2 },

  timeBtn:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bgInput, borderRadius: 12, borderWidth: 1, borderColor: C.borderMd, padding: 14 },
  timeBtnText:    { fontSize: 20, fontWeight: "800", color: C.text, letterSpacing: -0.5 },

  // Action buttons
  actionBtns:        { flexDirection: "row", gap: 10 },
  actionBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgCard },
  actionBtnOn:       { backgroundColor: "rgba(34,197,94,0.2)", borderColor: "#22c55e" },
  actionBtnOff:      { backgroundColor: "rgba(239,68,68,0.2)", borderColor: "#ef4444" },
  actionBtnText:     { fontSize: 15, fontWeight: "700", color: C.text3 },
  actionBtnTextActive: { color: "#fff" },

  // Effect list
  effectList:         { borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 4 },
  effectRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border + "60", backgroundColor: C.bgCard },
  effectRowActive:    { backgroundColor: "rgba(99,102,241,0.12)" },
  effectRowLeft:      { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  effectDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  effectDotActive:    { backgroundColor: C.primary },
  effectRowText:      { fontSize: 14, color: C.text2, fontWeight: "500", flex: 1 },
  effectRowTextActive:{ color: C.primary2, fontWeight: "700" },
  previewBtn:         { padding: 6, borderRadius: 8, backgroundColor: C.bgCard2 },

  hintText:    { fontSize: 13, color: C.text3, fontStyle: "italic", paddingVertical: 8 },

  modalBtns:     { flexDirection: "row", gap: 10, marginTop: 20 },
  btnCancel:     { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  btnCancelText: { color: C.text2, fontWeight: "600" },
  btnSave:       { flex: 1, padding: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: "center" },
  btnSaveText:   { color: "#fff", fontWeight: "700" },
});
