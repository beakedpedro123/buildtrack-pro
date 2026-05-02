import PDFDocument from "pdfkit";
import { getCompanyBranding } from "./pdf-branding";
import * as db from "./db";
import { employees } from "../drizzle/schema";
import { type InferSelectModel } from "drizzle-orm";
import path from "path";
import fs from "fs";

type Employee = InferSelectModel<typeof employees>;

// ─── Helpers ──────────────────────────────────────────────────────────────
const TZ = "America/Denver";

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: TZ,
  });
}

function fmtShortDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: TZ,
  });
}

function fmtMoney(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

// ─── Logo loader ────────────────────────────────────────────────────────
let logoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (logoBuffer) return logoBuffer;
  try {
    const logoPath = path.join(__dirname, "logo.png");
    if (fs.existsSync(logoPath)) { logoBuffer = fs.readFileSync(logoPath); return logoBuffer; }
    const altPath = path.join(__dirname, "..", "assets", "images", "icon.png");
    if (fs.existsSync(altPath)) { logoBuffer = fs.readFileSync(altPath); return logoBuffer; }
  } catch {}
  return null;
}

// ─── Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  gold: "#C9A84C",
  darkBg: "#1A1A2E",
  headerBg: "#2A2A3E",
  sectionBg: "#F8F9FA",
  text: "#1A1A2E",
  muted: "#6B7280",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  border: "#E5E7EB",
  white: "#FFFFFF",
};

// ─── Section drawing helpers ─────────────────────────────────────────────
function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number, accentColor: string = COLORS.gold): number {
  doc.save();
  doc.rect(40, y, doc.page.width - 80, 28).fill(COLORS.darkBg);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(accentColor);
  doc.text(title.toUpperCase(), 52, y + 8, { width: doc.page.width - 104 });
  doc.restore();
  return y + 36;
}

function drawTableRow(doc: PDFKit.PDFDocument, cols: { text: string; x: number; width: number; align?: "left" | "right" | "center"; bold?: boolean }[], y: number, bg?: string): number {
  if (bg) {
    doc.save();
    doc.rect(40, y - 2, doc.page.width - 80, 18).fill(bg);
    doc.restore();
  }
  for (const col of cols) {
    doc.font(col.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(COLORS.text);
    doc.text(col.text, col.x, y, { width: col.width, align: col.align || "left" });
  }
  return y + 18;
}

function checkPageBreak(doc: PDFKit.PDFDocument, y: number, needed: number = 80): number {
  if (y + needed > doc.page.height - 60) {
    doc.addPage();
    return 40;
  }
  return y;
}

// ─── Main Generator ─────────────────────────────────────────────────────
export async function generateJobCompletionPDF(jobId: number, companyId?: number): Promise<Buffer> {
  // Fetch all data
  const job = await db.getJobById(jobId);
  if (!job) throw new Error(`Job #${jobId} not found`);
  // Fetch company branding for PDF theming
  const branding = await getCompanyBranding(companyId);
  // Override gold color with company brand color
  const brandGold = branding.brandColor;

  const reports = await db.getDailyReportsForJob(jobId);
  const budgetCategories = await db.getBudgetCategoriesForJob(jobId);
  const expenses = await db.getExpensesForJob(jobId);
  const materials = await db.getMaterialsForJob(jobId);
  const photos = await db.getPhotosForJob(jobId);
  const safetyMeetings = await db.getSafetyMeetingsForJob(jobId);
  const changeOrders = await db.getChangeOrdersForJob(jobId);
  const assignments = await db.getJobAssignments(jobId);

  // Get employee names
  const allEmployees: Employee[] = await db.getAllEmployees(companyId);
  const empMap = new Map(allEmployees.map((e: Employee) => [e.id, e]));
  const getEmpName = (id: number) => empMap.get(id)?.name || `Employee #${id}`;

  // Get clock entries for labor summary
  const clockEntries = await db.getClockEntriesForJob(jobId);

  // Calculate totals
  const totalBudgeted = budgetCategories.reduce((sum, c) => sum + parseFloat(c.budgetedAmount || "0"), 0);
  const totalSpent = budgetCategories.reduce((sum, c) => sum + parseFloat(c.spentAmount || "0"), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);
  const totalMaterialsCost = materials.reduce((sum, m) => sum + parseFloat(m.totalCost || "0"), 0);
  const totalLaborMinutes = clockEntries.reduce((sum: number, e: any) => sum + (e.durationMinutes || 0), 0);
  const changeOrderTotal = changeOrders.reduce((sum, co) => sum + parseFloat(co.amount || "0"), 0);

  // Create PDF
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = doc.page.width - 80; // usable width
  let y = 40;

  // ═══════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════
  // Dark header banner
  doc.rect(0, 0, doc.page.width, 200).fill(COLORS.darkBg);

  // Logo
  const logo = branding.logoBuffer || getLogoBuffer();
  if (logo) {
    try { doc.image(logo, 40, 30, { width: 50 }); } catch {}
  }

  // Title
  doc.font("Helvetica-Bold").fontSize(28).fillColor(brandGold);
  doc.text("JOB COMPLETION", 100, 40, { width: pageWidth - 60 });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.white);
  doc.text("REPORT", 100, 72, { width: pageWidth - 60 });

  // Job name
  doc.font("Helvetica-Bold").fontSize(20).fillColor(brandGold);
  doc.text(job.name, 40, 120, { width: pageWidth });

  // Status badge
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.success);
  doc.text(`STATUS: ${(job.status || "completed").toUpperCase()}`, 40, 155, { width: pageWidth });

  y = 220;

  // Job details grid
  const details = [
    ["Client", job.clientName || "N/A"],
    ["Address", job.address || "N/A"],
    ["Start Date", job.startDate ? fmtShortDate(job.startDate) : "N/A"],
    ["End Date", job.endDate ? fmtShortDate(job.endDate) : "N/A"],
    ["Billing Type", (job.billingType || "fixed").charAt(0).toUpperCase() + (job.billingType || "fixed").slice(1)],
    ["Total Budget", fmtMoney(job.totalBudget || "0")],
    ["Total Reports", `${reports.length}`],
    ["Safety Meetings", `${safetyMeetings.length}`],
    ["Change Orders", `${changeOrders.length}`],
    ["Total Labor Hours", fmtHours(totalLaborMinutes)],
  ];

  y = drawSectionHeader(doc, "Job Overview", y, brandGold);

  for (let i = 0; i < details.length; i += 2) {
    y = checkPageBreak(doc, y);
    const bg = i % 4 === 0 ? COLORS.sectionBg : undefined;
    const row1 = details[i];
    const row2 = details[i + 1];
    if (bg) {
      doc.save();
      doc.rect(40, y - 2, pageWidth, 18).fill(bg);
      doc.restore();
    }
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.muted);
    doc.text(row1[0] + ":", 52, y, { width: 120 });
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.text);
    doc.text(row1[1], 170, y, { width: 150 });
    if (row2) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.muted);
      doc.text(row2[0] + ":", 340, y, { width: 120 });
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.text);
      doc.text(row2[1], 450, y, { width: 150 });
    }
    y += 20;
  }

  // Crew assignments
  if (assignments.length > 0) {
    y += 10;
    y = checkPageBreak(doc, y, 60);
    y = drawSectionHeader(doc, "Crew Assignments", y, brandGold);
    for (const a of assignments) {
      y = checkPageBreak(doc, y);
      const emp = empMap.get(a.employeeId);
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.text);
      doc.text(`• ${emp?.name || `#${a.employeeId}`}`, 52, y, { width: 200 });
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
      doc.text((a.role || "laborer").charAt(0).toUpperCase() + (a.role || "laborer").slice(1), 260, y, { width: 100 });
      y += 16;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BUDGET SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = 40;
  y = drawSectionHeader(doc, "Budget Summary", y, brandGold);

  // Budget categories table
  const budgetCols = [
    { text: "Category", x: 52, width: 180, bold: true },
    { text: "Budgeted", x: 240, width: 100, align: "right" as const, bold: true },
    { text: "Spent", x: 350, width: 100, align: "right" as const, bold: true },
    { text: "Variance", x: 460, width: 80, align: "right" as const, bold: true },
  ];
  y = drawTableRow(doc, budgetCols, y, COLORS.headerBg);
  // Fix header text color
  doc.save();
  doc.rect(40, y - 20, pageWidth, 18).fill(COLORS.headerBg);
  doc.restore();
  y -= 18;
  for (const col of budgetCols) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);
    doc.text(col.text, col.x, y, { width: col.width, align: col.align || "left" });
  }
  y += 20;

  for (let i = 0; i < budgetCategories.length; i++) {
    y = checkPageBreak(doc, y);
    const cat = budgetCategories[i];
    const budgeted = parseFloat(cat.budgetedAmount || "0");
    const spent = parseFloat(cat.spentAmount || "0");
    const variance = budgeted - spent;
    const bg = i % 2 === 0 ? COLORS.sectionBg : undefined;
    y = drawTableRow(doc, [
      { text: cat.name, x: 52, width: 180 },
      { text: fmtMoney(budgeted), x: 240, width: 100, align: "right" },
      { text: fmtMoney(spent), x: 350, width: 100, align: "right" },
      { text: (variance >= 0 ? "+" : "") + fmtMoney(variance), x: 460, width: 80, align: "right" },
    ], y, bg);
  }

  // Budget totals
  y += 4;
  doc.save();
  doc.rect(40, y - 2, pageWidth, 22).fill(COLORS.darkBg);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(brandGold);
  doc.text("TOTAL", 52, y + 2, { width: 180 });
  doc.text(fmtMoney(totalBudgeted), 240, y + 2, { width: 100, align: "right" });
  doc.text(fmtMoney(totalSpent), 350, y + 2, { width: 100, align: "right" });
  const totalVariance = totalBudgeted - totalSpent;
  doc.fillColor(totalVariance >= 0 ? COLORS.success : COLORS.error);
  doc.text((totalVariance >= 0 ? "+" : "") + fmtMoney(totalVariance), 460, y + 2, { width: 80, align: "right" });
  y += 30;

  // ═══════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════════════════
  if (expenses.length > 0) {
    y += 10;
    y = checkPageBreak(doc, y, 60);
    y = drawSectionHeader(doc, `Expenses (${expenses.length})`, y);

    // Header
    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.headerBg);
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);
    doc.text("Date", 52, y, { width: 80 });
    doc.text("Description", 140, y, { width: 200 });
    doc.text("Amount", 460, y, { width: 80, align: "right" });
    y += 20;

    for (let i = 0; i < expenses.length; i++) {
      y = checkPageBreak(doc, y);
      const e = expenses[i];
      const bg = i % 2 === 0 ? COLORS.sectionBg : undefined;
      if (bg) { doc.save(); doc.rect(40, y - 2, pageWidth, 16).fill(bg); doc.restore(); }
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
      doc.text(fmtShortDate(e.expenseDate), 52, y, { width: 80 });
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
      doc.text(e.description || "", 140, y, { width: 200 });
      doc.text(fmtMoney(e.amount), 460, y, { width: 80, align: "right" });
      y += 16;
    }

    // Expense total
    y += 2;
    doc.save(); doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg); doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandGold);
    doc.text("TOTAL EXPENSES", 52, y, { width: 200 });
    doc.text(fmtMoney(totalExpenses), 460, y, { width: 80, align: "right" });
    y += 24;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MATERIALS
  // ═══════════════════════════════════════════════════════════════════════
  if (materials.length > 0) {
    y += 10;
    y = checkPageBreak(doc, y, 60);
    y = drawSectionHeader(doc, `Materials Used (${materials.length})`, y);

    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.headerBg);
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);
    doc.text("Material", 52, y, { width: 160 });
    doc.text("Qty", 220, y, { width: 60, align: "right" });
    doc.text("Unit", 290, y, { width: 50 });
    doc.text("Unit Cost", 350, y, { width: 70, align: "right" });
    doc.text("Total", 460, y, { width: 80, align: "right" });
    y += 20;

    for (let i = 0; i < materials.length; i++) {
      y = checkPageBreak(doc, y);
      const m = materials[i];
      const bg = i % 2 === 0 ? COLORS.sectionBg : undefined;
      if (bg) { doc.save(); doc.rect(40, y - 2, pageWidth, 16).fill(bg); doc.restore(); }
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
      doc.text(m.materialName || "", 52, y, { width: 160 });
      doc.text(m.quantity || "", 220, y, { width: 60, align: "right" });
      doc.text(m.unit || "", 290, y, { width: 50 });
      doc.text(m.unitCost ? fmtMoney(m.unitCost) : "-", 350, y, { width: 70, align: "right" });
      doc.text(m.totalCost ? fmtMoney(m.totalCost) : "-", 460, y, { width: 80, align: "right" });
      y += 16;
    }

    y += 2;
    doc.save(); doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg); doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandGold);
    doc.text("TOTAL MATERIALS COST", 52, y, { width: 200 });
    doc.text(fmtMoney(totalMaterialsCost), 460, y, { width: 80, align: "right" });
    y += 24;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHANGE ORDERS
  // ═══════════════════════════════════════════════════════════════════════
  if (changeOrders.length > 0) {
    y += 10;
    y = checkPageBreak(doc, y, 60);
    y = drawSectionHeader(doc, `Change Orders (${changeOrders.length})`, y);

    for (let i = 0; i < changeOrders.length; i++) {
      y = checkPageBreak(doc, y, 50);
      const co = changeOrders[i];
      const bg = i % 2 === 0 ? COLORS.sectionBg : undefined;
      if (bg) { doc.save(); doc.rect(40, y - 2, pageWidth, 40).fill(bg); doc.restore(); }

      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text);
      doc.text(`CO #${i + 1}: ${co.description || "No description"}`, 52, y, { width: 300 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(co.status === "approved" ? COLORS.success : co.status === "rejected" ? COLORS.error : COLORS.warning);
      doc.text((co.status || "pending").toUpperCase(), 360, y, { width: 80 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text);
      doc.text(fmtMoney(co.amount || "0"), 460, y, { width: 80, align: "right" });
      y += 16;
      if (co.notes) {
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
        doc.text(`Notes: ${co.notes}`, 52, y, { width: 400 });
        y += 14;
      }
      y += 10;
    }

    // Change order total
    doc.save(); doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg); doc.restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandGold);
    doc.text("TOTAL CHANGE ORDERS", 52, y, { width: 200 });
    doc.text(fmtMoney(changeOrderTotal), 460, y, { width: 80, align: "right" });
    y += 24;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY FIELD REPORTS
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = 40;
  y = drawSectionHeader(doc, `Daily Field Reports (${reports.length})`, y);

  if (reports.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted);
    doc.text("No daily reports were submitted for this job.", 52, y);
    y += 20;
  } else {
    for (let i = 0; i < reports.length; i++) {
      y = checkPageBreak(doc, y, 80);
      const r = reports[i];

      // Report header bar
      doc.save();
      doc.rect(40, y, pageWidth, 22).fill(COLORS.headerBg);
      doc.restore();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(brandGold);
      doc.text(fmtDate(r.reportDate), 52, y + 5, { width: 200 });
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.white);
      doc.text(`Crew: ${r.crewCount || 0}`, 300, y + 6, { width: 80 });
      if (r.weatherCondition) {
        doc.text(`Weather: ${r.weatherCondition}`, 390, y + 6, { width: 150 });
      }
      if (r.seenByOwner) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.success);
        doc.text("✓ REVIEWED", 500, y + 6, { width: 60, align: "right" });
      }
      y += 28;

      // Submitted by
      const submitter = empMap.get(r.submittedBy);
      if (submitter) {
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
        doc.text(`Submitted by: ${submitter.name}`, 52, y, { width: 200 });
        y += 14;
      }

      // Work completed
      let workItems: string[] = [];
      try { workItems = JSON.parse(r.workCompleted || "[]"); } catch { if (r.workCompleted) workItems = [r.workCompleted]; }
      if (workItems.length > 0) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
        doc.text("Work Completed:", 52, y, { width: 200 });
        y += 12;
        for (const w of workItems) {
          y = checkPageBreak(doc, y);
          doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
          doc.text(`  • ${w}`, 60, y, { width: pageWidth - 40 });
          y += 12;
        }
      }

      // Notes
      if (r.notes) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
        doc.text("Notes:", 52, y, { width: 200 });
        y += 12;
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
        doc.text(r.notes, 60, y, { width: pageWidth - 40 });
        y += doc.heightOfString(r.notes, { width: pageWidth - 40 }) + 4;
      }

      // Review status
      if (r.seenByOwner && r.seenAt) {
        doc.font("Helvetica").fontSize(7).fillColor(COLORS.success);
        doc.text(`Reviewed: ${fmtDate(r.seenAt)}`, 52, y, { width: 200 });
        y += 12;
      }

      y += 8;
      // Divider
      doc.save();
      doc.moveTo(52, y).lineTo(doc.page.width - 52, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.restore();
      y += 8;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAFETY MEETINGS
  // ═══════════════════════════════════════════════════════════════════════
  if (safetyMeetings.length > 0) {
    doc.addPage();
    y = 40;
    y = drawSectionHeader(doc, `Safety Meetings (${safetyMeetings.length})`, y);

    for (let i = 0; i < safetyMeetings.length; i++) {
      y = checkPageBreak(doc, y, 60);
      const sm = safetyMeetings[i];

      doc.save();
      doc.rect(40, y, pageWidth, 20).fill(i % 2 === 0 ? COLORS.sectionBg : COLORS.white);
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text);
      doc.text(sm.title || "Safety Meeting", 52, y + 4, { width: 250 });
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
      doc.text(sm.conductedAt ? fmtDate(sm.conductedAt) : "N/A", 310, y + 4, { width: 100 });
      doc.text(`Conducted by: ${getEmpName(sm.conductedBy)}`, 420, y + 4, { width: 150 });
      y += 24;

      // Attendees
      if (sm.attendees) {
        let attendeeIds: number[] = [];
        try { attendeeIds = JSON.parse(sm.attendees); } catch {}
        if (attendeeIds.length > 0) {
          doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
          const names = attendeeIds.map(id => getEmpName(id)).join(", ");
          doc.text(`Attendees: ${names}`, 52, y, { width: pageWidth - 24 });
          y += doc.heightOfString(`Attendees: ${names}`, { width: pageWidth - 24 }) + 6;
        }
      }

      if (sm.notes) {
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
        doc.text(sm.notes, 52, y, { width: pageWidth - 24 });
        y += doc.heightOfString(sm.notes, { width: pageWidth - 24 }) + 6;
      }

      y += 6;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY PAGE
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = 40;

  // Dark summary header
  doc.rect(0, 0, doc.page.width, 100).fill(COLORS.darkBg);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(brandGold);
  doc.text("FINANCIAL SUMMARY", 40, 30, { width: pageWidth });
  doc.font("Helvetica").fontSize(12).fillColor(COLORS.white);
  doc.text(job.name, 40, 58, { width: pageWidth });

  y = 120;

  // Summary boxes
  const summaryItems = [
    { label: "Total Budget", value: fmtMoney(job.totalBudget || "0"), color: COLORS.text },
    { label: "Budget Categories Spent", value: fmtMoney(totalSpent), color: COLORS.text },
    { label: "Total Expenses", value: fmtMoney(totalExpenses), color: COLORS.text },
    { label: "Total Materials", value: fmtMoney(totalMaterialsCost), color: COLORS.text },
    { label: "Change Orders", value: fmtMoney(changeOrderTotal), color: changeOrderTotal > 0 ? COLORS.warning : COLORS.text },
    { label: "Budget Variance", value: (totalVariance >= 0 ? "+" : "") + fmtMoney(totalVariance), color: totalVariance >= 0 ? COLORS.success : COLORS.error },
    { label: "Total Labor Hours", value: fmtHours(totalLaborMinutes) + " hrs", color: COLORS.text },
    { label: "Daily Reports Filed", value: `${reports.length}`, color: COLORS.text },
    { label: "Safety Meetings Held", value: `${safetyMeetings.length}`, color: COLORS.text },
    { label: "Photos Documented", value: `${photos.length}`, color: COLORS.text },
  ];

  const boxWidth = (pageWidth - 20) / 2;
  for (let i = 0; i < summaryItems.length; i += 2) {
    y = checkPageBreak(doc, y, 50);
    for (let j = 0; j < 2 && i + j < summaryItems.length; j++) {
      const item = summaryItems[i + j];
      const x = 40 + j * (boxWidth + 20);

      doc.save();
      doc.rect(x, y, boxWidth, 42).fill(COLORS.sectionBg);
      doc.restore();

      doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
      doc.text(item.label, x + 12, y + 8, { width: boxWidth - 24 });
      doc.font("Helvetica-Bold").fontSize(14).fillColor(item.color);
      doc.text(item.value, x + 12, y + 22, { width: boxWidth - 24 });
    }
    y += 52;
  }

  // Footer
  y += 20;
  y = checkPageBreak(doc, y, 40);
  doc.save();
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.restore();
  y += 10;
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  doc.text(`Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TZ })}`, 40, y, { width: pageWidth });
  doc.text("BuildTrack Pro — Job Completion Report", 40, y + 12, { width: pageWidth, align: "center" });

  // Add page numbers
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    doc.text(`Page ${i + 1} of ${totalPages}`, 40, doc.page.height - 30, { width: pageWidth, align: "right" });
  }

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
