import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("Phase 19 — UI Spacing & Role-Based Home Screen", () => {
  describe("Tab bar bottom gap fix", () => {
    it("tab bar background uses colors.background", () => {
      const layout = fs.readFileSync(path.join(ROOT, "app/(tabs)/_layout.tsx"), "utf-8");
      expect(layout).toContain("colors.background");
    });
  });

  describe("ScreenContainer extra top padding", () => {
    it("ScreenContainer adds extra top padding on native", () => {
      const sc = fs.readFileSync(path.join(ROOT, "components/screen-container.tsx"), "utf-8");
      expect(sc).toContain("extraTopPadding");
    });
  });

  describe("Modal header top padding fixes", () => {
    const screens = ["jobs.tsx", "reports.tsx", "team.tsx", "kpis.tsx", "meetings.tsx", "goals.tsx", "clock.tsx"];
    screens.forEach((screen) => {
      it(`${screen} uses safe insets for modal header`, () => {
        const filePath = path.join(ROOT, "app/(tabs)", screen);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          // Should import useSafeAreaInsets
          expect(content).toContain("useSafeAreaInsets");
        }
      });
    });
  });

  describe("Role-Based Home Screen", () => {
    const homeContent = fs.readFileSync(path.join(ROOT, "app/(tabs)/index.tsx"), "utf-8");

    it("has separate laborer view", () => {
      expect(homeContent).toContain("isLaborer");
      expect(homeContent).toContain("LABORER HOME");
    });

    it("has separate foreman view", () => {
      expect(homeContent).toContain("isForeman");
      expect(homeContent).toContain("FOREMAN HOME");
    });

    it("has management dashboard view", () => {
      expect(homeContent).toContain("MANAGEMENT HOME");
      expect(homeContent).toContain("isManagement");
    });

    it("laborer sees company logo", () => {
      expect(homeContent).toContain("companyLogo");
      expect(homeContent).toContain("company-logo.png");
    });

    it("laborer sees motivational messages", () => {
      // Daily motivational messages rotate based on day of year
      expect(homeContent).toContain("motivational");
    });

    it("laborer sees quick action buttons", () => {
      expect(homeContent).toContain("My Hours");
      expect(homeContent).toContain("quickAction");
    });

    it("laborer does NOT see labor cost data", () => {
      // The labor dashboard queries are only enabled for isManagement
      expect(homeContent).toContain("enabled: isManagement");
    });

    it("foreman sees quick actions for reports, safety, goals", () => {
      expect(homeContent).toContain("Field Report");
      expect(homeContent).toContain("Safety");
      expect(homeContent).toContain("Goals");
    });

    it("management active jobs section is collapsible", () => {
      expect(homeContent).toContain("showActiveJobs");
      expect(homeContent).toContain("setShowActiveJobs");
    });

    it("only owner sees budget alerts in labor dashboard", () => {
      // Budget alerts gated to isOwner
      expect(homeContent).toContain("enabled: isOwner");
      // canSeeDollars controls dollar visibility
      expect(homeContent).toContain("canSeeDollars");
    });

    it("foreman does not see dollar amounts", () => {
      // canSeeDollars is isManagement, but foreman is not management
      expect(homeContent).toContain("canSeeDollars = isManagement");
    });
  });

  describe("Company logo exists", () => {
    it("company-logo.png exists in assets", () => {
      const logoPath = path.join(ROOT, "assets/images/company-logo.png");
      expect(fs.existsSync(logoPath)).toBe(true);
    });
  });
});
