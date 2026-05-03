import PDFDocument from "pdfkit";
import { getCompanyBranding } from "./pdf-branding";
import * as db from "./db";
import { employees } from "../drizzle/schema";
import { type InferSelectModel } from "drizzle-orm";

type Employee = InferSelectModel<typeof employees>;

const TZ = "America/Denver";
function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
}
function fmtDay(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
}
function fmtMoney(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

const COLORS = {
  darkBg: "#1A1A2E",
  sectionBg: "#F8F9FA",
  text: "#1A1A2E",
  muted: "#6B7280",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  border: "#E5E7EB",
  white: "#FFFFFF",
};

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number, accentColor: string, pageWidth: number): number {
  if (y > 680) { doc.addPage(); y = 50; }
  doc.save();
  doc.rect(40, y, pageWidth, 26).fill(COLORS.darkBg);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(accentColor);
  doc.text(title.toUpperCase(), 52, y + 7, { width: pageWidth - 24 });
  doc.restore();
  return y + 34;
}

function checkPageBreak(doc: PDFKit.PDFDocument, y: number, needed: number = 60): number {
  if (y + needed > 720) { doc.addPage(); return 50; }
  return y;
}

export async function generateFieldReportsPDF(jobId: number, companyId?: number): Promise<Buffer> {
  const job = await db.getJobById(jobId);
  if (!job) throw new Error(`Job #${jobId} not found`);

  const branding = await getCompanyBranding(companyId);
  const brandGold = branding.brandColor;

  const reports = await db.getDailyReportsForJob(jobId);
  const photos = await db.getPhotosForJob(jobId);
  const clockEntries = await db.getClockEntriesForJob(jobId);
  const safetyMeetings = await db.getSafetyMeetingsForJob(jobId);
  const allEmployees: Employee[] = await db.getAllEmployees(companyId);
  const empMap = new Map(allEmployees.map((e: Employee) => [e.id, e]));
  const getEmpName = (id: number) => empMap.get(id)?.name || `Employee #${id}`;

  // Load company lunch settings for auto-deduction (consistent with getLaborCostForJob)
  let companyLunchSettings: { lunchAutoDeduct: boolean; lunchDeductMinutes: number; lunchMinShiftMinutes: number; lunchSkipDays: string | null } | null = null;
  if (companyId) {
    const company = await db.getCompanyById(companyId);
    if (company) {
      companyLunchSettings = {
        lunchAutoDeduct: company.lunchAutoDeduct,
        lunchDeductMinutes: company.lunchDeductMinutes,
        lunchMinShiftMinutes: company.lunchMinShiftMinutes,
        lunchSkipDays: company.lunchSkipDays,
      };
    }
  }

  // Helper: apply lunch deduction per-entry (matches deductLunch in db.ts)
  function applyLunchDeduction(rawMins: number, entryLunch: number, clockInDate: Date): number {
    if (entryLunch > 0) return Math.max(0, rawMins - entryLunch);
    if (companyLunchSettings?.lunchAutoDeduct && rawMins >= (companyLunchSettings.lunchMinShiftMinutes || 360)) {
      const skipDays = companyLunchSettings.lunchSkipDays ? companyLunchSettings.lunchSkipDays.split(",").map(Number) : [5];
      const dow = clockInDate.getDay();
      if (!skipDays.includes(dow)) {
        return Math.max(0, rawMins - (companyLunchSettings.lunchDeductMinutes || 30));
      }
    }
    return rawMins;
  }

  // Labor by day
  const dailyLabor = new Map<string, { totalMinutes: number; workers: Set<number>; cost: number }>();
  for (const entry of clockEntries) {
    if (!entry.clockOut) continue;
    const rawMins = Math.max(0, Math.round((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
    const entryLunch = (entry as any).lunchMinutes || 0;
    const netMins = applyLunchDeduction(rawMins, entryLunch, new Date(entry.clockIn));
    const emp = empMap.get(entry.employeeId);
    const rate = emp?.hourlyRate ? parseFloat(emp.hourlyRate) : 0;
    const cost = (netMins / 60) * rate;
    const dayKey = new Date(entry.clockIn).toLocaleDateString("en-US", { timeZone: TZ });
    if (!dailyLabor.has(dayKey)) dailyLabor.set(dayKey, { totalMinutes: 0, workers: new Set(), cost: 0 });
    const dl = dailyLabor.get(dayKey)!;
    dl.totalMinutes += netMins;
    dl.workers.add(entry.employeeId);
    dl.cost += cost;
  }

  const totalLaborMinutes = clockEntries.reduce((sum, e) => {
    if (!e.clockOut) return sum;
    const rawMins = Math.max(0, Math.round((new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000));
    return sum + applyLunchDeduction(rawMins, (e as any).lunchMinutes || 0, new Date(e.clockIn));
  }, 0);

  const sortedReports = [...reports].sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());

  // Create PDF
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const pageWidth = doc.page.width - 80;
  let y = 40;

  // ═══════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════
  doc.rect(0, 0, doc.page.width, 100).fill(COLORS.darkBg);
  const logo = branding.logoBuffer;
  let textX = 40;
  if (logo) {
    try { doc.image(logo, 16, 12, { width: 70, height: 70 }); textX = 94; } catch {}
  }
  doc.font("Helvetica-Bold").fontSize(22).fillColor(brandGold);
  doc.text("FIELD REPORTS", textX, 18, { width: pageWidth - (textX - 40) });
  doc.font("Helvetica").fontSize(12).fillColor(COLORS.white);
  doc.text(job.name, textX, 46, { width: pageWidth - (textX - 40) });
  const subtitle = [(job as any).clientName, (job as any).address].filter(Boolean).join(" · ");
  if (subtitle) {
    doc.fontSize(9).fillColor("#AAAAAA").text(subtitle, textX, 64, { width: pageWidth - (textX - 40) });
  }
  doc.fontSize(8).fillColor("#888888").text(`Generated ${fmtDate(new Date())}`, textX, 80, { width: pageWidth - (textX - 40) });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(brandGold);
  doc.text(branding.companyName, 40, 88, { width: pageWidth, align: "right" });
  y = 115;

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY STATS
  // ═══════════════════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Summary", y, brandGold, pageWidth);
  const boxW = (pageWidth - 30) / 4;
  const summaryBoxes = [
    { label: "Daily Reports", value: `${reports.length}` },
    { label: "Photos Taken", value: `${photos.length}` },
    { label: "Total Hours", value: `${fmtHours(totalLaborMinutes)}h` },
    { label: "Safety Meetings", value: `${safetyMeetings.length}` },
  ];
  for (let i = 0; i < summaryBoxes.length; i++) {
    const bx = 40 + i * (boxW + 10);
    doc.save();
    doc.rect(bx, y, boxW, 42).fill(COLORS.sectionBg);
    doc.rect(bx, y, boxW, 3).fill(brandGold);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.text);
    doc.text(summaryBoxes[i].value, bx + 8, y + 10, { width: boxW - 16, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    doc.text(summaryBoxes[i].label, bx + 8, y + 32, { width: boxW - 16, align: "center" });
    doc.restore();
  }
  y += 52;

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY REPORTS (detailed)
  // ═══════════════════════════════════════════════════════════════════════
  if (sortedReports.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Daily Reports (${sortedReports.length})`, y, brandGold, pageWidth);

    for (const report of sortedReports) {
      y = checkPageBreak(doc, y, 100);

      // Date header bar
      const dateStr = fmtDay(report.reportDate);
      doc.save();
      doc.rect(40, y, pageWidth, 20).fill("#EAEAEA");
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.text);
      doc.text(dateStr, 52, y + 4, { width: 200 });

      // Weather and crew on right
      const weatherStr = [
        report.weatherCondition ? `Weather: ${report.weatherCondition}` : null,
        `Crew: ${report.crewCount}`,
      ].filter(Boolean).join(" · ");
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
      doc.text(weatherStr, 200, y + 5, { width: pageWidth - 170, align: "right" });
      doc.restore();
      y += 24;

      // Work completed
      let workItems: string[] = [];
      try { workItems = JSON.parse(report.workCompleted || "[]"); } catch {}
      if (workItems.length > 0) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
        doc.text("Work Completed:", 52, y, { width: 120 });
        y += 12;
        for (const item of workItems) {
          y = checkPageBreak(doc, y, 14);
          doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
          doc.text(`• ${item}`, 60, y, { width: pageWidth - 30 });
          y += 12;
        }
      }

      // Notes
      if (report.notes) {
        y = checkPageBreak(doc, y, 20);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
        doc.text("Notes:", 52, y, { width: 60 });
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
        doc.text(report.notes, 100, y, { width: pageWidth - 70 });
        y += Math.max(14, Math.ceil(report.notes.length / 80) * 12);
      }

      // Safety concerns
      if ((report as any).safetyConcerns) {
        y = checkPageBreak(doc, y, 20);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.error);
        doc.text("Safety Concerns:", 52, y, { width: 100 });
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.error);
        doc.text((report as any).safetyConcerns, 150, y, { width: pageWidth - 120 });
        y += 14;
      }

      // Daily labor for this date
      const dayKey = new Date(report.reportDate).toLocaleDateString("en-US", { timeZone: TZ });
      const dl = dailyLabor.get(dayKey);
      if (dl) {
        doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
        doc.text(`Labor: ${fmtHours(dl.totalMinutes)}h · ${dl.workers.size} workers · ${fmtMoney(dl.cost)}`, 52, y, { width: pageWidth - 20 });
        y += 12;
      }

      // Separator
      doc.save();
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.restore();
      y += 8;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DAILY LABOR SUMMARY TABLE
  // ═══════════════════════════════════════════════════════════════════════
  if (dailyLabor.size > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, "Daily Labor Summary", y, brandGold, pageWidth);

    // Table header
    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill("#EAEAEA");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
    doc.text("Date", 42, y + 1, { width: 120 });
    doc.text("Workers", 164, y + 1, { width: 60, align: "center" });
    doc.text("Hours", 226, y + 1, { width: 80, align: "right" });
    doc.text("Labor Cost", 308, y + 1, { width: 80, align: "right" });
    doc.restore();
    y += 20;

    const sortedDays = [...dailyLabor.entries()].sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
    let totalCost = 0;
    let totalMins = 0;
    for (let i = 0; i < sortedDays.length; i++) {
      y = checkPageBreak(doc, y, 16);
      const [day, dl] = sortedDays[i];
      totalCost += dl.cost;
      totalMins += dl.totalMinutes;
      if (i % 2 === 0) {
        doc.save();
        doc.rect(40, y - 2, pageWidth, 16).fill("#F9F9F9");
        doc.restore();
      }
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
      doc.text(day, 42, y, { width: 120 });
      doc.text(`${dl.workers.size}`, 164, y, { width: 60, align: "center" });
      doc.text(`${fmtHours(dl.totalMinutes)}h`, 226, y, { width: 80, align: "right" });
      doc.text(fmtMoney(dl.cost), 308, y, { width: 80, align: "right" });
      y += 16;
    }

    // Total row
    y += 4;
    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.white);
    doc.text("TOTAL", 42, y + 1, { width: 120 });
    doc.text(`${fmtHours(totalMins)}h`, 226, y + 1, { width: 80, align: "right" });
    doc.text(fmtMoney(totalCost), 308, y + 1, { width: 80, align: "right" });
    doc.restore();
    y += 26;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SAFETY MEETINGS
  // ═══════════════════════════════════════════════════════════════════════
  if (safetyMeetings.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Safety Meetings (${safetyMeetings.length})`, y, brandGold, pageWidth);

    for (let i = 0; i < safetyMeetings.length; i++) {
      y = checkPageBreak(doc, y, 40);
      const sm = safetyMeetings[i] as any;
      if (i % 2 === 0) {
        doc.save();
        doc.rect(40, y - 2, pageWidth, 30).fill("#F9F9F9");
        doc.restore();
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
      doc.text(fmtDate(sm.meetingDate || sm.createdAt), 42, y, { width: 80 });
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
      doc.text(sm.topic || sm.title || "Safety Meeting", 124, y, { width: 250 });
      doc.text(`${sm.attendeeCount || "—"} attendees`, 376, y, { width: 100, align: "right" });
      y += 16;
      if (sm.notes || sm.description) {
        doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
        doc.text((sm.notes || sm.description || "").substring(0, 120), 124, y, { width: 350 });
        y += 14;
      }
    }
    y += 10;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHOTO LOG
  // ═══════════════════════════════════════════════════════════════════════
  if (photos.length > 0) {
    y = checkPageBreak(doc, y, 60);
    y = drawSectionHeader(doc, `Photo Log (${photos.length} photos)`, y, brandGold, pageWidth);

    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill("#EAEAEA");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
    doc.text("Date", 42, y + 1, { width: 80 });
    doc.text("Caption", 124, y + 1, { width: 250 });
    doc.text("Taken By", 376, y + 1, { width: 100, align: "right" });
    doc.restore();
    y += 20;

    for (let i = 0; i < Math.min(photos.length, 30); i++) {
      y = checkPageBreak(doc, y, 16);
      const photo = photos[i] as any;
      if (i % 2 === 0) {
        doc.save();
        doc.rect(40, y - 2, pageWidth, 16).fill("#F9F9F9");
        doc.restore();
      }
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
      doc.text(fmtDate(photo.createdAt), 42, y, { width: 80 });
      doc.text((photo.caption || photo.description || "—").substring(0, 60), 124, y, { width: 250 });
      doc.text(photo.uploadedBy ? getEmpName(photo.uploadedBy) : "—", 376, y, { width: 100, align: "right" });
      y += 16;
    }
    if (photos.length > 30) {
      y += 4;
      doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
      doc.text(`... and ${photos.length - 30} more photos`, 42, y, { width: pageWidth });
      y += 14;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    doc.text(
      `${branding.companyName} · ${job.name} Field Reports · ${fmtDate(new Date())} · Page ${i + 1} of ${pages.count}`,
      40, doc.page.height - 30,
      { width: pageWidth, align: "center" }
    );
    doc.restore();
  }

  doc.end();
  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
