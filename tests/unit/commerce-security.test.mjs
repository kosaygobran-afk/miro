import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(source, imports = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      URL,
      Uint8Array,
      TextDecoder,
      require: (name) =>
        name === "server-only" ? {} : (imports[name] ?? require(name)),
    },
  );
  return exports;
}
const security = load(
  await readFile(
    new URL("../../src/lib/security-policy.ts", import.meta.url),
    "utf8",
  ),
);
const attachments = load(
  await readFile(
    new URL("../../src/lib/commerce/attachments.ts", import.meta.url),
    "utf8",
  ),
  {
    "./http": {
      CommerceError: class extends Error {
        constructor(code, status) {
          super(code);
          this.code = code;
          this.status = status;
        }
      },
    },
  },
);
test("production CSP authorizes only the generated nonce, blocks frames/objects and never allows eval", () => {
  const policy = security.contentSecurityPolicy(
    "abcd1234=",
    false,
    "https://project.supabase.co",
  );
  assert.match(policy, /script-src 'self' 'nonce-abcd1234=' 'strict-dynamic'/);
  assert.equal(policy.includes("unsafe-eval"), false);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /wss:\/\/project.supabase.co/);
  assert.throws(() =>
    security.contentSecurityPolicy("'; unsafe-inline", false),
  );
  assert.match(security.contentSecurityPolicy("devnonce", true), /unsafe-eval/);
});
test("private evidence has bounded bytes, matching sniffed MIME/extension and sanitized names", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
  const info = attachments.inspectExpenseAttachment(
    pdf,
    "../חשבונית.pdf",
    "application/pdf",
  );
  assert.equal(info.original_name, "חשבונית.pdf");
  assert.equal(info.sha256.length, 64);
  assert.throws(
    () => attachments.inspectExpenseAttachment(pdf, "evil.jpg", "image/jpeg"),
    /attachment_type_mismatch/,
  );
  assert.throws(
    () =>
      attachments.inspectExpenseAttachment(
        new Uint8Array([1, 2]),
        "evil.svg",
        "image/svg+xml",
      ),
    /unsupported_attachment/,
  );
  assert.throws(
    () =>
      attachments.inspectExpenseAttachment(
        new Uint8Array(5 * 1024 * 1024 + 1),
        "large.pdf",
        "application/pdf",
      ),
    /attachment_too_large/,
  );
});
