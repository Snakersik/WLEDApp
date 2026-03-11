// app/(tabs)/hubs.tsx — Hub management panel
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
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
import { useAuth } from "../../src/context/AuthContext";
import { useHub } from "../../src/context/HubContext";
import { useLanguage } from "../../src/context/LanguageContext";
import { C } from "../../src/ui/theme";
import { startLanScan, waitForLanScan } from "../../src/services/bleService";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";

interface Hub {
  id: string;
  name: string;
  ip_address: string;
  is_online: boolean;
}

interface HubInfo {
  name: string;
  ver: string;
  leds: { count: number };
}

interface Device {
  id: string;
  name: string;
  ip_address: string;
}

export default function HubScreen() {
  const { token } = useAuth() as any;
  const { hubIp, refreshHub } = useHub();
  const { t } = useLanguage();
  const router = useRouter();

  const [hub, setHub] = useState<Hub | null>(null);
  const [hubInfo, setHubInfo] = useState<HubInfo | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hubOnline, setHubOnline] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edit IP modal
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIp, setEditIp] = useState("");
  const [saving, setSaving] = useState(false);


  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<Array<{ ip: string; name: string }>>([]);

  const pushTz = useCallback(async (hubIpAddr: string) => {
    try {
      const tz_offset = -new Date().getTimezoneOffset() * 60;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        await fetch(`http://${hubIpAddr}/tz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({ tz_offset }),
        });
      } finally { clearTimeout(t); }
    } catch {
      // non-critical
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/hubs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hubs: Hub[] = res.data ?? [];
      const h = hubs[0] ?? null;
      setHub(h);

      if (h) {
        try {
          const devRes = await axios.get(`${API_URL}/devices?hub_id=${h.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setDevices(devRes.data ?? []);
        } catch {
          // devices fetch failure doesn't block hub probe
        }

        // probe hub /json/info — independent of devices fetch
        try {
          const ip = hubIp || h.ip_address;
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 5000);
          try {
            const infoRes = await fetch(`http://${ip}/json/info`, { signal: ctrl.signal });
            clearTimeout(t);
            if (infoRes.ok) {
              setHubInfo(await infoRes.json());
              setHubOnline(true);
              pushTz(ip);
            } else {
              setHubOnline(false);
            }
          } catch {
            clearTimeout(t);
            setHubOnline(false);
            setHubInfo(null);
          }
        } catch {
          setHubOnline(false);
          setHubInfo(null);
        }
      }
    } catch (e) {
      console.error("Hub load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, hubIp]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleScan = async () => {
    const ip = hubIp || hub?.ip_address;
    if (!ip) { Alert.alert(t("error"), t("hubOfflineNoIp")); return; }
    setScanning(true);
    setScanResults([]);
    try {
      await startLanScan(ip);
      const result = await waitForLanScan(ip, 30_000);
      if (result.error === "timeout") {
        Alert.alert("Timeout", t("scanTimeout"));
      } else {
        setScanResults(result.found);
        if (result.found.length === 0) Alert.alert(t("noDevices"), t("noFixturesFound"));
      }
    } catch (e) {
      Alert.alert(t("error"), t("scanFailed"));
    } finally {
      setScanning(false);
    }
  };

  const handleAddDevice = async (found: { ip: string; name: string }) => {
    if (!hub) return;
    try {
      await axios.post(
        `${API_URL}/devices`,
        { hub_id: hub.id, name: found.name || `${t("fixtures")} ${found.ip}`, ip_address: found.ip, led_count: 30 },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setScanResults(prev => prev.filter(r => r.ip !== found.ip));
      load();
    } catch {
      Alert.alert(t("error"), t("failedToAddDevice"));
    }
  };

  const openEdit = () => {
    if (!hub) return;
    setEditName(hub.name);
    setEditIp(hub.ip_address);
    setEditModal(true);
  };

  const handleRemoveHub = () => {
    if (!hub) return;
    Alert.alert(
      "Usuń hub",
      "Hub zostanie odłączony od konta i zresetowany do trybu parowania BLE. Kontynuować?",
      [
        { text: t("cancel"), style: "cancel" },
        { text: "Usuń", style: "destructive", onPress: async () => {
          // 1. DELETE /wifi on hub (if reachable) — resets to BLE/AP mode
          const ip = hubIp || hub.ip_address;
          if (ip) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 3000);
            try { await fetch(`http://${ip}/wifi`, { method: "DELETE", signal: ctrl.signal }); } catch {}
            clearTimeout(timer);
          }
          // 2. DELETE hub from backend
          try {
            await axios.delete(`${API_URL}/hubs/${hub.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch {}
          setHub(null);
          setHubInfo(null);
          setHubOnline(false);
          setDevices([]);
          setScanResults([]);
          await refreshHub();
        }},
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!hub || !editName.trim() || !editIp.trim()) return;
    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/hubs/${hub.id}`,
        { name: editName.trim(), ip_address: editIp.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setEditModal(false);
      await refreshHub();
      load();
    } catch {
      Alert.alert(t("error"), t("failedToUpdateHub"));
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>{t("hub")}</Text>
          {hub ? (
            <TouchableOpacity style={s.iconBtn} onPress={openEdit}>
              <Ionicons name="settings-outline" size={22} color={C.text2} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.addBtn} onPress={() => router.push("/setup")}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {!hub ? (
          /* ── No hub ── */
          <View style={s.empty}>
            <Ionicons name="hardware-chip-outline" size={64} color={C.text3} />
            <Text style={s.emptyTitle}>{t("noHub")}</Text>
            <Text style={s.emptyText}>{t("noHubSubtext")}</Text>
            <TouchableOpacity style={s.addBtn2} onPress={() => router.push("/setup")}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.addBtnText}>{t("addHub")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Hub status card ── */}
            <View style={s.card}>
              <View style={s.cardRow}>
                <View style={[s.statusDot, hubOnline ? s.dotOnline : s.dotOffline]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.hubName}>{hub.name}</Text>
                  <Text style={s.hubIp}>{hub.ip_address}</Text>
                </View>
              </View>
              {hubInfo && (
                <View style={s.infoRow}>
                  <InfoChip icon="code-slash-outline" label={`v${hubInfo.ver}`} />
                  <InfoChip icon="sparkles-outline" label={`${hubInfo.leds?.count ?? "?"} LED`} />
                  <InfoChip icon="wifi-outline" label={hubOnline ? t("online") : t("offline")} color={hubOnline ? C.green : C.text3} />
                </View>
              )}
              {!hubOnline && !hubInfo && (
                <Text style={s.offlineHint}>{t("hubOfflineHint")}</Text>
              )}
            </View>

            {/* ── Devices section ── */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{t("fixtures")} ({devices.length})</Text>
                <TouchableOpacity
                  style={[s.scanBtn, scanning && s.scanBtnDisabled]}
                  onPress={handleScan}
                  disabled={scanning || !hubOnline}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color={C.primary2} />
                  ) : (
                    <Ionicons name="scan-outline" size={16} color={hubOnline ? C.primary2 : C.text3} />
                  )}
                  <Text style={[s.scanBtnText, !hubOnline && { color: C.text3 }]}>
                    {scanning ? t("scanning") : t("scanLan")}
                  </Text>
                </TouchableOpacity>
              </View>

              {devices.length === 0 && scanResults.length === 0 && (
                <Text style={s.emptyText2}>{t("noFixtures")}</Text>
              )}

              {devices.map((d) => (
                <View key={d.id} style={s.deviceRow}>
                  <View style={[s.statusDot, s.dotOnline, { marginTop: 2 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.deviceName}>{d.name}</Text>
                    <Text style={s.deviceIp}>{d.ip_address}</Text>
                  </View>
                  <Ionicons name="bulb-outline" size={18} color={C.text3} />
                </View>
              ))}

              {/* Scan results — devices not yet added */}
              {scanResults.length > 0 && (
                <>
                  <Text style={s.foundTitle}>{t("foundOnNetwork")}</Text>
                  {scanResults.map((r) => {
                    const alreadyAdded = devices.some(d => d.ip_address === r.ip);
                    if (alreadyAdded) return null;
                    return (
                      <View key={r.ip} style={[s.deviceRow, s.foundRow]}>
                        <View style={[s.statusDot, { backgroundColor: C.amber }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.deviceName}>{r.name || r.ip}</Text>
                          <Text style={s.deviceIp}>{r.ip}</Text>
                        </View>
                        <TouchableOpacity style={s.addDeviceBtn} onPress={() => handleAddDevice(r)}>
                          <Ionicons name="add" size={16} color="#fff" />
                          <Text style={s.addDeviceBtnText}>{t("add")}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )}
            </View>

            {/* ── Setup button ── */}
            <TouchableOpacity style={s.setupBtn} onPress={() => router.push("/setup")}>
              <Ionicons name="hardware-chip-outline" size={18} color={C.primary2} />
              <Text style={s.setupBtnText}>{t("configureFixture")}</Text>
            </TouchableOpacity>

            {/* ── Restart hub ── */}
            {restarting ? (
              <View style={s.restartingRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={s.restartingText}>{t("restarting")}</Text>
              </View>
            ) : hubOnline ? (
              <TouchableOpacity
                style={s.restartBtn}
                onPress={() => Alert.alert(t("restartHubTitle"), t("restartHubConfirm"), [
                  { text: t("cancel"), style: "cancel" },
                  { text: t("restart"), style: "destructive", onPress: async () => {
                    const ip = hubIp || hub?.ip_address;
                    if (!ip) return;
                    // Send restart (connection will drop — that's expected)
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), 3000);
                    try { await fetch(`http://${ip}/restart`, { method: "POST", signal: ctrl.signal }); } catch {}
                    clearTimeout(t);
                    setHubOnline(false);
                    setHubInfo(null);
                    setRestarting(true);
                    // Poll every 3s until hub comes back online
                    if (pollRef.current) clearInterval(pollRef.current);
                    pollRef.current = setInterval(async () => {
                      try {
                        const c = new AbortController();
                        const pt = setTimeout(() => c.abort(), 3000);
                        try {
                          const res = await fetch(`http://${ip}/json/info`, { signal: c.signal });
                          clearTimeout(pt);
                          if (res.ok) {
                            const info = await res.json();
                            setHubInfo(info);
                            setHubOnline(true);
                            setRestarting(false);
                            clearInterval(pollRef.current!);
                            pollRef.current = null;
                            pushTz(ip);
                          }
                        } catch { clearTimeout(pt); }
                      } catch {}
                    }, 3000);
                  }},
                ])}
              >
                <Ionicons name="refresh-outline" size={18} color={C.red} />
                <Text style={s.restartBtnText}>{t("restartHub")}</Text>
              </TouchableOpacity>
            ) : null}

            {/* ── Remove hub ── */}
            <TouchableOpacity style={s.removeHubBtn} onPress={handleRemoveHub}>
              <Ionicons name="trash-outline" size={18} color={C.red} />
              <Text style={s.removeHubBtnText}>Usuń hub z aplikacji</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Edit hub modal */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{t("hubSettings")}</Text>
            <TextInput
              style={s.input}
              placeholder={t("name")}
              placeholderTextColor={C.text3}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={s.input}
              placeholder={t("ipAddress")}
              placeholderTextColor={C.text3}
              value={editIp}
              onChangeText={setEditIp}
              keyboardType="numeric"
              autoCapitalize="none"
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.btnCancel} onPress={() => setEditModal(false)}>
                <Text style={s.btnCancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnSave} onPress={handleSaveEdit} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnSaveText}>{t("save")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function InfoChip({ icon, label, color }: { icon: string; label: string; color?: string }) {
  return (
    <View style={s.chip}>
      <Ionicons name={icon as any} size={13} color={color ?? C.text2} />
      <Text style={[s.chipText, color ? { color } : {}]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  center:     { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" },
  scroll:     { padding: 16, paddingBottom: 120, gap: 16 },

  header:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title:      { fontSize: 28, fontWeight: "800", color: C.text, letterSpacing: -0.5 },
  iconBtn:    { padding: 8 },
  addBtn:     { backgroundColor: C.primary, borderRadius: 12, padding: 8 },
  addBtn2:    { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  empty:      { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: C.text2 },
  emptyText:  { fontSize: 14, color: C.text3, textAlign: "center" },
  emptyText2: { fontSize: 13, color: C.text3, marginTop: 4, marginBottom: 8 },

  // Hub card
  card:       { backgroundColor: C.bgCard2, borderRadius: 18, borderWidth: 1, borderColor: C.borderMd, padding: 18, gap: 12 },
  cardRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  statusDot:  { width: 10, height: 10, borderRadius: 5, marginTop: 1 },
  dotOnline:  { backgroundColor: C.green },
  dotOffline: { backgroundColor: C.text3 },
  hubName:    { fontSize: 18, fontWeight: "700", color: C.text },
  hubIp:      { fontSize: 13, color: C.text2, marginTop: 1 },
  infoRow:    { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  offlineHint:{ fontSize: 13, color: C.text3, fontStyle: "italic" },

  chip:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.bgCard, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
  chipText:   { fontSize: 12, color: C.text2, fontWeight: "600" },

  // Section
  section:      { gap: 10 },
  sectionHeader:{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.text2, letterSpacing: 0.2 },

  scanBtn:        { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: C.borderMd, backgroundColor: C.bgCard },
  scanBtnDisabled:{ opacity: 0.5 },
  scanBtnText:    { fontSize: 13, color: C.primary2, fontWeight: "600" },

  deviceRow:  { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  foundRow:   { borderColor: C.amber + "44" },
  deviceName: { fontSize: 14, fontWeight: "600", color: C.text },
  deviceIp:   { fontSize: 12, color: C.text3, marginTop: 2 },
  foundTitle: { fontSize: 13, color: C.amber, fontWeight: "600", marginTop: 4 },

  addDeviceBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addDeviceBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },

  setupBtn:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1, borderColor: C.borderMd, padding: 16 },
  setupBtnText:  { fontSize: 14, color: C.primary2, fontWeight: "600", flex: 1 },
  restartBtn:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1, borderColor: C.red + "44", padding: 16 },
  restartBtnText: { fontSize: 14, color: C.red, fontWeight: "600", flex: 1 },
  restartingRow:  { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1, borderColor: C.borderMd, padding: 16 },
  restartingText: { fontSize: 14, color: C.text2, fontWeight: "600", flex: 1 },
  removeHubBtn:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1, borderColor: C.red + "66", padding: 16 },
  removeHubBtnText: { fontSize: 14, color: C.red, fontWeight: "600", flex: 1 },

  // Modals
  overlay:       { flex: 1, backgroundColor: C.bgOverlay, justifyContent: "flex-end" },
  modal:         { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, borderWidth: 1, borderColor: C.borderMd },
  modalTitle:    { fontSize: 18, fontWeight: "700", color: C.text },
  input:         { backgroundColor: C.bgInput, borderRadius: 12, padding: 14, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
  modalBtns:     { flexDirection: "row", gap: 10, marginTop: 4 },
  btnCancel:     { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  btnCancelText: { color: C.text2, fontWeight: "600" },
  btnSave:       { flex: 1, padding: 13, borderRadius: 12, backgroundColor: C.primary, alignItems: "center" },
  btnSaveText:   { color: "#fff", fontWeight: "700" },
});
