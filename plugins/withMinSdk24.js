/**
 * Expo Config Plugin to force minSdkVersion 24 in android/build.gradle
 * 
 * This injects an ext block BEFORE the expo-root-project plugin applies,
 * so setIfNotExist() in ExpoRootProjectPlugin sees our values first.
 * 
 * Hermes (React Native 0.81) requires minSdkVersion 24+.
 */
const { withProjectBuildGradle } = require("expo/config-plugins");

function withMinSdk24(config) {
  return withProjectBuildGradle(config, (config) => {
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
        // Fallback: append at the end
        contents += "\n" + extBlock;
      }

      config.modResults.contents = contents;
    }
    return config;
  });
}

module.exports = withMinSdk24;
