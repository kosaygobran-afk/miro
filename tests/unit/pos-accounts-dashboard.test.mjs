import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { z } from "zod";

async function moduleAt(file, imports = {}, globals = {}) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Date,
      Intl,
      URL,
      URLSearchParams,
      AbortController,
      require(name) {
        assert.ok(name in imports, `Unexpected import: ${name}`);
        return imports[name];
      },
      ...globals,
    },
  );
  return exports;
}

const audit = await moduleAt("../../src/lib/management-audit.ts", {
  zod: { z },
});
const reporting = await moduleAt("../../src/lib/management-reporting.ts", {
  "./management-audit": audit,
});
const copy = await moduleAt(
  "../../src/components/management/accounts/accounts-copy.ts",
);
const actorId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const emptyReport = {
  range: {
    from: "2026-10-10T21:00:00.000Z",
    to: "2026-10-17T20:59:59.999Z",
    generatedAt: "2026-10-17T10:00:00Z",
  },
  summary: {
    revenue: 0,
    transaction_count: 0,
    units_sold: 0,
    avg_ticket: 0,
    by_method: {},
  },
  orders: [],
  total_count: 0,
};
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !node.props) return [];
  return [
    node,
    ...elements(node.props.children),
    ...elements(node.props.actions),
  ];
}
const textOf = (node) =>
  Array.isArray(node)
    ? node.map(textOf).join("")
    : typeof node === "string" || typeof node === "number"
      ? String(node)
      : node?.props
        ? textOf(node.props.children)
        : "";

async function dashboard({
  data = emptyReport,
  fetch = async () => {
    throw new Error("Unexpected request");
  },
} = {}) {
  const states = [];
  const effects = [];
  const ref = { current: null };
  let index = 0;
  let url;
  const component = () => null;
  function DateRangePicker() {}
  const imports = {
    react: {
      useState(initial) {
        const slot = index++;
        if (!(slot in states))
          states[slot] = typeof initial === "function" ? initial() : initial;
        return [
          states[slot],
          (value) => {
            states[slot] =
              typeof value === "function" ? value(states[slot]) : value;
          },
        ];
      },
      useRef: () => ref,
      useEffect: (callback) => {
        if (effects.length < 2) effects.push(callback);
      },
    },
    "react/jsx-runtime": jsx,
    "./accounts-copy": copy,
    "@/lib/management-reporting": reporting,
    "lucide-react": Object.fromEntries(
      [
        "ArrowUpRight",
        "Banknote",
        "Package",
        "RefreshCw",
        "ShoppingBag",
        "TrendingUp",
      ].map((name) => [name, component]),
    ),
    "@/components/management/ui/date-range-picker": {
      DateRangePicker,
      dateRangeLabels: () => ({}),
      resolveDateRange: () => ({ from: "2026-10-11", to: "2026-10-17" }),
    },
    "@/components/management/ui/use-management-report": {
      useManagementReport(value) {
        url = value;
        return { data, error: "", loading: false, reload() {} };
      },
    },
    "@/components/management/ui/reporting-workspace": {
      ReportingHeader: component,
      reportingStyles: {},
    },
  };
  for (const [file, name] of [
    ["skeleton", "DashboardSkeleton"],
    ["data-table", "DataTable"],
    ["empty-state", "EmptyState"],
    ["error-state", "ErrorState"],
    ["metric-card", "MetricCard"],
    ["overflow-text", "OverflowText"],
    ["drawer", "Drawer"],
  ])
    imports[`@/components/management/ui/${file}`] = { [name]: component };
  const { AccountsDashboard } = await moduleAt(
    "../../src/components/management/accounts/accounts-dashboard.tsx",
    imports,
    { fetch },
  );
  const fixture = {
    effects,
    render(locale = "en") {
      index = 0;
      fixture.tree = AccountsDashboard({ locale });
      return fixture.tree;
    },
    find(predicate) {
      const result = elements(fixture.tree).find(predicate);
      assert.ok(result, "UI control exists");
      return result;
    },
    control(id) {
      return fixture.find((node) => node.props.id === id);
    },
    get url() {
      return url;
    },
    DateRangePicker,
  };
  fixture.render();
  return fixture;
}

async function accountsApi() {
  const calls = [];
  const { GET } = await moduleAt(
    "../../src/app/api/management/accounts/route.ts",
    {
      zod: { z },
      "next/server": {
        NextResponse: {
          json: (body, options = {}) => ({ body, status: 200, ...options }),
        },
      },
      "@/app/api/management/_shared": {
        withManagementAuth: async () => ({ ok: true, admin: {} }),
        checkManagementRateLimit: async () => "ok",
        getClientIp: () => "fixture",
        errorResponse: (error, status) => ({ body: { error }, status }),
      },
      "@/lib/supabase/server": {
        createServerSupabaseClient: async () => ({
          rpc(name, args) {
            calls.push({ name, args });
            return { single: async () => ({ data: emptyReport, error: null }) };
          },
        }),
      },
    },
  );
  return { GET, calls };
}

test("the actual POS accounts dashboard emits API-valid default, all-time and payment/cashier filters in both locales", async () => {
  for (const locale of ["en", "he"]) {
    const ui = await dashboard();
    ui.render(locale);
    const api = await accountsApi();
    assert.equal(
      (await api.GET(new Request(`https://miro.example${ui.url}`))).status,
      200,
    );
    assert.equal(api.calls[0].args.p_from, "2026-10-10T21:00:00.000Z");
    assert.equal(api.calls[0].args.p_to, "2026-10-17T20:59:59.999Z");
    const query = new URL(ui.url, "https://miro.example").searchParams;
    for (const key of ["method", "payment-status", "cashier", "search"])
      assert.equal(query.has(key), false);
    ui.control("accounts-payment-method").props.onChange({
      target: { value: "cash" },
    });
    ui.control("accounts-payment-status").props.onChange({
      target: { value: "voided" },
    });
    ui.control("accounts-cashier").props.onChange({
      target: { value: actorId },
    });
    ui.control("accounts-search").props.onChange({
      target: { value: "  receipt-1  " },
    });
    ui.render(locale);
    assert.equal(
      (await api.GET(new Request(`https://miro.example${ui.url}`))).status,
      200,
    );
    assert.equal(api.calls[1].args.p_method, "cash");
    assert.equal(api.calls[1].args.p_status, "voided");
    assert.equal(api.calls[1].args.p_cashier, actorId);
    assert.equal(api.calls[1].args.p_search, "receipt-1");
    ui.find((node) => node.type === ui.DateRangePicker).props.onChange({
      preset: "all",
      from: "",
      to: "",
    });
    ui.render(locale);
    assert.equal(
      (await api.GET(new Request(`https://miro.example${ui.url}`))).status,
      200,
    );
    assert.equal(api.calls[2].args.p_from, "1970-01-01T00:00:00.000Z");
  }
});

test("POS accounts pagination uses server totals and resets on range changes; empty reports show 0-0", async () => {
  const order = {
    order_id: orderId,
    order_number: "QA-1",
    created_at: "2026-10-17T10:00:00Z",
    payments: [],
  };
  const ui = await dashboard({
    data: { ...emptyReport, orders: [order], total_count: 60 },
  });
  const next = ui.find(
    (node) => node.type === "button" && textOf(node) === "Next",
  );
  assert.equal(next.props.disabled, false);
  next.props.onClick();
  ui.render();
  assert.equal(
    new URL(ui.url, "https://miro.example").searchParams.get("offset"),
    "25",
  );
  ui.find((node) => node.type === ui.DateRangePicker).props.onChange({
    preset: "all",
    from: "",
    to: "",
  });
  ui.render();
  assert.equal(
    new URL(ui.url, "https://miro.example").searchParams.get("offset"),
    "0",
  );
  const empty = await dashboard();
  assert.match(textOf(empty.tree), /Showing 0-0 of 0/);
});

test("POS receipt details consume the nested API projection and cancel requests when closed", async () => {
  const order = {
    order_id: orderId,
    order_number: "QA-RECEIPT",
    created_at: "2026-10-17T10:00:00Z",
    payments: [],
  };
  let pending;
  let signal;
  const ui = await dashboard({
    data: { ...emptyReport, orders: [order], total_count: 1 },
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
  });
  const open = () =>
    ui
      .find(
        (node) => node.type === "button" && textOf(node).includes("Details"),
      )
      .props.onClick();
  open();
  pending(
    Response.json({
      order,
      order_items: [],
      order_payments: [],
      stock_movements: [],
    }),
  );
  await new Promise(setImmediate);
  ui.render();
  assert.ok(elements(ui.tree).some((node) => node.props.text === "QA-RECEIPT"));
  open();
  ui.render();
  ui.find(
    (node) => "open" in node.props && "onClose" in node.props,
  ).props.onClose();
  assert.equal(signal.aborted, true);
  pending(
    Response.json({
      order,
      order_items: [],
      order_payments: [],
      stock_movements: [],
    }),
  );
  await new Promise(setImmediate);
  ui.render();
  assert.equal(
    ui.find((node) => "open" in node.props && "onClose" in node.props).props
      .open,
    false,
  );
});

test("cashier names resolve to bounded paginated staff options without blocking the account report", async () => {
  const requests = [];
  const ui = await dashboard({
    fetch: async (url) => {
      requests.push(url);
      const params = new URL(url, "https://miro.example").searchParams;
      assert.equal(params.get("limit"), "100");
      const page =
        params.get("role") === "admin" && params.get("offset") === "0"
          ? Array.from({ length: 100 }, (_, i) => ({
              id: `fixture-${i}`,
              full_name: `Staff ${i}`,
            }))
          : [{ id: actorId, full_name: "Cashier QA" }];
      return Response.json({
        users: page,
        totalCount: params.get("role") === "admin" ? 101 : 1,
      });
    },
  });
  const cleanup = ui.effects[1]();
  await new Promise(setImmediate);
  ui.render();
  assert.equal(requests.length, 3);
  assert.ok(
    elements(ui.control("accounts-cashier")).some(
      (node) => node.type === "option" && node.props.value === actorId,
    ),
  );
  assert.match(textOf(ui.tree), /Showing 0-0 of 0/);
  cleanup();
});
