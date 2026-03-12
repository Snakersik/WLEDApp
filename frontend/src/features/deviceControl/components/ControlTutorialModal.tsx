// src/features/deviceControl/components/ControlTutorialModal.tsx
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useLanguage } from "../../../context/LanguageContext";

const STORAGE_KEY = "control_tutorial_seen";

type TutorialItem = {
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: "tutorialBrightness" | "tutorialEffect" | "tutorialActiveEffect";
};

const ITEMS: TutorialItem[] = [
  { icon: "color-palette-outline", labelKey: "tutorialBrightness" },
  { icon: "sparkles-outline", labelKey: "tutorialEffect" },
  { icon: "flash-outline", labelKey: "tutorialActiveEffect" },
];

export function ControlTutorialModal({
  userId,
}: {
  userId?: string;
}) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  const storageKey = userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      if (val !== "1") setVisible(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const dismiss = async () => {
    if (dontShow) {
      await AsyncStorage.setItem(storageKey, "1");
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={dismiss}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="information-circle" size={36} color="#6366f1" />
          </View>

          <Text style={s.title}>{t("tutorialTitle")}</Text>

          <View style={s.items}>
            {ITEMS.map((item) => (
              <View key={item.labelKey} style={s.row}>
                <Ionicons name={item.icon} size={20} color="#6366f1" style={{ marginTop: 2 }} />
                <Text style={s.rowText}>{t(item.labelKey)}</Text>
              </View>
            ))}
          </View>

          <View style={s.checkRow}>
            <Switch
              value={dontShow}
              onValueChange={setDontShow}
              trackColor={{ false: "#334155", true: "#6366f1" }}
              thumbColor="#f1f5f9"
            />
            <TouchableOpacity onPress={() => setDontShow((v) => !v)}>
              <Text style={s.checkLabel}>{t("tutorialDontShow")}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.btn} onPress={dismiss}>
            <Text style={s.btnText}>{t("tutorialGotIt")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: 16,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#1e3a5f",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "#f1f5f9",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  items: {
    width: "100%",
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  rowText: {
    color: "#cbd5e1",
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  checkLabel: {
    color: "#94a3b8",
    fontSize: 14,
  },
  btn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
