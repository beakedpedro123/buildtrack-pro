import PDFDocument from "pdfkit";
import { getCompanyBranding, type CompanyBranding } from "./pdf-branding";
import * as db from "./db";
import path from "path";
import fs from "fs";

// ─── Types ────────────────────────────────────────────────────────────────
export type ReportType = "full" | "payroll" | "jobcost" | "employee";

interface DayEntry {
  id: number;
  clockIn: Date;
  clockOut: Date | null;
  jobId: number;
  jobName: string;
  durationMinutes: number;
  lunchMinutes: number;
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
  totalLunchMinutes: number;
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

// ─── Logo loader ────────────────────────────────────────────────────────
let logoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (logoBuffer) return logoBuffer;
  try {
    const logoPath = path.join(__dirname, "logo.png");
    if (fs.existsSync(logoPath)) {
      logoBuffer = fs.readFileSync(logoPath);
      return logoBuffer;
    }
    // Fallback: check assets directory
    const altPath = path.join(__dirname, "..", "assets", "images", "icon.png");
    if (fs.existsSync(altPath)) {
      logoBuffer = fs.readFileSync(altPath);
      return logoBuffer;
    }
  } catch {}
  return null;
}

// ─── Shared data builder ─────────────────────────────────────────────────
async function buildReportData(startDate: Date, endDate: Date, filterJobId?: number, companyId?: number) {
  const allEmployees = await db.getAllEmployees(companyId);
  const activeEmployees = allEmployees.filter(e => e.isActive !== false);
  const allJobs = await db.getAllJobs(companyId);
  const activeJobs = allJobs.filter(j => j.status === "active");
  const jobMap = new Map(allJobs.map(j => [j.id, j]));
  const entries = await db.getClockEntriesForPayroll(startDate, endDate, companyId);
  const employeeMap = new Map(activeEmployees.map(e => [e.id, e]));

  // Group entries by employee
  const byEmployee = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!entry.clockOut) continue;
    // If filtering by job, only include entries for that job
    if (filterJobId && entry.jobId !== filterJobId) continue;
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
      const dayKey = new Date(entry.clockIn).toLocaleDateString("en-CA", { timeZone: TZ });
      const list = dayMap.get(dayKey) || [];
      const durationMs = new Date(entry.clockOut!).getTime() - new Date(entry.clockIn).getTime();
      const minutes = Math.round(durationMs / 60000);
      const entryLunch = (entry as any).lunchMinutes || 0;
      totalMinutes += minutes;
      const job = jobMap.get(entry.jobId);
      list.push({
        id: entry.id,
        clockIn: new Date(entry.clockIn),
        clockOut: entry.clockOut ? new Date(entry.clockOut) : null,
        jobId: entry.jobId,
        jobName: job?.name || `Job #${entry.jobId}`,
        durationMinutes: minutes,
        lunchMinutes: entryLunch,
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
    // Calculate total lunch minutes from per-entry data
    let totalLunchMinutes = 0;
    for (const day of days) {
      for (const e of day.entries) {
        totalLunchMinutes += e.lunchMinutes || 0;
      }
    }
    // Also apply company-level auto-deduction if no per-entry lunch
    if (totalLunchMinutes === 0) {
      const company = companyId ? await db.getCompanyById(companyId) : null;
      if (company?.lunchAutoDeduct) {
        const skipDays = company.lunchSkipDays ? company.lunchSkipDays.split(",").map(Number) : [5];
        for (const day of days) {
          const dow = new Date(day.date + "T12:00:00").getDay();
          if (!skipDays.includes(dow) && day.totalMinutes >= (company.lunchMinShiftMinutes || 360)) {
            totalLunchMinutes += company.lunchDeductMinutes || 30;
          }
        }
      }
    }
    timecards.push({
      employeeId: empId,
      name: emp.name,
      role: emp.role,
      hourlyRate: emp.hourlyRate ?? null,
      payType: emp.payType || "hourly",
      salaryAmount: emp.salaryAmount ?? null,
      salaryProjects,
      days,
      totalMinutes: Math.max(0, totalMinutes - totalLunchMinutes),
      totalLunchMinutes,
    });
  }

  const roleOrder = ["owner", "office_manager", "logistics", "foreman", "laborer"];
  timecards.sort((a, b) => {
    const ri = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
    if (ri !== 0) return ri;
    return a.name.localeCompare(b.name);
  });

  // Also include salary employees who had NO clock entries (they still cost money)
  // For per-job reports, only include salary employees if they're allocated to that job
  for (const emp of activeEmployees) {
    if (emp.payType === "salary" && !byEmployee.has(emp.id)) {
      let salaryProjects: number[] = [];
      try { salaryProjects = emp.salaryProjects ? JSON.parse(emp.salaryProjects) : []; } catch {}
      
      // If filtering by job, only include if salary is allocated to this job
      if (filterJobId) {
        // Salary employees are allocated across ALL active jobs
        if (!activeJobs.find(j => j.id === filterJobId)) continue;
      }
      
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
        totalLunchMinutes: 0,
      });
    }
  }

  // Job cost summary — salary employees split across ALL active jobs (not just salaryProjects)
  const jobCosts = new Map<number, { name: string; budget: number; totalMinutes: number; totalCost: number; salaryCost: number; employees: Map<string, { minutes: number; cost: number; isSalary: boolean }> }>();
  
  // Initialize job cost entries for active jobs
  for (const job of allJobs) {
    if (filterJobId && job.id !== filterJobId) continue;
    jobCosts.set(job.id, {
      name: job.name,
      budget: job.totalBudget ? parseFloat(job.totalBudget) : 0,
      totalMinutes: 0,
      totalCost: 0,
      salaryCost: 0,
      employees: new Map(),
    });
  }

  for (const tc of timecards) {
    if (tc.payType === "salary") {
      // Distribute salary cost across ALL active jobs evenly
      const salaryAmt = tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0;
      if (salaryAmt > 0 && activeJobs.length > 0) {
        const perProject = salaryAmt / activeJobs.length;
        for (const job of activeJobs) {
          if (filterJobId && job.id !== filterJobId) continue;
          const jc = jobCosts.get(job.id) || { name: job.name, budget: job.totalBudget ? parseFloat(job.totalBudget) : 0, totalMinutes: 0, totalCost: 0, salaryCost: 0, employees: new Map() };
          jc.salaryCost += perProject;
          jc.totalCost += perProject;
          jc.employees.set(tc.name, { minutes: 0, cost: perProject, isSalary: true });
          jobCosts.set(job.id, jc);
        }
      }
    } else {
      const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
      for (const day of tc.days) {
        for (const entry of day.entries) {
          if (filterJobId && entry.jobId !== filterJobId) continue;
          const job = jobMap.get(entry.jobId);
          const jc = jobCosts.get(entry.jobId) || { name: entry.jobName, budget: job?.totalBudget ? parseFloat(job.totalBudget) : 0, totalMinutes: 0, totalCost: 0, salaryCost: 0, employees: new Map() };
          jc.totalMinutes += entry.durationMinutes;
          jc.totalCost += (entry.durationMinutes / 60) * rate;
          const existing = jc.employees.get(tc.name) || { minutes: 0, cost: 0, isSalary: false };
          existing.minutes += entry.durationMinutes;
          existing.cost += (entry.durationMinutes / 60) * rate;
          jc.employees.set(tc.name, existing);
          jobCosts.set(entry.jobId, jc);
        }
      }
    }
  }

  const activeJobCount = activeJobs.length;
  const totalPayroll = timecards.reduce((sum, tc) => {
    if (tc.payType === "salary") {
      const fullSalary = tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0;
      // When filtering by job, only count the allocated portion of salary
      return sum + (filterJobId && activeJobCount > 0 ? fullSalary / activeJobCount : fullSalary);
    }
    const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
    return sum + (tc.totalMinutes / 60) * rate;
  }, 0);
  const totalHours = timecards.reduce((sum, tc) => sum + tc.totalMinutes, 0);

  return { timecards, jobCosts, totalPayroll, totalHours, activeJobs, jobMap, activeJobCount, isFiltered: !!filterJobId };
}

// ─── Page header with logo ──────────────────────────────────────────────
function renderPageHeader(
  doc: PDFKit.PDFDocument,
  startDate: Date,
  endDate: Date,
  reportType: ReportType,
  pageWidth: number,
  gold: string,
  jobName?: string,
  branding?: CompanyBranding
) {
  const logo = branding?.logoBuffer || getLogoBuffer();
  const companyDisplayName = branding?.companyName || "BuildTrack Pro";
  doc.rect(0, 0, 612, 90).fill("#1a1a1a");
  
  let textX = 40;
  if (logo) {
    try {
      doc.image(logo, 16, 10, { width: 70, height: 70 });
      textX = 94;
    } catch {}
  }
  
  doc.fontSize(20).fillColor("#ffffff").text(companyDisplayName, textX, 18, { width: pageWidth - (textX - 40) });
  const subtitle = jobName ? `${REPORT_TITLES[reportType]} — ${jobName}` : REPORT_TITLES[reportType];
  doc.fontSize(10).fillColor(gold).text(subtitle, textX, 44);
  doc.fontSize(9).fillColor("#cccccc").text(
    `Period: ${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ })} — ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TZ })}`,
    textX, 60
  );
}

// ─── PDF Section Renderers ───────────────────────────────────────────────

function renderPayrollSummary(
  doc: PDFKit.PDFDocument,
  timecards: EmployeeTimecard[],
  totalPayroll: number,
  totalHours: number,
  pageWidth: number,
  gold: string,
  startY: number,
  billingRate?: number,
  activeJobCount?: number,
  isFiltered?: boolean
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

  // If billing rate is provided, show billing summary
  if (billingRate) {
    const hourlyTotal = timecards.filter(tc => tc.payType !== "salary").reduce((sum, tc) => sum + tc.totalMinutes, 0);
    const billingTotal = (hourlyTotal / 60) * billingRate;
    doc.fontSize(11).fillColor(gold).text(`BILLING RATE: ${fmtMoney(billingRate)}/hr`, 40, y);
    doc.fontSize(11).fillColor(textColor).text(`  |  Billable Hours: ${fmtHours(hourlyTotal)}  |  Total Billing: ${fmtMoney(billingTotal)}`, 230, y);
    y += 20;
  }

  // Per-employee payroll table
  doc.fontSize(12).fillColor(gold).text("Employee Payroll Breakdown", 40, y);
  y += 18;

  // FIX: Use proper column widths to prevent text overlap
  const colWidths = [140, 80, 65, 65, 80, pageWidth - 430];
  const headers = ["Employee", "Role", "Hours", "Rate", "Est. Pay", "Days"];
  doc.fontSize(8).fillColor(mutedColor);
  let cx = 40;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx, y, { width: colWidths[i], lineBreak: false });
    cx += colWidths[i];
  }
  y += 14;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;

  for (const tc of timecards) {
    if (y > 700) { doc.addPage(); y = 40; }
    const isSalary = tc.payType === "salary";
    const rate = tc.hourlyRate ? parseFloat(tc.hourlyRate) : 0;
    const fullSalary = tc.salaryAmount ? parseFloat(tc.salaryAmount) : 0;
    // When filtering by job, show allocated portion of salary, not full amount
    const pay = isSalary ? (isFiltered && activeJobCount && activeJobCount > 0 ? fullSalary / activeJobCount : fullSalary) : (tc.totalMinutes / 60) * rate;
    doc.fontSize(9).fillColor(textColor);
    cx = 40;
    // FIX: Use lineBreak: false and ellipsis to prevent name overflow
    doc.text(tc.name, cx, y, { width: colWidths[0] - 4, lineBreak: false, ellipsis: true }); cx += colWidths[0];
    doc.text(ROLE_LABELS[tc.role] || tc.role, cx, y, { width: colWidths[1] - 4, lineBreak: false, ellipsis: true }); cx += colWidths[1];
    const hoursText = isSalary ? "Salary" : (tc.totalLunchMinutes > 0 ? `${fmtHours(tc.totalMinutes)} (-${tc.totalLunchMinutes}m)` : fmtHours(tc.totalMinutes));
    doc.text(hoursText, cx, y, { width: colWidths[2], lineBreak: false }); cx += colWidths[2];
    doc.text(isSalary ? "Salary" : (tc.hourlyRate ? fmtMoney(rate) : "—"), cx, y, { width: colWidths[3], lineBreak: false }); cx += colWidths[3];
    doc.text(fmtMoney(pay), cx, y, { width: colWidths[4], lineBreak: false }); cx += colWidths[4];
    doc.text(isSalary ? `${tc.salaryProjects.length} proj` : `${tc.days.length}`, cx, y, { width: colWidths[5], lineBreak: false });
    y += 16;
  }

  // Total row
  y += 4;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;
  doc.fontSize(9).fillColor(textColor).font("Helvetica-Bold");
  cx = 40;
  doc.text("TOTAL", cx, y, { width: colWidths[0], lineBreak: false }); cx += colWidths[0];
  doc.text("", cx, y, { width: colWidths[1] }); cx += colWidths[1];
  doc.text(fmtHours(totalHours), cx, y, { width: colWidths[2], lineBreak: false }); cx += colWidths[2];
  doc.text("", cx, y, { width: colWidths[3] }); cx += colWidths[3];
  doc.text(fmtMoney(totalPayroll), cx, y, { width: colWidths[4], lineBreak: false });
  doc.font("Helvetica");
  y += 24;

  return y;
}

function renderJobCostSummary(
  doc: PDFKit.PDFDocument,
  jobCosts: Map<number, { name: string; budget: number; totalMinutes: number; totalCost: number; salaryCost: number; employees: Map<string, { minutes: number; cost: number; isSalary: boolean }> }>,
  totalHours: number,
  totalPayroll: number,
  pageWidth: number,
  gold: string,
  startY: number,
  billingRate?: number
): number {
  const textColor = "#333333";
  const mutedColor = "#666666";
  const borderColor = "#e0e0e0";
  let y = startY;

  doc.fontSize(14).fillColor(gold).text("JOB COST SUMMARY", 40, y);
  y += 22;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(gold).lineWidth(1).stroke();
  y += 8;

  // FIX: Proper column widths — Employees column uses wrapping with measured height
  const jobColWidths = [160, 70, 80, 60, pageWidth - 370];
  const jobHeaders = ["Job Site", "Hours", "Labor Cost", "Workers", "Employees"];
  doc.fontSize(8).fillColor(mutedColor);
  let cx = 40;
  for (let i = 0; i < jobHeaders.length; i++) {
    doc.text(jobHeaders[i], cx, y, { width: jobColWidths[i], lineBreak: false });
    cx += jobColWidths[i];
  }
  y += 14;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;

  const sortedJobs = Array.from(jobCosts.entries())
    .map(([id, jc]) => ({ id, ...jc }))
    .filter(jc => jc.totalCost > 0 || jc.salaryCost > 0)
    .sort((a, b) => b.totalCost - a.totalCost);

  for (const jc of sortedJobs) {
    // FIX: Calculate the height needed for employee names to prevent overlap
    const empNames = Array.from(jc.employees.keys());
    const empText = empNames.join(", ");
    const empColWidth = jobColWidths[4] - 4;
    // Estimate lines needed: ~10 chars per line at font size 8
    const estimatedLines = Math.ceil(empText.length / (empColWidth / 4.5));
    const rowHeight = Math.max(16, estimatedLines * 10 + 4);

    if (y + rowHeight > 700) { doc.addPage(); y = 40; }
    
    doc.fontSize(9).fillColor(textColor);
    cx = 40;
    // Job name — single line, truncated
    doc.text(jc.name, cx, y, { width: jobColWidths[0] - 4, lineBreak: false, ellipsis: true }); cx += jobColWidths[0];
    doc.text(fmtHours(jc.totalMinutes), cx, y, { width: jobColWidths[1], lineBreak: false }); cx += jobColWidths[1];
    doc.text(fmtMoney(jc.totalCost), cx, y, { width: jobColWidths[2], lineBreak: false }); cx += jobColWidths[2];
    doc.text(`${jc.employees.size}`, cx, y, { width: jobColWidths[3], lineBreak: false }); cx += jobColWidths[3];
    // FIX: Employee names — allow wrapping within the column
    doc.fontSize(7).fillColor(mutedColor).text(empText, cx, y, { width: empColWidth, lineBreak: true });
    y += rowHeight;
  }

  // Billing rate summary for hourly jobs
  if (billingRate) {
    y += 8;
    doc.fontSize(11).fillColor(gold).text("HOURLY JOB BILLING SUMMARY", 40, y);
    y += 16;
    
    for (const jc of sortedJobs) {
      const job = jc as any;
      // No-budget jobs are "hourly" jobs
      if (jc.budget > 0) continue;
      const hourlyMinutes = Array.from(jc.employees.values())
        .filter(e => !e.isSalary)
        .reduce((sum, e) => sum + e.minutes, 0);
      if (hourlyMinutes === 0) continue;
      
      if (y > 700) { doc.addPage(); y = 40; }
      const billingTotal = (hourlyMinutes / 60) * billingRate;
      doc.fontSize(9).fillColor(textColor);
      doc.text(`${jc.name}:  ${fmtHours(hourlyMinutes)} hrs × ${fmtMoney(billingRate)}/hr = `, 50, y, { continued: true });
      doc.font("Helvetica-Bold").text(fmtMoney(billingTotal), { continued: false });
      doc.font("Helvetica");
      y += 16;
    }
    y += 8;
  }

  // Job totals
  y += 4;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(borderColor).lineWidth(0.5).stroke();
  y += 6;
  doc.fontSize(9).fillColor(textColor).font("Helvetica-Bold");
  cx = 40;
  doc.text("TOTAL", cx, y, { width: jobColWidths[0], lineBreak: false }); cx += jobColWidths[0];
  doc.text(fmtHours(totalHours), cx, y, { width: jobColWidths[1], lineBreak: false }); cx += jobColWidths[1];
  doc.text(fmtMoney(totalPayroll), cx, y, { width: jobColWidths[2], lineBreak: false });
  doc.font("Helvetica");
  y += 24;

  // Per-job detail: which employees worked on each job and how many hours
  doc.fontSize(12).fillColor(gold).text("Per-Job Employee Breakdown", 40, y);
  y += 18;

  for (const jc of sortedJobs) {
    if (y > 660) { doc.addPage(); y = 40; }
    const isHourlyJob = jc.budget === 0;
    doc.fontSize(10).fillColor(textColor).font("Helvetica-Bold").text(jc.name, 40, y);
    doc.font("Helvetica");
    const summaryParts = [`${fmtHours(jc.totalMinutes)} hrs`, fmtMoney(jc.totalCost), `${jc.employees.size} workers`];
    if (isHourlyJob) summaryParts.push("(Hourly Job)");
    if (jc.salaryCost > 0) summaryParts.push(`Salary alloc: ${fmtMoney(jc.salaryCost)}`);
    doc.fontSize(8).fillColor(mutedColor).text(summaryParts.join(" | "), 40, y + 14);
    y += 32;

    // List employees for this job with their hours and cost
    for (const [empName, empData] of jc.employees) {
      if (y > 720) { doc.addPage(); y = 40; }
      if (empData.isSalary) {
        doc.fontSize(9).fillColor(textColor).text(`  • ${empName}`, 50, y, { width: 200, lineBreak: false, ellipsis: true });
        doc.fontSize(8).fillColor(mutedColor).text(`Salary: ${fmtMoney(empData.cost)}`, 260, y);
      } else {
        doc.fontSize(9).fillColor(textColor).text(`  • ${empName}`, 50, y, { width: 200, lineBreak: false, ellipsis: true });
        doc.fontSize(8).fillColor(mutedColor).text(`${fmtHours(empData.minutes)} hrs — ${fmtMoney(empData.cost)}`, 260, y);
      }
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
  gold: string,
  activeJobs: any[]
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
    doc.fontSize(14).fillColor("#ffffff").text(tc.name.toUpperCase(), 52, y + 6, { width: pageWidth - 120, lineBreak: false, ellipsis: true });
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
      doc.text(`Split Across: ${activeJobs.length} active jobs`, 380, y);
    } else {
      if (tc.hourlyRate) doc.text(`Hourly Rate: ${fmtMoney(rate)}`, 40, y);
      doc.text(`Total Days Worked: ${tc.days.length}`, 200, y);
      doc.text(`Total Hours: ${fmtDuration(tc.totalMinutes)}`, 360, y);
    }
    y += 18;

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
      // Salary employees: split across ALL active jobs evenly
      const perProject = activeJobs.length > 0 ? salaryAmt / activeJobs.length : 0;
      for (const job of activeJobs) {
        if (y > 700) { doc.addPage(); y = 40; }
        doc.fontSize(9).fillColor(textColor);
        cx = 40;
        doc.text(job.name, cx, y, { width: ejColWidths[0] - 4, lineBreak: false, ellipsis: true }); cx += ejColWidths[0];
        doc.text(`1/${activeJobs.length} of salary`, cx, y, { width: ejColWidths[1], lineBreak: false }); cx += ejColWidths[1];
        doc.text(fmtMoney(perProject), cx, y, { width: ejColWidths[2], lineBreak: false });
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
        if (y > 700) { doc.addPage(); y = 40; }
        doc.fontSize(9).fillColor(textColor);
        cx = 40;
        doc.text(ej.name, cx, y, { width: ejColWidths[0] - 4, lineBreak: false, ellipsis: true }); cx += ejColWidths[0];
        doc.text(`${fmtHours(ej.minutes)} hrs`, cx, y, { width: ejColWidths[1], lineBreak: false }); cx += ejColWidths[1];
        doc.text(fmtMoney(ej.cost), cx, y, { width: ejColWidths[2], lineBreak: false });
        y += 14;
      }
    }
    y += 10;

    // Daily detail table
    if (tc.days.length > 0) {
      doc.fontSize(10).fillColor(gold).text("Daily Time Detail", 40, y);
      y += 14;

      const colWidths = [90, 70, 70, 160, 70];
      const headers = ["Date", "Clock In", "Clock Out", "Job Site", "Hours"];
      doc.fontSize(8).fillColor(mutedColor);
      cx = 40;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], cx, y, { width: colWidths[i], lineBreak: false });
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
        doc.text(fmtDate(day.date), 44, y + 3, { width: 300, lineBreak: false });
        doc.text(`Day Total: ${fmtDuration(day.totalMinutes)} (${fmtHours(day.totalMinutes)} hrs)`, 40, y + 3, { width: pageWidth - 8, align: "right" });
        doc.font("Helvetica");
        y += 20;

        for (const entry of day.entries) {
          if (y > 700) { doc.addPage(); y = 40; }
          doc.fontSize(9).fillColor(textColor);
          cx = 40;
          doc.text("", cx, y, { width: colWidths[0] }); cx += colWidths[0];
          doc.text(fmtTime(entry.clockIn), cx, y, { width: colWidths[1], lineBreak: false }); cx += colWidths[1];
          doc.text(entry.clockOut ? fmtTime(entry.clockOut) : "Active", cx, y, { width: colWidths[2], lineBreak: false }); cx += colWidths[2];
          doc.text(entry.jobName, cx, y, { width: colWidths[3] - 4, lineBreak: false, ellipsis: true }); cx += colWidths[3];
          doc.text(fmtDuration(entry.durationMinutes), cx, y, { width: colWidths[4], lineBreak: false });
          y += 14;
        }
        y += 4;
      }
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
  reportType: ReportType = "full",
  billingRate?: number,
  filterJobId?: number,
  companyId?: number
): Promise<Buffer> {
  const { timecards, jobCosts, totalPayroll, totalHours, activeJobs, activeJobCount, isFiltered } = await buildReportData(startDate, endDate, filterJobId, companyId);
  // If filtering by job, get the job name
  let filterJobName: string | undefined;;
  if (filterJobId) {
    const allJobs = await db.getAllJobs(companyId);
    const job = allJobs.find(j => j.id === filterJobId);
    filterJobName = job?.name;
  }

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = 612 - 80;
  // Fetch company branding (logo + color)
  const branding = await getCompanyBranding(companyId);
  const gold = branding.brandColor;

  // Cover header (always shown)
  renderPageHeader(doc, startDate, endDate, reportType, pageWidth, gold, filterJobName, branding);

  let y = 110;

  // Render sections based on reportType
  if (reportType === "full" || reportType === "payroll") {
    y = renderPayrollSummary(doc, timecards, totalPayroll, totalHours, pageWidth, gold, y, billingRate, activeJobCount, isFiltered);
  }

  if (reportType === "full" || reportType === "jobcost") {
    if (reportType === "full") {
      doc.addPage();
      y = 40;
    }
    y = renderJobCostSummary(doc, jobCosts, totalHours, totalPayroll, pageWidth, gold, y, billingRate);
  }

  if (reportType === "full" || reportType === "employee") {
    await renderEmployeeDetail(doc, timecards, pageWidth, gold, activeJobs);
  }

  // FIX: Add footer with logo on ALL pages, including any that would otherwise be blank
  const mutedColor = "#666666";
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    
    // Add logo watermark to footer area
    const logo = getLogoBuffer();
    if (logo) {
      try {
        doc.opacity(0.08).image(logo, 256, 320, { width: 100, height: 100 });
        doc.opacity(1);
      } catch {}
    }
    
    doc.fontSize(7).fillColor(mutedColor);
    doc.text(
      `Carranza Custom Construction — ${filterJobName ? filterJobName + " — " : ""}${REPORT_TITLES[reportType]} — Page ${i + 1} of ${pageCount}`,
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

// ─── Individual Employee Timecard PDF ────────────────────────────────────
export async function generateEmployeeTimecardPDF(
  employeeId: number,
  startDate: Date,
  endDate: Date,
  companyId?: number
): Promise<Buffer> {
  const { timecards, activeJobs } = await buildReportData(startDate, endDate, undefined, companyId);
  const tc = timecards.find(t => t.employeeId === employeeId);
  
  if (!tc) {
    // Generate empty timecard
    const emp = (await db.getAllEmployees(companyId)).find(e => e.id === employeeId);
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pageWidth = 612 - 80;
    const branding = await getCompanyBranding(companyId);
    const gold = branding.brandColor;
    renderPageHeader(doc, startDate, endDate, "employee", pageWidth, gold, undefined, branding);
    doc.fontSize(16).fillColor("#333").text(`${emp?.name || "Employee"} — No hours recorded`, 40, 130);
    doc.fontSize(12).fillColor("#666").text("No clock entries found for this period.", 40, 160);
    return new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    });
  }

  // Generate single-employee PDF
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const pageWidth = 612 - 80;
  const gold = "#D4AF37";

  renderPageHeader(doc, startDate, endDate, "employee", pageWidth, gold);
  
  // Render just this employee's detail on the first page
  await renderEmployeeDetail(doc, [tc], pageWidth, gold, activeJobs);

  // Footer on all pages
  const mutedColor = "#666666";
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor(mutedColor);
    doc.text(
      `${tc.name} — Individual Timecard — Page ${i + 1} of ${pageCount}`,
      40, 752, { width: pageWidth, align: "center" }
    );
    doc.text(
      `Generated: ${new Date().toLocaleString("en-US", { timeZone: TZ })} MT`,
      40, 762, { width: pageWidth, align: "center" }
    );
  }

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
