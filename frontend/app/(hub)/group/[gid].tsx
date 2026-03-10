import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import ColorPicker, { Panel3 } from "reanimated-color-picker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { HubService } from "../../../src/services/hubService";
import { rgbFromPickerPayload, rgbToHex } from "../../../src/features/deviceControl";

const EFFECTS = [
  { fx: 0,  name: "Solid",   icon: "square"                       },
  { fx: 2,  name: "Breathe", icon: "water-outline"                },
  { fx: 9,  name: "Rainbow", icon: "color-filter-outline"         },
  { fx: 25, name: "Comet",   icon: "arrow-forward-circle-outline" },
  { fx: 66, name: "Fire",    icon: "flame-outline"                },
  { fx: 76, name: "Meteor",  icon: "planet-outline"               },
  { fx: 17, name: "Twinkle", icon: "star-outline"                 },
  { fx: 3,  name: "Wipe",    icon: "brush-outline"                },
  { fx: 1,  name: "Blink",   icon: "flash-outline"                },
] as const;

const FX_NO_COLOR = new Set([9, 66]); // rainbow, fire

export default function GroupControlScreen() {
  const { gid, hubIp, groupName } = useLocalSearchParams<{
    gid: string;
    hubIp: string;
    groupName: string;
  }>();
  const router = useRouter();

  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [isOn, setIsOn]           = useState(true);
  const [brightness, setBrightness] = useState(220);
  const [rgb, setRgb]             = useState<[number, number, number]>([0, 120, 255]);
  const [hex, setHex]             = useState("#0078ff");
  const [fx, setFx]               = useState(9);
  const [speed, setSpeed]         = useState(150);
  const [intensity, setIntensity] = useState(128);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state from hub on mount
  useEffect(() => {
    (async () => {
      const st = await HubService.getGroupState(hubIp, gid);
      if (st) {
        setIsOn(st.on);
        setBrightness(st.bri);
        const col = st.col?.[0];
        if (col && col.length >= 3) {
          const r: [number, number, number] = [col[0], col[1], col[2]];
          setRgb(r);
          setHex(rgbToHex(r));
        }
        setFx(st.fx ?? 9);
        setSpeed(st.sx ?? 150);
        setIntensity(st.ix ?? 128);
      }
      setLoading(false);
    })();
  }, [gid, hubIp]);

  // Send to hub
  const send = useCallback(async (payload: Parameters<typeof HubService.setGroupState>[2]) => {
    if (!hubIp || !gid) return;
    setSending(true);
    await HubService.setGroupState(hubIp, gid, payload);
    setSending(false);
  }, [hubIp, gid]);

  const sendDebounced = (payload: Parameters<typeof HubService.setGroupState>[2]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => send(payload), 100);
  };

  // Handlers
  const handlePower = async (val: boolean) => {
    setIsOn(val);
    await send({ on: val });
  };

  const handlePickerChange = (payload: any) => {
    const newRgb = rgbFromPickerPayload(payload);
    setRgb(newRgb);
    setHex(rgbToHex(newRgb));
    sendDebounced({ col: [newRgb] });
  };

  const handlePickerComplete = (payload: any) => {
    const newRgb = rgbFromPickerPayload(payload);
    setRgb(newRgb);
    setHex(rgbToHex(newRgb));
    send({ col: [newRgb] });
  };

  const handleBrightnessComplete = (val: number) => {
    const bri = Math.round(val);
    setBrightness(bri);
    send({ bri });
  };

  const handleSpeedComplete = (val: number) => {
    const sx = Math.round(val);
    setSpeed(sx);
    send({ sx });
  };

  const handleIntensityComplete = (val: number) => {
    const ix = Math.round(val);
    setIntensity(ix);
    send({ ix });
  };

  const handleFx = async (newFx: number) => {
    setFx(newFx);
    await send({ fx: newFx, sx: speed, ix: intensity });
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const showColorPicker = !FX_NO_COLOR.has(fx);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{decodeURIComponent(groupName ?? "Grupa")}</Text>
          <Text style={s.subtitle}>{hubIp}</Text>
        </View>
        <View style={s.powerRow}>
          {sending && <ActivityIndicator size="small" color="#6366f1" style={{ marginRight: 8 }} />}
          <Switch
            value={isOn}
            onValueChange={handlePower}
            trackColor={{ false: "#334155", true: "#6366f1" }}
            thumbColor={isOn ? "#a5b4fc" : "#64748b"}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* Efekty */}
        <Text style={s.sectionTitle}>Efekt</Text>
        <View style={s.fxGrid}>
          {EFFECTS.map(e => (
            <TouchableOpacity
              key={e.fx}
              style={[s.fxCard, fx === e.fx && s.fxCardActive]}
              onPress={() => handleFx(e.fx)}
            >
              <Ionicons
                name={e.icon as any}
                size={26}
                color={fx === e.fx ? "#a5b4fc" : "#475569"}
              />
              <Text style={[s.fxName, fx === e.fx && s.fxNameActive]}>{e.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Speed */}
        <Text style={s.sectionTitle}>
          Prędkość: <Text style={s.sectionValue}>{speed}</Text>
        </Text>
        <Slider
          style={{ width: "100%", height: 36 }}
          minimumValue={0}
          maximumValue={255}
          value={speed}
          onValueChange={v => setSpeed(Math.round(v))}
          onSlidingComplete={handleSpeedComplete}
          minimumTrackTintColor="#6366f1"
          maximumTrackTintColor="#334155"
          thumbTintColor="#818cf8"
        />

        {/* Intensywność */}
        <Text style={s.sectionTitle}>
          Intensywność: <Text style={s.sectionValue}>{intensity}</Text>
        </Text>
        <Slider
          style={{ width: "100%", height: 36 }}
          minimumValue={0}
          maximumValue={255}
          value={intensity}
          onValueChange={v => setIntensity(Math.round(v))}
          onSlidingComplete={handleIntensityComplete}
          minimumTrackTintColor="#f59e0b"
          maximumTrackTintColor="#334155"
          thumbTintColor="#fbbf24"
        />

        {/* Jasność */}
        <Text style={s.sectionTitle}>
          Jasność: <Text style={s.sectionValue}>{brightness}</Text>
        </Text>
        <Slider
          style={{ width: "100%", height: 36 }}
          minimumValue={0}
          maximumValue={255}
          value={brightness}
          onValueChange={v => setBrightness(Math.round(v))}
          onSlidingComplete={handleBrightnessComplete}
          minimumTrackTintColor="#6366f1"
          maximumTrackTintColor="#334155"
          thumbTintColor="#818cf8"
        />

        {/* Kolor */}
        {showColorPicker && (
          <>
            <Text style={s.sectionTitle}>
              Kolor:{" "}
              <Text style={[s.sectionValue, { color: hex }]}>{hex}</Text>
            </Text>
            <View style={s.pickerWrap}>
              <View style={[s.colorDot, { backgroundColor: hex }]} />
              <ColorPicker
                value={hex}
                onChangeJS={handlePickerChange}
                onCompleteJS={handlePickerComplete}
                style={{ width: "100%", alignItems: "center" }}
              >
                <Panel3 style={{ width: 240, height: 240 }} />
              </ColorPicker>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  center:    { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" },

  header:   { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  back:     { padding: 4 },
  title:    { fontSize: 20, fontWeight: "700", color: "#f1f5f9" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  powerRow: { flexDirection: "row", alignItems: "center" },

  content: { padding: 16, paddingBottom: 60 },

  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#94a3b8", marginTop: 20, marginBottom: 8 },
  sectionValue: { color: "#f1f5f9" },

  fxGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fxCard:       { width: "30%", backgroundColor: "#1e293b", borderRadius: 12, padding: 12, alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#1e293b" },
  fxCardActive: { borderColor: "#6366f1", backgroundColor: "#1e1b4b" },
  fxName:       { fontSize: 12, color: "#475569", textAlign: "center" },
  fxNameActive: { color: "#a5b4fc", fontWeight: "600" },

  pickerWrap: { alignItems: "center", backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  colorDot:   { width: 28, height: 28, borderRadius: 14, marginBottom: 12, borderWidth: 2, borderColor: "#334155" },
});
