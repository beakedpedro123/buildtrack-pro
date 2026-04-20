import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

describe("Phase 28 Fixes", () => {
  const projectRoot = path.resolve(__dirname, "..");

  describe("Server ESM __dirname fix", () => {
    it("server index.ts uses import.meta.url instead of raw __dirname", () => {
      const serverIndex = fs.readFileSync(
        path.join(projectRoot, "server/_core/index.ts"),
        "utf-8"
      );
      // Must use import.meta.url for ESM compatibility
      expect(serverIndex).toContain("import.meta.url");
      expect(serverIndex).toContain("fileURLToPath");
      // Must derive __dirname from import.meta.url
      expect(serverIndex).toContain(
        "const __dirname = path.dirname(__filename)"
      );
    });

    it("esbuild output contains import.meta.url (not raw __dirname)", () => {
      const distPath = path.join(projectRoot, "dist/index.js");
      if (fs.existsSync(distPath)) {
        const dist = fs.readFileSync(distPath, "utf-8");
        expect(dist).toContain("import.meta.url");
        expect(dist).toContain("fileURLToPath");
      }
    });
  });

  describe("Metro blockList excludes public/", () => {
    it("metro.config.js references public directory in blockList", () => {
      const metroConfig = fs.readFileSync(
        path.join(projectRoot, "metro.config.js"),
        "utf-8"
      );
      expect(metroConfig).toContain("public");
      expect(metroConfig).toContain("blockList");
    });
  });

  describe("PivotChat mobile fixes", () => {
    it("does NOT auto-send greeting on open", () => {
      const pivotChat = fs.readFileSync(
        path.join(projectRoot, "components/pivot-chat.tsx"),
        "utf-8"
      );
      // Should NOT contain autoGreet function
      expect(pivotChat).not.toContain("autoGreet");
      // Should NOT auto-send "Hey Pivot" on open
      expect(pivotChat).not.toMatch(
        /useEffect.*open.*messages\.length === 0.*autoGreet/s
      );
    });

    it("uses FlatList instead of ScrollView for messages", () => {
      const pivotChat = fs.readFileSync(
        path.join(projectRoot, "components/pivot-chat.tsx"),
        "utf-8"
      );
      expect(pivotChat).toContain("FlatList");
      expect(pivotChat).toContain("flatListRef");
      // Should not use ScrollView for messages
      expect(pivotChat).not.toMatch(
        /ScrollView[\s\S]*ref={scrollRef}[\s\S]*messages\.map/
      );
    });

    it("has KeyboardAvoidingView wrapping the chat panel", () => {
      const pivotChat = fs.readFileSync(
        path.join(projectRoot, "components/pivot-chat.tsx"),
        "utf-8"
      );
      expect(pivotChat).toContain("KeyboardAvoidingView");
    });

    it("has a modern PivotAvatar component (not emoji)", () => {
      const pivotChat = fs.readFileSync(
        path.join(projectRoot, "components/pivot-chat.tsx"),
        "utf-8"
      );
      expect(pivotChat).toContain("PivotAvatar");
      // Should have the robot avatar image
      expect(pivotChat).toContain("pivot-icon");
    });

    it("messages have unique id field for FlatList keyExtractor", () => {
      const pivotChat = fs.readFileSync(
        path.join(projectRoot, "components/pivot-chat.tsx"),
        "utf-8"
      );
      expect(pivotChat).toContain("keyExtractor");
      expect(pivotChat).toContain("nextMsgId");
    });
  });
});
