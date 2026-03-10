import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "../../src/context/AuthContext";
import { useLanguage, Language } from "../../src/context/LanguageContext";
import { useSubscription } from "../../src/billing/SubscriptionContext";
import {
  presentPaywallSafe,
  presentCustomerCenterSafe,
} from "../../src/billing/revenuecat";
import { C, R } from "../../src/ui/theme";
import { TAB_SAFE_BOTTOM } from "./_layout";

// ── Reusable row item ────────────────────────────────────────────────────────
function SettingsRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  rightElement,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.65 : 1}
      disabled={!onPress}
    >
      <View style={[s.rowIcon, destructive && s.rowIconDestructive]}>
        <Ionicons
          name={icon as any}
          size={20}
          color={destructive ? C.red : C.primary2}
        />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowLabel, destructive && { color: C.red }]}>{label}</Text>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
      </View>
      {rightElement ?? (
        onPress && !destructive
          ? <Ionicons name="chevron-forward" size={16} color={C.text3} />
          : null
      )}
    </TouchableOpacity>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, logout, refreshMe } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const router = useRouter();
  const [langModal, setLangModal] = React.useState(false);

  const { pro, refresh: refreshRc } = useSubscription();

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLogout = () => {
    if (Platform.OS === "web") {
      const ok = (globalThis as any)?.confirm?.(String(t("logoutConfirm") ?? "Are you sure?"));
      if (!ok) return;
      logout().then(() => router.replace("/(auth)/login")).catch(console.error);
      return;
    }
    Alert.alert(
      String(t("logout") ?? "Logout"),
      String(t("logoutConfirm") ?? "Are you sure?"),
      [
        { text: String(t("cancel") ?? "Cancel"), style: "cancel" },
        {
          text: String(t("logout") ?? "Logout"),
          style: "destructive",
          onPress: () =>
            logout().then(() => router.replace("/(auth)/login")).catch(console.error),
        },
      ],
      { cancelable: true },
    );
  };

  const handleUpgrade = () => {
    Alert.alert(
      String(t("upgradeToPremiumTitle") ?? "Upgrade to PRO"),
      String(t("upgradeToPremiumDesc") ?? "Unlock all presets and features"),
      [
        { text: String(t("cancel") ?? "Cancel"), style: "cancel" },
        {
          text: String(t("upgrade") ?? "Upgrade"),
          onPress: async () => {
            try {
              const res = await presentPaywallSafe();
              await refreshRc();
              await refreshMe();
              if (res.pro) Alert.alert("PRO ✅", "Welcome to Pro!");
            } catch (e: any) {
              Alert.alert(String(t("error") ?? "Error"), String(e?.message ?? "Purchase failed"));
            }
          },
        },
      ],
    );
  };

  const handleManageSub = async () => {
    try {
      await presentCustomerCenterSafe();
      await refreshRc();
      await refreshMe();
    } catch (e: any) {
      Alert.alert(String(t("error") ?? "Error"), String(e?.message ?? "Failed"));
    }
  };

  const handleLangSelect = async (lang: Language) => {
    await setLanguage(lang);
    setLangModal(false);
  };

  const langName = (lang: Language) => {
    switch (lang) {
      case "pl": return t("polish");
      case "en": return t("english");
      case "de": return t("german");
      default:   return String(lang);
    }
  };

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_SAFE_BOTTOM + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page title ── */}
        <View style={s.header}>
          <Text style={s.pageTitle}>{t("profile") ?? "Profile"}</Text>
        </View>

        {/* ── Avatar + name ── */}
        <View style={s.heroSection}>
          <View style={s.avatarRing}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
          </View>

          <View style={s.heroInfo}>
            <Text style={s.heroName}>{user?.name ?? "—"}</Text>
            <Text style={s.heroEmail}>{user?.email ?? ""}</Text>
          </View>

          {/* PRO / Free badge */}
          {pro ? (
            <View style={s.proBadge}>
              <Ionicons name="star" size={12} color="#FDE68A" />
              <Text style={s.proBadgeText}>PRO</Text>
            </View>
          ) : (
            <View style={s.freeBadge}>
              <Text style={s.freeBadgeText}>FREE</Text>
            </View>
          )}
        </View>

        {/* ── Subscription ── */}
        {pro ? (
          <Section title={t("subscription") ?? "Subscription"}>
            <View style={s.proCard}>
              <View style={s.proCardLeft}>
                <View style={s.proIconWrap}>
                  <Ionicons name="star" size={22} color="#FDE68A" />
                </View>
                <View>
                  <Text style={s.proCardTitle}>{t("premiumActive") ?? "Premium Active"}</Text>
                  <Text style={s.proCardSub}>{t("accessToAllPresets") ?? "All presets unlocked"}</Text>
                </View>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={C.green} />
            </View>
            <View style={s.separator} />
            <SettingsRow
              icon="settings-outline"
              label="Manage subscription"
              onPress={handleManageSub}
            />
          </Section>
        ) : (
          <TouchableOpacity style={s.upgradeCard} onPress={handleUpgrade} activeOpacity={0.8}>
            <View style={s.upgradeLeft}>
              <View style={s.upgradeIconWrap}>
                <Ionicons name="star" size={22} color={C.amber} />
              </View>
              <View>
                <Text style={s.upgradeTitle}>{t("upgradeToPremium") ?? "Upgrade to PRO"}</Text>
                <Text style={s.upgradeSub}>{t("unlockAllPresets") ?? "Unlock all lighting presets"}</Text>
              </View>
            </View>
            <View style={s.upgradeArrow}>
              <Ionicons name="chevron-forward" size={16} color={C.amber} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Preferences ── */}
        <Section title="Preferences">
          <SettingsRow
            icon="language-outline"
            label={t("language") ?? "Language"}
            value={String(langName(language))}
            onPress={() => setLangModal(true)}
          />
          <View style={s.separator} />
          <SettingsRow
            icon="hardware-chip-outline"
            label="Hub Setup"
            value="Configure your hub"
            onPress={() => router.push("/setup")}
          />
        </Section>

        {/* ── About ── */}
        <Section title={t("about") ?? "About"}>
          <SettingsRow
            icon="information-circle-outline"
            label={t("version") ?? "Version"}
            value="1.0.0"
          />
          <View style={s.separator} />
          <SettingsRow
            icon="bulb-outline"
            label={t("controlYourDevices") ?? "WLED Smart Lights"}
          />
        </Section>

        {/* ── Logout ── */}
        <Section>
          <SettingsRow
            icon="log-out-outline"
            label={t("logout") ?? "Logout"}
            onPress={handleLogout}
            destructive
          />
        </Section>
      </ScrollView>

      {/* ── Language modal ── */}
      <Modal
        visible={langModal}
        animationType="slide"
        transparent
        onRequestClose={() => setLangModal(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t("selectLanguage") ?? "Language"}</Text>
              <TouchableOpacity style={s.modalClose} onPress={() => setLangModal(false)}>
                <Ionicons name="close" size={18} color={C.text2} />
              </TouchableOpacity>
            </View>

            {(["en", "pl", "de"] as Language[]).map((lang) => {
              const flag = lang === "en" ? "🇬🇧" : lang === "pl" ? "🇵🇱" : "🇩🇪";
              const active = language === lang;
              return (
                <TouchableOpacity
                  key={lang}
                  style={[s.langOption, active && s.langOptionActive]}
                  onPress={() => handleLangSelect(lang)}
                  activeOpacity={0.7}
                >
                  <Text style={s.langFlag}>{flag}</Text>
                  <Text style={[s.langLabel, active && { color: C.text }]}>
                    {String(langName(lang))}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={C.primary} style={{ marginLeft: "auto" }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  pageTitle: { fontSize: 28, fontWeight: "900", color: C.text, letterSpacing: 0.2 },

  // ── Hero ─────────────────────────────────────────────────────────────────
  heroSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  avatarRing: {
    width: 58, height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: C.primary,
    padding: 2,
  },
  avatar: {
    flex: 1,
    borderRadius: 27,
    backgroundColor: "rgba(99,102,241,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "900", color: C.primary2 },

  heroInfo:  { flex: 1 },
  heroName:  { fontSize: 16, fontWeight: "800", color: C.text, letterSpacing: 0.1 },
  heroEmail: { fontSize: 12, color: C.text2, marginTop: 2, fontWeight: "600" },

  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
  },
  proBadgeText: { color: "#FDE68A", fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },

  freeBadge: {
    backgroundColor: C.bgCard2,
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  freeBadgeText: { color: C.text3, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },

  // ── Pro card ───────────────────────────────────────────────────────────
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  proCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  proIconWrap: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245,158,11,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  proCardTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  proCardSub:   { fontSize: 12, color: C.text2, marginTop: 2, fontWeight: "600" },

  // ── Upgrade card ───────────────────────────────────────────────────────
  upgradeCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  upgradeLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  upgradeIconWrap: {
    width: 44, height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(245,158,11,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeTitle: { fontSize: 15, fontWeight: "900", color: C.amber },
  upgradeSub:   { fontSize: 12, color: C.text2, marginTop: 2, fontWeight: "600" },
  upgradeArrow: {
    width: 30, height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(245,158,11,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Section ────────────────────────────────────────────────────────────
  section:      { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  separator: { height: 1, backgroundColor: C.border, marginHorizontal: -16 },

  // ── Settings row ───────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDestructive: { backgroundColor: "rgba(239,68,68,0.12)" },
  rowBody:  { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "700", color: C.text },
  rowValue: { fontSize: 12, color: C.text2, marginTop: 2, fontWeight: "600" },

  // ── Language modal ─────────────────────────────────────────────────────
  modalBackdrop: { flex: 1, backgroundColor: C.bgOverlay, justifyContent: "flex-end", padding: 16 },
  modalCard: {
    backgroundColor: "#090916",
    borderRadius: R.xxl,
    borderWidth: 1,
    borderColor: C.borderMd,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  modalClose: {
    width: 32, height: 32,
    borderRadius: 10,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  langOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: R.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  langOptionActive: {
    backgroundColor: "rgba(99,102,241,0.12)",
    borderColor: "rgba(99,102,241,0.35)",
  },
  langFlag:  { fontSize: 22 },
  langLabel: { fontSize: 15, fontWeight: "700", color: C.text2 },
});
