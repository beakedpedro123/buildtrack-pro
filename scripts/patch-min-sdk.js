#!/usr/bin/env node
/**
 * patch-min-sdk.js
 * 
 * Runs as a postinstall hook to forcefully patch minSdkVersion to 24
 * in ALL relevant files across node_modules. This runs BEFORE prebuild
 * and BEFORE any Gradle configuration, ensuring the value is 24 everywhere.
 */
const fs = require("fs");
const path = require("path");

const MIN_SDK = "24";
const projectRoot = path.resolve(__dirname, "..");

function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  for (const [pattern, replacement] of replacements) {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`[patch-min-sdk] Patched: ${path.relative(projectRoot, filePath)}`);
  }
  return changed;
}

// 1. Patch React Native's libs.versions.toml (version catalog)
const versionCatalog = path.join(projectRoot, "node_modules/react-native/gradle/libs.versions.toml");
patchFile(versionCatalog, [
  [/^minSdk\s*=\s*"\d+"/m, `minSdk = "${MIN_SDK}"`],
]);

// 2. Patch all build.gradle files in node_modules that set minSdkVersion
const modulesToPatch = [
  "react-native",
  "react-native-worklets",
  "react-native-screens",
  "react-native-reanimated",
  "react-native-gesture-handler",
  "react-native-safe-area-context",
  "react-native-svg",
  "@react-native-async-storage/async-storage",
  "expo-modules-core",
];

for (const mod of modulesToPatch) {
  const buildGradle = path.join(projectRoot, "node_modules", mod, "android/build.gradle");
  patchFile(buildGradle, [
    [/minSdkVersion\s+\d+/g, `minSdkVersion ${MIN_SDK}`],
    [/minSdk\s*=\s*\d+/g, `minSdk = ${MIN_SDK}`],
  ]);
  
  // Also check build.gradle.kts
  const buildGradleKts = path.join(projectRoot, "node_modules", mod, "android/build.gradle.kts");
  patchFile(buildGradleKts, [
    [/minSdk\s*=\s*\d+/g, `minSdk = ${MIN_SDK}`],
    [/minSdkVersion\s*=\s*\d+/g, `minSdkVersion = ${MIN_SDK}`],
  ]);
}

// 3. Patch CMakeLists.txt files to set ANDROID_NATIVE_API_LEVEL
const cmakeFiles = [
  "node_modules/react-native/ReactAndroid/cmake-utils/default-app-setup/CMakeLists.txt",
  "node_modules/react-native/ReactAndroid/CMakeLists.txt",
  "node_modules/react-native-worklets/android/CMakeLists.txt",
  "node_modules/react-native-screens/android/CMakeLists.txt",
  "node_modules/react-native-reanimated/android/CMakeLists.txt",
];

const cmakePreamble = `# [FORCE-MIN-SDK-24] Injected by patch-min-sdk.js
set(ANDROID_PLATFORM "android-${MIN_SDK}")
set(ANDROID_NATIVE_API_LEVEL ${MIN_SDK})
cmake_minimum_required(VERSION 3.13)
`;

for (const relPath of cmakeFiles) {
  const fullPath = path.join(projectRoot, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, "utf8");
    if (!content.includes("[FORCE-MIN-SDK-24]")) {
      content = cmakePreamble + content;
      fs.writeFileSync(fullPath, content, "utf8");
      console.log(`[patch-min-sdk] Injected CMake override: ${relPath}`);
    }
  }
}

// 4. Create/patch gradle.properties in the android directory if it exists
// This will be created by prebuild, but we set it up for when it does
const gradlePropsPath = path.join(projectRoot, "android/gradle.properties");
if (fs.existsSync(path.join(projectRoot, "android"))) {
  let props = "";
  if (fs.existsSync(gradlePropsPath)) {
    props = fs.readFileSync(gradlePropsPath, "utf8");
  }
  if (!props.includes("android.minSdkVersion")) {
    props += `\nandroid.minSdkVersion=${MIN_SDK}\n`;
    fs.writeFileSync(gradlePropsPath, props, "utf8");
    console.log("[patch-min-sdk] Set android.minSdkVersion in gradle.properties");
  }
}

console.log("[patch-min-sdk] Done. minSdkVersion forced to 24 everywhere.");
