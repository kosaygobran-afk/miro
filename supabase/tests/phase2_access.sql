-- Run against an isolated migrated database. All fixtures are rolled back.
begin;
insert into auth.users(id,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000001','{"full_name":"Customer", "role":"ceo"}'),
('00000000-0000-0000-0000-000000000002','{"full_name":"Worker"}'),
('00000000-0000-0000-0000-000000000003','{"full_name":"Admin"}'),
('00000000-0000-0000-0000-000000000004','{"full_name":"CEO"}'),
('00000000-0000-0000-0000-000000000005','{"full_name":"Customer B"}');
update public.user_roles set role='worker' where user_id='00000000-0000-0000-0000-000000000002';
update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000000003';
update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin
 if public.active_app_role() <> 'customer' then raise exception 'Metadata escalated signup'; end if;
 if (select count(*) from public.profiles) <> 1 then raise exception 'Cross-account read'; end if;
 begin
  update public.profiles set role='admin';
  raise exception 'Profile escalation allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.profiles set account_status='active';
  raise exception 'Suspension override allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.manage_account('00000000-0000-0000-0000-000000000002','admin',null);
  raise exception 'Customer management allowed';
 exception when insufficient_privilege then null; end;
end $$;
update public.profiles set full_name='Updated customer' where id=auth.uid();
insert into public.service_requests(id,customer_id,name,email,message) values ('10000000-0000-0000-0000-000000000001',auth.uid(),'Customer','test@example.invalid','A test request');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
do $$ begin
 if (select count(*) from public.service_requests) <> 0 then raise exception 'Customer B can read A requests'; end if;
 begin
  insert into public.service_requests(customer_id,name,email,message) values ('00000000-0000-0000-0000-000000000001','Forged','test@example.invalid','Forged request');
  raise exception 'Forged ownership accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
 if (select count(*) from public.service_requests) <> 0 then raise exception 'Unassigned worker read'; end if;
 begin
  perform public.update_service_request('10000000-0000-0000-0000-000000000001','closed',null);
  raise exception 'Unassigned worker update';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin
 begin
  perform public.manage_account('00000000-0000-0000-0000-000000000004','customer',null);
  raise exception 'Admin changed CEO';
 exception when insufficient_privilege then null; end;
 begin
  perform public.manage_account('00000000-0000-0000-0000-000000000001','admin',null);
  raise exception 'Admin promoted admin';
 exception when insufficient_privilege then null; end;
end $$;
select public.update_service_request('10000000-0000-0000-0000-000000000001','in_progress','00000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
 if (select count(*) from public.service_requests) <> 1 then raise exception 'Worker assignment read failed'; end if;
end $$;
select public.update_service_request('10000000-0000-0000-0000-000000000001','closed',null);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select public.manage_account('00000000-0000-0000-0000-000000000001',null,'suspended');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin
 if public.active_app_role() is not null then raise exception 'Suspended account active'; end if;
 begin
 insert into public.service_requests(customer_id,name,email,message) values(auth.uid(),'Blocked','test@example.invalid','Should be blocked');
 raise exception 'Suspended request allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_events) <> 3 then raise exception 'Audit count mismatch'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.profiles;
  raise exception 'Anonymous private read';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
