/**
 * File download helper — downloads files from URLs and opens them.
 * 
 * Strategy (native iOS/Android):
 *   1. For PDFs: open directly in WebBrowser (in-app Safari/Chrome) — most reliable
 *   2. For other files: try expo-file-system download + expo-sharing share sheet
 *   3. Fallback: open URL in system browser via Linking
 * 
 * Every step is wrapped in try/catch to prevent app crashes.
 */
import { Platform, Linking, Alert } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Build a proxied download URL through our server.
 * This ensures proper Content-Disposition headers for the client.
 */
function getProxyDownloadUrl(originalUrl: string, fileName: string): string {
  try {
    const base = getApiBaseUrl();
    if (!base) return originalUrl;
    const params = new URLSearchParams({ url: originalUrl, name: fileName });
    return `${base}/api/download?${params.toString()}`;
  } catch {
    return originalUrl;
  }
}

/**
 * Download and open a file from a URL.
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

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isPdf = ext === "pdf";

  // ─── WEB ───
  if (Platform.OS === "web") {
    try {
      const proxyUrl = getProxyDownloadUrl(url, fileName);
      window.open(proxyUrl, "_blank");
    } catch {
      try { window.open(url, "_blank"); } catch {
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch { /* exhausted web fallbacks */ }
      }
    }
    return;
  }

  // ─── NATIVE (iOS / Android) ───

  // Strategy 1: For PDFs, open directly in WebBrowser (most reliable on iOS)
  if (isPdf) {
    try {
      const WebBrowser = await import("expo-web-browser");
      // Try proxy URL first (proper Content-Type headers)
      const proxyUrl = getProxyDownloadUrl(url, fileName);
      await WebBrowser.openBrowserAsync(proxyUrl, {
        presentationStyle: (WebBrowser as any).WebBrowserPresentationStyle?.FULL_SCREEN,
      });
      return;
    } catch (e1) {
      console.warn("WebBrowser proxy failed for PDF:", e1);
      // Try direct URL in WebBrowser
      try {
        const WebBrowser = await import("expo-web-browser");
        await WebBrowser.openBrowserAsync(url, {
          presentationStyle: (WebBrowser as any).WebBrowserPresentationStyle?.FULL_SCREEN,
        });
        return;
      } catch (e2) {
        console.warn("WebBrowser direct failed for PDF:", e2);
        // Fall through to file system approach
      }
    }
  }

  // Strategy 2: Download to local cache + share sheet
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const localUri = (FileSystem.cacheDirectory || "") + safeName;

    if (!FileSystem.cacheDirectory) {
      throw new Error("cacheDirectory not available");
    }

    // Try proxy URL first
    let downloadUri: string | null = null;
    try {
      const proxyUrl = getProxyDownloadUrl(url, fileName);
      const result = await FileSystem.downloadAsync(proxyUrl, localUri);
      if (result.status === 200) {
        downloadUri = result.uri;
      }
    } catch {
      // proxy failed, try direct
    }

    // Fallback to direct URL
    if (!downloadUri) {
      try {
        const result = await FileSystem.downloadAsync(url, localUri);
        if (result.status === 200) {
          downloadUri = result.uri;
        }
      } catch {
        // direct also failed
      }
    }

    if (downloadUri) {
      // Try sharing
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadUri, {
            mimeType: mimeType || getMimeFromFileName(fileName),
            dialogTitle: `Open ${fileName}`,
            UTI: getUTI(fileName),
          });
          return;
        }
      } catch (shareErr) {
        console.warn("Sharing failed:", shareErr);
      }

      // If sharing failed but we have the file, try WebBrowser for PDFs
      if (isPdf) {
        try {
          const WebBrowser = await import("expo-web-browser");
          await WebBrowser.openBrowserAsync(downloadUri);
          return;
        } catch { /* continue */ }
      }

      // Try Linking
      try {
        await Linking.openURL(downloadUri);
        return;
      } catch { /* continue */ }
    }
  } catch (fsError) {
    console.warn("FileSystem download approach failed:", fsError);
  }

  // Strategy 3: Last resort — open URL in system browser
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return;
    }
  } catch { /* continue */ }

  // Try proxy URL in system browser
  try {
    const proxyUrl = getProxyDownloadUrl(url, fileName);
    await Linking.openURL(proxyUrl);
    return;
  } catch { /* continue */ }

  // All methods exhausted
  Alert.alert(
    "Download Error",
    `Could not download "${fileName}". The file URL may have expired. Please ask the sender to re-send the file.`
  );
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
