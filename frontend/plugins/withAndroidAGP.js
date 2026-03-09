// plugins/withAndroidAGP.js
// Forces AGP 8.5.0 to avoid "No variants exist" error with AGP 8.11.0
const { withProjectBuildGradle } = require("@expo/config-plugins");

const AGP_VERSION = "8.5.0";

module.exports = function withAndroidAGP(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Replace AGP classpath: classpath("com.android.tools.build:gradle:X.Y.Z")
    const newContents = contents.replace(
      /classpath\(["']com\.android\.tools\.build:gradle:[^"']+["']\)/,
      `classpath("com.android.tools.build:gradle:${AGP_VERSION}")`
    );

    if (newContents === contents) {
      console.warn(
        "[withAndroidAGP] Could not find AGP classpath to replace. Build may still use default AGP."
      );
    } else {
      console.log(
        `[withAndroidAGP] Replaced AGP with version ${AGP_VERSION}`
      );
    }

    config.modResults.contents = newContents;
    return config;
  });
};
