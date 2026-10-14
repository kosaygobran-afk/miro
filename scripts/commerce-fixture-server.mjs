import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const port = Number(process.env.COMMERCE_FIXTURE_PORT || 54321);
const psql =
  process.env.COMMERCE_PSQL || "/opt/homebrew/opt/postgresql@17/bin/psql";
const pgPort = Number(process.env.COMMERCE_PG_PORT);
const actors = JSON.parse(process.env.COMMERCE_TEST_ACTORS || "{}");
const publishable =
  process.env.COMMERCE_TEST_PUBLISHABLE_KEY ||
  "sb_publishable_commerce_fixture";
const secret =
  process.env.COMMERCE_TEST_SECRET_KEY || "sb_secret_commerce_fixture";
const allowedRpcs = new Set([
  "check_rate_limit",
  "commerce_read",
  "commerce_write",
  "commerce_create_intent",
  "commerce_start_attempt",
  "commerce_cancel_intent",
  "commerce_pos_available_stock",
]);

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, prefer",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}
function actorFor(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return Object.entries(actors).find(([, a]) => a.token === token)?.[1] || null;
}
function psqlQuery(sql) {
  const proc = spawnSync(
    psql,
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(pgPort),
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
      "-q",
      "-A",
      "-t",
    ],
    { input: sql, encoding: "utf8", timeout: 15000 },
  );
  if (proc.status !== 0) {
    const code =
      proc.stderr.match(/ERROR:\s+[^\n]*\n(?:.*\n)*?CONTEXT:/)?.[0] ||
      proc.stderr;
    const sqlState =
      proc.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] || "XX000";
    return { error: { code: sqlState, message: code.slice(0, 500) } };
  }
  const out = proc.stdout.trim();
  if (!out) return { data: null };
  try {
    return { data: JSON.parse(out) };
  } catch {
    return { data: out };
  }
}
function literal(value) {
  const encoded = Buffer.from(JSON.stringify(value ?? {})).toString("base64");
  return `convert_from(decode('${encoded}','base64'),'utf8')::jsonb`;
}
function textLiteral(value) {
  const encoded = Buffer.from(String(value ?? "")).toString("base64");
  return `convert_from(decode('${encoded}','base64'),'utf8')`;
}
function filterSearch(filter) {
  const match = (filter || "").match(
    /(?:name_he|sku)\.ilike\."%((?:\\.|[^"])*)%"/,
  );
  return match ? match[1].replace(/\\(.)/g, "$1") : "";
}
function filterExact(filter) {
  const match = (filter || "").match(/sku\.(?:eq|ilike)\."((?:\\.|[^"])*)"/);
  return match ? match[1].replace(/\\(.)/g, "$1") : null;
}
function callRpc(name, args, actor, privileged) {
  if (!allowedRpcs.has(name))
    return {
      error: {
        code: "PGRST202",
        message: "RPC not exposed by local test fixture",
      },
    };
  if (name === "check_rate_limit") return { data: true };
  const role = privileged ? "service_role" : "authenticated";
  const claims =
    `set local role ${role}; set local request.jwt.claim.role='${role}';` +
    (actor ? ` set local request.jwt.claim.sub='${actor.id}';` : "");
  let expression;
  if (name === "commerce_read")
    expression = `public.commerce_read(${textLiteral(args.p_section)},${literal(args.p_filters)});`;
  else if (name === "commerce_write")
    expression = `public.commerce_write(${textLiteral(args.p_action)},${literal(args.p_payload)});`;
  else if (name === "commerce_cancel_intent")
    expression = `public.commerce_cancel_intent(${textLiteral(args.p_intent_id)}::uuid,${args.p_capability ? textLiteral(args.p_capability) : "null"});`;
  else if (name === "commerce_pos_available_stock")
    expression = `public.commerce_pos_available_stock(array[${(args.p_variant_ids || []).map((id) => textLiteral(id) + "::uuid").join(",")}]::uuid[]);`;
  else expression = `public.${name}(${literal(args.p_payload)});`;
  return psqlQuery(`begin; ${claims} select ${expression} commit;`);
}
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const apiKey = req.headers.apikey;
  const actor = actorFor(req);
  const body = async () => {
    let s = "";
    for await (const c of req) s += c;
    return s ? JSON.parse(s) : {};
  };
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    process.stdout.write(
      `auth user request cookie_names=${(req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim().split("=")[0])
        .filter(Boolean)
        .join(",")} bearer_known=${Boolean(actor)}\n`,
    );
    if (apiKey !== publishable || !actor)
      return json(res, 401, { message: "Invalid fixture session" });
    return json(res, 200, {
      id: actor.id,
      aud: "authenticated",
      role: "authenticated",
      email: actor.email,
      app_metadata: {},
      user_metadata: { full_name: actor.name },
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.split("/").at(-1);
    const privileged =
      apiKey === secret &&
      /^Bearer\s+sb_secret_/.test(req.headers.authorization || "");
    if (!privileged && (apiKey !== publishable || !actor))
      return json(res, 401, {
        code: "42501",
        message: "Authentication required",
      });
    if (req.method !== "POST")
      return json(res, 405, { message: "POST required" });
    const result = callRpc(name, await body(), actor, privileged);
    if (result.error) {
      process.stdout.write(
        `rpc error name=${name} code=${result.error.code} message=${String(result.error.message).slice(0, 240)}\n`,
      );
      return json(
        res,
        result.error.code === "42501"
          ? 403
          : result.error.code === "PT409"
            ? 409
            : 400,
        result.error,
      );
    }
    return json(res, 200, result.data);
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const privileged =
      apiKey === secret &&
      /^Bearer\s+sb_secret_/.test(req.headers.authorization || "");
    if (!privileged && (apiKey !== publishable || !actor))
      return json(res, 401, { message: "Authentication required" });
    const table = url.pathname.split("/").at(-1);
    const id = (actor?.id || "").replaceAll("'", "''");
    let selectSql;
    if (table === "profiles")
      selectSql = `select id,full_name,phone,account_status from public.profiles where id='${id}'::uuid`;
    else if (table === "user_roles")
      selectSql = `select role from public.user_roles where user_id='${id}'::uuid`;
    else if (table === "orders")
      selectSql = `select o.*, coalesce((select json_agg(row_to_json(i)) from public.order_items i where i.order_id=o.id), '[]'::json) as order_items from public.orders o order by o.created_at desc`;
    else if (privileged && table === "products") {
      const term = filterSearch(url.searchParams.get("or"));
      const category = url.searchParams
        .get("categories.id")
        ?.replace(/^eq\./, "");
      const ids =
        url.searchParams
          .get("or")
          ?.match(/id\.in\.\(([^)]+)\)/)?.[1]
          ?.split(",")
          .filter((id) => /^[0-9a-f-]{36}$/.test(id)) || [];
      const extra = term
        ? ` and (p.name_he ilike ${textLiteral("%" + term + "%")} or p.name_en ilike ${textLiteral("%" + term + "%")} or p.slug ilike ${textLiteral("%" + term + "%")}${ids.length ? " or p.id in (" + ids.map((id) => textLiteral(id) + "::uuid").join(",") + ")" : ""})`
        : ids.length
          ? ` and p.id in (${ids.map((id) => textLiteral(id) + "::uuid").join(",")})`
          : "";
      selectSql = `select p.*, row_to_json(c) as categories, (select coalesce(json_agg(row_to_json(v)),'[]'::json) from public.product_variants v where v.product_id=p.id and v.is_active and v.pos_enabled) as product_variants from public.products p join public.categories c on c.id=p.category_id where p.status='active' and p.is_active and c.is_active and exists(select 1 from public.product_variants v where v.product_id=p.id and v.is_active and v.pos_enabled) ${extra} ${category && /^[0-9a-f-]{36}$/.test(category) ? "and p.category_id=" + textLiteral(category) + "::uuid" : ""} order by p.sort_order,p.id`;
    } else if (privileged && table === "product_variants") {
      const term = filterSearch(url.searchParams.get("or"));
      const exact = filterExact(url.searchParams.get("or"));
      selectSql = `select v.* from public.product_variants v where v.is_active and v.pos_enabled ${term ? "and (v.sku ilike " + textLiteral("%" + term + "%") + " or v.barcode ilike " + textLiteral("%" + term + "%") + ")" : exact !== null ? "and (v.sku ilike " + textLiteral(exact) + " or v.barcode=" + textLiteral(exact) + ")" : ""}`;
    } else if (
      privileged &&
      [
        "categories",
        "tax_rates",
        "commerce_intents",
        "commerce_intent_items",
        "payment_attempts",
      ].includes(table)
    ) {
      const column =
        table === "commerce_intent_items" || table === "payment_attempts"
          ? "intent_id"
          : "id";
      const target = url.searchParams.get(column)?.replace(/^eq\./, "");
      selectSql = `select * from public.${table} ${target && /^[0-9a-f-]{36}$/.test(target) ? "where " + column + "=" + textLiteral(target) + "::uuid" : ""} ${table === "commerce_intent_items" ? "order by line_no" : ""}`;
    } else
      return json(res, 404, {
        message: "Table not exposed in commerce fixture",
      });
    const result = psqlQuery(
      `begin; set local role ${privileged ? "service_role" : "authenticated"}; set local request.jwt.claim.role='${privileged ? "service_role" : "authenticated"}'; set local request.jwt.claim.sub='${id}'; select coalesce(json_agg(row_to_json(q)),'[]'::json)::text from (${selectSql}) q; commit;`,
    );
    if (result.error) return json(res, 400, result.error);
    let rows =
      typeof result.data === "string" ? JSON.parse(result.data) : result.data;
    const fullCount = rows.length;
    const targetOrder =
      table === "orders"
        ? url.searchParams.get("id")?.replace(/^eq\./, "")
        : null;
    if (targetOrder) rows = rows.filter((row) => row.id === targetOrder);
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const limit = Math.min(
      1000,
      Math.max(1, Number(url.searchParams.get("limit") || 1000)),
    );
    rows = rows.slice(offset, offset + limit);
    res.setHeader(
      "content-range",
      `${offset}-${offset + Math.max(rows.length - 1, 0)}/${fullCount}`,
    );
    if (
      (req.headers.accept || "").includes("application/vnd.pgrst.object+json")
    ) {
      if (rows.length !== 1)
        return json(res, rows.length ? 406 : 406, {
          code: "PGRST116",
          details: `Expected one row, found ${rows.length}`,
        });
      return json(res, 200, rows[0]);
    }
    if (
      table === "orders" &&
      (req.method === "HEAD" || url.searchParams.has("select"))
    ) {
      res.setHeader(
        "content-range",
        `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      );
    }
    if (req.method === "HEAD") return json(res, 200, undefined);
    return json(res, 200, rows);
  }
  if (url.pathname === "/fixture/pos-effects") {
    const result = psqlQuery(
      `select json_build_object('orders',(select count(*) from public.orders where source='pos'),'payments',(select count(*) from public.order_payments),'movements',(select count(*) from public.stock_movements where type='sale'),'stock',(select stock_qty from public.product_variants where id='00000000-0000-4000-8000-000000009932'),'intents',(select count(*) from public.commerce_intents),'customer',(select customer_name from public.orders order by created_at desc limit 1),'outbox',(select count(*) from public.commerce_outbox));`,
    );
    return json(res, result.error ? 500 : 200, result.error || result.data);
  }
  if (url.pathname === "/fixture/health")
    return json(res, 200, { ok: true, id: randomUUID() });
  return json(res, 404, { message: "Not found" });
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`commerce fixture ready ${port}\n`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
