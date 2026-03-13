import React, { useEffect, useRef, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Platform, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../src/context/AuthContext";
import { useLanguage } from "../../src/context/LanguageContext";
import { useHub } from "../../src/context/HubContext";
import { HubService } from "../../src/services/hubService";

import { UShapeLiveBorder } from "../../src/components/UShapeLiveBorder";

import { EffectSliders } from "../../src/features/deviceControl/components/EffectSliders";
import { ControlTutorialModal } from "../../src/features/deviceControl/components/ControlTutorialModal";

import {
  ColorSection,
  PresetsSection,
  BottomBar,
  PowerSleepModal,
  PaletteSection,
  usePaletteControl,
  applyTemperatureTint,
  rgbFromPickerPayload,
  rgbToHex,
  boostVibrance,
  clamp255,
  useDeviceControlData,
  useProPresetsGate,
  useSleepTimer,
  useWledSync,
  getPresetDefaultRgb,
  styles,
  type Preset,
  type ModalMode,
  type RGB,
} from "../../src/features/deviceControl";

type BackendControlPayload = {
  on?: boolean;
  brightness?: number;
  color?: [number, number, number];
  preset_id?: string;
  palette_slot?: number;
  palette_colors?: number[][];
};

function buildDeviceHubPayload(params: BackendControlPayload, presets: Preset[]) {
  const p: Record<string, any> = {};
  if (params.on !== undefined) p.on = params.on;
  if (params.brightness !== undefined) p.bri = Math.round(params.brightness);
  if (params.color) p.col = [params.color];
  if (params.preset_id) {
    const preset = presets.find((x) => String(x.id) === String(params.preset_id));
    if (preset?.wled_fx !== undefined) {
      p.fx = preset.wled_fx;
      if (preset.sx !== undefined) p.sx = preset.sx;
      if (preset.ix !== undefined) p.ix = preset.ix;
    }
  }
  return p;
}

export default function DeviceControlScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const { token, user, refreshMe } = useAuth() as any;
  const { t } = useLanguage();
  const { hubIp } = useHub();

  const [controlling, setControlling] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(72);
  const [isOn, setIsOn] = useState(true);

  const [brightness, setBrightness] = useState(128);
  const [baseHex, setBaseHex] = useState("#FF0000");
  const [baseRgb, setBaseRgb] = useState<[number, number, number]>([255, 0, 0]);
  const [temperature, setTemperature] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [effectSpeed, setEffectSpeed] = useState(128);
  const [effectIntensity, setEffectIntensity] = useState(128);

  const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<any>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("power");

  const openModal = (mode: ModalMode) => {
    setModalMode(mode);
    setModalVisible(true);
  };
  const closeModal = () => setModalVisible(false);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState(new Date());

  const { device, presets, loading } = useDeviceControlData({
    id,
    token,
    onError: () => {
      Alert.alert(t("error"), t("failedToLoad"));
      router.back();
    },
  });

  // Refs so useFocusEffect doesn't re-run when device/hubIp load async
  const deviceRef = useRef(device);
  const hubIpRef  = useRef(hubIp);
  useEffect(() => { deviceRef.current = device; }, [device]);
  useEffect(() => { hubIpRef.current  = hubIp;  }, [hubIp]);

  // ✅ PALETTE
  const paletteCtl = usePaletteControl({
    selectedPreset,
    presets,
    defaultPaletteSize: 1,
    defaultPalette: [baseRgb as RGB],
  });

  // ✅ Init palette z preset.palette_default gdy zmienia się preset
  useEffect(() => {
    if (!selectedPreset || !presets.length) return;
    const preset = presets.find((p: any) => p?.id === selectedPreset);
    const pal = preset?.palette_default;
    if (Array.isArray(pal) && pal.length > 0) {
      paletteCtl.initPalette(pal as RGB[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset, presets]);

  const { syncing, syncFromDevice } = useWledSync();
  const pro = useProPresetsGate({ user, token, refreshMe });

  const buildFinalRgb = (rgb: [number, number, number], temp: number) => {
    const tinted = applyTemperatureTint(rgb, temp);
    return boostVibrance(tinted, 0.35);
  };

  const stopStream = useCallback(() => {
    if (!hubIp) return;
    setIsStreaming(false);
    HubService.getGroups(hubIp)
      .then((groups) => Promise.allSettled(groups.map((g) => HubService.deleteGroup(hubIp, g.id))))
      .catch(() => {});
  }, [hubIp]);

  const isFocused = useRef(false);

  // On focus: "steal" this device from any running hub groups so other devices
  // in those groups keep streaming, then create an individual group for this device.
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      const hubip = hubIpRef.current;
      const dev   = deviceRef.current;
      if (!hubip || !dev) return;

      (async () => {
        try {
          const hubGroups = await HubService.getGroups(hubip);
          await Promise.allSettled(
            hubGroups.map((g) => {
              const remaining = g.devices.filter((ip) => ip !== dev.ip_address);
              if (remaining.length === 0) {
                return HubService.deleteGroup(hubip, g.id);
              }
              // Keep the group alive for the other devices, just without this one
              return HubService.upsertGroup(hubip, g.id, g.id, remaining);
            }),
          );
        } catch { /* hub offline — ignore */ }

        if (!isFocused.current) return;
        await HubService.upsertGroup(hubip, String(id), dev.name, [dev.ip_address]).catch(() => {});
        if (isFocused.current) setIsStreaming(true);
      })();

      return () => { isFocused.current = false; };
    }, [id]),
  );

  // When device loads AFTER focus is active (slow network) → register it
  useEffect(() => {
    if (!isFocused.current || !device || !hubIp) return;
    (async () => {
      try {
        const hubGroups = await HubService.getGroups(hubIp);
        await Promise.allSettled(
          hubGroups.map((g) => {
            if (g.id === String(id)) return; // already our group
            const remaining = g.devices.filter((ip) => ip !== device.ip_address);
            if (remaining.length === 0) return HubService.deleteGroup(hubIp, g.id);
            return HubService.upsertGroup(hubIp, g.id, g.id, remaining);
          }),
        );
      } catch { /* ignore */ }
      if (!isFocused.current) return;
      await HubService.upsertGroup(hubIp, String(id), device.name, [device.ip_address]).catch(() => {});
      if (isFocused.current) setIsStreaming(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, hubIp]);

  const controlViaHub = useCallback(
    async (payload: BackendControlPayload) => {
      if (!hubIp) throw new Error("No hub IP");
      const hubPayload = buildDeviceHubPayload(payload, presets);
      const groupId = String(id);
      const ok = await HubService.setGroupState(hubIp, groupId, hubPayload as any);
      if (!ok && device) {
        // Hub may have restarted — re-register group and retry once
        await HubService.upsertGroup(hubIp, groupId, device.name, [device.ip_address]);
        await HubService.setGroupState(hubIp, groupId, hubPayload as any);
      }
    },
    [hubIp, id, presets, device],
  );

  const controlDevice = async (action: () => Promise<any>) => {
    if (!hubIp) {
      Alert.alert(t("deviceOffline"), t("deviceNotReachable"));
      return;
    }
    setControlling(true);
    try {
      await action();
    } catch {
      // silently ignore — hub may be temporarily unreachable
    } finally {
      setControlling(false);
    }
  };

  const sleep = useSleepTimer({
    deviceId: device?.id,
    onFire: async () => {
      await controlDevice(() => controlViaHub({ on: false }));
      setIsOn(false);
    },
  });

  // ✅ PALETTE: accept paletteSlot + paletteColors by value (nie stale closure)
  const sendColorDebounced = (
    rgb: [number, number, number],
    paletteSlot?: number,
    paletteColors?: number[][],
  ) => {
    if (!hubIp) return;

    if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
    colorDebounceRef.current = setTimeout(() => {
      controlViaHub({
        color: [rgb[0], rgb[1], rgb[2]],
        ...(selectedPreset ? { preset_id: selectedPreset } : {}),
        ...(paletteSlot !== undefined ? { palette_slot: paletteSlot } : {}),
        ...(paletteColors ? { palette_colors: paletteColors } : {}),
      }).catch(() => {});
    }, 120);
  };

  const handleTogglePower = async (value: boolean) => {
    setIsOn(value);
    await controlDevice(() => controlViaHub({ on: value }));
  };

  const handleSetSleepMinutes = async (minutes: number) => {
    await sleep.setMinutes(minutes);
    // Immediately dim to signal "sleep mode active"
    setBrightness(25);
    await controlDevice(() => controlViaHub({ brightness: 25 }));
    closeModal();
  };

  const handleSetSleepAtTime = async (hours: number, minutes: number) => {
    await sleep.setOffAtTime(hours, minutes);
    setBrightness(25);
    await controlDevice(() => controlViaHub({ brightness: 25 }));
  };

  const handleSync = async () => {
    if (!device?.ip_address) {
      Alert.alert(t("deviceOffline"), t("deviceNotReachable"));
      return;
    }

    const res = await syncFromDevice(device.ip_address);
    if (!res.ok) return Alert.alert(t("error"), res.error);

    const next = res.next;
    if (typeof next.isOn === "boolean") setIsOn(next.isOn);
    if (typeof next.brightness === "number") setBrightness(next.brightness);
    if (next.baseRgb) setBaseRgb(next.baseRgb);
    if (next.baseHex) setBaseHex(next.baseHex);

    setTemperature(0);
    setSelectedPreset(null);
  };

  const onPickerChange = (payload: any) => {
    const rgb = rgbFromPickerPayload(payload);
    setBaseRgb(rgb);
    setBaseHex(rgbToHex(rgb));
    // ✅ PALETTE: update frontend state + przekaż slot + całą paletę do debounce
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
    setBaseHex(hex);
    setBaseRgb(rgb);
    // ✅ PALETTE: update frontend state
    if (paletteCtl.visible) {
      paletteCtl.setSlotColor(paletteCtl.paletteSlot, rgb);
    }

    const adjusted = buildFinalRgb(rgb, temperature);
    await controlDevice(() =>
      controlViaHub({
        color: [adjusted[0], adjusted[1], adjusted[2]],
        ...(selectedPreset ? { preset_id: selectedPreset } : {}),
        ...(paletteCtl.visible ? { palette_slot: paletteCtl.paletteSlot } : {}),
        // ✅ wysyłamy całą paletę — backend jest bezstanowy, ładuje preset od nowa
        ...(paletteCtl.visible ? { palette_colors: paletteCtl.palette } : {}),
      }),
    );
  };

  const onTemperatureChange = (v: number) => {
    const vv = Math.round(v);
    setTemperature(vv);
    sendColorDebounced(
      buildFinalRgb(baseRgb, vv),
      paletteCtl.paletteSlot,
      paletteCtl.visible ? paletteCtl.palette : undefined,
    );
  };

  const onTemperatureComplete = async () => {
    const adjusted = buildFinalRgb(baseRgb, temperature);
    await controlDevice(() =>
      controlViaHub({
        color: [adjusted[0], adjusted[1], adjusted[2]],
        ...(selectedPreset ? { preset_id: selectedPreset } : {}),
        ...(paletteCtl.visible ? { palette_slot: paletteCtl.paletteSlot } : {}),
        ...(paletteCtl.visible ? { palette_colors: paletteCtl.palette } : {}),
      }),
    );
  };

  const onBrightnessComplete = async () => {
    const adjusted = buildFinalRgb(baseRgb, temperature);
    await controlDevice(() =>
      controlViaHub({
        brightness: Math.round(brightness),
        ...(selectedPreset ? { preset_id: selectedPreset } : {}),
        // ✅ gdy paleta aktywna — NIE wysyłamy color (żeby nie nadpisać slotu),
        //    tylko całą paletę żeby zachować wszystkie kolory
        ...(paletteCtl.visible
          ? { palette_colors: paletteCtl.palette }
          : { color: [adjusted[0], adjusted[1], adjusted[2]] }
        ),
      }),
    );
  };

  // ✅ PALETTE: klik slotu = tylko selekcja do edycji, sync pickera
  const onPickPaletteSlot = (slot: number) => {
    paletteCtl.pickSlot(slot);

    const c = paletteCtl.palette?.[slot];
    if (!c || c.length < 3) return;

    const rgb: [number, number, number] = [
      clamp255(c[0]),
      clamp255(c[1]),
      clamp255(c[2]),
    ];
    setBaseRgb(rgb);
    setBaseHex(rgbToHex(rgb));
  };

  const handlePresetSelect = async (preset: Preset) => {
    if (!pro.canUsePreset(preset)) {
      const packId = preset.pack_id || "pro-pack";
      Alert.alert(
        "PRO Preset Pack",
        `Ten preset jest PRO.\n\nOdblokować paczkę "${packId}" na 60 minut?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unlock 1h",
            onPress: async () => {
              const r = await pro.startPackTrial(preset.pack_id);
              if (!r.ok) Alert.alert("Error", r.error);
              else
                Alert.alert(
                  "Unlocked ✅",
                  `Pack "${packId}" odblokowany na 60 min`,
                );
            },
          },
          { text: "Upgrade", onPress: () => router.push("/(tabs)/profile") },
        ],
      );
      return;
    }

    setSelectedPreset(preset.id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });

    // Use the preset's own default color — not the user's currently selected color
    const defaultRgb = getPresetDefaultRgb(preset);
    setBaseRgb(defaultRgb);
    setBaseHex(rgbToHex(defaultRgb));
    setTemperature(0);
    setEffectSpeed((preset as any).sx ?? 128);
    setEffectIntensity((preset as any).ix ?? 128);

    await controlDevice(() =>
      controlViaHub({
        preset_id: preset.id,
        color: defaultRgb,
        brightness: Math.round(brightness),
        on: true,
      }),
    );

    setIsOn(true);
  };

  const selectedPresetObj = presets.find((p: any) => p?.id === selectedPreset) ?? null;
  const colorLocked = !!selectedPresetObj?.color_locked;

  const handleResetColors = async () => {
    if (!selectedPresetObj) return;
    const defaultRgb = getPresetDefaultRgb(selectedPresetObj);
    setBaseRgb(defaultRgb);
    setBaseHex(rgbToHex(defaultRgb));
    setTemperature(0);
    await controlDevice(() =>
      controlViaHub({
        preset_id: selectedPresetObj.id,
        color: defaultRgb,
        brightness: Math.round(brightness),
      }),
    );
  };

  const sendEffectParams = (sx: number, ix: number) => {
    if (!hubIp) return;
    if (effectDebounceRef.current) clearTimeout(effectDebounceRef.current);
    effectDebounceRef.current = setTimeout(async () => {
      const groupId = String(id);
      const payload = { seg: [{ sx: Math.round(sx), ix: Math.round(ix) }] } as any;
      const ok = await HubService.setGroupState(hubIp, groupId, payload).catch(() => false);
      if (!ok && device) {
        await HubService.upsertGroup(hubIp, groupId, device.name, [device.ip_address]);
        HubService.setGroupState(hubIp, groupId, payload).catch(() => {});
      }
    }, 80);
  };

  const adjustedRgb = buildFinalRgb(baseRgb, temperature);
  const adjustedHex = rgbToHex(adjustedRgb);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const BORDER_THICKNESS = 6;
  const BORDER_GUTTER = BORDER_THICKNESS + 10;

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1 }}>
        <View
          style={styles.header}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>{device?.name ?? "-"}</Text>
            <Text style={styles.statusText}>
              {device?.ip_address} {device?.led_count ? `· ${device.led_count} LEDs` : ""}
            </Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: 140,
              paddingLeft: BORDER_GUTTER,
              paddingRight: BORDER_GUTTER,
            },
          ]}
        >
          {selectedPreset !== null && (
            <EffectSliders
              presetName={selectedPresetObj?.name}
              speed={effectSpeed}
              intensity={effectIntensity}
              controlling={controlling}
              isOnline={!!hubIp}
              onSpeedChange={(v) => { setEffectSpeed(v); sendEffectParams(v, effectIntensity); }}
              onSpeedComplete={(v) => { setEffectSpeed(v); sendEffectParams(v, effectIntensity); }}
              onIntensityChange={(v) => { setEffectIntensity(v); sendEffectParams(effectSpeed, v); }}
              onIntensityComplete={(v) => { setEffectIntensity(v); sendEffectParams(effectSpeed, v); }}
            />
          )}

          <ColorSection
            title={t("color") ?? "Color"}
            baseHex={baseHex}
            adjustedHex={adjustedHex}
            adjustedRgb={adjustedRgb}
            temperature={temperature}
            brightness={brightness}
            controlling={controlling}
            isOnline={!!hubIp}
            colorLocked={colorLocked}
            onResetColors={colorLocked ? undefined : handleResetColors}
            onPickerChange={onPickerChange}
            onPickerComplete={onPickerComplete}
            onTemperatureChange={onTemperatureChange}
            onTemperatureComplete={onTemperatureComplete}
            onBrightnessChange={setBrightness}
            onBrightnessComplete={onBrightnessComplete}
          />

          {/* ✅ PALETTE SECTION */}
          <PaletteSection
            visible={paletteCtl.visible}
            title={t("palette") ?? "Palette"}
            disabled={controlling || !hubIp}
            paletteSize={paletteCtl.paletteSize}
            palette={paletteCtl.palette}
            paletteSlot={paletteCtl.paletteSlot}
            onPickSlot={onPickPaletteSlot}
          />

          <PresetsSection
            title={t("presets") ?? "Presets"}
            presets={presets}
            selectedPreset={selectedPreset}
            controlling={controlling}
            isOnline={!!hubIp}
            lockedFn={(p) => p.is_premium && !pro.canUsePreset(p)}
            trialActiveFn={(p) =>
              !user?.has_subscription &&
              p.is_premium &&
              !!pro.canUsePreset(p) &&
              pro.hasActiveTrialForPack(p.pack_id)
            }
            onSelect={handlePresetSelect}
          />
        </ScrollView>

        <BottomBar
          isOnline={!!hubIp}
          controlling={controlling}
          isOn={isOn}
          hasSleep={!!sleep.sleepTargetTs}
          syncing={syncing}
          isStreaming={isStreaming}
          onPower={() => handleTogglePower(!isOn)}
          onSleep={() => openModal("sleep")}
          onSync={handleSync}
          onStop={stopStream}
          t={t as (k: string) => string}
        />

        {/* Border renderowany jako ostatni — na wierzchu ScrollView/BottomBar */}
        {!!hubIp && !!isStreaming && (
          <UShapeLiveBorder
            hubIp={hubIp}
            groupId={String(id)}
            deviceIp={device?.ip_address}
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
          controlling={controlling}
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

        <ControlTutorialModal userId={user?.id} />
      </View>
    </SafeAreaView>
  );
}
