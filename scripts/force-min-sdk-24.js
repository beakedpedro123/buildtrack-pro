#!/usr/bin/env node
/**
 * NUCLEAR FIX: Force minSdkVersion 24 everywhere.
 * 
 * The root cause: React Native 0.81's Hermes native libraries (hermestooling)
 * are compiled for API 24+. The CMake build reads ANDROID_PLATFORM from the
 * NDK toolchain, which defaults to the app's minSdkVersion. If minSdkVersion
 * is < 24, CMake fails with CXX1214.
 * 
 * This script patches:
 * 1. node_modules/react-native/gradle/libs.versions.toml (version catalog)
 * 2. gradle.properties (android.minSdkVersion=24)
 * 3. android/build.gradle (ext block)
 * 4. android/app/build.gradle (defaultConfig + CMake args)
 * 5. android/settings.gradle (version catalog override)
 * 6. ExpoRootProjectPlugin.kt (default minSdkVersion)
 * 7. ALL .gradle files that reference minSdkVersion < 24
 * 8. ReactAndroid/build.gradle.kts (CMake arguments)
 * 
 * Run via: postinstall, eas-build-post-install, or manually
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIN_SDK = '24';

function log(msg) {
  console.log(`[force-min-sdk-24] ${msg}`);
}

function safeReplace(filePath, search, replace, label) {
  try {
    if (!fs.existsSync(filePath)) {
      log(`SKIP (not found): ${filePath}`);
      return false;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    if (search instanceof RegExp) {
      content = content.replace(search, replace);
    } else {
      content = content.split(search).join(replace);
    }
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      log(`PATCHED (${label}): ${filePath}`);
      return true;
    } else {
      log(`OK (already correct for ${label}): ${filePath}`);
      return false;
    }
  } catch (e) {
    log(`ERROR patching ${filePath}: ${e.message}`);
    return false;
  }
}

function ensureLine(filePath, key, value, label) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${key}=${value}\n`, 'utf8');
      log(`CREATED (${label}): ${filePath}`);
      return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    const regex = new RegExp(`^${key.replace(/\./g, '\\.')}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }
    fs.writeFileSync(filePath, content, 'utf8');
    log(`SET (${label}): ${filePath} → ${key}=${value}`);
  } catch (e) {
    log(`ERROR: ${filePath}: ${e.message}`);
  }
}

function walkDir(dir, ext) {
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'build') {
          results.push(...walkDir(fullPath, ext));
        } else if (item.endsWith(ext)) {
          results.push(fullPath);
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
  return results;
}

// ============================================================
// 1. Patch react-native version catalog TOML (THE SOURCE OF TRUTH)
// ============================================================
const tomlPath = path.join(ROOT, 'node_modules/react-native/gradle/libs.versions.toml');
safeReplace(tomlPath, /minSdk\s*=\s*"\d+"/, `minSdk = "${MIN_SDK}"`, 'version-catalog-toml');

// ============================================================
// 2. Patch ALL gradle.properties files
// ============================================================
const gradlePropsLocations = [
  path.join(ROOT, 'android/gradle.properties'),
  path.join(ROOT, 'gradle.properties'),
];
for (const gp of gradlePropsLocations) {
  ensureLine(gp, 'android.minSdkVersion', MIN_SDK, 'gradle-properties');
}

// ============================================================
// 3. Patch android/build.gradle ext block
// ============================================================
const buildGradlePath = path.join(ROOT, 'android/build.gradle');
if (fs.existsSync(buildGradlePath)) {
  let bg = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Force ext block minSdkVersion
  bg = bg.replace(/minSdkVersion\s*=\s*Integer\.parseInt\([^)]+\)/g, `minSdkVersion = ${MIN_SDK}`);
  bg = bg.replace(/minSdkVersion\s*=\s*\d+/g, `minSdkVersion = ${MIN_SDK}`);
  
  // If no ext block with minSdkVersion, add one before the first buildscript
  if (!bg.includes('minSdkVersion')) {
    bg = bg.replace(/(buildscript\s*\{)/, `ext {\n    minSdkVersion = ${MIN_SDK}\n}\n\n$1`);
  }
  
  // Ensure our ext block is BEFORE apply plugin expo-root-project
  if (bg.includes('expo-root-project')) {
    if (!bg.includes('// FORCE minSdkVersion override')) {
      bg = bg.replace(
        /(apply\s+plugin:\s*['"]expo-root-project['"])/,
        `$1\n\n// FORCE minSdkVersion override after expo-root-project\next.minSdkVersion = ${MIN_SDK}`
      );
    }
  }
  
  fs.writeFileSync(buildGradlePath, bg, 'utf8');
  log(`PATCHED (build.gradle ext): ${buildGradlePath}`);
}

// ============================================================
// 4. Patch android/app/build.gradle - hardcode minSdkVersion + CMake
// ============================================================
const appBuildGradlePath = path.join(ROOT, 'android/app/build.gradle');
if (fs.existsSync(appBuildGradlePath)) {
  let abg = fs.readFileSync(appBuildGradlePath, 'utf8');
  
  // Replace any minSdkVersion reference with hardcoded 24
  abg = abg.replace(/minSdkVersion\s+rootProject\.ext\.minSdkVersion/g, `minSdkVersion ${MIN_SDK}`);
  abg = abg.replace(/minSdkVersion\s+\d+/g, `minSdkVersion ${MIN_SDK}`);
  
  // Add ANDROID_PLATFORM cmake argument if not present
  if (!abg.includes('ANDROID_PLATFORM=android-24')) {
    abg = abg.replace(
      /(defaultConfig\s*\{)/,
      `$1\n        externalNativeBuild {\n            cmake {\n                arguments "-DANDROID_PLATFORM=android-${MIN_SDK}", "-DANDROID_NATIVE_API_LEVEL=${MIN_SDK}"\n            }\n        }`
    );
  }
  
  fs.writeFileSync(appBuildGradlePath, abg, 'utf8');
  log(`PATCHED (app/build.gradle): ${appBuildGradlePath}`);
}

// ============================================================
// 5. Patch android/settings.gradle
// ============================================================
const settingsGradlePath = path.join(ROOT, 'android/settings.gradle');
if (fs.existsSync(settingsGradlePath)) {
  let sg = fs.readFileSync(settingsGradlePath, 'utf8');
  sg = sg.replace(/\/\/ FORCE minSdk in version catalog\nversionCatalogs \{[\s\S]*?\}\n\}/g, '');
  fs.writeFileSync(settingsGradlePath, sg, 'utf8');
  log(`PATCHED (settings.gradle): ${settingsGradlePath}`);
}

// ============================================================
// 6. Patch ExpoRootProjectPlugin to default to 24
// ============================================================
const expoRootPluginPaths = [
  path.join(ROOT, 'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt'),
];
for (const p of expoRootPluginPaths) {
  if (fs.existsSync(p)) {
    safeReplace(p, /setIfNotExist\("minSdkVersion"\)\s*\{[^}]*\}/g, `setIfNotExist("minSdkVersion") { ${MIN_SDK} }`, 'expo-root-plugin-kt');
    safeReplace(p, /getVersionOrDefault\("minSdk",\s*"\d+"\)/, `getVersionOrDefault("minSdk", "${MIN_SDK}")`, 'expo-root-plugin-default');
  }
}

// ============================================================
// 7. CRITICAL: Patch ReactAndroid/build.gradle.kts CMake args
//    This is where hermestooling gets its minSdk from
// ============================================================
const reactAndroidBuildGradle = path.join(ROOT, 'node_modules/react-native/ReactAndroid/build.gradle.kts');
if (fs.existsSync(reactAndroidBuildGradle)) {
  let content = fs.readFileSync(reactAndroidBuildGradle, 'utf8');
  
  // Add ANDROID_PLATFORM to the cmake arguments list
  if (!content.includes('ANDROID_PLATFORM=android-24')) {
    content = content.replace(
      /"-DCMAKE_POLICY_DEFAULT_CMP0069=NEW"\)/,
      `"-DCMAKE_POLICY_DEFAULT_CMP0069=NEW",\n            "-DANDROID_PLATFORM=android-${MIN_SDK}")`
    );
    log(`PATCHED (ReactAndroid cmake args): ${reactAndroidBuildGradle}`);
  }
  
  // Also force minSdk in defaultConfig
  content = content.replace(
    /minSdk\s*=\s*libs\.versions\.minSdk\.get\(\)\.toInt\(\)/g,
    `minSdk = ${MIN_SDK}`
  );
  
  fs.writeFileSync(reactAndroidBuildGradle, content, 'utf8');
  log(`PATCHED (ReactAndroid build.gradle.kts): ${reactAndroidBuildGradle}`);
}

// ============================================================
// 8. Patch hermes-engine build.gradle.kts
// ============================================================
const hermesBuildGradle = path.join(ROOT, 'node_modules/react-native/ReactAndroid/hermes-engine/build.gradle.kts');
if (fs.existsSync(hermesBuildGradle)) {
  let content = fs.readFileSync(hermesBuildGradle, 'utf8');
  content = content.replace(
    /minSdk\s*=\s*libs\.versions\.minSdk\.get\(\)\.toInt\(\)/g,
    `minSdk = ${MIN_SDK}`
  );
  fs.writeFileSync(hermesBuildGradle, content, 'utf8');
  log(`PATCHED (hermes-engine build.gradle.kts): ${hermesBuildGradle}`);
}

// ============================================================
// 9. Scan ALL .gradle files in android/ for minSdkVersion < 24
// ============================================================
const androidDir = path.join(ROOT, 'android');
if (fs.existsSync(androidDir)) {
  const gradleFiles = [...walkDir(androidDir, '.gradle'), ...walkDir(androidDir, '.gradle.kts')];
  for (const gf of gradleFiles) {
    try {
      let content = fs.readFileSync(gf, 'utf8');
      const original = content;
      content = content.replace(/minSdkVersion\s+2[0-3]\b/g, `minSdkVersion ${MIN_SDK}`);
      content = content.replace(/minSdkVersion\s*=\s*2[0-3]\b/g, `minSdkVersion = ${MIN_SDK}`);
      content = content.replace(/minSdk\s*=\s*2[0-3]\b/g, `minSdk = ${MIN_SDK}`);
      if (content !== original) {
        fs.writeFileSync(gf, content, 'utf8');
        log(`PATCHED (scan): ${gf}`);
      }
    } catch (e) { /* skip */ }
  }
  
  const propsFiles = walkDir(androidDir, '.properties');
  for (const pf of propsFiles) {
    ensureLine(pf, 'android.minSdkVersion', MIN_SDK, 'scan-properties');
  }
}

// ============================================================
// 10. Create android/init.gradle that forces minSdk
// ============================================================
const initGradlePath = path.join(ROOT, 'android/init.gradle');
const initGradleContent = `
// Auto-generated: Force minSdkVersion to ${MIN_SDK}
allprojects {
    afterEvaluate { project ->
        if (project.hasProperty('android')) {
            project.android {
                if (it.hasProperty('defaultConfig')) {
                    it.defaultConfig {
                        if (minSdkVersion.apiLevel < ${MIN_SDK}) {
                            minSdkVersion ${MIN_SDK}
                        }
                    }
                }
            }
        }
        project.ext.set("minSdkVersion", ${MIN_SDK})
    }
}
`;
const initGradleDir = path.dirname(initGradlePath);
if (fs.existsSync(initGradleDir)) {
  fs.writeFileSync(initGradlePath, initGradleContent, 'utf8');
  log(`CREATED: ${initGradlePath}`);
}

// ============================================================
// 11. Create gradle.properties at project root level
// ============================================================
const rootGradleProps = path.join(ROOT, 'gradle.properties');
ensureLine(rootGradleProps, 'android.minSdkVersion', MIN_SDK, 'root-gradle-properties');

// ============================================================
// 12. Patch the ExpoAutolinkingSettingsExtension to force minSdk
// ============================================================
const settingsPluginPaths = [
  path.join(ROOT, 'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-settings-plugin/src/main/kotlin/expo/modules/plugin/ExpoAutolinkingSettingsExtension.kt'),
];
for (const p of settingsPluginPaths) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    if (!content.includes('// FORCED minSdk override')) {
      content = content.replace(
        /(fun\s+useExpoVersionCatalog\(\)\s*\{)/,
        `$1\n    // FORCED minSdk override\n    // Ensure gradle property is set before catalog creation`
      );
      fs.writeFileSync(p, content, 'utf8');
      log(`PATCHED (settings-plugin): ${p}`);
    }
  }
}

log('=== DONE: All minSdkVersion patches applied ===');
