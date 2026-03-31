const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Escape a directory path for use in a RegExp
function escapeDir(dirName) {
  return path
    .resolve(__dirname, dirName)
    .replace(/[/\\]/g, "[/\\\\]")
    .replace(/\./g, "\\.");
}

// Directories to exclude from Metro bundling:
// - public/  → PWA build output (.css, .js that Metro can't handle)
// - server/  → Node.js server code (imports fs, path, express, etc.)
// - drizzle/ → Database migrations (Node.js only)
// - dist/    → Build output
const excludeDirs = ["public", "server", "drizzle", "dist"];
const excludePatterns = excludeDirs.map(
  (dir) => new RegExp(`${escapeDir(dir)}[/\\\\].*`)
);

// Metro blockList accepts an array of RegExp or a single combined RegExp
// We need to combine with the existing default blockList patterns
const defaultBlockList = config.resolver.blockList || [];

// Build a combined regex from all patterns
const allPatterns = [];
if (Array.isArray(defaultBlockList)) {
  for (const p of defaultBlockList) {
    if (p instanceof RegExp) allPatterns.push(p.source);
  }
} else if (defaultBlockList instanceof RegExp) {
  allPatterns.push(defaultBlockList.source);
}
for (const pattern of excludePatterns) {
  allPatterns.push(pattern.source);
}

// Metro expects blockList to be a single RegExp
config.resolver.blockList = new RegExp(`(${allPatterns.join("|")})$`);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
