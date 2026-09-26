begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000010','ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000011','second@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000012','unverified@example.invalid',null,'{}'),
('00000000-0000-0000-0000-000000000013','remove@example.invalid',now(),'{}');
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
do $$ begin
 begin
  perform public.add_ceo('second@example.invalid');
  raise exception 'Missing password verification allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now()))))::text,true);
do $$ begin
 begin
  perform public.delete_own_ceo_account();
  raise exception 'Last CEO deletion allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.add_ceo('unverified@example.invalid');
  raise exception 'Unverified CEO allowed';
 exception when invalid_parameter_value then null; end;
end $$;
select public.add_ceo('second@example.invalid');
do $$ begin
 if (select role from public.profiles where id='00000000-0000-0000-0000-000000000011') is distinct from 'ceo' then
  raise exception 'add_ceo did not set profiles.role to ceo';
 end if;
end $$;
do $$ begin
 begin
  perform public.add_ceo('second@example.invalid');
  raise exception 'Re-adding an existing CEO allowed';
 exception when invalid_parameter_value then null; end;
end $$;
do $$ begin
 begin
  perform public.manage_account('00000000-0000-0000-0000-000000000011','customer','blocked');
  raise exception 'Other CEO modification allowed';
 exception when insufficient_privilege then null; end;
end $$;
select public.delete_own_ceo_account();
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
do $$ begin
 begin
  perform public.delete_user_account('00000000-0000-0000-0000-000000000011');
  raise exception 'Self-target via delete_user_account allowed';
 exception when insufficient_privilege then null; end;
end $$;
select public.delete_user_account('00000000-0000-0000-0000-000000000013');
reset role;
do $$ begin
 if exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000013') then raise exception 'delete_user_account left auth.users row'; end if;
 if exists(select 1 from public.user_roles where user_id='00000000-0000-0000-0000-000000000013') then raise exception 'delete_user_account left user_roles row'; end if;
 if exists(select 1 from public.profiles where id='00000000-0000-0000-0000-000000000013') then raise exception 'delete_user_account left profiles row'; end if;
 if (select count(*) from public.audit_events where action='ceo_added') <> 1 then raise exception 'Fake ceo_added audit event logged'; end if;
end $$;
do $$ begin
 if exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000010') then raise exception 'Self deletion failed'; end if;
 if not exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000011') then raise exception 'Other CEO deleted'; end if;
 if (select count(*) from public.user_roles where role='ceo') <> 1 then raise exception 'CEO invariant failed'; end if;
end $$;
rollback;
