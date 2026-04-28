import PDFDocument from "pdfkit";
import { getCompanyBranding } from "./pdf-branding";
import * as db from "./db";

// ─── Helpers ──────────────────────────────────────────────────────────────
const TZ = "America/Denver";
function fmtDate(d: Date | string): string {
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
function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number, accentColor: string, pageWidth: number): number {
  if (y > 680) { doc.addPage(); y = 50; }
  doc.save();
  doc.rect(40, y, pageWidth, 26).fill(COLORS.darkBg);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(accentColor);
  doc.text(title.toUpperCase(), 52, y + 7, { width: pageWidth - 24 });
  doc.restore();
  return y + 34;
}

function drawTableHeader(doc: PDFKit.PDFDocument, cols: { text: string; x: number; width: number; align?: "left" | "right" | "center" }[], y: number, pageWidth: number): number {
  if (y > 690) { doc.addPage(); y = 50; }
  doc.save();
  doc.rect(40, y - 2, pageWidth, 18).fill("#EAEAEA");
  for (const col of cols) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.text);
    doc.text(col.text, col.x, y + 1, { width: col.width, align: col.align || "left" });
  }
  doc.restore();
  return y + 20;
}

function drawTableRow(doc: PDFKit.PDFDocument, cols: { text: string; x: number; width: number; align?: "left" | "right" | "center"; color?: string }[], y: number, bg?: string): number {
  if (y > 710) { doc.addPage(); y = 50; }
  if (bg) {
    doc.save();
    doc.rect(40, y - 2, doc.page.width - 80, 16).fill(bg);
    doc.restore();
  }
  for (const col of cols) {
    doc.font("Helvetica").fontSize(8).fillColor(col.color || COLORS.text);
    doc.text(col.text, col.x, y, { width: col.width, align: col.align || "left" });
  }
  return y + 16;
}

function checkPageBreak(doc: PDFKit.PDFDocument, y: number, needed: number = 60): number {
  if (y + needed > 720) { doc.addPage(); return 50; }
  return y;
}

// ─── Main Generator ──────────────────────────────────────────────────────
export async function generateBudgetReportPDF(
  jobId: number,
  companyId?: number,
  opts?: { startDate?: string; endDate?: string; billingRate?: number }
): Promise<Buffer> {
  // Fetch all data
  const job = await db.getJobById(jobId);
  if (!job) throw new Error(`Job #${jobId} not found`);

  const branding = await getCompanyBranding(companyId);
  const brandGold = branding.brandColor || COLORS.gold;

  const budgetCategories = await db.getBudgetCategoriesForJob(jobId);
  const expenses = await db.getExpensesForJob(jobId);
  const changeOrders = await db.getChangeOrdersForJob(jobId);
  let clockEntries = await db.getClockEntriesForJob(jobId);

  // Filter clock entries by date range if provided
  if (opts?.startDate || opts?.endDate) {
    const rangeStart = opts.startDate ? new Date(opts.startDate + "T00:00:00") : new Date(0);
    const rangeEnd = opts.endDate ? new Date(opts.endDate + "T23:59:59") : new Date();
    clockEntries = clockEntries.filter(e => {
      const d = new Date(e.clockIn);
      return d >= rangeStart && d <= rangeEnd;
    });
  }
  const scheduleItems = await db.getJobSchedule(jobId);
  const auditLog = await db.getBudgetAuditLog(jobId);
  const allEmployees = await db.getAllEmployees();
  const empMap = new Map(allEmployees.map(e => [e.id, e]));
  const getEmpName = (id: number) => empMap.get(id)?.name || `Employee #${id}`;

  // Calculate totals
  const baseBudget = parseFloat((job as any).totalBudget || "0");
  const coTotal = changeOrders.reduce((sum, co) => {
    const amt = parseFloat(co.amount || "0");
    return sum + (co.orderType === "deduct" ? -amt : amt);
  }, 0);
  const effectiveBudget = baseBudget + coTotal;

  const expenseSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);

  // Labor breakdown by employee
  type EmpLabor = { name: string; role: string; rate: number; totalMinutes: number; totalCost: number; dailyEntries: Map<string, number> };
  const empLabor: Record<number, EmpLabor> = {};
  let totalLaborMinutes = 0;
  let totalLaborCost = 0;

  for (const entry of clockEntries) {
    if (!entry.clockOut) continue;
    const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
    const lunchMins = (entry as any).lunchMinutes || 0;
    const netMins = Math.max(0, mins - lunchMins);
    const emp = empMap.get(entry.employeeId);
    const rate = emp?.hourlyRate ? parseFloat(emp.hourlyRate) : 0;
    const cost = (netMins / 60) * rate;

    if (!empLabor[entry.employeeId]) {
      empLabor[entry.employeeId] = {
        name: emp?.name || `Employee #${entry.employeeId}`,
        role: emp?.role || "laborer",
        rate,
        totalMinutes: 0,
        totalCost: 0,
        dailyEntries: new Map(),
      };
    }
    empLabor[entry.employeeId].totalMinutes += netMins;
    empLabor[entry.employeeId].totalCost += cost;
    totalLaborMinutes += netMins;
    totalLaborCost += cost;

    const dayKey = new Date(entry.clockIn).toLocaleDateString("en-US", { timeZone: TZ });
    const prev = empLabor[entry.employeeId].dailyEntries.get(dayKey) || 0;
    empLabor[entry.employeeId].dailyEntries.set(dayKey, prev + netMins);
  }

  const totalSpent = expenseSpent + totalLaborCost;
  const remaining = Math.max(0, effectiveBudget - totalSpent);
  const usedPct = effectiveBudget > 0 ? Math.round((totalSpent / effectiveBudget) * 100) : 0;

  // Hourly job calculations
  const isHourly = (job as any).billingType === "hourly";
  const hourlyRate = opts?.billingRate && opts.billingRate > 0 ? opts.billingRate : parseFloat((job as any).hourlyRate || "55");
  const hourlyRevenue = isHourly ? (totalLaborMinutes / 60) * hourlyRate : 0;
  const grossMargin = isHourly ? hourlyRevenue - totalLaborCost : effectiveBudget - totalSpent;

  // Tax/insurance rates
  const taxRate = parseFloat((job as any).taxRate || "0");
  const workersCompRate = parseFloat((job as any).workersCompRate || "0");
  const liabilityInsRate = parseFloat((job as any).liabilityInsRate || "0");
  const taxCost = totalLaborCost * (taxRate / 100);
  const wcCost = totalLaborCost * (workersCompRate / 100);
  const liCost = totalLaborCost * (liabilityInsRate / 100);
  const fullyBurdenedLabor = totalLaborCost + taxCost + wcCost + liCost;

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
    try {
      doc.image(logo, 16, 12, { width: 70, height: 70 });
      textX = 94;
    } catch {}
  }

  doc.font("Helvetica-Bold").fontSize(22).fillColor(brandGold);
  doc.text("BUDGET REPORT", textX, 18, { width: pageWidth - (textX - 40) });
  doc.font("Helvetica").fontSize(12).fillColor(COLORS.white);
  doc.text(job.name, textX, 46, { width: pageWidth - (textX - 40) });
  const subtitle = [(job as any).clientName, (job as any).address].filter(Boolean).join(" · ");
  if (subtitle) {
    doc.fontSize(9).fillColor("#AAAAAA").text(subtitle, textX, 64, { width: pageWidth - (textX - 40) });
  }
  let genLine = `Generated ${fmtDate(new Date())}`;
  if (opts?.startDate || opts?.endDate) {
    genLine += ` | Period: ${opts.startDate || "start"} to ${opts.endDate || "now"}`;
  }
  if (opts?.billingRate && opts.billingRate > 0) {
    genLine += ` | Billing Rate: $${opts.billingRate}/hr`;
  }
  doc.fontSize(8).fillColor("#888888").text(genLine, textX, 80, { width: pageWidth - (textX - 40) });

  // Company name on right
  doc.font("Helvetica-Bold").fontSize(10).fillColor(brandGold);
  doc.text(branding.companyName, 40, 88, { width: pageWidth, align: "right" });

  y = 115;

  // ═══════════════════════════════════════════════════════════════════════
  // FINANCIAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, "Financial Summary", y, brandGold, pageWidth);

  // Summary boxes row 1
  const boxW = (pageWidth - 30) / 4;
  const boxes = [
    { label: isHourly ? "Hourly Revenue" : "Effective Budget", value: fmtMoney(isHourly ? hourlyRevenue : effectiveBudget), color: brandGold },
    { label: "Total Spent", value: fmtMoney(totalSpent), color: COLORS.text },
    { label: isHourly ? "Gross Margin" : "Remaining", value: fmtMoney(isHourly ? grossMargin : remaining), color: grossMargin >= 0 || remaining >= 0 ? COLORS.success : COLORS.error },
    { label: "Budget Used", value: `${usedPct}%`, color: usedPct < 60 ? COLORS.success : usedPct < 85 ? COLORS.warning : COLORS.error },
  ];

  for (let i = 0; i < boxes.length; i++) {
    const bx = 40 + i * (boxW + 10);
    doc.save();
    doc.rect(bx, y, boxW, 48).fill(COLORS.sectionBg);
    doc.rect(bx, y, boxW, 3).fill(boxes[i].color);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(boxes[i].color);
    doc.text(boxes[i].value, bx + 8, y + 12, { width: boxW - 16, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    doc.text(boxes[i].label, bx + 8, y + 34, { width: boxW - 16, align: "center" });
    doc.restore();
  }
  y += 58;

  // Progress bar
  doc.save();
  doc.rect(40, y, pageWidth, 8).fill("#E5E7EB");
  const barColor = usedPct < 60 ? COLORS.success : usedPct < 85 ? COLORS.warning : COLORS.error;
  doc.rect(40, y, pageWidth * Math.min(usedPct / 100, 1), 8).fill(barColor);
  doc.restore();
  y += 16;

  // Row 2: Labor details
  const row2 = [
    { label: "Base Labor", value: fmtMoney(totalLaborCost) },
    { label: "Hours Logged", value: `${fmtHours(totalLaborMinutes)}h` },
    { label: "Expenses", value: fmtMoney(expenseSpent) },
    { label: isHourly ? `Rate: $${hourlyRate}/hr` : "Base Budget", value: isHourly ? `${fmtHours(totalLaborMinutes)}h × $${hourlyRate}` : fmtMoney(baseBudget) },
  ];
  for (let i = 0; i < row2.length; i++) {
    const bx = 40 + i * (boxW + 10);
    doc.save();
    doc.rect(bx, y, boxW, 36).fill(COLORS.sectionBg);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.text);
    doc.text(row2[i].value, bx + 8, y + 6, { width: boxW - 16, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
    doc.text(row2[i].label, bx + 8, y + 24, { width: boxW - 16, align: "center" });
    doc.restore();
  }
  y += 46;

  // Fully burdened labor (if tax/wc/li rates set)
  if (taxRate > 0 || workersCompRate > 0 || liabilityInsRate > 0) {
    y = checkPageBreak(doc, y, 80);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text);
    doc.text("Fully Burdened Labor Cost Breakdown:", 40, y, { width: pageWidth });
    y += 14;
    const burdenItems = [
      { label: "Base Labor", value: fmtMoney(totalLaborCost) },
    ];
    if (taxRate > 0) burdenItems.push({ label: `Payroll Tax (${taxRate}%)`, value: fmtMoney(taxCost) });
    if (workersCompRate > 0) burdenItems.push({ label: `Workers Comp (${workersCompRate}%)`, value: fmtMoney(wcCost) });
    if (liabilityInsRate > 0) burdenItems.push({ label: `Liability Ins (${liabilityInsRate}%)`, value: fmtMoney(liCost) });
    burdenItems.push({ label: "Total Burdened Cost", value: fmtMoney(fullyBurdenedLabor) });

    for (const item of burdenItems) {
      const isBold = item.label.startsWith("Total");
      doc.font(isBold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(COLORS.text);
      doc.text(item.label, 52, y, { width: 200 });
      doc.text(item.value, 260, y, { width: 100, align: "right" });
      y += 14;
    }
    y += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CHANGE ORDERS
  // ═══════════════════════════════════════════════════════════════════════
  if (changeOrders.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Change Orders (${changeOrders.length})`, y, brandGold, pageWidth);

    const coCols = [
      { text: "Date", x: 42, width: 70 },
      { text: "Description", x: 114, width: 200 },
      { text: "Type", x: 316, width: 50 },
      { text: "Status", x: 368, width: 60 },
      { text: "Amount", x: 430, width: 100, align: "right" as const },
    ];
    y = drawTableHeader(doc, coCols, y, pageWidth);

    for (let i = 0; i < changeOrders.length; i++) {
      y = checkPageBreak(doc, y);
      const co = changeOrders[i];
      const amt = parseFloat(co.amount || "0");
      const sign = co.orderType === "deduct" ? "-" : "+";
      y = drawTableRow(doc, [
        { text: fmtDate(co.orderDate || co.createdAt), x: 42, width: 70 },
        { text: co.description || "", x: 114, width: 200 },
        { text: co.orderType === "deduct" ? "Deduct" : "Add", x: 316, width: 50, color: co.orderType === "deduct" ? COLORS.error : COLORS.success },
        { text: co.status || "approved", x: 368, width: 60 },
        { text: `${sign}${fmtMoney(amt)}`, x: 430, width: 100, align: "right", color: co.orderType === "deduct" ? COLORS.error : COLORS.success },
      ], y, i % 2 === 0 ? "#F9F9F9" : undefined);
    }

    // CO total
    y += 4;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.text);
    doc.text("Net Change Order Impact:", 42, y, { width: 380 });
    doc.text(`${coTotal >= 0 ? "+" : ""}${fmtMoney(coTotal)}`, 430, y, { width: 100, align: "right" });
    y += 20;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EMPLOYEE LABOR BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════════
  const empEntries = Object.values(empLabor);
  if (empEntries.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Employee Labor Breakdown (${empEntries.length} workers)`, y, brandGold, pageWidth);

    const empCols = [
      { text: "Employee", x: 42, width: 140 },
      { text: "Role", x: 184, width: 80 },
      { text: "Rate", x: 266, width: 60, align: "right" as const },
      { text: "Hours", x: 328, width: 60, align: "right" as const },
      { text: "Lunch Ded.", x: 390, width: 60, align: "right" as const },
      { text: "Cost", x: 452, width: 80, align: "right" as const },
    ];
    y = drawTableHeader(doc, empCols, y, pageWidth);

    const sortedEmps = empEntries.sort((a, b) => b.totalCost - a.totalCost);
    for (let i = 0; i < sortedEmps.length; i++) {
      y = checkPageBreak(doc, y);
      const emp = sortedEmps[i];
      y = drawTableRow(doc, [
        { text: emp.name, x: 42, width: 140 },
        { text: emp.role.charAt(0).toUpperCase() + emp.role.slice(1), x: 184, width: 80 },
        { text: emp.rate > 0 ? `$${emp.rate.toFixed(2)}/hr` : "—", x: 266, width: 60, align: "right" },
        { text: `${fmtHours(emp.totalMinutes)}h`, x: 328, width: 60, align: "right" },
        { text: "—", x: 390, width: 60, align: "right" },
        { text: fmtMoney(emp.totalCost), x: 452, width: 80, align: "right" },
      ], y, i % 2 === 0 ? "#F9F9F9" : undefined);
    }

    // Total row
    y += 4;
    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.white);
    doc.text("TOTAL", 42, y + 1, { width: 140 });
    doc.text(`${fmtHours(totalLaborMinutes)}h`, 328, y + 1, { width: 60, align: "right" });
    doc.text(fmtMoney(totalLaborCost), 452, y + 1, { width: 80, align: "right" });
    doc.restore();
    y += 26;

    // Daily hours breakdown with per-employee detail
    // Build day → employee breakdown map
    const dayEmployeeMap = new Map<string, { empId: number; name: string; mins: number; rate: number; cost: number }[]>();
    const allDays = new Map<string, number>();
    for (const emp of empEntries) {
      for (const [day, mins] of emp.dailyEntries) {
        allDays.set(day, (allDays.get(day) || 0) + mins);
        if (!dayEmployeeMap.has(day)) dayEmployeeMap.set(day, []);
        const cost = (mins / 60) * emp.rate;
        dayEmployeeMap.get(day)!.push({ empId: 0, name: emp.name, mins, rate: emp.rate, cost });
      }
    }
    const sortedDays = [...allDays.entries()].sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()).slice(0, 30);

    if (sortedDays.length > 0) {
      y = checkPageBreak(doc, y, 80);
      y = drawSectionHeader(doc, "Daily Hours Log (Per Employee)", y, brandGold, pageWidth);

      for (let di = 0; di < sortedDays.length; di++) {
        const [day, totalMins] = sortedDays[di];
        const dayEmps = dayEmployeeMap.get(day) || [];
        // Need space for date header + employees + total row
        y = checkPageBreak(doc, y, 20 + dayEmps.length * 14 + 20);

        // Date header row (dark background)
        doc.save();
        doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(brandGold);
        doc.text(day, 46, y + 1, { width: 120 });
        doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.white);
        doc.text(`${dayEmps.length} worker${dayEmps.length !== 1 ? "s" : ""}`, 170, y + 1, { width: 80 });
        const totalDayCost = dayEmps.reduce((s, e) => s + e.cost, 0);
        doc.text(`${fmtHours(totalMins)}h`, 350, y + 1, { width: 80, align: "right" });
        doc.text(fmtMoney(totalDayCost), 440, y + 1, { width: 90, align: "right" });
        doc.restore();
        y += 20;

        // Column headers for this day's employees
        const empDayCols = [
          { text: "Employee", x: 56, width: 160 },
          { text: "Rate", x: 220, width: 70, align: "right" as const },
          { text: "Hours", x: 294, width: 70, align: "right" as const },
          { text: "Earned", x: 368, width: 70, align: "right" as const },
          { text: "Cost to Co.", x: 440, width: 90, align: "right" as const },
        ];
        y = drawTableHeader(doc, empDayCols, y, pageWidth);

        // Each employee who worked that day
        const sortedDayEmps = dayEmps.sort((a, b) => b.mins - a.mins);
        for (let ei = 0; ei < sortedDayEmps.length; ei++) {
          y = checkPageBreak(doc, y);
          const e = sortedDayEmps[ei];
          const earned = (e.mins / 60) * hourlyRate; // what the company bills for this employee's time
          y = drawTableRow(doc, [
            { text: `  ${e.name}`, x: 56, width: 160 },
            { text: e.rate > 0 ? `$${e.rate.toFixed(2)}/hr` : "—", x: 220, width: 70, align: "right" },
            { text: `${fmtHours(e.mins)}h`, x: 294, width: 70, align: "right" },
            { text: isHourly ? fmtMoney(earned) : "—", x: 368, width: 70, align: "right", color: COLORS.success },
            { text: fmtMoney(e.cost), x: 440, width: 90, align: "right" },
          ], y, ei % 2 === 0 ? "#FAFAFA" : undefined);
        }

        // Daily total row
        y += 2;
        doc.save();
        doc.rect(40, y - 2, pageWidth, 16).fill("#F0F0F0");
        doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.text);
        doc.text("DAY TOTAL", 56, y + 1, { width: 160 });
        doc.text(`${fmtHours(totalMins)}h`, 294, y + 1, { width: 70, align: "right" });
        if (isHourly) {
          const dayRevenue = (totalMins / 60) * hourlyRate;
          doc.fillColor(COLORS.success);
          doc.text(fmtMoney(dayRevenue), 368, y + 1, { width: 70, align: "right" });
        }
        doc.fillColor(COLORS.text);
        doc.text(fmtMoney(totalDayCost), 440, y + 1, { width: 90, align: "right" });
        doc.restore();
        y += 22;
      }
      y += 6;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BUDGET CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════
  if (budgetCategories.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Budget Categories (${budgetCategories.length})`, y, brandGold, pageWidth);

    const catCols = [
      { text: "Category", x: 42, width: 160 },
      { text: "Budgeted", x: 204, width: 90, align: "right" as const },
      { text: "Spent", x: 296, width: 90, align: "right" as const },
      { text: "Remaining", x: 388, width: 80, align: "right" as const },
      { text: "Used %", x: 470, width: 60, align: "right" as const },
    ];
    y = drawTableHeader(doc, catCols, y, pageWidth);

    let totalBudgeted = 0;
    let totalCatSpent = 0;
    for (let i = 0; i < budgetCategories.length; i++) {
      y = checkPageBreak(doc, y);
      const cat = budgetCategories[i];
      const budgeted = parseFloat(cat.budgetedAmount || "0");
      const spent = parseFloat(cat.spentAmount || "0");
      const catRemaining = budgeted - spent;
      const pct = budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0;
      totalBudgeted += budgeted;
      totalCatSpent += spent;

      y = drawTableRow(doc, [
        { text: cat.name, x: 42, width: 160 },
        { text: fmtMoney(budgeted), x: 204, width: 90, align: "right" },
        { text: fmtMoney(spent), x: 296, width: 90, align: "right" },
        { text: fmtMoney(catRemaining), x: 388, width: 80, align: "right", color: catRemaining >= 0 ? COLORS.success : COLORS.error },
        { text: `${pct}%`, x: 470, width: 60, align: "right", color: pct < 60 ? COLORS.success : pct < 85 ? COLORS.warning : COLORS.error },
      ], y, i % 2 === 0 ? "#F9F9F9" : undefined);
    }

    // Category totals
    y += 4;
    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.white);
    doc.text("TOTAL", 42, y + 1, { width: 160 });
    doc.text(fmtMoney(totalBudgeted), 204, y + 1, { width: 90, align: "right" });
    doc.text(fmtMoney(totalCatSpent), 296, y + 1, { width: 90, align: "right" });
    doc.restore();
    y += 26;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════════════════
  if (expenses.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Expenses (${expenses.length})`, y, brandGold, pageWidth);

    const expCols = [
      { text: "Date", x: 42, width: 80 },
      { text: "Description", x: 124, width: 220 },
      { text: "Category", x: 346, width: 100 },
      { text: "Amount", x: 448, width: 84, align: "right" as const },
    ];
    y = drawTableHeader(doc, expCols, y, pageWidth);

    const sortedExpenses = [...expenses].sort((a, b) => new Date(b.expenseDate || b.createdAt).getTime() - new Date(a.expenseDate || a.createdAt).getTime());
    for (let i = 0; i < sortedExpenses.length; i++) {
      y = checkPageBreak(doc, y);
      const exp = sortedExpenses[i];
      y = drawTableRow(doc, [
        { text: fmtDate(exp.expenseDate || exp.createdAt), x: 42, width: 80 },
        { text: exp.description || "—", x: 124, width: 220 },
        { text: (exp as any).category || "General", x: 346, width: 100 },
        { text: fmtMoney(exp.amount), x: 448, width: 84, align: "right" },
      ], y, i % 2 === 0 ? "#F9F9F9" : undefined);
    }

    // Expense total
    y += 4;
    doc.save();
    doc.rect(40, y - 2, pageWidth, 18).fill(COLORS.darkBg);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.white);
    doc.text("TOTAL EXPENSES", 42, y + 1, { width: 200 });
    doc.text(fmtMoney(expenseSpent), 448, y + 1, { width: 84, align: "right" });
    doc.restore();
    y += 26;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCHEDULE PROGRESS
  // ═══════════════════════════════════════════════════════════════════════
  if (scheduleItems && scheduleItems.length > 0) {
    y = checkPageBreak(doc, y, 80);
    const items = scheduleItems as any[];
    const total = items.length;
    const completed = items.filter((i: any) => i.status === "completed").length;
    const inProgress = items.filter((i: any) => i.status === "in_progress").length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    y = drawSectionHeader(doc, `Schedule Progress (${pct}% Complete)`, y, brandGold, pageWidth);

    // Progress summary
    const progBoxW = (pageWidth - 20) / 3;
    const progBoxes = [
      { label: "Total Tasks", value: `${total}` },
      { label: "Completed", value: `${completed}` },
      { label: "In Progress", value: `${inProgress}` },
    ];
    for (let i = 0; i < progBoxes.length; i++) {
      const bx = 40 + i * (progBoxW + 10);
      doc.save();
      doc.rect(bx, y, progBoxW, 32).fill(COLORS.sectionBg);
      doc.font("Helvetica-Bold").fontSize(14).fillColor(COLORS.text);
      doc.text(progBoxes[i].value, bx + 8, y + 4, { width: progBoxW - 16, align: "center" });
      doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
      doc.text(progBoxes[i].label, bx + 8, y + 22, { width: progBoxW - 16, align: "center" });
      doc.restore();
    }
    y += 40;

    // Progress bar
    doc.save();
    doc.rect(40, y, pageWidth, 8).fill("#E5E7EB");
    doc.rect(40, y, pageWidth * (pct / 100), 8).fill(pct >= 80 ? COLORS.success : pct >= 40 ? COLORS.warning : COLORS.error);
    doc.restore();
    y += 16;

    // Phase breakdown
    const phases = new Map<string, { total: number; completed: number }>();
    for (const item of items) {
      const p = item.phase || "General";
      if (!phases.has(p)) phases.set(p, { total: 0, completed: 0 });
      const pd = phases.get(p)!;
      pd.total++;
      if (item.status === "completed") pd.completed++;
    }

    if (phases.size > 0) {
      const phaseCols = [
        { text: "Phase", x: 42, width: 200 },
        { text: "Tasks", x: 244, width: 80, align: "center" as const },
        { text: "Progress", x: 326, width: 80, align: "right" as const },
      ];
      y = drawTableHeader(doc, phaseCols, y, pageWidth);

      let idx = 0;
      for (const [name, pd] of phases) {
        y = checkPageBreak(doc, y);
        const pp = pd.total > 0 ? Math.round((pd.completed / pd.total) * 100) : 0;
        y = drawTableRow(doc, [
          { text: name, x: 42, width: 200 },
          { text: `${pd.completed}/${pd.total}`, x: 244, width: 80, align: "center" },
          { text: `${pp}%`, x: 326, width: 80, align: "right", color: pp >= 80 ? COLORS.success : pp >= 40 ? COLORS.warning : COLORS.error },
        ], y, idx % 2 === 0 ? "#F9F9F9" : undefined);
        idx++;
      }
      y += 10;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BUDGET HISTORY / AUDIT LOG
  // ═══════════════════════════════════════════════════════════════════════
  if (auditLog && auditLog.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = drawSectionHeader(doc, `Budget History (${auditLog.length} changes)`, y, brandGold, pageWidth);

    const auditCols = [
      { text: "Date", x: 42, width: 80 },
      { text: "Action", x: 124, width: 140 },
      { text: "Changed By", x: 266, width: 100 },
      { text: "Details", x: 368, width: 164 },
    ];
    y = drawTableHeader(doc, auditCols, y, pageWidth);

    const recentAudit = auditLog.slice(0, 20); // Last 20 entries
    for (let i = 0; i < recentAudit.length; i++) {
      y = checkPageBreak(doc, y);
      const entry = recentAudit[i] as any;
      y = drawTableRow(doc, [
        { text: fmtDate(entry.createdAt), x: 42, width: 80 },
        { text: entry.action || "—", x: 124, width: 140 },
        { text: entry.changedBy ? getEmpName(entry.changedBy) : "System", x: 266, width: 100 },
        { text: (entry.details || entry.description || "").substring(0, 50), x: 368, width: 164 },
      ], y, i % 2 === 0 ? "#F9F9F9" : undefined);
    }
    y += 10;
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
      `${branding.companyName} · ${job.name} Budget Report · ${fmtDate(new Date())} · Page ${i + 1} of ${pages.count}`,
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
