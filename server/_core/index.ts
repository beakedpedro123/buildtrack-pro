import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

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

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  // File upload endpoint for audio recordings and PDFs
  app.post("/api/upload", async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        try {
          const body = Buffer.concat(chunks);
          const contentType = req.headers["content-type"] || "";
          
          // Handle multipart form data
          if (contentType.includes("multipart/form-data")) {
            const boundary = contentType.split("boundary=")[1];
            if (!boundary) { res.status(400).json({ error: "No boundary" }); return; }
            const bodyStr = body.toString("latin1");
            const parts = bodyStr.split(`--${boundary}`);
            for (const part of parts) {
              if (part.includes("filename=")) {
                const headerEnd = part.indexOf("\r\n\r\n");
                if (headerEnd === -1) continue;
                const fileData = part.slice(headerEnd + 4, part.lastIndexOf("\r\n"));
                const fileBuffer = Buffer.from(fileData, "latin1");
                const nameMatch = part.match(/filename="([^"]+)"/);
                const fileName = nameMatch?.[1] || `upload_${Date.now()}`;
                const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);
                const mime = mimeMatch?.[1]?.trim() || "application/octet-stream";
                const { storagePut } = await import("../storage");
                const key = `uploads/${Date.now()}-${fileName}`;
                const { url } = await storagePut(key, fileBuffer, mime);
                res.json({ url, key, size: fileBuffer.length });
                return;
              }
            }
            res.status(400).json({ error: "No file found in upload" });
          } else {
            // Handle raw body upload
            const { storagePut } = await import("../storage");
            const ext = contentType.includes("audio") ? "m4a" : contentType.includes("pdf") ? "pdf" : "bin";
            const key = `uploads/${Date.now()}.${ext}`;
            const { url } = await storagePut(key, body, contentType || "application/octet-stream");
            res.json({ url, key, size: body.length });
          }
        } catch (err) {
          console.error("Upload processing error:", err);
          res.status(500).json({ error: "Upload failed" });
        }
      });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

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
