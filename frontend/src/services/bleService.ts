// src/services/bleService.ts
// BLE provisioning for WLED-Hub (ESP32).
// Requires: npx expo install react-native-ble-plx
// iOS: add NSBluetoothAlwaysUsageDescription to app.json expo.ios.infoPlist
// Android: permissions are handled automatically by the library

import { BleManager, Device, BleError } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import NetInfo from '@react-native-community/netinfo';

const SERVICE_UUID = '12340000-1234-1234-1234-123456789012';
const CONFIG_CHAR  = '12340001-1234-1234-1234-123456789012';
const STATUS_CHAR  = '12340002-1234-1234-1234-123456789012';
const META_CHAR    = '12340003-1234-1234-1234-123456789012';

const HUB_DEVICE_NAME = 'WLED-Hub';

// Full IPv4 validation — rejects 999.x.x.x etc.
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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
  | { status: 'ok'; ip: string; hubId?: string; mdnsName?: string }
  | { status: 'handoff'; hubId?: string; mdnsName?: string }
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
    await delay(500); // let Android GATT stack settle before reading
    const toB64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

    // Read hub identity BEFORE sending WiFi (BLE is stable here, no WiFi yet).
    // Retry 3x — Android GATT cache may return stale data on first read.
    let bleMeta: { hub_id?: string; mdns_name?: string } = {};
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const metaChar = await connected.readCharacteristicForService(SERVICE_UUID, META_CHAR);
        if (metaChar?.value) {
          const parsed = JSON.parse(Buffer.from(metaChar.value, 'base64').toString('utf8'));
          if (parsed.mdns_name) {
            bleMeta = parsed;
            console.log('BLE META ok (attempt', attempt + 1, '):', bleMeta);
            break;
          }
        }
      } catch (e) {
        console.log('BLE META attempt', attempt + 1, 'fail:', e);
        if (attempt < 2) await delay(300);
      }
    }

    let resolveResult!: (r: ProvisionResult) => void;
    const resultPromise = new Promise<ProvisionResult>((r) => { resolveResult = r; });

    // resolved guard — prevents double-resolve if callback fires multiple times
    let resolved = false;
    const sub = connected.monitorCharacteristicForService(
      SERVICE_UUID, STATUS_CHAR,
      (_err, char) => {
        if (_err) {
          console.log('BLE STATUS ERR:', _err);
          if (!resolved) {
            resolved = true;
            resolveResult({ status: 'handoff', hubId: bleMeta.hub_id, mdnsName: bleMeta.mdns_name });
          }
          return;
        }
        if (resolved || !char?.value) return;
        try {
          const raw = Buffer.from(char.value, 'base64').toString('utf8');
          console.log('BLE STATUS RAW:', raw);
          const json = JSON.parse(raw);
          if (json.state === 'success' && json.ip && IPV4_RE.test(json.ip)) {
            resolved = true;
            resolveResult({ status: 'ok', ip: json.ip,
                            hubId: json.hub_id, mdnsName: json.mdns_name });
          } else if (json.state === 'error') {
            resolved = true;
            resolveResult({ status: 'error', message: `Hub błąd: ${json.reason ?? 'wifi_failed'}` });
          }
          // state === 'connecting' → ignore, wait for next notification
        } catch (e) {
          console.log('BLE STATUS JSON PARSE FAIL:', e);
        }
      }
    );

    // Short delay to ensure subscription is active before sending config
    await delay(200);

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

    try { sub.remove(); } catch {}
    try { await connected.cancelConnection(); } catch {}
    return result;
  } catch (e: any) {
    try { await device.cancelConnection(); } catch {}
    return { status: 'error', message: e?.message ?? 'BLE error' };
  }
}

/** Wait for hub to come back online after reboot (polls /json/info). */
export async function waitForHubOnline(
  host: string,
  timeoutMs = 60_000,
  intervalMs = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`http://${host}/json/info`, 1_500);
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
      const res = await fetchWithTimeout(`http://${hubIp}/api/provision-status`, 2_000);
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
      const res = await fetchWithTimeout(`http://${hubIp}/api/scan-status`, 2_000);
      const json: ScanStatus = await res.json();
      if (json.done) return json;
    } catch {}
    await delay(intervalMs);
  }
  return { running: false, done: true, found: [], error: 'timeout' };
}

/**
 * Scan LAN for DDP Hub by probing /json/info.
 * Prioritises the phone's current subnet, then common fallbacks.
 * Batches 30 requests at a time to avoid overwhelming network stack.
 */
export async function findHubOnLan(timeoutMs = 30_000): Promise<string | null> {
  const netState = await NetInfo.fetch() as any;
  const currentIp: string | undefined = netState?.details?.ipAddress;
  const detectedSubnet = currentIp ? currentIp.split('.').slice(0, 3).join('.') : null;
  const fallbacks = ['192.168.1', '192.168.0', '192.168.10', '10.0.0'];
  const subnets = detectedSubnet
    ? [detectedSubnet, ...fallbacks.filter(s => s !== detectedSubnet)]
    : fallbacks;

  const probe = (ip: string): Promise<string | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1000);
    return fetch(`http://${ip}/json/info`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((j: any) => (j?.hub_id || j?.name === 'DDP Hub' ? ip : null))
      .catch(() => null)
      .finally(() => clearTimeout(timer));
  };

  const allIps: string[] = [];
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) allIps.push(`${subnet}.${i}`);
  }

  const BATCH = 30;
  const deadline = Date.now() + timeoutMs;

  for (let i = 0; i < allIps.length; i += BATCH) {
    if (Date.now() > deadline) return null;
    const batch = allIps.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(probe));
    const found = results.find(Boolean);
    if (found) return found;
  }
  return null;
}

export function destroyBleManager() {
  _manager?.destroy();
  _manager = null;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
