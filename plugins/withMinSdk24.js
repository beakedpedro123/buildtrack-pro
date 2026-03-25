/**
 * NUCLEAR Expo Config Plugin to force minSdkVersion 24 across ALL Android build files.
 * 
 * This is the most extreme approach possible:
 * 1. settings.gradle: Override version catalog with explicit minSdk=24
 * 2. build.gradle: ext block BEFORE expo-root-project + override AFTER
 * 3. app/build.gradle: Hardcode minSdkVersion 24 + afterEvaluate override + CMake arguments
 * 4. gradle.properties: android.minSdkVersion=24
 * 5. Version catalog TOML: Direct file patch
 * 6. allprojects afterEvaluate: Force minSdkVersion on ALL subprojects
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

      const originalCall = "expoAutolinking.useExpoVersionCatalog()";
      const overrideCall = `expoAutolinking.useExpoVersionCatalog { catalog ->
    catalog.version("minSdk", "${MIN_SDK}")
    catalog.version("compileSdk", "${COMPILE_SDK}")
    catalog.version("targetSdk", "${TARGET_SDK}")
}`;

      if (contents.includes(originalCall)) {
        contents = contents.replace(originalCall, overrideCall);
      }

      // Also add a gradle.beforeProject to force ext on every project
      if (!contents.includes('// [NUCLEAR] Force minSdkVersion')) {
        contents += `
// [NUCLEAR] Force minSdkVersion on every project
gradle.beforeProject { proj ->
    proj.ext.set("minSdkVersion", ${MIN_SDK})
    proj.ext.set("compileSdkVersion", ${COMPILE_SDK})
    proj.ext.set("targetSdkVersion", ${TARGET_SDK})
}
`;
      }

      config.modResults.contents = contents;
    }
    return config;
  });

  // 1. Force ext block in root build.gradle + allprojects afterEvaluate
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let contents = config.modResults.contents;

      // Remove any existing ext block we may have added before
      contents = contents.replace(
        /\/\/ \[withMinSdk24\] Force minSdkVersion[\s\S]*?\/\/ \[\/withMinSdk24\]\n*/g,
        ""
      );
      contents = contents.replace(
        /\/\/ FORCE minSdkVersion override after expo-root-project\next\.minSdkVersion = \d+\n*/g,
        ""
      );

      // Insert ext block BEFORE the expo-root-project plugin apply
      const extBlock = `// [withMinSdk24] Force minSdkVersion
// Hermes (React Native 0.81) requires minSdkVersion 24+
ext {
    minSdkVersion = ${MIN_SDK}
    compileSdkVersion = ${COMPILE_SDK}
    targetSdkVersion = ${TARGET_SDK}
    buildToolsVersion = "35.0.0"
    ndkVersion = "27.1.12297006"
}
// [/withMinSdk24]
`;

      const pluginLine = 'apply plugin: "expo-root-project"';
      if (contents.includes(pluginLine)) {
        contents = contents.replace(pluginLine, extBlock + pluginLine);
      } else {
        contents = extBlock + "\n" + contents;
      }

      // Add AFTER expo-root-project to override whatever it sets
      if (!contents.includes('// [NUCLEAR] Override after expo-root-project')) {
        contents = contents.replace(
          pluginLine,
          pluginLine + `

// [NUCLEAR] Override after expo-root-project
ext.minSdkVersion = ${MIN_SDK}
ext.compileSdkVersion = ${COMPILE_SDK}
ext.targetSdkVersion = ${TARGET_SDK}

// Force on ALL subprojects via afterEvaluate
allprojects {
    afterEvaluate { proj ->
        proj.ext.set("minSdkVersion", ${MIN_SDK})
        if (proj.hasProperty("android")) {
            proj.android {
                if (it.hasProperty("defaultConfig")) {
                    it.defaultConfig {
                        if (minSdkVersion.apiLevel < ${MIN_SDK}) {
                            minSdkVersion ${MIN_SDK}
                        }
                    }
                }
            }
        }
    }
}
`
        );
      }

      config.modResults.contents = contents;
    }
    return config;
  });

  // 2. Hardcode minSdkVersion in app/build.gradle + add CMake arguments
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let contents = config.modResults.contents;

      // Replace rootProject.ext.minSdkVersion with hardcoded 24
      contents = contents.replace(
        /minSdkVersion\s+rootProject\.ext\.minSdkVersion/g,
        `minSdkVersion ${MIN_SDK}`
      );

      // Also replace any numeric minSdkVersion that's not 24
      contents = contents.replace(
        /minSdkVersion\s+2[0-3]\b/g,
        `minSdkVersion ${MIN_SDK}`
      );

      // Add externalNativeBuild CMake arguments to force ANDROID_NATIVE_API_LEVEL
      if (!contents.includes('ANDROID_NATIVE_API_LEVEL')) {
        contents = contents.replace(
          /(defaultConfig\s*\{[^}]*)(})/,
          `$1
        // [NUCLEAR] Force CMake to use API level 24
        externalNativeBuild {
            cmake {
                arguments "-DANDROID_NATIVE_API_LEVEL=${MIN_SDK}"
            }
        }
$2`
        );
      }

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

  // 4. Patch the react-native version catalog TOML directly
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

      // Also run the nuclear fix script
      try {
        const fixScript = path.join(config.modRequest.projectRoot, "scripts", "force-min-sdk-24.js");
        if (fs.existsSync(fixScript)) {
          require(fixScript);
        }
      } catch (e) {
        console.log("[withMinSdk24] Warning: force-min-sdk-24.js failed:", e.message);
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withMinSdk24;
