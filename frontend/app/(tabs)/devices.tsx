import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  Pressable,
  Animated,
  Easing,
  StyleSheet, // tylko dla StyleSheet.absoluteFill w NeonBorder
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { useLanguage } from "../../src/context/LanguageContext";
import { useHub } from "../../src/context/HubContext";
import { HubService } from "../../src/services/hubService";
import axios from "axios";
import { useRouter } from "expo-router";
import {
  WLEDDiscovery,
  DiscoveredDevice,
} from "../../src/services/discoveryService";
import Svg, { Defs, Rect, Stop, LinearGradient } from "react-native-svg";

import { deviceStyles as styles } from "../../src/style/device.styles";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";

type AddMode = "select" | "scan" | "setup" | "manual";
type SetupStep = 1 | 2 | 3 | 4;

interface Device {
  id: string;
  name: string;
  ip_address: string;
  led_count: number;
  is_online: boolean;
  created_at: string;
  location?: string;
}

interface Group {
  id: string;
  name: string;
  device_ids: string[];
  master_device_id?: string;
  created_at?: string;
}

type DevicePreview = {
  on: boolean;
  hex: string;
};

const LOCATIONS = [
  "Salon",
  "Sypialnia",
  "Kuchnia",
  "Łazienka",
  "Korytarz",
  "Biuro",
  "Garaż",
  "Dwór",
  "Taras",
  "Ogród",
  "Piwnica",
  "Magazyn",
  "Inne",
];

function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function rgbToHex(rgb: [number, number, number]) {
  const [r, g, b] = rgb.map(clamp255);
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}


const normalizeId = (x: any): string => {
  const id = x?.id ?? x?._id ?? x?.group_id ?? x?.device_id;
  return id != null ? String(id) : "";
};

function NeonBorder({
  w,
  h,
  radius,
  strokeWidth,
  active,
  color,
  idSeed,
}: {
  w: number;
  h: number;
  radius: number;
  strokeWidth: number;
  active: boolean;
  color: string;
  idSeed: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [angleDeg, setAngleDeg] = useState("0");
  const gradId = useMemo(() => `grad_${idSeed}`, [idSeed]);

  useEffect(() => {
    let subId: string | null = null;

    const start = () => {
      anim.setValue(0);

      subId = anim.addListener(({ value }) => {
        const deg = Math.floor(value * 360);
        setAngleDeg(String(deg));
      });

      Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: 1700,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ).start();
    };

    const stop = () => {
      try {
        anim.stopAnimation();
      } catch {}
      if (subId) {
        anim.removeListener(subId);
        subId = null;
      }
      setAngleDeg("0");
      anim.setValue(0);
    };

    if (active && w > 0 && h > 0) start();
    else stop();

    return () => stop();
  }, [active, w, h, anim]);

  if (!active || w <= 0 || h <= 0) return null;
  const inset = strokeWidth / 2;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient
            id={gradId}
            x1="0"
            y1="0"
            x2={String(w)}
            y2="0"
            gradientUnits="userSpaceOnUse"
            gradientTransform={`rotate(${angleDeg} ${w / 2} ${h / 2})`}
          >
            <Stop offset="0%" stopColor={color} stopOpacity="0.0" />
            <Stop offset="35%" stopColor={color} stopOpacity="0.1" />
            <Stop offset="50%" stopColor={color} stopOpacity="0.95" />
            <Stop offset="65%" stopColor={color} stopOpacity="0.1" />
            <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        <Rect
          x={inset}
          y={inset}
          width={w - strokeWidth}
          height={h - strokeWidth}
          rx={radius}
          ry={radius}
          fill="transparent"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
        />

        <Rect
          x={inset}
          y={inset}
          width={w - strokeWidth}
          height={h - strokeWidth}
          rx={radius}
          ry={radius}
          fill="transparent"
          stroke={color}
          strokeOpacity={0.12}
          strokeWidth={strokeWidth * 2.2}
        />
      </Svg>
    </View>
  );
}

export default function DevicesScreen() {
  const { token } = useAuth() as any;
  const { t } = useLanguage();
  const { hubIp } = useHub();
  const router = useRouter();

  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);

  const [addMode, setAddMode] = useState<AddMode>("select");
  const [scanning, setScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<
    DiscoveredDevice[]
  >([]);

  const [deviceName, setDeviceName] = useState("");
  const [deviceIP, setDeviceIP] = useState("");
  const [deviceLEDCount, setDeviceLEDCount] = useState("119");
  const [adding, setAdding] = useState(false);

  const [deviceLocation, setDeviceLocation] = useState<string>(LOCATIONS[0]);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);

  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [setupProgress, setSetupProgress] = useState("");

  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wledAps, setWledAps] = useState<string[]>([]);
  const [provisionStatus, setProvisionStatus] = useState("");
  const [isHubSetup, setIsHubSetup] = useState(false);

  const [powerLoading, setPowerLoading] = useState<Record<string, boolean>>({});
  const [previewById, setPreviewById] = useState<Record<string, DevicePreview>>(
    {},
  );
  const [cardSizeById, setCardSizeById] = useState<
    Record<string, { w: number; h: number }>
  >({});

  // UX modal: "co sterujesz?"
  const [openChoiceVisible, setOpenChoiceVisible] = useState(false);
  const [choiceDevice, setChoiceDevice] = useState<Device | null>(null);

  // map: deviceId -> groups[] (device belongs to)
  const groupsByDeviceId = useMemo(() => {
    const map: Record<string, Group[]> = {};
    for (const g of groups) {
      for (const did of g.device_ids || []) {
        const id = String(did);
        if (!map[id]) map[id] = [];
        map[id].push(g);
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return map;
  }, [groups]);

  useEffect(() => {
    fetchDevicesAndGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWLEDPreview = async (
    ip: string,
  ): Promise<DevicePreview | null> => {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 1200);

      const res = await fetch(`http://${ip}/json/state`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(to);
      if (!res.ok) return null;

      const state = (await res.json()) as any;
      const on = !!state?.on;

      const col = state?.seg?.[0]?.col?.[0];
      let hex = "#6366F1";
      if (Array.isArray(col) && col.length >= 3) {
        hex = rgbToHex([col[0], col[1], col[2]]);
      }

      return { on, hex };
    } catch {
      return null;
    }
  };

  const fetchDevicesAndGroups = async () => {
    try {
      const [devicesRes, groupsRes] = await Promise.all([
        axios.get(`${API_URL}/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const list: Device[] = devicesRes.data ?? [];

      const normalizedGroups: Group[] = (groupsRes.data ?? [])
        .map((g: any) => ({
          ...g,
          id: normalizeId(g),
          name: g?.name ?? g?.group_name ?? "Unnamed group",
          device_ids: (g?.device_ids ?? g?.devices ?? [])
            .map((id: any) => String(id))
            .filter((id: string) => !!id),
          master_device_id: g?.master_device_id
            ? String(g.master_device_id)
            : undefined,
          created_at: g?.created_at,
        }))
        .filter((g: Group) => !!g.id);

      setGroups(normalizedGroups);

      // Check WLED directly to get real online status + preview
      const previews = await Promise.all(
        list.map(async (d) => {
          const pv = await fetchWLEDPreview(d.ip_address);
          return { id: d.id, preview: pv, online: pv !== null };
        }),
      );

      // Update devices with real online status
      const enriched = list.map((d) => {
        const row = previews.find((p) => p.id === d.id);
        return { ...d, is_online: row?.online ?? false };
      });
      setDevices(enriched);

      setPreviewById((prev) => {
        const next = { ...prev };
        for (const row of previews) {
          if (row.preview) next[row.id] = row.preview;
        }
        return next;
      });
    } catch (error: any) {
      console.error("Failed to fetch devices/groups:", error);
      Alert.alert(t("error"), t("failedToLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevicesAndGroups();
  };

  const handleDeleteDevice = (deviceId: string, deviceNameToShow: string) => {
    Alert.alert(
      t("deleteDevice"),
      `${t("deleteDeviceConfirm")} "${deviceNameToShow}"?`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/devices/${deviceId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setDevices((prev) => prev.filter((d) => d.id !== deviceId));
              setPreviewById((prev) => {
                const next = { ...prev };
                delete next[deviceId];
                return next;
              });
              Alert.alert(t("success"), t("deviceDeleted"));
            } catch {
              Alert.alert(t("error"), t("failedToLoad"));
            }
          },
        },
      ],
    );
  };

  const togglePowerQuick = async (device: Device) => {
    if (!hubIp) {
      Alert.alert(t("deviceOffline"), t("deviceNotReachable"));
      return;
    }

    setPowerLoading((prev) => ({ ...prev, [device.id]: true }));
    try {
      const pv = await fetchWLEDPreview(device.ip_address);
      const currentOn = pv?.on ?? false;
      const nextOn = !currentOn;

      await HubService.upsertGroup(hubIp, device.id, device.name, [device.ip_address]);
      await HubService.setGroupState(hubIp, device.id, { on: nextOn } as any);

      setPreviewById((prev) => ({
        ...prev,
        [device.id]: {
          on: nextOn,
          hex: pv?.hex ?? prev[device.id]?.hex ?? "#6366F1",
        },
      }));
    } catch {
      Alert.alert(t("error"), "Power toggle failed");
    } finally {
      setPowerLoading((prev) => ({ ...prev, [device.id]: false }));
    }
  };

  const resetModal = () => {
    setAddMode("select");
    setScanning(false);
    setDiscoveredDevices([]);
    setDeviceName("");
    setDeviceIP("");
    setDeviceLEDCount("119");
    setDeviceLocation(LOCATIONS[0]);
    setSetupStep(1);
    setWifiSSID("");
    setWifiPassword("");
    setSetupProgress("");
    setWledAps([]);
    setProvisionStatus("");
    setIsHubSetup(false);
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    WLEDDiscovery.stopMDNSScan();
  };

  const openAddModal = () => {
    resetModal();
    setModalVisible(true);
  };

  const closeModal = () => {
    resetModal();
    setModalVisible(false);
  };

  const startMDNSScan = () => {
    if (Platform.OS === "web") {
      Alert.alert(
        t("error"),
        "Skanowanie sieci wymaga natywnej aplikacji. Użyj Expo Go na telefonie lub wybierz tryb ręczny.",
        [{ text: "OK" }],
      );
      return;
    }

    setAddMode("scan");
    setScanning(true);
    setDiscoveredDevices([]);

    WLEDDiscovery.startMDNSScan(
      (device) => {
        setDiscoveredDevices((prev) => {
          if (prev.find((d) => d.ip === device.ip)) return prev;
          return [...prev, device];
        });
      },
      () => setScanning(false),
    );
  };

  const addDiscoveredDevice = async (device: DiscoveredDevice) => {
    setAdding(true);
    try {
      const response = await axios.post(
        `${API_URL}/devices`,
        {
          name: device.name,
          ip_address: device.ip,
          led_count: 119,
          location: deviceLocation,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const newDevice: Device = response.data;
      setDevices((prev) => [...prev, newDevice]);

      const pv = await fetchWLEDPreview(newDevice.ip_address);
      if (pv) {
        setPreviewById((prev) => ({ ...prev, [newDevice.id]: pv }));
        setDevices((prev) => prev.map((d) => d.id === newDevice.id ? { ...d, is_online: true } : d));
      }

      closeModal();
      Alert.alert(t("success"), t("deviceAdded"));
    } catch (error: any) {
      Alert.alert(
        t("error"),
        error.response?.data?.detail || t("failedToLoad"),
      );
    } finally {
      setAdding(false);
    }
  };

  const startSetupMode = () => {
    setAddMode("setup");
    setSetupStep(1);
  };

  const checkAPConnection = async () => {
    setAdding(true);
    const result = await WLEDDiscovery.checkAPConnection();
    setAdding(false);

    if (result.success) setSetupStep(3);
    else Alert.alert(t("notConnectedToAP"), t("checkConnection"));
  };

  const sendWiFiConfig = async () => {
    if (!wifiSSID) {
      Alert.alert(t("error"), t("fillAllFields"));
      return;
    }

    setAdding(true);
    setSetupProgress(t("configuring"));

    const result = await WLEDDiscovery.sendWiFiConfig(wifiSSID, wifiPassword);

    if (result.success) {
      setSetupStep(4);
      await WLEDDiscovery.waitAndRescan(
        (msg) => setSetupProgress(msg),
        (device) => {
          setSetupProgress("");
          addDiscoveredDevice(device);
        },
      );
    } else {
      setAdding(false);
      Alert.alert(t("configFailed"), result.error);
    }
  };

  const startManualMode = () => setAddMode("manual");

  const startHubScan = async () => {
    if (!hubIp) { startMDNSScan(); return; }
    setAddMode("scan");
    setScanning(true);
    setDiscoveredDevices([]);

    const ok = await HubService.startScan(hubIp);
    if (!ok) { startMDNSScan(); return; }

    const interval = setInterval(async () => {
      const status = await HubService.getScanStatus(hubIp);
      if (!status) return;
      const mapped: DiscoveredDevice[] = status.found.map((d) => ({
        name: d.name, ip: d.ip, host: d.ip, port: 80, fullName: d.name,
      }));
      setDiscoveredDevices(mapped);
      if (status.done || !status.running) {
        clearInterval(interval);
        scanIntervalRef.current = null;
        setScanning(false);
      }
    }, 2000);
    scanIntervalRef.current = interval;
  };

  const startHubSetup = async () => {
    if (!hubIp) { startSetupMode(); return; }
    setIsHubSetup(true);
    setAddMode("setup");
    setSetupStep(1);
    setAdding(true);
    const aps = await HubService.getWledAps(hubIp);
    setWledAps(aps);
    setAdding(false);
    setSetupStep(2);
  };

  const runHubProvision = async () => {
    if (!hubIp) return;
    setAdding(true);
    setProvisionStatus("Provisioning...");
    setSetupStep(3);

    const ok = await HubService.startProvision(hubIp);
    if (!ok) {
      setAdding(false);
      Alert.alert(t("error"), "Provision failed");
      return;
    }

    const pInterval = setInterval(async () => {
      const ps = await HubService.getProvisionStatus(hubIp);
      if (!ps) return;
      setProvisionStatus(`Configured: ${ps.configured.length}`);
      if (ps.done || !ps.running) {
        clearInterval(pInterval);
        setProvisionStatus("Waiting for devices...");
        // Hub auto-starts LAN scan after 10s — poll for results
        setTimeout(() => {
          const sInterval = setInterval(async () => {
            const ss = await HubService.getScanStatus(hubIp);
            if (!ss) return;
            if (ss.done) {
              clearInterval(sInterval);
              setAdding(false);
              closeModal();
              for (const d of ss.found) {
                await addDiscoveredDevice({ name: d.name, ip: d.ip, host: d.ip, port: 80, fullName: d.name });
              }
            }
          }, 2000);
          scanIntervalRef.current = sInterval;
        }, 10000);
      }
    }, 2000);
  };

  const handleAddDevice = async () => {
    if (!deviceName || !deviceIP) {
      Alert.alert(t("error"), t("fillAllFields"));
      return;
    }

    setAdding(true);
    try {
      const response = await axios.post(
        `${API_URL}/devices`,
        {
          name: deviceName,
          ip_address: deviceIP,
          led_count: parseInt(deviceLEDCount) || 119,
          location: deviceLocation,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const newDevice: Device = response.data;
      setDevices((prev) => [...prev, newDevice]);

      const pv = await fetchWLEDPreview(newDevice.ip_address);
      if (pv) {
        setPreviewById((prev) => ({ ...prev, [newDevice.id]: pv }));
        setDevices((prev) => prev.map((d) => d.id === newDevice.id ? { ...d, is_online: true } : d));
      }

      closeModal();
      Alert.alert(t("success"), t("deviceAdded"));
    } catch (error: any) {
      Alert.alert(
        t("error"),
        error.response?.data?.detail || t("failedToLoad"),
      );
    } finally {
      setAdding(false);
    }
  };

  const LocationSelector = () => (
    <View style={styles.locationRow}>
      <Text style={styles.locationLabel}>Miejsce</Text>

      <TouchableOpacity
        style={styles.locationSelect}
        onPress={() => setLocationPickerVisible(true)}
        disabled={adding}
      >
        <Ionicons name="pin-outline" size={16} color="#cbd5e1" />
        <Text style={styles.locationValue}>{deviceLocation || "—"}</Text>
        <Ionicons name="chevron-down" size={16} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );

  // ✅ open device with choice if belongs to group(s)
  const handleOpenDevice = (device: Device) => {
    const gs = groupsByDeviceId[device.id] || [];
    if (gs.length === 0) {
      router.push(`/(device)/${device.id}`);
      return;
    }
    setChoiceDevice(device);
    setOpenChoiceVisible(true);
  };

  const renderDevice = ({ item }: { item: Device }) => {
    const pv = previewById[item.id];
    const sz = cardSizeById[item.id];
    const active = !!pv?.on && item.is_online;

    const myGroups = groupsByDeviceId[item.id] || [];
    const firstGroup = myGroups[0];

    return (
      <Pressable
        style={styles.deviceCard}
        onPress={() => handleOpenDevice(item)}
        onLongPress={() => handleDeleteDevice(item.id, item.name)}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCardSizeById((prev) => ({
            ...prev,
            [item.id]: { w: width, h: height },
          }));
        }}
      >
        {sz ? (
          <NeonBorder
            w={sz.w}
            h={sz.h}
            radius={16}
            strokeWidth={2.4}
            active={active}
            color={pv?.hex ?? "#6366F1"}
            idSeed={item.id}
          />
        ) : null}

        <View style={styles.deviceHeader}>
          <View style={styles.deviceInfo}>
            <Ionicons
              name="bulb"
              size={32}
              color={item.is_online ? "#10b981" : "#6b7280"}
            />

            <View style={styles.deviceText}>
              <View style={styles.deviceTitleRow}>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {item.name}
                </Text>

                {item.is_online ? (
                  <View style={styles.badgeOnline}>
                    <View style={styles.badgeDotOnline} />
                    <Text style={styles.badgeText}>Online</Text>
                  </View>
                ) : (
                  <View style={styles.badgeOffline}>
                    <View style={styles.badgeDotOffline} />
                    <Text style={styles.badgeText}>Offline</Text>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="pin" size={14} color="#94a3b8" />
                <Text style={styles.deviceMetaText}>
                  {item.location?.trim() ? item.location!.trim() : "—"}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Ionicons name="globe-outline" size={14} color="#64748b" />
                <Text style={styles.deviceMetaText}>{item.ip_address}</Text>
              </View>

              {myGroups.length > 0 ? (
                <View style={styles.chipsRow}>
                  <View style={styles.chip}>
                    <Ionicons name="layers" size={13} color="#c7d2fe" />
                    <Text style={styles.chipText} numberOfLines={1}>
                      Group: {firstGroup?.name ?? "—"}
                    </Text>
                  </View>

                  {myGroups.length > 1 ? (
                    <View style={styles.chipMuted}>
                      <Text style={styles.chipMutedText}>
                        +{myGroups.length - 1}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.chipWarn}>
                    <Ionicons name="alert-circle" size={13} color="#fed7aa" />
                    <Text style={styles.chipWarnText}>Prefer group</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.rightCol}>
            <TouchableOpacity
              style={[
                styles.quickPowerBtn,
                !hubIp && { opacity: 0.5 },
              ]}
              onPress={() => togglePowerQuick(item)}
              disabled={!hubIp || !!powerLoading[item.id]}
            >
              {powerLoading[item.id] ? (
                <ActivityIndicator size="small" color="#e2e8f0" />
              ) : (
                <Ionicons name="power" size={18} color="#e2e8f0" />
              )}
            </TouchableOpacity>

            <Ionicons
              name="chevron-forward"
              size={18}
              color="#475569"
              style={{ marginTop: 10 }}
            />
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const choiceGroups = choiceDevice
    ? groupsByDeviceId[choiceDevice.id] || []
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t("myDevices")}</Text>
          <Text style={styles.subtitle}>
            {devices.length} {devices.length === 1 ? "device" : "devices"}
          </Text>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bulb-outline" size={64} color="#475569" />
          <Text style={styles.emptyText}>{t("noDevices")}</Text>
          <Text style={styles.emptySubtext}>{t("noDevicesSubtext")}</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6366f1"
            />
          }
        />
      )}

      {/* OPEN CHOICE MODAL (device vs group) */}
      <Modal
        visible={openChoiceVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setOpenChoiceVisible(false)}
      >
        <Pressable
          style={styles.choiceBackdrop}
          onPress={() => setOpenChoiceVisible(false)}
        >
          <Pressable style={styles.choiceCard} onPress={() => {}}>
            <View style={styles.choiceHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>
                  {choiceDevice?.name ?? "Device"}
                </Text>
                <Text style={styles.choiceSubtitle}>
                  This device is in {choiceGroups.length} group(s). To avoid
                  conflicts, control via group.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setOpenChoiceVisible(false)}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, marginTop: 10 }}>
              {choiceGroups.slice(0, 4).map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.choicePrimaryBtn}
                  onPress={() => {
                    setOpenChoiceVisible(false);
                    router.push(`/(group)/${g.id}`);
                  }}
                >
                  <Ionicons name="layers" size={18} color="#fff" />
                  <Text style={styles.choicePrimaryText}>
                    Open group: {g.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.choiceSecondaryBtn}
                onPress={() => {
                  const devId = choiceDevice?.id;
                  setOpenChoiceVisible(false);
                  if (devId) router.push(`/(device)/${devId}`);
                }}
              >
                <Ionicons name="bulb-outline" size={18} color="#e2e8f0" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceSecondaryTitle}>
                    Control device (local)
                  </Text>
                  <Text style={styles.choiceSecondaryDesc}>
                    May conflict with group preset / stream.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.choiceHint}>
              Tip: if you see “two presets at once”, it’s usually because local
              + group are both sending frames.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ADD MODAL */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {addMode === "select" && t("addDevice")}
                {addMode === "scan" && t("foundDevices")}
                {addMode === "setup" && t("setupMode")}
                {addMode === "manual" && t("addDevice")}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {addMode === "select" && (
                <View style={styles.methodSelector}>
                  {Platform.OS !== "web" && (
                    <TouchableOpacity
                      style={styles.methodButton}
                      onPress={startHubScan}
                    >
                      <View style={styles.methodIcon}>
                        <Ionicons name="search" size={32} color="#818cf8" />
                      </View>
                      <View style={styles.methodTextContainer}>
                        <Text style={styles.methodButtonTitle}>
                          {t("scanNetwork")}
                        </Text>
                        <Text style={styles.methodButtonDesc}>
                          {t("scanningNetwork")}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color="#64748b"
                      />
                    </TouchableOpacity>
                  )}

                  {Platform.OS === "web" && (
                    <View style={styles.webInfoBox}>
                      <Ionicons
                        name="information-circle"
                        size={24}
                        color="#818cf8"
                      />
                      <Text style={styles.webInfoText}>
                        Skanowanie sieci dostępne tylko w natywnej aplikacji
                        (Expo Go). W przeglądarce użyj trybu ręcznego.
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.methodButton}
                    onPress={startHubSetup}
                  >
                    <View
                      style={[
                        styles.methodIcon,
                        { backgroundColor: "#422006" },
                      ]}
                    >
                      <Ionicons name="settings" size={32} color="#f59e0b" />
                    </View>
                    <View style={styles.methodTextContainer}>
                      <Text style={styles.methodButtonTitle}>
                        {t("setupMode")}
                      </Text>
                      <Text style={styles.methodButtonDesc}>
                        {t("setupModeInstructions")}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.methodButton}
                    onPress={startManualMode}
                  >
                    <View
                      style={[
                        styles.methodIcon,
                        { backgroundColor: "#064e3b" },
                      ]}
                    >
                      <Ionicons name="create" size={32} color="#10b981" />
                    </View>
                    <View style={styles.methodTextContainer}>
                      <Text style={styles.methodButtonTitle}>
                        {t("manualIP")}
                      </Text>
                      <Text style={styles.methodButtonDesc}>
                        {t("ipAddress")}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>
              )}

              {addMode === "scan" && (
                <View style={styles.scanMode}>
                  <LocationSelector />

                  {scanning && (
                    <View style={styles.scanningContainer}>
                      <ActivityIndicator size="large" color="#6366f1" />
                      <Text style={styles.scanningText}>{t("scanning")}</Text>
                    </View>
                  )}

                  {!scanning && discoveredDevices.length === 0 && (
                    <View style={styles.emptyStateContainer}>
                      <Ionicons name="sad-outline" size={48} color="#64748b" />
                      <Text style={styles.emptyStateText}>
                        {t("noDevicesFound")}
                      </Text>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={startHubScan}
                      >
                        <Text style={styles.retryButtonText}>
                          {t("scanNetwork")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {discoveredDevices.map((device, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.discoveredDevice}
                      onPress={() => addDiscoveredDevice(device)}
                      disabled={adding}
                    >
                      <Ionicons name="bulb" size={32} color="#10b981" />
                      <View style={styles.discoveredDeviceInfo}>
                        <Text style={styles.discoveredDeviceName}>
                          {device.name}
                        </Text>
                        <Text style={styles.discoveredDeviceIP}>
                          {device.ip}
                        </Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color="#6366f1" />
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setAddMode("select")}
                  >
                    <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                    <Text style={styles.backButtonText}>{t("cancel")}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.notFoundButton}
                    onPress={startSetupMode}
                  >
                    <Text style={styles.notFoundButtonText}>
                      {t("dontSeeDevice")}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {addMode === "setup" && (
                <View style={styles.setupMode}>
                  {isHubSetup ? (
                    <>
                      {/* Hub-based setup flow */}
                      {setupStep === 1 && (
                        <View style={styles.setupStep}>
                          <ActivityIndicator size="large" color="#6366f1" />
                          <Text style={[styles.setupStepTitle, { marginTop: 16 }]}>
                            Scanning for WLED devices...
                          </Text>
                        </View>
                      )}

                      {setupStep === 2 && (
                        <View style={styles.setupStep}>
                          <View style={styles.stepIndicator}>
                            <Ionicons name="wifi" size={20} color="#818cf8" />
                          </View>
                          <Text style={styles.setupStepTitle}>
                            {wledAps.length > 0
                              ? `Found ${wledAps.length} WLED device(s)`
                              : "No WLED devices found"}
                          </Text>
                          {wledAps.length > 0 && (
                            <>
                              {wledAps.map((ap, i) => (
                                <View key={i} style={styles.discoveredDevice}>
                                  <Ionicons name="wifi" size={24} color="#818cf8" />
                                  <View style={styles.discoveredDeviceInfo}>
                                    <Text style={styles.discoveredDeviceName}>{ap}</Text>
                                    <Text style={styles.discoveredDeviceIP}>WLED Access Point</Text>
                                  </View>
                                </View>
                              ))}
                              <TouchableOpacity
                                style={[styles.setupButton, adding && styles.setupButtonDisabled]}
                                onPress={runHubProvision}
                                disabled={adding}
                              >
                                {adding ? (
                                  <ActivityIndicator color="#fff" />
                                ) : (
                                  <Text style={styles.setupButtonText}>Provision All</Text>
                                )}
                              </TouchableOpacity>
                            </>
                          )}
                          <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => setAddMode("select")}
                          >
                            <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                            <Text style={styles.backButtonText}>{t("cancel")}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {setupStep === 3 && (
                        <View style={styles.setupStep}>
                          <ActivityIndicator size="large" color="#6366f1" />
                          <Text style={[styles.setupStepTitle, { marginTop: 16 }]}>
                            {provisionStatus}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Phone-based setup flow (fallback, no hub) */}
                      <LocationSelector />

                      {setupStep === 1 && (
                        <View style={styles.setupStep}>
                          <View style={styles.stepIndicator}>
                            <Text style={styles.stepNumber}>1</Text>
                          </View>
                          <Text style={styles.setupStepTitle}>{t("step1")}</Text>
                          <Text style={styles.setupStepDesc}>{t("step1Desc")}</Text>

                          <View style={styles.wledAPBox}>
                            <Ionicons name="wifi" size={24} color="#818cf8" />
                            <Text style={styles.wledAPText}>{t("wledAPName")}</Text>
                          </View>

                          <Text style={styles.setupInstruction}>
                            📱 {t("step1Desc")}
                          </Text>

                          <TouchableOpacity
                            style={styles.setupButton}
                            onPress={() => setSetupStep(2)}
                          >
                            <Text style={styles.setupButtonText}>
                              {t("connected")}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {setupStep === 2 && (
                        <View style={styles.setupStep}>
                          <View style={styles.stepIndicator}>
                            <Text style={styles.stepNumber}>2</Text>
                          </View>
                          <Text style={styles.setupStepTitle}>{t("step2")}</Text>
                          <Text style={styles.setupStepDesc}>{t("step2Desc")}</Text>

                          <TouchableOpacity
                            style={[
                              styles.setupButton,
                              adding && styles.setupButtonDisabled,
                            ]}
                            onPress={checkAPConnection}
                            disabled={adding}
                          >
                            {adding ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.setupButtonText}>
                                {t("connected")}
                              </Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => setSetupStep(1)}
                          >
                            <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                            <Text style={styles.backButtonText}>{t("cancel")}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {setupStep === 3 && (
                        <View style={styles.setupStep}>
                          <View style={styles.stepIndicator}>
                            <Text style={styles.stepNumber}>3</Text>
                          </View>
                          <Text style={styles.setupStepTitle}>{t("step3")}</Text>
                          <Text style={styles.setupStepDesc}>{t("step3Desc")}</Text>

                          <TextInput
                            style={styles.setupInput}
                            placeholder={t("wifiSSID")}
                            placeholderTextColor="#64748b"
                            value={wifiSSID}
                            onChangeText={setWifiSSID}
                          />

                          <TextInput
                            style={styles.setupInput}
                            placeholder={t("wifiPassword")}
                            placeholderTextColor="#64748b"
                            value={wifiPassword}
                            onChangeText={setWifiPassword}
                            secureTextEntry
                          />

                          <TouchableOpacity
                            style={[
                              styles.setupButton,
                              adding && styles.setupButtonDisabled,
                            ]}
                            onPress={sendWiFiConfig}
                            disabled={adding}
                          >
                            {adding ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.setupButtonText}>
                                {t("sendConfig")}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      {setupStep === 4 && (
                        <View style={styles.setupStep}>
                          <View style={styles.stepIndicator}>
                            <Text style={styles.stepNumber}>4</Text>
                          </View>
                          <Text style={styles.setupStepTitle}>
                            {t("waitingForDevice")}
                          </Text>

                          <View style={styles.waitingContainer}>
                            <ActivityIndicator size="large" color="#6366f1" />
                            <Text style={styles.waitingText}>{setupProgress}</Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              {addMode === "manual" && (
                <View style={styles.manualMode}>
                  <LocationSelector />

                  <TextInput
                    style={styles.modalInput}
                    placeholder={t("deviceName")}
                    placeholderTextColor="#64748b"
                    value={deviceName}
                    onChangeText={setDeviceName}
                  />

                  <TextInput
                    style={styles.modalInput}
                    placeholder={t("ipAddress")}
                    placeholderTextColor="#64748b"
                    value={deviceIP}
                    onChangeText={setDeviceIP}
                    keyboardType="numeric"
                  />

                  <TextInput
                    style={styles.modalInput}
                    placeholder={t("ledCount")}
                    placeholderTextColor="#64748b"
                    value={deviceLEDCount}
                    onChangeText={setDeviceLEDCount}
                    keyboardType="number-pad"
                  />

                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      adding && styles.modalButtonDisabled,
                    ]}
                    onPress={handleAddDevice}
                    disabled={adding}
                  >
                    {adding ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalButtonText}>
                        {t("addDevice")}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setAddMode("select")}
                  >
                    <Ionicons name="arrow-back" size={20} color="#94a3b8" />
                    <Text style={styles.backButtonText}>{t("cancel")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* LOCATION PICKER MODAL */}
      <Modal
        visible={locationPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationPickerVisible(false)}
      >
        <Pressable
          style={styles.locBackdrop}
          onPress={() => setLocationPickerVisible(false)}
        >
          <Pressable style={styles.locCard} onPress={() => {}}>
            <View style={styles.locHeader}>
              <Text style={styles.locTitle}>Wybierz miejsce</Text>
              <TouchableOpacity onPress={() => setLocationPickerVisible(false)}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 340 }}>
              {LOCATIONS.map((loc) => {
                const selected = loc === deviceLocation;
                return (
                  <TouchableOpacity
                    key={loc}
                    style={[styles.locItem, selected && styles.locItemSelected]}
                    onPress={() => {
                      setDeviceLocation(loc);
                      setLocationPickerVisible(false);
                    }}
                  >
                    <Ionicons
                      name={selected ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={selected ? "#6366f1" : "#94a3b8"}
                    />
                    <Text style={styles.locItemText}>{loc}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
