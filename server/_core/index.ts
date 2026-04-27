import "dotenv/config";
import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

// ESM compatibility: derive __dirname from import.meta.url
// Works in both tsx (dev) and esbuild ESM output (production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));

  // ═══ RATE LIMITING ═══
  // Global API rate limit: 100 requests per minute per IP
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again in a minute." },
    skip: (req) => req.path === "/api/health", // Skip health checks
  });
  app.use("/api/trpc", globalLimiter);

  // Strict rate limit on PIN verification: 5 attempts per 15 minutes per IP
  const pinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many PIN attempts. Account locked for 15 minutes." },
    keyGenerator: (req) => (req.ip || "unknown") + "-pin",
    validate: false, // Suppress IPv6 keyGenerator warning — we handle it
  });
  app.use("/api/trpc/verifyPin", pinLimiter);

  // Strict rate limit on signup: 5 per hour per IP
  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many signup attempts. Please try again later." },
  });
  app.use("/api/trpc/company.signup", signupLimiter);

  // Rate limit on Pivot AI chat: 30 per hour per IP
  const pivotLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Pivot chat limit reached. Please try again later." },
  });
  app.use("/api/trpc/pivot.chat", pivotLimiter);

  // Rate limit on file uploads: 20 per minute per IP
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many uploads. Please try again in a minute." },
  });
  app.use("/api/upload", uploadLimiter);

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // File upload endpoint for audio recordings, photos, and PDFs
  // Uses multer for reliable multipart parsing (handles iOS/Android FormData correctly)
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      const { storagePut } = await import("../storage");

      if (req.file) {
        // Multer parsed the multipart form successfully
        const fileName = req.file.originalname || `upload_${Date.now()}`;
        const mime = req.file.mimetype || "application/octet-stream";
        const key = `uploads/${Date.now()}-${fileName}`;
        const { url } = await storagePut(key, req.file.buffer, mime);
        console.log(`[upload] Saved file: ${fileName} (${req.file.size} bytes) -> ${key}`);
        res.json({ url, key, size: req.file.size });
      } else {
        // Fallback: raw body upload (non-multipart, e.g. direct binary POST)
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = Buffer.concat(chunks);
            if (body.length === 0) {
              res.status(400).json({ error: "No file data received" });
              return;
            }
            const contentType = req.headers["content-type"] || "application/octet-stream";
            const ext = contentType.includes("audio") ? "m4a" : contentType.includes("pdf") ? "pdf" : contentType.includes("image") ? "jpg" : "bin";
            const key = `uploads/${Date.now()}.${ext}`;
            const { url } = await storagePut(key, body, contentType);
            console.log(`[upload] Saved raw: ${key} (${body.length} bytes)`);
            res.json({ url, key, size: body.length });
          } catch (err) {
            console.error("Upload processing error:", err);
            res.status(500).json({ error: "Upload failed" });
          }
        });
      }
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // File download proxy — fetches from S3 storage and streams to client with proper Content-Disposition
  app.get("/api/download", async (req: Request, res: Response) => {
    try {
      const fileUrl = req.query.url as string;
      const fileName = (req.query.name as string) || "attachment";
      if (!fileUrl) {
        res.status(400).json({ error: "url query param required" });
        return;
      }
      // Fetch the file from S3
      const upstream = await fetch(fileUrl);
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Upstream fetch failed: ${upstream.status}` });
        return;
      }
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const contentLength = upstream.headers.get("content-length");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      // Stream the body
      const body = upstream.body;
      if (body) {
        const reader = (body as any).getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        };
        await pump();
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      console.error("Download proxy error:", err);
      res.status(500).json({ error: "Download failed" });
    }
  });

  // Detailed payroll PDF download endpoint
  app.get("/api/payroll-pdf", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, reportType, billingRate, jobId, companyId } = req.query;
      if (!startDate || !endDate) {
        res.status(400).json({ error: "startDate and endDate query params required" });
        return;
      }
      const { generateDetailedPayrollPDF } = await import("../payroll-pdf");
      const validTypes = ["full", "payroll", "jobcost", "employee"];
      const rType = validTypes.includes(reportType as string) ? (reportType as any) : "full";
      const rate = billingRate ? parseFloat(billingRate as string) : undefined;
      const jId = jobId ? parseInt(jobId as string) : undefined;
      const cId = companyId ? parseInt(companyId as string) : undefined;
      const pdfBuffer = await generateDetailedPayrollPDF(
        new Date(startDate as string),
        new Date(endDate as string),
        rType,
        rate,
        jId,
        cId
      );
      const typeLabel = rType === "full" ? "payroll" : rType;
      const jobSuffix = jId ? `_job${jId}` : "";
      const filename = `${typeLabel}${jobSuffix}_${(startDate as string).slice(0, 10)}_to_${(endDate as string).slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Payroll PDF error:", err);
      res.status(500).json({ error: "Failed to generate PDF", details: err?.message });
    }
  });

  // Individual employee timecard PDF
  app.get("/api/timecard-pdf", async (req: Request, res: Response) => {
    try {
      const { employeeId, startDate, endDate, companyId } = req.query;
      if (!employeeId || !startDate || !endDate) {
        res.status(400).json({ error: "employeeId, startDate, and endDate query params required" });
        return;
      }
      const { generateEmployeeTimecardPDF } = await import("../payroll-pdf");
      const cId = companyId ? parseInt(companyId as string) : undefined;
      const pdfBuffer = await generateEmployeeTimecardPDF(
        parseInt(employeeId as string),
        new Date(startDate as string),
        new Date(endDate as string),
        cId
      );
      const filename = `timecard_emp${employeeId}_${(startDate as string).slice(0, 10)}_to_${(endDate as string).slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Timecard PDF error:", err);
      res.status(500).json({ error: "Failed to generate PDF", details: err?.message });
    }
  });

  // Job Completion PDF — comprehensive report for completed jobs
  app.get("/api/job-completion-pdf", async (req: Request, res: Response) => {
    try {
      const { jobId, companyId: cmpId } = req.query;
      if (!jobId) {
        res.status(400).json({ error: "jobId query param required" });
        return;
      }
      const { generateJobCompletionPDF } = await import("../job-completion-pdf");
      const compId = cmpId ? parseInt(cmpId as string) : undefined;
      const pdfBuffer = await generateJobCompletionPDF(parseInt(jobId as string), compId);
      const filename = `job_completion_${jobId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Job Completion PDF error:", err);
      res.status(500).json({ error: "Failed to generate PDF", details: err?.message });
    }
  });

  // Steel beam cross-section diagram endpoint
  app.get("/api/beam-diagram", async (req: Request, res: Response) => {
    try {
      const designation = (req.query.designation as string || "").trim();
      if (!designation) {
        res.status(400).json({ error: "designation query param required (e.g., W18x45)" });
        return;
      }
      const { generateBeamDiagramForDesignation } = await import("../beam-diagram");
      const fs = await import("fs");
      const path = await import("path");
      const profilesPath = path.join(process.cwd(), "server", "data", "aisc-steel-profiles.json");
      const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
      const svg = generateBeamDiagramForDesignation(designation, profiles);
      if (!svg) {
        res.status(404).json({ error: `Beam ${designation} not found in AISC database` });
        return;
      }
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(svg);
    } catch (err: any) {
      console.error("Beam diagram error:", err);
      res.status(500).json({ error: "Failed to generate diagram", details: err?.message });
    }
  });

  // ─── Pivot AI Schedule Generation ─────────────────────────────────────
  app.post("/api/pivot-generate-schedule", async (req: Request, res: Response) => {
    try {
      const { prompt, jobId } = req.body;
      if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
      const { invokeLLM } = await import("./llm");
      const result = await invokeLLM({
        messages: [
          { role: "system", content: "You are a construction scheduling expert. Generate realistic construction schedules. Return ONLY valid JSON arrays, no markdown, no explanation." },
          { role: "user", content: prompt },
        ],
      });
      // Parse the LLM response to extract JSON
      let tasks: any[] = [];
      const content = typeof result === "string" ? result : (result as any)?.content || (result as any)?.message?.content || JSON.stringify(result);
      try {
        // Try to find JSON array in the response
        const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          tasks = JSON.parse(jsonMatch[0]);
        } else {
          tasks = JSON.parse(content);
        }
      } catch (parseErr) {
        console.error("Failed to parse LLM schedule response:", parseErr);
        tasks = [];
      }
      res.json({ tasks, jobId });
    } catch (err: any) {
      console.error("Schedule generation error:", err);
      res.status(500).json({ error: "Failed to generate schedule", tasks: [] });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Resolve PWA public directory
  const publicCandidates = [
    path.join(__dirname, "public"),                  // dist/public (deployed prod)
    path.join(__dirname, "..", "..", "public"),      // server/_core/../../public (dev)
    path.join(__dirname, "..", "public"),             // dist/../public (alt prod)
    path.join(process.cwd(), "public"),               // cwd/public (fallback)
    path.join(process.cwd(), "dist", "public"),       // cwd/dist/public (fallback)
  ];
  const publicDir = publicCandidates.find(p => fs.existsSync(path.join(p, "index.html"))) || publicCandidates[0];
  console.log(`[server] publicDir: ${publicDir}`);
  console.log(`[server] publicDir exists: ${fs.existsSync(publicDir)}`);
  console.log(`[server] index.html exists: ${fs.existsSync(path.join(publicDir, "index.html"))}`);

  // === Service Worker Cleanup ===
  // Serve a self-unregistering SW to clear any cached Expo service workers
  app.get("/api/web/sw.js", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',()=>{self.registration.unregister().then(()=>{self.clients.matchAll().then(c=>{c.forEach(cl=>cl.navigate(cl.url))})})});`);
  });

  // === 3 Separate Web Apps ===
  // Served at BOTH /api/web/ and /api/portal/ paths
  // /api/portal/ is the primary path (clean, no cached service workers)
  // /api/web/ also works but may need SW cleanup on first visit

  // Helper to send HTML files with no-cache headers
  function sendHtmlFile(res: Response, filename: string) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(publicDir, filename));
  }

  // 1. Marketing Site (default landing page)
  app.get("/api/web", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  app.get("/api/web/", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  app.get("/api/web/index.html", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  app.get("/api/portal", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  app.get("/api/portal/", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));

  // 2. Admin Dashboard
  app.get("/api/web/admin", (_req: Request, res: Response) => sendHtmlFile(res, "admin.html"));
  app.get("/api/web/admin.html", (_req: Request, res: Response) => sendHtmlFile(res, "admin.html"));
  app.get("/api/portal/admin", (_req: Request, res: Response) => sendHtmlFile(res, "admin.html"));

  // 3. Support Portal
  app.get("/api/web/support", (_req: Request, res: Response) => sendHtmlFile(res, "support.html"));
  app.get("/api/web/support.html", (_req: Request, res: Response) => sendHtmlFile(res, "support.html"));
  app.get("/api/portal/support", (_req: Request, res: Response) => sendHtmlFile(res, "support.html"));

  // Serve static assets from public directory (for both paths)
  app.use("/api/web", express.static(publicDir, { index: false }));
  app.use("/api/portal", express.static(publicDir, { index: false }));

  // Redirect shortcuts
  app.get("/api", (_req: Request, res: Response) => {
    res.redirect(301, "/api/portal/");
  });

  // ─── Stripe Billing Endpoints ─────────────────────────────────────────
  app.post("/api/stripe/create-checkout", async (req: Request, res: Response) => {
    try {
      const { companyId, priceType, successUrl, cancelUrl } = req.body;
      if (!companyId || !priceType) {
        res.status(400).json({ error: "companyId and priceType required" });
        return;
      }
      const { createCheckoutSession, isStripeConfigured } = await import("../stripe-billing");
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }
      const result = await createCheckoutSession(
        parseInt(companyId),
        priceType,
        successUrl || "https://buildtrackpro.app/success",
        cancelUrl || "https://buildtrackpro.app/cancel"
      );
      res.json(result);
    } catch (err: any) {
      console.error("Stripe checkout error:", err);
      res.status(500).json({ error: err?.message || "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", async (req: Request, res: Response) => {
    try {
      const { companyId, returnUrl } = req.body;
      if (!companyId) {
        res.status(400).json({ error: "companyId required" });
        return;
      }
      const { createPortalSession, isStripeConfigured } = await import("../stripe-billing");
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }
      const result = await createPortalSession(
        parseInt(companyId),
        returnUrl || "https://buildtrackpro.app"
      );
      res.json(result);
    } catch (err: any) {
      console.error("Stripe portal error:", err);
      res.status(500).json({ error: err?.message || "Failed to create portal session" });
    }
  });

  app.get("/api/stripe/status", async (req: Request, res: Response) => {
    try {
      const { companyId } = req.query;
      if (!companyId) {
        res.status(400).json({ error: "companyId required" });
        return;
      }
      const { getSubscriptionStatus, isStripeConfigured } = await import("../stripe-billing");
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }
      const result = await getSubscriptionStatus(parseInt(companyId as string));
      res.json(result);
    } catch (err: any) {
      console.error("Stripe status error:", err);
      res.status(500).json({ error: err?.message || "Failed to get subscription status" });
    }
  });

  // Stripe Webhook (raw body required)
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const { handleWebhookEvent } = await import("../stripe-billing");
      const Stripe = (await import("stripe")).default;
      const event = JSON.parse(req.body.toString()) as any;
      await handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err: any) {
      console.error("Stripe webhook error:", err);
      res.status(400).json({ error: err?.message });
    }
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });

  // ── Daily Repeating Goals Cron ──────────────────────────────────────────────
  // Every day at 6:00 AM Mountain Time, clone goals marked [REPEAT DAILY]
  async function cloneRepeatingGoals() {
    try {
      const { getDb } = await import("../db");
      const dbConn = await getDb();
      if (!dbConn) return;

      // Get Mountain Time date
      const mtnFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
      const mtnParts = mtnFormatter.formatToParts(new Date());
      const mtnYr = parseInt(mtnParts.find(p => p.type === 'year')!.value);
      const mtnMo = parseInt(mtnParts.find(p => p.type === 'month')!.value) - 1;
      const mtnDy = parseInt(mtnParts.find(p => p.type === 'day')!.value);
      const todayMtn = new Date(Date.UTC(mtnYr, mtnMo, mtnDy, 12, 0, 0));
      const dayOfWeek = todayMtn.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(Date.UTC(mtnYr, mtnMo, mtnDy + mondayOffset, 12, 0, 0));

      // Find the most recent version of each repeating goal (by title)
      const mysql = await import("mysql2/promise");
      const conn = await (mysql as any).createConnection(process.env.DATABASE_URL);
      // Get distinct repeating goal titles, then fetch the latest one for each
      const [repeatTitles] = await conn.query(
        'SELECT DISTINCT title FROM weeklyGoals WHERE description LIKE "%[REPEAT DAILY]%" AND status != "cancelled"'
      );
      const repeatGoals: any[] = [];
      for (const row of (repeatTitles as any[])) {
        const [latest] = await conn.query(
          'SELECT * FROM weeklyGoals WHERE title = ? AND description LIKE "%[REPEAT DAILY]%" ORDER BY createdAt DESC LIMIT 1',
          [row.title]
        );
        if ((latest as any[]).length > 0) repeatGoals.push((latest as any[])[0]);
      }

      let cloned = 0;
      for (const goal of (repeatGoals as any[])) {
        // Check if we already created this goal today
        const todayStart = new Date(Date.UTC(mtnYr, mtnMo, mtnDy, 0, 0, 0));
        const todayEnd = new Date(Date.UTC(mtnYr, mtnMo, mtnDy, 23, 59, 59));
        const [existing] = await conn.query(
          'SELECT id FROM weeklyGoals WHERE title = ? AND createdAt BETWEEN ? AND ? LIMIT 1',
          [goal.title, todayStart, todayEnd]
        );
        if ((existing as any[]).length > 0) continue; // Already created today

        // Clone the goal for today
        await conn.query(
          'INSERT INTO weeklyGoals (title, description, assignedTo, assignedToList, weekOf, status, priority, deadline, createdBy) VALUES (?, ?, ?, ?, ?, "pending", ?, NULL, ?)',
          [goal.title, goal.description, goal.assignedTo, goal.assignedToList, weekStart, goal.priority, goal.createdBy]
        );
        cloned++;
      }

      await conn.end();
      if (cloned > 0) console.log(`[cron] Cloned ${cloned} repeating goals for ${mtnYr}-${mtnMo + 1}-${mtnDy}`);
    } catch (err) {
      console.error('[cron] Failed to clone repeating goals:', err);
    }
  }

  // Run the cron check every 30 minutes (it's idempotent - won't create duplicates)
  setInterval(cloneRepeatingGoals, 30 * 60 * 1000);
  // Also run once on startup after a short delay
  setTimeout(cloneRepeatingGoals, 10000);
}

startServer().catch(console.error);
