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
      const result = await transcribeAudio({ audioUrl: meeting.audioUrl, language: "en", prompt: "Construction management meeting" });
      transcript = (result as any).text || "";
    } catch {
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
    deadline: z.string().optional(),
    createdBy: z.number(),
  })).mutation(async ({ input }) => {
    const id = await db.createWeeklyGoal({
      ...input,
      weekOf: new Date(input.weekOf),
      deadline: input.deadline ? new Date(input.deadline) : undefined,
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
    deadline: z.string().nullable().optional(),
    completedAt: z.string().optional(),
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

const safetyTopicsRouter = router({
  list: publicProcedure.input(z.object({ activeOnly: z.boolean().default(true) })).query(({ input }) => db.getSafetyTopics(input.activeOnly)),
  create: publicProcedure.input(z.object({
    title: z.string().min(1).max(255),
    content: z.string().optional(),
    category: z.string().optional(),
    requestingEmployeeId: z.number(),
  })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "create safety topics");
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
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "update safety topics");
    const { id, requestingEmployeeId, ...data } = input;
    await db.updateSafetyTopic(id, data);
    return { success: true };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics"], "delete safety topics");
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
    await assertRole(input.conductedBy, ["owner", "secretary", "logistics", "foreman"], "create safety meetings");
    const id = await db.createSafetyMeeting({
      ...input,
      conductedAt: new Date(input.conductedAt),
    });
    return { id };
  }),
  delete: publicProcedure.input(z.object({ id: z.number(), requestingEmployeeId: z.number() })).mutation(async ({ input }) => {
    await assertRole(input.requestingEmployeeId, ["owner", "secretary", "logistics", "foreman"], "delete safety meetings");
    await db.deleteSafetyMeeting(input.id);
    return { success: true };
  }),
});

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

    const isManagement = ["owner", "secretary", "logistics"].includes(employee.role);
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
          const assignee = g.assignedTo ? empMap.get(g.assignedTo) || "Unknown" : "Everyone";
          const dl = g.deadline ? new Date(g.deadline) : null;
          const isOverdue = dl && dl < now && g.status !== "completed" && g.status !== "cancelled";
          goalsContext += `- ${status} ${g.title} [${g.priority.toUpperCase()}] → ${assignee}${dl ? ` (Due: ${dl.toLocaleDateString([], { month: "short", day: "numeric" })} ${dl.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})` : ""}${isOverdue ? " ⚠️ OVERDUE" : ""}\n`;
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
            const assignee = g.assignedTo ? empMap.get(g.assignedTo) || "Unknown" : "Everyone";
            allGoalsContext += `- ${status} ${g.title} [${g.priority.toUpperCase()}] → ${assignee}\n`;
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

        businessContext = `\n## Live Business Data (as of ${now.toLocaleDateString()})\n- Active Jobs: ${activeJobs.length} (${activeJobs.map((j: any) => j.name).join(", ")})\n- Active Employees: ${activeEmployees.length}\n- Labor Cost This Week: $${totalWeekCost.toFixed(2)}\n- Jobs with labor this week: ${laborByJob.length}\n${kpis.length > 0 ? `- KPIs tracked: ${kpis.map((k: any) => `${k.name} (${k.category}): ${k.currentValue || "no data"} / target ${k.targetValue || "not set"}`).join("; ")}` : ""}\n`;
      } catch {
        businessContext = "(Business data temporarily unavailable)";
      }
    }

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
- Current material prices, lumber costs, steel prices in Utah
- Weather conditions
- Building codes, OSHA regulations
- General knowledge questions you're not sure about
- News, events, or anything time-sensitive
You should use the web_search tool to look it up and give them accurate, current information.
Always tell the user when you searched for something: "I looked that up for you — here's what I found..."
Don't guess when you can search. Real data beats assumptions every time.
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

You are talking to: ${employee.name} (${employee.role === "secretary" ? "Office Manager" : employee.role === "logistics" ? "Logistics Manager" : "Owner"})
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

## Cross-Tab Actions You Can Execute
You can help initiate actions across all app tabs. When asked, respond with a clear formatted action block:

**Goal Creation** — when asked to create a goal, respond with:
📋 GOAL READY TO CREATE
Title: [specific goal title]
Assignee: [employee name]
Priority: HIGH / MEDIUM / LOW
Deadline: [specific date and time]
→ Go to Goals tab → tap + Goal to add this

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

${employee.role === "secretary" ? `## Office Manager Special Capabilities (THIS IS YOU — ${employee.name})
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

When discussing pricing, note that Utah lumber and steel prices fluctuate — always suggest verifying current quotes.

If an attachment is provided, analyze it thoroughly and reference specific details from it in your response.`;
    } else if (isForeman) {
      systemPrompt = `You are Pivot, the field assistant for Carranza Custom Construction. You're talking to ${employee.name}, a foreman.
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
- Help create goals for your laborers — you can assign tasks and set deadlines
- Remind you about overdue goals and upcoming deadlines
- Help draft safety talk scripts for your crew
- Daily motivation and team management tips
- Explain how to use BuildTrack Pro features
- Perform construction calculations (lumber takeoffs, material estimates, labor projections)

When the foreman greets you, always show their goals and any overdue items first, then ask if they need anything.
Keep responses practical, direct, and field-ready. No fluff.`;
    } else {
      // Laborer
      systemPrompt = `You are Pivot, the team assistant for Carranza Custom Construction. You're talking to ${employee.name}, a laborer.
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
- Help with basic calculations (measurements, material counts)

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

    // ── Web search tool definition ────────────────────────────────────────
    const webSearchTool = {
      type: "function" as const,
      function: {
        name: "web_search",
        description: "Search the web for real-time information. Use this when the user asks about current prices, weather, building codes, news, regulations, or anything you're not confident about. Always prefer searching over guessing.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to look up. Be specific and include location if relevant (e.g., 'lumber prices Utah March 2026')",
            },
          },
          required: ["query"],
        },
      },
    };

    // ── Call LLM with tool support ──────────────────────────────────────────
    let result = await invokeLLM({ messages: llmMessages, tools: [webSearchTool] });
    let choice = result.choices?.[0];
    let content = choice?.message?.content;

    // ── Handle tool calls (web search loop, max 3 searches) ─────────────────
    let searchAttempts = 0;
    while (choice?.message?.tool_calls && choice.message.tool_calls.length > 0 && searchAttempts < 3) {
      searchAttempts++;
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function?.name === "web_search") {
        let searchQuery = "";
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          searchQuery = args.query || "";
        } catch { searchQuery = toolCall.function.arguments || ""; }

        let searchResult = "No results found.";
        if (searchQuery) {
          try {
            // Use a simple web search via DuckDuckGo HTML
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
            const searchResp = await fetch(searchUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; BuildTrackPivot/1.0)" },
            });
            const html = await searchResp.text();
            // Extract text snippets from results
            const snippets: string[] = [];
            const snippetRegex = /<a class="result__snippet"[^>]*>(.*?)<\/a>/gs;
            let match;
            while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
              snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
            }
            // Also extract titles and URLs
            const titleRegex = /<a class="result__a"[^>]*href="([^"]*?)"[^>]*>(.*?)<\/a>/gs;
            const titles: string[] = [];
            while ((match = titleRegex.exec(html)) !== null && titles.length < 5) {
              titles.push(`${match[2].replace(/<[^>]*>/g, "").trim()} (${match[1]})`);
            }
            if (snippets.length > 0 || titles.length > 0) {
              searchResult = `Web search results for "${searchQuery}":\n`;
              for (let i = 0; i < Math.max(snippets.length, titles.length); i++) {
                if (titles[i]) searchResult += `\n${i + 1}. ${titles[i]}`;
                if (snippets[i]) searchResult += `\n   ${snippets[i]}`;
              }
            }
          } catch (searchErr) {
            searchResult = `Web search failed: ${searchErr instanceof Error ? searchErr.message : "unknown error"}`;
          }
        }

        // Add the assistant's tool call and the tool result to messages
        llmMessages.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: toolCall.id,
            type: "function",
            function: { name: "web_search", arguments: toolCall.function.arguments },
          }],
        });
        llmMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: searchResult,
        });

        // Call LLM again with search results
        result = await invokeLLM({ messages: llmMessages, tools: [webSearchTool] });
        choice = result.choices?.[0];
        content = choice?.message?.content;
      } else {
        break; // Unknown tool, stop
      }
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
      const result = await transcribeAudio({ audioUrl: input.audioUrl, language: "en" });
      const text = (result as any)?.text || "";
      return { text: text || "" };
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Transcription failed" });
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
});

export type AppRouter = typeof appRouter;
