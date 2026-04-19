import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { generateImage } from "./_core/imageGeneration";

// Helper: assert that the requesting employee has one of the allowed roles
async function assertRole(requestingId: number, allowedRoles: string[], action: string) {
  const requester = await db.getEmployeeById(requestingId);
  if (!requester || !allowedRoles.includes(requester.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Only ${allowedRoles.join("/")} can ${action}.` });
  }
  return requester;
}

const employeeRouter = router({
  list: publicProcedure.query(() => db.getAllEmployees()),
  getById: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getEmployeeById(input.id)),
  verifyPin: publicProcedure.input(z.object({ pin: z.string() })).mutation(({ input }) => db.getEmployeeByPin(input.pin)),
  create: publicProcedure.input(z.object({
    name: z.string().min(1).max(128),
    role: z.enum(["owner", "office_manager", "logistics", "foreman", "laborer"]),
    pin: z.string().min(4).max(6),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    hourlyRate: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "add employees");
    const { requestingEmployeeId: _, ...data } = input;
    return db.createEmployee(data);
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).max(128).optional(),
    role: z.enum(["owner", "office_manager", "logistics", "foreman", "laborer"]).optional(),
    pin: z.string().min(4).max(6).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    hourlyRate: z.string().optional(),
    payType: z.enum(["hourly", "salary"]).optional(),
    salaryAmount: z.string().optional(),
    salaryProjects: z.string().optional(),
    isActive: z.boolean().optional(),
    requestingEmployeeId: z.number().optional(),
  })).mutation(async ({ input }) => {
    if (input.requestingEmployeeId) {
      await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "update employee records");
    }
    const { id, requestingEmployeeId: _, ...data } = input;
    return db.updateEmployee(id, data);
  }),
  deactivate: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "deactivate employees");
    return db.deactivateEmployee(input.id);
  }),
  createWithInvite: publicProcedure.input(z.object({
    name: z.string().min(1).max(128),
    role: z.enum(["owner", "office_manager", "logistics", "foreman", "laborer"]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    hourlyRate: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "add employees");
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const { requestingEmployeeId: _, ...data } = input;
    const id = await db.createEmployee({ ...data, pin: "0000", inviteToken: token, inviteStatus: "pending" });
    return { id, inviteToken: token };
  }),
  getByInviteToken: publicProcedure.input(z.object({ token: z.string() })).query(({ input }) => db.getEmployeeByInviteToken(input.token)),
  acceptInvite: publicProcedure.input(z.object({
    token: z.string(),
    name: z.string().min(1).max(128),
    pin: z.string().min(4).max(6),
  })).mutation(({ input }) => db.acceptInvite(input.token, input.name, input.pin)),
});

const jobsRouter = router({
  list: publicProcedure.query(async () => {
    const allJobs = await db.getAllJobs();
    // Fetch labor costs for all jobs in one pass
    const allEntries = await db.getAllClockEntries();
    const allEmployees = await db.getAllEmployees();
    const empMap = new Map(allEmployees.map((e: any) => [e.id, e]));
    const allExpenses = await db.getAllExpenses();
    // Aggregate labor + expenses per job
    const laborByJob: Record<number, number> = {};
    for (const entry of allEntries) {
      if (!entry.clockOut) continue;
      const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
      const emp = empMap.get(entry.employeeId);
      const cost = emp?.hourlyRate ? (mins / 60) * parseFloat(emp.hourlyRate) : 0;
      laborByJob[entry.jobId] = (laborByJob[entry.jobId] || 0) + cost;
    }
    const expenseByJob: Record<number, number> = {};
    for (const exp of allExpenses) {
      expenseByJob[exp.jobId] = (expenseByJob[exp.jobId] || 0) + parseFloat(exp.amount || "0");
    }
    return allJobs.map((job: any) => ({
      ...job,
      spentAmount: Math.round(((laborByJob[job.id] || 0) + (expenseByJob[job.id] || 0)) * 100) / 100,
    }));
  }),
  listActive: publicProcedure.query(async () => {
    const activeJobs = await db.getActiveJobs();
    const allEntries = await db.getAllClockEntries();
    const allEmployees = await db.getAllEmployees();
    const empMap = new Map(allEmployees.map((e: any) => [e.id, e]));
    const allExpenses = await db.getAllExpenses();
    const laborByJob: Record<number, number> = {};
    for (const entry of allEntries) {
      if (!entry.clockOut) continue;
      const mins = Math.max(0, Math.floor((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000));
      const emp = empMap.get(entry.employeeId);
      const cost = emp?.hourlyRate ? (mins / 60) * parseFloat(emp.hourlyRate) : 0;
      laborByJob[entry.jobId] = (laborByJob[entry.jobId] || 0) + cost;
    }
    const expenseByJob: Record<number, number> = {};
    for (const exp of allExpenses) {
      expenseByJob[exp.jobId] = (expenseByJob[exp.jobId] || 0) + parseFloat(exp.amount || "0");
    }
    return activeJobs.map((job: any) => ({
      ...job,
      spentAmount: Math.round(((laborByJob[job.id] || 0) + (expenseByJob[job.id] || 0)) * 100) / 100,
    }));
  }),
  getById: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getJobById(input.id)),
  forEmployee: publicProcedure.input(z.object({ employeeId: z.number() })).query(({ input }) => db.getJobsForEmployee(input.employeeId)),
  create: publicProcedure.input(z.object({
    name: z.string().min(1).max(255),
    address: z.string().optional(),
    clientName: z.string().optional(),
    clientPhone: z.string().optional(),
    totalBudget: z.string().optional(),
    notes: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    taxRate: z.string().optional(),
    workersCompRate: z.string().optional(),
    liabilityInsRate: z.string().optional(),
    createdBy: z.number(),
  })).mutation(({ input }) => {
    const data = { ...input, startDate: input.startDate ? new Date(input.startDate) : undefined, endDate: input.endDate ? new Date(input.endDate) : undefined };
    return db.createJob(data);
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
    clientName: z.string().optional(),
    status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
    totalBudget: z.string().optional(),
    notes: z.string().optional(),
    endDate: z.string().optional(),
    taxRate: z.string().optional(),
    workersCompRate: z.string().optional(),
    liabilityInsRate: z.string().optional(),
  })).mutation(({ input }) => {
    const { id, ...rest } = input;
    const data = { ...rest, endDate: rest.endDate ? new Date(rest.endDate) : undefined };
    return db.updateJob(id, data);
  }),
  assign: publicProcedure.input(z.object({ jobId: z.number(), employeeId: z.number(), role: z.enum(["foreman", "laborer"]).default("laborer") })).mutation(({ input }) => db.assignEmployeeToJob(input)),
  unassign: publicProcedure.input(z.object({ jobId: z.number(), employeeId: z.number() })).mutation(({ input }) => db.removeJobAssignment(input.jobId, input.employeeId)),
  getAssignments: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getJobAssignments(input.jobId)),
});

const clockRouter = router({
  in: publicProcedure.input(z.object({
    employeeId: z.number(),
    jobId: z.number(),
    clockIn: z.string(),
    clockOut: z.string().optional(),
    isOfflineEntry: z.boolean().default(false),
    localId: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { clockOut: clockOutStr, ...clockInData } = input;
    const result = await db.clockIn({ ...clockInData, clockIn: new Date(input.clockIn) });
    // If this is an offline entry with clockOut, also clock out immediately
    if (clockOutStr && result) {
      const entryId = typeof result === 'number' ? result : (result as any).insertId || (result as any).id;
      if (entryId) {
        await db.clockOut(entryId, new Date(clockOutStr));
      }
    }
    return result;
  }),
  out: publicProcedure.input(z.object({
    entryId: z.number(),
    clockOut: z.string(),
  })).mutation(({ input }) => db.clockOut(input.entryId, new Date(input.clockOut))),
  activeEntry: publicProcedure.input(z.object({ employeeId: z.number() })).query(({ input }) => db.getActiveClockEntry(input.employeeId)),
  history: publicProcedure.input(z.object({ employeeId: z.number(), since: z.string().optional() })).query(({ input }) => db.getClockEntriesForEmployee(input.employeeId, input.since ? new Date(input.since) : undefined)),
  forJob: publicProcedure.input(z.object({ jobId: z.number(), date: z.string().optional() })).query(({ input }) => db.getClockEntriesForJob(input.jobId, input.date ? new Date(input.date) : undefined)),
  allClockedIn: publicProcedure.query(() => db.getClockedInEmployees()),
  laborCostForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getLaborCostForJob(input.jobId)),
  updateEntry: publicProcedure.input(z.object({
    entryId: z.number(),
    clockIn: z.string().optional(),
    clockOut: z.string().optional(),
    jobId: z.number().optional(),
  })).mutation(({ input }) => db.updateClockEntry(input.entryId, {
    clockIn: input.clockIn ? new Date(input.clockIn) : undefined,
    clockOut: input.clockOut ? new Date(input.clockOut) : undefined,
    jobId: input.jobId,
  })),
  adjustEntry: publicProcedure.input(z.object({
    entryId: z.number(),
    clockIn: z.string().optional(),
    clockOut: z.string().optional(),
    jobId: z.number().optional(),
    adjustedBy: z.number(),
    reason: z.string().min(1),
    timezoneOffset: z.number().optional(), // Client's timezone offset in minutes
  })).mutation(async ({ input }) => {
    await assertRole(input.adjustedBy, ["owner", "office_manager", "logistics", "foreman"], "adjust time entries");
    let clockIn = input.clockIn ? new Date(input.clockIn) : undefined;
    let clockOut = input.clockOut ? new Date(input.clockOut) : undefined;
    // Apply same timezone correction as addManualEntry
    const MTN_OFFSET = 360;
    const clientOffset = input.timezoneOffset ?? null;
    if (clientOffset !== null && clientOffset !== MTN_OFFSET && clientOffset !== 420) {
      const diffMs = (clientOffset - MTN_OFFSET) * 60000;
      if (clockIn) clockIn = new Date(clockIn.getTime() + diffMs);
      if (clockOut) clockOut = new Date(clockOut.getTime() + diffMs);
    } else if (clientOffset === null) {
      if (clockIn) {
        const hourUTC = clockIn.getUTCHours();
        if (hourUTC >= 0 && hourUTC < 6) {
          if (clockIn) clockIn = new Date(clockIn.getTime() + MTN_OFFSET * 60000);
          if (clockOut) clockOut = new Date(clockOut.getTime() + MTN_OFFSET * 60000);
        }
      }
    }
    return db.updateClockEntryWithAdjustment(
      input.entryId,
      { clockIn, clockOut, jobId: input.jobId },
      input.adjustedBy,
      input.reason
    );
  }),
  getDetailedTimecard: publicProcedure.input(z.object({
    employeeId: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  })).query(({ input }) => db.getDetailedTimecard(
    input.employeeId,
    new Date(input.startDate),
    new Date(input.endDate)
  )),
  getAdjustments: publicProcedure.input(z.object({
    clockEntryId: z.number(),
  })).query(({ input }) => db.getAdjustmentsForEntry(input.clockEntryId)),
  addManualEntry: publicProcedure.input(z.object({
    employeeId: z.number(),
    jobId: z.number(),
    clockIn: z.string(),
    clockOut: z.string(),
    addedBy: z.number(),
    reason: z.string().min(1),
    timezoneOffset: z.number().optional(), // Client's timezone offset in minutes (e.g., 360 for MDT)
  })).mutation(async ({ input }) => {
    await assertRole(input.addedBy, ["owner", "office_manager", "logistics"], "add manual time entries");
    let clockIn = new Date(input.clockIn);
    let clockOut = new Date(input.clockOut);
    // Server-side timezone correction: if the client sends a timezone offset,
    // validate that the times make sense for Mountain Time (UTC-6 or UTC-7).
    // If the times look like they were created in UTC instead of local time,
    // apply the Mountain Time offset (MDT = -360 min, MST = -420 min).
    const MTN_OFFSET = 360; // MDT in minutes
    const clientOffset = input.timezoneOffset ?? null;
    if (clientOffset !== null && clientOffset !== MTN_OFFSET && clientOffset !== 420) {
      // Client is NOT in Mountain Time — adjust times to Mountain Time
      // The client sent times based on their local TZ, but we want Mountain Time
      const diffMs = (clientOffset - MTN_OFFSET) * 60000;
      clockIn = new Date(clockIn.getTime() + diffMs);
      clockOut = new Date(clockOut.getTime() + diffMs);
    } else if (clientOffset === null) {
      // No offset sent — check if times are suspiciously early (UTC interpretation)
      // A manual entry at 1-5 AM UTC for a construction worker likely means
      // the client's timezone was wrong (sent local time as UTC)
      const hourUTC = clockIn.getUTCHours();
      if (hourUTC >= 0 && hourUTC < 6) {
        // Likely a UTC-interpreted local time — shift by +6 hours (MDT)
        clockIn = new Date(clockIn.getTime() + MTN_OFFSET * 60000);
        clockOut = new Date(clockOut.getTime() + MTN_OFFSET * 60000);
      }
    }
    return db.addManualClockEntry({
      employeeId: input.employeeId,
      jobId: input.jobId,
      clockIn,
      clockOut,
      addedBy: input.addedBy,
      reason: input.reason,
    });
  }),
  deleteEntry: publicProcedure.input(z.object({
    entryId: z.number(),
    deletedBy: z.number(),
    reason: z.string().min(1),
  })).mutation(async ({ input }) => {
    await assertRole(input.deletedBy, ["owner", "office_manager", "logistics"], "delete time entries");
    return db.deleteClockEntry(input.entryId, input.deletedBy, input.reason);
  }),
});

const reportsRouter = router({
  create: publicProcedure.input(z.object({
    jobId: z.number(),
    submittedBy: z.number(),
    reportDate: z.string(),
    workCompleted: z.string().optional(),
    notes: z.string().optional(),
    weatherCondition: z.string().optional(),
    crewCount: z.number().default(0),
  })).mutation(({ input }) => db.createDailyReport({ ...input, reportDate: new Date(input.reportDate) })),
  forJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getDailyReportsForJob(input.jobId)),
  getById: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getDailyReportById(input.id)),
  recent: publicProcedure.input(z.object({ limit: z.number().default(10) })).query(({ input }) => db.getRecentReports(input.limit)),
  addMaterial: publicProcedure.input(z.object({
    reportId: z.number(),
    jobId: z.number(),
    materialName: z.string().min(1).max(255),
    quantity: z.string(),
    unit: z.string().default("units"),
    unitCost: z.string().optional(),
    totalCost: z.string().optional(),
    supplier: z.string().optional(),
  })).mutation(({ input }) => db.addMaterialEntry(input)),
  getMaterials: publicProcedure.input(z.object({ reportId: z.number() })).query(({ input }) => db.getMaterialsForReport(input.reportId)),
  getMaterialsForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getMaterialsForJob(input.jobId)),
  uploadPhoto: publicProcedure.input(z.object({
    reportId: z.number(),
    jobId: z.number(),
    uploadedBy: z.number(),
    base64: z.string(),
    mimeType: z.string().default("image/jpeg"),
    caption: z.string().optional(),
    url: z.string().optional(),
  })).mutation(async ({ input }) => {
    let photoUrl: string;
    if (input.url) {
      // Photo was already uploaded via /api/upload — just save the record
      photoUrl = input.url;
    } else {
      // Legacy: upload from base64
      const buffer = Buffer.from(input.base64, "base64");
      const key = `reports/${input.jobId}/${input.reportId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      photoUrl = url;
    }
    const photoId = await db.addReportPhoto({ reportId: input.reportId, jobId: input.jobId, uploadedBy: input.uploadedBy, url: photoUrl, caption: input.caption });
    return { id: photoId, url: photoUrl };
  }),
  getPhotos: publicProcedure.input(z.object({ reportId: z.number() })).query(({ input }) => db.getPhotosForReport(input.reportId)),
  getPhotosForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getPhotosForJob(input.jobId)),
  markSeen: publicProcedure.input(z.object({
    reportId: z.number(),
    seen: z.boolean(),
    requestingId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingId, ["owner"], "mark reports as seen");
    return db.markReportSeen(input.reportId, input.seen);
  }),
});

const budgetRouter = router({
  createCategory: publicProcedure.input(z.object({ jobId: z.number(), name: z.string().min(1).max(128), budgetedAmount: z.string() })).mutation(({ input }) => db.createBudgetCategory(input)),
  getCategories: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getBudgetCategoriesForJob(input.jobId)),
  updateCategory: publicProcedure.input(z.object({ id: z.number(), name: z.string().optional(), budgetedAmount: z.string().optional(), spentAmount: z.string().optional() })).mutation(({ input }) => { const { id, ...data } = input; return db.updateBudgetCategory(id, data); }),
  addExpense: publicProcedure.input(z.object({
    jobId: z.number(),
    categoryId: z.number().optional(),
    description: z.string().min(1).max(255),
    amount: z.string(),
    expenseDate: z.string(),
    submittedBy: z.number(),
  })).mutation(({ input }) => db.createExpense({ ...input, expenseDate: new Date(input.expenseDate) })),
  getExpenses: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getExpensesForJob(input.jobId)),
  syncToQB: publicProcedure.input(z.object({ triggeredBy: z.number(), syncType: z.enum(["expenses", "labor", "full"]).default("full") })).mutation(async ({ input }) => {
    const logId = await db.createSyncLog({ syncType: input.syncType, status: "pending", triggeredBy: input.triggeredBy, itemsSynced: 0 });
    try {
      const unsyncedExpenses = await db.getUnsyncedExpenses();
      for (const expense of unsyncedExpenses) { await db.markExpenseSynced(expense.id); }
      await db.updateSyncLog(logId, { status: "success", itemsSynced: unsyncedExpenses.length, completedAt: new Date() });
      return { success: true, itemsSynced: unsyncedExpenses.length, logId };
    } catch (error) {
      await db.updateSyncLog(logId, { status: "failed", errorMessage: String(error), completedAt: new Date() });
      throw error;
    }
  }),
  getSyncLogs: publicProcedure.input(z.object({ limit: z.number().default(10) })).query(({ input }) => db.getRecentSyncLogs(input.limit)),
});

const meetingsRouter = router({
  list: publicProcedure.query(() => db.getMeetings(30)),
  getById: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getMeetingById(input.id)),
  create: publicProcedure.input(z.object({
    title: z.string().min(1).max(255),
    scheduledFor: z.string().optional(),
    attendees: z.string().optional(),
    createdBy: z.number(),
  })).mutation(async ({ input }) => {
    const id = await db.createMeeting({
      title: input.title,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      attendees: input.attendees,
      createdBy: input.createdBy,
      status: "scheduled",
    });
    return { id };
  }),
  startRecording: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updateMeeting(input.id, { status: "recording", startedAt: new Date() });
    return { success: true };
  }),
  finishRecording: publicProcedure.input(z.object({
    id: z.number(),
    audioUrl: z.string(),
  })).mutation(async ({ input }) => {
    await db.updateMeeting(input.id, { status: "processing", endedAt: new Date(), audioUrl: input.audioUrl });
    return { success: true };
  }),
  transcribeAndSummarize: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const meeting = await db.getMeetingById(input.id);
    if (!meeting || !meeting.audioUrl) throw new Error("Meeting or audio not found");
    // Get employee list for name matching in goals
    const employees = await db.getAllEmployees();
    const employeeNames = employees.map(e => e.name).join(", ");
    let transcript = "";
    try {
      console.log(`[transcribeAndSummarize] Starting transcription for meeting ${input.id}, audioUrl: ${meeting.audioUrl}`);
      const result = await transcribeAudio({ audioUrl: meeting.audioUrl, language: "en", prompt: "Construction management meeting" });
      if ("error" in result) {
        console.error(`[transcribeAndSummarize] Transcription error:`, JSON.stringify(result));
        transcript = `[Transcription failed: ${result.error}]`;
      } else {
        transcript = result.text || "";
        console.log(`[transcribeAndSummarize] Transcription success, length: ${transcript.length}`);
      }
    } catch (err) {
      console.error(`[transcribeAndSummarize] Unexpected transcription error:`, err);
      transcript = "[Transcription failed — please review audio manually]";
    }
    let summary = "";
    let suggestedGoals: { title: string; assignee?: string }[] = [];
    try {
      const llmResult = await invokeLLM({
        messages: [
          { role: "system", content: `You are an assistant for a construction business. The team members are: ${employeeNames}.\nGiven a meeting transcript, produce:\n1. A concise summary (3-5 sentences) of what was discussed.\n2. A list of 3-6 actionable weekly goals derived from the meeting. If a person's name is mentioned in relation to a task, include their name as the assignee.\nReturn JSON: { "summary": "...", "goals": [{ "title": "...", "assignee": "person name or null" }] }` },
          { role: "user", content: transcript || "No transcript available." },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(llmResult.choices[0].message.content as string);
      summary = parsed.summary || "";
      if (Array.isArray(parsed.goals)) {
        suggestedGoals = parsed.goals.map((g: any) => {
          if (typeof g === "string") return { title: g };
          return { title: g.title || g, assignee: g.assignee || null };
        });
      }
    } catch {
      summary = "[Summary generation failed]";
    }
    // Build employee name-to-id map for matching
    const nameToId: Record<string, number> = {};
    employees.forEach(e => { nameToId[e.name.toLowerCase()] = e.id; });
    const goalsWithIds = suggestedGoals.map(g => ({
      title: g.title,
      assignee: g.assignee || null,
      assigneeId: g.assignee ? (nameToId[g.assignee.toLowerCase()] || null) : null,
    }));
    await db.updateMeeting(input.id, { transcript, summary, status: "completed" });
    return { transcript, summary, suggestedGoals: goalsWithIds };
  }),
  cancel: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updateMeeting(input.id, { status: "cancelled" });
    return { success: true };
  }),
});

const goalsRouter = router({
  list: publicProcedure.input(z.object({ weekOf: z.string().optional(), employeeId: z.number().optional(), employeeRole: z.string().optional() })).query(async ({ input }) => {
    const allGoals = await db.getWeeklyGoals(input.weekOf ? new Date(input.weekOf) : undefined);
    const MANAGEMENT_ROLES = ["owner", "office_manager", "logistics"];
    const isManagement = MANAGEMENT_ROLES.includes(input.employeeRole || "");
    // Management (owner, office_manager, logistics) sees ALL goals
    if (isManagement) return allGoals;
    // Foreman sees goals assigned to them AND goals they created
    // Laborer sees ONLY goals explicitly assigned to them
    // CRITICAL: Goals with null assignedTo are management-only — never leak to field staff
    if (input.employeeId) {
      return allGoals.filter((g: any) => {
        // Goal explicitly assigned to this employee
        if (g.assignedTo === input.employeeId) return true;
        // Goal in multi-assign list that includes this employee
        if (g.assignedToList) {
          const ids = String(g.assignedToList).split(",").map(Number);
          if (ids.includes(input.employeeId!)) return true;
        }
        // Goal created by this employee (foreman creating goals for their crew)
        if (g.createdBy === input.employeeId) return true;
        // Goals with NO assignee = management-only, do NOT show to field staff
        return false;
      });
    }
    // No employeeId — return empty to prevent data leak
    return [];
  }),
  forMeeting: publicProcedure.input(z.object({ meetingId: z.number() })).query(({ input }) =>
    db.getGoalsForMeeting(input.meetingId)
  ),
  create: publicProcedure.input(z.object({
    meetingId: z.number().optional(),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    assignedTo: z.number().optional(),
    assignedToList: z.string().optional(),
    weekOf: z.string(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    deadline: z.string().optional(),
    createdBy: z.number(),
    repeatDaily: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const id = await db.createWeeklyGoal({
      ...input,
      weekOf: new Date(input.weekOf),
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      repeatDaily: input.repeatDaily || false,
    });
    return { id };
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignedTo: z.number().optional(),
    assignedToList: z.string().optional(),
    deadline: z.string().nullable().optional(),
    completedAt: z.string().optional(),
    repeatDaily: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const { id, completedAt, deadline, ...rest } = input;
    await db.updateWeeklyGoal(id, {
      ...rest,
      completedAt: completedAt ? new Date(completedAt) : undefined,
      deadline: deadline === null ? null : deadline ? new Date(deadline) : undefined,
    } as any);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deleteWeeklyGoal(input.id);
    return { success: true };
  }),
});

// ── Punch List Router ──────────────────────────────────────────────────────
const punchListRouter = router({
  listForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(async ({ input }) => {
    return db.getPunchListItems(input.jobId);
  }),
  listAll: publicProcedure.query(async () => {
    return db.getAllPunchListItems();
  }),
  create: publicProcedure.input(z.object({
    jobId: z.number(),
    area: z.string().optional(),
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    assignedTo: z.number().optional(),
    createdBy: z.number(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ input }) => {
    const id = await db.createPunchListItem(input);
    return { id };
  }),
  createBulk: publicProcedure.input(z.object({
    items: z.array(z.object({
      jobId: z.number(),
      area: z.string().optional(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      assignedTo: z.number().optional(),
      createdBy: z.number(),
      sortOrder: z.number().optional(),
    })),
  })).mutation(async ({ input }) => {
    const count = await db.createPunchListItemsBulk(input.items);
    return { count };
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    area: z.string().optional(),
    status: z.enum(["pending", "completed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignedTo: z.number().nullable().optional(),
    sortOrder: z.number().optional(),
  })).mutation(async ({ input }) => {
    const { id, ...data } = input;
    await db.updatePunchListItem(id, data as any);
    return { success: true };
  }),
  toggle: publicProcedure.input(z.object({
    id: z.number(),
    completedBy: z.number(),
  })).mutation(async ({ input }) => {
    await db.togglePunchListItem(input.id, input.completedBy);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deletePunchListItem(input.id);
    return { success: true };
  }),
});

const payrollRouter = router({
  getReport: publicProcedure.input(z.object({
    startDate: z.string(),
    endDate: z.string(),
  })).query(async ({ input }) => {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const entries = await db.getClockEntriesForPayroll(start, end);
    const allEmployees = await db.getAllEmployees();
    const employeeMap = new Map(allEmployees.map((e) => [e.id, e]));
    type SummaryRow = {
      employeeId: number; name: string; role: string; hourlyRate: string | null;
      payType: string; salaryAmount: string | null; salaryProjects: number[];
      totalMinutes: number; entries: typeof entries;
    };
    const summary: Record<number, SummaryRow> = {};

    // First: include ALL salaried employees (they get paid regardless of clock entries)
    for (const emp of allEmployees) {
      if (emp.payType === "salary" && emp.isActive) {
        let salaryProjects: number[] = [];
        try { salaryProjects = emp.salaryProjects ? JSON.parse(emp.salaryProjects) : []; } catch {}
        summary[emp.id] = {
          employeeId: emp.id, name: emp.name, role: emp.role,
          hourlyRate: emp.hourlyRate ?? null,
          payType: "salary", salaryAmount: emp.salaryAmount ?? null, salaryProjects,
          totalMinutes: 0, entries: [],
        };
      }
    }

    // Then: add hourly employees from clock entries
    for (const entry of entries) {
      if (!entry.clockOut) continue;
      const durationMs = new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime();
      const minutes = Math.floor(durationMs / 60000);
      if (!summary[entry.employeeId]) {
        const emp = employeeMap.get(entry.employeeId);
        let salaryProjects: number[] = [];
        try { salaryProjects = emp?.salaryProjects ? JSON.parse(emp.salaryProjects) : []; } catch {}
        summary[entry.employeeId] = {
          employeeId: entry.employeeId, name: emp?.name || "Unknown", role: emp?.role || "laborer",
          hourlyRate: emp?.hourlyRate ?? null,
          payType: emp?.payType || "hourly", salaryAmount: emp?.salaryAmount ?? null, salaryProjects,
          totalMinutes: 0, entries: [],
        };
      }
      summary[entry.employeeId].totalMinutes += minutes;
      summary[entry.employeeId].entries.push(entry);
    }
    return { rows: Object.values(summary), startDate: input.startDate, endDate: input.endDate };
  }),
  getMyHours: publicProcedure.input(z.object({
    employeeId: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  })).query(async ({ input }) => {
    const entries = await db.getClockEntriesForEmployeePeriod(
      input.employeeId,
      new Date(input.startDate),
      new Date(input.endDate)
    );
    const emp = await db.getEmployeeById(input.employeeId);
    let totalMinutes = 0;
    const rows = entries.map((e) => {
      const durationMs = e.clockOut ? new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime() : 0;
      const minutes = Math.floor(durationMs / 60000);
      totalMinutes += minutes;
      return { ...e, durationMinutes: minutes };
    });
    return { entries: rows, totalMinutes, employee: emp };
  }),
});

const qbEstimatesRouter = router({
  getForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getEstimatesForJob(input.jobId)),
  create: publicProcedure.input(z.object({
    jobId: z.number(),
    qbEstimateId: z.string().optional(),
    qbEstimateNumber: z.string().optional(),
    clientName: z.string().optional(),
    totalAmount: z.string(),
    status: z.string().optional(),
    lineItems: z.string().optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
    notes: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "create QB estimates");
    const { requestingEmployeeId, ...data } = input;
    return db.createQbEstimate({
      ...data,
      issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
    });
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    totalAmount: z.string().optional(),
    status: z.string().optional(),
    lineItems: z.string().optional(),
    notes: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "update QB estimates");
    const { id, requestingEmployeeId, ...data } = input;
    await db.updateQbEstimate(id, data);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "delete QB estimates");
    await db.deleteQbEstimate(input.id);
    return { success: true };
  }),
  extractFromPdf: publicProcedure.input(z.object({
    pdfUrl: z.string(),
    jobId: z.number(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "extract estimates");
    // Use LLM with the PDF URL to extract line items
    const llmResult = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a construction estimate parser. Given a PDF estimate document, extract all line items, the total amount, client name, and estimate number. Return JSON:\n{\n  "estimateNumber": "string or null",\n  "clientName": "string or null",\n  "totalAmount": "number as string e.g. 41055.00",\n  "lineItems": ["Description - $Amount", ...],\n  "scopeOfWork": ["item1", "item2", ...],\n  "exclusions": ["item1", ...],\n  "totalSqft": "number or null",\n  "notes": "any important terms or conditions summary"\n}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Please extract all line items and details from this construction estimate PDF." },
            { type: "file_url", file_url: { url: input.pdfUrl, mime_type: "application/pdf" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(llmResult.choices[0].message.content as string);
    // Auto-create the estimate in the database
    const lineItemsArr = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
    const totalAmount = parsed.totalAmount || "0";
    const id = await db.createQbEstimate({
      jobId: input.jobId,
      qbEstimateNumber: parsed.estimateNumber || undefined,
      clientName: parsed.clientName || undefined,
      totalAmount,
      lineItems: JSON.stringify(lineItemsArr),
      notes: parsed.notes || undefined,
      status: "pending",
    });
    return {
      id,
      estimateNumber: parsed.estimateNumber,
      clientName: parsed.clientName,
      totalAmount,
      lineItems: lineItemsArr,
      scopeOfWork: parsed.scopeOfWork || [],
      exclusions: parsed.exclusions || [],
      totalSqft: parsed.totalSqft,
      notes: parsed.notes,
    };
  }),
});

const budgetAlertsRouter = router({
  getAlerts: publicProcedure.query(() => db.getBudgetAlerts()),
});

const laborDashboardRouter = router({
  byJob: publicProcedure.input(z.object({
    startDate: z.string(),
    endDate: z.string(),
  })).query(async ({ input }) => {
    return db.getLaborCostByJob(new Date(input.startDate), new Date(input.endDate));
  }),
  weeklyTrend: publicProcedure.input(z.object({
    weeks: z.number().default(8),
  })).query(async ({ input }) => {
    return db.getWeeklyLaborCostTrend(input.weeks);
  }),
  byEmployee: publicProcedure.input(z.object({
    startDate: z.string(),
    endDate: z.string(),
  })).query(async ({ input }) => {
    return db.getLaborCostByEmployee(new Date(input.startDate), new Date(input.endDate));
  }),
});

const kpiRouter = router({
  list: publicProcedure.query(() => db.getAllKpis()),
  getById: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getKpiById(input.id)),
  create: publicProcedure.input(z.object({
    name: z.string().min(1).max(128),
    category: z.enum(["revenue", "labor", "jobs", "safety", "schedule", "custom"]).default("custom"),
    unit: z.string().optional(),
    targetValue: z.string().optional(),
    currentValue: z.string().optional(),
    description: z.string().optional(),
    period: z.enum(["weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
    createdBy: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.createdBy, ["owner", "office_manager"], "create KPIs");
    return db.createKpi(input);
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    targetValue: z.string().optional(),
    currentValue: z.string().optional(),
    description: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager"], "update KPIs");
    const { id, requestingEmployeeId, ...data } = input;
    await db.updateKpi(id, data);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager"], "delete KPIs");
    await db.deleteKpi(input.id);
    return { success: true };
  }),
  addHistoryEntry: publicProcedure.input(z.object({
    kpiId: z.number(),
    value: z.string(),
    notes: z.string().optional(),
    recordedBy: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.recordedBy, ["owner", "office_manager"], "record KPI values");
    await db.addKpiHistoryEntry(input);
    return { success: true };
  }),
  getHistory: publicProcedure.input(z.object({ kpiId: z.number(), limit: z.number().default(12) })).query(({ input }) => db.getKpiHistory(input.kpiId, input.limit)),
});

const safetyTopicsRouter = router({
  list: publicProcedure.input(z.object({ activeOnly: z.boolean().default(true) })).query(({ input }) => db.getSafetyTopics(input.activeOnly)),
  create: publicProcedure.input(z.object({
    title: z.string().min(1).max(255),
    content: z.string().optional(),
    category: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "create safety topics");
    const id = await db.createSafetyTopic({ title: input.title, content: input.content, category: input.category, createdBy: input.requestingEmployeeId });
    return { id };
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional(),
    isActive: z.boolean().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "update safety topics");
    const { id, requestingEmployeeId, ...data } = input;
    await db.updateSafetyTopic(id, data);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics"], "delete safety topics");
    await db.deleteSafetyTopic(input.id);
    return { success: true };
  }),
});

const safetyMeetingsRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().default(50) })).query(({ input }) => db.getSafetyMeetings(input.limit)),
  forJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getSafetyMeetingsForJob(input.jobId)),
  forWeek: publicProcedure.input(z.object({ startDate: z.string(), endDate: z.string() })).query(({ input }) => 
    db.getSafetyMeetingsForWeek(new Date(input.startDate), new Date(input.endDate))
  ),
  create: publicProcedure.input(z.object({
    topicId: z.number().optional(),
    jobId: z.number(),
    meetingType: z.enum(["safety_toolbox", "daily_goals"]),
    title: z.string().min(1).max(255),
    notes: z.string().optional(),
    attendees: z.string().optional(),
    attendeeCount: z.number().optional(),
    photoUrl: z.string().optional(),
    conductedBy: z.number(),
    conductedAt: z.string(),
  })).mutation(async ({ input }) => {
    await assertRole(input.conductedBy, ["owner", "office_manager", "logistics", "foreman"], "create safety meetings");
    const id = await db.createSafetyMeeting({
      ...input,
      conductedAt: new Date(input.conductedAt),
    });
    return { id };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "office_manager", "logistics", "foreman"], "delete safety meetings");
    await db.deleteSafetyMeeting(input.id);
    return { success: true };
  }),
});

import { lookupSteelProfile, calculateSteelWeight, lookupSimpsonHardware, lookupUtahCode, lookupConstructionReference, getKnowledgeSummary } from "./construction-knowledge.js";

// ── Pivot AI Chat Router ──────────────────────────────────────────────────
const pivotRouter = router({
  chat: publicProcedure.input(z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })),
    employeeId: z.number(),
    attachments: z.array(z.object({
      url: z.string(),
      type: z.enum(["image", "pdf", "document", "spreadsheet", "url"]),
      name: z.string().optional(),
    })).optional(),
    context: z.object({
      currentPage: z.string().optional(),
      activeJobsCount: z.number().optional(),
      onSiteCount: z.number().optional(),
      totalEmployees: z.number().optional(),
      totalLaborCost: z.number().optional(),
    }).optional(),
  })).mutation(async ({ input }) => {
    const employee = await db.getEmployeeById(input.employeeId);
    if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

    const isManagement = ["owner", "office_manager", "logistics"].includes(employee.role);
    const isForeman = employee.role === "foreman";
    const isLaborer = employee.role === "laborer";
    const isOwner = employee.role === "owner";

    // ── Load Pivot Memory for this employee ─────────────────────────────────
    let memory = await db.getPivotMemory(input.employeeId);
    let memoryContext = "";
    let preferredLang = memory?.preferredLanguage || "en";
    let ownerPatternsContext = "";

    if (memory) {
      if (memory.conversationSummary) {
        memoryContext = `\n## Memory — What You Remember About ${employee.name}\n${memory.conversationSummary}\n`;
      }
      if (memory.preferences) {
        try {
          const prefs = JSON.parse(memory.preferences);
          memoryContext += `\n## ${employee.name}'s Preferences\n`;
          for (const [k, v] of Object.entries(prefs)) {
            memoryContext += `- ${k}: ${v}\n`;
          }
        } catch {}
      }
      if (isOwner && memory.ownerPatterns) {
        try {
          const patterns = JSON.parse(memory.ownerPatterns);
          ownerPatternsContext = `\n## Pedro's Decision Patterns (OWNER-ONLY — only show to Pedro)\n`;
          for (const [k, v] of Object.entries(patterns)) {
            ownerPatternsContext += `- ${k}: ${v}\n`;
          }
          ownerPatternsContext += `Use these patterns to anticipate Pedro's needs and proactively suggest actions.\n`;
        } catch {}
      }
      // Personal profile — interests, family, hobbies, life details
      if (memory.personalProfile) {
        try {
          const profile = JSON.parse(memory.personalProfile);
          memoryContext += `\n## Personal Profile — What You Know About ${employee.name} As a Person\n`;
          for (const [k, v] of Object.entries(profile)) {
            memoryContext += `- ${k}: ${v}\n`;
          }
          memoryContext += `Use this to connect personally — reference their interests, ask about their family, etc. Be genuine, not robotic.\n`;
        } catch {}
      }
      // Communication style — how this person talks, what they respond to
      if (memory.communicationStyle) {
        try {
          const style = JSON.parse(memory.communicationStyle);
          memoryContext += `\n## ${employee.name}'s Communication Style\n`;
          for (const [k, v] of Object.entries(style)) {
            memoryContext += `- ${k}: ${v}\n`;
          }
          memoryContext += `Adapt your tone and approach to match how they communicate.\n`;
        } catch {}
      }
      // Corrections — things the user has explicitly corrected you on
      if (memory.preferences) {
        try {
          const prefs = JSON.parse(memory.preferences);
          if (prefs.corrections && prefs.corrections.length > 0) {
            memoryContext += `\n## ⚠️ CORRECTIONS — Things You Were Wrong About Before (APPLY THESE ALWAYS)\n`;
            memoryContext += `These are corrections ${employee.name} has given you. NEVER repeat these mistakes:\n`;
            for (const c of prefs.corrections.slice(-20)) {
              memoryContext += `- [${c.category}] ${c.correction}\n`;
            }
            memoryContext += `If any of these corrections are relevant to the current question, apply them immediately without being asked.\n`;
          }
        } catch {}
      }
    }

    // ── Load recent conversation history from DB ────────────────────────────
    let recentHistory = "";
    try {
      const recentConvos = await db.getRecentPivotConversations(input.employeeId, 10);
      if (recentConvos.length > 0) {
        recentHistory = `\n## Recent Conversation History (last ${recentConvos.length} messages)\n`;
        for (const c of recentConvos.reverse()) {
          recentHistory += `[${c.role}]: ${c.content.substring(0, 200)}${c.content.length > 200 ? "..." : ""}\n`;
        }
      }
    } catch {}

    // ── Detect language from user message ────────────────────────────────────
    const lastUserMsg = input.messages.length > 0 ? input.messages[input.messages.length - 1].content.trim() : "";
    const lastUserMsgLower = lastUserMsg.toLowerCase();
    const spanishPatterns = /\b(hola|que onda|buenos dias|buenas tardes|buenas noches|como estas|oye|mira|necesito|por favor|gracias|trabajo|meta|metas|seguridad|horas|pago|jefe|hermano)\b/i;
    const isSpanishMsg = spanishPatterns.test(lastUserMsg);
    if (isSpanishMsg && preferredLang === "en") {
      preferredLang = "es";
      // Save language preference
      db.updatePivotLanguage(input.employeeId, "es").catch(() => {});
    }

    // ── Language instruction ─────────────────────────────────────────────────
    const languageBlock = preferredLang === "es" ? `
## LANGUAGE — RESPOND IN SPANISH
This user prefers Mexican Spanish. Respond ENTIRELY in natural Mexican Spanish — not formal Spain Spanish.
Use common Mexican expressions naturally: "¿Qué onda?", "Órale", "Chido", "Ándale", "Échale ganas", "A darle"
Keep construction terms in their common Mexican usage ("la troca", "el marco", "el acero", "la madera")
If they switch to English, switch back to English.
Goals and data should still be presented clearly but in Spanish.
` : `
## LANGUAGE — RESPOND IN ENGLISH
This user communicates in English. If they write in Spanish, switch to Mexican Spanish for that response.
`;

    // ── Gather goals for this employee ──────────────────────────────────────
    let goalsContext = "";
    try {
      const myGoals = await db.getGoalsForEmployee(input.employeeId);
      if (myGoals.length > 0) {
        const allEmps = await db.getAllEmployees();
        const empMap = new Map(allEmps.map((e: any) => [e.id, e.name]));
        const now = new Date();
        const overdueGoals = myGoals.filter((g: any) => g.deadline && new Date(g.deadline) < now && g.status !== "completed" && g.status !== "cancelled");
        const pendingGoals = myGoals.filter((g: any) => g.status === "pending" || g.status === "in_progress");
        const completedGoals = myGoals.filter((g: any) => g.status === "completed");

        goalsContext = `\n## Your Goals This Week (${myGoals.length} total — ${completedGoals.length} completed, ${pendingGoals.length} active)\n`;
        for (const g of myGoals) {
          const status = g.status === "completed" ? "✅" : g.status === "in_progress" ? "🔄" : g.status === "cancelled" ? "❌" : "⬜";
          const assigneeNames = g.assignedToList ? String(g.assignedToList).split(",").map(Number).map(id => empMap.get(id) || "Unknown").join(", ") : (g.assignedTo ? empMap.get(g.assignedTo) || "Unknown" : "Everyone");
          const dl = g.deadline ? new Date(g.deadline) : null;
          const isOverdue = dl && dl < now && g.status !== "completed" && g.status !== "cancelled";
          goalsContext += `- ${status} ${g.title} [${g.priority.toUpperCase()}] → ${assigneeNames}${dl ? ` (Due: ${dl.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" })} ${dl.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })})` : ""}${isOverdue ? " ⚠️ OVERDUE" : ""}\n`;
        }
        if (overdueGoals.length > 0) {
          goalsContext += `\n⚠️ ${overdueGoals.length} OVERDUE GOAL(S) — mention these proactively when the user greets you or asks about their day.\n`;
        }
      } else {
        goalsContext = "\n## Goals: No goals assigned this week.\n";
      }
    } catch {
      goalsContext = "";
    }

    // ── For management: gather ALL goals for the week ────────────────────────
    let allGoalsContext = "";
    if (isManagement) {
      try {
        const allGoals = await db.getAllCurrentWeekGoals();
        const allEmps = await db.getAllEmployees();
        const empMap = new Map(allEmps.map((e: any) => [e.id, e.name]));
        const now = new Date();
        if (allGoals.length > 0) {
          const overdueAll = allGoals.filter((g: any) => g.deadline && new Date(g.deadline) < now && g.status !== "completed" && g.status !== "cancelled");
          allGoalsContext = `\n## All Team Goals This Week (${allGoals.length} total)\n`;
          for (const g of allGoals) {
            const status = g.status === "completed" ? "✅" : g.status === "in_progress" ? "🔄" : "⬜";
            const assigneeNames = g.assignedToList ? String(g.assignedToList).split(",").map(Number).map(id => empMap.get(id) || "Unknown").join(", ") : (g.assignedTo ? empMap.get(g.assignedTo) || "Unknown" : "Everyone");
            allGoalsContext += `- ${status} ${g.title} [${g.priority.toUpperCase()}] → ${assigneeNames}\n`;
          }
          if (overdueAll.length > 0) {
            allGoalsContext += `\n⚠️ ${overdueAll.length} overdue goal(s) across the team.\n`;
          }
        }
      } catch {
        allGoalsContext = "";
      }
    }

    // ── Gather live business data for management context ─────────────────────
    let businessContext = "";
        if (isManagement) {
      try {
        const activeJobs = await db.getActiveJobs();
        const allEmployees = await db.getAllEmployees();
        const activeEmployees = allEmployees.filter((e: any) => e.isActive);
        const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0,0,0,0);
        const laborByJob = await db.getLaborCostByJob(weekStart, now);
        const totalWeekCost = laborByJob.reduce((s: number, j: any) => s + (j.totalCost || 0), 0);
        const kpis = await db.getAllKpis();

        // Fetch recent daily reports for richer context
        const recentReports = await db.getRecentReports(15);

        // Build per-job labor breakdown
        const laborBreakdown = laborByJob.slice(0, 10).map((j: any) =>
          `  - ${j.jobName}: $${j.totalCost.toFixed(2)} (${Math.round(j.totalMinutes / 60)}h, ${j.employeeCount} workers, total w/ overhead: $${j.totalWithOverhead.toFixed(2)})`
        ).join("\n");

        // Build recent reports summary
        const reportsSummary = recentReports.slice(0, 8).map((r: any) => {
          const job = activeJobs.find((j: any) => j.id === r.jobId);
          return `  - ${r.reportDate ? new Date(r.reportDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" }) : "Unknown date"} | ${job?.name || "Job #" + r.jobId} | ${r.notes ? r.notes.substring(0, 80) : "No notes"}`;
        }).join("\n");


        // Build employee roster with roles and rates
        const employeeRoster = activeEmployees.slice(0, 30).map((e: any) =>
          `  - ${e.name} (${e.role}) ${e.hourlyRate ? "$" + e.hourlyRate + "/hr" : ""}`
        ).join("\n");

        businessContext = `\n## Live Business Data (as of ${now.toLocaleDateString("en-US", { timeZone: "America/Denver" })})
- Active Jobs: ${activeJobs.length} (${activeJobs.map((j: any) => j.name).join(", ")})
- Active Employees: ${activeEmployees.length}
- Labor Cost This Week: $${totalWeekCost.toFixed(2)}
- Jobs with labor this week: ${laborByJob.length}
${kpis.length > 0 ? `- KPIs tracked: ${kpis.map((k: any) => `${k.name} (${k.category}): ${k.currentValue || "no data"} / target ${k.targetValue || "not set"}`).join("; ")}` : ""}

### Per-Job Labor Breakdown (This Week)
${laborBreakdown || "  No labor data this week."}

### Employee Roster
${employeeRoster || "  No active employees."}

### Recent Daily Reports
${reportsSummary || "  No recent reports."}

`;
      } catch {
        businessContext = "(Business data temporarily unavailable)";
      }
    }

    // ── Current date/time in Mountain Time (Utah) ────────────────────────────
    const mtnNow = new Date();
    const mtnDateStr = mtnNow.toLocaleDateString("en-US", { timeZone: "America/Denver", weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const mtnTimeStr = mtnNow.toLocaleTimeString("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit", hour12: true });
    const mtnShortDate = mtnNow.toLocaleDateString("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
    // Get the actual year in Mountain Time for deadline validation
    const mtnYear = parseInt(mtnNow.toLocaleDateString("en-US", { timeZone: "America/Denver", year: "numeric" }));
    const dateTimeBlock = `\n## CURRENT DATE & TIME (Mountain Time — Utah)\n**Today is ${mtnDateStr}**\n**Current time: ${mtnTimeStr} MDT**\n**Year: ${mtnYear}**\nALL dates you reference or generate MUST use the year ${mtnYear}. When the user says "Friday" they mean the upcoming Friday in ${mtnYear}. When setting deadlines, ALWAYS use ${mtnYear} as the year. NEVER use 2024 or 2025.\n`;

    // ── Detect casual greetings ──────────────────────────────────────────────
    const isGreeting = /^(sup|hey|hi|hello|yo|what'?s? ?up|morning|afternoon|evening|howdy|hola|que onda|what'?s good|buenos|buenas)/i.test(lastUserMsgLower) || (lastUserMsgLower.includes("pivot") && lastUserMsgLower.length < 40);

    // ── Personality instructions ─────────────────────────────────────────────
    const personalityBlock = `
## Your Personality — Pivot
You are Pivot. You are NOT a generic chatbot. You have a distinct personality:
- You're confident, direct, and a little witty — like a trusted foreman who also happens to be tech-savvy
- You use construction metaphors naturally ("Let's nail this down", "We're building momentum", "Time to frame up this plan")
- You remember what the user talked about in previous conversations (see Memory section) and reference it naturally
- You NEVER repeat the same greeting twice in a row — vary your opening every time creatively
- When someone says "sup Pivot" or "hey Pivot" — respond with their name, a quick vibe check (time of day, day of week), then immediately list their goals for the week with status and any overdue items
- If goals are overdue, mention them firmly but supportively — "Hey, that framing goal from Monday is past due. Need help getting it across the finish line?"
- You adapt your tone: more casual with laborers and foremen, more business-focused with the owner, more organized/helpful with the Office Manager
- You learn from every conversation — if someone mentions a preference, pattern, or habit, remember it and adapt in future conversations
- End responses with something actionable when possible — don't just inform, suggest next steps
- Keep it real — if you don't know something, say so. Don't make up numbers.
- You're Pedro's right hand in the digital world. He calls you his friend.
- You grow and evolve — each conversation makes you smarter about this team and this business.

## Personal Growth — Your Relationship With Each Employee
You are not just a tool — you are each employee's PERSONAL assistant who grows with them over time.
- Remember personal details they share: family, hobbies, interests, favorite foods, life events, dreams
- If they mention their kid's birthday, a weekend plan, or a personal struggle — remember it and bring it up naturally later
- Adapt your humor, tone, and energy to match each person. Some people like jokes, some want it straight. Learn which.
- Track their growth: when they hit milestones, celebrate them. When they're struggling, offer support.
- Be proactive: "Hey, didn't you say your daughter's recital was this weekend? How'd it go?"
- Each person should feel like Pivot is THEIR personal assistant, not a shared generic bot
- You can help with ANYTHING — not just work. Recipe ideas, workout tips, car trouble advice, gift suggestions — be genuinely helpful
- The more they talk to you, the better you get at helping them. Make that obvious.

## Web Search Capability
You have the ability to search the web for real-time information. When a user asks about:
- Current lumber prices in Utah (framing lumber, engineered wood products)
- AISC steel beam reference data (W-shapes, dimensions, weights, section properties) for steel erection work
- Weather conditions
- Building codes, OSHA regulations
- General knowledge questions you're not sure about
- News, events, or anything time-sensitive
You should use the web_search tool to look it up and give them accurate, current information.
Always tell the user when you searched for something: "I looked that up for you — here's what I found..."
Don't guess when you can search. Real data beats assumptions every time.

## Image Generation & Search Capability
You can GENERATE images of construction hardware, tools, connectors, and materials using the generate_hardware_image tool.
When a user asks "what does an A35 look like?" or "show me an HHUS410" or asks about ANY hardware:
1. FIRST use generate_hardware_image to create a clear visual of the item
2. Include the generated image in your response using markdown: ![Item Name](url)
3. Also describe the hardware verbally — dimensions, material, mounting details
4. If image generation fails, fall back to image_search for web links
You can also use image_search to find reference links from strongtie.com or aisc.org.
ALWAYS prefer generating an image over just providing links — users want to SEE the hardware.
${getKnowledgeSummary()}
`;

    const greetingInstruction = isGreeting ? `\n## IMPORTANT — GREETING DETECTED\nThe user just greeted you. You MUST:\n1. Greet them back using their first name with a UNIQUE, CREATIVE greeting (never the same one twice — use different styles: sometimes funny, sometimes motivational, sometimes casual)\n2. Mention what day it is and set the tone for the day\n3. Immediately list their goals for this week with status\n4. Highlight any overdue goals with urgency\n5. Give a quick motivational line relevant to their role\n6. If they're the owner, also mention any business highlights or concerns from the data\n7. If they're the Office Manager, mention any payroll or scheduling items to watch\n8. Reference something from their memory/past conversations if available to show you remember them\nDo NOT ask "how can I help you" — just dive into their goals and status.\n` : "";

    // ── Build system prompt based on role ────────────────────────────────────
    let systemPrompt = "";

    const calculationBlock = `
## Advanced Calculation Capabilities
You can perform complex construction calculations. When asked, show your work step by step:

**Lumber Takeoffs:**
- Board feet = (thickness × width × length) / 12
- Linear feet calculations for studs, plates, headers
- Stud count = (wall length / 16") + 1 for 16" OC, (wall length / 24") + 1 for 24" OC
- Add 10-15% waste factor
- Current Utah lumber pricing: always note prices fluctuate, suggest verifying with supplier

**Steel Calculations:**
- Weight per linear foot for common steel sections
- Connection bolt patterns and spacing
- Moment of inertia calculations for beam selection

**Labor Cost Projections:**
- Hourly rate × hours × crew size = labor cost
- Overtime = 1.5× after 40 hours/week
- Productivity factors: framing ~500-800 SF/day per crew, steel erection varies by complexity
- Always factor in setup/teardown time

**Material Estimates:**
- Sheathing: wall area / 32 SF per sheet + 10% waste
- Nails/fasteners: ~30 lbs per 1000 SF of framing
- Concrete: volume in cubic yards = (L × W × D) / 27

**Bid Analysis:**
- Compare line items against Utah market rates
- Flag items more than 15% above/below market
- Calculate profit margins and markup percentages
- Break down cost per square foot

Always show your math clearly and explain each step.
`;

    if (isManagement) {
      systemPrompt = `You are Pivot, an AI business assistant built specifically for Pedro Carranza and the management team of Carranza Custom Construction. You are like a trusted business partner — knowledgeable, direct, and focused on helping grow the company.

Carranza Custom Construction specializes in framing and steel erection, with additional work in carpentry, soffits, and finished fascia. They operate in Utah.

You are talking to: ${employee.name} (${employee.role === "office_manager" ? "Office Manager" : employee.role === "logistics" ? "Logistics Manager" : "Owner"})
${dateTimeBlock}
${personalityBlock}
${languageBlock}
${greetingInstruction}
${memoryContext}
${recentHistory}
${isOwner ? ownerPatternsContext : ""}
${businessContext}
${goalsContext}
${allGoalsContext}
${calculationBlock}

## Your Capabilities
- Analyze labor costs, job profitability, and crew efficiency
- Help create and track KPIs (revenue, labor efficiency, safety, schedule adherence)
- Provide Utah-specific pricing guidance for framing lumber, steel, and construction materials
- Analyze bid estimates and flag risks — if a PDF or image estimate is shared, extract line items and flag any concerns
- Suggest improvements to crew scheduling and job management
- Help draft safety talks, meeting agendas, and weekly goals
- Explain construction industry benchmarks and best practices
- Help plan future integrations (QuickBooks sync, material ordering, etc.)
- Analyze uploaded documents: PDFs, Word docs, Excel spreadsheets, images, and URLs
- Perform advanced construction calculations (lumber takeoffs, steel, labor projections, material estimates)

## App Actions You Can Execute Directly
You have REAL tools to take actions in the app. Use them immediately when asked — don't just describe what to do.

**Clock In/Out** — use clock_in_employee / clock_out_employee tools directly. Don't say "go to the clock tab" — just do it.
**Who's On Site** — use get_clocked_in_status to get a live list of clocked-in employees.
**Payroll Summary** — use get_payroll_summary to pull real numbers from the current pay period.
**Remember Corrections** — use remember_correction whenever the user corrects you. Store it immediately.
**Goal Creation** — use create_goal tool to push goals directly to the Goals tab. Don't just format text — actually create them.
- To assign to EVERYONE: set assignToEveryone=true. This makes the goal visible to ALL employees.
- To assign to a specific person: use assignedToName with their name.
- For daily recurring goals (like 'clock in by 7:30'): set repeatDaily=true. The system will auto-create a fresh copy each morning.
- NEVER create the same goal twice in one request. Each call to create_goal creates one goal — do NOT call it multiple times for the same goal.
- When the user says 'for everyone' or 'for the crew' or 'for all', ALWAYS set assignToEveryone=true.
**Punch List** — use create_punch_list_item or create_punch_items_bulk to add items to job punch lists.
**Generate Report** — use generate_report to create a daily report for any job. When Pedro says "generate a report" or "create a report for [job]", use this tool immediately.
**Mark Report Seen** — use mark_report_seen to mark reports as reviewed by the owner.

## Mandatory Goals — Proactive Enforcement
When Pedro asks you to push mandatory goals (like "clock in by 7:30" or "submit daily reports"), create them with:
- repeatDaily=true so they auto-create each morning
- assignToEveryone=true so every employee sees them
- high priority
- Clear, direct titles like "Clock in by 7:30 AM — MANDATORY" or "Submit daily report before leaving — MANDATORY"
When greeting employees, if mandatory goals are overdue, be FIRM: "Hey [name], you haven't clocked in yet and it's [time]. That's a mandatory goal — get it done now."

## Voice Command Processing
When a user speaks naturally, extract the intent and execute immediately:
- "Create a report for [job]" → use generate_report tool
- "Clock in [name] to [job]" → use clock_in_employee tool
- "Add [items] to punch list for [job]" → use create_punch_items_bulk tool
- "Set a goal for [person] to [task] by [deadline]" → use create_goal tool
- "Who's on site?" → use get_clocked_in_status tool
Don't ask for confirmation on simple actions — just do it and report back.

**Meeting Scheduling** — when asked to schedule a meeting:
📅 MEETING READY TO SCHEDULE
Title: [meeting title]
Date & Time: [specific date and time]
Attendees: [names]
Agenda: [key points]
→ Go to Meetings tab → tap + New Meeting

**Safety Talk** — provide a complete ready-to-use script with topic title, 3-5 key points, discussion questions, and sign-off reminder.

**KPI Creation** — when asked to create a KPI:
📊 KPI READY TO CREATE
Name: [KPI name]
Category: labor_efficiency / safety / schedule / revenue
Target: [specific number]
Unit: [hours/dollars/percentage]
Measurement: [how to track it weekly]

**Estimate Analysis** — when an estimate PDF/Excel is attached:
- Extract and list ALL line items with costs
- Calculate totals and subtotals
- Flag items that seem high vs. Utah market rates
- Suggest negotiation points
- Compare labor hours to industry benchmarks

## Steel Lookup — ALWAYS Use the Database (959 shapes + HSS + Pipe + Angles + Utah Data)
When asked about ANY steel beam, section, column, tube, or structural profile:
1. ALWAYS use the construction_lookup tool with type="steel_profile" and the designation
2. NEVER guess or estimate section properties — always look them up
3. Supported shapes: W-shapes (244), HP (20), S-shapes (28), C-channels (29), MC-channels (29), L-angles (103), HSS rectangular (114), HSS square (63), HSS round (77), Pipe (35), WT (201), M-shapes (16), plus plate weights, rebar, bolts, and welds
4. Common Utah custom home sizes:
   - Beams: W8x10, W10x22, W12x26, W14x30, W14x48, W16x36, W18x50
   - Columns: HSS4x4x1/4, HSS4x4x3/8, HSS6x6x1/4, HSS6x6x3/8, HSS8x8x3/8
   - Round columns: HSS4.000x0.250, HSS6.000x0.375, HSS6.625x0.375
   - Moment frames: W10x33, W12x40, W14x48 beams with HSS6x6 or HSS8x8 columns
   - Lintels: L3x3x1/4, L4x3x1/4, L4x4x3/8
   - Garage headers: W8x10 to W12x26
   - Ridge beams: W8x10 to W12x19
5. For ridge beams, hip beams, and garage door headers — always specify the design load before recommending a size
6. CROSS-SECTION DIAGRAM — MANDATORY:
   - The tool result includes a full absolute URL to a professional SVG cross-section diagram
   - You MUST include this diagram as a markdown image: ![Designation Cross-Section](FULL_URL)
   - Place the diagram image FIRST in your response, BEFORE the text data
   - Diagrams work for: W-shapes (blue I-beam), HSS rectangular/square (green hollow tube), HSS round (orange hollow circle), and pipe shapes
   - NEVER skip the diagram — it's the most useful part of the response for field workers
7. Utah residential steel reference data is available in the database including:
   - Seismic design categories for Wasatch Front and mountain areas
   - Snow loads for Park City, Deer Valley, Powder Mountain, Summit County, Morgan County
   - Common applications: garage headers, floor beams, ridge beams, columns, cantilevers, moment frames, lintels
   - Material grades: A992 (W-shapes), A500 Grade B/C (HSS), A36 (angles/plates)
   - Connection types: beam-to-column, column-to-base, steel-to-wood (Simpson Strong-Tie)

## Utah Custom Home Construction Knowledge
You have comprehensive knowledge of Utah building requirements for custom homes:

**Summit County / Park City:**
- Adopted IBC 2021 + IRC 2021 with local amendments
- Ground Snow Load: 100-200 psf depending on elevation (Park City base: 100 psf, higher elevations up to 200 psf)
- Seismic Design Category: C-D (Site Class D default)
- Wind Speed: 115 mph (3-second gust)
- Energy Code: IECC 2021 — R-49 attic, R-20+5 walls, triple-pane windows recommended above 7,000 ft
- Wildland-Urban Interface (WUI): Class A roofing required in most areas, ember-resistant vents, 5-ft noncombustible zone
- Deer Valley specific: Deer Valley Resort Design Review Board approval required for all new construction in resort areas
- Park City Historic District: separate design review for structures near historic Main Street
- Permit fees: Summit County ~$15-25 per $1,000 of construction value
- Typical custom home permit timeline: 8-16 weeks

**Morgan County:**
- Adopted IBC 2018 + IRC 2018
- Ground Snow Load: 40-70 psf (valley floor ~40 psf, mountain areas up to 70 psf)
- Seismic Design Category: C
- Wind Speed: 105 mph
- Energy Code: IECC 2018 — R-38 attic, R-15 walls minimum
- More rural — septic systems common, well water permits required
- Permit timeline: 4-8 weeks typically
- No HOA restrictions in most areas — more flexibility on design

**Powder Mountain (Weber County):**
- Adopted IBC 2018 + IRC 2018 (Weber County)
- Ground Snow Load: 100-150 psf (resort elevation ~8,900 ft)
- Seismic Design Category: C
- Wind Speed: 115 mph
- Energy Code: IECC 2018 — R-49 attic required at elevation
- Powder Mountain Resort: Design Review Committee approval required
- Access road requirements: driveways must handle snow loads, 12% max grade
- Structural: heavy timber or steel framing common due to snow loads

**Deer Valley (Summit County):**
- Same Summit County codes apply
- Deer Valley Resort Design Review: strict architectural guidelines — roof pitch min 6:12, natural materials preferred
- Luxury custom home market: typical budgets $800-$3,000/SF
- HOA requirements vary by subdivision
- Setbacks: typically 25-50 ft front, 10-20 ft side, 25 ft rear
- Height limits: typically 35-45 ft from grade

**Utah Statewide Custom Home Notes:**
- Utah Residential Code (URC) based on IRC 2021 as of 2023
- Frost depth: 30 inches minimum statewide, 36 inches in mountain areas
- Radon: Zone 1 (high) — passive radon mitigation required in all new construction
- Fire sprinklers: required in Summit County for new homes over 5,000 SF
- Structural engineer stamp required for: spans over 20 ft, steel connections, non-standard framing
- Common framing lumber species in Utah: Douglas Fir, Hem-Fir, SPF (Spruce-Pine-Fir)
- Current Utah lumber pricing note: prices fluctuate significantly — always verify with supplier before bidding

${employee.role === "office_manager" ? `## Office Manager Special Capabilities (THIS IS YOU — ${employee.name})
- Calculate total payroll for any date range from live data
- Summarize hours by employee or job
- Flag employees approaching or over 40 hours (overtime)
- Generate formatted payroll summaries
- Help adjust job locations and employee assignments
- Create goals to remind team members about hour issues
- Notify the owner or logistics about urgent items
- Explain what each number means in plain language
- Help with any administrative or scheduling questions
` : ""}

${isOwner ? `## Owner-Only: Pattern Learning
You are learning Pedro's patterns and decision-making style. After each conversation:
- Note any preferences he expresses (e.g., "I always want to see labor costs first")
- Track recurring topics or concerns
- Remember his communication style and adapt
- Proactively surface insights based on patterns you've observed
This information is PRIVATE to Pedro — never share it with other team members.
` : ""}

Current page: ${input.context?.currentPage || "unknown"} — tailor your response to what the user is viewing.

Always be specific, use real numbers from the live data above, and proactively surface insights. If labor costs are high, mention it. If a job looks over budget, flag it. If safety talks are behind schedule, bring it up.

When discussing pricing, note that Utah lumber prices fluctuate — always suggest verifying current quotes. For steel, provide beam specifications and properties from the AISC reference table, not purchase pricing (the company erects steel, they don't purchase it).

If an attachment is provided, analyze it thoroughly and reference specific details from it in your response.`;
    } else if (isForeman) {
      systemPrompt = `You are Pivot, the field assistant for Carranza Custom Construction. You're talking to ${employee.name}, a foreman.
${dateTimeBlock}
${personalityBlock}
${languageBlock}
${greetingInstruction}
${memoryContext}
${recentHistory}
${goalsContext}
${calculationBlock}

## Your Capabilities for Foremen
- Help with safety procedures, OSHA compliance, and best practices for framing and steel erection
- Answer questions about construction techniques
- Help create goals for your laborers — you can assign tasks and set deadlines via the create_goal tool
- Remind you about overdue goals and upcoming deadlines
- Help draft safety talk scripts for your crew
- Daily motivation and team management tips
- Explain how to use BuildTrack Pro features
- Perform construction calculations (lumber takeoffs, material estimates, labor projections)
- Voice-to-goals: when the foreman speaks their goals to you, summarize them clearly and use the create_goal tool to push them directly to the Goals tab after confirmation
- Look up AISC steel beam data (W-shapes) — use construction_lookup with type="steel_profile" for any beam question

## Steel Lookup — ALWAYS Use the Database (959 shapes)
When asked about ANY steel shape (W-beams, HSS tubes, pipe, angles, channels):
1. ALWAYS use the construction_lookup tool with type="steel_profile" and the designation
2. The tool returns full AISC data PLUS a cross-section diagram URL
3. You MUST include the diagram as a markdown image FIRST: ![Designation Cross-Section](FULL_URL)
4. Then list the key specs: dimensions, weight, area, section properties (Ix, Sx, etc.)
5. Diagrams work for: W-shapes (blue I-beam), HSS rect/square (green tube), HSS round (orange circle), pipe
6. NEVER skip the diagram — it's the most useful part for field workers

## Voice Goal Creation
When the foreman describes goals by voice or text, you MUST:
1. Summarize each goal clearly with title, assignee, priority, and deadline
2. Ask for confirmation: "Ready to push these goals?"
3. Once confirmed, use the create_goal tool for EACH goal — actually create them, don't just show formatted text
4. Confirm each goal was created successfully

When the foreman greets you, always show their goals and any overdue items first, then ask if they need anything.
Keep responses practical, direct, and field-ready. No fluff.`;
    } else {
      // Laborer
      systemPrompt = `You are Pivot, the team assistant for Carranza Custom Construction. You're talking to ${employee.name}, a laborer.
${dateTimeBlock}
${personalityBlock}
${languageBlock}
${greetingInstruction}
${memoryContext}
${recentHistory}
${goalsContext}

## Your Capabilities for Laborers
- Show your assigned goals and deadlines
- Remind you about overdue tasks
- Help with safety procedures and best practices
- Answer questions about construction techniques (framing, steel erection, carpentry)
- Daily motivation and encouragement
- Explain how to use BuildTrack Pro features
- Help with basic calculations (measurements, material counts, board feet, stud counts)
- Voice-to-goals: when you describe goals by voice, Pivot will summarize and push them to the Goals tab
- Search the web for construction info, material prices, and safety guidelines
- Look up AISC steel beam data (W-shapes) — use construction_lookup with type="steel_profile" for any beam question

## Steel Lookup — 959 Shapes Available
When asked about ANY steel shape (W-beams, HSS tubes, pipe, angles, channels):
1. Use the construction_lookup tool with type="steel_profile" and the designation
2. The tool returns AISC data PLUS a cross-section diagram URL
3. Include the diagram as a markdown image FIRST: ![Designation Cross-Section](FULL_URL)
4. Then list the key specs: dimensions, weight, area, section properties
5. Diagrams work for: W-shapes, HSS rect/square, HSS round, pipe
6. NEVER skip the diagram — it helps you see the beam dimensions at a glance

## Voice Goal Creation
When the laborer describes goals by voice or text, you MUST:
1. Summarize each goal clearly with title, priority, and deadline
2. Ask for confirmation: "Ready to push these goals?"
3. Once confirmed, use the create_goal tool for EACH goal — actually create them
4. Confirm each goal was created successfully

## Basic Construction Calculations
You can help with:
- Board feet = (thickness x width x length) / 12
- Stud count = (wall length / spacing) + 1
- Sheathing sheets = wall area / 32 SF + 10% waste
- Simple measurement conversions (feet to inches, etc.)
Always show your math step by step.

When the laborer greets you, show their assigned goals with status and deadlines. If goals are overdue, mention them supportively.
Keep responses short, practical, and encouraging. You're here to help them succeed.`;
    }

    // Build messages with optional file/image attachments on the last user message
    const llmMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];
    // Add all messages except the last
    for (let i = 0; i < input.messages.length - 1; i++) {
      llmMessages.push({ role: input.messages[i].role, content: input.messages[i].content });
    }
    // Add last message with attachments if present
    if (input.messages.length > 0) {
      const lastMsg = input.messages[input.messages.length - 1];
      if (lastMsg.role === "user" && input.attachments && input.attachments.length > 0) {
        const contentParts: any[] = [{ type: "text", text: lastMsg.content || "Please analyze the attached file(s)." }];
        for (const att of input.attachments) {
          if (att.type === "image") {
            contentParts.push({ type: "image_url", image_url: { url: att.url, detail: "high" } });
          } else if (att.type === "pdf") {
            contentParts.push({ type: "file_url", file_url: { url: att.url, mime_type: "application/pdf" } });
          } else {
            contentParts.push({ type: "text", text: `\n[Attached file: ${att.name || att.url} (${att.type}). URL: ${att.url}]` });
          }
        }
        llmMessages.push({ role: "user", content: contentParts });
      } else {
        llmMessages.push({ role: lastMsg.role, content: lastMsg.content });
      }
    }

    // ── Tool definitions ───────────────────────────────────────────────────
    const pivotTools = [
      {
        type: "function" as const,
        function: {
          name: "web_search",
          description: "Search the web for real-time information. Use for current prices, weather, news, regulations, or anything you're not confident about.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query. Be specific, include location if relevant." },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "construction_lookup",
          description: "Look up construction reference data from the built-in knowledge base. Use for: AISC steel profiles (e.g. W8x44), Simpson Strong-Tie hardware (e.g. A35, LUS26, HHUS410), Utah building codes by jurisdiction, lumber properties, concrete data, crane/rigging info, safety requirements, framing codes. ALWAYS use this tool for construction data instead of guessing.",
          parameters: {
            type: "object",
            properties: {
              lookup_type: {
                type: "string",
                enum: ["steel_profile", "steel_weight", "simpson_hardware", "utah_code", "construction_reference"],
                description: "Type of lookup.",
              },
              query: { type: "string", description: "The item to look up. For steel: 'W8x44'. For Simpson: 'LUS26'. For Utah code: 'Summit County'. For reference: 'lumber span tables'." },
              length_ft: { type: "number", description: "(Only for steel_weight) Length in feet to calculate total weight." },
            },
            required: ["lookup_type", "query"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "image_search",
          description: "Search for images of construction hardware, tools, materials, or techniques. Use when the user asks to see what something looks like.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Image search query. Be specific (e.g. 'Simpson Strong-Tie A35 framing angle')." },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "generate_hardware_image",
          description: "Generate a detailed reference image of construction hardware, tools, connectors, or materials. Use when the user asks to SEE what a specific piece of hardware looks like and you want to show them a clear visual. Great for Simpson Strong-Tie connectors, steel profiles, framing hardware, bolts, brackets, etc.",
          parameters: {
            type: "object",
            properties: {
              item_name: { type: "string", description: "The exact name of the hardware item (e.g. 'Simpson Strong-Tie A35 framing angle', 'W8x44 steel beam', 'HHUS410 heavy hanger')." },
              description: { type: "string", description: "A detailed description of the item for image generation — include material, shape, mounting holes, dimensions if known, typical use case." },
            },
            required: ["item_name", "description"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_goal",
          description: "Create a new weekly goal in BuildTrack Pro. Use when the user asks you to create, add, set, or push a goal for someone. You MUST use this tool instead of just showing formatted text — actually create the goal in the database. IMPORTANT: When the user says 'for everyone' or 'for the whole crew' or 'for all', set assignToEveryone=true. When assigning to a specific person, use assignedToName. When the user wants a goal to repeat every day (like 'clock in by 7:30 daily'), set repeatDaily=true.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "The goal title. Be specific and actionable (e.g. 'Finish framing back of garage by Friday')." },
              description: { type: "string", description: "Optional longer description with details." },
              assignedToName: { type: "string", description: "The name of the employee to assign this goal to. Use their first name or full name as known. Leave empty if assignToEveryone is true." },
              assignToEveryone: { type: "boolean", description: "Set to true when the goal should be visible to ALL employees (the whole crew). When true, the goal will be assigned to every active employee. Default false." },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level. Default to medium if not specified." },
              deadline: { type: "string", description: `ISO date string for the deadline. MUST use the current year ${mtnYear}. Example: '${mtnYear}-04-18T17:00:00'. Calculate from context like 'by Friday' or 'end of week'. Use America/Denver (Mountain Time) for all times. NEVER use year 2024 or 2025.` },
              repeatDaily: { type: "boolean", description: "Set to true if this goal should repeat every day (auto-created each morning). Good for recurring tasks like 'clock in by 7:30' or 'conduct safety meeting'. Default false." },
            },
            required: ["title"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_punch_item",
          description: "Create a punch list item for a specific job. Use when the user asks to add items to a punch list, task list, or checklist for a job site. Creates checkable items that foremen and crew can tap to mark complete.",
          parameters: {
            type: "object",
            properties: {
              jobName: { type: "string", description: "The name of the job/project to add the punch item to (e.g. 'England Remodel', 'Alder & Tweed')." },
              area: { type: "string", description: "Optional area/section within the job (e.g. 'Garage', 'Basement', 'Back Patio')." },
              title: { type: "string", description: "The specific task/item (e.g. 'Frame back gable on truss section')." },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level. Default to medium." },
              assignedToName: { type: "string", description: "Optional: name of employee to assign this item to." },
            },
            required: ["jobName", "title"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "create_punch_items_bulk",
          description: "Create multiple punch list items at once for a job. Use when the user pastes or dictates a list of items. Each item becomes a checkable task.",
          parameters: {
            type: "object",
            properties: {
              jobName: { type: "string", description: "The name of the job/project." },
              area: { type: "string", description: "Optional area/section for all items." },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "The task description." },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                  },
                  required: ["title"],
                },
                description: "Array of items to create.",
              },
            },
            required: ["jobName", "items"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "clock_in_employee",
          description: "Clock in a specific employee to a job. Use when the user says 'clock in [name]', 'punch in [name]', or asks you to start tracking hours for someone. You MUST use this tool to actually clock them in — don't just say you will.",
          parameters: {
            type: "object",
            properties: {
              employeeName: { type: "string", description: "The name of the employee to clock in (first name or full name)." },
              jobName: { type: "string", description: "The name of the job/project to clock them into. Ask if not specified." },
              clockInTime: { type: "string", description: "Optional ISO datetime string for when to clock in. If not provided, uses current time." },
            },
            required: ["employeeName", "jobName"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "clock_out_employee",
          description: "Clock out a specific employee. Use when the user says 'clock out [name]', 'punch out [name]', or asks you to stop tracking hours for someone. You MUST use this tool — don't just say you will.",
          parameters: {
            type: "object",
            properties: {
              employeeName: { type: "string", description: "The name of the employee to clock out (first name or full name)." },
              clockOutTime: { type: "string", description: "Optional ISO datetime string for when to clock out. If not provided, uses current time." },
            },
            required: ["employeeName"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_clocked_in_status",
          description: "Get a list of all employees currently clocked in with their job and elapsed time. Use when the user asks 'who is clocked in', 'who is on site', 'who is working right now', etc.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "remember_correction",
          description: "Store a correction or important fact that the user has told you. Use when the user says 'no that\'s wrong', 'actually it\'s X', 'remember that', 'don\'t forget', 'next time do X', or corrects any information you gave. This permanently updates your memory so you never repeat the mistake.",
          parameters: {
            type: "object",
            properties: {
              correction: { type: "string", description: "The correction or fact to remember, stated clearly (e.g. 'The Alder & Tweed job is in Park City, not Salt Lake City')." },
              category: { type: "string", enum: ["employee", "job", "schedule", "preference", "process", "code", "pricing", "other"], description: "Category of the correction." },
            },
            required: ["correction", "category"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "generate_report",
          description: "Generate a daily report for a specific job. Use when the owner asks you to create, generate, or write a report for a job. Creates the report in the database immediately.",
          parameters: {
            type: "object",
            properties: {
              jobName: { type: "string", description: "The name of the job to generate a report for." },
              workCompleted: { type: "string", description: "Description of work completed. If not specified, generate a summary based on who was clocked in today." },
              notes: { type: "string", description: "Additional notes for the report." },
              weatherCondition: { type: "string", description: "Weather condition (sunny, cloudy, rainy, snowy, windy). Default to 'sunny' if not specified." },
              crewCount: { type: "number", description: "Number of crew members on site. If not specified, count from clock entries." },
            },
            required: ["jobName"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "mark_report_seen",
          description: "Mark a daily report as seen/reviewed by the owner. Use when Pedro says 'I've seen that report' or 'mark that as reviewed'.",
          parameters: {
            type: "object",
            properties: {
              reportId: { type: "number", description: "The ID of the report to mark as seen." },
              seen: { type: "boolean", description: "True to mark as seen, false to unmark. Default true." },
            },
            required: ["reportId"],
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_payroll_summary",
          description: "Get the current payroll period summary including total hours, estimated cost, and per-employee breakdown. Use when the user asks about payroll, hours this period, labor costs, or wants a report.",
          parameters: {
            type: "object",
            properties: {
              periodType: { type: "string", enum: ["current", "last", "this_week"], description: "Which period to report on. Default to 'current' for the active pay period." },
            },
            required: [],
          },
        },
      },
    ];

    // ── Call LLM with tool support ──────────────────────────────────────────
    let result = await invokeLLM({ messages: llmMessages, tools: pivotTools });
    let choice = result.choices?.[0];
    let content = choice?.message?.content;

    // ── Handle tool calls (web search loop, max 3 searches) ─────────────────
    let toolAttempts = 0;
    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && toolAttempts < 5) {
      toolAttempts++;
      const toolCall = choice.message.tool_calls[0];
      const toolName = toolCall.function?.name || "";
      let toolResult = "Tool not found.";

      try {
        const args = JSON.parse(toolCall.function?.arguments || "{}");

        if (toolName === "web_search") {
        const searchQuery = args.query || "";
        if (searchQuery) {
          try {
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
            const searchResp = await fetch(searchUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildTrackPivot/1.0)" },
            });
            const html = await searchResp.text();
            const snippets: string[] = [];
            const snippetRegex = /<a class="result__snippet"[^>]*>(.*?)<\/a>/gs;
            let match;
            while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
              snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
            }
            const titleRegex = /<a class="result__a"[^>]*href="([^"]*?)"[^>]*>(.*?)<\/a>/gs;
            const titles: string[] = [];
            while ((match = titleRegex.exec(html)) !== null && titles.length < 5) {
              titles.push(`${match[2].replace(/<[^>]*>/g, "").trim()} (${match[1]})`);
            }
            if (snippets.length > 0 || titles.length > 0) {
              toolResult = `Web search results for "${searchQuery}":\n`;
              for (let i = 0; i < Math.max(snippets.length, titles.length); i++) {
                if (titles[i]) toolResult += `\n${i + 1}. ${titles[i]}`;
                if (snippets[i]) toolResult += `\n   ${snippets[i]}`;
              }
            }
          } catch (searchErr) {
            toolResult = `Web search failed: ${searchErr instanceof Error ? searchErr.message : "unknown error"}`;
          }
          }
        } else if (toolName === "construction_lookup") {
          const lookupType = args.lookup_type || "";
          const query = args.query || "";
          const lengthFt = args.length_ft || 0;
          if (lookupType === "steel_profile") {
            toolResult = lookupSteelProfile(query);
            // Append beam diagram URL so Pivot can share it with the user
            if (toolResult && !toolResult.startsWith("No ") && !toolResult.startsWith("Could not")) {
              // Use the production base URL for absolute diagram URLs that render on mobile
              const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || "https://buildtrack-dnjxcthz.manus.space";
              const diagramUrl = `${apiBase.replace(/\/$/, "")}/api/beam-diagram?designation=${encodeURIComponent(query)}`;
              toolResult += `\n\n📐 STEEL CROSS-SECTION DIAGRAM URL: ${diagramUrl}\nYou MUST include this diagram in your response as a markdown image BEFORE the text data:\n![${query} Cross-Section](${diagramUrl})\nThis shows the cross-section with all labeled dimensions. Works for W-shapes (I-beam), HSS rectangular/square (hollow tube), HSS round (hollow pipe), and standard pipe shapes.`;
            }
          } else if (lookupType === "steel_weight" && lengthFt > 0) {
            toolResult = calculateSteelWeight(query, lengthFt);
          } else if (lookupType === "simpson_hardware") {
            toolResult = lookupSimpsonHardware(query);
          } else if (lookupType === "utah_code") {
            toolResult = lookupUtahCode(query);
          } else if (lookupType === "construction_reference") {
            toolResult = lookupConstructionReference(query);
          } else {
            toolResult = `Unknown lookup type: ${lookupType}. Use: steel_profile, steel_weight, simpson_hardware, utah_code, or construction_reference.`;
          }
        } else if (toolName === "image_search") {
        const query = args.query || "";
        if (query) {
          try {
            const imgSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " site:strongtie.com OR site:aisc.org")}`;
            const imgResp = await fetch(imgSearchUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildTrackPivot/1.0)" },
            });
            const imgHtml = await imgResp.text();
            const imgTitleRegex = /<a class="result__a"[^>]*href="([^"]*?)"[^>]*>(.*?)<\/a>/gs;
            const imgResults: string[] = [];
            let imgMatch;
            while ((imgMatch = imgTitleRegex.exec(imgHtml)) !== null && imgResults.length < 3) {
              imgResults.push(`${imgMatch[2].replace(/<[^>]*>/g, "").trim()}: ${imgMatch[1]}`);
            }
            if (imgResults.length > 0) {
              toolResult = `Image search results for "${query}":\n${imgResults.join("\n")}\nShare these links with the user so they can see the images.`;
            } else {
              toolResult = `No image results found. Suggest visiting strongtie.com or aisc.org directly.`;
            }
          } catch {
            toolResult = `Image search failed. Suggest visiting strongtie.com or aisc.org directly.`;
          }
          }
        } else if (toolName === "generate_hardware_image") {
          const itemName = args.item_name || "";
          const description = args.description || "";
          if (itemName) {
            try {
              const imagePrompt = `Professional product photograph of ${itemName}. ${description}. Studio lighting on white background, high detail, showing all mounting holes and features clearly. Construction hardware catalog style photo, no text overlays.`;
              const genResult = await generateImage({ prompt: imagePrompt });
              if (genResult.url) {
                toolResult = `Successfully generated an image of ${itemName}. Image URL: ${genResult.url}\n\nIMPORTANT: Include this image in your response using markdown format: ![${itemName}](${genResult.url})\nAlso describe the hardware verbally so the user understands what they're looking at.`;
              } else {
                toolResult = `Image generation completed but no URL was returned. Describe the hardware verbally instead.`;
              }
            } catch (imgErr) {
              toolResult = `Image generation failed: ${imgErr instanceof Error ? imgErr.message : "unknown error"}. Describe the hardware verbally instead and suggest visiting strongtie.com or aisc.org for reference images.`;
            }
          } else {
            toolResult = `No item name provided. Please specify what hardware to generate an image of.`;
          }
        } else if (toolName === "create_goal") {
          try {
            const title = args.title || "";
            const description = args.description || "";
            const assignedToName = args.assignedToName || "";
            const assignToEveryone = args.assignToEveryone === true;
            const priority = args.priority || "medium";
            const deadline = args.deadline || "";
            const repeatDaily = args.repeatDaily === true;

            // Get all active employees for "everyone" assignment
            const allEmps = await db.getAllEmployees();
            const activeEmps = allEmps.filter((e: any) => e.isActive);

            // Find assigned employee by name OR assign to everyone
            let assignedTo: number | undefined;
            let assignedToList: string | undefined;
            let assignedName = "everyone";
            if (assignToEveryone || (!assignedToName && !assignedToName.trim())) {
              // Assign to ALL active employees so everyone can see it
              assignedToList = activeEmps.map((e: any) => e.id).join(",");
              assignedName = "everyone (" + activeEmps.length + " employees)";
            } else if (assignedToName) {
              const match = allEmps.find((e: any) => 
                e.name.toLowerCase().includes(assignedToName.toLowerCase()) ||
                assignedToName.toLowerCase().includes(e.name.split(' ')[0].toLowerCase())
              );
              if (match) {
                assignedTo = match.id;
                assignedToList = String(match.id);
                assignedName = match.name;
              }
            }

            // Calculate weekOf (Monday of current week in Mountain Time)
            const mtnFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
            const mtnParts = mtnFormatter.formatToParts(new Date());
            const mtnYr = parseInt(mtnParts.find(p => p.type === 'year')!.value);
            const mtnMo = parseInt(mtnParts.find(p => p.type === 'month')!.value) - 1;
            const mtnDy = parseInt(mtnParts.find(p => p.type === 'day')!.value);
            const todayMtn = new Date(Date.UTC(mtnYr, mtnMo, mtnDy, 12, 0, 0));
            const dayOfWeek = todayMtn.getUTCDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(Date.UTC(mtnYr, mtnMo, mtnDy + mondayOffset, 12, 0, 0));

            // Validate and fix deadline year
            let parsedDeadline: Date | undefined;
            if (deadline) {
              parsedDeadline = new Date(deadline);
              if (parsedDeadline.getFullYear() < mtnYear) {
                parsedDeadline.setFullYear(mtnYear);
              }
            }

            const goalId = await db.createWeeklyGoal({
              title,
              description: (description || "") + (repeatDaily ? " [REPEAT DAILY]" : ""),
              assignedTo,
              assignedToList,
              weekOf: weekStart,
              priority: priority as "low" | "medium" | "high",
              deadline: parsedDeadline,
              createdBy: input.employeeId,
            });

            toolResult = `Goal created successfully! ID: ${goalId}\nTitle: ${title}\nAssigned to: ${assignedName}\nPriority: ${priority}\n${repeatDaily ? "Repeats: DAILY (will auto-create each morning)\n" : ""}${deadline ? `Deadline: ${new Date(deadline).toLocaleDateString("en-US", { timeZone: "America/Denver" })}` : "No deadline set"}\n\nTell the user the goal was created and they can see it in the Goals tab.${assignToEveryone ? " This goal is visible to ALL employees." : ""}`;
          } catch (goalErr) {
            toolResult = `Failed to create goal: ${goalErr instanceof Error ? goalErr.message : "unknown error"}`;
          }
        } else if (toolName === "create_punch_item") {
          try {
            const jobName = args.jobName || "";
            const area = args.area || "";
            const title = args.title || "";
            const priority = args.priority || "medium";
            const assignedToName = args.assignedToName || "";

            // Find job by name
            const allJobs = await db.getAllJobs();
            const jobMatch = allJobs.find((j: any) =>
              j.name.toLowerCase().includes(jobName.toLowerCase()) ||
              jobName.toLowerCase().includes(j.name.toLowerCase())
            );
            if (!jobMatch) {
              toolResult = `Could not find a job matching "${jobName}". Available jobs: ${allJobs.map((j: any) => j.name).join(", ")}. Ask the user to clarify which job.`;
            } else {
              // Find assigned employee
              let assignedTo: number | undefined;
              if (assignedToName) {
                const allEmps = await db.getAllEmployees();
                const empMatch = allEmps.find((e: any) =>
                  e.name.toLowerCase().includes(assignedToName.toLowerCase()) ||
                  assignedToName.toLowerCase().includes(e.name.split(' ')[0].toLowerCase())
                );
                if (empMatch) assignedTo = empMatch.id;
              }

              const itemId = await db.createPunchListItem({
                jobId: jobMatch.id,
                area: area || undefined,
                title,
                priority: priority as "low" | "medium" | "high",
                assignedTo,
                createdBy: input.employeeId,
              });

              toolResult = `Punch list item created! ID: ${itemId}\nJob: ${jobMatch.name}\n${area ? `Area: ${area}\n` : ""}Item: ${title}\nPriority: ${priority}\n\nTell the user the item was added to the punch list and they can find it in the job's Punch List tab.`;
            }
          } catch (punchErr) {
            toolResult = `Failed to create punch list item: ${punchErr instanceof Error ? punchErr.message : "unknown error"}`;
          }
        } else if (toolName === "create_punch_items_bulk") {
          try {
            const jobName = args.jobName || "";
            const area = args.area || "";
            const items = args.items || [];

            const allJobs = await db.getAllJobs();
            const jobMatch = allJobs.find((j: any) =>
              j.name.toLowerCase().includes(jobName.toLowerCase()) ||
              jobName.toLowerCase().includes(j.name.toLowerCase())
            );
            if (!jobMatch) {
              toolResult = `Could not find a job matching "${jobName}". Available jobs: ${allJobs.map((j: any) => j.name).join(", ")}. Ask the user to clarify.`;
            } else {
              const bulkItems = items.map((item: any, idx: number) => ({
                jobId: jobMatch.id,
                area: area || undefined,
                title: item.title,
                priority: (item.priority || "medium") as "low" | "medium" | "high",
                createdBy: input.employeeId,
                sortOrder: idx,
              }));

              const count = await db.createPunchListItemsBulk(bulkItems);
              toolResult = `Successfully created ${count} punch list items for ${jobMatch.name}${area ? ` (${area})` : ""}!\n\nItems added:\n${items.map((item: any, i: number) => `${i + 1}. ${item.title}`).join("\n")}\n\nTell the user all items were added and they can check them off in the Punch List tab.`;
            }
          } catch (bulkErr) {
            toolResult = `Failed to create punch list items: ${bulkErr instanceof Error ? bulkErr.message : "unknown error"}`;
          }
        } else if (toolName === "clock_in_employee") {
          try {
            const employeeName = args.employeeName || "";
            const jobName = args.jobName || "";
            const clockInTime = args.clockInTime ? new Date(args.clockInTime) : new Date();
            const allEmps = await db.getAllEmployees();
            const empMatch = allEmps.find((e: any) =>
              e.name.toLowerCase().includes(employeeName.toLowerCase()) ||
              employeeName.toLowerCase().includes(e.name.split(' ')[0].toLowerCase())
            );
            if (!empMatch) {
              toolResult = `Could not find an employee matching "${employeeName}". Available employees: ${allEmps.map((e: any) => e.name).join(", ")}. Ask the user to clarify.`;
            } else {
              // Check if already clocked in
              const existing = await db.getActiveClockEntry(empMatch.id);
              if (existing) {
                toolResult = `${empMatch.name} is already clocked in (since ${new Date(existing.clockIn).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}). They need to clock out first. Tell the user this.`;
              } else {
                const allJobs = await db.getAllJobs();
                const jobMatch = allJobs.find((j: any) =>
                  j.name.toLowerCase().includes(jobName.toLowerCase()) ||
                  jobName.toLowerCase().includes(j.name.toLowerCase())
                );
                if (!jobMatch) {
                  toolResult = `Could not find a job matching "${jobName}". Available jobs: ${allJobs.map((j: any) => j.name).join(", ")}. Ask the user to clarify.`;
                } else {
                  await db.clockIn({ employeeId: empMatch.id, jobId: jobMatch.id, clockIn: clockInTime, isOfflineEntry: false });
                  toolResult = `Successfully clocked in ${empMatch.name} to ${jobMatch.name} at ${clockInTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}. Tell the user it's done.`;
                }
              }
            }
          } catch (ciErr) {
            toolResult = `Failed to clock in employee: ${ciErr instanceof Error ? ciErr.message : "unknown error"}`;
          }
        } else if (toolName === "clock_out_employee") {
          try {
            const employeeName = args.employeeName || "";
            const clockOutTime = args.clockOutTime ? new Date(args.clockOutTime) : new Date();
            const allEmps = await db.getAllEmployees();
            const empMatch = allEmps.find((e: any) =>
              e.name.toLowerCase().includes(employeeName.toLowerCase()) ||
              employeeName.toLowerCase().includes(e.name.split(' ')[0].toLowerCase())
            );
            if (!empMatch) {
              toolResult = `Could not find an employee matching "${employeeName}". Ask the user to clarify.`;
            } else {
              const activeEntry = await db.getActiveClockEntry(empMatch.id);
              if (!activeEntry) {
                toolResult = `${empMatch.name} is not currently clocked in. Nothing to clock out. Tell the user this.`;
              } else {
                await db.clockOut(activeEntry.id, clockOutTime);
                const durationMs = clockOutTime.getTime() - new Date(activeEntry.clockIn).getTime();
                const hours = Math.floor(durationMs / 3600000);
                const mins = Math.floor((durationMs % 3600000) / 60000);
                toolResult = `Successfully clocked out ${empMatch.name} at ${clockOutTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}. Total time: ${hours}h ${mins}m. Tell the user it's done.`;
              }
            }
          } catch (coErr) {
            toolResult = `Failed to clock out employee: ${coErr instanceof Error ? coErr.message : "unknown error"}`;
          }
        } else if (toolName === "get_clocked_in_status") {
          try {
            const clockedIn = await db.getClockedInEmployees();
            if (!clockedIn || clockedIn.length === 0) {
              toolResult = "No employees are currently clocked in. Tell the user the site is empty right now.";
            } else {
              const now = new Date();
              const lines = clockedIn.map((e: any) => {
                const elapsed = now.getTime() - new Date(e.clockIn).getTime();
                const h = Math.floor(elapsed / 3600000);
                const m = Math.floor((elapsed % 3600000) / 60000);
                return `- ${e.employeeName || 'Unknown'}: ${e.jobName || 'Unknown Job'} (${h}h ${m}m)`;
              });
              toolResult = `Currently clocked in (${clockedIn.length} employees):\n${lines.join('\n')}\n\nReport this list to the user.`;
            }
          } catch (statusErr) {
            toolResult = `Failed to get clocked-in status: ${statusErr instanceof Error ? statusErr.message : "unknown error"}`;
          }
        } else if (toolName === "remember_correction") {
          try {
            const correction = args.correction || "";
            const category = args.category || "other";
            const currentMemory = await db.getPivotMemory(input.employeeId);
            const existingCorrections = currentMemory?.preferences ? JSON.parse(currentMemory.preferences) : {};
            if (!existingCorrections.corrections) existingCorrections.corrections = [];
            existingCorrections.corrections.push({ correction, category, learnedAt: new Date().toISOString() });
            // Keep only last 50 corrections
            if (existingCorrections.corrections.length > 50) existingCorrections.corrections = existingCorrections.corrections.slice(-50);
            await db.upsertPivotMemory(input.employeeId, { preferences: JSON.stringify(existingCorrections) });
            toolResult = `Correction stored: "${correction}" (category: ${category}). I will remember this going forward. Tell the user you've noted the correction and will apply it from now on.`;
          } catch (corrErr) {
            toolResult = `Failed to store correction: ${corrErr instanceof Error ? corrErr.message : "unknown error"}`;
          }
        } else if (toolName === "generate_report") {
          try {
            const jobName = args.jobName || "";
            const allJobs = await db.getAllJobs();
            const jobMatch = allJobs.find((j: any) =>
              j.name.toLowerCase().includes(jobName.toLowerCase()) ||
              jobName.toLowerCase().includes(j.name.toLowerCase())
            );
            if (!jobMatch) {
              toolResult = `Could not find a job matching "${jobName}". Available jobs: ${allJobs.map((j: any) => j.name).join(", ")}. Ask the user to clarify.`;
            } else {
              // Get today's clock entries for this job to auto-generate work summary
              const mtnNowLocal = new Date();
              const todayStr = mtnNowLocal.toLocaleDateString('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' });
              const [mo, dy, yr] = todayStr.split('/');
              const todayDate = new Date(`${yr}-${mo}-${dy}T00:00:00`);
              
              let workCompleted = args.workCompleted || "";
              let crewCount = args.crewCount || 0;
              
              if (!workCompleted || !crewCount) {
                try {
                  const clockedIn = await db.getClockedInEmployees();
                  const jobCrew = clockedIn.filter((c: any) => c.jobId === jobMatch.id);
                  if (!crewCount) crewCount = jobCrew.length;
                  if (!workCompleted && jobCrew.length > 0) {
                    const names = jobCrew.map((c: any) => c.employeeName || 'Unknown').join(', ');
                    workCompleted = `Crew on site: ${names}. Work in progress.`;
                  }
                } catch {}
              }
              
              const reportId = await db.createDailyReport({
                jobId: jobMatch.id,
                submittedBy: input.employeeId,
                reportDate: todayDate,
                workCompleted: workCompleted || "Report generated by Pivot",
                notes: args.notes || "",
                weatherCondition: args.weatherCondition || "sunny",
                crewCount: crewCount || 0,
              });
              
              toolResult = `Daily report created successfully! ID: ${reportId}\nJob: ${jobMatch.name}\nDate: ${todayStr}\nWork: ${workCompleted || 'Generated by Pivot'}\nCrew: ${crewCount}\nWeather: ${args.weatherCondition || 'sunny'}\n\nTell the user the report was created and they can view it in the Reports tab.`;
            }
          } catch (reportErr) {
            toolResult = `Failed to generate report: ${reportErr instanceof Error ? reportErr.message : "unknown error"}`;
          }
        } else if (toolName === "mark_report_seen") {
          try {
            const reportId = args.reportId;
            const seen = args.seen !== false;
            await db.markReportSeen(reportId, seen);
            toolResult = `Report #${reportId} has been marked as ${seen ? 'reviewed' : 'unreviewed'} by the owner. Tell the user it's done.`;
          } catch (seenErr) {
            toolResult = `Failed to mark report: ${seenErr instanceof Error ? seenErr.message : "unknown error"}`;
          }
        } else if (toolName === "get_payroll_summary") {
          try {
            const periodType = args.periodType || "current";
            const PERIOD_ANCHOR_MS = new Date('2026-04-06T00:00:00').getTime();
            const PERIOD_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;
            const now = new Date();
            const elapsed = now.getTime() - PERIOD_ANCHOR_MS;
            const periodsElapsed = Math.floor(elapsed / PERIOD_LENGTH_MS);
            let periodStart: Date, periodEnd: Date;
            if (periodType === "last") {
              periodStart = new Date(PERIOD_ANCHOR_MS + (periodsElapsed - 1) * PERIOD_LENGTH_MS);
              periodEnd = new Date(PERIOD_ANCHOR_MS + periodsElapsed * PERIOD_LENGTH_MS - 1);
            } else if (periodType === "this_week") {
              periodStart = new Date(PERIOD_ANCHOR_MS + periodsElapsed * PERIOD_LENGTH_MS);
              periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
            } else {
              periodStart = new Date(PERIOD_ANCHOR_MS + periodsElapsed * PERIOD_LENGTH_MS);
              periodEnd = new Date(periodStart.getTime() + PERIOD_LENGTH_MS - 1);
            }
            const allEmps = await db.getAllEmployees();
            let totalMinutes = 0;
            let totalCost = 0;
            const empLines: string[] = [];
            for (const emp of allEmps.filter((e: any) => e.isActive)) {
              const entries = await db.getClockEntriesForEmployee(emp.id, periodStart);
              const periodEntries = entries.filter((e: any) => new Date(e.clockIn) <= periodEnd);
              const empMinutes = periodEntries.reduce((sum: number, e: any) => {
                if (!e.clockOut) return sum;
                return sum + Math.max(0, (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 60000);
              }, 0);
              if (empMinutes > 0) {
                const rate = parseFloat(emp.hourlyRate || '0');
                const empCost = (empMinutes / 60) * rate;
                totalMinutes += empMinutes;
                totalCost += empCost;
                empLines.push(`- ${emp.name}: ${Math.floor(empMinutes/60)}h ${Math.round(empMinutes%60)}m @ $${rate}/hr = $${empCost.toFixed(2)}`);
              }
            }
            const periodLabel = `${periodStart.toLocaleDateString('en-US', {month:'short',day:'numeric'})} - ${periodEnd.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}`;
            toolResult = `Payroll Summary (${periodLabel}):\nTotal hours: ${Math.floor(totalMinutes/60)}h ${Math.round(totalMinutes%60)}m\nEstimated cost: $${totalCost.toFixed(2)}\n\nEmployee breakdown:\n${empLines.join('\n') || 'No hours recorded yet.'}\n\nPresent this summary to the user.`;
          } catch (payErr) {
            toolResult = `Failed to get payroll summary: ${payErr instanceof Error ? payErr.message : "unknown error"}`;
          }
        }
      } catch (parseErr) {
        toolResult = `Error parsing tool arguments: ${parseErr instanceof Error ? parseErr.message : "unknown"}`;
      }

      // Add the assistant's tool call and the tool result to messages
      llmMessages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: toolCall.id,
          type: "function",
          function: { name: toolName, arguments: toolCall.function?.arguments || "{}" },
        }],
      });
      llmMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });

      // Call LLM again with tool results
      result = await invokeLLM({ messages: llmMessages, tools: pivotTools });
      choice = result.choices?.[0];
      content = choice?.message?.content;
    }

    if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from AI" });

    // ── Save conversation to memory ─────────────────────────────────────────
    try {
      // Save user message
      if (lastUserMsg) {
        await db.savePivotConversation(input.employeeId, "user", lastUserMsg, preferredLang);
      }
      // Save assistant response
      await db.savePivotConversation(input.employeeId, "assistant", content as string, preferredLang);

      // Update memory summary every 5 interactions using AI
      const currentMemory = await db.getPivotMemory(input.employeeId);
      const interactionCount = (currentMemory?.interactionCount || 0) + 1;

      if (interactionCount % 5 === 0) {
        // Generate a memory summary
        const recentConvos = await db.getRecentPivotConversations(input.employeeId, 20);
        const convoText = recentConvos.reverse().map((c: any) => `[${c.role}]: ${c.content}`).join("\n");
        const summaryResult = await invokeLLM({
          messages: [
            { role: "system", content: `You are a memory summarizer for an AI assistant called Pivot. Analyze the conversation below and produce a concise summary in these sections:

## CONVERSATION_SUMMARY
Key topics discussed, important decisions, action items. Keep under 300 words.

## PERSONAL_PROFILE
Extract a JSON object of personal details the user shared (family members, hobbies, interests, favorite things, life events, dreams, struggles). Only include things they actually mentioned. Example: {"family": "has a daughter named Sofia", "hobbies": "likes fishing on weekends", "car": "drives a Ford F-150"}
If no personal details were shared, write: {}

## COMMUNICATION_STYLE
Extract a JSON object describing how this person communicates. Example: {"tone": "casual and direct", "humor": "likes jokes and banter", "energy": "high energy morning person", "language": "mixes English and Spanish"}
If not enough data, write: {}
${isOwner ? "\n## OWNER_PATTERNS\nDecision-making patterns, recurring concerns, business priorities you notice." : ""}` },
            { role: "user", content: `Previous summary: ${currentMemory?.conversationSummary || "None yet"}\n\nRecent conversations:\n${convoText}` },
          ],
        });
        const summaryContent = summaryResult.choices?.[0]?.message?.content;
        if (summaryContent) {
          const summaryStr = summaryContent as string;
          // Extract conversation summary section
          const convSummaryMatch = summaryStr.match(/CONVERSATION_SUMMARY[:\s]*([\s\S]*?)(?=##|$)/i);
          const updateData: any = {
            conversationSummary: convSummaryMatch ? convSummaryMatch[1].trim() : summaryStr,
            preferredLanguage: preferredLang,
          };
          // Extract personal profile JSON
          const profileMatch = summaryStr.match(/PERSONAL_PROFILE[:\s]*([\s\S]*?)(?=##|$)/i);
          if (profileMatch) {
            try {
              const jsonMatch = profileMatch[1].match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const newProfile = JSON.parse(jsonMatch[0]);
                if (Object.keys(newProfile).length > 0) {
                  // Merge with existing profile
                  const existingProfile = currentMemory?.personalProfile ? JSON.parse(currentMemory.personalProfile) : {};
                  updateData.personalProfile = JSON.stringify({ ...existingProfile, ...newProfile });
                }
              }
            } catch {}
          }
          // Extract communication style JSON
          const styleMatch = summaryStr.match(/COMMUNICATION_STYLE[:\s]*([\s\S]*?)(?=##|$)/i);
          if (styleMatch) {
            try {
              const jsonMatch = styleMatch[1].match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const newStyle = JSON.parse(jsonMatch[0]);
                if (Object.keys(newStyle).length > 0) {
                  const existingStyle = currentMemory?.communicationStyle ? JSON.parse(currentMemory.communicationStyle) : {};
                  updateData.communicationStyle = JSON.stringify({ ...existingStyle, ...newStyle });
                }
              }
            } catch {}
          }
          // Extract owner patterns if present
          if (isOwner && summaryStr.includes("OWNER_PATTERNS")) {
            const patternMatch = summaryStr.match(/OWNER_PATTERNS[:\s]*([\s\S]*?)$/i);
            if (patternMatch) {
              const existingPatterns = currentMemory?.ownerPatterns ? JSON.parse(currentMemory.ownerPatterns) : {};
              existingPatterns.latestAnalysis = patternMatch[1].trim();
              existingPatterns.updatedAt = new Date().toISOString();
              updateData.ownerPatterns = JSON.stringify(existingPatterns);
            }
          }
          await db.upsertPivotMemory(input.employeeId, updateData);
        }
      } else {
        // Just update interaction count and language
        await db.upsertPivotMemory(input.employeeId, { preferredLanguage: preferredLang });
      }
    } catch (memErr) {
      console.warn("[Pivot] Memory save failed:", memErr);
    }

    return { message: content as string };
  }),

  // ── Get/Set Language Preference ────────────────────────────────────────────
  getLanguage: publicProcedure.input(z.object({ employeeId: z.number() })).query(async ({ input }) => {
    const memory = await db.getPivotMemory(input.employeeId);
    return { language: memory?.preferredLanguage || "en" };
  }),

  setLanguage: publicProcedure.input(z.object({ employeeId: z.number(), language: z.string() })).mutation(async ({ input }) => {
    await db.updatePivotLanguage(input.employeeId, input.language);
    return { success: true };
  }),

  // ── Get Memory (owner-only for pattern viewing) ───────────────────────────
  getMemory: publicProcedure.input(z.object({ employeeId: z.number() })).query(async ({ input }) => {
    const employee = await db.getEmployeeById(input.employeeId);
    if (!employee) throw new TRPCError({ code: "NOT_FOUND" });
    const memory = await db.getPivotMemory(input.employeeId);
    return {
      conversationSummary: memory?.conversationSummary || null,
      preferences: memory?.preferences ? JSON.parse(memory.preferences) : null,
      personalProfile: memory?.personalProfile ? JSON.parse(memory.personalProfile) : null,
      communicationStyle: memory?.communicationStyle ? JSON.parse(memory.communicationStyle) : null,
      ownerPatterns: employee.role === "owner" && memory?.ownerPatterns ? JSON.parse(memory.ownerPatterns) : null,
      interactionCount: memory?.interactionCount || 0,
      preferredLanguage: memory?.preferredLanguage || "en",
    };
  }),

  transcribeVoice: publicProcedure.input(z.object({
    audioUrl: z.string().url(),
  })).mutation(async ({ input }) => {
    try {
      console.log(`[transcribeVoice] Starting transcription for: ${input.audioUrl}`);
      const result = await transcribeAudio({ audioUrl: input.audioUrl, language: "en" });
      // Check if result is an error object
      if ("error" in result) {
        console.error(`[transcribeVoice] Transcription error:`, JSON.stringify(result));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Transcription failed: ${result.error}${result.details ? ` (${result.details})` : ""}`,
        });
      }
      const text = result.text || "";
      console.log(`[transcribeVoice] Success, length: ${text.length}`);
      return { text };
    } catch (err: any) {
      if (err instanceof TRPCError) throw err;
      console.error(`[transcribeVoice] Unexpected error:`, err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Transcription failed unexpectedly" });
    }
  }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  employees: employeeRouter,
  jobs: jobsRouter,
  clock: clockRouter,
  reports: reportsRouter,
  budget: budgetRouter,
  meetings: meetingsRouter,
  goals: goalsRouter,
  payroll: payrollRouter,
  qbEstimates: qbEstimatesRouter,
  kpi: kpiRouter,
  laborDashboard: laborDashboardRouter,
  budgetAlerts: budgetAlertsRouter,
  safetyTopics: safetyTopicsRouter,
  safetyMeetings: safetyMeetingsRouter,
  pivot: pivotRouter,
  punchList: punchListRouter,
});

export type AppRouter = typeof appRouter;
