import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Phase 10 — QuickBooks Removal & PDF Reports", () => {
  const jobsPath = path.join(__dirname, "..", "app", "(tabs)", "jobs.tsx");
  const jobsContent = fs.readFileSync(jobsPath, "utf-8");

  it("should not contain any QuickBooks references in jobs.tsx", () => {
    expect(jobsContent).not.toContain("QuickBooks");
    expect(jobsContent).not.toContain("syncToQB");
    expect(jobsContent).not.toContain("qbEstimate");
    expect(jobsContent).not.toContain("QB Synced");
  });

  it("should not contain an Estimates tab in jobs.tsx", () => {
    // The availableTabs should not include "estimates"
    expect(jobsContent).not.toContain('"estimates"');
    expect(jobsContent).not.toContain("'estimates'");
  });

  it("should import expo-print for PDF generation", () => {
    expect(jobsContent).toContain("expo-print");
  });

  it("should import expo-sharing for sharing PDFs", () => {
    expect(jobsContent).toContain("expo-sharing");
  });

  it("should have a budget PDF generation function", () => {
    expect(jobsContent).toContain("handleGenerateBudgetPdf");
    expect(jobsContent).toContain("printToFileAsync");
    expect(jobsContent).toContain("shareAsync");
  });

  it("should have a field reports PDF generation function", () => {
    expect(jobsContent).toContain("handleGenerateReportsPdf");
  });

  it("should have PDF report buttons in the UI", () => {
    expect(jobsContent).toContain("Generate Budget Report PDF");
    expect(jobsContent).toContain("Generate Field Reports PDF");
    expect(jobsContent).toContain("Export PDF");
  });

  it("should only have overview, budget, reports, and photos tabs", () => {
    // Check the availableTabs definition
    expect(jobsContent).toContain('"overview"');
    expect(jobsContent).toContain('"budget"');
    expect(jobsContent).toContain('"reports"');
    expect(jobsContent).toContain('"photos"');
  });

  it("should not have QuickBooks references in any frontend tsx files", () => {
    const appDir = path.join(__dirname, "..", "app");
    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain("QuickBooks");
          expect(content).not.toContain("syncToQB");
        }
      }
    }
    checkDir(appDir);
  });
});
