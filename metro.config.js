const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Build absolute-path-anchored patterns so we only block the PROJECT's
// public/, server/, drizzle/, and dist/ — never identically-named folders
// buried inside node_modules (e.g. react-native-css-interop/dist/).
const projectRoot = path.resolve(__dirname).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

config.resolver.blockList = [
  new RegExp(`^${projectRoot}/public/.*`),
  new RegExp(`^${projectRoot}/server/.*`),
  new RegExp(`^${projectRoot}/drizzle/.*`),
  new RegExp(`^${projectRoot}/dist/.*`),
];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
