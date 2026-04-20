/**
 * File download helper — downloads files from URLs and opens them
 * using the native share sheet or in-browser download.
 * Works on iOS, Android, and Web.
 */
import { Platform, Linking, Alert } from "react-native";

/**
 * Download and open a file from a URL.
 * - On native: downloads to local cache, then opens via share sheet
 * - On web: opens in a new tab or triggers browser download
 */
export async function downloadAndOpenFile(
  url: string,
  fileName: string,
  mimeType?: string
): Promise<void> {
  if (!url) {
    Alert.alert("Error", "No file URL available");
    return;
  }

  if (Platform.OS === "web") {
    // On web, open in new tab or trigger download
    try {
      window.open(url, "_blank");
    } catch {
      // Fallback: create a download link
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return;
  }

  // On native (iOS/Android)
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");

    // Download to cache directory
    const localUri = FileSystem.cacheDirectory + fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    const downloadResult = await FileSystem.downloadAsync(url, localUri);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    // Check if sharing is available
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: mimeType || getMimeFromFileName(fileName),
        dialogTitle: `Open ${fileName}`,
        UTI: getUTI(fileName),
      });
    } else {
      // Fallback: try opening with Linking
      const canOpen = await Linking.canOpenURL(downloadResult.uri);
      if (canOpen) {
        await Linking.openURL(downloadResult.uri);
      } else {
        Alert.alert("Downloaded", `File saved to: ${downloadResult.uri}`);
      }
    }
  } catch (error: any) {
    console.error("File download error:", error);
    // Fallback: try opening URL directly in browser
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Download Error", `Could not download ${fileName}. Please try again.`);
    }
  }
}

function getMimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip",
  };
  return mimeMap[ext] || "application/octet-stream";
}

function getUTI(fileName: string): string | undefined {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const utiMap: Record<string, string> = {
    pdf: "com.adobe.pdf",
    doc: "com.microsoft.word.doc",
    docx: "org.openxmlformats.wordprocessingml.document",
    xls: "com.microsoft.excel.xls",
    xlsx: "org.openxmlformats.spreadsheetml.sheet",
    jpg: "public.jpeg",
    jpeg: "public.jpeg",
    png: "public.png",
    gif: "com.compuserve.gif",
    txt: "public.plain-text",
    csv: "public.comma-separated-values-text",
    zip: "com.pkware.zip-archive",
  };
  return utiMap[ext];
}
