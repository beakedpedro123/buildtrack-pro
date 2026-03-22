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
    role: z.enum(["owner", "secretary", "logistics", "foreman", "laborer"]),
    pin: z.string().min(4).max(6),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    hourlyRate: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "add employees");
    const { requestingEmployeeId: _, ...data } = input;
    return db.createEmployee(data);
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).max(128).optional(),
    role: z.enum(["owner", "secretary", "logistics", "foreman", "laborer"]).optional(),
    pin: z.string().min(4).max(6).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    hourlyRate: z.string().optional(),
    isActive: z.boolean().optional(),
    requestingEmployeeId: z.number().optional(),
  })).mutation(async ({ input }) => {
    if (input.requestingEmployeeId) {
      await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "update employee records");
    }
    const { id, requestingEmployeeId: _, ...data } = input;
    return db.updateEmployee(id, data);
  }),
  deactivate: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "deactivate employees");
    return db.deactivateEmployee(input.id);
  }),
  createWithInvite: publicProcedure.input(z.object({
    name: z.string().min(1).max(128),
    role: z.enum(["owner", "secretary", "logistics", "foreman", "laborer"]),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    hourlyRate: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "add employees");
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
  list: publicProcedure.query(() => db.getAllJobs()),
  listActive: publicProcedure.query(() => db.getActiveJobs()),
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
    clockInLatitude: z.number().optional(),
    clockInLongitude: z.number().optional(),
    isOfflineEntry: z.boolean().default(false),
    localId: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(({ input }) => db.clockIn({ ...input, clockIn: new Date(input.clockIn) })),
  out: publicProcedure.input(z.object({
    entryId: z.number(),
    clockOut: z.string(),
    clockOutLatitude: z.number().optional(),
    clockOutLongitude: z.number().optional(),
  })).mutation(({ input }) => db.clockOut(input.entryId, new Date(input.clockOut), input.clockOutLatitude, input.clockOutLongitude)),
  activeEntry: publicProcedure.input(z.object({ employeeId: z.number() })).query(({ input }) => db.getActiveClockEntry(input.employeeId)),
  history: publicProcedure.input(z.object({ employeeId: z.number(), since: z.string().optional() })).query(({ input }) => db.getClockEntriesForEmployee(input.employeeId, input.since ? new Date(input.since) : undefined)),
  forJob: publicProcedure.input(z.object({ jobId: z.number(), date: z.string().optional() })).query(({ input }) => db.getClockEntriesForJob(input.jobId, input.date ? new Date(input.date) : undefined)),
  allClockedIn: publicProcedure.query(() => db.getClockedInEmployees()),
  laborCostForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getLaborCostForJob(input.jobId)),
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
  })).mutation(async ({ input }) => {
    const buffer = Buffer.from(input.base64, "base64");
    const key = `reports/${input.jobId}/${input.reportId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { url } = await storagePut(key, buffer, input.mimeType);
    const photoId = await db.addReportPhoto({ reportId: input.reportId, jobId: input.jobId, uploadedBy: input.uploadedBy, url, caption: input.caption });
    return { id: photoId, url };
  }),
  getPhotos: publicProcedure.input(z.object({ reportId: z.number() })).query(({ input }) => db.getPhotosForReport(input.reportId)),
  getPhotosForJob: publicProcedure.input(z.object({ jobId: z.number() })).query(({ input }) => db.getPhotosForJob(input.jobId)),
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
    let transcript = "";
    try {
      const result = await transcribeAudio({ audioUrl: meeting.audioUrl, language: "en", prompt: "Construction management meeting" });
      transcript = (result as any).text || "";
    } catch {
      transcript = "[Transcription failed — please review audio manually]";
    }
    let summary = "";
    let suggestedGoals: string[] = [];
    try {
      const llmResult = await invokeLLM({
        messages: [
          { role: "system", content: `You are an assistant for a construction business. Given a meeting transcript, produce:\n1. A concise summary (3-5 sentences) of what was discussed.\n2. A list of 3-6 actionable weekly goals derived from the meeting.\nReturn JSON: { "summary": "...", "goals": ["..."] }` },
          { role: "user", content: transcript || "No transcript available." },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(llmResult.choices[0].message.content as string);
      summary = parsed.summary || "";
      suggestedGoals = Array.isArray(parsed.goals) ? parsed.goals : [];
    } catch {
      summary = "[Summary generation failed]";
    }
    await db.updateMeeting(input.id, { transcript, summary, status: "completed" });
    return { transcript, summary, suggestedGoals };
  }),
  cancel: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updateMeeting(input.id, { status: "cancelled" });
    return { success: true };
  }),
});

const goalsRouter = router({
  list: publicProcedure.input(z.object({ weekOf: z.string().optional() })).query(({ input }) =>
    db.getWeeklyGoals(input.weekOf ? new Date(input.weekOf) : undefined)
  ),
  forMeeting: publicProcedure.input(z.object({ meetingId: z.number() })).query(({ input }) =>
    db.getGoalsForMeeting(input.meetingId)
  ),
  create: publicProcedure.input(z.object({
    meetingId: z.number().optional(),
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    assignedTo: z.number().optional(),
    weekOf: z.string(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    createdBy: z.number(),
  })).mutation(async ({ input }) => {
    const id = await db.createWeeklyGoal({ ...input, weekOf: new Date(input.weekOf) });
    return { id };
  }),
  update: publicProcedure.input(z.object({
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignedTo: z.number().optional(),
    completedAt: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { id, completedAt, ...rest } = input;
    await db.updateWeeklyGoal(id, { ...rest, completedAt: completedAt ? new Date(completedAt) : undefined });
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deleteWeeklyGoal(input.id);
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
    type SummaryRow = { employeeId: number; name: string; role: string; hourlyRate: string | null; totalMinutes: number; entries: typeof entries };
    const summary: Record<number, SummaryRow> = {};
    for (const entry of entries) {
      if (!entry.clockOut) continue;
      const durationMs = new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime();
      const minutes = Math.floor(durationMs / 60000);
      if (!summary[entry.employeeId]) {
        const emp = employeeMap.get(entry.employeeId);
        summary[entry.employeeId] = { employeeId: entry.employeeId, name: emp?.name || "Unknown", role: emp?.role || "laborer", hourlyRate: emp?.hourlyRate ?? null, totalMinutes: 0, entries: [] };
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
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "create QB estimates");
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
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "update QB estimates");
    const { id, requestingEmployeeId, ...data } = input;
    await db.updateQbEstimate(id, data);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "delete QB estimates");
    await db.deleteQbEstimate(input.id);
    return { success: true };
  }),
  extractFromPdf: publicProcedure.input(z.object({
    pdfUrl: z.string(),
    jobId: z.number(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "extract estimates");
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
    await assertRole(input.createdBy, ["owner", "secretary"], "create KPIs");
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
    await assertRole(input.requestingEmployeeId, ["owner", "secretary"], "update KPIs");
    const { id, requestingEmployeeId, ...data } = input;
    await db.updateKpi(id, data);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary"], "delete KPIs");
    await db.deleteKpi(input.id);
    return { success: true };
  }),
  addHistoryEntry: publicProcedure.input(z.object({
    kpiId: z.number(),
    value: z.string(),
    notes: z.string().optional(),
    recordedBy: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.recordedBy, ["owner", "secretary"], "record KPI values");
    await db.addKpiHistoryEntry(input);
    return { success: true };
  }),
  getHistory: publicProcedure.input(z.object({ kpiId: z.number(), limit: z.number().default(12) })).query(({ input }) => db.getKpiHistory(input.kpiId, input.limit)),
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
});

export type AppRouter = typeof appRouter;
