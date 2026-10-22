import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const jsonBody = (response) => JSON.parse(JSON.stringify(response.body));

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

const fetchSource = compile(
  await readFile(
    new URL("../../src/lib/supabase/fetch.ts", import.meta.url),
    "utf8",
  ),
);
const trackSource = compile(
  await readFile(
    new URL("../../src/app/api/track/route.ts", import.meta.url),
    "utf8",
  ),
);
const sessionSource = compile(
  await readFile(
    new URL("../../src/app/api/auth/session/route.ts", import.meta.url),
    "utf8",
  ),
);

function loadFetch(
  fetchImpl,
  { now = () => Date.now(), AbortSignalImpl = AbortSignal } = {},
) {
  const exports = {};
  runInNewContext(fetchSource, {
    exports,
    fetch: fetchImpl,
    AbortSignal: AbortSignalImpl,
    Request,
    Date: { now },
  });
  return exports;
}

function trackRequest({
  body = { type: "product_view" },
  cookieNames = [],
  sessionId = "session-1",
} = {}) {
  return {
    json: async () => body,
    headers: new Headers(sessionId ? { "x-miro-sid": sessionId } : undefined),
    cookies: {
      get: (name) =>
        cookieNames.includes(name) ? { value: "cookie-value" } : undefined,
      getAll: () =>
        cookieNames.map((name) => ({ name, value: "cookie-value" })),
    },
  };
}

function loadTrack({
  unavailable = false,
  rpcImpl = async () => ({ data: true, error: null }),
  authContext = null,
  authThrows = false,
} = {}) {
  const calls = { clients: 0, auth: 0, rpc: [], inserts: [] };
  const exports = {};

  runInNewContext(trackSource, {
    exports,
    console: { error() {} },
    require(name) {
      if (name === "next/server")
        return {
          NextResponse: {
            json: (body, options) => ({ body, status: 200, ...options }),
          },
        };
      if (name === "zod") return { z };
      if (name === "@/lib/request-origin") return { hasSameOrigin: () => true };
      if (name === "@/lib/supabase/fetch")
        return { isSupabaseUnavailable: () => unavailable };
      if (name === "@/lib/supabase/server")
        return {
          createFastServerSupabaseClient: async () => {
            calls.clients += 1;
            return {
              rpc(name, args) {
                calls.rpc.push({ name, args });
                return rpcImpl(args);
              },
              from(table) {
                return {
                  insert(row) {
                    calls.inserts.push({ table, row });
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      assert.equal(name, "@/lib/auth");
      return {
        getAuthContext: async () => {
          calls.auth += 1;
          if (authThrows) throw new Error("upstream unavailable");
          return authContext;
        },
      };
    },
  });

  return { exports, calls };
}

function loadSession({
  cookieNames = [],
  unavailable = false,
  authContext = null,
  authThrows = false,
} = {}) {
  const calls = { clients: 0, auth: 0 };
  const exports = {};

  runInNewContext(sessionSource, {
    exports,
    require(name) {
      if (name === "next/server")
        return {
          NextResponse: {
            json: (body, options) => ({ body, status: 200, ...options }),
          },
        };
      if (name === "next/headers")
        return {
          cookies: async () => ({
            getAll: () =>
              cookieNames.map((cookieName) => ({
                name: cookieName,
                value: "cookie-value",
              })),
          }),
        };
      if (name === "@/lib/supabase/fetch")
        return { isSupabaseUnavailable: () => unavailable };
      if (name === "@/lib/supabase/server")
        return {
          createFastServerSupabaseClient: async () => {
            calls.clients += 1;
            return {};
          },
        };
      assert.equal(name, "@/lib/auth");
      return {
        getAuthContext: async () => {
          calls.auth += 1;
          if (authThrows) throw new Error("upstream unavailable");
          return authContext;
        },
      };
    },
  });

  return { exports, calls };
}

test("two transport failures open the breaker and short-circuit the next call", async () => {
  let networkCalls = 0;
  const fetchImpl = async () => {
    networkCalls += 1;
    throw new TypeError("fetch failed");
  };
  const breaker = loadFetch(fetchImpl);

  await assert.rejects(
    breaker.supabaseFetchFast("https://example.test/rest/v1"),
    { name: "TypeError" },
  );
  await assert.rejects(
    breaker.supabaseFetchFast("https://example.test/rest/v1"),
    { name: "TypeError" },
  );

  assert.equal(breaker.isSupabaseUnavailable(), true);
  assert.equal(networkCalls, 2);

  await assert.rejects(
    breaker.supabaseFetchFast("https://example.test/rest/v1"),
    (error) => {
      assert.equal(error.name, "AbortError");
      assert.equal(error.code, "SUPABASE_UNAVAILABLE");
      assert.ok(error instanceof breaker.SupabaseUnavailableError);
      return true;
    },
  );
  assert.equal(networkCalls, 2, "the open breaker must not reach the network");
});

test("a successful probe closes the breaker after the cooldown", async () => {
  let now = 1_000;
  let mode = "fail";
  const fetchImpl = async () => {
    if (mode === "fail") throw new TypeError("fetch failed");
    return { ok: true, status: 200 };
  };
  const breaker = loadFetch(fetchImpl, { now: () => now });

  await assert.rejects(breaker.supabaseFetchFast("https://example.test"));
  await assert.rejects(breaker.supabaseFetchFast("https://example.test"));
  assert.equal(breaker.isSupabaseUnavailable(), true);

  now += 30_001;
  assert.equal(breaker.isSupabaseUnavailable(), false);

  mode = "ok";
  const response = await breaker.supabaseFetchFast("https://example.test");
  assert.equal(response.ok, true);
  assert.equal(breaker.isSupabaseUnavailable(), false);
});

test("caller cancellation does not trip the breaker, timeouts do", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  const cancelled = loadFetch(async () => {
    throw aborted;
  });

  await assert.rejects(cancelled.supabaseFetchFast("https://example.test"));
  await assert.rejects(cancelled.supabaseFetchFast("https://example.test"));
  assert.equal(cancelled.isSupabaseUnavailable(), false);

  let timedOutCalls = 0;
  const timedOut = loadFetch(async () => {
    timedOutCalls += 1;
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });

  await assert.rejects(timedOut.supabaseFetchFast("https://example.test"));
  await assert.rejects(timedOut.supabaseFetchFast("https://example.test"));
  assert.equal(timedOut.isSupabaseUnavailable(), true);
  await assert.rejects(
    timedOut.supabaseFetchFast("https://example.test"),
    (error) => {
      assert.equal(error.name, "AbortError");
      assert.equal(error.code, "SUPABASE_UNAVAILABLE");
      return true;
    },
  );
  assert.equal(timedOutCalls, 2);
});

test("our own deadline is abort-shaped so installed SDK reads stop retrying", async () => {
  const reason = new DOMException("request timed out", "TimeoutError");
  const preAborted = new AbortController();
  preAborted.abort(reason);

  const breaker = loadFetch(
    async (_input, init) => {
      throw init.signal.reason;
    },
    {
      AbortSignalImpl: {
        timeout: () => preAborted.signal,
        any: (signals) =>
          signals.find((signal) => signal.aborted) ?? signals[0],
      },
    },
  );

  await assert.rejects(
    breaker.supabaseFetchFast("https://example.test"),
    (error) => {
      assert.equal(error.name, "AbortError");
      assert.equal(error.code, "SUPABASE_TIMEOUT");
      assert.ok(error instanceof breaker.SupabaseTimeoutError);
      return true;
    },
  );
});

test("tracking returns immediately when the breaker is open", async () => {
  const { exports, calls } = loadTrack({ unavailable: true });
  const response = await exports.POST(trackRequest());

  assert.deepEqual(jsonBody(response), { ok: true });
  assert.equal(calls.clients, 0);
  assert.equal(calls.auth, 0);
  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.inserts.length, 0);
});

test("tracking evaluates both rate-limit buckets in parallel", async () => {
  const { exports, calls } = loadTrack({
    rpcImpl: async (args) => ({
      data: !args.p_key.endsWith(":1m"),
      error: null,
    }),
  });

  const response = await exports.POST(trackRequest());
  assert.deepEqual(jsonBody(response), { ok: true });
  assert.deepEqual(
    calls.rpc.map(({ args }) => args.p_key),
    ["track:sid:session-1:1m", "track:sid:session-1:1h"],
  );
  assert.equal(calls.inserts.length, 0, "a limited event is never inserted");
});

test("tracking skips remote auth for anonymous sessions and keeps the fast client", async () => {
  const { exports, calls } = loadTrack();

  const response = await exports.POST(trackRequest());
  assert.deepEqual(jsonBody(response), { ok: true });
  assert.equal(calls.auth, 0);
  assert.equal(calls.clients, 1);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].row.user_id, null);
  assert.equal(calls.inserts[0].row.event_type, "product_view");
});

test("tracking attributes authenticated events when a Supabase cookie exists", async () => {
  const { exports, calls } = loadTrack({
    authContext: {
      user: { id: "user-1" },
      role: "customer",
      status: "active",
    },
  });

  const response = await exports.POST(
    trackRequest({ cookieNames: ["sb-project-auth-token"] }),
  );
  assert.deepEqual(jsonBody(response), { ok: true });
  assert.equal(calls.auth, 1);
  assert.equal(calls.inserts[0].row.user_id, "user-1");
});

test("tracking drops the event on a rate-limit transport error", async () => {
  const { exports, calls } = loadTrack({
    rpcImpl: async () => ({
      data: null,
      error: { code: "", message: "TypeError: fetch failed" },
    }),
  });

  const response = await exports.POST(trackRequest());
  assert.deepEqual(jsonBody(response), { ok: true });
  assert.equal(calls.inserts.length, 0);
});

test("session checks skip the network for anonymous visitors", async () => {
  const { exports, calls } = loadSession();
  const response = await exports.GET();

  assert.deepEqual(jsonBody(response), {
    authenticated: false,
    role: null,
    name: null,
  });
  assert.equal(calls.clients, 0);
  assert.equal(calls.auth, 0);
});

test("session checks skip the network while the breaker is open", async () => {
  const { exports, calls } = loadSession({
    cookieNames: ["sb-project-auth-token"],
    unavailable: true,
  });
  const response = await exports.GET();

  assert.equal(response.body.authenticated, false);
  assert.equal(calls.clients, 0);
  assert.equal(calls.auth, 0);
});

test("session checks personalize an active actor and fail closed on errors", async () => {
  const active = loadSession({
    cookieNames: ["sb-project-auth-token"],
    authContext: {
      user: { id: "user-1", email: "ceo@example.test" },
      role: "ceo",
      status: "active",
      profile: { id: "user-1", full_name: "Owner", phone: null },
    },
  });
  const response = await active.exports.GET();
  assert.deepEqual(jsonBody(response), {
    authenticated: true,
    role: "ceo",
    name: "Owner",
  });

  const failed = loadSession({
    cookieNames: ["sb-project-auth-token"],
    authThrows: true,
  });
  const failure = await failed.exports.GET();
  assert.equal(failure.body.authenticated, false);
});
