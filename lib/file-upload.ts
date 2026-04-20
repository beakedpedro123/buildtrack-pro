/**
 * File upload helper — uploads files to the server's /api/upload endpoint,
 * which stores them in S3 and returns a public URL.
 */
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

interface UploadResult {
  url: string;
  key: string;
  size: number;
}

/**
 * Upload a file from a local URI to the server.
 * Works on iOS, Android, and Web.
 *
 * @param fileUri - The local file URI (e.g., from DocumentPicker or ImagePicker)
 * @param fileName - The display name of the file
 * @param mimeType - The MIME type (e.g., "application/pdf", "image/jpeg")
 * @returns The upload result with the public URL
 */
export async function uploadFile(
  fileUri: string,
  fileName: string,
  mimeType: string = "application/octet-stream"
): Promise<UploadResult> {
  const baseUrl = getApiBaseUrl();
  const uploadUrl = baseUrl ? `${baseUrl}/api/upload` : "/api/upload";

  const formData = new FormData();

  if (Platform.OS === "web") {
    // On web, fetch the blob from the URI and append
    const response = await fetch(fileUri);
    const blob = await response.blob();
    formData.append("file", blob, fileName);
  } else {
    // On native (iOS/Android), use the URI directly
    // React Native's FormData accepts { uri, name, type } objects
    formData.append("file", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const headers: Record<string, string> = {};

  // Add auth header on native platforms
  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Upload failed");
    throw new Error(`Upload failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return {
    url: result.url,
    key: result.key,
    size: result.size,
  };
}

/**
 * Determine the MIME type from a file name extension.
 */
export function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    zip: "application/zip",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Determine the attachment type category from a MIME type.
 */
export function getAttachmentType(mimeType: string): "image" | "pdf" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return "document";
}
