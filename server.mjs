import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const mimeTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8" };

function safeFilePath(pathname) {
  const normalized = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^([/\\])+/, "");
  const path = join(ROOT, normalized);
  return path.startsWith(ROOT) ? path : null;
}

createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Method not allowed"); return; }
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const path = safeFilePath(decodeURIComponent(url.pathname));
  if (!path || !existsSync(path)) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": mimeTypes[extname(path)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
  if (request.method === "HEAD") response.end(); else createReadStream(path).pipe(response);
}).listen(PORT, () => console.log(`MindPulse Baby Edition is running at http://localhost:${PORT}`));
