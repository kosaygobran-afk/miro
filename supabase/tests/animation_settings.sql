-- Executed only against the disposable database in scripts/verify-database.py.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000901','motion-ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000902','motion-admin@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000903','motion-blocked@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000904','motion-customer@example.invalid',now(),'{}');
update public.user_roles set role='ceo' where user_id in ('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000903');
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000902';
update public.profiles set account_status='blocked' where id='00000000-0000-0000-0000-000000000903';
insert into public.business_settings(key,value) values('motion_private_fixture','{"private_token":"never_public"}'::jsonb);

set local role anon;
do $$ declare config jsonb; begin
  config := public.get_public_animation_settings();
  if (select count(*) from jsonb_object_keys(config)) <> 7
     or (select count(*) from jsonb_object_keys(config->'features')) <> 13
     or (select count(*) from jsonb_object_keys(config->'durations')) <> 11
     or config::text like '%never_public%' or config ? 'revision'
  then raise exception 'Invalid public animation projection'; end if;
  if config->>'enabled' <> 'true' or exists(select 1 from jsonb_each(config->'features') f where f.value <> 'true'::jsonb)
  then raise exception 'Animation switches must start enabled'; end if;
  begin perform value from public.business_settings; raise exception 'Anonymous settings read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.update_animation_settings(config,now()); raise exception 'Anonymous animation write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000902',true);
do $$ declare config jsonb; rev timestamptz; begin
  select value,updated_at into config,rev from public.business_settings where key='animation_settings';
  if config is null then raise exception 'Admin read-only settings unavailable'; end if;
  begin perform public.update_animation_settings(config,rev); raise exception 'Admin animation write allowed'; exception when insufficient_privilege then null; end;
  begin perform public.set_business_setting('animation_settings',config); raise exception 'Admin generic animation write allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000903',true);
do $$ begin
  begin perform public.update_animation_settings(public.get_public_animation_settings(),now()); raise exception 'Blocked CEO write allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000904',true);
do $$ begin
  begin perform public.update_animation_settings(public.get_public_animation_settings(),now()); raise exception 'Customer write allowed'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);
do $$ declare config jsonb; rev timestamptz; next_rev timestamptz; audit_count integer; feature text; begin
  select value,updated_at into config,rev from public.business_settings where key='animation_settings';
  select count(*) into audit_count from public.audit_events where details->>'setting_key'='animation_settings';
  config := jsonb_set(config,'{enabled}','false');
  for feature in select jsonb_object_keys(config->'features') loop
    config := jsonb_set(config,array['features',feature],'false');
  end loop;
  config := jsonb_set(config,'{durations,theme}','350');
  next_rev := public.update_animation_settings(config,rev);
  if next_rev <= rev then raise exception 'Revision did not advance'; end if;
  if public.get_public_animation_settings() <> config then raise exception 'Saved animation settings not publicly projected'; end if;
  if (select count(*) from public.audit_events where details->>'setting_key'='animation_settings') <> audit_count + 1 then raise exception 'Successful save not audited exactly once'; end if;
  if not exists(select 1 from public.audit_events where details->>'setting_key'='animation_settings' and details->'new_value'=config and user_id=auth.uid()) then raise exception 'Audit does not identify actor and saved value'; end if;
  begin perform public.update_animation_settings(config,rev); raise exception 'Stale revision accepted'; exception when sqlstate 'PT409' then null; end;
  begin perform public.update_animation_settings(config,null); raise exception 'Missing revision accepted'; exception when sqlstate 'PT409' then null; end;
  begin perform public.set_business_setting('animation_settings',config); raise exception 'Generic setter bypasses revision'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(config || '{"private_note":"never_public"}',next_rev); raise exception 'Unknown root property accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(config,'{features}',(config->'features') || '{"private_note":"never_public"}'),next_rev); raise exception 'Unknown feature accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(config #- '{features,menus}',next_rev); raise exception 'Missing feature accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(config,'{features,menus}','"true"'),next_rev); raise exception 'Nonboolean feature accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(config,'{durations,theme}','700'),next_rev); raise exception 'Out-of-range duration accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(config,'{durations,content}','160.5'),next_rev); raise exception 'Fractional duration accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(config,'{durations,menu}','"150"'),next_rev); raise exception 'String duration accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(config #- '{durations,micro}',next_rev); raise exception 'Missing duration accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(config,'{themeStyle}','"unknown"'),next_rev); raise exception 'Unknown theme style accepted'; exception when invalid_parameter_value then null; end;
  if (select value from public.business_settings where key='animation_settings') <> config
     or (select updated_at from public.business_settings where key='animation_settings') <> next_rev
     or (select count(*) from public.audit_events where details->>'setting_key'='animation_settings') <> audit_count + 1
  then raise exception 'Rejected save changed settings, revision or audit'; end if;
end $$;
reset role;
rollback;
