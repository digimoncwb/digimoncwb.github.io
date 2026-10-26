begin;

-- This list defines existing player records, never future e-mails or accounts.
do $$
declare expected record; target uuid; keep_user uuid;
begin
    perform pg_advisory_xact_lock(868601);
    select a.user_id into keep_user from public.admin_users a join public.user_profiles p on p.user_id=a.user_id
    where p.username='edu_lopes' and p.status='active'
        and exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='google');
    if keep_user is null then raise exception 'A conta administrativa Eduardo Lopes deve ser preservada.'; end if;
    for expected in select * from (values
        ('Marcio Braga','braga'),('Lukas Fujisawa','fujisawa'),('Matheus Fonseca','fonseca'),
        ('Carlos Fortes','fortes'),('Philippe Oliveira','oliveira'),('Matheus Souza','souza')
    ) names(player_name,admin_username)
    loop
        if (select count(*) from public.players where lower(btrim(name))=lower(expected.player_name))<>1 then
            raise exception 'O jogador % deve corresponder a um único cadastro.',expected.player_name;
        end if;
    end loop;
    -- Eduardo keeps his current account role; claiming his player does not grant admin.
    update public.admin_users set admin_player_id=null where user_id=keep_user;
    delete from public.admin_users a using public.player_admin_grants g,public.players p
    where a.admin_player_id=g.player_id and p.id=g.player_id and a.user_id<>keep_user and p.name not in
        ('Marcio Braga','Lukas Fujisawa','Matheus Fonseca','Carlos Fortes','Philippe Oliveira','Matheus Souza');
    delete from public.player_admin_grants g using public.players p
    where p.id=g.player_id and p.name not in
        ('Marcio Braga','Lukas Fujisawa','Matheus Fonseca','Carlos Fortes','Philippe Oliveira','Matheus Souza');
    for expected in select * from (values
        ('Marcio Braga','braga'),('Lukas Fujisawa','fujisawa'),('Matheus Fonseca','fonseca'),
        ('Carlos Fortes','fortes'),('Philippe Oliveira','oliveira'),('Matheus Souza','souza')
    ) names(player_name,admin_username)
    loop
        select id into target from public.players where lower(btrim(name))=lower(expected.player_name);
        insert into public.player_admin_grants(player_id,username,display_name,created_by)
        values(target,expected.admin_username,expected.player_name,keep_user) on conflict(player_id) do nothing;
        perform public.sync_player_admin_user(u.user_id) from public.user_profiles u where u.player_id=target;
    end loop;
    if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end;
$$;

-- Manually promoting a different account does not expand the automatic-claim list.
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
        if exists(select 1 from public.player_admin_grants where player_id=profile.player_id) then
            update public.player_admin_grants set enabled=true where player_id=profile.player_id;
        else
            insert into public.admin_users(user_id,username,display_name,created_by)
            values(p_user_id,profile.username,profile.display_name,auth.uid()) on conflict(user_id) do nothing;
        end if;
    elsif p_is_admin is false then
        update public.player_admin_grants set enabled=false where player_id=profile.player_id;
        delete from public.admin_users where user_id=p_user_id;
    end if;
    if p_status is not null then update public.user_profiles set status=p_status,updated_at=now() where user_id=p_user_id; end if;
    perform public.sync_player_admin_user(p_user_id);
    if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end;
$$;

commit;
