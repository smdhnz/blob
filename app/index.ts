import { mkdir, writeFile, unlink, rm } from "node:fs/promises";
import { join, basename, extname, normalize, sep } from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import { Database } from "bun:sqlite";

const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.BLOB_SECRET_KEY;
const DATA_DIR = "/app/data";
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

if (!SECRET_KEY) {
  console.error("BLOB_SECRET_KEY is not set");
  process.exit(1);
}

// Initialize SQLite with WAL mode
const db = new Database(join(DATA_DIR, "metadata.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

db.run(`
  CREATE TABLE IF NOT EXISTS blobs (
    id TEXT PRIMARY KEY,
    filename TEXT,
    path TEXT,
    access TEXT,
    contentType TEXT,
    size INTEGER,
    uploadedAt TEXT,
    storagePath TEXT
  )
`);

// Ensure data directories exist
await mkdir(join(DATA_DIR, "public"), { recursive: true });
await mkdir(join(DATA_DIR, "private"), { recursive: true });

function sanitizePath(path: string): string {
  const normalized = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.startsWith(sep) ? normalized.slice(1) : normalized;
}

function generateSignedUrl(baseUrl: string, relativePath: string, expiresInSeconds = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const hmac = createHmac("sha256", SECRET_KEY!);
  hmac.update(`${relativePath}:${expires}`);
  const signature = hmac.digest("hex");
  const url = new URL(baseUrl);
  url.pathname = relativePath;
  url.searchParams.set("expires", expires.toString());
  url.searchParams.set("signature", signature);
  return url.toString();
}

function verifySignature(relativePath: string, expires: string, signature: string): boolean {
  if (parseInt(expires) < Math.floor(Date.now() / 1000)) return false;
  const hmac = createHmac("sha256", SECRET_KEY!);
  hmac.update(`${relativePath}:${expires}`);
  return hmac.digest("hex") === signature;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const corsHeaders = { "Access-Control-Allow-Origin": "*" };

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname;
    const authHeader = req.headers.get("Authorization");
    const isAuthorized = authHeader === `Bearer ${SECRET_KEY}`;

    // Health check
    if (req.method === "GET" && path === "/health") {
      return new Response("OK", { headers: corsHeaders });
    }

    // List: GET /
    if (req.method === "GET" && path === "/") {
      if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const host = req.headers.get("host");
      const baseUrl = `${protocol}://${host}`;

      const blobs = db.query("SELECT * FROM blobs ORDER BY uploadedAt DESC LIMIT ? OFFSET ?").all(limit, offset) as any[];
      const blobsWithUrls = blobs.map(b => ({
        ...b,
        url: b.access === "public" 
          ? `${baseUrl}/${b.storagePath.replace(/^(public|private)\//, "")}`
          : generateSignedUrl(baseUrl, `/${b.storagePath.replace(/^(public|private)\//, "")}`)
      }));
      return Response.json({ blobs: blobsWithUrls }, { headers: corsHeaders });
    }

    // Upload: POST /
    if (req.method === "POST" && path === "/") {
      if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) return new Response("No file provided", { status: 400, headers: corsHeaders });
      if (file.size > MAX_SIZE) return new Response("File too large", { status: 413, headers: corsHeaders });

      const access = formData.get("access") === "public" ? "public" : "private";
      const subPath = sanitizePath(formData.get("path") as string || "");
      const id = randomBytes(12).toString("hex");
      const safeFilename = `${id}-${basename(file.name)}`;
      const targetDir = join(DATA_DIR, access, subPath);
      await mkdir(targetDir, { recursive: true });
      
      const storagePathRelative = join(access, subPath, safeFilename);
      const fullPath = join(DATA_DIR, storagePathRelative);

      // Streaming write (efficient)
      await Bun.write(fullPath, file.stream());

      db.run(
        "INSERT INTO blobs (id, filename, path, access, contentType, size, uploadedAt, storagePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, file.name, subPath, access, file.type || "application/octet-stream", file.size, new Date().toISOString(), storagePathRelative]
      );

      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const host = req.headers.get("host");
      const baseUrl = `${protocol}://${host}`;
      const urlPath = `/${subPath ? `${subPath}/${safeFilename}` : safeFilename}`;
      const downloadUrl = access === "public" ? `${baseUrl}${urlPath}` : generateSignedUrl(baseUrl, urlPath);

      return Response.json({ url: downloadUrl, id, filename: file.name, access }, { headers: corsHeaders });
    }

    // Download & Delete: /:path*
    if (path !== "/") {
      const relativePath = sanitizePath(path.slice(1));
      const expires = url.searchParams.get("expires");
      const signature = url.searchParams.get("signature");
      const isSigned = expires && signature && verifySignature(path, expires, signature);

      if (req.method === "DELETE") {
        if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const blob = db.query("SELECT * FROM blobs WHERE storagePath = ? OR storagePath = ?").get(join("public", relativePath), join("private", relativePath)) as any;
        if (blob) {
          await unlink(join(DATA_DIR, blob.storagePath));
          db.run("DELETE FROM blobs WHERE id = ?", [blob.id]);
          return new Response("Deleted", { headers: corsHeaders });
        }
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      if (req.method === "GET") {
        // Try public
        const publicPath = join(DATA_DIR, "public", relativePath);
        const publicFile = Bun.file(publicPath);
        if (await publicFile.exists()) {
          const blob = db.query("SELECT contentType FROM blobs WHERE storagePath = ?").get(join("public", relativePath)) as any;
          return new Response(publicFile, { headers: { "Content-Type": blob?.contentType || publicFile.type, "Access-Control-Allow-Origin": "*" } });
        }

        // Try private (Authorized or Signed)
        if (!isAuthorized && !isSigned) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const privatePath = join(DATA_DIR, "private", relativePath);
        const privateFile = Bun.file(privatePath);
        if (await privateFile.exists()) {
          const blob = db.query("SELECT contentType FROM blobs WHERE storagePath = ?").get(join("private", relativePath)) as any;
          return new Response(privateFile, { headers: { "Content-Type": blob?.contentType || privateFile.type, "Access-Control-Allow-Origin": "*" } });
        }
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  db.close();
  server.stop();
  process.exit(0);
});

console.log(`Server running at http://localhost:${PORT}`);
