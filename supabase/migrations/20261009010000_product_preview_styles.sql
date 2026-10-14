-- Named product preview styles; original 3D motion remains selectable.
begin;
create or replace function public.validate_animation_settings()
returns trigger language plpgsql set search_path = '' as $$
declare entry text;
begin
  if new.key <> 'animation_settings' then return new; end if;
  -- Legacy clients and the immutable Version1 backup have no style field.
  if not (new.value ? 'productPreviewStyle') then
    new.value := new.value || jsonb_build_object('productPreviewStyle',
      case when new.value->>'appearanceVersion' = '1' then '3d-pop-up' else 'soft-reveal' end);
  end if;
  if jsonb_typeof(new.value) is distinct from 'object'
     or (new.value - array['appearanceVersion','enabled','features','durations','themeStyle','pageStyle','easing','productPreviewStyle']) <> '{}'::jsonb
     or coalesce(new.value->>'appearanceVersion','') not in ('1','2')
     or jsonb_typeof(new.value->'enabled') is distinct from 'boolean'
     or jsonb_typeof(new.value->'features') is distinct from 'object'
     or jsonb_typeof(new.value->'durations') is distinct from 'object'
     or ((new.value->'features') - array['themeReveal','themeIcon','navigationProgress','pageReveal','contentReveal','skeletonShimmer','imageReveal','dialogs','menus','buttonFeedback','microInteractions','ambientMotion','textRails']) <> '{}'::jsonb
     or ((new.value->'durations') - array['theme','icon','navigation','page','content','skeleton','image','dialog','menu','button','micro']) <> '{}'::jsonb
     or coalesce(new.value->>'themeStyle','') not in ('radial','fade')
     or coalesce(new.value->>'pageStyle','') not in ('lift','fade')
     or coalesce(new.value->>'productPreviewStyle','') not in ('soft-reveal','3d-pop-up')
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

-- Preserve every saved timing/switch and the immutable Version1 backup.
update public.business_settings
set value = value || jsonb_build_object('productPreviewStyle',
      case when value->>'appearanceVersion' = '1' then '3d-pop-up' else 'soft-reveal' end),
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
where key = 'animation_settings' and not (value ? 'productPreviewStyle');

create or replace function public.get_public_animation_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'appearanceVersion',value->'appearanceVersion',
    'productPreviewStyle',value->'productPreviewStyle',
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


create or replace function public.update_animation_settings(p_value jsonb, p_revision timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare current_revision timestamptz; previous_value jsonb; next_revision timestamptz;
begin
  if public.active_app_role() is distinct from 'ceo' then
    raise exception 'CEO required' using errcode = '42501';
  end if;
  select updated_at,value into current_revision,previous_value
  from public.business_settings where key = 'animation_settings' for update;
  if not found then raise exception 'Animation settings migration required' using errcode = '22023'; end if;
  if current_revision is distinct from p_revision then
    raise exception 'Animation settings changed concurrently' using errcode = 'PT409';
  end if;
  -- Normalize historical clients before both storage and audit capture.
  if not (p_value ? 'productPreviewStyle') then
    p_value := p_value || jsonb_build_object('productPreviewStyle',
      case when p_value->>'appearanceVersion' = '1' then '3d-pop-up' else 'soft-reveal' end);
  end if;
  -- clock_timestamp makes a revision advance even inside one transaction.
  next_revision := greatest(clock_timestamp(),current_revision + interval '1 microsecond');
  update public.business_settings set value = p_value, updated_by = auth.uid(), updated_at = next_revision
  where key = 'animation_settings';
  insert into public.audit_events(action,user_id,details,entity_type,entity_id)
  values('setting_changed',auth.uid(),jsonb_build_object(
    'setting_key','animation_settings','previous_value',previous_value,'new_value',p_value,
    'previous_revision',current_revision,'revision',next_revision
  ),'business_setting',null);
  return next_revision;
end;
$$;
revoke all on function public.update_animation_settings(jsonb,timestamptz) from public;
grant execute on function public.update_animation_settings(jsonb,timestamptz) to authenticated;

commit;
