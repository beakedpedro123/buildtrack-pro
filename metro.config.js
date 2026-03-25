const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude the public/ directory (PWA build output) from Metro bundling
// This prevents Metro from trying to process .css, .js files in public/assets/
const publicDirEscaped = path
  .resolve(__dirname, "public")
  .replace(/[/\\]/g, "[/\\\\]")
  .replace(/\./g, "\\.");

// Metro blockList accepts an array of RegExp or a single combined RegExp
// We need to combine with the existing default blockList patterns
const defaultBlockList = config.resolver.blockList || [];
const publicBlockPattern = new RegExp(`${publicDirEscaped}[/\\\\].*`);

// Build a combined regex from all patterns
const allPatterns = [];
if (Array.isArray(defaultBlockList)) {
  for (const p of defaultBlockList) {
    if (p instanceof RegExp) allPatterns.push(p.source);
  }
} else if (defaultBlockList instanceof RegExp) {
  allPatterns.push(defaultBlockList.source);
}
allPatterns.push(publicBlockPattern.source);

// Metro expects blockList to be a single RegExp
config.resolver.blockList = new RegExp(`(${allPatterns.join("|")})$`);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
