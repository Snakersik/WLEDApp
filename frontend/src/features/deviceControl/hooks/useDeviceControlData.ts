// src/features/deviceControl/hooks/useDeviceControlData.ts
import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../constants";
import { Device, Preset } from "../types";
import { WLEDService } from "../../../services/wledService";

export function useDeviceControlData(params: {
  id: string | string[] | undefined;
  token: string;
  onError: () => void;
}) {
  const { id, token, onError } = params;

  const [device, setDevice] = useState<Device | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const [deviceRes, presetsRes] = await Promise.all([
          axios.get(`${API_URL}/devices/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/presets`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const deviceData = deviceRes.data as Device;
        const isOnline = await WLEDService.isOnline(deviceData.ip_address);
        deviceData.is_online = isOnline;

        if (!alive) return;
        setDevice(deviceData);
        setPresets(presetsRes.data);
      } catch {
        if (!alive) return;
        onError();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, token]);

  // poll status
  useEffect(() => {
    if (!device?.ip_address) return;

    const interval = setInterval(async () => {
      const isOnline = await WLEDService.isOnline(device.ip_address);
      setDevice((prev) => (prev ? { ...prev, is_online: isOnline } : prev));
    }, 5000);

    return () => clearInterval(interval);
  }, [device?.ip_address]);

  return { device, setDevice, presets, setPresets, loading };
}
