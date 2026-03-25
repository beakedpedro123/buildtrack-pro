#!/usr/bin/env node
/**
 * Post-install / pre-build script to force minSdkVersion 24 across all Android build files.
 * 
 * React Native 0.81+ Hermes is built for minSdk 24. Some build environments
 * default to 22, causing CMake errors. This script patches all relevant files.
 * 
 * Run automatically via package.json "postinstall" or manually before build.
 */
const fs = require('fs');
const path = require('path');

const ANDROID_DIR = path.join(__dirname, '..', 'android');
const MIN_SDK = '24';
const COMPILE_SDK = '35';
const TARGET_SDK = '35';

function patchFile(filePath, patches) {
  if (!fs.existsSync(filePath)) {
    console.log(`[fix-min-sdk] Skipping ${filePath} (not found)`);
    return false;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [pattern, replacement] of patches) {
    const regex = new RegExp(pattern, 'g');
    const newContent = content.replace(regex, replacement);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[fix-min-sdk] Patched ${filePath}`);
  } else {
    console.log(`[fix-min-sdk] ${filePath} already correct`);
  }
  return changed;
}

function main() {
  console.log('[fix-min-sdk] Forcing minSdkVersion=' + MIN_SDK);

  // 1. Patch gradle.properties
  const gradleProps = path.join(ANDROID_DIR, 'gradle.properties');
  if (fs.existsSync(gradleProps)) {
    let content = fs.readFileSync(gradleProps, 'utf8');
    const overrides = {
      'android.minSdkVersion': MIN_SDK,
      'android.compileSdkVersion': COMPILE_SDK,
      'android.targetSdkVersion': TARGET_SDK,
    };
    for (const [key, value] of Object.entries(overrides)) {
      const regex = new RegExp(`^${key.replace('.', '\\.')}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
    }
    fs.writeFileSync(gradleProps, content, 'utf8');
    console.log(`[fix-min-sdk] Patched ${gradleProps}`);
  }

  // 2. Patch root build.gradle - ensure ext block has minSdkVersion 24
  const rootBuildGradle = path.join(ANDROID_DIR, 'build.gradle');
  if (fs.existsSync(rootBuildGradle)) {
    let content = fs.readFileSync(rootBuildGradle, 'utf8');
    // Replace any minSdkVersion = XX with 24
    content = content.replace(/minSdkVersion\s*=\s*\d+/g, `minSdkVersion = ${MIN_SDK}`);
    // If no ext block exists, add one before apply plugin
    if (!content.includes('minSdkVersion')) {
      const extBlock = `\next {\n    minSdkVersion = ${MIN_SDK}\n    compileSdkVersion = ${COMPILE_SDK}\n    targetSdkVersion = ${TARGET_SDK}\n    buildToolsVersion = "35.0.0"\n    ndkVersion = "27.1.12297006"\n}\n`;
      const pluginLine = 'apply plugin: "expo-root-project"';
      if (content.includes(pluginLine)) {
        content = content.replace(pluginLine, extBlock + pluginLine);
      } else {
        content = extBlock + content;
      }
    }
    fs.writeFileSync(rootBuildGradle, content, 'utf8');
    console.log(`[fix-min-sdk] Patched ${rootBuildGradle}`);
  }

  // 3. Patch app/build.gradle - hardcode minSdkVersion
  const appBuildGradle = path.join(ANDROID_DIR, 'app', 'build.gradle');
  patchFile(appBuildGradle, [
    // Replace rootProject.ext.minSdkVersion with hardcoded 24
    ['minSdkVersion\\s+rootProject\\.ext\\.minSdkVersion', `minSdkVersion ${MIN_SDK}`],
    // Replace any other minSdkVersion XX (where XX != 24) with 24
    ['minSdkVersion\\s+(\\d+)', (match, num) => {
      return parseInt(num) < 24 ? `minSdkVersion ${MIN_SDK}` : match;
    }],
  ]);

  // 4. Create a Gradle init script that forces minSdkVersion at the Gradle level
  const initDir = path.join(ANDROID_DIR, 'gradle.d');
  if (!fs.existsSync(initDir)) {
    fs.mkdirSync(initDir, { recursive: true });
  }
  const initScript = path.join(ANDROID_DIR, 'init.gradle');
  fs.writeFileSync(initScript, `
// Force minSdkVersion 24 for all subprojects
// This runs before any build.gradle is evaluated
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
    }
}
`, 'utf8');
  console.log(`[fix-min-sdk] Created ${initScript}`);

  // 5. Also patch the react-native version catalog if it has wrong minSdk
  const versionCatalog = path.join(__dirname, '..', 'node_modules', 'react-native', 'gradle', 'libs.versions.toml');
  if (fs.existsSync(versionCatalog)) {
    let content = fs.readFileSync(versionCatalog, 'utf8');
    const newContent = content.replace(/^minSdk\s*=\s*"\d+"/m, `minSdk = "${MIN_SDK}"`);
    if (newContent !== content) {
      fs.writeFileSync(versionCatalog, newContent, 'utf8');
      console.log(`[fix-min-sdk] Patched ${versionCatalog}`);
    }
  }

  console.log('[fix-min-sdk] Done!');
}

main();
