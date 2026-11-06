"""Multi-session optional-offer checks for verify-database.py's disposable DB.

Never loads credentials, environment files or a linked connection.
"""
import concurrent.futures
import json
import threading
import time


def verify_optional_offers_concurrency(sql, run):
    admin = "d1100000-0000-4000-8000-000000000001"
    customer = "d1100000-0000-4000-8000-000000000002"
    category = "d1200000-0000-4000-8000-000000000001"
    parent = "d1300000-0000-4000-8000-000000000001"
    target = "d1300000-0000-4000-8000-000000000002"
    parent_variant = "d1400000-0000-4000-8000-000000000001"
    target_variant = "d1400000-0000-4000-8000-000000000002"
    offer = "d1500000-0000-4000-8000-000000000001"
    run(sql, input=f"""
      insert into auth.users(id,raw_user_meta_data) values('{admin}','{{}}'),('{customer}','{{}}');
      update public.user_roles set role='admin' where user_id='{admin}';
      insert into public.categories(id,slug,name_he,name_en) values('{category}','optional-offer-concurrency','בדיקת מקביליות','Optional offer concurrency');
      insert into public.products(id,category_id,slug,name_he,name_en,price,tracking_mode,sales_channel) values
        ('{parent}','{category}','optional-parent-concurrency','אב','Parent',100,'serial','pos_and_online'),
        ('{target}','{category}','optional-target-concurrency','יעד','Target',50,'serial','pos_and_online');
      insert into public.product_variants(id,product_id,sku,barcode,is_default,is_active,stock_qty) values
        ('{parent_variant}','{parent}','OPTIONAL-CONCURRENT-PARENT','OPTIONAL-CONCURRENT-PARENT',true,true,10),
        ('{target_variant}','{target}','OPTIONAL-CONCURRENT-TARGET','OPTIONAL-CONCURRENT-TARGET',true,true,10);
      update public.products set status='active' where id in('{parent}','{target}');
      insert into public.product_optional_offer_sets(parent_product_id,revision) values('{parent}',1);
      insert into public.product_optional_offers(id,parent_product_id,target_product_id,target_variant_id,kind,pricing_mode,discount_bps)
        values('{offer}','{parent}','{target}','{target_variant}','complementary','percent',1000);
    """)

    def query(statement, actor=customer, service=False):
        role = "service_role" if service else "authenticated"
        claims = f"set local request.jwt.claim.sub='{'' if service else actor}';"
        output = run(sql + ["-X", "-qAt"], input=f"""
          begin; set local statement_timeout='15s'; set local role {role};
          set local request.jwt.claim.role='{role}'; {claims}
          {statement}; commit;
        """)
        return json.loads(output.strip())

    def parallel(tasks):
        barrier = threading.Barrier(len(tasks))

        def execute(task):
            barrier.wait(timeout=10)
            return task()

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            return list(pool.map(execute, tasks))

    def quote(key, revision=1):
        payload = json.dumps({"channel": "website", "idempotency_key": key,
                              "customer_snapshot": {"name": "Fictional contextual buyer"},
                              "items": [{"line_id": "parent", "variant_id": parent_variant, "quantity": 2},
                                        {"line_id": "offered", "variant_id": target_variant, "quantity": 2,
                                         "offer_id": offer, "parent_line_id": "parent", "offer_revision": revision},
                                        {"line_id": "standalone", "variant_id": target_variant, "quantity": 1}]})
        return query(f"select public.commerce_create_optional_offers_intent('{payload}'::jsonb)")

    try:
        replies = parallel([lambda: quote("optional-concurrent-identical-001")] * 8)
        intent = replies[0]["intent"]["id"]
        assert len({reply["intent"]["id"] for reply in replies}) == 1
        assert sum(not reply["replayed"] for reply in replies) == 1
        assert all(reply["intent"]["total_agorot"] == 34000 for reply in replies)
        print("PASS optional concurrency 8 same-context retries create one quote and aggregate hold")

        def compete(index):
            try:
                return quote(f"optional-concurrent-stock-{index:03}")
            except RuntimeError as error:
                if "Insufficient available stock" not in str(error):
                    raise
                return None

        allocations = parallel([lambda index=index: compete(index) for index in range(4)])
        assert sum(reply is not None for reply in allocations) == 2
        held = int(run(sql + ["-X", "-qAt"], input=f"select sum(quantity) from public.stock_reservations where variant_id='{target_variant}' and state='active';").strip())
        assert held == 9, held
        print("PASS optional concurrency contextual plus standalone quantities never oversell stock")

        payload = json.dumps({"intent_id": intent, "method": "credit_card", "idempotency_key": "optional-concurrent-attempt-001",
                              "provider": "payplus", "environment": "sandbox", "merchant_ref": "optional-concurrency", "amount_agorot": 34000})
        attempt = query(f"select public.commerce_start_provider_attempt('{payload}'::jsonb,'{customer}',null)", service=True)["attempt"]["id"]
        capture = json.dumps({"verified": True, "verification_source": "server_query", "provider": "payplus", "environment": "sandbox",
                              "merchant_ref": "optional-concurrency", "amount_agorot": 34000, "currency": "ILS", "state": "captured",
                              "transaction_uid": "optional-concurrent-transaction", "transaction_kind": "charge", "safe_metadata": {}})
        parallel([lambda: query(f"select public.commerce_provider_result('{attempt}','optional-concurrent-capture','{capture}'::jsonb)", service=True)] * 8)
        actual = json.loads(run(sql + ["-X", "-qAt"], input=f"""
          select jsonb_build_object('orders',(select count(*) from public.orders where commerce_intent_id='{intent}'),
            'context_lines',(select count(*) from public.order_items oi join public.orders o on o.id=oi.order_id where o.commerce_intent_id='{intent}' and oi.line_id is not null),
            'parent_stock',(select stock_qty from public.product_variants where id='{parent_variant}'),
            'target_stock',(select stock_qty from public.product_variants where id='{target_variant}'));
        """))
        assert actual == {"orders": 1, "context_lines": 3, "parent_stock": 8, "target_stock": 7}, actual
        print("PASS optional concurrency 8 capture retries preserve 3 priced lines and consume stock once")

        replacement = json.dumps([{"target_product_id": target, "target_variant_id": target_variant, "kind": "complementary", "pricing_mode": "percent", "discount_bps": 2000}])

        def replace():
            try:
                return query(f"select public.replace_product_optional_offers('{parent}',1,'{replacement}'::jsonb)", actor=admin)
            except RuntimeError as error:
                if "Optional offers changed" not in str(error):
                    raise
                return None

        writes = parallel([replace, replace])
        assert sum(reply is not None for reply in writes) == 1
        replay = quote("optional-concurrent-identical-001")
        assert replay["replayed"] and replay["intent"]["status"] == "paid" and replay["intent"]["total_agorot"] == 34000
        print("PASS optional concurrency stale admin save conflicts and paid context replay stays immutable")

        # The admin locks the product before its offer-set row. A quote must not
        # hold that set while waiting for the later core insert's product FK lock.
        run(sql, input="""
          create function public.optional_offer_concurrency_locked_save(p_parent uuid,p_expected integer,p_offers jsonb)
          returns jsonb language plpgsql security definer set search_path='' as $$ begin
            perform 1 from public.products where id=p_parent for update;
            perform pg_sleep(1.5);
            return public.replace_product_optional_offers(p_parent,p_expected,p_offers);
          end $$;
        """)

        def save_while_holding_parent():
            return query(f"""
              select public.optional_offer_concurrency_locked_save('{parent}',2,'{replacement}'::jsonb)
              /* miro-optional-parent-lock-test */
            """, actor=admin)

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            save = pool.submit(save_while_holding_parent)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if save.done():
                    save.result()
                    raise AssertionError("Admin parent-lock window ended before observation")
                sleeping = run(sql + ["-X", "-qAt"], input="select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and query like '%miro-optional-parent-lock-test%' and wait_event='PgSleep');").strip()
                if sleeping == "t":
                    break
                time.sleep(0.02)
            else:
                raise AssertionError("Admin parent lock was not observed")
            try:
                quote("optional-concurrent-parent-save-001", revision=2)
                raise AssertionError("Concurrent changed offer must require review")
            except RuntimeError as error:
                if "Optional offer changed" not in str(error):
                    raise
            assert save.result()["revision"] == 3
        print("PASS optional concurrency admin parent-save versus checkout has no product/set deadlock")
    finally:
        run(sql, input=f"""
          drop function if exists public.optional_offer_concurrency_locked_save(uuid,integer,jsonb);
          delete from public.commerce_outbox where aggregate_id in(select id from public.orders where user_id='{customer}') or aggregate_id in(select id from public.commerce_intents where customer_id='{customer}');
          delete from public.audit_events where user_id in('{admin}','{customer}') or entity_id in(select id from public.commerce_intents where customer_id='{customer}') or entity_id in(select id from public.product_variants where product_id in('{parent}','{target}')) or details->>'intent_id' in(select id::text from public.commerce_intents where customer_id='{customer}');
          delete from public.stock_movements where variant_id in('{parent_variant}','{target_variant}');
          delete from public.order_payments where order_id in(select id from public.orders where user_id='{customer}');
          delete from public.payment_events where attempt_id in(select a.id from public.payment_attempts a join public.commerce_intents i on i.id=a.intent_id where i.customer_id='{customer}');
          delete from public.payment_attempts where intent_id in(select id from public.commerce_intents where customer_id='{customer}');
          delete from public.stock_reservations where intent_id in(select id from public.commerce_intents where customer_id='{customer}');
          delete from public.commerce_intent_items where intent_id in(select id from public.commerce_intents where customer_id='{customer}');
          delete from public.order_items where order_id in(select id from public.orders where user_id='{customer}');
          delete from public.orders where user_id='{customer}';
          delete from public.commerce_optional_offer_requests where actor_id='{customer}';
          delete from public.commerce_intents where customer_id='{customer}';
          delete from public.product_optional_offers where parent_product_id='{parent}';
          delete from public.product_optional_offer_sets where parent_product_id='{parent}';
          delete from public.product_variants where product_id in('{parent}','{target}');
          delete from public.products where id in('{parent}','{target}');
          delete from public.categories where id='{category}';
          delete from auth.users where id in('{admin}','{customer}');
        """)
