/**
 * Expo Config Plugin to force minSdkVersion 24 across ALL Android build files.
 * 
 * Nuclear approach — patches EVERY file that could influence minSdkVersion:
 * 1. settings.gradle: Override useExpoVersionCatalog to force minSdk=24
 * 2. build.gradle: ext block BEFORE expo-root-project plugin
 * 3. app/build.gradle: Hardcode minSdkVersion 24 in defaultConfig
 * 4. gradle.properties: android.minSdkVersion=24
 * 
 * Hermes (React Native 0.81) requires minSdkVersion 24+.
 */
const {
  withProjectBuildGradle,
  withAppBuildGradle,
  withGradleProperties,
  withSettingsGradle,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MIN_SDK = "24";
const COMPILE_SDK = "35";
const TARGET_SDK = "35";

function withMinSdk24(config) {
  // 0. Modify settings.gradle to force version catalog overrides
  config = withSettingsGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let contents = config.modResults.contents;

      // Replace the useExpoVersionCatalog() call with one that forces our versions
      // The original call: expoAutolinking.useExpoVersionCatalog()
      // We replace it with a version that includes explicit overrides
      const originalCall = "expoAutolinking.useExpoVersionCatalog()";
      const overrideCall = `expoAutolinking.useExpoVersionCatalog { catalog ->
    catalog.version("minSdk", "${MIN_SDK}")
    catalog.version("compileSdk", "${COMPILE_SDK}")
    catalog.version("targetSdk", "${TARGET_SDK}")
}`;

      if (contents.includes(originalCall)) {
        contents = contents.replace(originalCall, overrideCall);
      }

      config.modResults.contents = contents;
    }
    return config;
  });

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
    minSdkVersion = ${MIN_SDK}
    compileSdkVersion = ${COMPILE_SDK}
    targetSdkVersion = ${TARGET_SDK}
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
        `minSdkVersion ${MIN_SDK}`
      );

      config.modResults.contents = contents;
    }
    return config;
  });

  // 3. Ensure gradle.properties has the correct values
  config = withGradleProperties(config, (config) => {
    const props = config.modResults;

    const overrides = {
      "android.minSdkVersion": MIN_SDK,
      "android.compileSdkVersion": COMPILE_SDK,
      "android.targetSdkVersion": TARGET_SDK,
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

  // 4. Also patch the react-native version catalog TOML directly
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const versionCatalogPath = path.join(
        config.modRequest.projectRoot,
        "node_modules",
        "react-native",
        "gradle",
        "libs.versions.toml"
      );
      if (fs.existsSync(versionCatalogPath)) {
        let content = fs.readFileSync(versionCatalogPath, "utf8");
        content = content.replace(
          /^minSdk\s*=\s*"\d+"/m,
          `minSdk = "${MIN_SDK}"`
        );
        content = content.replace(
          /^compileSdk\s*=\s*"\d+"/m,
          `compileSdk = "${COMPILE_SDK}"`
        );
        content = content.replace(
          /^targetSdk\s*=\s*"\d+"/m,
          `targetSdk = "${TARGET_SDK}"`
        );
        fs.writeFileSync(versionCatalogPath, content, "utf8");
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withMinSdk24;
