import axios from 'axios';

export interface WLEDState {
  on: boolean;
  bri: number;
  seg?: Array<{
    col?: number[][];
    fx?: number;
    sx?: number;
    ix?: number;
    pal?: number;
  }>;
}

export const WLEDService = {
  /**
   * Get current state from WLED device
   */
  async getState(ipAddress: string): Promise<any> {
    try {
      const response = await axios.get(`http://${ipAddress}/json/state`, {
        timeout: 3000,
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      console.log('WLED getState error:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Check if device is online
   */
  async isOnline(ipAddress: string): Promise<boolean> {
    const result = await this.getState(ipAddress);
    return result.success;
  },

  /**
   * Send control command to WLED device
   */
  async sendCommand(ipAddress: string, state: Partial<WLEDState>): Promise<any> {
    try {
      const response = await axios.post(
        `http://${ipAddress}/json/state`,
        state,
        { timeout: 3000 }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      console.log('WLED sendCommand error:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Turn device on/off
   */
  async setPower(ipAddress: string, on: boolean) {
    return this.sendCommand(ipAddress, { on });
  },

  /**
   * Set brightness (0-255)
   */
  async setBrightness(ipAddress: string, brightness: number) {
    return this.sendCommand(ipAddress, { bri: brightness });
  },

  /**
   * Set color [R, G, B]
   */
  async setColor(ipAddress: string, color: number[]) {
    return this.sendCommand(ipAddress, {
      seg: [{ col: [color] }],
    });
  },

  /**
   * Apply preset/effect
   */
  async applyPreset(
    ipAddress: string,
    effectId: number,
    speed: number = 128,
    intensity: number = 128,
    palette: number = 0
  ) {
    return this.sendCommand(ipAddress, {
      seg: [{
        fx: effectId,
        sx: speed,
        ix: intensity,
        pal: palette,
      }],
    });
  },
};
