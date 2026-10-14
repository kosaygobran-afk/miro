-- Fix management_pos_accounts RPC: proper JSON aggregation and filter-consistent summary
-- This migration fixes the dynamic SQL issues and ensures summary applies same filters as list.

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
  v_orders jsonb;
  v_total_count integer;
  v_summary jsonb;
  v_result jsonb;
  v_where_clauses text := '';
  v_filter_params text[] := '';
  v_param_idx int := 4; -- $1=p_from, $2=p_to, $3=v_pos_sources
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

  -- Build WHERE clauses for filters (shared between list and count/summary)
  v_where_clauses := 'o.created_at >= $1 and o.created_at <= $2 and o.status not in (''cancelled'',''refunded'') and o.source = any($3)';

  -- Apply method filter (join order_payments)
  if p_method is not null and p_method <> '' then
    v_param_idx := v_param_idx + 1;
    v_where_clauses := v_where_clauses || ' and exists (select 1 from public.order_payments op2 where op2.order_id = o.id and op2.payment_method = $' || v_param_idx || ')';
    v_filter_params := v_filter_params || p_method;
  end if;

  -- Apply payment status filter
  if p_status is not null and p_status <> '' then
    v_param_idx := v_param_idx + 1;
    v_where_clauses := v_where_clauses || ' and exists (select 1 from public.order_payments op3 where op3.order_id = o.id and op3.payment_status = $' || v_param_idx || ')';
    v_filter_params := v_filter_params || p_status;
  end if;

  -- Apply cashier filter
  if p_cashier is not null then
    v_param_idx := v_param_idx + 1;
    v_where_clauses := v_where_clauses || ' and o.recorded_by = $' || v_param_idx;
    v_filter_params := v_filter_params || p_cashier;
  end if;

  -- Apply general search (customer name, email, order number)
  if p_search is not null and p_search <> '' then
    v_param_idx := v_param_idx + 1;
    v_where_clauses := v_where_clauses || ' and (o.customer_name ilike $' || v_param_idx || ' or o.customer_email ilike $' || v_param_idx || ' or o.order_number ilike $' || v_param_idx || ')';
    v_filter_params := v_filter_params || ('%' || p_search || '%');
  end if;

  -- Execute orders query with proper JSON aggregation
  execute format($sql$
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    from (
      select
        o.id as order_id,
        o.order_number,
        o.created_at,
        o.status,
        o.source,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        o.recorded_by,
        (
          select jsonb_agg(jsonb_build_object(
            'payment_method', op.payment_method,
            'amount', op.amount,
            'installments', op.installments,
            'payment_status', op.payment_status,
            'external_reference', op.external_reference,
            'paid_at', op.paid_at
          ) order by op.created_at)
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
      where %s
      order by o.created_at desc
      limit %s offset %s
    ) t
  $sql$, v_where_clauses, p_limit, p_offset)
  into v_orders
  using p_from, p_to, v_pos_sources, v_filter_params;

  -- Count query with same filters
  execute format($sql$
    select count(*)
    from public.orders o
    where %s
  $sql$, v_where_clauses)
  into v_total_count
  using p_from, p_to, v_pos_sources, v_filter_params;

  -- Summary query with SAME filters as list (not just date/source)
  execute format($sql$
    select jsonb_build_object(
      'transaction_count', count(*),
      'revenue', round(coalesce(sum(o.total), 0), 2),
      'units_sold', coalesce((
        select sum(oi.quantity)
        from public.order_items oi
        where oi.order_id = o.id
      ), 0),
      'avg_ticket', case when count(*) > 0
        then round(sum(o.total)::numeric / count(*), 2)
        else 0
      end,
      'by_method', coalesce((
        select jsonb_object_agg(op.payment_method, round(sum(op.amount), 2))
        from public.order_payments op
        where op.order_id = o.id
        group by op.payment_method
      ), '{}'::jsonb)
    )
    from public.orders o
    where %s
  $sql$, v_where_clauses)
  into v_summary
  using p_from, p_to, v_pos_sources, v_filter_params;

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
p_limit/p_offset: pagination. Returns {orders:[], summary:{transaction_count,revenue,units_sold,avg_ticket,by_method}, total_count}.
Summary applies the SAME filters as the list query.';