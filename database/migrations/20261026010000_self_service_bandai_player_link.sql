begin;

alter table public.players add column if not exists avatar_url text;

-- Only the narrow self-service RPCs may create a player's own record or update its photo.
create or replace function public.guard_site_player_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if tg_op='UPDATE' and new.name='Jogador anonimizado' and new.bandai_nick is null
        and new.bandai_id is null and new.is_active=false then new.avatar_url:=null; end if;
    if public.site_accounts_enabled() and not public.site_is_maintenance() and not public.site_is_admin() then
        if tg_op='DELETE' then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
        if coalesce(current_setting('app.site_player_link_actor',true),'')<>coalesce(auth.uid()::text,'')
            or coalesce(current_setting('app.site_player_link_target',true),'')<>new.id::text
            or not public.site_has_identity() then
            raise exception 'Acesso administrativo necessário.' using errcode='42501';
        end if;
        if tg_op='INSERT' then
            if new.name is distinct from new.bandai_nick or new.bandai_id is not null then
                raise exception 'Cadastro de jogador inválido.' using errcode='42501';
            end if;
        elsif (to_jsonb(new)-'avatar_url') is distinct from (to_jsonb(old)-'avatar_url')
            or not exists(select 1 from public.user_profiles where user_id=auth.uid() and player_id=new.id) then
            raise exception 'Você só pode atualizar a foto do seu jogador.' using errcode='42501';
        end if;
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_site_player_write() from public,anon,authenticated;
drop trigger if exists site_admin_write on public.players;
create trigger site_admin_write before insert or update or delete on public.players
for each row execute function public.guard_site_player_write();

create or replace function public.search_bandai_players(p_name text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare term text:=lower(regexp_replace(btrim(p_name),'\s+',' ','g')); result jsonb;
begin
    if not public.site_has_identity() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
    if term is null or length(term)<2 then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select p.id,p.name,p.bandai_nick,
            not exists(select 1 from public.user_profiles u where u.player_id=p.id and u.user_id<>auth.uid()) as available
        from public.players p
        where strpos(lower(p.name),left(term,100))>0 or strpos(lower(coalesce(p.bandai_nick,'')),left(term,100))>0
        order by (lower(regexp_replace(btrim(coalesce(p.bandai_nick,'')),'\s+',' ','g'))=term
            or lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=term) desc,p.name,p.id limit 12
    ) rows;
    return result;
end;
$$;

create or replace function public.sync_my_player_google_avatar() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid; photo text;
    previous_actor text:=current_setting('app.site_player_link_actor',true);
    previous_target text:=current_setting('app.site_player_link_target',true);
begin
    if not public.site_has_identity() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
    select player_id into target from public.user_profiles where user_id=auth.uid() for update;
    if target is null then return; end if;
    select candidate into photo from auth.users u,
        lateral (values (u.raw_user_meta_data->>'avatar_url',1),(u.raw_user_meta_data->>'picture',2)) photos(candidate,priority)
        where u.id=auth.uid() and candidate ~ '^https://[a-zA-Z0-9.-]+\.googleusercontent\.com/'
        order by priority limit 1;
    if photo is null then return; end if;
    perform set_config('app.site_player_link_actor',auth.uid()::text,true);
    perform set_config('app.site_player_link_target',target::text,true);
    update public.players set avatar_url=photo where id=target and avatar_url is distinct from photo;
    perform set_config('app.site_player_link_actor',coalesce(previous_actor,''),true);
    perform set_config('app.site_player_link_target',coalesce(previous_target,''),true);
end;
$$;

create or replace function public.complete_my_player_link(p_bandai_name text,p_player_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles; target uuid; matched uuid[]; created boolean:=false;
    nickname text:=regexp_replace(btrim(p_bandai_name),'\s+',' ','g');
    previous_actor text:=current_setting('app.site_player_link_actor',true);
    previous_target text:=current_setting('app.site_player_link_target',true);
begin
    if not public.site_has_identity() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
    if public.site_legal_ready() and not public.site_legal_current(auth.uid()) then
        raise exception 'Conclua os aceites antes de vincular seu jogador.' using errcode='42501';
    end if;
    if nickname is null or length(nickname) not between 2 and 100 then raise exception 'Informe seu nome na Bandai, de 2 a 100 caracteres.' using errcode='22023'; end if;
    -- Serialize claims with administrative reviews and concurrent first-logins.
    perform pg_advisory_xact_lock(868601);
    select * into profile from public.user_profiles where user_id=auth.uid() for update;
    if profile.player_id is not null then
        if p_player_id is not null and p_player_id<>profile.player_id then raise exception 'Sua conta já tem um jogador vinculado.' using errcode='40001'; end if;
        perform public.sync_my_player_google_avatar();
        return to_jsonb(profile);
    end if;
    if p_player_id is not null then
        select id into target from public.players where id=p_player_id
            and (lower(regexp_replace(btrim(name),'\s+',' ','g'))=lower(nickname)
                or lower(regexp_replace(btrim(coalesce(bandai_nick,'')),'\s+',' ','g'))=lower(nickname)) for update;
        if target is null then raise exception 'Selecione novamente seu jogador na lista.' using errcode='40001'; end if;
    else
        select array_agg(id) into matched from public.players
        where lower(regexp_replace(btrim(name),'\s+',' ','g'))=lower(nickname)
            or lower(regexp_replace(btrim(coalesce(bandai_nick,'')),'\s+',' ','g'))=lower(nickname);
        if cardinality(matched)>1 then raise exception 'Há mais de um jogador com esse nome. Selecione o seu na lista.' using errcode='22023'; end if;
        target:=matched[1];
        if target is null then
            target:=gen_random_uuid(); created:=true;
            perform set_config('app.site_player_link_actor',auth.uid()::text,true);
            perform set_config('app.site_player_link_target',target::text,true);
            insert into public.players(id,name,bandai_nick) values(target,nickname,nickname);
        else
            perform 1 from public.players where id=target for update;
        end if;
    end if;
    if exists(select 1 from public.user_profiles where player_id=target and user_id<>auth.uid()) then
        raise exception 'Este jogador já está vinculado a outra conta.' using errcode='23505';
    end if;
    update public.user_profiles set player_id=target,updated_at=now() where user_id=auth.uid() returning * into profile;
    update public.account_requests set status=case when user_id=auth.uid() and player_id=target then 'approved' else 'rejected' end,
        reviewed_at=now(),reviewed_by=null,review_note='Vínculo direto pelo titular, sem aprovação administrativa.'
    where request_type='player_link' and status='pending' and (user_id=auth.uid() or player_id=target);
    perform public.sync_my_player_google_avatar();
    perform set_config('app.site_player_link_actor',coalesce(previous_actor,''),true);
    perform set_config('app.site_player_link_target',coalesce(previous_target,''),true);
    perform site_audit.record('player.linked','players',target::text,jsonb_build_object('user_id',auth.uid(),'created',created,'method','self_service'));
    return to_jsonb(profile);
end;
$$;

create or replace function public.site_is_member() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select public.site_has_identity() and (not public.site_accounts_enabled() or
        (public.site_legal_current(auth.uid()) and exists(select 1 from public.user_profiles p where p.user_id=auth.uid()
            and (p.player_id is not null or exists(select 1 from public.admin_users a where a.user_id=p.user_id)))))
$$;

create or replace function public.my_site_account() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
    select jsonb_build_object('profile',to_jsonb(p),'is_admin',public.site_is_admin(),
        'is_member',public.site_is_member(),'legal_current',public.site_legal_current(auth.uid()),
        'player_link_required',p.player_id is null and public.site_has_identity())
    from public.user_profiles p where user_id=auth.uid()
$$;

revoke all on function public.search_bandai_players(text),public.complete_my_player_link(text,uuid),public.sync_my_player_google_avatar() from public,anon;
grant execute on function public.search_bandai_players(text),public.complete_my_player_link(text,uuid),public.sync_my_player_google_avatar() to authenticated;

-- Copy existing Google pictures to players that were linked before this release.
update public.players p set avatar_url=photos.photo from (
    select distinct on (up.player_id) up.player_id,candidate as photo
    from public.user_profiles up join auth.users u on u.id=up.user_id,
        lateral (values (u.raw_user_meta_data->>'avatar_url',1),(u.raw_user_meta_data->>'picture',2)) urls(candidate,priority)
    where up.player_id is not null and up.status='active' and u.email_confirmed_at is not null
        and candidate ~ '^https://[a-zA-Z0-9.-]+\.googleusercontent\.com/'
    order by up.player_id,priority
) photos where p.id=photos.player_id and p.avatar_url is distinct from photos.photo;

commit;
