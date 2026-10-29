import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/lib/account-session.ts", import.meta.url),
  "utf8",
);

function load(fetcher) {
  const exports = {};
  const events = [];
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      fetch: fetcher,
      AbortSignal,
      AbortController,
      Event,
      window: { dispatchEvent: (event) => events.push(event.type) },
    },
  );
  return { ...exports, events };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

const signedIn = () =>
  Response.json({ authenticated: true, role: "customer", name: "Test actor" });

test("overlapping menus and focus share one read, later focus verifies afresh", async () => {
  const gate = deferred();
  let calls = 0;
  const api = load(async (_url, options) => {
    calls++;
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    await gate.promise;
    return signedIn();
  });
  const header = api.readAccountSession("/en/contact");
  const mobile = api.readAccountSession("/en/contact");
  const focus = api.readAccountSession("/en/contact");
  assert.equal(header, mobile);
  assert.equal(header, focus);
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve();
  assert.equal((await header).role, "customer");
  await api.readAccountSession("/en/contact");
  assert.equal(calls, 2, "settled identity must never be cached");
});

test("navigation starts a fresh read while the previous page is pending", async () => {
  const gate = deferred();
  let calls = 0;
  const api = load(async () => {
    calls++;
    await gate.promise;
    return signedIn();
  });
  const previous = api.readAccountSession("/en/login");
  const current = api.readAccountSession("/en/account");
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.notEqual(previous, current);
  gate.resolve();
  await Promise.all([previous, current]);
});

test("HTTP, malformed and synchronous transport failures fail closed and allow recovery", async () => {
  for (const failure of [
    () => new Response("unavailable", { status: 503 }),
    () => Response.json({ authenticated: true, role: "invented" }),
    () => Response.json({ authenticated: "true", role: "ceo" }),
    () => Response.json(null),
    () => new Response("invalid json"),
    () => {
      throw new TypeError("network unavailable");
    },
  ]) {
    let calls = 0;
    const api = load(() => (++calls === 1 ? failure() : signedIn()));
    assert.equal((await api.readAccountSession("/en")).authenticated, false);
    assert.equal((await api.readAccountSession("/en")).authenticated, true);
    assert.equal(calls, 2);
  }
});

test("logout discards a late response without clearing the replacement read", async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  const signals = [];
  const api = load(async (_url, options) => {
    signals.push(options.signal);
    await (signals.length === 1 ? firstGate.promise : secondGate.promise);
    return signedIn();
  });
  const oldRead = api.readAccountSession("/en");
  await Promise.resolve();
  api.invalidateAccountSession();
  assert.equal(signals[0].aborted, true);
  assert.deepEqual(api.events, [api.ACCOUNT_SESSION_REFRESH_EVENT]);
  const replacement = api.readAccountSession("/en");
  await Promise.resolve();
  firstGate.resolve();
  assert.equal((await oldRead).authenticated, false);
  assert.equal(api.readAccountSession("/en"), replacement);
  secondGate.resolve();
  assert.equal((await replacement).authenticated, true);
  assert.equal(signals.length, 2);
});
