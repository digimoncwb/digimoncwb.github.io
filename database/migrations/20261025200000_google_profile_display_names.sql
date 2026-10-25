begin;

-- Provider metadata is only a suggested display name; it never establishes
-- player ownership, administrative roles or authenticated legal acceptance.
create or replace function public.bootstrap_user_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    insert into public.user_profiles(user_id,auth_user_id,username,display_name)
    values(new.id,new.id,'u_'||replace(new.id::text,'-',''),
        left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),
            nullif(btrim(new.raw_user_meta_data->>'full_name'),''),
            nullif(btrim(new.raw_user_meta_data->>'name'),''),'Novo usuário'),100))
    on conflict(user_id) do nothing;
    return new;
end;
$$;
revoke all on function public.bootstrap_user_profile() from public,anon,authenticated;

commit;
