// src/services/bleService.ts
// BLE provisioning for WLED-Hub (boot.py on ESP32).
// Requires: npx expo install react-native-ble-plx
// iOS: add NSBluetoothAlwaysUsageDescription to app.json expo.ios.infoPlist
// Android: permissions are handled automatically by the library

import { BleManager, Device, BleError } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// Must match UUIDs in hub/boot.py
const SERVICE_UUID = '12340000-1234-1234-1234-123456789012';
const SSID_CHAR    = '12340001-1234-1234-1234-123456789012';
const PASS_CHAR    = '12340002-1234-1234-1234-123456789012';
const DONE_CHAR    = '12340003-1234-1234-1234-123456789012';

const HUB_DEVICE_NAME = 'WLED-Hub';

let _manager: BleManager | null = null;

function getManager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

export type ScanResult =
  | { status: 'found'; device: Device }
  | { status: 'timeout' }
  | { status: 'error'; message: string };

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
        resolve({ status: 'error', message: err.message });
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
  | { status: 'ok' }
  | { status: 'error'; message: string };

/**
 * Connect to hub via BLE and send WiFi credentials.
 * Hub will save them to wifi.json and reboot.
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

    // Write SSID
    await connected.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      SSID_CHAR,
      toB64(ssid),
    );

    // Write password
    await connected.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      PASS_CHAR,
      toB64(password),
    );

    // Wait a moment for hub to process and notify
    await delay(1_200);

    try {
      await connected.cancelConnection();
    } catch {
      // ignore — hub may have rebooted and closed the connection already
    }

    return { status: 'ok' };
  } catch (e: any) {
    try {
      await device.cancelConnection();
    } catch {}
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

export function destroyBleManager() {
  _manager?.destroy();
  _manager = null;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
