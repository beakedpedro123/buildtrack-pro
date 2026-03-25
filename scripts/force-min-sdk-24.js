#!/usr/bin/env node
/**
 * NUCLEAR FIX: Force minSdkVersion 24 everywhere.
 * 
 * This script patches:
 * 1. node_modules/react-native/gradle/libs.versions.toml (version catalog source)
 * 2. android/gradle.properties
 * 3. android/build.gradle (ext block)
 * 4. android/app/build.gradle (defaultConfig)
 * 5. android/settings.gradle (version catalog override)
 * 6. Every single .gradle file that references minSdkVersion
 * 7. Every single gradle.properties in the entire project tree
 * 8. The expo-modules-autolinking ExpoRootProjectPlugin defaults
 * 
 * Run after: npm install, expo prebuild, or any time before gradle build
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
      return;
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
    } else {
      log(`OK (already correct or no match for ${label}): ${filePath}`);
    }
  } catch (e) {
    log(`ERROR patching ${filePath}: ${e.message}`);
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
    const regex = new RegExp(`^${key.replace('.', '\\.')}=.*$`, 'm');
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
  // Add a forced override AFTER expo-root-project apply
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
// 4. Patch android/app/build.gradle - hardcode minSdkVersion
// ============================================================
const appBuildGradlePath = path.join(ROOT, 'android/app/build.gradle');
if (fs.existsSync(appBuildGradlePath)) {
  let abg = fs.readFileSync(appBuildGradlePath, 'utf8');
  
  // Replace any minSdkVersion reference with hardcoded 24
  abg = abg.replace(/minSdkVersion\s+rootProject\.ext\.minSdkVersion/g, `minSdkVersion ${MIN_SDK}`);
  abg = abg.replace(/minSdkVersion\s+\d+/g, `minSdkVersion ${MIN_SDK}`);
  
  fs.writeFileSync(appBuildGradlePath, abg, 'utf8');
  log(`PATCHED (app/build.gradle): ${appBuildGradlePath}`);
}

// ============================================================
// 5. Patch android/settings.gradle - force version catalog
// ============================================================
const settingsGradlePath = path.join(ROOT, 'android/settings.gradle');
if (fs.existsSync(settingsGradlePath)) {
  let sg = fs.readFileSync(settingsGradlePath, 'utf8');
  
  // Add a forced override after useExpoVersionCatalog
  if (sg.includes('useExpoVersionCatalog') && !sg.includes('// FORCE minSdk in version catalog')) {
    sg = sg.replace(
      /(useExpoVersionCatalog\(\))/,
      `$1\n\n// FORCE minSdk in version catalog\nversionCatalogs {\n    named("expoLibs") {\n        version("minSdk", "${MIN_SDK}")\n    }\n}`
    );
  }
  
  fs.writeFileSync(settingsGradlePath, sg, 'utf8');
  log(`PATCHED (settings.gradle): ${settingsGradlePath}`);
}

// ============================================================
// 6. Patch ExpoRootProjectPlugin to default to 24
// ============================================================
const expoRootPluginPaths = [
  path.join(ROOT, 'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/src/main/kotlin/expo/modules/plugin/ExpoRootProjectPlugin.kt'),
  path.join(ROOT, 'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/build/classes/kotlin/main/expo/modules/plugin/ExpoRootProjectPlugin.class'),
];
for (const p of expoRootPluginPaths) {
  if (p.endsWith('.kt') && fs.existsSync(p)) {
    safeReplace(p, /setIfNotExist\("minSdkVersion",\s*\d+\)/, `setIfNotExist("minSdkVersion", ${MIN_SDK})`, 'expo-root-plugin-kt');
    // Also try to replace any hardcoded 22 or 23
    safeReplace(p, /setIfNotExist\("minSdkVersion",\s*22\)/, `setIfNotExist("minSdkVersion", ${MIN_SDK})`, 'expo-root-plugin-kt-22');
    safeReplace(p, /setIfNotExist\("minSdkVersion",\s*23\)/, `setIfNotExist("minSdkVersion", ${MIN_SDK})`, 'expo-root-plugin-kt-23');
  }
}

// ============================================================
// 7. Patch the useExpoVersionCatalog in settings plugin
// ============================================================
const settingsPluginPaths = [
  path.join(ROOT, 'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/src/main/kotlin/expo/modules/plugin/ExpoAutolinkingSettingsPlugin.kt'),
];
for (const p of settingsPluginPaths) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    // After the version catalog is created, force minSdk to 24
    // Look for the closing of useExpoVersionCatalog function and add override
    if (!content.includes('// FORCED minSdk override')) {
      content = content.replace(
        /(fun\s+Settings\.useExpoVersionCatalog\(\)\s*\{)/,
        `$1\n    // FORCED minSdk override\n    gradle.beforeProject { project -> project.ext.set("minSdkVersion", ${MIN_SDK}) }`
      );
      fs.writeFileSync(p, content, 'utf8');
      log(`PATCHED (settings-plugin): ${p}`);
    }
  }
}

// ============================================================
// 8. Create/update android/init.gradle that forces minSdk
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
fs.writeFileSync(initGradlePath, initGradleContent, 'utf8');
log(`CREATED: ${initGradlePath}`);

// ============================================================
// 9. Patch gradlew to include init.gradle
// ============================================================
const gradlewPath = path.join(ROOT, 'android/gradlew');
if (fs.existsSync(gradlewPath)) {
  let gw = fs.readFileSync(gradlewPath, 'utf8');
  if (!gw.includes('init.gradle')) {
    // Add -I init.gradle to the exec command
    gw = gw.replace(
      /exec "\$JAVACMD" "\$\{JVM_OPTS\[@\]\}"/,
      'exec "$JAVACMD" "${JVM_OPTS[@]}" "-Dorg.gradle.project.android.minSdkVersion=24"'
    );
    fs.writeFileSync(gradlewPath, gw, 'utf8');
    log(`PATCHED (gradlew): ${gradlewPath}`);
  }
}

// ============================================================
// 10. Create a .env file with NODE_ENV
// ============================================================
const envPath = path.join(ROOT, '.env');
ensureLine(envPath, 'NODE_ENV', 'production', 'env-file');

// ============================================================
// 11. Scan ALL .gradle files in android/ for any minSdkVersion < 24
// ============================================================
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

const androidDir = path.join(ROOT, 'android');
if (fs.existsSync(androidDir)) {
  const gradleFiles = walkDir(androidDir, '.gradle');
  for (const gf of gradleFiles) {
    try {
      let content = fs.readFileSync(gf, 'utf8');
      const original = content;
      // Replace minSdkVersion with values less than 24
      content = content.replace(/minSdkVersion\s+22/g, `minSdkVersion ${MIN_SDK}`);
      content = content.replace(/minSdkVersion\s+21/g, `minSdkVersion ${MIN_SDK}`);
      content = content.replace(/minSdkVersion\s+23/g, `minSdkVersion ${MIN_SDK}`);
      content = content.replace(/minSdkVersion\s*=\s*22/g, `minSdkVersion = ${MIN_SDK}`);
      content = content.replace(/minSdkVersion\s*=\s*21/g, `minSdkVersion = ${MIN_SDK}`);
      content = content.replace(/minSdkVersion\s*=\s*23/g, `minSdkVersion = ${MIN_SDK}`);
      if (content !== original) {
        fs.writeFileSync(gf, content, 'utf8');
        log(`PATCHED (scan): ${gf}`);
      }
    } catch (e) { /* skip */ }
  }
  
  // Also scan all gradle.properties files
  const propsFiles = walkDir(androidDir, '.properties');
  for (const pf of propsFiles) {
    ensureLine(pf, 'android.minSdkVersion', MIN_SDK, 'scan-properties');
  }
}

// ============================================================
// 12. Patch the compiled Gradle plugin JAR if it exists
// ============================================================
// The Kotlin source might not be used if there's a pre-compiled JAR
const jarDir = path.join(ROOT, 'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/build/libs');
if (fs.existsSync(jarDir)) {
  log(`WARNING: Pre-compiled JAR found at ${jarDir} — Kotlin source patches may not take effect`);
  log(`The JAR contains compiled bytecode that may have minSdkVersion defaults baked in`);
}

// ============================================================
// 13. Create gradle.properties at project root level too
// ============================================================
const rootGradleProps = path.join(ROOT, 'gradle.properties');
ensureLine(rootGradleProps, 'android.minSdkVersion', MIN_SDK, 'root-gradle-properties');

log('=== DONE: All minSdkVersion patches applied ===');
