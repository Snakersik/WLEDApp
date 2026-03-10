import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import axios from "axios";
import { useAuth } from "../../src/context/AuthContext";
import { HubService, HubDevice, HubGroup } from "../../src/services/hubService";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";

const FX_NAMES: Record<number, string> = {
  0: "Solid", 1: "Blink", 2: "Breathe", 3: "Wipe",
  9: "Rainbow", 17: "Twinkle", 25: "Comet", 66: "Fire", 76: "Meteor",
};

interface HubInfo {
  id: string;
  name: string;
  ip_address: string;
  is_online: boolean;
}

export default function HubOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth() as any;

  const [hub, setHub] = useState<HubInfo | null>(null);
  const [hubDevices, setHubDevices] = useState<HubDevice[]>([]);
  const [hubGroups, setHubGroups] = useState<HubGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add device modal
  const [addDevModal, setAddDevModal] = useState(false);
  const [devIp, setDevIp] = useState("");
  const [devName, setDevName] = useState("");
  const [addingDev, setAddingDev] = useState(false);

  // Add group modal
  const [addGroupModal, setAddGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedDevIps, setSelectedDevIps] = useState<string[]>([]);
  const [addingGroup, setAddingGroup] = useState(false);

  // Load hub info from backend then devices/groups from hub
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/hubs/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const h: HubInfo = res.data;
        setHub(h);
        if (h.is_online) {
          const [devs, grps] = await Promise.all([
            HubService.getDevices(h.ip_address),
            HubService.getGroups(h.ip_address),
          ]);
          setHubDevices(devs);
          setHubGroups(grps);
        }
      } catch {
        Alert.alert("Błąd", "Nie można załadować huba");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token]);

  const refresh = useCallback(async () => {
    if (!hub) return;
    setRefreshing(true);
    const [devs, grps] = await Promise.all([
      HubService.getDevices(hub.ip_address),
      HubService.getGroups(hub.ip_address),
    ]);
    setHubDevices(devs);
    setHubGroups(grps);
    setRefreshing(false);
  }, [hub]);

  // ── Add device ───────────────────────────────────────────
  const handleAddDevice = async () => {
    if (!devIp.trim()) {
      Alert.alert("Błąd", "Podaj adres IP kinkietu");
      return;
    }
    setAddingDev(true);
    const dev = await HubService.addDevice(
      hub!.ip_address,
      devIp.trim(),
      devName.trim() || devIp.trim(),
    );
    setAddingDev(false);
    if (dev) {
      setAddDevModal(false);
      setDevIp(""); setDevName("");
      refresh();
    } else {
      Alert.alert("Błąd", "Nie można dodać kinkietu");
    }
  };

  const handleDeleteDevice = (dev: HubDevice) => {
    Alert.alert("Usuń kinkiet", `Usunąć "${dev.name}"?`, [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Usuń", style: "destructive",
        onPress: async () => {
          await HubService.removeDevice(hub!.ip_address, dev.id);
          refresh();
        },
      },
    ]);
  };

  // ── Create group ─────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Błąd", "Podaj nazwę grupy");
      return;
    }
    setAddingGroup(true);
    const g = await HubService.createGroup(
      hub!.ip_address,
      groupName.trim(),
      selectedDevIps,
    );
    setAddingGroup(false);
    if (g) {
      setAddGroupModal(false);
      setGroupName(""); setSelectedDevIps([]);
      refresh();
    } else {
      Alert.alert("Błąd", "Nie można utworzyć grupy");
    }
  };

  const handleDeleteGroup = (g: HubGroup) => {
    Alert.alert("Usuń grupę", `Usunąć "${g.name}"?`, [
      { text: "Anuluj", style: "cancel" },
      {
        text: "Usuń", style: "destructive",
        onPress: async () => {
          await HubService.deleteGroup(hub!.ip_address, g.id);
          refresh();
        },
      },
    ]);
  };

  const toggleDevIp = (ip: string) => {
    setSelectedDevIps(prev =>
      prev.includes(ip) ? prev.filter(x => x !== ip) : [...prev, ip]
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{hub?.name ?? "Hub"}</Text>
          <View style={s.statusRow}>
            <View style={[s.dot, hub?.is_online ? s.dotOn : s.dotOff]} />
            <Text style={s.statusText}>
              {hub?.is_online ? "online" : "offline"} • {hub?.ip_address}
            </Text>
          </View>
        </View>
        {refreshing && <ActivityIndicator size="small" color="#6366f1" />}
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ── Kinkiety ─────────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Kinkiety</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setAddDevModal(true)}
            disabled={!hub?.is_online}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {hubDevices.length === 0 ? (
          <Text style={s.emptyText}>
            {hub?.is_online ? "Brak kinkietów — dodaj urządzenie LED" : "Hub offline"}
          </Text>
        ) : (
          hubDevices.map(dev => (
            <View key={dev.id} style={s.devCard}>
              <View style={s.devLeft}>
                <Ionicons name="bulb-outline" size={20} color="#6366f1" />
                <View>
                  <Text style={s.devName}>{dev.name}</Text>
                  <Text style={s.devIp}>{dev.ip}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteDevice(dev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* ── Grupy ────────────────────────────────────────── */}
        <View style={[s.sectionHeader, { marginTop: 28 }]}>
          <Text style={s.sectionTitle}>Grupy</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => { setSelectedDevIps([]); setAddGroupModal(true); }}
            disabled={!hub?.is_online}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {hubGroups.length === 0 ? (
          <Text style={s.emptyText}>
            {hub?.is_online ? "Brak grup — utwórz grupę z kinkietów" : ""}
          </Text>
        ) : (
          hubGroups.map(g => (
            <TouchableOpacity
              key={g.id}
              style={s.groupCard}
              onPress={() =>
                router.push(
                  `/(hub)/group/${g.id}?hubIp=${hub?.ip_address}&groupName=${encodeURIComponent(g.name)}`
                )
              }
              onLongPress={() => handleDeleteGroup(g)}
            >
              <View style={s.groupLeft}>
                <Ionicons name="layers-outline" size={22} color="#818cf8" />
                <View>
                  <Text style={s.groupName}>{g.name}</Text>
                  <Text style={s.groupSub}>
                    {g.devices.length} kinkiet(y) • {FX_NAMES[g.state.fx] ?? "efekt"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#475569" />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Add device modal ─────────────────────────────── */}
      <Modal visible={addDevModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Dodaj kinkiet</Text>
            <TextInput
              style={s.input}
              placeholder="Adres IP (np. 192.168.10.169)"
              placeholderTextColor="#475569"
              value={devIp}
              onChangeText={setDevIp}
              keyboardType="numeric"
              autoCapitalize="none"
            />
            <TextInput
              style={s.input}
              placeholder="Nazwa (np. Kinkiet lewy)"
              placeholderTextColor="#475569"
              value={devName}
              onChangeText={setDevName}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.btnCancel}
                onPress={() => { setAddDevModal(false); setDevIp(""); setDevName(""); }}
              >
                <Text style={s.btnCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnAdd} onPress={handleAddDevice} disabled={addingDev}>
                {addingDev
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnAddText}>Dodaj</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add group modal ───────────────────────────────── */}
      <Modal visible={addGroupModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Utwórz grupę</Text>
            <TextInput
              style={s.input}
              placeholder="Nazwa grupy (np. Salon)"
              placeholderTextColor="#475569"
              value={groupName}
              onChangeText={setGroupName}
            />
            {hubDevices.length > 0 && (
              <>
                <Text style={s.subLabel}>Wybierz kinkiety:</Text>
                {hubDevices.map(dev => (
                  <TouchableOpacity
                    key={dev.id}
                    style={s.checkRow}
                    onPress={() => toggleDevIp(dev.ip)}
                  >
                    <Ionicons
                      name={selectedDevIps.includes(dev.ip) ? "checkbox" : "square-outline"}
                      size={22}
                      color={selectedDevIps.includes(dev.ip) ? "#6366f1" : "#475569"}
                    />
                    <Text style={s.checkLabel}>{dev.name}  {dev.ip}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.btnCancel}
                onPress={() => { setAddGroupModal(false); setGroupName(""); setSelectedDevIps([]); }}
              >
                <Text style={s.btnCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnAdd} onPress={handleCreateGroup} disabled={addingGroup}>
                {addingGroup
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.btnAddText}>Utwórz</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  center:    { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" },

  header:    { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  back:      { padding: 4 },
  title:     { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  dotOn:     { backgroundColor: "#22c55e" },
  dotOff:    { backgroundColor: "#475569" },
  statusText: { fontSize: 12, color: "#64748b" },

  content: { padding: 16, paddingBottom: 60 },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle:  { fontSize: 16, fontWeight: "700", color: "#94a3b8" },
  addBtn:        { backgroundColor: "#6366f1", borderRadius: 8, padding: 5 },

  emptyText: { color: "#475569", fontSize: 14, marginBottom: 8 },

  devCard:  { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  devLeft:  { flexDirection: "row", alignItems: "center", gap: 12 },
  devName:  { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  devIp:    { fontSize: 12, color: "#64748b", marginTop: 2 },

  groupCard: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, borderWidth: 1, borderColor: "#1e293b" },
  groupLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupName: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  groupSub:  { fontSize: 12, color: "#64748b", marginTop: 2 },

  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modal:      { backgroundColor: "#1e293b", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  input:      { backgroundColor: "#0f172a", borderRadius: 10, padding: 12, color: "#f1f5f9", fontSize: 15, borderWidth: 1, borderColor: "#334155" },
  subLabel:   { fontSize: 14, color: "#94a3b8", marginTop: 4 },
  checkRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  checkLabel: { fontSize: 14, color: "#cbd5e1" },
  modalBtns:  { flexDirection: "row", gap: 10, marginTop: 4 },
  btnCancel:  { flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: "#334155", alignItems: "center" },
  btnCancelText: { color: "#94a3b8", fontWeight: "600" },
  btnAdd:     { flex: 1, padding: 13, borderRadius: 10, backgroundColor: "#6366f1", alignItems: "center" },
  btnAddText: { color: "#fff", fontWeight: "700" },
});
