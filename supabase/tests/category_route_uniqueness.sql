-- Existing alias URLs remain compatible without ambiguous external categories.
-- All fixtures roll back in the isolated migration verifier.
begin;

insert into public.categories(slug,name_he,name_en) values
  ('route-owner','קטגוריית בדיקה','Route owner');

do $$
declare
  v_alias text;
  v_key text;
  v_parent uuid;
  v_child uuid;
begin
  select id into v_parent from public.categories where slug='route-owner';
  for v_key in select distinct key from (values
    ('cameras'), ('servers'), ('routers'), ('accessories'),
    ('networkGear'), ('alarms'), ('intercom')
  ) expected(key) loop
    insert into public.categories(slug,name_he,name_en)
      values(v_key,'ראשית ' || v_key,'Root ' || v_key);
  end loop;

  for v_alias,v_key in select * from (values
    ('security-cameras','cameras'),
    ('nvr','servers'),
    ('network','routers'),
    ('tools','accessories'),
    ('network-gear','networkGear'),
    ('networkgear','networkGear'),
    ('alarm-systems','alarms'),
    ('intercom-access','intercom'),
    ('intercom-and-access','intercom')
  ) expected(alias,key) loop
    if public.catalog_category_route_key(v_alias) is distinct from v_key then
      raise exception 'Unexpected normalized route for alias %',v_alias;
    end if;
    begin
      insert into public.categories(slug,name_he,name_en)
        values(v_alias,'התנגשות','Alias collision');
      raise exception 'Duplicate external alias route accepted: %',v_alias;
    exception when unique_violation then null; end;
    begin
      insert into public.categories(slug,name_he,name_en,is_active)
        values(v_alias,'כבויה','Inactive alias collision',false);
      raise exception 'Inactive duplicate external alias route accepted: %',v_alias;
    exception when unique_violation then null; end;
    begin
      update public.categories set slug=v_alias where id=v_parent;
      raise exception 'External slug edit introduced duplicate route: %',v_alias;
    exception when unique_violation then null; end;

    -- A child keeps its raw slug and can use a root alias spelling safely.
    insert into public.categories(slug,name_he,name_en,parent_id)
      values(v_alias,'פנימית ' || v_alias,'Child ' || v_alias,v_parent)
      returning id into v_child;
    if (select parent_id from public.categories where id=v_child) <> v_parent then
      raise exception 'Alias spelling was not accepted as an internal category';
    end if;
    begin
      update public.categories set parent_id=null where id=v_child;
      raise exception 'Promoting child introduced duplicate external route: %',v_alias;
    exception when unique_violation then null; end;
    if (select parent_id from public.categories where id=v_child) <> v_parent then
      raise exception 'Rejected promotion changed the child parent';
    end if;
  end loop;

  if public.catalog_category_route_key('route-owner') <> 'route-owner'
     or public.catalog_category_route_key('constructor') <> 'constructor'
     or public.catalog_category_route_key(null) is not null then
    raise exception 'Unknown or null category slugs no longer preserve client behavior';
  end if;
end $$;
rollback;
