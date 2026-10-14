"""Multi-session POS checks for the disposable PostgreSQL verifier only.

Call verify_pos_concurrency(sql, run) after all migrations. `sql` must be the
local verifier's psql argv; this module never resolves environment credentials.
"""
import concurrent.futures
import json
import threading


def verify_pos_concurrency(sql, run):
    actor = "00000000-0000-0000-0000-000000001601"
    category = "00000000-0000-0000-0000-000000001610"
    product = "00000000-0000-0000-0000-000000001611"
    variant = "00000000-0000-0000-0000-000000001612"
    run(sql, input=f"""
      insert into auth.users(id,raw_user_meta_data) values('{actor}','{{"full_name":"Disposable concurrency CEO"}}');
      update public.user_roles set role='ceo' where user_id='{actor}';
      insert into public.categories(id,slug,name_he,name_en) values('{category}','pos-concurrency','בדיקת מקביליות','Concurrency fixture');
      insert into public.products(id,category_id,slug,name_he,name_en,price,tracking_mode) values('{product}','{category}','pos-concurrency','בדיקת מקביליות','Concurrency fixture',100,'serial');
      update public.products set status='active' where id='{product}';
      insert into public.product_variants(id,product_id,sku,is_default,is_active,stock_qty) values('{variant}','{product}','POS-CONCURRENCY',true,true,10);
    """)

    def actor_query(query):
        output = run(sql + ["-X", "-qAt"], input=f"""
          begin;
          set local statement_timeout='10s';
          set local role authenticated;
          set local "request.jwt.claim.sub"='{actor}';
          set local "request.jwt.claim.role"='authenticated';
          {query};
          commit;
        """)
        return json.loads(output.strip())

    def parallel(tasks):
        barrier = threading.Barrier(len(tasks))

        def execute(task):
            barrier.wait(timeout=10)
            return task()

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            return list(pool.map(execute, tasks))

    def quote(key, quantity):
        payload = json.dumps({"channel": "pos", "idempotency_key": key,
                              "customer_snapshot": {"name": "Fictional concurrency buyer"},
                              "items": [{"variant_id": variant, "quantity": quantity}]})
        return actor_query(f"select public.commerce_create_intent('{payload}'::jsonb)")

    try:
        replies = parallel([lambda: quote("concurrent-identical-intent", 2)] * 8)
        intent = replies[0]["intent"]["id"]
        assert len({reply["intent"]["id"] for reply in replies}) == 1, "Concurrent retry created multiple intents"
        assert sum(not reply["replayed"] for reply in replies) == 1, "Concurrent retry did not have one creator"
        print("PASS concurrency 8 same-key intent requests return one reservation")

        def compete(index):
            try:
                return quote(f"concurrent-stock-{index}", 6)
            except RuntimeError as error:
                if "Insufficient available stock" not in str(error):
                    raise
                return None

        allocations = parallel([lambda index=index: compete(index) for index in range(4)])
        assert sum(reply is not None for reply in allocations) == 1, "Concurrent reservations oversold stock"
        print("PASS concurrency competing reservations preserve available stock")

        tender = json.dumps({"intent_id": intent, "method": "bank_transfer",
                             "collection_kind": "manual_recorded", "amount_agorot": 20000,
                             "confirmed_received": True, "reference": "FICTIONAL-CONCURRENT",
                             "idempotency_key": "concurrent-final-tender"})
        replies = parallel([lambda: actor_query(f"select public.commerce_start_attempt('{tender}'::jsonb)")] * 8)
        assert len({reply["attempt"]["id"] for reply in replies}) == 1, "Concurrent tender replay duplicated money"
        assert sum(not reply["replayed"] for reply in replies) == 1, "Concurrent tender did not have one creator"
        actual = json.loads(run(sql + ["-X", "-qAt"], input=f"""
          select jsonb_build_object('orders',(select count(*) from public.orders where commerce_intent_id='{intent}'),
            'payments',(select count(*) from public.order_payments op join public.orders o on o.id=op.order_id where o.commerce_intent_id='{intent}'),
            'stock',(select stock_qty from public.product_variants where id='{variant}'),
            'movements',(select count(*) from public.stock_movements sm join public.orders o on o.order_number=sm.reference where o.commerce_intent_id='{intent}'));
        """))
        assert actual == {"orders": 1, "payments": 1, "stock": 8, "movements": 1}, actual
        print("PASS concurrency 8 final-tender retries create one order, payment and stock movement")

        customer = json.dumps({"name": "Fictional legacy buyer"})
        items = json.dumps([{"variant_id": variant, "quantity": 1, "unit_price": 100}])
        payments = json.dumps([{"method": "bank_transfer", "amount": 100}])
        legacy_query = f"select public.record_pos_sale('{customer}'::jsonb,'{items}'::jsonb,'{payments}'::jsonb,'concurrent-legacy-sale')"
        replies = parallel([lambda: actor_query(legacy_query)] * 8)
        assert len({reply["order_id"] for reply in replies}) == 1, "Concurrent legacy retry duplicated orders"
        assert sum(not reply["replayed"] for reply in replies) == 1, "Concurrent legacy did not have one creator"
        stock = int(run(sql + ["-X", "-qAt"], input=f"select stock_qty from public.product_variants where id='{variant}';").strip())
        assert stock == 7, stock
        print("PASS concurrency 8 legacy sale retries consume only one unreserved unit")
    finally:
        # These fixtures are committed only to the disposable local cluster so
        # independent sessions can see them. Remove them before rollback suites.
        run(sql, input=f"""
          delete from public.commerce_outbox where aggregate_id in(select id from public.orders where recorded_by='{actor}');
          delete from public.stock_movements where variant_id='{variant}';
          delete from public.payment_attempts where intent_id in(select id from public.commerce_intents where actor_id='{actor}');
          delete from public.stock_reservations where intent_id in(select id from public.commerce_intents where actor_id='{actor}');
          delete from public.commerce_intent_items where intent_id in(select id from public.commerce_intents where actor_id='{actor}');
          delete from public.order_payments where order_id in(select id from public.orders where recorded_by='{actor}');
          delete from public.order_items where order_id in(select id from public.orders where recorded_by='{actor}');
          delete from public.orders where recorded_by='{actor}';
          delete from public.commerce_intents where actor_id='{actor}';
          delete from public.audit_events where user_id='{actor}';
          delete from public.product_variants where product_id='{product}';
          delete from public.products where id='{product}';
          delete from public.categories where id='{category}';
          delete from auth.users where id='{actor}';
        """)
