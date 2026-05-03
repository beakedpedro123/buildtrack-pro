/**
 * Authenticated PDF download helper.
 * 
 * Problem: When the app opens PDF URLs via Linking.openURL(), the external browser
 * (Chrome/Safari) doesn't have the app's session cookie, so the server returns 401.
 * 
 * Solution: Download the PDF using expo-file-system with the Bearer token in headers,
 * save it locally, then open it via the share sheet (expo-sharing) or in-app browser.
 */
import { Platform, Alert } from "react-native";
import * as Auth from "@/lib/_core/auth";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Download a PDF from an authenticated server endpoint and open it.
 * 
 * @param url - Full URL to the PDF endpoint (e.g., /api/payroll-pdf?...)
 * @param fileName - Suggested filename for the downloaded PDF
 */
export async function downloadAuthenticatedPDF(
  url: string,
  fileName: string = "report.pdf"
): Promise<void> {
  // ─── WEB ───
  if (Platform.OS === "web") {
    try {
      const token = await Auth.getSessionToken();
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      console.error("[PDF Download] Web error:", err);
      // Fallback: open URL directly (will fail if auth required, but worth trying)
      try { window.open(url, "_blank"); } catch { /* exhausted */ }
    }
    return;
  }

  // ─── NATIVE (iOS / Android) ───
  try {
    const token = await Auth.getSessionToken();
    if (!token) {
      Alert.alert("Authentication Error", "Please log in again to download reports.");
      return;
    }

    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");

    // Use cacheDirectory (works reliably on both iOS and Android)
    const baseDir = FileSystem.cacheDirectory;
    if (!baseDir) {
      throw new Error("Cache directory not available");
    }

    // Clean filename for filesystem — ensure .pdf extension
    let safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!safeName.toLowerCase().endsWith(".pdf")) {
      safeName += ".pdf";
    }
    // Add timestamp to avoid iOS caching stale files
    const timestamp = Date.now();
    const uniqueName = safeName.replace(".pdf", `_${timestamp}.pdf`);
    const localUri = baseDir + uniqueName;

    // Download with auth header
    const result = await FileSystem.downloadAsync(url, localUri, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf",
      },
    });

    if (result.status !== 200) {
      // Read error body if possible
      let errorMsg = `Server returned status ${result.status}`;
      try {
        const body = await FileSystem.readAsStringAsync(result.uri);
        const parsed = JSON.parse(body);
        if (parsed.error) errorMsg = parsed.error;
      } catch { /* ignore parse errors */ }
      
      // Clean up failed download
      try { await FileSystem.deleteAsync(result.uri, { idempotent: true }); } catch { /* ignore */ }
      
      throw new Error(errorMsg);
    }

    // Verify file was actually downloaded (iOS can silently fail)
    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    if (!fileInfo.exists || (fileInfo as any).size === 0) {
      throw new Error("Downloaded file is empty or missing");
    }

    // Open via share sheet
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        dialogTitle: `Open ${fileName}`,
        UTI: "com.adobe.pdf",
      });
      // Clean up temp file after sharing (non-blocking)
      setTimeout(async () => {
        try { await FileSystem.deleteAsync(result.uri, { idempotent: true }); } catch { /* ignore */ }
      }, 30000);
      return;
    }

    // Fallback: try opening the local file
    const { Linking } = await import("react-native");
    await Linking.openURL(result.uri);
  } catch (err: any) {
    console.error("[PDF Download] Error:", err);
    Alert.alert(
      "Download Error",
      `Could not download the report: ${err?.message || "Unknown error"}. Please try again.`
    );
  }
}
