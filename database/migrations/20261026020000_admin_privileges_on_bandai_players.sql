begin;

-- Reserved administrative roles have no e-mail or preselected Auth account.
create table public.player_admin_grants (
    player_id uuid primary key references public.players(id) on delete restrict,
    username text not null unique check(username=lower(username) and username ~ '^[a-z0-9_-]{3,40}$'),
    display_name text not null,
    enabled boolean not null default true,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);
alter table public.player_admin_grants enable row level security;
revoke all on public.player_admin_grants from public,anon,authenticated;
alter table public.admin_users add column admin_player_id uuid references public.players(id) on delete restrict;
create trigger site_player_admin_grant_audit after insert or update or delete on public.player_admin_grants
for each row execute function site_audit.capture('player_id','username','display_name','enabled','created_by');

create function public.sync_player_admin_user(p_user_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles; reserved public.player_admin_grants;
begin
    select * into profile from public.user_profiles where user_id=p_user_id for update;
    delete from public.admin_users a where a.user_id=p_user_id and a.admin_player_id is not null
        and (profile.status is distinct from 'active' or a.admin_player_id is distinct from profile.player_id
            or not exists(select 1 from public.player_admin_grants g where g.player_id=a.admin_player_id and g.enabled));
    if profile.status is distinct from 'active' then return; end if;
    if not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')) then return; end if;
    select * into reserved from public.player_admin_grants where player_id=profile.player_id and enabled;
    if not found then return; end if;
    insert into public.admin_users(user_id,username,display_name,admin_player_id,created_by)
    values(p_user_id,reserved.username,reserved.display_name,reserved.player_id,reserved.created_by)
    on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,
        admin_player_id=excluded.admin_player_id;
end;
$$;
revoke all on function public.sync_player_admin_user(uuid) from public,anon,authenticated;

create function public.sync_profile_player_admin() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.sync_player_admin_user(new.user_id); return new; end;
$$;
revoke all on function public.sync_profile_player_admin() from public,anon,authenticated;
create trigger site_player_admin_membership after insert or update of player_id,status on public.user_profiles
for each row execute function public.sync_profile_player_admin();

-- Keep all original linking, legal acceptance, photo, uniqueness and audit checks.
alter function public.complete_my_player_link(text,uuid) rename to complete_my_player_link_without_admin;
revoke all on function public.complete_my_player_link_without_admin(text,uuid) from public,anon,authenticated;
create function public.complete_my_player_link(p_bandai_name text,p_player_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    result:=public.complete_my_player_link_without_admin(p_bandai_name,p_player_id);
    if exists(select 1 from public.player_admin_grants where player_id=(result->>'player_id')::uuid and enabled) then
        if not exists(select 1 from auth.identities where user_id=auth.uid() and provider='google') then
            raise exception 'Entre com Google para vincular este jogador administrador.' using errcode='42501';
        end if;
        perform public.sync_player_admin_user(auth.uid());
    end if;
    return result;
end;
$$;
revoke all on function public.complete_my_player_link(text,uuid) from public,anon;
grant execute on function public.complete_my_player_link(text,uuid) to authenticated;

create or replace function public.admin_update_site_account(p_user_id uuid,p_status text,p_is_admin boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(868601);
    select * into profile from public.user_profiles where user_id=p_user_id for update;
    if not found then raise exception 'Conta não encontrada.'; end if;
    if p_is_admin is true then
        if profile.player_id is null or coalesce(p_status,profile.status)<>'active'
            or not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
                and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')) then
            raise exception 'Selecione uma conta Google confirmada, ativa e vinculada a um jogador.' using errcode='42501';
        end if;
        insert into public.player_admin_grants(player_id,username,display_name,created_by)
        values(profile.player_id,profile.username,profile.display_name,auth.uid())
        on conflict(player_id) do update set enabled=true;
    elsif p_is_admin is false then
        update public.player_admin_grants set enabled=false where player_id=profile.player_id;
        delete from public.admin_users where user_id=p_user_id;
    end if;
    if p_status is not null then update public.user_profiles set status=p_status,updated_at=now() where user_id=p_user_id; end if;
    perform public.sync_player_admin_user(p_user_id);
    if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end;
$$;

-- Maintenance-only transition: preserve the explicitly selected Google admin;
-- release other legacy/password-only identities without changing or deleting Auth e-mails.
create function public.reserve_legacy_player_admins(p_keep_user_id uuid) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare legacy record; affected integer:=0;
begin
    if not public.site_is_maintenance() then raise exception 'Operação de manutenção necessária.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(868601);
    if not exists(select 1 from public.admin_users a join public.user_profiles p on p.user_id=a.user_id
        join auth.users u on u.id=a.user_id where a.user_id=p_keep_user_id and p.status='active'
        and p.player_id is not null and u.email_confirmed_at is not null
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
        and (not public.site_accounts_enabled() or public.site_legal_current(u.id))) then
        raise exception 'A conta Google administrativa preservada não está pronta.' using errcode='42501';
    end if;
    if exists(select 1 from public.admin_users a left join public.user_profiles p on p.user_id=a.user_id where p.player_id is null) then
        raise exception 'Vincule os jogadores dos administradores existentes antes da transição.';
    end if;
    insert into public.player_admin_grants(player_id,username,display_name,created_by)
    select p.player_id,a.username,a.display_name,p_keep_user_id from public.admin_users a
        join public.user_profiles p on p.user_id=a.user_id
    on conflict(player_id) do nothing;
    update public.admin_users a set admin_player_id=p.player_id from public.user_profiles p where p.user_id=a.user_id;
    for legacy in select a.user_id,p.player_id from public.admin_users a join public.user_profiles p on p.user_id=a.user_id
        where a.user_id<>p_keep_user_id and not exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='google')
        for update of a,p
    loop
        delete from public.admin_users where user_id=legacy.user_id;
        update public.user_profiles set player_id=null,updated_at=now() where user_id=legacy.user_id;
        perform site_audit.record('admin.player_reserved','players',legacy.player_id::text,
            jsonb_build_object('previous_user_id',legacy.user_id,'email_binding_removed',true));
        affected:=affected+1;
    end loop;
    if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
    return affected;
end;
$$;
revoke all on function public.reserve_legacy_player_admins(uuid) from public,anon,authenticated;
grant execute on function public.reserve_legacy_player_admins(uuid) to service_role;

create function public.admin_list_player_admins() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select g.player_id,p.name as player_name,p.bandai_nick,g.username,g.enabled,
            exists(select 1 from public.admin_users a where a.admin_player_id=g.player_id) as claimed
        from public.player_admin_grants g join public.players p on p.id=g.player_id order by p.name
    ) rows;
    return result;
end;
$$;
revoke all on function public.admin_list_player_admins() from public,anon;
grant execute on function public.admin_list_player_admins() to authenticated;

commit;
