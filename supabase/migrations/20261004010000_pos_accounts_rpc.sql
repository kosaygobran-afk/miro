-- POS accounts RPCs for management console
-- 1. management_pos_accounts - paginated list of POS orders with filters and summary
-- 2. management_pos_account_detail - detailed view of a single POS order

-- ============================================================
-- 1. management_pos_accounts
-- ============================================================
drop function if exists public.management_pos_accounts(
  timestamptz, timestamptz, text, text, uuid, text, int, int
);

create or replace function public.management_pos_accounts(
  p_from timestamptz,
  p_to timestamptz,
  p_method text default null,
  p_status text default null,
  p_cashier uuid default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_caller_user_id uuid;
  v_pos_sources text[] := array['pos', 'management'];
  v_order_query text;
  v_count_query text;
  v_result jsonb;
  v_orders jsonb;
  v_total_count integer;
  v_summary jsonb;
begin
  -- Capture caller before any SECURITY DEFINER context shifts
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Validate date range
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid range' using errcode = '22023';
  end if;

  -- Build dynamic query for orders
  v_order_query := format($sql$
    select
      o.id as order_id,
      o.order_number,
      o.created_at,
      o.status,
      o.source,
      o.customer_name,
      o.customer_email,
      o.recorded_by,
      (
        select jsonb_agg(jsonb_build_object(
          'payment_method', op.payment_method,
          'amount', op.amount,
          'installments', op.installments,
          'payment_status', op.payment_status,
          'external_reference', op.external_reference,
          'paid_at', op.paid_at
        ))
        from public.order_payments op
        where op.order_id = o.id
      ) as payments,
      (
        select count(*) from public.order_items oi where oi.order_id = o.id
      ) as items_count,
      (
        select coalesce(sum(quantity), 0) from public.order_items oi where oi.order_id = o.id
      ) as units_count,
      o.subtotal as subtotal_net,
      coalesce(
        (select sum(oi.discount_amount) from public.order_items oi where oi.order_id = o.id), 0
      ) as discount,
      o.net_total,
      o.vat_total,
      o.total,
      p.display_name as recorded_by_name
    from public.orders o
    left join public.profiles p on p.id = o.recorded_by
    where o.created_at >= %L
      and o.created_at <= %L
      and o.status not in ('cancelled','refunded')
      and o.source = any(%L)
  $sql$, p_from, p_to, v_pos_sources);

  -- Apply method filter (join order_payments)
  if p_method is not null and p_method <> '' then
    v_order_query := v_order_query || format(
      $sql$ and exists (select 1 from public.order_payments op2 where op2.order_id = o.id and op2.payment_method = %L) $sql$,
      p_method
    );
  end if;

  -- Apply payment status filter
  if p_status is not null and p_status <> '' then
    v_order_query := v_order_query || format(
      $sql$ and exists (select 1 from public.order_payments op3 where op3.order_id = o.id and op3.payment_status = %L) $sql$,
      p_status
    );
  end if;

  -- Apply cashier filter
  if p_cashier is not null then
    v_order_query := v_order_query || format(
      $sql$ and o.recorded_by = %L $sql$,
      p_cashier
    );
  end if;

  -- Apply general search (customer name, email, order number)
  if p_search is not null and p_search <> '' then
    v_order_query := v_order_query || format(
      $sql$ and (
        o.customer_name ilike %L
        or o.customer_email ilike %L
        or o.order_number ilike %L
      ) $sql$,
      '%' || p_search || '%',
      '%' || p_search || '%',
      '%' || p_search || '%'
    );
  end if;

  -- Order by created_at desc, apply pagination
  v_order_query := v_order_query || format(
    $sql$ order by o.created_at desc limit %s offset %s $sql$,
    p_limit, p_offset
  );

  -- Execute order query
  execute v_order_query into v_orders;

  -- Build count query
  v_count_query := format($sql$
    select count(*)
    from public.orders o
    where o.created_at >= %L
      and o.created_at <= %L
      and o.status not in ('cancelled','refunded')
      and o.source = any(%L)
  $sql$, p_from, p_to, v_pos_sources);

  if p_method is not null and p_method <> '' then
    v_count_query := v_count_query || format(
      $sql$ and exists (select 1 from public.order_payments op2 where op2.order_id = o.id and op2.payment_method = %L) $sql$,
      p_method
    );
  end if;

  if p_status is not null and p_status <> '' then
    v_count_query := v_count_query || format(
      $sql$ and exists (select 1 from public.order_payments op3 where op3.order_id = o.id and op3.payment_status = %L) $sql$,
      p_status
    );
  end if;

  if p_cashier is not null then
    v_count_query := v_count_query || format($sql$ and o.recorded_by = %L $sql$, p_cashier);
  end if;

  if p_search is not null and p_search <> '' then
    v_count_query := v_count_query || format(
      $sql$ and (
        o.customer_name ilike %L
        or o.customer_email ilike %L
        or o.order_number ilike %L
      ) $sql$,
      '%' || p_search || '%',
      '%' || p_search || '%',
      '%' || p_search || '%'
    );
  end if;

  execute v_count_query into v_total_count;

  -- Build summary
  -- We need to calculate summary over the filtered set (not paginated)
  execute format($sql$
    select jsonb_build_object(
      'transaction_count', count(*),
      'revenue', round(coalesce(sum(total), 0), 2),
      'units_sold', coalesce((
        select sum(oi.quantity)
        from public.order_items oi
        join public.orders o2 on o2.id = oi.order_id
        where o2.created_at >= %L
          and o2.created_at <= %L
          and o2.status not in ('cancelled','refunded')
          and o2.source = any(%L)
      ), 0),
      'avg_ticket', case when count(*) > 0
        then round(sum(total)::numeric / count(*), 2)
        else 0
      end,
      'by_method', coalesce((
        select jsonb_object_agg(payment_method, round(sum(amount), 2))
        from public.order_payments op
        join public.orders o3 on o3.id = op.order_id
        where o3.created_at >= %L
          and o3.created_at <= %L
          and o3.status not in ('cancelled','refunded')
          and o3.source = any(%L)
        group by op.payment_method
      ), '{}'::jsonb)
    ) $sql$, p_from, p_to, v_pos_sources, p_from, p_to, v_pos_sources) into v_summary;

  -- Build final result
  v_result := jsonb_build_object(
    'orders', coalesce(v_orders, '[]'::jsonb),
    'summary', v_summary,
    'total_count', v_total_count
  );

  return v_result;
end;
$$;

revoke all on function public.management_pos_accounts(timestamptz,timestamptz,text,text,uuid,text,int,int) from public;
revoke all on function public.management_pos_accounts(timestamptz,timestamptz,text,text,uuid,text,int,int) from anon, authenticated;
grant execute on function public.management_pos_accounts(timestamptz,timestamptz,text,text,uuid,text,int,int) to authenticated;

comment on function public.management_pos_accounts is
'Admin/CEO. Paginated list of POS orders (source pos/management) with filters and summary.
p_from/p_to: date range. p_method: payment method filter. p_status: payment status filter.
p_cashier: recorded_by user_id filter. p_search: text search on customer name/email/order_number.
p_limit/p_offset: pagination. Returns {orders:[], summary:{transaction_count,revenue,units_sold,avg_ticket,by_method}, total_count}.';

-- ============================================================
-- 2. management_pos_account_detail
-- ============================================================
drop function if exists public.management_pos_account_detail(uuid);

create or replace function public.management_pos_account_detail(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_caller_user_id uuid;
  v_order record;
  v_items jsonb;
  v_payments jsonb;
  v_stock_movements jsonb;
  v_recorder_name text;
  v_customer_name text;
begin
  -- Capture caller before any SECURITY DEFINER context shifts
  v_caller_user_id := auth.uid();

  -- Authorization: admin/ceo only
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin','ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Fetch order
  select * into v_order
  from public.orders
  where id = p_order_id
    and source in ('pos', 'management')
  limit 1;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Fetch recorder display name
  select coalesce(p.display_name, p.full_name) into v_recorder_name
  from public.profiles p
  where p.id = v_order.recorded_by;

  -- Fetch order items
  select jsonb_agg(to_jsonb(oi))
  into v_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  -- Fetch payments
  select jsonb_agg(to_jsonb(op))
  into v_payments
  from public.order_payments op
  where op.order_id = v_order.id;

  -- Fetch stock movements for this order
  select jsonb_agg(to_jsonb(sm))
  into v_stock_movements
  from public.stock_movements sm
  where sm.reference = v_order.order_number
    and sm.type = 'sale';

  -- Build result
  return jsonb_build_object(
    'order', jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'currency', v_order.currency,
      'customer_name', v_order.customer_name,
      'customer_email', v_order.customer_email,
      'customer_phone', v_order.customer_phone,
      'user_id', v_order.user_id,
      'recorded_by', v_order.recorded_by,
      'recorded_by_name', v_recorder_name,
      'source', v_order.source,
      'subtotal', v_order.subtotal,
      'vat_total', v_order.vat_total,
      'total', v_order.total,
      'net_total', v_order.net_total,
      'shipping_cost', v_order.shipping_cost,
      'notes', v_order.notes,
      'created_at', v_order.created_at,
      'updated_at', v_order.updated_at
    ),
    'order_items', coalesce(v_items, '[]'::jsonb),
    'order_payments', coalesce(v_payments, '[]'::jsonb),
    'stock_movements', coalesce(v_stock_movements, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.management_pos_account_detail(uuid) from public;
revoke all on function public.management_pos_account_detail(uuid) from anon, authenticated;
grant execute on function public.management_pos_account_detail(uuid) to authenticated;

comment on function public.management_pos_account_detail is
'Admin/CEO. Returns detailed POS order data including items, payments, and stock movements.
Returns {order:{...}, order_items:[...], order_payments:[...], stock_movements:[...]}.
Raises P0002 if order not found or not a POS/management order.';