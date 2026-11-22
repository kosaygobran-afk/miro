-- Exercise ownership, merge/replay, and checkout linking with rollback-only data.
begin;

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
  ('bb100000-0000-4000-8000-000000000001', 'shopping-test-1@example.invalid', now(), '{}'),
  ('bb100000-0000-4000-8000-000000000002', 'shopping-test-2@example.invalid', now(), '{}');

insert into public.categories(id,slug,name_he,name_en)
values ('bb200000-0000-4000-8000-000000000001','shopping-test-category','בדיקה','Shopping test category');
insert into public.products(id,category_id,slug,name_he,name_en,price)
values ('bb300000-0000-4000-8000-000000000001','bb200000-0000-4000-8000-000000000001','shopping-test-product','בדיקה','Shopping test product',100);
update public.products set status='active' where id='bb300000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','bb100000-0000-4000-8000-000000000001',true);
do $$
declare
  owner constant uuid := auth.uid();
  foreign_owner constant uuid := 'bb100000-0000-4000-8000-000000000002';
  item constant uuid := 'bb300000-0000-4000-8000-000000000001';
  import_id constant uuid := 'bb400000-0000-4000-8000-000000000001';
  result jsonb;
begin
  perform public.customer_shopping(owner,'cart','{"base":{"quantity":5}}');
  result := public.customer_shopping(owner,'import',
    '{"base":{"quantity":2},"configured":{"quantity":3}}',array[item],import_id);
  if result <> jsonb_build_object('cart','[{"quantity":5},{"quantity":3}]'::jsonb,'wishlist',jsonb_build_array(item)) then
    raise exception 'Expected one merged base line, a distinct configured line, and the wishlist item';
  end if;

  perform public.customer_shopping(owner,'remove','{}',array[item]);
  perform public.customer_shopping(owner,'cart','{"configured":null,"second-device":{"quantity":1}}');
  result := public.customer_shopping(owner,'import','{"configured":{"quantity":3}}',array[item],import_id);
  if result <> '{"cart":[{"quantity":5},{"quantity":1}],"wishlist":[]}'::jsonb then
    raise exception 'A replay restored a removed selection or replaced a distinct line';
  end if;

  begin
    perform public.customer_shopping(foreign_owner,'cart','{"base":null}');
    raise exception 'Foreign cart access was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_service_request(
      'Fixture customer','shopping-test-1@example.invalid','0500000000','Fixture pickup','en','checkout_page'
    );
    raise exception 'Public RPC accepted an unverified checkout';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.service_requests(customer_id,name,email,phone,message,locale,source)
    values (owner,'Fixture customer','shopping-test-1@example.invalid','0500000000','Fixture pickup','en','checkout_page');
    raise exception 'Direct insert bypassed checkout verification';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin
    perform public.customer_shopping('bb100000-0000-4000-8000-000000000001');
    raise exception 'Anonymous account-cart access was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_checkout_request('bb500000-0000-4000-8000-000000000001',repeat('a',64),null);
    raise exception 'Anonymous checkout writer access was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role service_role;
do $$
declare
  request_id constant uuid := 'bb500000-0000-4000-8000-000000000001';
  guest_id constant uuid := 'bb500000-0000-4000-8000-000000000002';
  owner constant uuid := 'bb100000-0000-4000-8000-000000000001';
  payload constant jsonb := '{"name":"Fixture customer","email":"shopping-test-1@example.invalid","phone":"0500000000","message":"Fixture pickup","locale":"en","checkout":{"fulfillment":"pickup","payment_collected":false,"cart":[{"quantity":1}]}}';
begin
  if public.record_checkout_request(request_id,repeat('a',64),owner) is not null then
    raise exception 'A new checkout already had a receipt';
  end if;
  perform set_config('shopping.test.request_id', public.record_checkout_request(
    request_id,repeat('a',64),owner,payload,'test:checkout-pickup'
  )::text, true);
  if public.record_checkout_request(request_id,repeat('a',64),owner) is distinct from request_id then
    raise exception 'Replay lookup missed the original checkout';
  end if;
  if public.record_checkout_request(request_id,repeat('a',64),owner,payload,'test:checkout-pickup') is distinct from request_id then
    raise exception 'Identical replay did not return the original checkout';
  end if;
  begin
    perform public.record_checkout_request(request_id,repeat('b',64),owner);
    raise exception 'Changed checkout payload was accepted with the same reference';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.record_checkout_request(request_id,repeat('a',64),null);
    raise exception 'Original checkout reference was visible to another actor';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('shopping.test.guest_id', public.record_checkout_request(
    guest_id,repeat('b',64),null,
    '{"name":"Fixture guest","email":"shopping-test-guest@example.invalid","phone":"0500000000","message":"Fixture delivery","locale":"en","checkout":{"fulfillment":"delivery","payment_collected":false,"cart":[{"quantity":1}],"shipping":{"address":"Fixture street","city":"Fixture city"}}}',
    'test:checkout-delivery'
  )::text, true);
end $$;

reset role;
do $$ begin
  if not exists (select 1 from public.service_requests
    where id=current_setting('shopping.test.request_id')::uuid
      and customer_id='bb100000-0000-4000-8000-000000000001'
      and metadata #>> '{checkout,fulfillment}' = 'pickup' and checkout_payload_hash = repeat('a',64)) then
    raise exception 'Pickup request was not attached to the verified customer';
  end if;
  if not exists (select 1 from public.service_requests
    where id=current_setting('shopping.test.guest_id')::uuid
      and customer_id is null and metadata #>> '{checkout,shipping,address}' = 'Fixture street') then
    raise exception 'Guest delivery request lost its address or was attached to an account';
  end if;
  if (select count(*) from public.audit_events where action = 'service_request_created'
      and entity_id in (current_setting('shopping.test.request_id')::uuid,current_setting('shopping.test.guest_id')::uuid)) <> 2 then
    raise exception 'A checkout retry created a duplicate audit event or lost an event';
  end if;
end $$;

rollback;
