// style/device.styles.ts
import { StyleSheet } from "react-native";
import { C, R } from "../ui/theme";

export const deviceStyles = StyleSheet.create({
  // ===== SCREEN =====
  container:        { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },

  // ===== HEADER =====
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
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: C.text,
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: C.text2,
    fontWeight: "700",
  },
  addButton: {
    backgroundColor: C.primary,
    width: 46,
    height: 46,
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

  listContent: { padding: 16, paddingBottom: 18 },

  // ===== DEVICE CARD =====
  deviceCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },

  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  deviceInfo:  { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  deviceText:  { marginLeft: 12, flex: 1 },

  deviceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  deviceName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
    letterSpacing: 0.2,
  },

  // ===== STATUS BADGE =====
  badgeOnline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.greenGlow,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  badgeOffline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
  },
  badgeDotOnline:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.green },
  badgeDotOffline: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.text3 },
  badgeText: { color: C.text, fontWeight: "800", fontSize: 11 },

  // ===== META =====
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  deviceMetaText: { fontSize: 12, color: C.text2, fontWeight: "600" },

  rightCol: { alignItems: "flex-end", gap: 10 },

  quickPowerBtn: {
    width: 40,
    height: 40,
    borderRadius: R.sm,
    backgroundColor: C.bgCard2,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // ===== CHIPS =====
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.30)",
    maxWidth: "100%",
  },
  chipText: { color: "#C7D2FE", fontWeight: "800", fontSize: 11, maxWidth: 220 },
  chipMuted: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipMutedText: { color: C.text2, fontWeight: "700", fontSize: 11 },
  chipWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.amberGlow,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
  },
  chipWarnText: { color: "#FDE68A", fontWeight: "800", fontSize: 11 },

  // ===== EMPTY =====
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyText:      { fontSize: 20, fontWeight: "800", color: C.text, marginTop: 16 },
  emptySubtext:   { fontSize: 14, color: C.text2, marginTop: 8, textAlign: "center", lineHeight: 18 },

  // ===== MODAL BASE =====
  modalOverlay:  { flex: 1, backgroundColor: C.bgOverlay, justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#090916",
    borderTopLeftRadius:  R.xxl,
    borderTopRightRadius: R.xxl,
    padding: 18,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: C.borderMd,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle:  { fontSize: 22, fontWeight: "900", color: C.text },
  modalScroll: { maxHeight: 540 },

  // ===== LOCATION ROW =====
  locationRow: {
    marginBottom: 14,
    backgroundColor: C.bgCard,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
  },
  locationLabel: { color: C.text3, fontSize: 12, fontWeight: "800" },
  locationSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.bgCard2,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationValue: { color: C.text, fontWeight: "900", flex: 1 },

  // ===== SELECT METHODS =====
  methodSelector: { gap: 14 },
  methodButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  methodIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(99,102,241,0.15)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  methodTextContainer:  { flex: 1 },
  methodButtonTitle:    { fontSize: 16, fontWeight: "900", color: C.text, marginBottom: 4 },
  methodButtonDesc:     { fontSize: 12, color: C.text2, fontWeight: "600" },

  // ===== SCAN =====
  scanMode:           { minHeight: 300 },
  scanningContainer:  { alignItems: "center", paddingVertical: 40 },
  scanningText:       { fontSize: 14, color: C.text2, marginTop: 12, fontWeight: "700" },

  emptyStateContainer: { alignItems: "center", paddingVertical: 40 },
  emptyStateText:      { fontSize: 14, color: C.text2, marginTop: 16, marginBottom: 18, fontWeight: "700" },
  retryButton: {
    backgroundColor: C.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: R.sm,
  },
  retryButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },

  discoveredDevice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bgCard,
    borderRadius: R.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  discoveredDeviceInfo: { flex: 1, marginLeft: 12 },
  discoveredDeviceName: { fontSize: 15, fontWeight: "900", color: C.text, marginBottom: 4 },
  discoveredDeviceIP:   { fontSize: 12, color: C.text2, fontWeight: "600" },

  notFoundButton:     { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  notFoundButtonText: { fontSize: 13, color: C.primary2, fontWeight: "900" },

  // ===== SETUP =====
  setupMode:       { minHeight: 350 },
  setupStep:       { paddingVertical: 16 },
  stepIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    alignSelf: "center",
    shadowColor: C.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  stepNumber:       { fontSize: 22, fontWeight: "900", color: "#fff" },
  setupStepTitle:   { fontSize: 18, fontWeight: "900", color: C.text, marginBottom: 8, textAlign: "center" },
  setupStepDesc:    { fontSize: 13, color: C.text2, marginBottom: 18, textAlign: "center", lineHeight: 18, fontWeight: "600" },

  wledAPBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.12)",
    borderRadius: R.sm,
    padding: 14,
    marginVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.30)",
  },
  wledAPText: { fontSize: 22, fontWeight: "900", color: C.primary2, marginLeft: 12 },

  setupInstruction: { fontSize: 13, color: C.text2, marginVertical: 12, textAlign: "center", lineHeight: 18, fontWeight: "600" },

  setupInput: {
    backgroundColor: C.bgCard2,
    borderRadius: R.sm,
    padding: 14,
    color: C.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  setupButton: {
    backgroundColor: C.primary,
    borderRadius: R.sm,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  setupButtonDisabled: { opacity: 0.55 },
  setupButtonText:     { color: "#fff", fontSize: 14, fontWeight: "900" },

  waitingContainer: { alignItems: "center", paddingVertical: 36 },
  waitingText:      { fontSize: 13, color: C.text2, marginTop: 12, textAlign: "center", fontWeight: "600" },

  // ===== MANUAL ADD =====
  manualMode: { paddingVertical: 16 },
  modalInput: {
    backgroundColor: C.bgCard2,
    borderRadius: R.sm,
    padding: 14,
    color: C.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalButton: {
    backgroundColor: C.primary,
    borderRadius: R.sm,
    padding: 14,
    alignItems: "center",
    marginTop: 6,
  },
  modalButtonDisabled: { opacity: 0.55 },
  modalButtonText:     { color: "#fff", fontSize: 14, fontWeight: "900" },

  backButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, marginTop: 12 },
  backButtonText: { fontSize: 13, color: C.text3, marginLeft: 8, fontWeight: "700" },

  // ===== WEB INFO =====
  webInfoBox: {
    backgroundColor: "rgba(99,102,241,0.12)",
    borderRadius: R.sm,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.30)",
    flexDirection: "row",
    alignItems: "center",
  },
  webInfoText: { flex: 1, fontSize: 13, color: C.text, marginLeft: 12, lineHeight: 18, fontWeight: "600" },

  // ===== LOCATION PICKER MODAL =====
  locBackdrop: { flex: 1, backgroundColor: C.bgOverlay, padding: 18, justifyContent: "center" },
  locCard: {
    backgroundColor: "#090916",
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.borderMd,
    padding: 14,
  },
  locHeader:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  locTitle:        { color: C.text, fontSize: 16, fontWeight: "900" },
  locItem:         { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: R.sm },
  locItemSelected: { backgroundColor: C.bgCard2 },
  locItemText:     { color: C.text2, fontWeight: "700" },

  // ===== CHOICE MODAL =====
  choiceBackdrop: { flex: 1, backgroundColor: C.bgOverlay, padding: 24, justifyContent: "center" },
  choiceCard: {
    backgroundColor: "#0d1424",
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.borderMd,
    padding: 20,
  },
  choiceIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: "#1e1b4b",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  choiceTitle:    { color: C.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  choiceSubtitle: { color: C.text2, fontSize: 13, marginTop: 4, textAlign: "center" },

  choicePrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.primary,
    borderRadius: R.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  choicePrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  choicePrimaryDesc: { color: "#c7d2fe", fontSize: 12, marginTop: 2 },

  choiceSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  choiceSecondaryTitle: { color: C.text2, fontWeight: "600", fontSize: 15 },
  choiceSecondaryDesc:  { color: C.text3, marginTop: 2, fontSize: 12 },
  choiceHint:           { color: C.text3, marginTop: 12, fontSize: 12, lineHeight: 16, fontWeight: "600" },
});
