import Zeroconf from "react-native-zeroconf";
import axios from "axios";

export interface DiscoveredDevice {
  name: string;
  host: string;
  ip: string;
  port: number;
  fullName: string;
}

export const WLEDDiscovery = {
  zeroconf: null as Zeroconf | null,

  /**
   * Start mDNS/Bonjour scan for WLED devices
   */
  startMDNSScan(
    onDeviceFound: (device: DiscoveredDevice) => void,
    onScanComplete: () => void,
  ): Zeroconf {
    console.log("Starting mDNS scan for WLED devices...");

    const zeroconf = new Zeroconf();
    this.zeroconf = zeroconf;

    zeroconf.on("resolved", (service: any) => {
      console.log("WLED device found:", service);

      // Prefer IPv4 (avoid IPv6 issues)
      const ip =
        service.addresses?.find((a: string) =>
          /^\d{1,3}(\.\d{1,3}){3}$/.test(a),
        ) ||
        service.addresses?.[0] ||
        service.host;

      const device: DiscoveredDevice = {
        name: service.name || service.fullName || "WLED Device",
        host: service.host,
        ip: ip,
        port: service.port || 80,
        fullName: service.fullName || service.name,
      };

      onDeviceFound(device);
    });

    zeroconf.on("stop", () => {
      console.log("mDNS scan completed");
      onScanComplete();
    });

    // Scan for WLED (_wled._tcp)
    zeroconf.scan("wled", "tcp", "local.");

    // Auto-stop after 10s
    setTimeout(() => {
      this.stopMDNSScan();
    }, 10000);

    return zeroconf;
  },

  /**
   * Stop mDNS scan
   */
  stopMDNSScan() {
    if (this.zeroconf) {
      console.log("Stopping mDNS scan...");
      this.zeroconf.stop();
      this.zeroconf.removeAllListeners();
      this.zeroconf = null;
    }
  },

  /**
   * Check if connected to WLED-AP (4.3.2.1)
   */
  async checkAPConnection(): Promise<{
    success: boolean;
    info?: any;
    error?: string;
  }> {
    try {
      console.log("Checking WLED-AP connection at 4.3.2.1...");

      const response = await axios.get("http://4.3.2.1/json/info", {
        timeout: 3000,
      });

      const info = response.data;

      if (!info || (!info.ver && !info.name)) {
        return {
          success: false,
          error: "4.3.2.1 odpowiada, ale to nie wygląda jak WLED",
        };
      }

      console.log("Connected to WLED-AP:", info);
      return { success: true, info };
    } catch (error: any) {
      console.log("Not connected to WLED-AP:", error?.message);
      return {
        success: false,
        error: error?.message || "Cannot connect to WLED-AP",
      };
    }
  },

  /**
   * Send WiFi configuration to WLED using /settings/wifi
   */
  async sendWiFiConfig(
    ssid: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("Sending WiFi config via /settings/wifi...", { ssid });

      const formData = new URLSearchParams();
      formData.append("CS", ssid); // Client SSID
      formData.append("CP", password); // Client Password
      formData.append("S", "1"); // Save

      await axios.post("http://4.3.2.1/settings/wifi", formData.toString(), {
        timeout: 8000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      });

      console.log("WiFi config saved, trying reboot...");

      // Optional reboot (not all builds support it)
      try {
        await axios.post(
          "http://4.3.2.1/json/state",
          { rb: true },
          { timeout: 3000 },
        );
        console.log("Reboot triggered");
      } catch {
        console.log("Reboot not supported (ok)");
      }

      return { success: true };
    } catch (error: any) {
      console.error("Failed to send WiFi config:", error?.message);
      return {
        success: false,
        error: error?.message || "Failed to send WiFi configuration",
      };
    }
  },

  /**
   * Wait for device to restart and rescan network
   */
  async waitAndRescan(
    onProgress: (message: string) => void,
    onDeviceFound: (device: DiscoveredDevice) => void,
  ): Promise<void> {
    onProgress("Zapisywanie ustawień...");
    await new Promise((r) => setTimeout(r, 4000));

    onProgress("Urządzenie restartuje się...");
    await new Promise((r) => setTimeout(r, 6000));

    onProgress("Wróć na swoje WiFi — szukam urządzenia...");
    await new Promise((r) => setTimeout(r, 4000));

    onProgress("Skanowanie sieci...");
    this.startMDNSScan(onDeviceFound, () => {
      onProgress("Skan zakończony");
    });
  },
};
