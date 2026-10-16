import http from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const ULTRA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
export const ULTRA_OUTPUT_LIMIT = 32768;
const UPSTREAM = "https://integrate.api.nvidia.com";
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
export const MAX_UPSTREAM_ATTEMPTS = 20;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

export function retryDelayMs(
  response,
  attempt,
  random = Math.random,
  now = Date.now,
) {
  const header = response.headers.get("retry-after");
  if (header !== null && header.trim() !== "") {
    const seconds = Number(header);
    const date = Date.parse(header);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(3_600_000, seconds * 1000);
    if (/^[A-Za-z]{3},/.test(header) && Number.isFinite(date))
      return Math.min(3_600_000, Math.max(0, date - now()));
  }
  return (
    Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.floor(random() * 250)
  );
}

// Kimi Code 2.1.1 always sends this OpenAI-only field. NVIDIA rejects it.
// Apply provider compatibility before the first request, without replay/fallback.
export function normalizeNvidiaRequest(input) {
  const body = { ...input };
  delete body.prompt_cache_key;
  delete body.prompt_cache_retention;
  if (body.model === ULTRA_MODEL) {
    const cap = body.max_tokens ?? body.max_completion_tokens;
    body.max_tokens =
      Number.isInteger(cap) && cap > 0
        ? Math.min(cap, ULTRA_OUTPUT_LIMIT)
        : ULTRA_OUTPUT_LIMIT;
    delete body.max_completion_tokens;
    body.temperature = 1;
    body.top_p = 0.95;
    body.reasoning_effort = "high";
    body.reasoning_budget = -1;
    body.chat_template_kwargs = {
      ...body.chat_template_kwargs,
      enable_thinking: true,
      medium_effort: false,
      force_nonempty_content: true,
      reasoning_budget: -1,
    };
  }
  return body;
}

// The hosted Ultra endpoint can return raw reasoning in content, ending with
// </think>, instead of the OpenAI reasoning_content field both CLIs understand.
// Buffer only until that delimiter is confirmed; leave genuinely plain content
// and unfinished/length-limited responses intact, including their finish reason.
export async function* normalizeUltraSse(source) {
  const decoder = new TextDecoder();
  const choices = new Map();
  let buffer = "";
  const flushPending = () => {
    const pending = [];
    for (const [index, state] of choices) {
      if (state.pending) {
        pending.push({ index, delta: { content: state.pending } });
        state.pending = "";
      }
    }
    return pending.length
      ? `data: ${JSON.stringify({ choices: pending })}\n\n`
      : "";
  };
  const normalizeEvent = (event) => {
    const match = /^data:\s*(.*)$/m.exec(event);
    if (!match) return event + "\n\n";
    if (match[1] === "[DONE]") {
      return flushPending() + event + "\n\n";
    }
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      return event + "\n\n";
    }
    for (const choice of parsed.choices ?? []) {
      const index = choice.index ?? 0;
      const state = choices.get(index) ?? { pending: "", separated: false };
      choices.set(index, state);
      const delta = choice.delta;
      if (delta?.reasoning_content) {
        state.separated = true;
        if (state.pending) {
          delta.content = state.pending + (delta.content ?? "");
          state.pending = "";
        }
      }
      if (!state.separated && typeof delta?.content === "string") {
        state.pending += delta.content;
        delete delta.content;
        const boundary = state.pending.indexOf("</think>");
        if (boundary >= 0) {
          delta.reasoning_content = state.pending
            .slice(0, boundary)
            .replace(/^<think>/, "");
          delta.content = state.pending.slice(boundary + "</think>".length);
          state.pending = "";
          state.separated = true;
        }
      }
      if (choice.finish_reason && state.pending) {
        choice.delta = { ...delta, content: state.pending };
        state.pending = "";
      }
    }
    return `data: ${JSON.stringify(parsed)}\n\n`;
  };
  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true });
    let separator;
    while ((separator = /\r?\n\r?\n/.exec(buffer))) {
      yield normalizeEvent(buffer.slice(0, separator.index));
      buffer = buffer.slice(separator.index + separator[0].length);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield normalizeEvent(buffer);
  const remaining = flushPending();
  if (remaining) yield remaining;
}

export function createBridge({
  fetchImpl = fetch,
  log = console.log,
  maxAttempts = MAX_UPSTREAM_ATTEMPTS,
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
  random = Math.random,
  now = Date.now,
} = {}) {
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_UPSTREAM_ATTEMPTS
  )
    throw new Error("Invalid upstream attempt limit");
  return http.createServer(async (req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message } }));
    };
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          service: "miro-nvidia-cli-bridge",
          version: 2,
          maxAttempts,
        }),
      );
      return;
    }
    if (!(
      (req.method === "GET" && req.url === "/v1/models") ||
      (req.method === "POST" && req.url === "/v1/chat/completions")
    )) {
      reply(404, "Unsupported NVIDIA route");
      return;
    }
    if (!/^Bearer \S+$/.test(req.headers.authorization ?? "")) {
      reply(401, "NVIDIA bearer credential required");
      return;
    }
    const controller = new AbortController();
    // Full reasoning and long context can take well beyond five minutes.
    const timer = setTimeout(() => controller.abort(), 3600000);
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    let body;
    try {
      if (req.method === "POST") {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > MAX_REQUEST_BYTES) {
            reply(413, "Request exceeds 32 MiB");
            return;
          }
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          reply(400, "Invalid JSON");
          return;
        }
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          reply(400, "Request must be a JSON object");
          return;
        }
        body = normalizeNvidiaRequest(input);
      }
      const options = {
        method: req.method,
        headers: {
          Authorization: req.headers.authorization,
          "Content-Type": "application/json",
          Accept: body?.stream ? "text/event-stream" : "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      };
      // A client with its own retry budget can explicitly own retries. Never
      // multiply its 20 attempts by another 20 attempts in this bridge.
      const attempts =
        req.headers["x-miro-retry-owner"] === "client" ? 1 : maxAttempts;
      let upstream;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        controller.signal.throwIfAborted();
        // Thrown network errors have an unknown upstream outcome: do not replay.
        upstream = await fetchImpl(UPSTREAM + req.url, options);
        // Operational metadata only: never log credentials, prompts or responses.
        log(
          JSON.stringify({
            time: new Date().toISOString(),
            model: body?.model,
            max_tokens: body?.max_tokens,
            reasoning_effort: body?.reasoning_effort,
            reasoning_budget: body?.reasoning_budget,
            thinking: body?.chat_template_kwargs?.enable_thinking,
            tool_count: body?.tools?.length ?? 0,
            status: upstream.status,
            attempt,
            maxAttempts: attempts,
          }),
        );
        if (!TRANSIENT_STATUSES.has(upstream.status) || attempt === attempts)
          break;
        const wait = retryDelayMs(upstream, attempt, random, now);
        await upstream.body?.cancel();
        await sleep(wait, controller.signal);
      }
      const responseHeaders = {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      };
      for (const name of ["retry-after", "x-request-id", "request-id"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders[name] = value;
      }
      res.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        const source = Readable.fromWeb(upstream.body);
        controller.signal.addEventListener(
          "abort",
          () => source.destroy(new Error("NVIDIA request cancelled")),
          { once: true },
        );
        const stream =
          body?.model === ULTRA_MODEL &&
          upstream.headers.get("content-type")?.includes("text/event-stream")
            ? Readable.from(normalizeUltraSse(source))
            : source;
        await pipeline(stream, res);
      } else res.end();
    } catch {
      if (!res.headersSent) reply(502, "NVIDIA upstream request failed");
      else res.destroy();
    } finally {
      clearTimeout(timer);
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  createBridge().listen(19119, "127.0.0.1", () => {
    console.log("NVIDIA CLI bridge listening on 127.0.0.1:19119");
  });
}
