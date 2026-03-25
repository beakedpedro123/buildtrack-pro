/**
 * Expo Config Plugin to force minSdkVersion 24 across all Android build files.
 * 
 * Belt-and-suspenders approach:
 * 1. Sets ext block in build.gradle BEFORE expo-root-project plugin
 * 2. Ensures gradle.properties has android.minSdkVersion=24
 * 3. Hardcodes minSdkVersion 24 in app/build.gradle defaultConfig
 * 
 * Hermes (React Native 0.81) requires minSdkVersion 24+.
 */
const { withProjectBuildGradle, withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

function withMinSdk24(config) {
  // 1. Force ext block in root build.gradle
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let contents = config.modResults.contents;

      // Remove any existing ext block we may have added before
      contents = contents.replace(
        /\/\/ \[withMinSdk24\] Force minSdkVersion[\s\S]*?\/\/ \[\/withMinSdk24\]\n*/g,
        ""
      );

      // Insert ext block BEFORE the expo-root-project plugin apply
      const extBlock = `// [withMinSdk24] Force minSdkVersion
// Hermes (React Native 0.81) requires minSdkVersion 24+
// Must be set BEFORE expo-root-project plugin (uses setIfNotExist)
ext {
    minSdkVersion = 24
    compileSdkVersion = 35
    targetSdkVersion = 35
    buildToolsVersion = "35.0.0"
    ndkVersion = "27.1.12297006"
}
// [/withMinSdk24]
`;

      // Insert before 'apply plugin: "expo-root-project"'
      const pluginLine = 'apply plugin: "expo-root-project"';
      if (contents.includes(pluginLine)) {
        contents = contents.replace(pluginLine, extBlock + pluginLine);
      } else {
        // Fallback: prepend at the very beginning
        contents = extBlock + "\n" + contents;
      }

      config.modResults.contents = contents;
    }
    return config;
  });

  // 2. Hardcode minSdkVersion in app/build.gradle as fallback
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let contents = config.modResults.contents;

      // Replace rootProject.ext.minSdkVersion with hardcoded 24
      contents = contents.replace(
        /minSdkVersion\s+rootProject\.ext\.minSdkVersion/g,
        "minSdkVersion 24"
      );

      config.modResults.contents = contents;
    }
    return config;
  });

  // 3. Ensure gradle.properties has the correct values
  config = withGradleProperties(config, (config) => {
    const props = config.modResults;
    
    const overrides = {
      "android.minSdkVersion": "24",
      "android.compileSdkVersion": "35",
      "android.targetSdkVersion": "35",
    };

    for (const [key, value] of Object.entries(overrides)) {
      const existingIndex = props.findIndex(
        (p) => p.type === "property" && p.key === key
      );
      if (existingIndex >= 0) {
        props[existingIndex].value = value;
      } else {
        props.push({ type: "property", key, value });
      }
    }

    return config;
  });

  return config;
}

module.exports = withMinSdk24;
