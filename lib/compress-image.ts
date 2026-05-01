/**
 * compress-image.ts
 *
 * Shared utility for compressing images before upload.
 * Uses expo-image-manipulator to resize and compress on-device,
 * keeping uploads well under the 25mb server limit.
 *
 * Strategy:
 *  - Max width: 1920px (full HD — enough for field documentation)
 *  - JPEG quality: 0.75 (good visual quality, ~60-80% size reduction vs raw camera)
 *  - Web fallback: returns the original URI unchanged (manipulator has web limitations)
 *
 * Usage:
 *   import { compressImageForUpload } from "@/lib/compress-image";
 *   const compressedUri = await compressImageForUpload(pickerResult.assets[0].uri);
 */

import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_WIDTH = 1920; // px — full HD, more than enough for site photos
const JPEG_QUALITY = 0.75; // 75% quality — good balance of size vs fidelity

/**
 * Compresses an image URI for upload.
 * - Resizes to max 1920px wide (maintains aspect ratio)
 * - Converts to JPEG at 75% quality
 * - Returns the compressed local URI
 * - On web, returns the original URI unchanged (manipulator has web limitations)
 */
export async function compressImageForUpload(uri: string): Promise<string> {
  // Web: expo-image-manipulator cannot handle file:// URIs on web
  // The server limit is now 25mb so web uploads will still work
  if (Platform.OS === "web") {
    return uri;
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    return result.uri;
  } catch (err) {
    // If compression fails for any reason, fall back to original URI
    // Better to upload a large file than to silently drop the photo
    console.warn("[compress-image] Compression failed, using original URI:", err);
    return uri;
  }
}
