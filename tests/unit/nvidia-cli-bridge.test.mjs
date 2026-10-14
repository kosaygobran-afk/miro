import assert from "node:assert/strict";
import { once } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createBridge,
  normalizeNvidiaRequest,
  normalizeUltraSse,
  ULTRA_MODEL,
} from "../../scripts/nvidia-cli-bridge.mjs";

async function startTestBridge(t, fetchImpl) {
  const server = createBridge({ fetchImpl, log: () => {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

function chatRequest(body, signal) {
  return {
    method: "POST",
    headers: { authorization: "Bearer synthetic-test-secret" },
    body,
    signal,
  };
}

function sseEvent(delta, finishReason = null, extra = {}) {
  return `data: ${JSON.stringify({
    id: "synthetic-completion",
    model: ULTRA_MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...extra,
  })}\n\n`;
}

async function normalizeSse(input, chunkSize = 31) {
  const bytes = new TextEncoder().encode(input);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.slice(offset, offset + chunkSize));
  }
  let text = "";
  for await (const chunk of normalizeUltraSse(Readable.from(chunks))) {
    text += chunk;
  }
  const events = text.split("\n\n").flatMap((event) => {
    if (!event.startsWith("data: ") || event === "data: [DONE]") return [];
    return [JSON.parse(event.slice("data: ".length))];
  });
  return {
    text,
    events,
    choices: events.flatMap((event) => event.choices ?? []),
  };
}

test("NVIDIA compatibility preserves other models and input objects", () => {
  const input = {
    model: "openai/gpt-oss-20b",
    prompt_cache_key: "session",
    temperature: 0.4,
  };
  assert.deepEqual(normalizeNvidiaRequest(input), {
    model: input.model,
    temperature: 0.4,
  });
  assert.equal(input.prompt_cache_key, "session");
});

test("Ultra full reasoning removes conflicting budget and respects reduced context caps", () => {
  const body = normalizeNvidiaRequest({
    model: ULTRA_MODEL,
    max_completion_tokens: 6000,
    reasoning_effort: "medium",
    chat_template_kwargs: { reasoning_budget: 100, medium_effort: true },
  });
  assert.equal(body.max_tokens, 6000);
  assert.equal(body.max_completion_tokens, undefined);
  assert.equal(body.reasoning_effort, "high");
  assert.equal(body.reasoning_budget, -1);
  assert.deepEqual(body.chat_template_kwargs, {
    reasoning_budget: -1,
    medium_effort: false,
    enable_thinking: true,
    force_nonempty_content: true,
  });
  assert.equal(
    normalizeNvidiaRequest({ model: ULTRA_MODEL }).max_tokens,
    32768,
  );
  assert.equal(
    normalizeNvidiaRequest({ model: ULTRA_MODEL, max_tokens: 65536 })
      .max_tokens,
    32768,
  );
});

test("bridge rejects unauthenticated/arbitrary routes and streams without logging private content", async (t) => {
  const calls = [];
  const logs = [];
  const stream = 'data: {"choices":[]}\n\ndata: [DONE]\n\n';
  const server = createBridge({
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    },
    log: (line) => logs.push(line),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(url + "/v1/chat/completions", { method: "POST" })).status,
    401,
  );
  assert.equal((await fetch(url + "/v1/not-allowed")).status, 404);
  const response = await fetch(url + "/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer synthetic-test-secret" },
    body: JSON.stringify({
      model: ULTRA_MODEL,
      stream: true,
      prompt_cache_key: "private-session",
      messages: [{ role: "user", content: "private-prompt" }],
    }),
  });
  assert.equal(await response.text(), stream);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0][0],
    "https://integrate.api.nvidia.com/v1/chat/completions",
  );
  assert.equal(JSON.parse(calls[0][1].body).prompt_cache_key, undefined);
  assert.ok(!logs.join("").includes("private-prompt"));
  assert.ok(!logs.join("").includes("synthetic-test-secret"));
});

test("bridge preserves NVIDIA errors and retry guidance without replay", async (t) => {
  const calls = [];
  const upstreamError = JSON.stringify({
    error: { message: "Synthetic provider rate limit", code: "rate_limited" },
  });
  const url = await startTestBridge(t, async (...args) => {
    calls.push(args);
    return new Response(upstreamError, {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "23",
        "request-id": "synthetic-nvidia-request",
        "x-request-id": "synthetic-upstream-request",
      },
    });
  });
  const response = await fetch(
    url + "/v1/chat/completions",
    chatRequest(JSON.stringify({ model: ULTRA_MODEL, stream: true })),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "23");
  assert.equal(response.headers.get("request-id"), "synthetic-nvidia-request");
  assert.equal(
    response.headers.get("x-request-id"),
    "synthetic-upstream-request",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), upstreamError);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0][1].body).model, ULTRA_MODEL);
});

test("bridge rejects malformed JSON and non-object payloads before contacting NVIDIA", async (t) => {
  let calls = 0;
  const url = await startTestBridge(t, async () => {
    calls += 1;
    return new Response("{}");
  });
  for (const [body, expectedMessage] of [
    ['{"model":', "Invalid JSON"],
    ["null", "Request must be a JSON object"],
    ["[]", "Request must be a JSON object"],
    ['"string"', "Request must be a JSON object"],
    ["123", "Request must be a JSON object"],
  ]) {
    const response = await fetch(
      url + "/v1/chat/completions",
      chatRequest(body),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.message, expectedMessage);
  }
  assert.equal(calls, 0);
});

test("bridge reports one upstream network failure without replaying the request", async (t) => {
  let calls = 0;
  const url = await startTestBridge(t, async () => {
    calls += 1;
    throw new Error("Synthetic failure that must not reach the client");
  });
  const response = await fetch(
    url + "/v1/chat/completions",
    chatRequest(JSON.stringify({ model: ULTRA_MODEL })),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: { message: "NVIDIA upstream request failed" },
  });
  assert.equal(calls, 1);
});

test("Ultra SSE separates inline reasoning across token, event and UTF-8 byte boundaries", async () => {
  const input =
    sseEvent({ role: "assistant", content: "<think>בדיקה🙂" }) +
    sseEvent({ content: "</th" }) +
    sseEvent({ content: "ink>done 🌍" }) +
    sseEvent({}, "stop", { usage: { completion_tokens: 9 } }) +
    "data: [DONE]\n\n";
  const { text, events, choices } = await normalizeSse(input, 1);
  assert.equal(
    choices.map((choice) => choice.delta.reasoning_content ?? "").join(""),
    "בדיקה🙂",
  );
  assert.equal(
    choices.map((choice) => choice.delta.content ?? "").join(""),
    "done 🌍",
  );
  assert.equal(choices.at(-1).finish_reason, "stop");
  assert.deepEqual(events.at(-1).usage, { completion_tokens: 9 });
  assert.ok(text.endsWith("data: [DONE]\n\n"));
});

test("Ultra SSE leaves already separated reasoning and content unchanged", async () => {
  const input =
    sseEvent({
      role: "assistant",
      reasoning_content: "Existing reasoning 🙂",
    }) +
    sseEvent({ reasoning_content: " continued" }) +
    sseEvent({ content: "Plain final with a literal </think> marker" }) +
    sseEvent({}, "stop") +
    "data: [DONE]\n\n";
  assert.equal((await normalizeSse(input, 2)).text, input);
});

test("Ultra SSE preserves content order when the provider switches to separated reasoning", async () => {
  const input =
    sseEvent({ role: "assistant", content: "First " }) +
    sseEvent({ reasoning_content: "Native reasoning", content: "second " }) +
    sseEvent({ content: "third" }) +
    sseEvent({}, "stop") +
    "data: [DONE]\n\n";
  const { choices } = await normalizeSse(input, 5);
  assert.equal(
    choices.map((choice) => choice.delta.content ?? "").join(""),
    "First second third",
  );
  assert.equal(
    choices.map((choice) => choice.delta.reasoning_content ?? "").join(""),
    "Native reasoning",
  );
  assert.equal(choices.at(-1).finish_reason, "stop");
});

test("Ultra SSE preserves plain answers and unfinished length-limited content", async () => {
  for (const [content, finishReason] of [
    ["Plain final 🙂", "stop"],
    ["<think>Unfinished reasoning 🙂", "length"],
  ]) {
    const { choices } = await normalizeSse(
      sseEvent({ role: "assistant", content }) +
        sseEvent({}, finishReason) +
        "data: [DONE]\n\n",
    );
    assert.equal(
      choices.map((choice) => choice.delta.content ?? "").join(""),
      content,
    );
    assert.equal(choices.at(-1).finish_reason, finishReason);
    assert.ok(
      choices.every((choice) => choice.delta.reasoning_content === undefined),
    );
  }
});

test("Ultra SSE flushes truncated content without manufacturing a completed response", async () => {
  const content = "Unfinished stream 🙂";
  for (const ending of ["", "data: [DONE]\n\n"]) {
    const { text, choices } = await normalizeSse(
      sseEvent({ content }) + ending,
    );
    assert.equal(
      choices.map((choice) => choice.delta.content ?? "").join(""),
      content,
    );
    assert.ok(choices.every((choice) => !choice.finish_reason));
    assert.equal(text.includes("data: [DONE]"), Boolean(ending));
  }
});

test("Ultra SSE preserves streamed tool deltas and the tool-calls finish reason", async () => {
  const toolDeltas = [
    [
      {
        index: 0,
        id: "synthetic-tool-call",
        type: "function",
        function: { name: "Bash", arguments: '{"command":' },
      },
    ],
    [{ index: 0, function: { arguments: '"printf synthetic"}' } }],
  ];
  const input =
    sseEvent({ content: "Reason before tool</think>" }) +
    sseEvent({ tool_calls: toolDeltas[0] }) +
    sseEvent({ tool_calls: toolDeltas[1] }) +
    sseEvent({}, "tool_calls") +
    "data: [DONE]\n\n";
  const { choices } = await normalizeSse(input, 3);
  assert.deepEqual(
    choices.flatMap((choice) =>
      choice.delta.tool_calls ? [choice.delta.tool_calls] : [],
    ),
    toolDeltas,
  );
  assert.equal(choices.at(-1).finish_reason, "tool_calls");
  assert.equal(
    choices.map((choice) => choice.delta.reasoning_content ?? "").join(""),
    "Reason before tool",
  );
  assert.equal(
    choices.map((choice) => choice.delta.content ?? "").join(""),
    "",
  );
});

for (const model of ["openai/gpt-oss-20b", ULTRA_MODEL]) {
  test(
    `downstream cancellation aborts NVIDIA and cancels the upstream stream for ${model}`,
    { timeout: 5000 },
    async (t) => {
      let upstreamSignal;
      let calls = 0;
      let resolveAborted;
      let resolveCancelled;
      const aborted = new Promise((resolve) => {
        resolveAborted = resolve;
      });
      const cancelled = new Promise((resolve) => {
        resolveCancelled = resolve;
      });
      const chunk =
        'data: {"choices":[{"delta":{"content":"synthetic chunk"}}]}\n\n';
      const url = await startTestBridge(t, async (_url, options) => {
        calls += 1;
        upstreamSignal = options.signal;
        upstreamSignal.addEventListener("abort", resolveAborted, {
          once: true,
        });
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(chunk));
            },
            cancel() {
              resolveCancelled();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      });
      const clientController = new AbortController();
      t.after(() => clientController.abort());
      const response = await fetch(
        url + "/v1/chat/completions",
        chatRequest(
          JSON.stringify({ model, stream: true }),
          clientController.signal,
        ),
      );
      const reader = response.body.getReader();
      const first = await reader.read();
      assert.equal(first.done, false);
      assert.equal(
        new TextDecoder().decode(first.value),
        model === ULTRA_MODEL ? 'data: {"choices":[{"delta":{}}]}\n\n' : chunk,
      );
      assert.equal(upstreamSignal.aborted, false);
      clientController.abort();
      await Promise.all([aborted, cancelled]);
      assert.equal(upstreamSignal.aborted, true);
      assert.equal(calls, 1);
    },
  );
}
