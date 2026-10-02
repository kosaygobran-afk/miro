begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000801','design-ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000802','design-admin@example.invalid',now(),'{}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000801';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000802';
set local role anon;
do $$ declare config jsonb; begin
 config := public.get_public_inventory_defaults();
 if config ? 'internal_note' or (select count(*) from jsonb_object_keys(config)) > 2 then raise exception 'Invalid public inventory projection';end if;
 config := public.get_public_storefront_design();
 if config->'hero' is null or config ? 'finance' or config ? 'public_contact' then raise exception 'Invalid public design projection'; end if;
 begin perform public.update_storefront_design(config,now());raise exception 'Anon design write allowed';exception when insufficient_privilege then null;end;
 begin perform value from public.business_settings;raise exception 'Anon settings read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000802',true);
do $$ declare config jsonb; rev timestamptz; begin
 select value,updated_at into config,rev from public.business_settings where key='storefront_design';
 begin perform public.update_storefront_design(config,rev);raise exception 'Admin design write allowed';exception when insufficient_privilege then null;end;
 begin perform public.set_business_setting('storefront_design',config);raise exception 'Admin generic setting write allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000801',true);
do $$ declare config jsonb; rev timestamptz; next_rev timestamptz; old_version bigint; begin
 select value,updated_at into config,rev from public.business_settings where key='storefront_design';
 select version into old_version from public.store_catalog_version where id=1;
 config := jsonb_set(config,'{hero,intervalSeconds}','12');
 next_rev := public.update_storefront_design(config,rev);
 if public.get_public_storefront_design()#>>'{hero,intervalSeconds}' <> '12' then raise exception 'CEO changes not public';end if;
 if (select version from public.store_catalog_version where id=1) <= old_version then raise exception 'Design failed to refresh catalog';end if;
 begin perform public.update_storefront_design(config,rev - interval '1 second');raise exception 'Stale write allowed';exception when sqlstate 'PT409' then null;end;
 begin perform public.update_storefront_design(jsonb_set(config,'{hero,intervalSeconds}','0'),next_rev);raise exception 'Invalid duration allowed';exception when invalid_parameter_value then null;end;
 begin perform public.set_business_setting('storefront_design',config || '{"private_note":"must never be public"}'::jsonb);raise exception 'Unrecognised public fields allowed';exception when invalid_parameter_value then null;end;
 begin perform public.update_storefront_design(jsonb_set(config,'{hero,slides,0,imageUrl}','"javascript:alert(1)"'),next_rev);raise exception 'Unsafe image URL allowed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
rollback;
