const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

module.exports = function withBLE(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Ensure uses-permission array exists
    if (!Array.isArray(manifest.manifest["uses-permission"])) {
      manifest.manifest["uses-permission"] = [];
    }

    // Ensure uses-permission-sdk-23 array exists
    if (!Array.isArray(manifest.manifest["uses-permission-sdk-23"])) {
      manifest.manifest["uses-permission-sdk-23"] = [];
    }

    const perms = manifest.manifest["uses-permission"];
    const perms23 = manifest.manifest["uses-permission-sdk-23"];

    const addPerm = (arr, name, extra = {}) => {
      if (!arr.find((i) => i.$["android:name"] === name)) {
        arr.push({ $: { "android:name": name, ...extra } });
      }
    };

    // BLE scan (Android 12+)
    addPerm(perms, "android.permission.BLUETOOTH_SCAN", {
      "android:usesPermissionFlags": "neverForLocation",
      "tools:targetApi": "31",
    });

    // Location permissions required by BLE on older Android
    addPerm(perms23, "android.permission.ACCESS_COARSE_LOCATION", {
      "android:maxSdkVersion": "30",
    });
    addPerm(perms23, "android.permission.ACCESS_FINE_LOCATION", {
      "android:maxSdkVersion": "30",
    });

    // Make sure tools namespace is available
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);

    return config;
  });
};
