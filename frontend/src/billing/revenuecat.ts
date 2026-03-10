import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import axios from "axios";

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.10.42:8002") + "/api";

// ⚠️ U Ciebie ten sam key jest dla obu platform (test), zostawiamy:
const IOS_API_KEY = "test_SvvPSfrXBKDMJribVcEQVwibTiD";
const ANDROID_API_KEY = "test_SvvPSfrXBKDMJribVcEQVwibTiD";

export const ENTITLEMENT_ID = "TECHIONGROUP Pro";

export function configureRevenueCat() {
  Purchases.setLogLevel(LOG_LEVEL.VERBOSE);

  const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;

  Purchases.configure({
    apiKey,
    // później: appUserID (jak zepniesz z kontem)
  });
}

export function isPro(customerInfo: CustomerInfo): boolean {
  return (
    typeof customerInfo.entitlements.active?.[ENTITLEMENT_ID] !== "undefined"
  );
}

export async function getCustomerInfoSafe(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.log("getCustomerInfo error:", e);
    return null;
  }
}

// Synchronizacja PRO -> backend (ustawia has_subscription = true)
export async function syncProToBackend(token: string): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    const pro = isPro(info);

    if (pro) {
      await axios.post(
        `${API_URL}/auth/upgrade-subscription`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }

    return pro;
  } catch (e) {
    console.log("syncProToBackend error:", e);
    return false;
  }
}

// Pokazuje paywall i po zakupie synchronizuje backend
export async function presentPaywallAndSync(token: string): Promise<boolean> {
  try {
    const result: PAYWALL_RESULT = await RevenueCatUI.presentPaywall();

    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED: {
        const pro = await syncProToBackend(token);
        return pro;
      }
      case PAYWALL_RESULT.CANCELLED:
      case PAYWALL_RESULT.NOT_PRESENTED:
      case PAYWALL_RESULT.ERROR:
      default:
        return false;
    }
  } catch (e) {
    console.log("presentPaywallAndSync error:", e);
    return false;
  }
}
export async function presentPaywallSafe() {
  try {
    if (Platform.OS === "web") return { pro: false };

    const result = await RevenueCatUI.presentPaywall();

    if (
      result === PAYWALL_RESULT.PURCHASED ||
      result === PAYWALL_RESULT.RESTORED
    ) {
      const info = await Purchases.getCustomerInfo();
      return { pro: isPro(info) };
    }

    return { pro: false };
  } catch (e) {
    console.log("presentPaywallSafe error:", e);
    return { pro: false };
  }
}

export async function presentCustomerCenterSafe() {
  try {
    if (Platform.OS === "web") return;
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.log("presentCustomerCenterSafe error:", e);
  }
}
