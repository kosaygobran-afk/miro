import { NextResponse } from "next/server";
import { withManagementAuth } from "@/app/api/management/_shared";

function rangeFrom(request: Request): { from: string; to: string } {
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? new Date().toISOString();
  const fromParam = url.searchParams.get("from");
  const from =
    fromParam ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;
  const { admin } = auth;
  const { from, to } = rangeFrom(request);

  const [
    { data: orders, error: ordersError },
    { data: items, error: itemsError },
    { data: variants, error: variantsError },
    { data: products, error: productsError },
  ] = await Promise.all([
    admin
      .from("orders")
      .select("id, status, subtotal, vat_total, total, net_total, created_at")
      .gte("created_at", from)
      .lte("created_at", to),
    admin
      .from("order_items")
      .select(
        "order_id, quantity, unit_cost, net_amount, vat_amount, discount_amount",
      )
      .gte("created_at", from)
      .lte("created_at", to),
    admin
      .from("product_variants")
      .select("id, product_id, stock_qty, cost_override")
      .eq("is_active", true),
    admin.from("products").select("id, name_he, name_en, purchase_cost"),
  ]);

  if (ordersError || itemsError || variantsError || productsError) {
    return NextResponse.json(
      {
        error:
          ordersError?.message ??
          itemsError?.message ??
          variantsError?.message ??
          productsError?.message,
      },
      { status: 500 },
    );
  }

  const completed = (orders ?? []).filter(
    (o) => o.status !== "cancelled" && o.status !== "refunded",
  );
  const revenueGross = completed.reduce(
    (sum, o) => sum + Number(o.total ?? 0),
    0,
  );
  const revenueNet = completed.reduce(
    (sum, o) => sum + Number(o.net_total ?? o.subtotal ?? 0),
    0,
  );
  const vatTotal = completed.reduce(
    (sum, o) => sum + Number(o.vat_total ?? 0),
    0,
  );
  const itemByOrder = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const list = itemByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemByOrder.set(item.order_id, list);
  }
  const completedIds = new Set(completed.map((o) => o.id));
  const soldItems = (items ?? []).filter((item) =>
    completedIds.has(item.order_id),
  );
  const cogs = soldItems.reduce(
    (sum, item) => sum + Number(item.unit_cost ?? 0) * item.quantity,
    0,
  );
  const discounts = soldItems.reduce(
    (sum, item) => sum + Number(item.discount_amount ?? 0),
    0,
  );
  const unitsSold = soldItems.reduce((sum, item) => sum + item.quantity, 0);
  const grossProfit = revenueNet - cogs;
  const margin = revenueNet > 0 ? grossProfit / revenueNet : 0;

  const productCost = new Map(
    (products ?? []).map((p) => [p.id, Number(p.purchase_cost ?? 0)]),
  );
  const inventoryValue = (variants ?? []).reduce(
    (sum, v) =>
      sum +
      v.stock_qty * (v.cost_override ?? productCost.get(v.product_id) ?? 0),
    0,
  );
  const inventoryUnits = (variants ?? []).reduce(
    (sum, v) => sum + v.stock_qty,
    0,
  );

  const daily = new Map<
    string,
    { gross: number; net: number; orders: number }
  >();
  for (const order of completed) {
    const day = order.created_at.slice(0, 10);
    const entry = daily.get(day) ?? { gross: 0, net: 0, orders: 0 };
    entry.gross += Number(order.total ?? 0);
    entry.net += Number(order.net_total ?? order.subtotal ?? 0);
    entry.orders += 1;
    daily.set(day, entry);
  }

  return NextResponse.json({
    range: { from, to },
    totals: {
      revenueGross,
      revenueNet,
      vatTotal,
      cogs,
      grossProfit,
      margin,
      discounts,
      unitsSold,
      orderCount: completed.length,
      inventoryValue,
      inventoryUnits,
    },
    dailySeries: [...daily.entries()].map(([day, v]) => ({ day, ...v })),
  });
}
