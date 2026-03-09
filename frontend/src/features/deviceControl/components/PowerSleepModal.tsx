// src/features/deviceControl/components/PowerSleepModal.tsx
import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalMode } from "../types";
import { styles } from "../styles";

export function PowerSleepModal(props: {
  visible: boolean;
  mode: ModalMode;
  onClose: () => void;

  // power
  isOn: boolean;
  onTogglePower: () => void;

  // sleep
  hasSleep: boolean;
  remainingText: string;
  onSetMinutes: (m: number) => void;
  onPickTime: () => void;
  onCancelSleep: () => void;

  isOnline: boolean;
  controlling: boolean;
  t?: (k: string) => string;
}) {
  const {
    visible,
    mode,
    onClose,
    isOn,
    onTogglePower,
    hasSleep,
    remainingText,
    onSetMinutes,
    onPickTime,
    onCancelSleep,
    isOnline,
    controlling,
    t: _t,
  } = props;

  const t = (k: string, fallback: string) => _t?.(k) ?? fallback;

  const disabled = controlling || !isOnline;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {mode === "power" ? t("power", "Power") : t("sleepTimer", "Sleep Timer")}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={20} color="#e2e8f0" />
            </TouchableOpacity>
          </View>

          {mode === "power" ? (
            <View style={{ gap: 14 }}>
              <View style={styles.modalRow}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons name="power" size={20} color="#a5b4fc" />
                  <Text style={styles.modalText}>
                    {t("status", "Status")}:{" "}
                    <Text style={styles.modalStrong}>
                      {isOn ? t("on", "ON") : t("off", "OFF")}
                    </Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalPill,
                    isOn ? styles.pillOn : styles.pillOff,
                  ]}
                  onPress={onTogglePower}
                  disabled={disabled}
                >
                  <Text style={styles.modalPillText}>
                    {isOn ? t("turnOff", "Turn OFF") : t("turnOn", "Turn ON")}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalHint}>
                {isOnline ? t("online", "Online") : t("offline", "Offline")}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <View style={styles.modalRow2}>
                {[5, 15, 30, 60].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.timerChip}
                    onPress={() => onSetMinutes(m)}
                    disabled={disabled}
                  >
                    <Text style={styles.timerChipText}>{m}m</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.modalPill}
                onPress={onPickTime}
                disabled={disabled}
              >
                <Ionicons name="time-outline" size={16} color="#e2e8f0" />
                <Text style={styles.modalPillText}>{t("offAtTime", "Off at HH:MM")}</Text>
              </TouchableOpacity>

              {hasSleep ? (
                <View style={styles.sleepInfo}>
                  <Ionicons name="alarm-outline" size={16} color="#c7d2fe" />
                  <Text style={styles.sleepInfoText}>
                    {t("remaining", "Remaining")}:{" "}
                    <Text style={styles.modalStrong}>{remainingText}</Text>
                  </Text>

                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={onCancelSleep}
                  >
                    <Text style={styles.cancelBtnText}>{t("cancel", "Cancel")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.modalHint}>{t("noActiveSleep", "No active sleep timer")}</Text>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
