begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000951','appearance-ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000952','appearance-admin@example.invalid',now(),'{}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000951';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000952';

do $$ declare backup jsonb; config jsonb; begin
  select value into backup from public.business_settings where key='appearance_version_1_backup';
  select value into config from public.business_settings where key='animation_settings';
  if backup->>'version' <> '1' or backup#>>'{animationSettings,appearanceVersion}' <> '1'
     or config->>'appearanceVersion' <> '2' or backup->>'sourceRevision' is null
     or backup#>>'{themeTokens,dark,--background}' <> '#000'
     or backup#>>'{themeTokens,light,--primary}' <> '#ffca28'
     or backup#>'{animationSettings,features}' <> config->'features'
     or backup#>'{animationSettings,durations}' <> config->'durations'
  then raise exception 'Version1 snapshot failed to preserve the pre-enhancement appearance'; end if;
  begin update public.business_settings set value='{}' where key='appearance_version_1_backup'; raise exception 'Owner backup overwrite allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.business_settings where key='appearance_version_1_backup'; raise exception 'Owner backup deletion allowed'; exception when insufficient_privilege then null; end;
  begin update public.business_settings set key='renamed_backup' where key='appearance_version_1_backup'; raise exception 'Owner backup rename allowed'; exception when insufficient_privilege then null; end;
end $$;

set local role service_role;
do $$ begin
  begin update public.business_settings set value='{}' where key='appearance_version_1_backup'; raise exception 'Service role backup overwrite allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.business_settings where key='appearance_version_1_backup'; raise exception 'Service role backup deletion allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.business_settings(key,value) values('appearance_version_1_backup','{}'); raise exception 'Service role backup reinsertion allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ declare config jsonb; begin
  config := public.get_public_animation_settings();
  if config->>'appearanceVersion' <> '2' or config ? 'versionOneBackup' or config ? 'themeTokens' or config ? 'sourceRevision' then raise exception 'Private backup leaked in public settings'; end if;
  begin perform value from public.business_settings where key='appearance_version_1_backup'; raise exception 'Anonymous backup table read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000952',true);
do $$ declare backup jsonb; begin
  select value into backup from public.business_settings where key='appearance_version_1_backup';
  if backup is null then raise exception 'Admin backup preview unavailable'; end if;
  begin perform public.set_business_setting('appearance_version_1_backup',backup); raise exception 'Admin backup write allowed'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000951',true);
do $$ declare backup jsonb; rev timestamptz; restored_rev timestamptz; settings jsonb; design jsonb; audit_count integer; begin
  select value into backup from public.business_settings where key='appearance_version_1_backup';
  select value,updated_at into settings,rev from public.business_settings where key='animation_settings';
  select value into design from public.business_settings where key='storefront_design';
  select count(*) into audit_count from public.audit_events where details->>'setting_key'='animation_settings';
  begin perform public.set_business_setting('appearance_version_1_backup',backup); raise exception 'CEO generic setter changed immutable backup'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(jsonb_set(settings,'{appearanceVersion}','"3"'),rev); raise exception 'Unknown appearance version allowed'; exception when invalid_parameter_value then null; end;
  begin perform public.update_animation_settings(settings - 'appearanceVersion',rev); raise exception 'Missing appearance version allowed'; exception when invalid_parameter_value then null; end;
  restored_rev := public.update_animation_settings(backup->'animationSettings',rev);
  if public.get_public_animation_settings() <> backup->'animationSettings'
     or (select value from public.business_settings where key='appearance_version_1_backup') <> backup
     or (select value from public.business_settings where key='storefront_design') <> design
     or (select count(*) from public.audit_events where details->>'setting_key'='animation_settings') <> audit_count + 1
  then raise exception 'Version1 restore did not atomically apply its settings and preserve backup/store design'; end if;
  begin perform public.update_animation_settings(settings,rev); raise exception 'Restore accepted stale revision'; exception when sqlstate 'PT409' then null; end;
  perform public.update_animation_settings(jsonb_set(backup->'animationSettings','{appearanceVersion}','"2"'),restored_rev);
  if public.get_public_animation_settings()->>'appearanceVersion' <> '2' then raise exception 'Version2 selection failed'; end if;
end $$;
reset role;
rollback;
