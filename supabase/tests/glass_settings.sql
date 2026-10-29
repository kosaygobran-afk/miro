-- Transactional permission/concurrency/privacy proof. Always rolls back actors,
-- settings writes and audits; safe to preflight against a linked database.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000002901','glass-ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002902','glass-admin@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002903','glass-worker@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002904','glass-customer@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002905','glass-blocked-admin@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000002906','glass-blocked-ceo@example.invalid',now(),'{}');
update public.user_roles set role='ceo' where user_id in ('00000000-0000-0000-0000-000000002901','00000000-0000-0000-0000-000000002906');
update public.user_roles set role='admin' where user_id in ('00000000-0000-0000-0000-000000002902','00000000-0000-0000-0000-000000002905');
update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000002903';
update public.profiles set account_status='active' where id in ('00000000-0000-0000-0000-000000002901','00000000-0000-0000-0000-000000002902','00000000-0000-0000-0000-000000002903','00000000-0000-0000-0000-000000002904');
update public.profiles set account_status='blocked' where id in ('00000000-0000-0000-0000-000000002905','00000000-0000-0000-0000-000000002906');
create temp table glass_unrelated_baseline as select * from public.business_settings where key <> 'glass_settings';
create temp table glass_audit_baseline as select count(*) as total from public.audit_events where details->>'setting_key'='glass_settings';

set local role anon;
do $$ declare config jsonb; begin
  config := public.get_public_glass_settings();
  if (select count(*) from jsonb_object_keys(config)) <> 2
     or jsonb_typeof(config->'enabled') is distinct from 'boolean'
     or jsonb_typeof(config->'revision') is distinct from 'string'
  then raise exception 'Public glass projection must contain only boolean and revision'; end if;
  begin perform value from public.business_settings; raise exception 'Anonymous settings table read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.update_glass_settings('{"enabled":false}',now()); raise exception 'Anonymous glass write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$ declare actor text; begin
  foreach actor in array array[
    '00000000-0000-0000-0000-000000002903',
    '00000000-0000-0000-0000-000000002904',
    '00000000-0000-0000-0000-000000002905',
    '00000000-0000-0000-0000-000000002906'
  ] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    begin perform public.update_glass_settings('{"enabled":false}',now()); raise exception 'Unauthorized or blocked glass write allowed'; exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- Both owner-authorized roles may save; each success advances revision once.
do $$ declare actor text; config jsonb; revision timestamptz; next_revision timestamptz; begin
  foreach actor in array array['00000000-0000-0000-0000-000000002901','00000000-0000-0000-0000-000000002902'] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    select value,updated_at into config,revision from public.business_settings where key='glass_settings';
    config := jsonb_build_object('enabled',not (config->>'enabled')::boolean);
    next_revision := public.update_glass_settings(config,revision);
    if next_revision <= revision then raise exception 'Glass revision did not advance'; end if;
    if public.get_public_glass_settings() <> jsonb_build_object('enabled',config->'enabled','revision',next_revision) then raise exception 'Public flag does not reflect saved global choice'; end if;
    begin perform public.update_glass_settings(config,revision); raise exception 'Stale revision accepted'; exception when sqlstate 'PT409' then null; end;
    begin perform public.update_glass_settings(config,null); raise exception 'Missing revision accepted'; exception when sqlstate 'PT409' then null; end;
    begin perform public.update_glass_settings('{"enabled":"true"}',next_revision); raise exception 'String boolean accepted'; exception when invalid_parameter_value then null; end;
    begin perform public.update_glass_settings('{}',next_revision); raise exception 'Missing enabled accepted'; exception when invalid_parameter_value then null; end;
    begin perform public.update_glass_settings('{"enabled":true,"private_note":"forbidden"}',next_revision); raise exception 'Unknown settings field accepted'; exception when invalid_parameter_value then null; end;
    begin perform public.update_glass_settings('null',next_revision); raise exception 'Null settings accepted'; exception when invalid_parameter_value then null; end;
    if (select updated_at from public.business_settings where key='glass_settings') <> next_revision then raise exception 'Failed save changed revision'; end if;
    begin update public.business_settings set value=config where key='glass_settings'; raise exception 'Direct authenticated glass write allowed'; exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- Generic setter stays CEO-only and cannot bypass glass/animation/backup guards.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002902',true);
do $$ begin
  begin perform public.set_business_setting('glass_settings','{"enabled":false}'); raise exception 'Admin generic setting write allowed'; exception when insufficient_privilege then null; end;
  begin perform public.update_animation_settings(public.get_public_animation_settings(),now()); raise exception 'Admin animation permissions widened'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002901',true);
do $$ declare key text; begin
  foreach key in array array['glass_settings','animation_settings','appearance_version_1_backup'] loop
    begin perform public.set_business_setting(key,'{"enabled":false}'); raise exception 'Dedicated setting bypass allowed'; exception when invalid_parameter_value then null; end;
  end loop;
  foreach key in array array['commerce.fixture','fiscal.fixture','payment.fixture'] loop
    begin perform public.set_business_setting(key,'{}'); raise exception 'Protected commerce setting bypass allowed'; exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.audit_events where details->>'setting_key'='glass_settings') <> (select total+2 from glass_audit_baseline) then raise exception 'Glass saves not audited exactly once each'; end if;
  if (select count(distinct user_id) from public.audit_events where details->>'setting_key'='glass_settings' and user_id in ('00000000-0000-0000-0000-000000002901','00000000-0000-0000-0000-000000002902')) <> 2 then raise exception 'Glass audits missing actual actors'; end if;
  if exists((select * from public.business_settings where key <> 'glass_settings') except (select * from glass_unrelated_baseline))
     or exists((select * from glass_unrelated_baseline) except (select * from public.business_settings where key <> 'glass_settings')) then raise exception 'Unrelated business settings changed'; end if;
  if not has_function_privilege('anon','public.get_public_glass_settings()','EXECUTE')
     or has_function_privilege('anon','public.update_glass_settings(jsonb,timestamptz)','EXECUTE')
     or not has_function_privilege('authenticated','public.update_glass_settings(jsonb,timestamptz)','EXECUTE') then raise exception 'Glass RPC grants invalid'; end if;
end $$;
rollback;
