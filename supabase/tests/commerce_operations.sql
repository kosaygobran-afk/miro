-- Commerce operations: cash totals, expense arithmetic and role boundaries.
begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000801','{"full_name":"Commerce CEO"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000801';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000801',true);
do $$ declare opened jsonb; moved jsonb; closed jsonb; sid uuid; rev integer; begin
  opened:=public.commerce_write('cash_open','{"opening_float_agorot":12500,"note":"opening test"}'::jsonb);
  sid:=(opened->'data'->>'id')::uuid;
  perform public.commerce_write('cash_movement',jsonb_build_object('session_id',sid,'kind','cash_in','amount_agorot',2300,'reason','test float','effect_key','test-cashin-801'));
  moved:=public.commerce_write('cash_movement',jsonb_build_object('session_id',sid,'kind','cash_out','amount_agorot',800,'reason','test float','effect_key','test-cashout-801'));
  rev:=(moved->'data'->>'revision')::integer;
  closed:=public.commerce_write('cash_close',jsonb_build_object('session_id',sid,'expected_revision',rev,'counted_cash_agorot',14000,'note','count test'));
  if (closed->'data'->>'expected_cash_agorot')::bigint<>14000 or (closed->'data'->>'variance_agorot')::bigint<>0 then raise exception 'Cash close totals mismatch'; end if;
  if jsonb_array_length(public.commerce_read('cash','{}'::jsonb)->'rows')<1 then raise exception 'Cash shift projection missing'; end if;
end $$;
do $$ begin
  begin perform public.commerce_write('cash_movement','{"session_id":"00000000-0000-0000-0000-000000000000","kind":"sale_cash","amount_agorot":100,"reason":"spoof"}'::jsonb); raise exception 'Internal tender was accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
