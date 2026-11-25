begin;

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002981', 'page-copy-ceo@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000002982', 'page-copy-admin@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000002983', 'page-copy-worker@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000002984', 'page-copy-customer@example.invalid', now(), '{}'),
  ('00000000-0000-4000-8000-000000002985', 'page-copy-blocked@example.invalid', now(), '{}');

update public.user_roles set role = 'ceo'
where user_id in ('00000000-0000-4000-8000-000000002981', '00000000-0000-4000-8000-000000002985');
update public.user_roles set role = 'admin' where user_id = '00000000-0000-4000-8000-000000002982';
update public.user_roles set role = 'worker' where user_id = '00000000-0000-4000-8000-000000002983';
update public.profiles set account_status = 'active'
where id in (
  '00000000-0000-4000-8000-000000002981',
  '00000000-0000-4000-8000-000000002982',
  '00000000-0000-4000-8000-000000002983',
  '00000000-0000-4000-8000-000000002984'
);
update public.profiles set account_status = 'blocked' where id = '00000000-0000-4000-8000-000000002985';

select set_config('miro_test.page_copy_revision', updated_at::text, true)
from public.business_settings where key = 'website_page_copy';

set local role anon;
do $$
begin
  if public.get_public_website_page_copy() is null then
    raise exception 'Anonymous page text projection is unavailable';
  end if;
  begin
    perform public.update_website_page_copy('{}', now());
    raise exception 'Anonymous publish was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;
do $$
declare
  actor text;
  revision timestamptz := current_setting('miro_test.page_copy_revision')::timestamptz;
  next_revision timestamptz;
  reset_revision timestamptz;
  content jsonb := '{
    "home":{
      "he":{"eyebrow":"פתיחה","title":"כותרת","accent":"כותרת מודגשת","description":"טקסט לבדיקה"},
      "en":{"eyebrow":"Opening","title":"Headline","accent":"Highlighted","description":"Test introduction"}
    }
  }';
begin
  foreach actor in array array[
    '00000000-0000-4000-8000-000000002982',
    '00000000-0000-4000-8000-000000002983',
    '00000000-0000-4000-8000-000000002984',
    '00000000-0000-4000-8000-000000002985'
  ] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    begin
      perform public.update_website_page_copy(content, revision);
      raise exception 'Ineligible account could publish page text';
    exception when insufficient_privilege then null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002981', true);
  begin
    perform public.set_business_setting('website_page_copy', content);
    raise exception 'Generic setter bypassed the page text writer';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_website_page_copy(content #- '{home,he}', revision);
    raise exception 'A missing Hebrew translation was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_website_page_copy(jsonb_set(content, '{home,en,title}', to_jsonb(repeat('X', 101))), revision);
    raise exception 'An oversized headline was accepted';
  exception when invalid_parameter_value then null;
  end;

  next_revision := public.update_website_page_copy(content, revision);
  if next_revision <= revision or public.get_public_website_page_copy() is distinct from content then
    raise exception 'Publishing did not update the public copy and revision';
  end if;
  begin
    perform public.update_website_page_copy('{}', revision);
    raise exception 'A stale revision was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  reset_revision := public.update_website_page_copy('{}', next_revision);
  if reset_revision <= next_revision
    or public.get_public_website_page_copy() <> '{}'::jsonb then
    raise exception 'Reset did not restore the bundled defaults';
  end if;
end;
$$;
reset role;

do $$
begin
  if (
    select count(*) from public.audit_events
    where action = 'setting_changed' and details->>'setting_key' = 'website_page_copy'
      and user_id = '00000000-0000-4000-8000-000000002981'
  ) <> 2 then
    raise exception 'Publishing and reset did not each produce one audit event';
  end if;
end;
$$;

rollback;
