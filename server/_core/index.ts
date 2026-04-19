import "dotenv/config";
import express, { Request, Response } from "express";
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

  // Detailed payroll PDF download endpoint
  app.get("/api/payroll-pdf", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, reportType, billingRate, jobId } = req.query;
      if (!startDate || !endDate) {
        res.status(400).json({ error: "startDate and endDate query params required" });
        return;
      }
      const { generateDetailedPayrollPDF } = await import("../payroll-pdf");
      const validTypes = ["full", "payroll", "jobcost", "employee"];
      const rType = validTypes.includes(reportType as string) ? (reportType as any) : "full";
      const rate = billingRate ? parseFloat(billingRate as string) : undefined;
      const jId = jobId ? parseInt(jobId as string) : undefined;
      const pdfBuffer = await generateDetailedPayrollPDF(
        new Date(startDate as string),
        new Date(endDate as string),
        rType,
        rate,
        jId
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
      const { employeeId, startDate, endDate } = req.query;
      if (!employeeId || !startDate || !endDate) {
        res.status(400).json({ error: "employeeId, startDate, and endDate query params required" });
        return;
      }
      const { generateEmployeeTimecardPDF } = await import("../payroll-pdf");
      const pdfBuffer = await generateEmployeeTimecardPDF(
        parseInt(employeeId as string),
        new Date(startDate as string),
        new Date(endDate as string)
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

  // Serve PWA through /api/web/* routes
  // The deployment platform only proxies /api/* to Express, so we must serve
  // all PWA static files under /api/web/ prefix
  app.use("/api/web", express.static(publicDir));

  // SPA fallback for /api/web/* routes (PWA is built with base=/api/web/)
  app.get("/api/web/*", (_req: Request, res: Response) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('PWA not found');
    }
  });

  // ===== Marketing Website =====
  // Serve the static marketing site at /api/marketing/
  const marketingDir = path.join(publicDir, "marketing");
  if (fs.existsSync(path.join(marketingDir, "index.html"))) {
    console.log(`[server] Marketing site found at: ${marketingDir}`);
    app.use("/api/marketing", express.static(marketingDir));
    app.get("/api/marketing/*", (_req: Request, res: Response) => {
      res.sendFile(path.join(marketingDir, "index.html"));
    });
  }

  // Redirect root to marketing site (public-facing landing page)
  app.get("/", (_req: Request, res: Response) => {
    res.redirect(301, "/api/marketing/");
  });
  app.get("/api", (_req: Request, res: Response) => {
    res.redirect(301, "/api/web/");
  });

  // Catch-all: serve PWA for all unmatched routes (SPA support)
  app.get("*", (_req: Request, res: Response) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('PWA not found');
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
