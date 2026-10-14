-- Owner requested a fast, soft 3D preview on the whole card. Keep original style.
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
     or coalesce(new.value->>'productPreviewStyle','') not in ('soft-reveal','3d-pop-up','3d-pop-up-smooth')
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

-- Apply only this presentation selection and record the owner-requested migration.
do $$
declare previous jsonb; old_revision timestamptz; next_value jsonb; next_revision timestamptz;
begin
  select value, updated_at into previous, old_revision from public.business_settings where key='animation_settings' for update;
  if not found then raise exception 'Animation settings migration required'; end if;
  next_value := jsonb_set(previous, '{productPreviewStyle}', '"3d-pop-up-smooth"'::jsonb);
  if next_value is distinct from previous then
    next_revision := greatest(clock_timestamp(), old_revision + interval '1 microsecond');
    update public.business_settings set value=next_value, updated_at=next_revision where key='animation_settings';
    insert into public.audit_events(action,user_id,details,entity_type,entity_id)
    values('setting_changed',null,jsonb_build_object('setting_key','animation_settings',
      'source','owner_requested_smooth_whole_card_preview_migration', 'previous_value',previous,
      'new_value',next_value,'previous_revision',old_revision,'revision',next_revision),'business_setting',null);
  end if;
end $$;
commit;
