-- Smoke the linked roles and atomic persistence without retaining fixtures or changes.
begin;

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002951', 'website-images-ceo@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000002952', 'website-images-admin@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000002953', 'website-images-blocked@example.invalid', now(), '{}');

update public.user_roles set role = 'ceo'
where user_id in ('00000000-0000-4000-8000-000000002951', '00000000-0000-4000-8000-000000002953');
update public.user_roles set role = 'admin'
where user_id = '00000000-0000-4000-8000-000000002952';
update public.profiles set account_status = 'active'
where id in ('00000000-0000-4000-8000-000000002951', '00000000-0000-4000-8000-000000002952');
update public.profiles set account_status = 'blocked'
where id = '00000000-0000-4000-8000-000000002953';

do $$
declare revision timestamptz;
begin
  select updated_at into strict revision from public.business_settings where key = 'website_images';
  perform set_config('miro_test.website_images_revision', revision::text, true);
end;
$$;

set local role anon;
do $$
begin
  if public.get_public_website_images() is null then
    raise exception 'Anonymous website image projection is unavailable';
  end if;
  begin
    perform value from public.business_settings;
    raise exception 'Anonymous settings table read allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_website_images('{}', now());
    raise exception 'Anonymous website image write allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;
do $$
declare
  actor text;
  revision timestamptz := current_setting('miro_test.website_images_revision')::timestamptz;
  saved_revision timestamptz;
  gallery jsonb := '{"images":[],"animation":"flip-up","effect":"natural","autoplay":false,"interval":8,"radius":16,"border":1}';
  design jsonb;
begin
  design := jsonb_build_object(
    'galleries', jsonb_build_object('home', gallery, 'services', gallery, 'serviceDetails', gallery),
    'overrides', jsonb_build_object('home-hero', '')
  );

  foreach actor in array array['00000000-0000-4000-8000-000000002952', '00000000-0000-4000-8000-000000002953'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    begin
      perform public.update_website_images(design, revision);
      raise exception 'Unauthorized or blocked role could save website images';
    exception when insufficient_privilege then null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002951', true);
  begin
    perform public.set_business_setting('website_images', design);
    raise exception 'Generic setter bypassed dedicated image writer';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.update_website_images(design #- '{galleries,serviceDetails}', revision);
    raise exception 'Missing gallery placement accepted';
  exception when invalid_parameter_value then null;
  end;

  saved_revision := public.update_website_images(design, revision);
  if saved_revision <= revision or public.get_public_website_images() is distinct from design then
    raise exception 'CEO save did not advance revision or update public projection';
  end if;

  begin
    perform public.update_website_images(design, revision);
    raise exception 'Stale website image revision accepted';
  exception when sqlstate 'PT409' then null;
  end;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.audit_events
      where user_id = '00000000-0000-4000-8000-000000002951'
        and action = 'setting_changed'
        and details->>'setting_key' = 'website_images') <> 1 then
    raise exception 'Website image save did not record exactly one audit event';
  end if;
end;
$$;

select true as website_images_permissions_revision_and_audit_verified;
rollback;
