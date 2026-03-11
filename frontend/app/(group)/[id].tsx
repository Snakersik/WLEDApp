// app/(group)/[id].tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import axios from "axios";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useAuth } from "../../src/context/AuthContext";
import { useLanguage } from "../../src/context/LanguageContext";
import { useHub } from "../../src/context/HubContext";
import { HubService } from "../../src/services/hubService";
import { UShapeLiveBorder } from "../../src/components/UShapeLiveBorder";

import {
  ColorSection,
  PresetsSection,
  BottomBar,
  PowerSleepModal,

  // ✅ palette UI + hook
  PaletteSection,
  usePaletteControl,
  applyTemperatureTint,
  rgbFromPickerPayload,
  rgbToHex,
  boostVibrance,
  clamp255,
  useSleepTimer,
  getPresetDefaultRgb,
  API_URL,
  styles,
  type ModalMode,
  type Preset,
} from "../../src/features/deviceControl";
import { EffectSliders } from "../../src/features/deviceControl/components/EffectSliders";

/**
 * ==========================================
 * DEBUG SWITCHES
 * ==========================================
 */
const DEBUG = true;
// direct fetch z frontu OFF (u Ciebie Network Error)
const DISABLE_DIRECT_WLED_FETCH = true;

console.log(
  "[GROUP_FILE_LOADED] app/(group)/[id].tsx DDP_HUB_MODE v2026-02-24",
);

function dbg(...args: any[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[GROUP ${ts}]`, ...args);
}

function t0(label: string) {
  const start = Date.now();
  dbg(`${label} START`);
  return () => dbg(`${label} END +${Date.now() - start}ms`);
}

type Group = {
  id: string;
  name: string;
  device_ids: string[];
  master_device_id?: string; // zostawiamy dla kompatybilności
};

type Device = {
  id: string;
  name: string;
  ip_address: string;
  led_count: number;
  is_online: boolean;
};

type WLEDState = {
  on?: boolean;
  bri?: number;
  seg?: Array<{
    col?: Array<[number, number, number, number?]>;
  }>;
};

function parseRgbFromState(state: WLEDState): [number, number, number] | null {
  const col = state?.seg?.[0]?.col?.[0];
  if (Array.isArray(col) && col.length >= 3) {
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
  }
  return null;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function rgbKey(rgb: [number, number, number]) {
  return `${clamp255(rgb[0])},${clamp255(rgb[1])},${clamp255(rgb[2])}`;
}

function mostCommonRgb(list: Array<[number, number, number]>) {
  if (!list.length) return null;
  const map = new Map<
    string,
    { rgb: [number, number, number]; count: number }
  >();
  for (const rgb of list) {
    const k = rgbKey(rgb);
    const cur = map.get(k);
    if (cur) cur.count += 1;
    else map.set(k, { rgb, count: 1 });
  }
  let best: { rgb: [number, number, number]; count: number } | null = null;
  for (const v of map.values()) {
    if (!best || v.count > best.count) best = v;
  }
  return best?.rgb ?? null;
}

/**
 * Direct fetch do WLED z frontu — domyślnie OFF.
 */
async function fetchWLEDState(ip: string): Promise<WLEDState | null> {
  if (DISABLE_DIRECT_WLED_FETCH) return null;

  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 1300);

    const res = await fetch(`http://${ip}/json/state`, {
      method: "GET",
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    });
    clearTimeout(to);

    if (!res.ok) return null;
    return (await res.json()) as WLEDState;
  } catch {
    return null;
  }
}

function buildHubPayload(params: any, presets: Preset[], currentBrightness: number) {
  const p: Record<string, any> = {};
  if ("on" in params) p.on = params.on;
  const bri = params.brightness ?? currentBrightness;
  if (bri !== undefined) p.bri = Math.round(bri);
  if (params.color && Array.isArray(params.color)) p.col = [params.color];
  if (params.preset_id) {
    const preset = presets.find((x: any) => String(x.id) === String(params.preset_id));
    if (preset?.wled_fx !== undefined) {
      p.fx = preset.wled_fx;
      if (preset.sx !== undefined) p.sx = preset.sx;
      if (preset.ix !== undefined) p.ix = preset.ix;
    }
  }
  return p;
}

export default function GroupControlScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { token, user } = useAuth() as any;
  const { t } = useLanguage();
  const { hubIp } = useHub();

  const [group, setGroup] = useState<Group | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [groupDevices, setGroupDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const [controlling, setControlling] = useState(false);

  const [isOn, setIsOn] = useState(true);
  const [brightness, setBrightness] = useState(128);
  const [baseHex, setBaseHex] = useState("#FF0000");
  const [baseRgb, setBaseRgb] = useState<[number, number, number]>([255, 0, 0]);
  const [temperature, setTemperature] = useState(0);

  // ✅ ważne: aktywny preset to “CORE engine”
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [effectSpeed, setEffectSpeed] = useState(128);
  const [effectIntensity, setEffectIntensity] = useState(128);
  const effectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ PALETTE (SAFE): hook nie wywali się na undefined
  const paletteCtl = usePaletteControl({
    selectedPreset,
    presets,
    defaultPaletteSize: 1,
    defaultPalette: [baseRgb as any],
  });

  // ✅ BUG FIX: init palette from preset.palette_default when preset changes
  useEffect(() => {
    if (!selectedPreset || !presets.length) return;
    const preset = presets.find((p: any) => p?.id === selectedPreset);
    const pal = preset?.palette_default;
    if (Array.isArray(pal) && pal.length > 0) {
      paletteCtl.initPalette(pal as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset, presets]);

  const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentColorRef = useRef<string>("");

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("power");
  const openModal = (mode: ModalMode) => {
    setModalMode(mode);
    setModalVisible(true);
  };
  const closeModal = () => setModalVisible(false);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState(new Date());

  const deviceCount = useMemo(() => group?.device_ids?.length ?? 0, [group]);
  const buildFinalRgb = (rgb: [number, number, number], temp: number) => {
    const tinted = applyTemperatureTint(rgb, temp);
    return boostVibrance(tinted, 0.35);
  };

  const getActivePresetId = () => selectedPreset; // może być null -> backend default solid

  /**
   * INIT LOAD — backend jest źródłem prawdy
   */
  useEffect(() => {
    dbg("SCREEN MOUNT id=", String(id));
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const end = t0("INIT_LOAD");
        const [groupsRes, presetsRes, devicesRes] = await Promise.all([
          axios.get(`${API_URL}/groups`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/presets`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/devices`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        end();

        const foundGroup = (groupsRes.data as Group[]).find(
          (g) => String(g.id) === String(id),
        );
        if (!foundGroup) throw new Error("Group not found");

        const allDevices = devicesRes.data as Device[];
        const onlyGroup = allDevices.filter((d) =>
          foundGroup.device_ids.includes(d.id),
        );

        if (!alive) return;

        setGroup(foundGroup);
        setPresets(presetsRes.data);
        setGroupDevices(onlyGroup);

        dbg("GROUP READY", {
          devices: foundGroup.device_ids.length,
          online: onlyGroup.filter((d) => d.is_online).length,
        });
      } catch (e: any) {
        dbg("INIT ERROR:", e?.message);
        if (!alive) return;
        Alert.alert(t("error"), t("failedToLoad"));
        router.back();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      dbg("SCREEN UNMOUNT id=", String(id));
      const ct = colorDebounceRef.current;
      const et = effectDebounceRef.current;
      if (ct) clearTimeout(ct);
      if (et) clearTimeout(et);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  // On focus: reclaim full group control.
  // Fetch all hub groups, delete any that share device IPs with this group
  // (covers: single-device groups from device screen, AND stale groups from
  // deleted+recreated groups with a different ID but same devices).
  useFocusEffect(
    useCallback(() => {
      if (!group || !hubIp || !groupDevices.length) return;
      const currentId = String(id);
      const ips = new Set(groupDevices.map((d) => d.ip_address));

      HubService.getGroups(hubIp)
        .then((hubGroups) => {
          const conflicts = hubGroups.filter(
            (g) => g.id !== currentId && g.devices.some((ip) => ips.has(ip)),
          );
          return Promise.allSettled(
            conflicts.map((g) => HubService.deleteGroup(hubIp, g.id)),
          );
        })
        .catch(() => {})
        .finally(() => {
          HubService.upsertGroup(hubIp, currentId, group.name, [...ips]).catch(
            () => dbg("upsertGroup failed (hub may be offline)"),
          );
        });
    }, [group, hubIp, groupDevices, id]),
  );

  const sendEffectParams = (sx: number, ix: number) => {
    if (!hubIp) return;
    if (effectDebounceRef.current) clearTimeout(effectDebounceRef.current);
    effectDebounceRef.current = setTimeout(() => {
      HubService.setGroupState(hubIp, String(id), { seg: [{ sx: Math.round(sx), ix: Math.round(ix) }] } as any).catch(() => {});
    }, 80);
  };

  /**
   * HUB CONTROL — direct to hub via DDP-Hub JSON API
   */
  const controlGroup = async (params: any) => {
    if (!hubIp) {
      dbg("CONTROL skipped — no hubIp");
      return null;
    }

    const payload = buildHubPayload(params, presets, brightness);
    if (Object.keys(payload).length === 0) return null;

    dbg("CONTROL hub payload:", payload);

    setControlling(true);
    try {
      await HubService.setGroupState(hubIp, String(id), payload as any);
    } catch {
      dbg("CONTROL hub error (ignored)");
    } finally {
      setControlling(false);
    }
    return null;
  };

  /**
   * COLOR DEBOUNCE — bez spamowania tym samym kolorem
   * ✅ DDP HUB: dokładamy preset_id (jeśli jest)
   */
  // ✅ BUG FIX: accept paletteSlot + paletteColors so debounced call doesn't use stale closure
  const sendColorDebounced = (rgb: [number, number, number], paletteSlot?: number, paletteColors?: number[][]) => {
    const k = rgbKey(rgb);
    if (k === lastSentColorRef.current) return;

    if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
    colorDebounceRef.current = setTimeout(() => {
      const k2 = rgbKey(rgb);
      if (k2 === lastSentColorRef.current) return;

      lastSentColorRef.current = k2;
      dbg("DEBOUNCED color -> /control", rgb, "slot=", paletteSlot);

      controlGroup({
        preset_id: getActivePresetId(),
        color: rgb,
        ...(paletteSlot !== undefined ? { palette_slot: paletteSlot } : {}),
        ...(paletteColors ? { palette_colors: paletteColors } : {}),
      });
    }, 120);
  };

  const handleTogglePower = async (value: boolean) => {
    dbg("UI power ->", value);
    setIsOn(value);
    await controlGroup({ preset_id: getActivePresetId(), on: value });
  };

  const handleSetSleepMinutes = async (minutes: number) => {
    await sleep.setMinutes(minutes);
    setBrightness(25);
    await controlGroup({ brightness: 25 });
    closeModal();
  };

  const handleSetSleepAtTime = async (hours: number, mins: number) => {
    await sleep.setOffAtTime(hours, mins);
    setBrightness(25);
    await controlGroup({ brightness: 25 });
  };

  const selectedPresetObj = presets.find((p: any) => p?.id === selectedPreset) ?? null;
  const colorLocked = !!selectedPresetObj?.color_locked;

  const handleResetColors = async () => {
    if (!selectedPresetObj) return;
    const defaultRgb = getPresetDefaultRgb(selectedPresetObj);
    setBaseRgb(defaultRgb);
    setBaseHex(rgbToHex(defaultRgb));
    setTemperature(0);
    await controlGroup({
      preset_id: selectedPresetObj.id,
      color: defaultRgb,
      brightness: Math.round(brightness),
    });
  };

  const adjustedRgb = buildFinalRgb(baseRgb, temperature);
  const adjustedHex = rgbToHex(adjustedRgb);

  const onPickerChange = (payload: any) => {
    const rgb = rgbFromPickerPayload(payload);
    setBaseRgb(rgb);
    setBaseHex(rgbToHex(rgb));
    // ✅ BUG FIX: update frontend palette state + pass slot + całą paletę do debounce
    if (paletteCtl.visible) {
      paletteCtl.setSlotColor(paletteCtl.paletteSlot, rgb);
    }
    sendColorDebounced(
      buildFinalRgb(rgb, temperature),
      paletteCtl.paletteSlot,
      paletteCtl.visible ? paletteCtl.palette : undefined,
    );
  };

  const onPickerComplete = async (payload: any) => {
    const hex = payload?.hex ?? baseHex;
    const rgb = rgbFromPickerPayload(payload);

    dbg("UI picker complete hex=", hex, "slot=", paletteCtl.paletteSlot);

    setBaseHex(hex);
    setBaseRgb(rgb);
    // ✅ BUG FIX: update frontend palette state
    if (paletteCtl.visible) {
      paletteCtl.setSlotColor(paletteCtl.paletteSlot, rgb);
    }

    await controlGroup({
      preset_id: getActivePresetId(),
      color: buildFinalRgb(rgb, temperature),
      ...(paletteCtl.visible ? { palette_slot: paletteCtl.paletteSlot } : {}),
      // ✅ wysyłamy całą paletę — backend jest bezstanowy, ładuje preset od nowa
      ...(paletteCtl.visible ? { palette_colors: paletteCtl.palette } : {}),
    });
  };

  const onTemperatureChange = (value: number) => {
    const v = Math.round(value);
    setTemperature(v);
    sendColorDebounced(
      buildFinalRgb(baseRgb, v),
      paletteCtl.paletteSlot,
      paletteCtl.visible ? paletteCtl.palette : undefined,
    );
  };

  const onTemperatureComplete = async () => {
    dbg("UI temp complete", temperature);
    await controlGroup({
      preset_id: getActivePresetId(),
      color: buildFinalRgb(baseRgb, temperature),
      ...(paletteCtl.visible ? { palette_slot: paletteCtl.paletteSlot } : {}),
      ...(paletteCtl.visible ? { palette_colors: paletteCtl.palette } : {}),
    });
  };

  const onBrightnessChange = (v: number) => {
    const nv = Math.round(v);
    setBrightness(nv);
  };

  const onBrightnessComplete = async () => {
    dbg("UI bri complete", brightness);
    const adjusted = buildFinalRgb(baseRgb, temperature);
    await controlGroup({
      preset_id: getActivePresetId(),
      brightness: Math.round(brightness),
      // ✅ gdy paleta aktywna — NIE wysyłamy color (żeby nie nadpisać slotu 0),
      //    tylko całą paletę żeby zachować wszystkie kolory
      ...(paletteCtl.visible
        ? { palette_colors: paletteCtl.palette }
        : { color: adjusted }
      ),
    });
  };

  // ✅ BUG FIX: klik slotu = tylko selekcja do edycji, sync pickera z kolorem slotu
  const onPickPaletteSlot = (slot: number) => {
    paletteCtl.pickSlot(slot);

    const c = paletteCtl.palette?.[slot];
    if (!c || c.length < 3) return;

    const rgb: [number, number, number] = [
      clamp255(c[0]),
      clamp255(c[1]),
      clamp255(c[2]),
    ];

    // Sync color picker do koloru wybranego slotu
    setBaseRgb(rgb);
    setBaseHex(rgbToHex(rgb));
    dbg("UI palette slot selected", slot, "color=", rgb);
    // Brak wysyłki do backendu — wysyłka następuje przez color picker
  };

  const handlePresetSelect = async (preset: Preset) => {
    if (colorDebounceRef.current) {
      clearTimeout(colorDebounceRef.current);
      colorDebounceRef.current = null;
    }
    lastSentColorRef.current = "";

    dbg("UI preset select", preset.id);

    if (preset.is_premium && !user?.has_subscription) {
      Alert.alert(t("premiumRequired"), t("presetRequiresPremium"), [
        { text: t("cancel"), style: "cancel" },
        { text: t("upgrade"), onPress: () => router.push("/(tabs)/profile") },
      ]);
      return;
    }

    setSelectedPreset(preset.id);

    // Use the preset's own default color — not the user's currently selected color
    const defaultRgb = getPresetDefaultRgb(preset);
    setBaseRgb(defaultRgb);
    setBaseHex(rgbToHex(defaultRgb));
    setTemperature(0);

    await controlGroup({
      preset_id: preset.id,
      brightness: Math.round(brightness),
      color: defaultRgb,
    });
  };

  /**
   * Sleep timer — działa przez backend
   */
  const sleep = useSleepTimer({
    deviceId: `group-${String(id)}`,
    onFire: async () => {
      await controlGroup({ preset_id: getActivePresetId(), on: false });
      setIsOn(false);
    },
  });

  const refreshUiFromCandidates = async () => {
    if (DISABLE_DIRECT_WLED_FETCH) {
      dbg("refreshUiFromCandidates skipped (direct fetch disabled)");
      return;
    }

    if (!groupDevices.length) return;
    const online = groupDevices.filter((d) => d.is_online);
    if (!online.length) return;

    const states = await Promise.all(
      online.map(async (d) => await fetchWLEDState(d.ip_address)),
    );
    const ok = states.filter(Boolean) as WLEDState[];
    if (!ok.length) return;

    const anyOn = ok.map((s) => !!s.on).some(Boolean);
    setIsOn(anyOn);

    const briOn = ok
      .filter((s) => s.on)
      .map((s) => (typeof s.bri === "number" ? s.bri : 0))
      .filter((n) => n > 0);

    const briAll = ok
      .map((s) => (typeof s.bri === "number" ? s.bri : 0))
      .filter((n) => n >= 0);

    const bri = anyOn
      ? Math.round(avg(briOn.length ? briOn : briAll))
      : Math.round(avg(briAll));
    if (!Number.isNaN(bri)) setBrightness(Math.max(0, Math.min(255, bri)));

    const rgbsOn = ok
      .filter((s) => s.on)
      .map((s) => parseRgbFromState(s))
      .filter(Boolean) as Array<[number, number, number]>;

    const rgbsAll = ok
      .map((s) => parseRgbFromState(s))
      .filter(Boolean) as Array<[number, number, number]>;

    const bestRgb = mostCommonRgb(rgbsOn.length ? rgbsOn : rgbsAll);
    if (bestRgb) {
      setBaseRgb(bestRgb);
      setBaseHex(rgbToHex(bestRgb));
    }

    setTemperature(0);
  };

  /**
   * Night mode — 1 request
   * ✅ nie kasujemy presetu; noc to tylko override kolor/bri
   */

  /**
   * Manual sync button — w DDP HUB też raczej informacyjnie
   */
  const [syncingUi, setSyncingUi] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(80);

  const handleSyncDevices = async () => {
    Alert.alert("Sync", "Manual sync is disabled in DDP HUB mode.");
    setSyncingUi(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const uiLocked = controlling || syncingUi;

  const BORDER_THICKNESS = 6;
  const BORDER_GUTTER = BORDER_THICKNESS + 10;

  // Preview: preferuj online, fallback na pierwszy dostępny
  const previewDeviceIp = (groupDevices.find((d) => d.is_online) ?? groupDevices[0])?.ip_address ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1 }}>
        <View
          style={styles.header}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.title}>{group?.name ?? "-"}</Text>
            <Text style={styles.statusText}>
              {deviceCount} {t("devices")} • hub {hubIp ? "online" : "offline"}
            </Text>
          </View>

          <View style={styles.placeholder} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: 140,
              paddingLeft: BORDER_GUTTER,
              paddingRight: BORDER_GUTTER,
            },
          ]}
        >
          <ColorSection
            title={t("color") ?? "Color"}
            baseHex={baseHex}
            adjustedHex={adjustedHex}
            adjustedRgb={adjustedRgb}
            temperature={temperature}
            brightness={brightness}
            controlling={uiLocked}
            isOnline={!!hubIp}
            colorLocked={colorLocked}
            onResetColors={colorLocked ? undefined : handleResetColors}
            onPickerChange={onPickerChange}
            onPickerComplete={onPickerComplete}
            onTemperatureChange={onTemperatureChange}
            onTemperatureComplete={onTemperatureComplete}
            onBrightnessChange={onBrightnessChange}
            onBrightnessComplete={onBrightnessComplete}
          />

          {/* ✅ PALETTE SECTION */}
          <PaletteSection
            visible={paletteCtl.visible}
            title={t("palette") ?? "Palette"}
            disabled={uiLocked || !hubIp}
            paletteSize={paletteCtl.paletteSize}
            palette={paletteCtl.palette}
            paletteSlot={paletteCtl.paletteSlot}
            onPickSlot={onPickPaletteSlot}
          />

          {selectedPreset !== null && (
            <EffectSliders
              speed={effectSpeed}
              intensity={effectIntensity}
              controlling={uiLocked}
              isOnline={!!hubIp}
              onSpeedChange={(v) => setEffectSpeed(v)}
              onSpeedComplete={(v) => { setEffectSpeed(v); sendEffectParams(v, effectIntensity); }}
              onIntensityChange={(v) => setEffectIntensity(v)}
              onIntensityComplete={(v) => { setEffectIntensity(v); sendEffectParams(effectSpeed, v); }}
            />
          )}

          <PresetsSection
            title={t("presets") ?? "Presets"}
            presets={presets}
            selectedPreset={selectedPreset}
            controlling={uiLocked}
            isOnline={!!hubIp}
            lockedFn={(p) => !!p.is_premium && !user?.has_subscription}
            trialActiveFn={() => false}
            onSelect={handlePresetSelect}
          />
        </ScrollView>

        <BottomBar
          isOnline={!!hubIp}
          controlling={uiLocked}
          isOn={isOn}
          hasSleep={!!sleep.sleepTargetTs}
          syncing={syncingUi}
          onPower={() => handleTogglePower(!isOn)}
          onSleep={() => openModal("sleep")}
          onSync={handleSyncDevices}
          t={t as (k: string) => string}
        />

        {/* Border renderowany jako ostatni — na wierzchu ScrollView/BottomBar */}
        {!!previewDeviceIp && (
          <UShapeLiveBorder
            ip={previewDeviceIp}
            pollMs={200}
            thickness={BORDER_THICKNESS}
            smoothing={0.65}
            topOffset={headerHeight}
          />
        )}

        <PowerSleepModal
          visible={modalVisible}
          mode={modalMode}
          onClose={closeModal}
          isOn={isOn}
          onTogglePower={() => handleTogglePower(!isOn)}
          hasSleep={!!sleep.sleepTargetTs}
          remainingText={sleep.formatRemaining(sleep.sleepRemainingSec)}
          onSetMinutes={handleSetSleepMinutes}
          onPickTime={() => setShowTimePicker(true)}
          onCancelSleep={sleep.cancel}
          isOnline={!!hubIp}
          controlling={uiLocked}
          t={t as (k: string) => string}
        />

        {showTimePicker && (
          <DateTimePicker
            value={timePickerValue}
            mode="time"
            is24Hour={true}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={async (_event, date) => {
              if (Platform.OS !== "ios") setShowTimePicker(false);
              if (!date) return;
              setTimePickerValue(date);
              await handleSetSleepAtTime(date.getHours(), date.getMinutes());
              if (Platform.OS !== "ios") setShowTimePicker(false);
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
