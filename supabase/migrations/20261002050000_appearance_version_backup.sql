-- Capture the existing Version1 presentation before enabling the gated Version2 overlay.
-- This preserves owner-edited motion values; it does not reset store design or catalog data.
begin;
insert into public.business_settings(key,value)
select 'appearance_version_1_backup',
  '{"version":"1","nameEn":"Version1 — original appearance and animation backup","nameHe":"גרסה1 — גיבוי העיצוב וההנפשות המקוריים","capturedOn":"2026-10-02","themeTokens":{"dark":{"--background":"#000","--surface":"#080808","--surface-muted":"#101010","--surface-hover":"#1a1a1a","--foreground":"#fff","--muted-foreground":"#c8c8c8","--border-subtle":"#595959","--border-control":"#969696","--primary":"gold","--primary-hover":"#ffe766","--primary-foreground":"#111214","--accent-text":"#ffe44d","--secondary-accent":"#00ffe0","--success-text":"#5cff95","--error-text":"#ff767f","--badge-admin":"#d998ff","--badge-worker":"#69c7ff","--badge-customer":"#5cff95","--badge-suspended":"#ffdf4d","--hero-glow":"#ffd7001a","--header-surface":"#000","--header-surface-strong":"#000","--radius-xs":".375rem","--radius-sm":".625rem","--radius-md":".875rem","--radius-lg":".75rem","--radius-xl":"1rem","--radius-2xl":"1.5rem","--radius-full":"9999px","--shadow-soft":"0 8px 24px #0009","--shadow-lift":"0 18px 38px #000000bf","--shadow-glow":"0 3px 12px #ffd700b3, 0 0 12px #ffd70033, 0 0 24px #ffd70014","--focus-ring":"#00ffe0","--gold-highlight":"#fff3b0","--turquoise-highlight":"#a6fff4","--turquoise-glow":"0 0 10px #00ffe033, 0 0 22px #00ffe014"},"medium":{"--background":"#090b0d","--surface":"#121518","--surface-muted":"#1b1f23","--surface-hover":"#23282c","--foreground":"#f5f6f7","--muted-foreground":"#aeb5bc","--border-subtle":"#2c3238","--border-control":"#7e8a95","--primary":"#ffca28","--primary-hover":"#ffda66","--primary-foreground":"#111214","--accent-text":"#ffce42","--secondary-accent":"#69e1d3","--success-text":"#7fe5a2","--error-text":"#ff9a9a","--badge-admin":"#c084fc","--badge-worker":"#60a5fa","--badge-customer":"#4ade80","--badge-suspended":"#fbbf24","--hero-glow":"#f2c21d38","--header-surface":"#0b0e10f0","--header-surface-strong":"#0c1013eb","--radius-xs":".375rem","--radius-sm":".625rem","--radius-md":".875rem","--radius-lg":".75rem","--radius-xl":"1rem","--radius-2xl":"1.5rem","--radius-full":"9999px","--shadow-soft":"0 8px 24px #0000001f","--shadow-lift":"0 18px 38px #0003","--shadow-glow":"0 3px 12px #ffca2817","--focus-ring":"#ffca28","--gold-highlight":"#fff3b0","--turquoise-highlight":"#a6fff4","--turquoise-glow":"0 0 10px #00ffe033, 0 0 22px #00ffe014"},"light":{"--background":"#f7f8fa","--surface":"#fff","--surface-muted":"#edf2ef","--surface-hover":"#e1e7e4","--foreground":"#151b22","--muted-foreground":"#3a4652","--border-subtle":"#c4ccd5","--border-control":"#748391","--primary":"#ffca28","--primary-hover":"#f1bd22","--primary-foreground":"#111214","--accent-text":"#765300","--secondary-accent":"#0d6d60","--success-text":"#0d6f3d","--error-text":"#b12323","--badge-admin":"#7e22ce","--badge-worker":"#1d4ed8","--badge-customer":"#15803d","--badge-suspended":"#92400e","--hero-glow":"#f2c21d24","--header-surface":"#fffffff0","--header-surface-strong":"#fffffff5","--radius-xs":".375rem","--radius-sm":".625rem","--radius-md":".875rem","--radius-lg":".75rem","--radius-xl":"1rem","--radius-2xl":"1.5rem","--radius-full":"9999px","--shadow-soft":"0 6px 20px #141c230a","--shadow-lift":"0 14px 36px #141c2314","--shadow-glow":"0 3px 10px #835e0012","--focus-ring":"#f2c21d","--gold-highlight":"#fff3b0","--turquoise-highlight":"#a6fff4","--turquoise-glow":"0 0 10px #00ffe033, 0 0 22px #00ffe014"}},"baseStyles":["src/app/globals.css","src/styles/premium.css","src/styles/experience.css","src/styles/storefront.css","src/styles/customer-refinement.css"]}'::jsonb || jsonb_build_object(
    'animationSettings',value || '{"appearanceVersion":"1"}'::jsonb,
    'sourceRevision',updated_at
  )
from public.business_settings where key='animation_settings'
on conflict(key) do nothing;

create or replace function public.protect_version_one_appearance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op <> 'INSERT' and old.key = 'appearance_version_1_backup')
     or (tg_op <> 'DELETE' and new.key = 'appearance_version_1_backup') then
    raise exception 'Version1 appearance backup is immutable' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_version_one_appearance() from public;
create trigger protect_version_one_appearance before insert or update or delete on public.business_settings
for each row execute function public.protect_version_one_appearance();

create or replace function public.validate_animation_settings()
returns trigger language plpgsql set search_path = '' as $$
declare entry text;
begin
  if new.key <> 'animation_settings' then return new; end if;
  if jsonb_typeof(new.value) is distinct from 'object'
     or (new.value - array['appearanceVersion','enabled','features','durations','themeStyle','pageStyle','easing']) <> '{}'::jsonb
     or coalesce(new.value->>'appearanceVersion','') not in ('1','2')
     or jsonb_typeof(new.value->'enabled') is distinct from 'boolean'
     or jsonb_typeof(new.value->'features') is distinct from 'object'
     or jsonb_typeof(new.value->'durations') is distinct from 'object'
     or ((new.value->'features') - array['themeReveal','themeIcon','navigationProgress','pageReveal','contentReveal','skeletonShimmer','imageReveal','dialogs','menus','buttonFeedback','microInteractions','ambientMotion','textRails']) <> '{}'::jsonb
     or ((new.value->'durations') - array['theme','icon','navigation','page','content','skeleton','image','dialog','menu','button','micro']) <> '{}'::jsonb
     or coalesce(new.value->>'themeStyle','') not in ('radial','fade')
     or coalesce(new.value->>'pageStyle','') not in ('lift','fade')
     or coalesce(new.value->>'easing','') not in ('standard','snappy','soft')
  then raise exception 'Invalid public animation settings' using errcode = '22023'; end if;
  foreach entry in array array['themeReveal','themeIcon','navigationProgress','pageReveal','contentReveal','skeletonShimmer','imageReveal','dialogs','menus','buttonFeedback','microInteractions','ambientMotion','textRails'] loop
    if jsonb_typeof(new.value->'features'->entry) is distinct from 'boolean' then
      raise exception 'Every animation feature must be boolean' using errcode = '22023';
    end if;
  end loop;
  foreach entry in array array['theme','icon','navigation','page','content','skeleton','image','dialog','menu','button','micro'] loop
    if jsonb_typeof(new.value->'durations'->entry) is distinct from 'number'
       or not coalesce((new.value->'durations'->>entry) ~ '^[0-9]+$', false) then
      raise exception 'Every animation duration must be a whole number' using errcode = '22023';
    end if;
  end loop;
  if (new.value#>>'{durations,theme}')::numeric not between 300 and 500
     or (new.value#>>'{durations,icon}')::numeric not between 150 and 220
     or (new.value#>>'{durations,navigation}')::numeric not between 100 and 300
     or (new.value#>>'{durations,page}')::numeric not between 180 and 280
     or (new.value#>>'{durations,content}')::numeric not between 120 and 220
     or (new.value#>>'{durations,skeleton}')::numeric not between 800 and 2400
     or (new.value#>>'{durations,image}')::numeric not between 120 and 220
     or (new.value#>>'{durations,dialog}')::numeric not between 120 and 300
     or (new.value#>>'{durations,menu}')::numeric not between 120 and 180
     or (new.value#>>'{durations,button}')::numeric not between 100 and 220
     or (new.value#>>'{durations,micro}')::numeric not between 100 and 220
  then raise exception 'Animation duration outside allowed range' using errcode = '22023'; end if;
  return new;
end;
$$;
revoke all on function public.validate_animation_settings() from public;

-- Initialize the new selection without altering the previously saved switch or timing values.
update public.business_settings
set value = value || '{"appearanceVersion":"2"}'::jsonb,
    updated_at = greatest(clock_timestamp(),updated_at + interval '1 microsecond')
where key='animation_settings' and not (value ? 'appearanceVersion');

create or replace function public.get_public_animation_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'appearanceVersion',value->'appearanceVersion',
    'enabled',value->'enabled',
    'features',jsonb_build_object(
      'themeReveal', value#>'{features,themeReveal}',
      'themeIcon', value#>'{features,themeIcon}',
      'navigationProgress', value#>'{features,navigationProgress}',
      'pageReveal', value#>'{features,pageReveal}',
      'contentReveal', value#>'{features,contentReveal}',
      'skeletonShimmer', value#>'{features,skeletonShimmer}',
      'imageReveal', value#>'{features,imageReveal}',
      'dialogs', value#>'{features,dialogs}',
      'menus', value#>'{features,menus}',
      'buttonFeedback', value#>'{features,buttonFeedback}',
      'microInteractions', value#>'{features,microInteractions}',
      'ambientMotion', value#>'{features,ambientMotion}',
      'textRails', value#>'{features,textRails}'
    ),
    'durations',jsonb_build_object(
      'theme', value#>'{durations,theme}',
      'icon', value#>'{durations,icon}',
      'navigation', value#>'{durations,navigation}',
      'page', value#>'{durations,page}',
      'content', value#>'{durations,content}',
      'skeleton', value#>'{durations,skeleton}',
      'image', value#>'{durations,image}',
      'dialog', value#>'{durations,dialog}',
      'menu', value#>'{durations,menu}',
      'button', value#>'{durations,button}',
      'micro', value#>'{durations,micro}'
    ),
    'themeStyle',value->'themeStyle',
    'pageStyle',value->'pageStyle',
    'easing',value->'easing'
  ) from public.business_settings where key = 'animation_settings';
$$;
revoke all on function public.get_public_animation_settings() from public;
grant execute on function public.get_public_animation_settings() to anon, authenticated, service_role;


create or replace function public.set_business_setting(p_key text,p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;
  if p_key in ('animation_settings','appearance_version_1_backup') then
    raise exception 'Use dedicated appearance and animation settings controls' using errcode = '22023';
  end if;
  insert into public.business_settings(key,value,updated_by)
  values(p_key,p_value,auth.uid()) on conflict(key) do update
  set value = excluded.value, updated_by = excluded.updated_by,
      updated_at = timezone('utc'::text,now());
  insert into public.audit_events(action,user_id,details,entity_type,entity_id)
  values('setting_changed',auth.uid(),jsonb_build_object('setting_key',p_key,'new_value',p_value),'business_setting',null);
end;
$$;
revoke all on function public.set_business_setting(text,jsonb) from public;
grant execute on function public.set_business_setting(text,jsonb) to authenticated;

comment on function public.get_public_animation_settings() is 'Anonymous-safe presentation settings and active appearance version; never exposes the private immutable Version1 backup row.';
commit;
