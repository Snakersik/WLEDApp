/**
 * Hub service — komunikuje się bezpośrednio z MicroPython hubem
 * przez jego WLED-kompatybilne API.
 * NIE idzie przez backend.
 */

export interface HubLedState {
  on: boolean;
  bri: number;
  seg: Array<{
    col: number[][];
    fx: number;
    sx: number;
    ix: number;
    pal: number;
  }>;
}

export interface HubControlPayload {
  on?: boolean;
  bri?: number;
  seg?: Array<{
    col?: number[][];
    fx?: number;
    sx?: number;
    ix?: number;
    pal?: number;
  }>;
}

export interface HubDevice {
  id: string;
  ip: string;
  name: string;
}

export interface HubGroupState {
  on: boolean;
  bri: number;
  fx: number;
  col: number[][];
  sx: number;
  ix: number;
}

export interface HubGroup {
  id: string;
  name: string;
  devices: string[]; // IP addresses
  state: HubGroupState;
}

const TIMEOUT = 4000;

async function fetchWithTimeout(url: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export const HubService = {
  // ── WLED-compat state ─────────────────────────────────────
  async getState(ip: string): Promise<HubLedState | null> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/json/state`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async isOnline(ip: string): Promise<boolean> {
    return (await this.getState(ip)) !== null;
  },

  async sendCommand(ip: string, payload: HubControlPayload): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/json/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async setPower(ip: string, on: boolean) {
    return this.sendCommand(ip, { on });
  },

  async setBrightness(ip: string, bri: number) {
    return this.sendCommand(ip, { bri: Math.round(bri) });
  },

  async setColor(ip: string, rgb: [number, number, number]) {
    return this.sendCommand(ip, { seg: [{ col: [rgb] }] });
  },

  async setEffect(ip: string, fx: number, sx = 150, ix = 128) {
    return this.sendCommand(ip, { seg: [{ fx, sx, ix }] });
  },

  async setSpeed(ip: string, sx: number) {
    return this.sendCommand(ip, { seg: [{ sx: Math.round(sx) }] });
  },

  // ── Devices ───────────────────────────────────────────────
  async getDevices(ip: string): Promise<HubDevice[]> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/devices`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async addDevice(ip: string, deviceIp: string, name: string): Promise<HubDevice | null> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: deviceIp, name }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async removeDevice(ip: string, deviceId: string): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/devices/${deviceId}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ── Groups ────────────────────────────────────────────────
  async getGroups(ip: string): Promise<HubGroup[]> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/groups`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async createGroup(ip: string, name: string, deviceIps: string[]): Promise<HubGroup | null> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, devices: deviceIps }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async deleteGroup(ip: string, groupId: string): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/groups/${groupId}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async updateGroup(ip: string, groupId: string, data: { name?: string; devices?: string[] }): Promise<HubGroup | null> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async getGroupState(ip: string, groupId: string): Promise<HubGroupState | null> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/groups/${groupId}/state`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async setGroupState(ip: string, groupId: string, payload: Partial<HubGroupState>): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(`http://${ip}/groups/${groupId}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Upsert group on hub using backend group ID — creates if not exists, updates if it does. */
  async upsertGroup(ip: string, groupId: string, name: string, deviceIps: string[]): Promise<void> {
    try {
      await fetchWithTimeout(`http://${ip}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: groupId, name, devices: deviceIps }),
      });
    } catch {
      // ignore — hub may be temporarily unreachable
    }
  },
};
