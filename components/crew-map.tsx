/**
 * CrewMap — Platform-aware barrel export.
 * Metro/Expo automatically resolves .native.tsx vs .web.tsx based on platform.
 * This file is the fallback for any platform that doesn't match .native or .web.
 */
export { CrewMap } from "./crew-map.web";
