import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const MAX_BODY_BYTES = 32_000;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function extractOutputText(payload) {
  return (payload.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function fallbackCoach({ state, planTitle }) {
  if (state === "activated") {
    return `Your check-in suggests this may be a better moment for a gentler start. Try the ${planTitle.toLowerCase()}, then choose one small task you can finish without forcing momentum.`;
  }

  return `Your voice rhythm looks fairly steady for this moment. Protect that capacity: begin with the ${planTitle.toLowerCase()} and leave a small recovery buffer between demanding tasks.`;
}

async function createCoachReflection(checkIn) {
  const fallback = fallbackCoach(checkIn);

  if (!process.env.OPENAI_API_KEY) {
    return { message: fallback, source: "local" };
  }

  const prompt = [
    "Create one concise, warm wellness reflection for a routine-planning app.",
    "Never diagnose, infer medical conditions, or claim to measure the autonomic nervous system.",
    "Treat the input only as a self-reflection signal. Do not mention numerical scores.",
    `Current signal: ${checkIn.state}.`,
    `Suggested plan: ${checkIn.planTitle}.`,
    `Voice-rhythm context: ${checkIn.summary}.`,
    "Keep the response under 55 words and offer one practical next step.",
  ].join("\n");

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        reasoning: { effort: "low" },
        input: prompt,
      }),
    });

    if (!apiResponse.ok) {
      throw new Error(`OpenAI API returned ${apiResponse.status}`);
    }

    const payload = await apiResponse.json();
    const message = extractOutputText(payload);
    return { message: message || fallback, source: message ? "openai" : "local" };
  } catch (error) {
    console.warn("Coach fallback:", error.message);
    return { message: fallback, source: "local" };
  }
}

function safeFilePath(pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(requestedPath).replace(/^([/\\])+/, "");
  const filePath = join(ROOT, normalizedPath);
  return filePath.startsWith(ROOT) ? filePath : null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/coach") {
    try {
      const body = await readRequestBody(request);
      const checkIn = JSON.parse(body || "{}");
      const reflection = await createCoachReflection({
        state: checkIn.state === "activated" ? "activated" : "steady",
        planTitle: String(checkIn.planTitle || "gentle reset"),
        summary: String(checkIn.summary || "A short voice check-in was completed."),
      });
      sendJson(response, 200, reflection);
    } catch (error) {
      sendJson(response, 400, { error: "We couldn't process that check-in." });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const filePath = safeFilePath(decodeURIComponent(url.pathname));
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(PORT, () => {
  console.log(`MindPulse is running at http://localhost:${PORT}`);
});
