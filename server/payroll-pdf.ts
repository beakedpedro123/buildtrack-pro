import PDFDocument from "pdfkit";
import * as db from "./db";

// ─── Types ────────────────────────────────────────────────────────────────
export type ReportType = "full" | "payroll" | "jobcost" | "employee";

interface DayEntry {
  id: number;
  clockIn: Date;
  clockOut: Date | null;
  jobId: number;
  jobName: string;
  durationMinutes: number;
  adjustments: any[];
}

interface EmployeeDay {
  date: string;
  entries: DayEntry[];
  totalMinutes: number;
}

interface EmployeeTimecard {
  employeeId: number;
  name: string;
  role: string;
  hourlyRate: string | null;
  payType: string;
  salaryAmount: string | null;
  salaryProjects: number[];
  days: EmployeeDay[];
  totalMinutes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const TZ = "America/Denver"; // Mountain Time

function fmtTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
}

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: TZ });
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function fmtHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

function fmtMoney(amount: number): string {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  office_manager: "Office Manager",
  logistics: "Logistics",
  foreman: "Foreman",
  laborer: "Laborer",
};

const REPORT_TITLES: Record<ReportType, string> = {
  full: "DETAILED PAYROLL REPORT",
  payroll: "PAYROLL SUMMARY REPORT",
  jobcost: "JOB COST REPORT",
  employee: "EMPLOYEE DETAIL REPORT",
};

// ─── Shared data builder ─────────────────────────────────────────────────
async function buildReportData(startDate: Date, endDate: Date) {
  const allEmployees = await db.getAllEmployees();
  const activeEmployees = allEmployees.filter(e => e.isActive !== false);
  const allJobs = await db.getAllJobs();
  const jobMap = new Map(allJobs.map(j => [j.id, j]));
  const entries = await db.getClockEntriesForPayroll(startDate, endDate);
  const employeeMap = new Map(activeEmployees.map(e => [e.id, e]));

  // Group entries by employee
  const byEmployee = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const list = byEmployee.get(entry.employeeId) || [];
    list.push(entry);
    byEmployee.set(entry.employeeId, list);
  }

  // Build timecards
  const timecards: EmployeeTimecard[] = [];
  for (const [empId, empEntries] of byEmployee) {
    const emp = employeeMap.get(empId);
    if (!emp) continue;

    const dayMap = new Map<string, DayEntry[]>();
    let totalMinutes = 0;

    for (const entry of empEntries) {
      // Use Mountain Time for day grouping
      const dayKey = new Date(entry.clockIn).toLocaleDateString("en-CA", { timeZone: TZ });
      const list = dayMap.get(dayKey) || [];
      const durationMs = new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime();
      const minutes = Math.floor(durationMs / 60000);
      totalMinutes += minutes;
      const job = jobMap.get(entry.jobId);
      list.push({
        id: entry.id,
        clockIn: new Date(entry.clockIn),
        clockOut: entry.clockOut ? new Date(entry.clockOut) : null,
        jobId: entry.jobId,
        jobName: job?.name || `Job #${entry.jobId}`,
        durationMinutes: minutes,
        adjustments: [],
      });
      dayMap.set(dayKey, list);
    }

    const days = Array.from(dayMap.entries())
      .map(([date, dayEntries]) => ({
        date,
        entries: dayEntries,
        totalMinutes: dayEntries.reduce((sum, e) => sum + e.durationMinutes, 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let salaryProjects: number[] = [];
    try { salaryProjects = emp.salaryProjects ? JSON.parse(emp.salaryProjects) : []; } catch {}
    timecards.push({
      employeeId: empId,
      name: emp.name,
      role: emp.role,
      hourlyRate: emp.hourlyRate ?? null,
      payType: emp.payType || "hourly",
      salaryAmount: emp.salaryAmount ?? null,
      salaryProjects,
      days,
      totalMinutes,
    });
  }

  const roleOrder = ["owner", "office_manager", "logistics", "foreman", "laborer"];
  timecards.sort((a, b) => {
    const ri = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
    if (ri !== 0) return ri;
    return a.name.localeCompare(b.name);
  });

  // Also include salary employees who had NO clock entries (they still cost money)
  for (const emp of activeEmployees) {
    if (emp.payType === "salary" && !byEmployee.has(emp.id)) {
      let salaryProjects: number[] = [];
      try { salaryProjects = emp.salaryProjects ? JSON.parse(emp.salaryProjects) : []; } catch {}
      timecards.push({
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        hourlyRate: emp.hourlyRate ?? null,
        payType: "salary",
        salaryAmount: emp.salaryAmount ?? null,
        salaryProjects,
        days: [],
        totalMinutes: 0,
      });
    }
  }

  // Job cost summary
  const jobCosts = new Map<number, { name: string; totalMinutes: number; totalCost: number; salaryCost: number; employees: Set<string> }>();
  for (const tc of timecards) {
    if (tc.payType === "salary") {
      // Distribute salary cost across assigned projects
      const salaryAmt = tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0;
      if (tc.salaryProjects.length > 0 && salaryAmt > 0) {
        const perProject = salaryAmt / tc.salaryProjects.length;
        for (const projId of tc.salaryProjects) {
          const job = jobMap.get(projId);
          const jc = jobCosts.get(projId) || { name: job?.name || `Job #${projId}`, totalMinutes: 0, totalCost: 0, salaryCost: 0, employees: new Set() };
          jc.salaryCost += perProject;
          jc.totalCost += perProject;
          jc.employees.add(tc.name + " (salary)");
          jobCosts.set(projId, jc);
        }
      }
    } else {
      const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
      for (const day of tc.days) {
        for (const entry of day.entries) {
          const jc = jobCosts.get(entry.jobId) || { name: entry.jobName, totalMinutes: 0, totalCost: 0, salaryCost: 0, employees: new Set() };
          jc.totalMinutes += entry.durationMinutes;
          jc.totalCost += (entry.durationMinutes / 60) * rate;
          jc.employees.add(tc.name);
          jobCosts.set(entry.jobId, jc);
        }
      }
    }
  }

  const totalPayroll = timecards.reduce((sum, tc) => {
    if (tc.payType === "salary") {
      return sum + (tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0);
    }
    const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
    return sum + (tc.totalMinutes / 60) * rate;
  }, 0);
  const totalHours = timecards.reduce((sum, tc) => sum + tc.totalMinutes, 0);

  return { timecards, jobCosts, totalPayroll, totalHours };
}

// ─── PDF Section Renderers ───────────────────────────────────────────────

function renderCoverHeader(
  doc: PDFKit.PDFDocument,
  startDate: Date,
  endDate: Date,
  reportType: ReportType,
  pageWidth: number,
  gold: string
) {
  doc.rect(0, 0, 612, 100).fill("#1a1a1a");
  doc.fontSize(24).fillColor("#ffffff").text("CARRANZA CUSTOM CONSTRUCTION", 40, 30, { width: pageWidth });
  doc.fontSize(11).fillColor(gold).text(REPORT_TITLES[reportType], 40, 60);
  doc.fontSize(10).fillColor("#cccccc").text(
    `Period: ${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ })} — ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ })}`,
    40, 78
  );
}

function renderPayrollSummary(
  doc: PDFKit.PDFDocument,
  timecards: EmployeeTimecard[],
  totalPayroll: number,
  totalHours: number,
  pageWidth: number,
  gold: string,
  startY: number
): number {
  const textColor = "#333333";
  const mutedColor = "#666666";
  const lightBg = "#f8f8f8";
  const borderColor = "#e0e0e0";
  let y = startY;

  // Section title
  doc.fontSize(14).fillColor(gold).text("PAYROLL SUMMARY", 40, y);
  y += 22;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(gold).lineWidth(1).stroke();
  y += 12;

  // Summary boxes
  const boxWidth = pageWidth / 3 - 8;
  const boxes = [
    { label: "Total Employees", value: `${timecards.length}` },
    { label: "Total Hours", value: fmtHours(totalHours) },
    { label: "Total Payroll", value: fmtMoney(totalPayroll) },
  ];

  for (let i = 0; i < boxes.length; i++) {
    const bx = 40 + i * (boxWidth + 12);
    doc.rect(bx, y, boxWidth, 50).fill(lightBg).stroke();
    doc.rect(bx, y, boxWidth, 50).strokeColor(borderColor).stroke();
    doc.fontSize(9).fillColor(mutedColor).text(boxes[i].label, bx + 8, y + 8, { width: boxWidth - 16 });
    doc.fontSize(16).fillColor(textColor).text(boxes[i].value, bx + 8, y + 24, { width: boxWidth - 16 });
  }
  y += 65;

  // Per-employee payroll table
  doc.fontSize(12).fillColor(gold).text("Employee Payroll Breakdown", 40, y);
  y += 18;

  const colWidths = [160, 80, 80, 80, 80, pageWidth - 480];
  const headers = ["Employee", "Role", "Hours", "Rate", "Est. Pay", "Days"];
  doc.fontSize(8).fillColor(mutedColor);
  let cx = 40;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx, y, { width: colWidths[i] });
    cx += colWidths[i];
  }
  y += 14;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;

  for (const tc of timecards) {
    if (y > 700) { doc.addPage(); y = 40; }
    const isSalary = tc.payType === "salary";
    const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
    const pay = isSalary ? (tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0) : (tc.totalMinutes / 60) * rate;
    doc.fontSize(9).fillColor(textColor);
    cx = 40;
    doc.text(tc.name, cx, y, { width: colWidths[0] }); cx += colWidths[0];
    doc.text(ROLE_LABELS[tc.role] || tc.role, cx, y, { width: colWidths[1] }); cx += colWidths[1];
    doc.text(isSalary ? "Salary" : fmtHours(tc.totalMinutes), cx, y, { width: colWidths[2] }); cx += colWidths[2];
    doc.text(isSalary ? "Salary" : (tc.hourlyRate ? fmtMoney(rate) : "—"), cx, y, { width: colWidths[3] }); cx += colWidths[3];
    doc.text(fmtMoney(pay), cx, y, { width: colWidths[4] }); cx += colWidths[4];
    doc.text(isSalary ? `${tc.salaryProjects.length} proj` : `${tc.days.length}`, cx, y, { width: colWidths[5] });
    y += 16;
  }

  // Total row
  y += 4;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;
  doc.fontSize(9).fillColor(textColor).font("Helvetica-Bold");
  cx = 40;
  doc.text("TOTAL", cx, y, { width: colWidths[0] }); cx += colWidths[0];
  doc.text("", cx, y, { width: colWidths[1] }); cx += colWidths[1];
  doc.text(fmtHours(totalHours), cx, y, { width: colWidths[2] }); cx += colWidths[2];
  doc.text("", cx, y, { width: colWidths[3] }); cx += colWidths[3];
  doc.text(fmtMoney(totalPayroll), cx, y, { width: colWidths[4] });
  doc.font("Helvetica");
  y += 24;

  return y;
}

function renderJobCostSummary(
  doc: PDFKit.PDFDocument,
  jobCosts: Map<number, { name: string; totalMinutes: number; totalCost: number; employees: Set<string> }>,
  totalHours: number,
  totalPayroll: number,
  pageWidth: number,
  gold: string,
  startY: number
): number {
  const textColor = "#333333";
  const mutedColor = "#666666";
  const borderColor = "#e0e0e0";
  let y = startY;

  doc.fontSize(14).fillColor(gold).text("JOB COST SUMMARY", 40, y);
  y += 22;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(gold).lineWidth(1).stroke();
  y += 8;

  const jobColWidths = [200, 80, 80, 80, pageWidth - 440];
  const jobHeaders = ["Job Site", "Hours", "Labor Cost", "Workers", "Employees"];
  doc.fontSize(8).fillColor(mutedColor);
  let cx = 40;
  for (let i = 0; i < jobHeaders.length; i++) {
    doc.text(jobHeaders[i], cx, y, { width: jobColWidths[i] });
    cx += jobColWidths[i];
  }
  y += 14;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;

  const sortedJobs = Array.from(jobCosts.values()).sort((a, b) => b.totalCost - a.totalCost);
  for (const jc of sortedJobs) {
    if (y > 700) { doc.addPage(); y = 40; }
    doc.fontSize(9).fillColor(textColor);
    cx = 40;
    doc.text(jc.name, cx, y, { width: jobColWidths[0] }); cx += jobColWidths[0];
    doc.text(fmtHours(jc.totalMinutes), cx, y, { width: jobColWidths[1] }); cx += jobColWidths[1];
    doc.text(fmtMoney(jc.totalCost), cx, y, { width: jobColWidths[2] }); cx += jobColWidths[2];
    doc.text(`${jc.employees.size}`, cx, y, { width: jobColWidths[3] }); cx += jobColWidths[3];
    doc.fontSize(8).fillColor(mutedColor).text(Array.from(jc.employees).join(", "), cx, y, { width: jobColWidths[4] });
    y += 16;
  }

  // Job totals
  y += 4;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;
  doc.fontSize(9).fillColor(textColor).font("Helvetica-Bold");
  cx = 40;
  doc.text("TOTAL", cx, y, { width: jobColWidths[0] }); cx += jobColWidths[0];
  doc.text(fmtHours(totalHours), cx, y, { width: jobColWidths[1] }); cx += jobColWidths[1];
  doc.text(fmtMoney(totalPayroll), cx, y, { width: jobColWidths[2] });
  doc.font("Helvetica");
  y += 24;

  // Per-job detail: which employees worked on each job and how many hours
  doc.fontSize(12).fillColor(gold).text("Per-Job Employee Breakdown", 40, y);
  y += 18;

  for (const jc of sortedJobs) {
    if (y > 660) { doc.addPage(); y = 40; }
    doc.fontSize(10).fillColor(textColor).font("Helvetica-Bold").text(jc.name, 40, y);
    doc.font("Helvetica");
    doc.fontSize(8).fillColor(mutedColor).text(
      `${fmtHours(jc.totalMinutes)} hrs | ${fmtMoney(jc.totalCost)} | ${jc.employees.size} workers`,
      40, y + 14
    );
    y += 30;

    // List employees for this job
    const empList = Array.from(jc.employees);
    for (const empName of empList) {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.fontSize(9).fillColor(textColor).text(`  • ${empName}`, 50, y);
      y += 14;
    }
    y += 8;
  }

  return y;
}

async function renderEmployeeDetail(
  doc: PDFKit.PDFDocument,
  timecards: EmployeeTimecard[],
  pageWidth: number,
  gold: string
) {
  const textColor = "#333333";
  const mutedColor = "#666666";
  const borderColor = "#e0e0e0";
  const darkBg = "#1a1a1a";

  for (const tc of timecards) {
    doc.addPage();
    let y = 40;

    // Employee header bar
    doc.rect(40, y, pageWidth, 36).fill(darkBg);
    doc.fontSize(14).fillColor("#ffffff").text(tc.name.toUpperCase(), 52, y + 6, { width: pageWidth - 120 });
    doc.fontSize(9).fillColor(gold).text(ROLE_LABELS[tc.role] || tc.role, 52, y + 23);

    const isSalary = tc.payType === "salary";
    const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
    const salaryAmt = tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0;
    const totalPay = isSalary ? salaryAmt : (tc.totalMinutes / 60) * rate;
    doc.fontSize(10).fillColor("#ffffff").text(
      isSalary
        ? `Biweekly Salary | ${fmtMoney(totalPay)}`
        : `${fmtHours(tc.totalMinutes)} hrs | ${fmtMoney(totalPay)}`,
      40, y + 10, { width: pageWidth - 12, align: "right" }
    );
    y += 48;

    // Employee summary row
    doc.fontSize(9).fillColor(mutedColor);
    if (isSalary) {
      doc.text(`Pay Type: Biweekly Salary`, 40, y);
      doc.text(`Salary Amount: ${fmtMoney(salaryAmt)}/period`, 200, y);
      doc.text(`Assigned Projects: ${tc.salaryProjects.length}`, 380, y);
    } else {
      if (tc.hourlyRate) doc.text(`Hourly Rate: ${fmtMoney(rate)}`, 40, y);
      doc.text(`Total Days Worked: ${tc.days.length}`, 200, y);
      doc.text(`Total Hours: ${fmtDuration(tc.totalMinutes)}`, 360, y);
    }
    y += 18;

    // Per-job breakdown for this employee
    // Job breakdown
    doc.fontSize(10).fillColor(gold).text("Job Breakdown", 40, y);
    y += 14;
    const ejColWidths = [220, 100, 100];
    doc.fontSize(8).fillColor(mutedColor);
    let cx = 40;
    doc.text("Job Site", cx, y); cx += ejColWidths[0];
    doc.text(isSalary ? "Salary Allocation" : "Hours", cx, y); cx += ejColWidths[1];
    doc.text("Cost", cx, y);
    y += 12;
    doc.moveTo(40, y).lineTo(40 + 420, y).strokeColor(borderColor).lineWidth(0.5).stroke();
    y += 4;

    if (isSalary) {
      // For salary employees: show each assigned project with equal split
      const perProject = tc.salaryProjects.length > 0 ? salaryAmt / tc.salaryProjects.length : 0;
      const jobMap = await db.getAllJobs();
      const jobNameMap = new Map(jobMap.map((j: any) => [j.id, j.name]));
      for (const projId of tc.salaryProjects) {
        doc.fontSize(9).fillColor(textColor);
        cx = 40;
        doc.text(jobNameMap.get(projId) || `Job #${projId}`, cx, y, { width: ejColWidths[0] }); cx += ejColWidths[0];
        doc.text(`${fmtMoney(perProject)} / ${tc.salaryProjects.length} proj`, cx, y, { width: ejColWidths[1] }); cx += ejColWidths[1];
        doc.text(fmtMoney(perProject), cx, y, { width: ejColWidths[2] });
        y += 14;
      }
    } else {
      const empJobMap = new Map<number, { name: string; minutes: number; cost: number }>();
      for (const day of tc.days) {
        for (const entry of day.entries) {
          const ej = empJobMap.get(entry.jobId) || { name: entry.jobName, minutes: 0, cost: 0 };
          ej.minutes += entry.durationMinutes;
          ej.cost += (entry.durationMinutes / 60) * rate;
          empJobMap.set(entry.jobId, ej);
        }
      }
      for (const [, ej] of empJobMap) {
        doc.fontSize(9).fillColor(textColor);
        cx = 40;
        doc.text(ej.name, cx, y, { width: ejColWidths[0] }); cx += ejColWidths[0];
        doc.text(`${fmtHours(ej.minutes)} hrs`, cx, y, { width: ejColWidths[1] }); cx += ejColWidths[1];
        doc.text(fmtMoney(ej.cost), cx, y, { width: ejColWidths[2] });
        y += 14;
      }
    }
    y += 10;

    // Daily detail table
    doc.fontSize(10).fillColor(gold).text("Daily Time Detail", 40, y);
    y += 14;

    const colWidths = [90, 70, 70, 160, 70];
    const headers = ["Date", "Clock In", "Clock Out", "Job Site", "Hours"];
    doc.fontSize(8).fillColor(mutedColor);
    cx = 40;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], cx, y, { width: colWidths[i] });
      cx += colWidths[i];
    }
    y += 12;
    doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
    y += 4;

    for (const day of tc.days) {
      if (y > 690) { doc.addPage(); y = 40; }

      // Day header
      doc.rect(40, y, pageWidth, 16).fill("#f0f0f0");
      doc.fontSize(9).fillColor(textColor).font("Helvetica-Bold");
      doc.text(fmtDate(day.date), 44, y + 3, { width: 300 });
      doc.text(`Day Total: ${fmtDuration(day.totalMinutes)} (${fmtHours(day.totalMinutes)} hrs)`, 40, y + 3, { width: pageWidth - 8, align: "right" });
      doc.font("Helvetica");
      y += 20;

      for (const entry of day.entries) {
        if (y > 700) { doc.addPage(); y = 40; }
        doc.fontSize(9).fillColor(textColor);
        cx = 40;
        doc.text("", cx, y, { width: colWidths[0] }); cx += colWidths[0];
        doc.text(fmtTime(entry.clockIn), cx, y, { width: colWidths[1] }); cx += colWidths[1];
        doc.text(entry.clockOut ? fmtTime(entry.clockOut) : "Active", cx, y, { width: colWidths[2] }); cx += colWidths[2];
        doc.text(entry.jobName, cx, y, { width: colWidths[3] }); cx += colWidths[3];
        doc.text(fmtDuration(entry.durationMinutes), cx, y, { width: colWidths[4] });
        y += 14;
      }
      y += 4;
    }

    // Employee total footer
    y += 4;
    doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(gold).lineWidth(1).stroke();
    y += 8;
    doc.fontSize(10).fillColor(textColor).font("Helvetica-Bold");
    if (isSalary) {
      doc.text(`PAY TYPE: Biweekly Salary`, 40, y);
      doc.text(`TOTAL PAY: ${fmtMoney(totalPay)}`, 250, y);
    } else {
      doc.text(`TOTAL: ${fmtHours(tc.totalMinutes)} hours`, 40, y);
      doc.text(`ESTIMATED PAY: ${fmtMoney(totalPay)}`, 250, y);
    }
    doc.font("Helvetica");
  }
}

// ─── Main PDF Generation ─────────────────────────────────────────────────
export async function generateDetailedPayrollPDF(
  startDate: Date,
  endDate: Date,
  reportType: ReportType = "full"
): Promise<Buffer> {
  const { timecards, jobCosts, totalPayroll, totalHours } = await buildReportData(startDate, endDate);

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = 612 - 80;
  const gold = "#D4AF37";

  // Cover header (always shown)
  renderCoverHeader(doc, startDate, endDate, reportType, pageWidth, gold);

  let y = 120;

  // Render sections based on reportType
  if (reportType === "full" || reportType === "payroll") {
    y = renderPayrollSummary(doc, timecards, totalPayroll, totalHours, pageWidth, gold, y);
  }

  if (reportType === "full" || reportType === "jobcost") {
    if (reportType === "full") {
      doc.addPage();
      y = 40;
    }
    y = renderJobCostSummary(doc, jobCosts, totalHours, totalPayroll, pageWidth, gold, y);
  }

  if (reportType === "full" || reportType === "employee") {
    await renderEmployeeDetail(doc, timecards, pageWidth, gold);
  }

  // Footer on all pages
  const mutedColor = "#666666";
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(mutedColor);
    doc.text(
      `Carranza Custom Construction — ${REPORT_TITLES[reportType]} — Page ${i + 1} of ${pageCount}`,
      40, 752, { width: pageWidth, align: "center" }
    );
    doc.text(
      `Generated: ${new Date().toLocaleString("en-US", { timeZone: TZ })} MT`,
      40, 762, { width: pageWidth, align: "center" }
    );
  }

  // Finalize and collect
  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
