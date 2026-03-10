// src/features/deviceControl/hooks/useProPresetsGate.ts
import axios from "axios";
import { API_URL } from "../constants";
import { Preset } from "../types";

export function useProPresetsGate(params: {
  user: any;
  token: string;
  refreshMe?: () => Promise<void>;
}) {
  const { user, token, refreshMe } = params;

  const hasActiveTrialForPack = (packId?: string | null) => {
    if (!packId) return false;
    const until = user?.pro_trials?.[packId]; // ISO string
    if (!until) return false;
    const ts = new Date(until).getTime();
    return Number.isFinite(ts) && ts > Date.now();
  };

  const canUsePreset = (preset: Preset) => {
    if (!preset.is_premium) return true;
    if (user?.has_subscription) return true;
    return hasActiveTrialForPack(preset.pack_id);
  };

  const startPackTrial = async (packId?: string | null) => {
    if (!packId) {
      return { ok: false as const, error: "Preset pack_id missing" };
    }
    try {
      await axios.post(
        `${API_URL}/auth/start-pack-trial`,
        { pack_id: packId, minutes: 60 },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (typeof refreshMe === "function") {
        await refreshMe();
      }

      return { ok: true as const };
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Failed to start trial";
      return { ok: false as const, error: msg };
    }
  };

  return {
    hasActiveTrialForPack,
    canUsePreset,
    startPackTrial,
  };
}
