/**
 * File download helper — downloads files from URLs and opens them.
 * Uses the server's /api/download proxy for reliable downloads on iOS.
 * Falls back to WebBrowser for PDFs if sharing fails.
 */
import { Platform, Linking, Alert } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Build a proxied download URL through our server.
 * This avoids CORS issues and ensures proper Content-Disposition headers.
 */
function getProxyDownloadUrl(originalUrl: string, fileName: string): string {
  const base = getApiBaseUrl();
  const params = new URLSearchParams({ url: originalUrl, name: fileName });
  return `${base}/api/download?${params.toString()}`;
}

/**
 * Download and open a file from a URL.
 * - On native: downloads via server proxy to local cache, then opens via share sheet
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
    // On web, use the proxy URL to trigger a proper download
    try {
      const proxyUrl = getProxyDownloadUrl(url, fileName);
      window.open(proxyUrl, "_blank");
    } catch {
      // Fallback: try direct URL
      try {
        window.open(url, "_blank");
      } catch {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
    return;
  }

  // On native (iOS/Android) — use the proxy URL for reliable downloads
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");

    // Sanitize filename for filesystem
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const localUri = FileSystem.cacheDirectory + safeName;

    // Use the proxy URL for more reliable downloads (proper headers)
    const proxyUrl = getProxyDownloadUrl(url, fileName);

    const downloadResult = await FileSystem.downloadAsync(proxyUrl, localUri);

    if (downloadResult.status !== 200) {
      // Try direct URL as fallback
      console.warn(`Proxy download failed (${downloadResult.status}), trying direct URL...`);
      const directResult = await FileSystem.downloadAsync(url, localUri);
      if (directResult.status !== 200) {
        throw new Error(`Download failed with status ${directResult.status}`);
      }
      // Use direct result
      await openDownloadedFile(directResult.uri, fileName, mimeType, Sharing, Linking);
      return;
    }

    await openDownloadedFile(downloadResult.uri, fileName, mimeType, Sharing, Linking);
  } catch (error: any) {
    console.error("File download error:", error);

    // Final fallback: try opening the URL in the system browser
    try {
      // For PDFs, try opening in WebBrowser (in-app browser)
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      if (ext === "pdf") {
        const WebBrowser = await import("expo-web-browser");
        await WebBrowser.openBrowserAsync(url, {
          presentationStyle: (WebBrowser as any).WebBrowserPresentationStyle?.FULL_SCREEN,
        });
        return;
      }
      // For other files, try Linking
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Download Error", `Could not download "${fileName}". The file URL may have expired. Please ask the sender to re-send the file.`);
      }
    } catch {
      Alert.alert("Download Error", `Could not download "${fileName}". Please try again later.`);
    }
  }
}

/**
 * Open a downloaded file via the share sheet or fallback methods.
 */
async function openDownloadedFile(
  uri: string,
  fileName: string,
  mimeType: string | undefined,
  Sharing: typeof import("expo-sharing"),
  LinkingModule: typeof Linking
): Promise<void> {
  const resolvedMime = mimeType || getMimeFromFileName(fileName);
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Try sharing first (most reliable on iOS)
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: resolvedMime,
        dialogTitle: `Open ${fileName}`,
        UTI: getUTI(fileName),
      });
      return;
    }
  } catch (shareError: any) {
    console.warn("Share failed:", shareError);
  }

  // Fallback for PDFs: open in WebBrowser
  if (ext === "pdf") {
    try {
      const WebBrowser = await import("expo-web-browser");
      await WebBrowser.openBrowserAsync(uri, {
        presentationStyle: (WebBrowser as any).WebBrowserPresentationStyle?.FULL_SCREEN,
      });
      return;
    } catch {
      // Continue to next fallback
    }
  }

  // Fallback: try opening with Linking
  try {
    const canOpen = await LinkingModule.canOpenURL(uri);
    if (canOpen) {
      await LinkingModule.openURL(uri);
      return;
    }
  } catch {
    // Continue to alert
  }

  Alert.alert("File Downloaded", `"${fileName}" has been downloaded but could not be opened automatically. Check your device's file manager.`);
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
