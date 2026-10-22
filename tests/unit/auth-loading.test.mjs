import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { randomUUID, webcrypto } from "node:crypto";
import ts from "typescript";
import serverReact from "next/dist/compiled/react/react.react-server.js";
import { createServerClient } from "@supabase/ssr";

const internals =
  serverReact.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

// Use the installed server React cache with an isolated render dispatcher.
async function render(action) {
  const previous = internals.A;
  const entries = new Map();
  internals.A = {
    getCacheForType(factory) {
      if (!entries.has(factory)) entries.set(factory, factory());
      return entries.get(factory);
    },
  };
  try {
    return await action();
  } finally {
    internals.A = previous;
  }
}

async function load(file, imports, globals = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://loading-test.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
      },
    },
    require(name) {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return exports;
}

async function authModule() {
  const state = { role: "worker", status: "active", failure: false };
  const calls = { user: 0, profiles: 0, user_roles: 0, clients: 0 };
  const client = {
    auth: {
      async getUser() {
        calls.user++;
        return {
          data: {
            user: {
              id: "actor-1",
              email: "loading-qa@example.test",
              app_metadata: { role: "ceo" },
            },
          },
        };
      },
    },
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          calls[table]++;
          return {
            error: state.failure ? { code: "offline" } : null,
            data:
              table === "profiles"
                ? {
                    id: "actor-1",
                    full_name: "Loading QA",
                    phone: null,
                    account_status: state.status,
                  }
                : { role: state.role },
          };
        },
      };
    },
  };
  const api = await load("../../src/lib/auth.ts", {
    react: serverReact,
    "next/navigation": {
      redirect(url) {
        throw new Error(`redirect:${url}`);
      },
    },
    "@/lib/supabase/server": {
      async createServerSupabaseClient() {
        calls.clients++;
        return client;
      },
    },
    "@/lib/i18n": { withLocale: (locale, path) => `/${locale}/${path}` },
    "@/lib/roles": { roleHome: (role) => role },
  });
  return { api, state, calls, client };
}

test("layout and page share verified auth within one render and keep database role authority", async () => {
  const { api, calls } = await authModule();
  await render(async () => {
    const [layout, page] = await Promise.all([
      api.getAuthContext(),
      api.getAuthContext(),
    ]);
    assert.equal(layout, page);
    assert.equal(layout.role, "worker");
  });
  assert.deepEqual(calls, { user: 1, profiles: 1, user_roles: 1, clients: 1 });
});

test("each new render observes fresh account status and failed profile reads deny access", async () => {
  const { api, state, calls } = await authModule();
  assert.equal((await render(() => api.getAuthContext())).status, "active");
  state.status = "blocked";
  await assert.rejects(
    render(() => api.requireRole("en", ["worker"])),
    /redirect:\/en\/login/,
  );
  state.failure = true;
  assert.equal(await render(() => api.getAuthContext()), null);
  assert.equal(calls.user, 3);
});

test("supplied mutation clients reverify auth even within the same render", async () => {
  const { api, state, client, calls } = await authModule();
  await render(async () => {
    assert.equal((await api.getAuthContext(client)).status, "active");
    state.status = "suspended";
    assert.equal((await api.getAuthContext(client)).status, "suspended");
  });
  assert.equal(calls.user, 2);
  assert.equal(calls.clients, 0);
});

test("route handlers do not retain actor identity outside a React render", async () => {
  const { api, state, calls } = await authModule();
  assert.equal((await api.getAuthContext()).role, "worker");
  state.role = "customer";
  assert.equal((await api.getAuthContext()).role, "customer");
  assert.equal(calls.user, 2);
});

test("server clients deduplicate in a render and stay isolated across renders and route handlers", async () => {
  let count = 0;
  const api = await load("../../src/lib/supabase/server.ts", {
    react: serverReact,
    "@supabase/ssr": {
      createServerClient: () => ({ instance: ++count }),
    },
    "next/headers": {
      cookies: async () => ({ getAll: () => [], set: () => {} }),
    },
    "./fetch": { supabaseFetch: () => {} },
  });
  const first = await render(async () => {
    const [layout, page] = await Promise.all([
      api.createServerSupabaseClient(),
      api.createServerSupabaseClient(),
    ]);
    assert.equal(layout, page);
    return layout;
  });
  assert.notEqual(await render(() => api.createServerSupabaseClient()), first);
  assert.notEqual(
    await api.createServerSupabaseClient(),
    await api.createServerSupabaseClient(),
  );
  assert.equal(count, 4);
});

async function signedJwt() {
  const keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const kid = randomUUID();
  const jwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", typ: "JWT", kid }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "actor-1",
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const message = `${header}.${payload}`;
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    Buffer.from(message),
  );
  return {
    token: `${message}.${Buffer.from(signature).toString("base64url")}`,
    jwk: { ...jwk, kid, alg: "ES256", use: "sig" },
  };
}

function sessionCookie(token, origin) {
  return {
    name: `sb-${new URL(origin).hostname.split(".")[0]}-auth-token`,
    value: `base64-${Buffer.from(
      JSON.stringify({
        access_token: token,
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        user: { id: "actor-1", role: "authenticated" },
      }),
    ).toString("base64url")}`,
  };
}

function response() {
  const cookieValues = new Map();
  return {
    headers: new Headers(),
    cookieValues,
    cookies: {
      set(name, value) {
        cookieValues.set(name, value);
      },
    },
  };
}

async function proxyModule(origin, fetcher) {
  return load(
    "../../src/proxy.ts",
    {
      "@supabase/ssr": { createServerClient },
      "next-intl/middleware": { default: () => () => response() },
      "next/server": { NextResponse: { next: response } },
      "@/i18n/routing": { routing: {} },
      "@/lib/password-recovery": { authRequestUrl: () => {} },
      "@/lib/supabase/fetch": {
        supabaseFetch: fetcher,
        supabaseFetchFast: fetcher,
      },
      "@/lib/security-policy": { contentSecurityPolicy: () => "test-csp" },
    },
    {
      Buffer,
      crypto: webcrypto,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: origin,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
        },
      },
    },
  );
}

function proxyRequest(cookie) {
  const cookieValues = new Map([[cookie.name, cookie.value]]);
  return {
    nextUrl: new URL("https://miro.example.test/en/services"),
    headers: new Headers(),
    cookies: {
      getAll: () => [...cookieValues].map(([name, value]) => ({ name, value })),
      set(name, value) {
        cookieValues.set(name, value);
      },
    },
  };
}

test("proxy verifies ES256 with cached signing keys instead of a user API waterfall", async () => {
  const { token, jwk } = await signedJwt();
  const origin = `https://loading-${randomUUID()}.supabase.co`;
  const paths = [];
  const api = await proxyModule(origin, async (url) => {
    paths.push(new URL(url).pathname);
    assert.equal(new URL(url).pathname, "/auth/v1/.well-known/jwks.json");
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  for (let index = 0; index < 2; index++) {
    const result = await api.default(
      proxyRequest(sessionCookie(token, origin)),
    );
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.headers.get("Content-Security-Policy"), "test-csp");
  }
  assert.deepEqual(paths, ["/auth/v1/.well-known/jwks.json"]);
});

test("installed claims verifier rejects a tampered ES256 signature", async () => {
  const { token, jwk } = await signedJwt();
  const [header, payload] = token.split(".");
  const invalidToken = `${header}.${payload}.${Buffer.alloc(64).toString("base64url")}`;
  const origin = `https://invalid-${randomUUID()}.supabase.co`;
  const client = createServerClient(origin, "public-test-key", {
    cookies: {
      getAll: () => [sessionCookie(invalidToken, origin)],
      setAll() {},
    },
    global: {
      fetch: async () =>
        new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
  });
  const result = await client.auth.getClaims();
  assert.equal(result.data, null);
  assert.match(result.error.message, /Invalid JWT signature/);
});

test("proxy refreshes expiring sessions and forwards refreshed cookies and security headers", async () => {
  const { token, jwk } = await signedJwt();
  const origin = `https://refresh-${randomUUID()}.supabase.co`;
  const cookie = sessionCookie(token, origin);
  const session = JSON.parse(
    Buffer.from(cookie.value.slice("base64-".length), "base64url").toString(),
  );
  session.expires_at = Math.floor(Date.now() / 1000) - 120;
  cookie.value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const paths = [];
  const api = await proxyModule(origin, async (url) => {
    const pathname = new URL(url).pathname;
    paths.push(pathname);
    return new Response(
      JSON.stringify(
        pathname.endsWith("/token")
          ? {
              ...session,
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }
          : { keys: [jwk] },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const request = proxyRequest(cookie);
  const result = await api.default(request);
  assert.deepEqual(paths, ["/auth/v1/token", "/auth/v1/.well-known/jwks.json"]);
  assert.ok(result.cookieValues.size > 0);
  assert.notEqual(result.cookieValues.get(cookie.name), cookie.value);
  assert.equal(
    request.cookies.getAll()[0].value,
    result.cookieValues.get(cookie.name),
  );
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  assert.equal(result.headers.get("Content-Security-Policy"), "test-csp");
  assert.equal(
    result.headers.get("x-middleware-request-content-security-policy"),
    "test-csp",
  );
});

test("proxy retains the installed remote-user verification fallback for symmetric keys", async () => {
  const origin = `https://legacy-${randomUUID()}.supabase.co`;
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: "actor-1", exp: Math.floor(Date.now() / 1000) + 3600 },
    "test-signature",
  ]
    .map((part) =>
      Buffer.from(
        typeof part === "string" ? part : JSON.stringify(part),
      ).toString("base64url"),
    )
    .join(".");
  const paths = [];
  const api = await proxyModule(origin, async (url) => {
    paths.push(new URL(url).pathname);
    return new Response(
      JSON.stringify({ id: "actor-1", role: "authenticated" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
  await api.default(proxyRequest(sessionCookie(token, origin)));
  assert.deepEqual(paths, ["/auth/v1/user"]);
});

test("proxy clears rejected expired refresh cookies and the next request stays anonymous", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const warnings = t.mock.method(console, "warn", () => {});
  const { token } = await signedJwt();
  const origin = `https://expired-${randomUUID()}.supabase.co`;
  const cookie = sessionCookie(token, origin);
  const session = JSON.parse(
    Buffer.from(cookie.value.slice(7), "base64url").toString(),
  );
  session.expires_at = Math.floor(Date.now() / 1000) - 120;
  cookie.value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  let refreshes = 0;
  const api = await proxyModule(origin, async (url) => {
    assert.equal(new URL(url).pathname, "/auth/v1/token");
    refreshes++;
    return new Response(
      JSON.stringify({
        code: "refresh_token_not_found",
        message: "Invalid Refresh Token: Refresh Token Not Found",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "X-Supabase-Api-Version": "2024-01-01",
        },
      },
    );
  });
  const request = proxyRequest(cookie);
  const result = await api.default(request);
  assert.equal(result.cookieValues.get(cookie.name), "");
  assert.equal(request.cookies.getAll()[0].value, "");
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  assert.equal(result.headers.get("Content-Security-Policy"), "test-csp");
  await api.default(request);
  assert.equal(refreshes, 1, "cleared credentials must not refresh again");
  assert.equal(
    errors.mock.callCount(),
    0,
    errors.mock.calls.map(({ arguments: args }) => String(args[0])).join("; "),
  );
  for (const { arguments: args } of warnings.mock.calls)
    assert.equal(args[0].code, "refresh_token_not_found");
});
