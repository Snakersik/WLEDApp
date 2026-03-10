// src/features/deviceControl/hooks/useSleepTimer.ts
import { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SleepData } from "../types";

export function useSleepTimer(params: {
  deviceId?: string;
  onFire: () => Promise<void> | void; // co zrobić gdy timer dojdzie do zera (np. power off)
}) {
  const { deviceId, onFire } = params;

  const sleepKey = useMemo(() => {
    return deviceId ? `sleepTimer:${deviceId}` : null;
  }, [deviceId]);

  const [sleepTargetTs, setSleepTargetTs] = useState<number | null>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number>(0);

  const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearInternals = () => {
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    if (sleepTickRef.current) clearInterval(sleepTickRef.current);
    sleepTimeoutRef.current = null;
    sleepTickRef.current = null;
    setSleepTargetTs(null);
    setSleepRemainingSec(0);
  };

  const persist = async (targetTs: number | null) => {
    if (!sleepKey) return;
    if (!targetTs) {
      await AsyncStorage.removeItem(sleepKey);
      return;
    }
    const payload: SleepData = { targetTs };
    await AsyncStorage.setItem(sleepKey, JSON.stringify(payload));
  };

  const schedule = async (targetTs: number) => {
    if (!sleepKey) return;

    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    if (sleepTickRef.current) clearInterval(sleepTickRef.current);

    setSleepTargetTs(targetTs);
    await persist(targetTs);

    const tick = () => {
      const ms = targetTs - Date.now();
      const sec = Math.max(0, Math.floor(ms / 1000));
      setSleepRemainingSec(sec);
    };

    tick();
    sleepTickRef.current = setInterval(tick, 1000);

    const msLeft = Math.max(0, targetTs - Date.now());
    sleepTimeoutRef.current = setTimeout(async () => {
      await onFire();
      clearInternals();
      await persist(null);
    }, msLeft);
  };

  const cancel = async () => {
    clearInternals();
    await persist(null);
  };

  const setMinutes = async (minutes: number) => {
    const targetTs = Date.now() + minutes * 60 * 1000;
    await schedule(targetTs);
  };

  const setOffAtTime = async (hours: number, minutes: number) => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    await schedule(target.getTime());
  };

  // restore on mount/device change
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!sleepKey) return;
      try {
        const raw = await AsyncStorage.getItem(sleepKey);
        if (!raw) return;
        const parsed: SleepData = JSON.parse(raw);
        if (!parsed?.targetTs) return;

        if (parsed.targetTs <= Date.now()) {
          await AsyncStorage.removeItem(sleepKey);
          return;
        }
        if (!alive) return;
        await schedule(parsed.targetTs);
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
      if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
      if (sleepTickRef.current) clearInterval(sleepTickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepKey]);

  const formatRemaining = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return {
    sleepTargetTs,
    sleepRemainingSec,
    formatRemaining,
    setMinutes,
    setOffAtTime,
    cancel,
  };
}
