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
      const { startDate, endDate, reportType } = req.query;
      if (!startDate || !endDate) {
        res.status(400).json({ error: "startDate and endDate query params required" });
        return;
      }
      const { generateDetailedPayrollPDF } = await import("../payroll-pdf");
      const validTypes = ["full", "payroll", "jobcost", "employee"];
      const rType = validTypes.includes(reportType as string) ? (reportType as any) : "full";
      const pdfBuffer = await generateDetailedPayrollPDF(
        new Date(startDate as string),
        new Date(endDate as string),
        rType
      );
      const typeLabel = rType === "full" ? "payroll" : rType;
      const filename = `${typeLabel}_${(startDate as string).slice(0, 10)}_to_${(endDate as string).slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("Payroll PDF error:", err);
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

  // Redirect root to PWA
  app.get("/", (_req: Request, res: Response) => {
    res.redirect(301, "/api/web/");
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
}

startServer().catch(console.error);
