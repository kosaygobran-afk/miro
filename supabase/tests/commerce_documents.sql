-- Fiscal identity and documents remain draft-only until readiness gates are met.
begin;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000802','{"full_name":"Commerce Admin"}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000802';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000802',true);
do $$ declare v jsonb; begin
  v:=public.commerce_read('settings','{}'::jsonb);
  if (v->'readiness'->>'official_issuance_enabled')::boolean is distinct from false then raise exception 'Issuance readiness must remain disabled'; end if;
  begin perform public.commerce_write('document_reserve','{}'::jsonb); raise exception 'Fiscal number allocation was accepted while disabled';
  exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
rollback;
