import Zeroconf from 'react-native-zeroconf';
import axios from 'axios';

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
    onScanComplete: () => void
  ): Zeroconf {
    console.log('Starting mDNS scan for WLED devices...');
    
    const zeroconf = new Zeroconf();
    this.zeroconf = zeroconf;

    // Listen for service found
    zeroconf.on('resolved', (service: any) => {
      console.log('WLED device found:', service);
      
      // Extract IP address
      const ip = service.addresses && service.addresses.length > 0 
        ? service.addresses[0] 
        : service.host;

      const device: DiscoveredDevice = {
        name: service.name || service.fullName || 'WLED Device',
        host: service.host,
        ip: ip,
        port: service.port || 80,
        fullName: service.fullName || service.name
      };

      onDeviceFound(device);
    });

    // Listen for scan complete
    zeroconf.on('stop', () => {
      console.log('mDNS scan completed');
      onScanComplete();
    });

    // Start scanning for WLED devices
    // WLED uses _wled._tcp service type
    zeroconf.scan('wled', 'tcp', 'local.');

    // Auto-stop after 10 seconds
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
      console.log('Stopping mDNS scan...');
      this.zeroconf.stop();
      this.zeroconf.removeAllListeners();
      this.zeroconf = null;
    }
  },

  /**
   * Check if connected to WLED-AP (4.3.2.1)
   */
  async checkAPConnection(): Promise<{ success: boolean; info?: any; error?: string }> {
    try {
      console.log('Checking WLED-AP connection at 4.3.2.1...');
      const response = await axios.get('http://4.3.2.1/json/info', {
        timeout: 3000,
      });
      
      console.log('Connected to WLED-AP:', response.data);
      return { success: true, info: response.data };
    } catch (error: any) {
      console.log('Not connected to WLED-AP:', error.message);
      return { 
        success: false, 
        error: error.message || 'Cannot connect to WLED-AP' 
      };
    }
  },

  /**
   * Send WiFi configuration to WLED-AP
   */
  async sendWiFiConfig(
    ssid: string, 
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Sending WiFi config to WLED-AP...', { ssid });
      
      // WLED WiFi configuration endpoint
      const response = await axios.post(
        'http://4.3.2.1/json/state',
        {
          // WLED configuration format
          ssid: ssid,
          psk: password,
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      console.log('WiFi config sent successfully');
      return { success: true };
    } catch (error: any) {
      console.error('Failed to send WiFi config:', error.message);
      return { 
        success: false, 
        error: error.message || 'Failed to send WiFi configuration' 
      };
    }
  },

  /**
   * Alternative method using WLED's settings endpoint
   */
  async sendWiFiConfigAlt(
    ssid: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Sending WiFi config (alternative method)...', { ssid });
      
      // Try WLED's settings endpoint
      const formData = new URLSearchParams();
      formData.append('CS', ssid);  // Client SSID
      formData.append('CP', password);  // Client Password
      formData.append('S', '1');  // Save

      const response = await axios.post(
        'http://4.3.2.1/settings/wifi',
        formData.toString(),
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        }
      );

      console.log('WiFi config sent successfully (alt)');
      return { success: true };
    } catch (error: any) {
      console.error('Failed to send WiFi config (alt):', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  },

  /**
   * Wait for device to restart and rescan network
   */
  async waitAndRescan(
    onProgress: (message: string) => void,
    onDeviceFound: (device: DiscoveredDevice) => void
  ): Promise<void> {
    // Wait 15 seconds for device to restart
    onProgress('Urządzenie restartuje się...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    onProgress('Czekam na restart...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    onProgress('Szukam urządzenia w sieci...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Start new mDNS scan
    onProgress('Skanowanie sieci...');
    this.startMDNSScan(onDeviceFound, () => {
      onProgress('Skan zakończony');
    });
  },
};
