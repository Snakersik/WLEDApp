// app/(tabs)/groups.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { useLanguage } from "../../src/context/LanguageContext";
import axios from "axios";
import { useRouter } from "expo-router";
import { C, R } from "../../src/ui/theme";
import { TAB_SAFE_BOTTOM } from "./_layout";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";

interface Device {
  id: string;
  name: string;
  ip_address?: string;
  location?: string;
  is_online?: boolean;
}

interface Group {
  id: string;
  name: string;
  device_ids: string[];
  master_device_id?: string;
  created_at?: string;
}

const normalizeId = (x: any): string => {
  const id = x?.id ?? x?._id ?? x?.device_id ?? x?.group_id;
  return id != null ? String(id) : "";
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

// ── Group card ────────────────────────────────────────────────────────────────
function GroupCard({
  item,
  deviceById,
  onPress,
  onLongPress,
}: {
  item: Group;
  deviceById: Map<string, Device>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const groupDevices = item.device_ids
    .map((id) => deviceById.get(id))
    .filter(Boolean) as Device[];

  const visible = groupDevices.slice(0, 5);
  const extra   = groupDevices.length - visible.length;

  return (
    <Pressable style={s.card} onPress={onPress} onLongPress={onLongPress}>
      {/* Title row */}
      <View style={s.cardTop}>
        <View style={s.cardIconWrap}>
          <Ionicons name="layers" size={18} color={C.primary2} />
        </View>
        <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.cardCount}>{groupDevices.length}</Text>
        <Ionicons name="chevron-forward" size={16} color={C.text3} />
      </View>

      {/* Device chips */}
      {visible.length > 0 && (
        <View style={s.chipsRow}>
          {visible.map((d) => (
            <View key={d.id} style={s.chip}>
              <Ionicons name="bulb" size={11} color={C.text3} />
              <Text style={s.chipText} numberOfLines={1}>{d.name}</Text>
            </View>
          ))}
          {extra > 0 && (
            <View style={[s.chip, s.chipMore]}>
              <Text style={s.chipMoreText}>+{extra}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function GroupsScreen() {
  const { token } = useAuth() as any;
  const { t } = useLanguage();
  const router = useRouter();

  const [groups, setGroups]     = useState<Group[]>([]);
  const [devices, setDevices]   = useState<Device[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [adding, setAdding]             = useState(false);
  const [groupName, setGroupName]       = useState("");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [masterDeviceId, setMasterDeviceId]   = useState<string>("");
  const [deviceSearch, setDeviceSearch]       = useState("");

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  const fetchData = async () => {
    try {
      const [gRes, dRes] = await Promise.all([
        axios.get(`${API_URL}/groups`,  { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/devices`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const devs: Device[] = (dRes.data ?? [])
        .map((d: any) => ({ ...d, id: normalizeId(d), name: d?.name ?? "Unnamed" }))
        .filter((d: Device) => !!d.id);

      const grps: Group[] = (gRes.data ?? [])
        .map((g: any) => ({
          ...g,
          id: normalizeId(g),
          name: g?.name ?? "Unnamed group",
          device_ids: uniq((g?.device_ids ?? g?.devices ?? []).map((id: any) => String(id))),
          master_device_id: g?.master_device_id ? String(g.master_device_id) : undefined,
        }))
        .filter((g: Group) => !!g.id);

      grps.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (ta && tb && ta !== tb) return tb - ta;
        return (a.name || "").localeCompare(b.name || "");
      });

      setDevices(devs);
      setGroups(grps);
    } catch {
      Alert.alert(t("error") ?? "Error", "Failed to load groups");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const deviceById = useMemo(() => {
    const m = new Map<string, Device>();
    devices.forEach((d) => m.set(d.id, d));
    return m;
  }, [devices]);

  const openCreateModal = () => {
    if (devices.length === 0) {
      Alert.alert("No Devices", "Add devices first, then create groups.");
      return;
    }
    setGroupName(""); setSelectedDevices([]); setMasterDeviceId(""); setDeviceSearch("");
    setModalVisible(true);
  };

  const toggleDevice = (id: string) => {
    if (!id) return;
    setSelectedDevices((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (masterDeviceId === id) queueMicrotask(() => setMasterDeviceId(next[0] ?? ""));
        return next;
      }
      const next = [...prev, id];
      if (next.length === 1) queueMicrotask(() => setMasterDeviceId(id));
      return next;
    });
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name)                      return Alert.alert("Error", "Enter group name");
    if (selectedDevices.length < 1) return Alert.alert("Error", "Select at least one device");

    setAdding(true);
    try {
      const res = await axios.post(
        `${API_URL}/groups`,
        { name, device_ids: selectedDevices, master_device_id: masterDeviceId || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const created = res.data;
      setGroups((prev) => [{
        ...created,
        id: normalizeId(created),
        name: created?.name ?? name,
        device_ids: uniq((created?.device_ids ?? selectedDevices).map((id: any) => String(id))),
        master_device_id: created?.master_device_id ? String(created.master_device_id) : undefined,
      }, ...prev]);
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert("Error", e.response?.data?.detail || "Failed to create group");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete group", `Delete "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            setGroups((prev) => prev.filter((g) => g.id !== id));
          } catch { Alert.alert("Error", "Failed to delete group"); }
        },
      },
    ]);
  };

  const filteredDevices = useMemo(() => {
    const q = deviceSearch.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.ip_address ?? "").includes(q),
    );
  }, [devices, deviceSearch]);

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>{t("groups") ?? "Groups"}</Text>
          <Text style={s.subtitle}>Control multiple lights at once</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openCreateModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── List ── */}
      {groups.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="layers-outline" size={56} color={C.text3} />
          <Text style={s.emptyTitle}>No groups yet</Text>
          <Text style={s.emptyBody}>Create a group to control multiple devices at once</Text>
          <TouchableOpacity style={s.emptyCTA} onPress={openCreateModal}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.emptyCTAText}>Create first group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 16, paddingBottom: TAB_SAFE_BOTTOM + 16 }}
          renderItem={({ item }) => (
            <GroupCard
              item={item}
              deviceById={deviceById}
              onPress={() => router.push(`/(group)/${item.id}`)}
              onLongPress={() => handleDelete(item.id, item.name)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={C.primary} />
          }
        />
      )}

      {/* ── Create modal ── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => !adding && setModalVisible(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Group</Text>
              <TouchableOpacity style={s.modalClose} onPress={() => !adding && setModalVisible(false)}>
                <Ionicons name="close" size={18} color={C.text2} />
              </TouchableOpacity>
            </View>

            {/* Name input */}
            <TextInput
              style={s.input}
              placeholder="Group name"
              placeholderTextColor={C.text3}
              value={groupName}
              onChangeText={setGroupName}
              editable={!adding}
            />

            {/* Selected summary */}
            <View style={s.summaryRow}>
              <View style={s.summaryChip}>
                <Ionicons name="checkbox-outline" size={13} color={C.text2} />
                <Text style={s.summaryChipText}>Selected: {selectedDevices.length}</Text>
              </View>
              {masterDeviceId ? (
                <View style={[s.summaryChip, s.summaryChipStar]}>
                  <Ionicons name="star" size={13} color={C.amber} />
                  <Text style={[s.summaryChipText, { color: C.amber }]}>
                    {deviceById.get(masterDeviceId)?.name ?? "Master"}
                  </Text>
                </View>
              ) : (
                <View style={[s.summaryChip, s.summaryChipWarn]}>
                  <Ionicons name="star-outline" size={13} color="#FDE68A" />
                  <Text style={[s.summaryChipText, { color: "#FDE68A" }]}>Pick master</Text>
                </View>
              )}
            </View>

            {/* Search */}
            <View style={s.searchRow}>
              <Ionicons name="search" size={16} color={C.text3} />
              <TextInput
                style={s.searchInput}
                placeholder="Search devices..."
                placeholderTextColor={C.text3}
                value={deviceSearch}
                onChangeText={setDeviceSearch}
                editable={!adding}
              />
              {!!deviceSearch && (
                <TouchableOpacity onPress={() => setDeviceSearch("")}>
                  <Ionicons name="close-circle" size={16} color={C.text3} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={s.listLabel}>Devices</Text>

            <ScrollView style={{ maxHeight: 300, marginBottom: 12 }}>
              {filteredDevices.map((d, idx) => {
                const checked  = selectedDevices.includes(d.id);
                const isMaster = masterDeviceId === d.id;
                return (
                  <Pressable
                    key={d.id || String(idx)}
                    style={[s.deviceRow, checked && s.deviceRowSelected]}
                    onPress={() => toggleDevice(d.id)}
                    disabled={adding}
                  >
                    <View style={[s.checkbox, checked && s.checkboxOn]}>
                      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.deviceName} numberOfLines={1}>{d.name}</Text>
                      {d.ip_address ? <Text style={s.deviceMeta}>{d.ip_address}</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={[s.masterBtn, isMaster && s.masterBtnOn, !checked && { opacity: 0.2 }]}
                      disabled={!checked || adding}
                      onPress={() => setMasterDeviceId(d.id)}
                    >
                      <Ionicons name={isMaster ? "star" : "star-outline"} size={16} color={isMaster ? C.amber : C.text3} />
                    </TouchableOpacity>
                  </Pressable>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[s.createBtn, (adding || selectedDevices.length === 0) && s.createBtnDisabled]}
              onPress={handleCreate}
              disabled={adding || selectedDevices.length === 0}
            >
              {adding
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.createBtnText}>Create group</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loading:   { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title:    { fontSize: 28, fontWeight: "900", color: C.text, letterSpacing: 0.2 },
  subtitle: { fontSize: 12, color: C.text2, marginTop: 4, fontWeight: "700" },
  addBtn: {
    backgroundColor: C.primary,
    width: 46, height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.borderMd,
    shadowColor: C.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  // ── Group card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardIconWrap: {
    width: 34, height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardName:  { flex: 1, fontSize: 16, fontWeight: "900", color: C.text, letterSpacing: 0.1 },
  cardCount: { fontSize: 12, fontWeight: "800", color: C.text3 },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.bgCard2,
    borderWidth: 1,
    borderColor: C.border,
    maxWidth: 160,
  },
  chipText:     { fontSize: 11, color: C.text2, fontWeight: "700", maxWidth: 130 },
  chipMore:     { backgroundColor: C.bgCard },
  chipMoreText: { fontSize: 11, color: C.text3, fontWeight: "800" },

  // ── Empty ─────────────────────────────────────────────────────────────────
  empty:       { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyTitle:  { fontSize: 20, fontWeight: "800", color: C.text, marginTop: 16 },
  emptyBody:   { fontSize: 14, color: C.text2, marginTop: 8, textAlign: "center", lineHeight: 20 },
  emptyCTA: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: R.lg,
    shadowColor: C.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  emptyCTAText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalBackdrop: { flex: 1, backgroundColor: C.bgOverlay, justifyContent: "flex-end", padding: 12 },
  modalCard: {
    backgroundColor: "#090916",
    borderRadius: R.xxl,
    borderWidth: 1,
    borderColor: C.borderMd,
    padding: 20,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: C.text },
  modalClose: {
    width: 32, height: 32,
    borderRadius: 10,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  input: {
    backgroundColor: C.bgCard2,
    borderRadius: R.sm,
    padding: 13,
    color: C.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },

  summaryRow:        { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
  },
  summaryChipText: { fontSize: 12, color: C.text2, fontWeight: "700" },
  summaryChipStar: { borderColor: "rgba(245,158,11,0.35)", backgroundColor: C.amberGlow },
  summaryChipWarn: { borderColor: "rgba(253,230,138,0.3)", backgroundColor: "rgba(253,230,138,0.07)" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.bgCard2,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 14, fontWeight: "600" },

  listLabel: { fontSize: 12, fontWeight: "700", color: C.text3, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },

  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgCard,
    marginBottom: 8,
  },
  deviceRowSelected: { borderColor: C.primary, backgroundColor: "rgba(99,102,241,0.07)" },
  checkbox: {
    width: 24, height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.bgCard2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn:  { borderColor: C.primary, backgroundColor: C.primary },
  deviceName:  { fontSize: 14, fontWeight: "800", color: C.text },
  deviceMeta:  { fontSize: 11, color: C.text2, marginTop: 1, fontWeight: "600" },
  masterBtn: {
    width: 32, height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgCard2,
    alignItems: "center",
    justifyContent: "center",
  },
  masterBtnOn: { borderColor: "rgba(245,158,11,0.45)", backgroundColor: C.amberGlow },

  createBtn: {
    backgroundColor: C.primary,
    borderRadius: R.lg,
    padding: 15,
    alignItems: "center",
    shadowColor: C.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText:     { color: "#fff", fontSize: 15, fontWeight: "900" },
});
