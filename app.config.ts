/**
 * Dynamic Expo config that merges app.json with runtime values.
 * 
 * This file ensures bundleIdentifier and package are always present
 * for EAS builds in non-interactive mode.
 */
import type { ExpoConfig, ConfigContext } from "expo/config";

const BUNDLE_ID = "space.manus.construction.manager.t20260317205444";
const SCHEME = "manust20260317205444";

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: config.name || "BuildTrack Pro",
    slug: config.slug || "construction-manager",
    version: config.version || "1.0.1",
    scheme: SCHEME,
    ios: {
      ...config.ios,
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        ...(config.ios?.infoPlist || {}),
      },
    },
    android: {
      ...config.android,
      package: BUNDLE_ID,
    },
    extra: {
      ...config.extra,
      eas: {
        projectId: "f834a92d-e6d2-4d0f-a9f4-f2b25269b079",
      },
      logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663449841780/rSnGYsBBVhLkjsmE.png",
    },
  };
};
