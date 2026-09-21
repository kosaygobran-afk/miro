begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000010','ceo@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000011','second@example.invalid',now(),'{}'),
('00000000-0000-0000-0000-000000000012','unverified@example.invalid',null,'{}');
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
 begin
  perform public.manage_account('00000000-0000-0000-0000-000000000011','customer','blocked');
  raise exception 'Other CEO modification allowed';
 exception when insufficient_privilege then null; end;
end $$;
select public.delete_own_ceo_account();
reset role;
do $$ begin
 if exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000010') then raise exception 'Self deletion failed'; end if;
 if not exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000011') then raise exception 'Other CEO deleted'; end if;
 if (select count(*) from public.user_roles where role='ceo') <> 1 then raise exception 'CEO invariant failed'; end if;
end $$;
rollback;
