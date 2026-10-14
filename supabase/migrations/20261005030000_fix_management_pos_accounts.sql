-- Replace the dynamic POS reporting query with a parameter-safe, filter-consistent projection.
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
  v_pos_sources text[] := array['pos', 'management'];
  v_orders jsonb;
  v_total_count integer;
  v_summary jsonb;
  v_limit integer := greatest(1, least(500, coalesce(p_limit, 50)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_method text := nullif(btrim(p_method), '');
  v_status text := nullif(btrim(p_status), '');
  v_search text := nullif(btrim(p_search), '');
begin
  v_actor_role := public.active_app_role();
  if v_actor_role is null or v_actor_role not in ('admin', 'ceo') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid range' using errcode = '22023';
  end if;

  with filtered as materialized (
    select
      o.*,
      p.display_name as recorded_by_name
    from public.orders o
    left join public.profiles p on p.id = o.recorded_by
    where o.created_at >= p_from
      and o.created_at <= p_to
      and o.status not in ('cancelled', 'refunded')
      and o.source = any(v_pos_sources)
      and (
        v_method is null
        or exists (
          select 1
          from public.order_payments op
          where op.order_id = o.id and op.payment_method = v_method
        )
      )
      and (
        v_status is null
        or exists (
          select 1
          from public.order_payments op
          where op.order_id = o.id and op.payment_status = v_status
        )
      )
      and (p_cashier is null or o.recorded_by = p_cashier)
      and (
        v_search is null
        or o.customer_name ilike '%' || v_search || '%'
        or o.customer_email ilike '%' || v_search || '%'
        or o.order_number ilike '%' || v_search || '%'
      )
  ), page as (
    select *
    from filtered
    order by created_at desc, id desc
    limit v_limit offset v_offset
  ), summary as (
    select jsonb_build_object(
      'transaction_count', count(*),
      'revenue', round(coalesce(sum(f.total), 0), 2),
      'units_sold', coalesce((
        select sum(oi.quantity)
        from public.order_items oi
        join filtered fo on fo.id = oi.order_id
      ), 0),
      'avg_ticket', case
        when count(*) > 0 then round(sum(f.total)::numeric / count(*), 2)
        else 0
      end,
      'by_method', coalesce((
        select jsonb_object_agg(method_totals.payment_method, method_totals.amount)
        from (
          select op.payment_method, round(sum(op.amount), 2) as amount
          from public.order_payments op
          join filtered fo on fo.id = op.order_id
          group by op.payment_method
        ) method_totals
      ), '{}'::jsonb)
    ) as value
    from filtered f
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'order_id', page.id,
          'order_number', page.order_number,
          'created_at', page.created_at,
          'status', page.status,
          'source', page.source,
          'customer_name', page.customer_name,
          'customer_email', page.customer_email,
          'customer_phone', page.customer_phone,
          'user_id', page.user_id,
          'recorded_by', page.recorded_by,
          'recorded_by_name', page.recorded_by_name,
          'items_count', (
            select count(*) from public.order_items oi where oi.order_id = page.id
          ),
          'units_count', (
            select coalesce(sum(oi.quantity), 0)
            from public.order_items oi where oi.order_id = page.id
          ),
          'subtotal_net', page.subtotal,
          'discount', coalesce((
            select sum(oi.discount_amount)
            from public.order_items oi where oi.order_id = page.id
          ), 0),
          'net_total', page.net_total,
          'vat_total', page.vat_total,
          'total', page.total,
          'payments', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'payment_method', op.payment_method,
                'amount', op.amount,
                'installments', op.installments,
                'payment_status', op.payment_status,
                'external_reference', op.external_reference,
                'paid_at', op.paid_at
              ) order by op.created_at
            )
            from public.order_payments op where op.order_id = page.id
          ), '[]'::jsonb)
        ) order by page.created_at desc, page.id desc
      )
      from page
    ), '[]'::jsonb),
    (select count(*) from filtered),
    (select summary.value from summary)
  into v_orders, v_total_count, v_summary;

  return jsonb_build_object(
    'orders', v_orders,
    'summary', v_summary,
    'total_count', v_total_count
  );
end;
$$;

revoke all on function public.management_pos_accounts(
  timestamptz, timestamptz, text, text, uuid, text, int, int
) from public, anon;
grant execute on function public.management_pos_accounts(
  timestamptz, timestamptz, text, text, uuid, text, int, int
) to authenticated;

comment on function public.management_pos_accounts is
'Admin/CEO. Paginated POS and legacy management order projection. All filters apply consistently to rows, count and summary. Returns {orders:[], summary:{transaction_count,revenue,units_sold,avg_ticket,by_method}, total_count}.';