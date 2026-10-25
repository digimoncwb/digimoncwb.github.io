begin;

-- E-mails são visíveis apenas nesta consulta administrativa, nunca na lista pública de jogadores.
create or replace function public.admin_list_site_accounts(p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select p.user_id,p.username,p.display_name,p.player_id,p.status,p.created_at,u.email,
            u.email_confirmed_at is not null as email_confirmed,
            exists(select 1 from public.admin_users where user_id=p.user_id) as is_admin
        from public.user_profiles p left join auth.users u on u.id=p.user_id
        where p.username ilike '%'||left(p_search,100)||'%'
            or p.display_name ilike '%'||left(p_search,100)||'%'
            or u.email ilike '%'||left(p_search,100)||'%'
        order by p.created_at desc,p.user_id limit 50 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record('accounts.viewed','user_profiles',null,jsonb_build_object('offset',p_offset));
    return result;
end;
$$;

create or replace function public.admin_update_site_account(p_user_id uuid,p_status text,p_is_admin boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(868601);
    select * into profile from public.user_profiles where user_id=p_user_id for update;
    if not found then raise exception 'Conta não encontrada.'; end if;
    if p_is_admin is true and not exists(
        select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
        and u.email not like '%@admin.digistats.local' and coalesce(p_status,profile.status)='active'
    ) then raise exception 'Selecione uma conta ativa com e-mail real confirmado.' using errcode='42501'; end if;
    if p_status is not null then update public.user_profiles set status=p_status,updated_at=now() where user_id=p_user_id; end if;
    if p_is_admin is true then
        insert into public.admin_users(user_id,username,display_name,created_by)
        values(p_user_id,profile.username,profile.display_name,auth.uid()) on conflict(user_id) do nothing;
    elsif p_is_admin is false then delete from public.admin_users where user_id=p_user_id;
    end if;
    if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end;
$$;

create or replace function public.admin_account_requests(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select r.*,p.username,p.display_name,u.email,pl.name as player_name
        from public.account_requests r join public.user_profiles p on p.user_id=r.user_id
        left join auth.users u on u.id=p.user_id left join public.players pl on pl.id=r.player_id
        order by (r.status='pending') desc,r.created_at desc,r.id limit 50 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record('account_requests.viewed','account_requests',null,jsonb_build_object('offset',p_offset));
    return result;
end;
$$;

commit;
