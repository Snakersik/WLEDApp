// src/features/deviceControl/styles.ts
import { StyleSheet } from "react-native";
import { C, R } from "../../ui/theme";

export const styles = StyleSheet.create({
  // ── Screen ────────────────────────────────────────────────────
  container:        { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg },

  // ── Header (kept for DeviceHeader compat) ─────────────────────
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: "hidden",
  },
  backButton:  { width: 44, height: 44, justifyContent: "center" },
  headerInfo:  { flex: 1, alignItems: "center" },
  placeholder: { width: 44 },
  title:       { fontSize: 18, fontWeight: "800", color: C.text, letterSpacing: 0.2 },
  statusRow:   { flexDirection: "row", alignItems: "center", marginTop: 4 },
  statusDot:   { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },
  statusOnline:  { backgroundColor: C.green },
  statusOffline: { backgroundColor: C.text3 },
  statusText:    { fontSize: 12, color: C.text2 },

  // ── Scroll content ────────────────────────────────────────────
  content:      { paddingHorizontal: 16, paddingTop: 8 },
  section:      { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.text3,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 14,
  },

  // ── Section card (wraps each section) ─────────────────────────
  sectionCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    overflow: "hidden",
  },

  // ── Color picker card ─────────────────────────────────────────
  pickerCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  colorPreviewDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    shadowRadius: 6,
    shadowOpacity: 0.7,
    shadowOffset: { width: 0, height: 0 },
  },
  pickerHex: { color: C.text, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  pickerRgb: { color: C.text3, marginLeft: "auto", fontSize: 12, fontWeight: "600" },

  subLabel: { color: C.text3, fontSize: 12, fontWeight: "700", marginBottom: 8, letterSpacing: 0.5 },
  subValue: { color: C.text,  fontWeight: "800" },

  sliderRow:  { flexDirection: "row", alignItems: "center" },
  slider:     { flex: 1, marginHorizontal: 12 },
  rightValue: { color: C.text, fontWeight: "800", minWidth: 38, textAlign: "right", fontSize: 13 },

  sectionHint: { color: C.text3, fontSize: 12, marginTop: 8, lineHeight: 17 },

  // ── Presets grid ──────────────────────────────────────────────
  presetsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  presetCard: {
    width: "47%",
    aspectRatio: 1.15,
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    gap: 8,
  },
  presetCardSelected: {
    borderColor: C.primary,
    backgroundColor: "rgba(99,102,241,0.14)",
    shadowColor: C.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  presetCardLocked: { opacity: 0.55 },

  lockBadge: {
    position: "absolute",
    top: 7, right: 7,
    backgroundColor: "rgba(245,158,11,0.18)",
    borderRadius: 8,
    width: 20, height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
  },
  trialBadge: {
    position: "absolute",
    top: 7, left: 7,
    backgroundColor: "rgba(99,102,241,0.18)",
    borderRadius: 8,
    width: 20, height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.4)",
  },

  presetName: {
    fontSize: 13,
    color: C.text2,
    textAlign: "center",
    fontWeight: "700",
    lineHeight: 17,
  },
  presetNameSelected: { color: C.text, fontWeight: "800" },

  packLabel: {
    marginTop: 4,
    fontSize: 9,
    color: C.text3,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // ── Bottom bar (legacy — replaced by BottomBar.tsx component) ─
  bottomBar: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(7,7,26,0.97)",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: R.md,
  },
  iconLabel: { color: C.text3, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  // ── Modal ─────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: C.bgOverlay,
    padding: 16,
    justifyContent: "flex-end",
  },
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
    width: 36, height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
  },

  modalRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalRow2: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modalText: { color: C.text, fontSize: 13, fontWeight: "700" },
  modalStrong: { color: C.text, fontWeight: "900" },
  modalHint: { color: C.text2, fontSize: 12, lineHeight: 17 },

  modalPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  pillOn:  { borderColor: C.primary,  backgroundColor: "rgba(99,102,241,0.14)" },
  pillOff: { borderColor: C.border },
  modalPillText: { color: C.text, fontWeight: "800", fontSize: 13 },

  timerChip: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  timerChipText: { color: C.text, fontWeight: "800", fontSize: 12 },

  sleepInfo: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(99,102,241,0.08)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.25)",
    borderRadius: R.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sleepInfoText: { color: "#C7D2FE", fontWeight: "700", fontSize: 13, flex: 1, lineHeight: 18 },
  cancelBtn: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelBtnText: { color: "#FCA5A5", fontWeight: "800", fontSize: 12 },

  // ── Sync setup button ─────────────────────────────────────────
  syncSetupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(99,102,241,0.15)",
    borderRadius: R.lg,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.primary,
  },
  syncSetupText: { color: C.text, fontWeight: "800", fontSize: 14 },

  infoBox: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(99,102,241,0.07)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.22)",
    borderRadius: R.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoText: { color: "#C7D2FE", fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 17 },
});
