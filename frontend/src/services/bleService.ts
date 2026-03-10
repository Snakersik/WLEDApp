// src/services/bleService.ts
// BLE provisioning for WLED-Hub (boot.py on ESP32).
// Requires: npx expo install react-native-ble-plx
// iOS: add NSBluetoothAlwaysUsageDescription to app.json expo.ios.infoPlist
// Android: permissions are handled automatically by the library

import { BleManager, Device, BleError } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const SERVICE_UUID = '12340000-1234-1234-1234-123456789012';
const CONFIG_CHAR  = '12340001-1234-1234-1234-123456789012';
const STATUS_CHAR  = '12340002-1234-1234-1234-123456789012';

const HUB_DEVICE_NAME = 'WLED-Hub';

let _manager: BleManager | null = null;

function getManager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

export type ScanResult =
  | { status: 'found'; device: Device }
  | { status: 'timeout' }
  | { status: 'error'; message: string; isPermissionError?: boolean };

/** Scan BLE for "WLED-Hub". Resolves when found or times out. */
export async function scanForHub(timeoutMs = 20_000): Promise<ScanResult> {
  const manager = getManager();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      resolve({ status: 'timeout' });
    }, timeoutMs);

    manager.startDeviceScan(null, { allowDuplicates: false }, (err: BleError | null, device: Device | null) => {
      if (err) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        resolve({
          status: 'error',
          message: err.message,
          isPermissionError: (err as any).errorCode === 102,
        });
        return;
      }
      if (device?.name === HUB_DEVICE_NAME) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        resolve({ status: 'found', device });
      }
    });
  });
}

export type ProvisionResult =
  | { status: 'ok'; ip: string }
  | { status: 'error'; message: string };

/**
 * Connect to hub via BLE, send WiFi credentials as JSON to CONFIG_CHAR,
 * wait for hub to notify result JSON on STATUS_CHAR.
 */
export async function provisionHub(
  device: Device,
  ssid: string,
  password: string,
): Promise<ProvisionResult> {
  try {
    const connected = await device.connect({ timeout: 10_000 });
    await connected.discoverAllServicesAndCharacteristics();
    const toB64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

    let resolveResult!: (r: ProvisionResult) => void;
    const resultPromise = new Promise<ProvisionResult>((r) => { resolveResult = r; });

    // Subscribe to STATUS_CHAR before sending config
    connected.monitorCharacteristicForService(
      SERVICE_UUID, STATUS_CHAR,
      (_err, char) => {
        if (!char?.value) return;
        try {
          const json = JSON.parse(Buffer.from(char.value, 'base64').toString('utf8'));
          if (json.state === 'success' && json.ip) {
            resolveResult({ status: 'ok', ip: json.ip });
          } else if (json.state === 'error') {
            resolveResult({ status: 'error', message: `Hub błąd: ${json.reason ?? 'wifi_failed'}` });
          }
          // state === 'connecting' → ignore, wait for next notification
        } catch {
          // Corrupted JSON packet — ignore, wait for next valid notification
        }
      }
    );

    // Send single atomic JSON command
    const payload = JSON.stringify({ cmd: 'provision_wifi', ssid, password });
    await connected.writeCharacteristicWithResponseForService(
      SERVICE_UUID, CONFIG_CHAR, toB64(payload)
    );

    // Wait up to 25s for hub to connect to WiFi and send result back
    const result = await Promise.race([
      resultPromise,
      delay(25_000).then((): ProvisionResult => ({
        status: 'error',
        message: 'Timeout — sprawdź hasło WiFi',
      })),
    ]);

    try { await connected.cancelConnection(); } catch {}
    return result;
  } catch (e: any) {
    try { await device.cancelConnection(); } catch {}
    return { status: 'error', message: e?.message ?? 'BLE error' };
  }
}

/** Wait for hub to come back online after reboot (polls /json/info). */
export async function waitForHubOnline(
  hubIp: string,
  timeoutMs = 60_000,
  intervalMs = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${hubIp}/json/info`, { signal: AbortSignal.timeout(1_500) });
      if (res.ok) return true;
    } catch {}
    await delay(intervalMs);
  }
  return false;
}

/** Trigger WLED-AP scan on hub. Returns list of WLED-AP SSIDs. */
export async function scanForWledAps(hubIp: string): Promise<string[]> {
  const res = await fetch(`http://${hubIp}/api/scan-wled`);
  const json = await res.json();
  return json.aps ?? [];
}

/** Start WLED provisioning on hub (async — hub disconnects from WiFi briefly). */
export async function startWledProvision(hubIp: string): Promise<{ count: number }> {
  const res = await fetch(`http://${hubIp}/api/provision-wled`, { method: 'POST' });
  const json = await res.json();
  return { count: json.count ?? 0 };
}

export type ProvisionStatus = {
  running: boolean;
  done: boolean;
  configured: Array<{ ap: string; name: string; mac: string }>;
  error: string | null;
};

/** Poll hub provision status until done. */
export async function waitForProvision(
  hubIp: string,
  timeoutMs = 120_000,
  intervalMs = 2_000,
): Promise<ProvisionStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${hubIp}/api/provision-status`, {
        signal: AbortSignal.timeout(2_000),
      });
      const json: ProvisionStatus = await res.json();
      if (json.done) return json;
    } catch {
      // Hub may be briefly offline during WiFi switch — just retry
    }
    await delay(intervalMs);
  }
  return { running: false, done: true, configured: [], error: 'timeout' };
}

/** Start LAN scan for WLED devices (already triggered automatically after provision). */
export async function startLanScan(hubIp: string): Promise<void> {
  await fetch(`http://${hubIp}/api/scan-devices`, { method: 'POST' });
}

export type ScanStatus = {
  running: boolean;
  done: boolean;
  found: Array<{ ip: string; name: string }>;
  error: string | null;
};

/** Poll hub LAN scan status until done. */
export async function waitForLanScan(
  hubIp: string,
  timeoutMs = 60_000,
  intervalMs = 2_000,
): Promise<ScanStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${hubIp}/api/scan-status`, {
        signal: AbortSignal.timeout(2_000),
      });
      const json: ScanStatus = await res.json();
      if (json.done) return json;
    } catch {}
    await delay(intervalMs);
  }
  return { running: false, done: true, found: [], error: 'timeout' };
}

/** Scan LAN for DDP Hub by probing /json/info in parallel across common subnets. */
export async function findHubOnLan(timeoutMs = 30_000): Promise<string | null> {
  const subnets = ['192.168.1', '192.168.0', '192.168.10', '10.0.0'];

  const probe = (ip: string): Promise<string | null> =>
    fetch(`http://${ip}/json/info`, { signal: AbortSignal.timeout(500) })
      .then(r => r.json())
      .then((j: any) => (j?.name === 'DDP Hub' ? ip : null))
      .catch(() => null);

  const all: Promise<string | null>[] = [];
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) all.push(probe(`${subnet}.${i}`));
  }

  return new Promise((resolve) => {
    let done = false;
    let pending = all.length;
    const finish = (ip: string | null) => { if (!done) { done = true; resolve(ip); } };
    all.forEach(p => p.then(ip => {
      pending--;
      if (ip) finish(ip);
      else if (pending === 0) finish(null);
    }));
    setTimeout(() => finish(null), timeoutMs);
  });
}

export function destroyBleManager() {
  _manager?.destroy();
  _manager = null;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
