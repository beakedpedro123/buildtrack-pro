import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerAdminRoutes } from "../adminRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { ENV } from "./env";

// SECURITY FIX (NEW-2): Express auth middleware for non-tRPC routes
// Verifies session cookie/bearer token before allowing access
async function requireAuth(req: Request, res: Response, next: () => void) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    (req as any).user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Authentication required" });
  }
}

// SECURITY FIX (NEW-2): URL allowlist for download proxy to prevent SSRF
// Only allow fetching from our own storage domain
function isAllowedDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Allow our own storage proxy domain
    const forgeUrl = ENV.forgeApiUrl;
    if (forgeUrl) {
      const forgeDomain = new URL(forgeUrl).hostname;
      if (parsed.hostname === forgeDomain) return true;
    }
    // Allow common S3-compatible domains
    if (parsed.hostname.endsWith(".amazonaws.com")) return true;
    if (parsed.hostname.endsWith(".r2.cloudflarestorage.com")) return true;
    if (parsed.hostname.endsWith(".digitaloceanspaces.com")) return true;
    if (parsed.hostname.endsWith(".manus.storage")) return true;
    if (parsed.hostname.endsWith(".manus.computer")) return true;
    // Block everything else (prevents SSRF to internal services, metadata endpoints, etc.)
    return false;
  } catch {
    return false;
  }
}

// ESM compatibility: derive __dirname from import.meta.url
// Works in both tsx (dev) and esbuild ESM output (production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SECURITY FIX (High #8): File upload with MIME validation and size limits
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/heic", "image/heif",
  // Audio
  "audio/mpeg", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/wav", "audio/webm", "audio/ogg", "audio/aac",
  // Video
  "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
  // Documents
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  // Generic
  "application/octet-stream",
]);
const sanitizeFilename = (name: string): string => {
  // Remove path traversal, null bytes, and dangerous characters
  return name
    .replace(/[\0]/g, "")
    .replace(/\.\./g, "")
    .replace(/[\\/]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 255);
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

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
  // Trust proxy headers (required for express-rate-limit behind reverse proxy)
  app.set('trust proxy', 1);
  const server = createServer(app);

  // SECURITY FIX (Low #15): Security headers with Helmet
  // SECURITY FIX: HSTS header tells browsers to always use HTTPS
  // CSP FIX: Per-request nonce instead of 'unsafe-inline' for XSS protection
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Generate a unique nonce for each request
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://js.stripe.com"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick etc.) in web dashboard HTML pages
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // styles still need unsafe-inline for NativeWind
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://*.manus.computer", "https://*.expo.dev"],
        frameSrc: ["'self'", "https://js.stripe.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        reportUri: ["/api/csp-report"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow cross-origin resources
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
  }));
  // Inject CSP nonce into script-src dynamically per-request
  app.use((req: Request, res: Response, next: NextFunction) => {
    const nonce = res.locals.cspNonce;
    if (nonce) {
      const csp = res.getHeader('content-security-policy');
      if (typeof csp === 'string') {
        res.setHeader('content-security-policy', csp.replace(
          "script-src 'self'",
          `script-src 'self' 'nonce-${nonce}'`
        ));
      }
    }
    next();
  });

  // SECURITY FIX (High #7): CORS allowlist instead of reflect-origin
  const ALLOWED_ORIGINS = new Set([
    // Production domains
    "https://buildtrackpro.app",
    "https://www.buildtrackpro.app",
    "https://app.buildtrackpro.app",
    // Development
    "http://localhost:8081",
    "http://localhost:3000",
    "http://localhost:19006",
  ]);
  // Also allow Manus sandbox domains dynamically
  const isDynamicOriginAllowed = (origin: string) => {
    if (ALLOWED_ORIGINS.has(origin)) return true;
    // Strict suffix matching to prevent subdomain spoofing (e.g. evil-manus.computer)
    try {
      const url = new URL(origin);
      const host = url.hostname;
      return host.endsWith(".manus.computer") ||
             host.endsWith(".manus.space") ||
             host.endsWith(".exp.host") ||
             host.endsWith(".expo.dev");
    } catch {
      return false;
    }

  };
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isDynamicOriginAllowed(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-company-id",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Increased from 1mb to 25mb: supports large tRPC payloads (field report transcripts, multi-photo base64 batches)
  // Binary file uploads use /api/upload (multer, 200mb limit) and bypass this middleware entirely
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // SECURITY FIX: Request logging middleware for forensic analysis
  // Logs all API calls with timestamps, user IDs, and response codes
  app.use("/api", (req, res, next) => {
    const startTime = Date.now();
    const originalEnd = res.end;
    const ip = (req.ip || req.headers["x-forwarded-for"] || "unknown") as string;
    const userId = (req as any).user?.id || "anon";
    // SECURITY FIX (v4 LOW-2): Prefer verified session companyId over spoofable header
    const companyId = (req as any).user?.companyId || req.headers["x-company-id"] || "0";

    (res as any).end = function (this: any, ...args: any[]) {
      const duration = Date.now() - startTime;
      const logEntry = `[${new Date().toISOString()}] ${req.method} ${req.path} | status=${res.statusCode} | ip=${ip} | user=${userId} | company=${companyId} | ${duration}ms`;
      // Log to stdout (captured by process manager for forensic review)
      if (res.statusCode >= 400) {
        console.warn(`[audit] ${logEntry}`);
      } else if (req.path !== "/api/health") {
        console.log(`[audit] ${logEntry}`);
      }
      return (originalEnd as any).apply(this, args);
    };
    next();
  });

  // ═══ RATE LIMITING ═══
  // Per-user rate limit: uses userId from session when available, falls back to IP
  // This prevents a single compromised account from exhausting API quotas
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per user/IP
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use authenticated user ID if available (more precise than IP)
      const user = (req as any).user;
      if (user?.id) return `user-${user.id}`;
      // Fall back to IP for unauthenticated requests
      return req.ip || req.headers["x-forwarded-for"] as string || "unknown";
    },
    message: { error: "Too many requests. Please try again in a minute." },
    skip: (req) => req.path === "/api/health", // Skip health checks
    validate: false, // Suppress IPv6 keyGenerator warning — we handle it
  });

  // Stricter per-user limit on write operations (mutations): 30/min
  const mutationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const user = (req as any).user;
      if (user?.id) return `user-mut-${user.id}`;
      return `ip-mut-${req.ip || req.headers["x-forwarded-for"] || "unknown"}`;
    },
    message: { error: "Too many write operations. Please slow down." },
    skip: (req) => req.method === "GET", // Only apply to mutations (POST/PUT/DELETE)
    validate: false,
  });

  // Strict rate limit on PIN verification: 5 attempts per 15 minutes per IP + company
  // Keys by IP + x-company-id header to prevent cross-company brute-force
  const pinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
      const companyId = req.headers["x-company-id"] || "0";
      return `${ip}-pin-c${companyId}`;
    },
    handler: async (req, res) => {
      const ip = (req.ip || req.headers["x-forwarded-for"] || "unknown") as string;
      const companyId = parseInt(req.headers["x-company-id"] as string) || 0;
      // Log rate limit trigger to audit table
      const { logSecurityEvent } = await import("../db");
      await logSecurityEvent({
        companyId: companyId || null,
        eventType: "rate_limit_triggered",
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || null,
        details: `PIN brute-force rate limit triggered for company ${companyId}`,
        severity: "critical",
      });
      // Send push notification to company owner about suspicious login activity
      if (companyId > 0) {
        try {
          const { sendPushToAll } = await import("../push-notifications");
          await sendPushToAll(companyId, {
            title: "\u26a0\ufe0f Security Alert",
            body: `Multiple failed login attempts detected from IP ${ip}. Account temporarily locked for 15 minutes.`,
            data: { type: "security_alert" },
          });
        } catch (e) { /* push notification is best-effort */ }
      }
      res.status(429).json({ error: "Too many PIN attempts. Account locked for 15 minutes. Please try again later." });
    },
    validate: false, // Suppress IPv6 keyGenerator warning — we handle it
  });
  app.use("/api/trpc/employees.verifyPin", pinLimiter);

  // Global PIN limiter per IP: max 15 across ALL companies in 15 min (prevents company-hopping attacks)
  const globalPinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts from this device. Please wait 15 minutes." },
    keyGenerator: (req) => `${req.ip || req.headers["x-forwarded-for"] || "unknown"}-pin-global`,
    validate: false,
  });
  app.use("/api/trpc/employees.verifyPin", globalPinLimiter);

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
  registerAdminRoutes(app);

  // ─── Admin Dashboard Routes ─────────────────────────────────────────────
  // Admin login, verify, change-key, and PIN management are handled by adminRoutes.ts
  // (registered above via registerAdminRoutes(app))

  // File upload endpoint for audio recordings, photos, and PDFs
  // SECURITY FIX (NEW-2): Requires authentication
  // Uses multer for reliable multipart parsing (handles iOS/Android FormData correctly)
  app.post("/api/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const { storagePut } = await import("../storage");

      if (req.file) {
        // Multer parsed the multipart form successfully
        const fileName = sanitizeFilename(req.file.originalname || `upload_${Date.now()}`);
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
            // SECURITY FIX (NEW-3): Apply MIME allowlist to raw body uploads too
            if (!ALLOWED_MIME_TYPES.has(contentType)) {
              res.status(400).json({ error: `File type ${contentType} not allowed` });
              return;
            }
            const ext = contentType.includes("audio") ? "m4a" : contentType.includes("pdf") ? "pdf" : contentType.includes("image") ? "jpg" : contentType.includes("video") ? "mp4" : "bin";
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

  app.get("/api/health", async (_req: Request, res: Response) => {
    let dbStatus = "unknown";
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      dbStatus = db ? "connected" : "disconnected";
    } catch {
      dbStatus = "error";
    }
    res.json({ ok: true, timestamp: Date.now(), database: dbStatus });
  });

  // CSP Violation Reporting Endpoint
  // Receives Content-Security-Policy violation reports from browsers
  // Logs them for XSS attempt detection and policy tuning
  app.post("/api/csp-report", express.json({ type: ["application/json", "application/csp-report"] }), (req: Request, res: Response) => {
    const report = req.body?.['csp-report'] || req.body;
    if (report) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        documentUri: report['document-uri'] || report.documentURL || 'unknown',
        violatedDirective: report['violated-directive'] || report.effectiveDirective || 'unknown',
        blockedUri: report['blocked-uri'] || report.blockedURL || 'unknown',
        sourceFile: report['source-file'] || report.sourceFile || 'unknown',
        lineNumber: report['line-number'] || report.lineNumber || 0,
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      };
      console.warn(`[csp-violation] ${JSON.stringify(logEntry)}`);
    }
    // Always return 204 No Content — browsers expect this
    res.status(204).end();
  });

  // File download proxy — fetches from S3 storage and streams to client with proper Content-Disposition
  // SECURITY FIX (NEW-2): Requires authentication + URL allowlist to prevent SSRF
  app.get("/api/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const fileUrl = req.query.url as string;
      const fileName = (req.query.name as string) || "attachment";
      if (!fileUrl) {
        res.status(400).json({ error: "url query param required" });
        return;
      }
      // SECURITY FIX (NEW-2): Validate URL against allowlist to prevent SSRF
      if (!isAllowedDownloadUrl(fileUrl)) {
        res.status(403).json({ error: "Download URL not allowed" });
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
  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.get("/api/payroll-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, reportType, billingRate, jobId } = req.query;
      const companyId = String((req as any).user?.companyId || "");
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
      const isDev = process.env.NODE_ENV !== "production"; res.status(500).json({ error: "Failed to generate PDF", ...(isDev && { details: err?.message }) });
    }
  });

  // Individual employee timecard PDF
  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.get("/api/timecard-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { employeeId, startDate, endDate, includeLunch } = req.query;
      const companyId = String((req as any).user?.companyId || "");
      if (!employeeId || !startDate || !endDate) {
        res.status(400).json({ error: "employeeId, startDate, and endDate query params required" });
        return;
      }
      const { generateEmployeeTimecardPDF } = await import("../payroll-pdf");
      const cId = companyId ? parseInt(companyId as string) : undefined;
      // includeLunch=false means skip lunch deduction (show raw hours)
      const deductLunch = includeLunch !== "false";
      const pdfBuffer = await generateEmployeeTimecardPDF(
        parseInt(employeeId as string),
        new Date(startDate as string),
        new Date(endDate as string),
        cId,
        deductLunch
      );
      const filename = `timecard_emp${employeeId}_${(startDate as string).slice(0, 10)}_to_${(endDate as string).slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Timecard PDF error:", err);
      const isDev = process.env.NODE_ENV !== "production"; res.status(500).json({ error: "Failed to generate PDF", ...(isDev && { details: err?.message }) });
    }
  });

  // Job Completion PDF — comprehensive report for completed jobs
  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.get("/api/job-completion-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.query;
      const cmpId = (req as any).user?.companyId;
      if (!jobId) {
        res.status(400).json({ error: "jobId query param required" });
        return;
      }
      const { generateJobCompletionPDF } = await import("../job-completion-pdf");
      const pdfBuffer = await generateJobCompletionPDF(parseInt(jobId as string), cmpId);
      const filename = `job_completion_${jobId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Job Completion PDF error:", err);
      const isDev = process.env.NODE_ENV !== "production"; res.status(500).json({ error: "Failed to generate PDF", ...(isDev && { details: err?.message }) });
    }
  });

  // Budget Report PDF — comprehensive budget report for any job
  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.get("/api/budget-report-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId, startDate, endDate, billingRate, includeLunch } = req.query;
      const cmpId = (req as any).user?.companyId;
      if (!jobId) {
        res.status(400).json({ error: "jobId query param required" });
        return;
      }
      const { generateBudgetReportPDF } = await import("../budget-report-pdf");
      const opts: any = {};
      if (startDate) opts.startDate = startDate as string;
      if (endDate) opts.endDate = endDate as string;
      if (billingRate) opts.billingRate = parseFloat(billingRate as string);
      // includeLunch=false means skip lunch deduction (show raw hours)
      if (includeLunch === "false") opts.deductLunch = false;
      const pdfBuffer = await generateBudgetReportPDF(parseInt(jobId as string), cmpId, opts);
      const filename = `budget_report_${jobId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Budget Report PDF error:", err);
      const isDev = process.env.NODE_ENV !== "production"; res.status(500).json({ error: "Failed to generate PDF", ...(isDev && { details: err?.message }) });
    }
  });

  // Field Reports PDF (server-side, comprehensive)
  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.get("/api/field-reports-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.query;
      const cmpId = (req as any).user?.companyId;
      if (!jobId) {
        res.status(400).json({ error: "jobId query param required" });
        return;
      }
      const { generateFieldReportsPDF } = await import("../field-reports-pdf");
      const pdfBuffer = await generateFieldReportsPDF(parseInt(jobId as string), cmpId);
      const filename = `field_reports_${jobId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Field Reports PDF error:", err);
      const isDev = process.env.NODE_ENV !== "production"; res.status(500).json({ error: "Failed to generate PDF", ...(isDev && { details: err?.message }) });
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
      const isDev = process.env.NODE_ENV !== "production"; res.status(500).json({ error: "Failed to generate diagram", ...(isDev && { details: err?.message }) });
    }
  });

  // ─── Pivot AI Schedule Generation ─────────────────────────────────────
  // SECURITY FIX (v4 CRIT-1): Requires auth + rate limit to prevent LLM billing abuse
  const scheduleLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "Rate limit exceeded for schedule generation" } });
  app.post("/api/pivot-generate-schedule", requireAuth, scheduleLimiter, async (req: Request, res: Response) => {
    try {
      const { prompt, jobId } = req.body;
      if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
      if (typeof prompt !== 'string' || prompt.length > 2000) { res.status(400).json({ error: "Prompt too long (max 2000 characters)" }); return; }
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

  // ─── Pivot Hivemind REST Endpoint ───────────────────────────────────────────
  // POST /api/pivot/chat — Accepts messages from admin key auth, employee PIN session,
  // or regular session token. Injects role-based context. Strict company data isolation.
  // Auth: Bearer token (admin key JWT) OR session cookie (employee/owner session)
  const pivotRestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 Pivot REST calls per hour per user/IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Pivot chat limit reached. Please try again later." },
    validate: false,
  });
  app.post("/api/pivot/chat", pivotRestLimiter, async (req: Request, res: Response) => {
    try {
      // ── Auth: accept session cookie (employee/owner mobile app or admin dashboard) ──
      let callerRole: "admin" | "owner" | "office_manager" | "foreman" | "laborer" | "employee" = "employee";
      let callerCompanyId: number | null = null;
      let callerName = "User";
      let callerEmployeeId: number | null = null;
      // Try session auth
      const sessionUser = await sdk.authenticateRequest(req).catch(() => null);
      if (sessionUser) {
        // sessionUser is the User row from the users table
        const u = sessionUser as any;
        callerCompanyId = u.companyId || null;
        // Admin dashboard users have role "admin" in the users table
        if (u.role === "admin") {
          callerRole = "admin";
          callerName = "Admin";
        } else if (u.openId) {
          // Look up the employee record by openId to get their role and name
          const { getUserByOpenId } = await import("../db");
          const dbUser = await getUserByOpenId(u.openId).catch(() => null);
          if (dbUser) {
            callerCompanyId = dbUser.companyId || callerCompanyId;
          }
          // Also look for employee record linked to this user
          const { getAllEmployees } = await import("../db");
          if (callerCompanyId) {
            const emps = await getAllEmployees(callerCompanyId).catch(() => [] as any[]);
            // Match by openId stored on employee (if available) or by user companyId
            const matchedEmp = (emps as any[]).find((e: any) => e.openId === u.openId || e.userId === u.id);
            if (matchedEmp) {
              callerRole = matchedEmp.role as any;
              callerName = matchedEmp.name;
              callerEmployeeId = matchedEmp.id;
            }
          }
        }
      }
      // Validate request body
      const { messages, context, employeeId } = req.body;
      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: "messages array required" });
        return;
      }
      if (messages.length > 50) {
        res.status(400).json({ error: "Too many messages in context (max 50)" });
        return;
      }
      // If employeeId provided and we have a company, verify ownership
      if (employeeId && callerCompanyId) {
        const { getEmployeeById } = await import("../db");
        const targetEmp = await getEmployeeById(employeeId);
        if (!targetEmp || targetEmp.companyId !== callerCompanyId) {
          res.status(403).json({ error: "Access denied: employee does not belong to your company." });
          return;
        }
        if (!callerEmployeeId) {
          callerEmployeeId = employeeId;
          callerRole = targetEmp.role as any;
          callerName = targetEmp.name;
        }
      }
      // ── Build system prompt with role-based context ───────────────────────────
      const isAdmin = callerRole === "admin";
      const isOwner = callerRole === "owner";
      const isManagement = ["owner", "office_manager", "logistics"].includes(callerRole);
      let systemPrompt = `You are Pivot, an AI assistant built into BuildTrack Pro — a construction workforce management platform.\n`;
      systemPrompt += `You are bilingual (English/Mexican Spanish). Respond in the same language the user writes in.\n`;
      systemPrompt += `You specialize in framing, steel erection, carpentry, soffits, and finished fascia.\n`;
      systemPrompt += `You have advanced knowledge of construction math: angles, geometry, roof calculations, beam sizing, and material estimation.\n\n`;
      if (isAdmin) {
        systemPrompt += `## Access Level: Admin Dashboard\n`;
        systemPrompt += `You are assisting an admin user (${callerName}). You have access to platform-level information.\n`;
        systemPrompt += `CRITICAL: Never reveal data from one company to another. Each company's data is strictly isolated.\n`;
      } else if (isOwner) {
        systemPrompt += `## Access Level: Owner\n`;
        systemPrompt += `You are assisting Pedro Carranza (owner). You have full access to all company data, financials, and reports.\n`;
        systemPrompt += `You can discuss payroll, job costs, employee performance, and business strategy.\n`;
      } else if (isManagement) {
        systemPrompt += `## Access Level: Office Manager\n`;
        systemPrompt += `You are assisting ${callerName} (${callerRole.replace("_", " ")}). You have access to scheduling, reports, and employee management.\n`;
        systemPrompt += `You can discuss payroll summaries, job progress, and scheduling. Do NOT reveal individual hourly rates unless the user is the owner.\n`;
      } else {
        systemPrompt += `## Access Level: Field Employee\n`;
        systemPrompt += `You are assisting ${callerName} (${callerRole}). You can see your own hours, job assignments, and daily tasks.\n`;
        systemPrompt += `Do NOT reveal other employees' pay rates, personal information, or company financials.\n`;
      }
      // Load company context if available
      if (callerCompanyId) {
        try {
          const { getCompanyById, getCompanyWithTrades } = await import("../db");
          const company = await getCompanyById(callerCompanyId);
          if (company) {
            systemPrompt += `\n## Company: ${company.name}\n`;
          }
          const companyWithTrades = await getCompanyWithTrades(callerCompanyId);
          if (companyWithTrades && companyWithTrades.tradesList.length > 0) {
            systemPrompt += `Primary trade: ${companyWithTrades.primaryTrade || companyWithTrades.tradesList[0]}\n`;
            systemPrompt += `All trades: ${companyWithTrades.tradesList.join(", ")}\n`;
          }
        } catch { /* context unavailable */ }
      }
      // Add page context if provided
      if (context) {
        systemPrompt += `\n## Current App Context\n`;
        if (context.currentPage) systemPrompt += `Current page: ${context.currentPage}\n`;
        if (isManagement || isAdmin) {
          if (context.activeJobsCount !== undefined) systemPrompt += `Active jobs: ${context.activeJobsCount}\n`;
          if (context.onSiteCount !== undefined) systemPrompt += `Employees on site: ${context.onSiteCount}\n`;
          if (context.totalEmployees !== undefined) systemPrompt += `Total employees: ${context.totalEmployees}\n`;
          if (context.totalLaborCost !== undefined && (isOwner || isAdmin)) {
            systemPrompt += `Total labor cost this period: $${context.totalLaborCost}\n`;
          }
        }
      }
      systemPrompt += `\nIMPORTANT RULES:\n`;
      systemPrompt += `- NEVER leak data between companies\n`;
      systemPrompt += `- NEVER reveal employee pay rates to non-management users\n`;
      systemPrompt += `- NEVER make up numbers — if you don't know, say so\n`;
      systemPrompt += `- Keep responses concise and actionable for construction professionals\n`;
      // ── Call LLM ─────────────────────────────────────────────────────────────
      const { invokeLLM } = await import("./llm");
      const llmMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content as string,
        })),
      ];
      const result = await invokeLLM({ messages: llmMessages });
      const responseContent = (result as any)?.choices?.[0]?.message?.content
        || (result as any)?.content
        || "I'm having trouble responding right now. Please try again.";
      res.json({
        success: true,
        message: { role: "assistant", content: responseContent },
        callerRole,
        callerName,
      });
    } catch (err: any) {
      console.error("[pivot/chat] Error:", err);
      res.status(500).json({ error: "Pivot is unavailable right now. Please try again." });
    }
  });

    // API versioning: mount at /api/v1/trpc (versioned) and /api/trpc (legacy backward-compat)
  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
  });
  app.use("/api/v1/trpc", globalLimiter, mutationLimiter, trpcMiddleware);
  app.use("/api/trpc", globalLimiter, mutationLimiter, trpcMiddleware);

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
    // Read the HTML file and inject CSP nonce into all <script> tags
    const filePath = path.join(publicDir, filename);
    try {
      let html = fs.readFileSync(filePath, "utf-8");
      const nonce = res.locals.cspNonce;
      if (nonce) {
        // Add nonce to all inline <script> tags (those without src attribute)
        html = html.replace(/<script(?![^>]*\bsrc\b)([^>]*)>/gi, `<script nonce="${nonce}"$1>`);
        // Also add nonce to <script> tags with src (for Stripe etc.)
        html = html.replace(/<script(\s+)src=/gi, `<script nonce="${nonce}"$1src=`);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      res.sendFile(filePath);
    }
  }

  // 1. Marketing Site (default landing page)
  app.get("/api/web", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  app.get("/api/web/", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  app.get("/api/web/index.html", (_req: Request, res: Response) => sendHtmlFile(res, "index.html"));
  // Portal routes serve the app login page (not the marketing page)
  app.get("/api/portal", (_req: Request, res: Response) => sendHtmlFile(res, "app.html"));
  app.get("/api/portal/", (_req: Request, res: Response) => sendHtmlFile(res, "app.html"));
  app.get("/api/web/app", (_req: Request, res: Response) => sendHtmlFile(res, "app.html"));
  app.get("/api/portal/app", (_req: Request, res: Response) => sendHtmlFile(res, "app.html"));

  // 2. Admin Dashboard
  app.get("/api/web/admin", (_req: Request, res: Response) => sendHtmlFile(res, "admin.html"));
  app.get("/api/web/admin.html", (_req: Request, res: Response) => sendHtmlFile(res, "admin.html"));
  app.get("/api/portal/admin", (_req: Request, res: Response) => sendHtmlFile(res, "admin.html"));

  // 3. Support Portal
  app.get("/api/web/support", (_req: Request, res: Response) => sendHtmlFile(res, "support.html"));
  app.get("/api/web/support.html", (_req: Request, res: Response) => sendHtmlFile(res, "support.html"));
  app.get("/api/portal/support", (_req: Request, res: Response) => sendHtmlFile(res, "support.html"));

  // 4. Ticket Tracking Page (customer-facing, no login required)
  app.get("/api/web/ticket/:token", (_req: Request, res: Response) => sendHtmlFile(res, "ticket-track.html"));
  app.get("/api/portal/ticket/:token", (_req: Request, res: Response) => sendHtmlFile(res, "ticket-track.html"));

  // Serve static assets from public directory (for both paths)
  app.use("/api/web", express.static(publicDir, { index: false }));
  app.use("/api/portal", express.static(publicDir, { index: false }));

  // Redirect shortcuts
  app.get("/api", (_req: Request, res: Response) => {
    res.redirect(301, "/api/portal/");
  });

  // ─── Stripe Billing Endpoints ─────────────────────────────────────────
  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.post("/api/stripe/create-checkout", requireAuth, async (req: Request, res: Response) => {
    try {
      const { priceType, successUrl, cancelUrl } = req.body;
      const companyId = (req as any).user?.companyId;
      if (!companyId || !priceType) {
        res.status(400).json({ error: "priceType required" });
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

  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.post("/api/stripe/portal", requireAuth, async (req: Request, res: Response) => {
    try {
      const { returnUrl } = req.body;
      const companyId = (req as any).user?.companyId;
      if (!companyId) {
        res.status(401).json({ error: "Authentication required" });
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

  // SECURITY FIX (v4 CRIT-1): Requires auth, derives companyId from session
  app.get("/api/stripe/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const companyId = (req as any).user?.companyId;
      if (!companyId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const { getSubscriptionStatus, isStripeConfigured } = await import("../stripe-billing");
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }
      const result = await getSubscriptionStatus(companyId);
      res.json(result);
    } catch (err: any) {
      console.error("Stripe status error:", err);
      res.status(500).json({ error: err?.message || "Failed to get subscription status" });
    }
  });

  // SECURITY FIX (High #10): Stripe Webhook with signature verification
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const { handleWebhookEvent, isStripeConfigured } = await import("../stripe-billing");
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Stripe not configured" });
        return;
      }
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const sig = req.headers["stripe-signature"];
      if (!webhookSecret || !sig) {
        console.error("[stripe] Missing webhook secret or signature header");
        res.status(400).json({ error: "Missing signature" });
        return;
      }
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2025-04-30.basil" as any });
      // Verify the webhook signature — this prevents forged events
      const event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);

      // IDEMPOTENCY CHECK: Prevent duplicate processing of the same event
      const { getDb } = await import("../db");
      const { webhookEvents } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const dbConn = await getDb();
      if (dbConn) {
        const [existing] = await dbConn.select().from(webhookEvents).where(eq(webhookEvents.eventId, event.id)).limit(1);
        if (existing) {
          // Already processed — return 200 to acknowledge but skip processing
          console.log(`[stripe] Skipping duplicate webhook event: ${event.id}`);
          res.json({ received: true, duplicate: true });
          return;
        }
      }

      // Process the event
      await handleWebhookEvent(event as any);

      // Record successful processing for idempotency
      if (dbConn) {
        await dbConn.insert(webhookEvents).values({
          eventId: event.id,
          eventType: event.type,
          status: "processed",
        });
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("Stripe webhook error:", err?.message);
      // SECURITY FIX (High #9): Generic error messages — don't leak internals
      res.status(400).json({ error: "Webhook verification failed" });
    }
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`[api] server listening on port ${port}`);

    // ── Aggressive DB Connection on Startup ──────────────────────────────────
    // Try to connect to TiDB serverless immediately and keep retrying
    // This wakes up the serverless instance so it's ready for users
    try {
      const { ensureDbConnected } = await import("../db");
      const connected = await ensureDbConnected();
      if (connected) {
        console.log("[api] Database ready for requests");
        // Run migrations if needed
        try {
          const { migrate } = await import("drizzle-orm/mysql2/migrator");
          const { getDb } = await import("../db");
          const db = await getDb();
          if (db) {
            const pathMod = await import("path");
            const fsMod = await import("fs");
            // In production (Railway), drizzle SQL files are at dist/drizzle (same dir as index.js)
            // In development, they're at ../../drizzle relative to server/_core/
            const candidates = [
              pathMod.join(__dirname, "drizzle"),            // production: dist/drizzle
              pathMod.join(__dirname, "..", "..", "drizzle"), // development: project root drizzle
            ];
            const migrationsFolder = candidates.find((p) =>
              fsMod.existsSync(pathMod.join(p, "meta", "_journal.json"))
            );
            if (migrationsFolder) {
              await migrate(db, { migrationsFolder });
              console.log("[api] Database migrations applied from:", migrationsFolder);
            } else {
              console.warn("[api] No migrations folder found — skipping auto-migration");
            }
          }
        } catch (migErr: any) {
          // Migrations may fail if tables already exist — that's OK
          console.warn("[api] Migration note:", migErr?.message?.substring(0, 100));
        }
      } else {
        console.warn("[api] Database not available at startup — will retry on first request");
      }
    } catch (err: any) {
      console.warn("[api] DB startup error:", err?.message);
    }
  });

  // ── Daily Repeating Goals Cron ──────────────────────────────────────────────
  // SECURITY FIX (Critical #3): Replaced raw SQL with Drizzle ORM
  // Every day at 6:00 AM Mountain Time, clone goals marked [REPEAT DAILY]
  async function cloneRepeatingGoals() {
    try {
      const { getDb } = await import("../db");
      const dbConn = await getDb();
      if (!dbConn) return;

      const { weeklyGoals } = await import("../../drizzle/schema");
      const { and, eq, ne, like, gte, lte, desc } = await import("drizzle-orm");

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

      // Find repeating goals using Drizzle ORM (no raw SQL)
      const allRepeating = await dbConn.select().from(weeklyGoals)
        .where(and(
          like(weeklyGoals.description, "%[REPEAT DAILY]%"),
          ne(weeklyGoals.status, "cancelled")
        ))
        .orderBy(desc(weeklyGoals.createdAt));

      // Group by title, take the latest for each
      const latestByTitle = new Map<string, typeof allRepeating[0]>();
      for (const goal of allRepeating) {
        if (!latestByTitle.has(goal.title)) {
          latestByTitle.set(goal.title, goal);
        }
      }

      let cloned = 0;
      const todayStart = new Date(Date.UTC(mtnYr, mtnMo, mtnDy, 0, 0, 0));
      const todayEnd = new Date(Date.UTC(mtnYr, mtnMo, mtnDy, 23, 59, 59));

      for (const [title, goal] of latestByTitle) {
        // Check if we already created this goal today using Drizzle
        const existing = await dbConn.select({ id: weeklyGoals.id }).from(weeklyGoals)
          .where(and(
            eq(weeklyGoals.title, title),
            gte(weeklyGoals.createdAt, todayStart),
            lte(weeklyGoals.createdAt, todayEnd)
          ))
          .limit(1);
        if (existing.length > 0) continue; // Already created today

        // Clone the goal for today using Drizzle insert
        await dbConn.insert(weeklyGoals).values({
          companyId: goal.companyId,
          title: goal.title,
          description: goal.description,
          assignedTo: goal.assignedTo,
          assignedToList: goal.assignedToList,
          weekOf: weekStart,
          status: "pending",
          priority: goal.priority,
          createdBy: goal.createdBy,
        });
        cloned++;
      }

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
