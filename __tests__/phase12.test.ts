import { describe, it, expect } from "vitest";

describe("Phase 12 — Photo Upload Fix", () => {
  describe("Server upload endpoint uses multer", () => {
    it("should import multer in server/_core/index.ts", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("server/_core/index.ts", "utf-8");
      expect(content).toContain('import multer from "multer"');
      expect(content).toContain("multer.memoryStorage()");
      expect(content).toContain('upload.single("file")');
    });

    it("should handle req.file from multer (not manual boundary parsing)", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("server/_core/index.ts", "utf-8");
      expect(content).toContain("req.file");
      expect(content).toContain("req.file.buffer");
      expect(content).toContain("req.file.mimetype");
      // Should NOT contain the old latin1 parsing
      expect(content).not.toContain('toString("latin1")');
      expect(content).not.toContain("split(`--${boundary}`)");
    });
  });

  describe("Client photo upload uses FormData with file object", () => {
    it("should use FormData for photo upload in reports.tsx", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      expect(content).toContain("new FormData()");
      expect(content).toContain('formData.append("file"');
      expect(content).toContain("/api/upload");
    });

    it("should use native file object pattern on non-web platforms", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      // Native pattern: { uri, type, name } as any
      expect(content).toContain("uri: uri");
      expect(content).toContain('type: "image/jpeg"');
      expect(content).toContain("name: `photo_");
    });

    it("should use fetch→blob pattern on web", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      expect(content).toContain('Platform.OS === "web"');
      expect(content).toContain("await fetch(uri)");
      expect(content).toContain("await response.blob()");
    });

    it("should NOT set Content-Type header manually on FormData upload", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      // The uploadPhotoFile function should not set Content-Type
      const uploadFn = content.substring(
        content.indexOf("const uploadPhotoFile"),
        content.indexOf("const handleSubmit")
      );
      expect(uploadFn).not.toContain('"Content-Type"');
      expect(uploadFn).toContain("// Do NOT set Content-Type");
    });
  });

  describe("Photo permissions requested on mount", () => {
    it("should request both camera and media library permissions", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      expect(content).toContain("requestMediaLibraryPermissionsAsync");
      expect(content).toContain("requestCameraPermissionsAsync");
    });

    it("should handle Android pending result recovery", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      expect(content).toContain("getPendingResultAsync");
      expect(content).toContain("AppState.addEventListener");
    });
  });

  describe("Photo state management", () => {
    it("should store only URIs (no base64)", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      // State should be { uri: string }[] not { uri, base64 }
      expect(content).toContain("useState<{ uri: string }[]>([])");
    });

    it("should limit photos to 10", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      expect(content).toContain(".slice(0, 10)");
    });

    it("should show upload progress during submission", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("app/(tabs)/reports.tsx", "utf-8");
      expect(content).toContain("uploadProgress");
      expect(content).toContain("Uploading photo");
    });
  });
});
