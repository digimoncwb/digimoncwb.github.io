begin;

-- Self assignment is limited to unowned community decks and the authenticated account.
create or replace function public.guard_site_deck_ownership() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); admin boolean:=public.site_is_admin(); enabled boolean:=public.site_accounts_enabled(); self_claim boolean:=false;
begin
    if tg_op='UPDATE' then
        self_claim:=coalesce(old.owner_user_id is null and old.tournament_result_id is null
            and new.tournament_result_id is null and new.owner_user_id=actor
            and public.site_is_member()
            and current_setting('app.site_self_claim',true)=old.id::text,false);
    end if;
    if not public.site_is_maintenance() then
        if enabled and not public.site_is_member() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
        if tg_op='INSERT' then
            if enabled and new.tournament_result_id is not null and not admin then raise exception 'Somente administradores podem alterar listas de torneios.' using errcode='42501'; end if;
            if new.owner_user_id is not null and new.owner_user_id is distinct from actor then raise exception 'Proprietário inválido.' using errcode='42501'; end if;
            new.owner_user_id:=case when new.tournament_result_id is null then actor else null end;
            new.created_by_user_id:=actor;
            new.updated_by_user_id:=actor;
        else
            if enabled and not admin and (old.tournament_result_id is not null or old.owner_user_id is distinct from actor) and not self_claim then
                raise exception 'Você não pode alterar este deck.' using errcode='42501';
            end if;
            if tg_op='UPDATE' then
                if new.created_by_user_id is distinct from old.created_by_user_id then raise exception 'O responsável original não pode ser alterado.' using errcode='42501'; end if;
                if new.owner_user_id is distinct from old.owner_user_id and
                    (not admin or coalesce(current_setting('app.site_owner_transfer',true),'')<>'approved') and not self_claim then
                    raise exception 'Use a transferência administrativa de propriedade.' using errcode='42501';
                end if;
                if enabled and not admin and new.tournament_result_id is distinct from old.tournament_result_id then
                    raise exception 'Não é permitido vincular este deck a um torneio.' using errcode='42501';
                end if;
                new.updated_by_user_id:=actor;
            end if;
        end if;
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.submit_account_request(p_type text,p_player_id uuid default null,p_decklist_id bigint default null,p_note text default '') returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare request_id uuid; deck public.decklists; previous_claim text;
begin
    if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
        raise exception 'Entre e confirme seu e-mail.' using errcode='42501';
    end if;
    if p_type in ('player_link','deck_claim') and not public.site_is_member() then raise exception 'Conta inativa.' using errcode='42501'; end if;
    if p_type='player_link' and (p_player_id is null or not exists(select 1 from public.players where id=p_player_id)) then raise exception 'Selecione um jogador cadastrado.'; end if;
    if p_type='deck_claim' then
        select * into deck from public.decklists
        where id=p_decklist_id and tournament_result_id is null for update;
        if not found or deck.owner_user_id is not null then
            raise exception 'Este deck já tem proprietário ou não está disponível.' using errcode='40001';
        end if;
        previous_claim:=current_setting('app.site_self_claim',true);
        perform set_config('app.site_self_claim',deck.id::text,true);
        update public.decklists set owner_user_id=auth.uid(),updated_at=now(),draft_revision=draft_revision+1 where id=deck.id;
        perform set_config('app.site_self_claim',coalesce(previous_claim,''),true);
        -- Reuse an existing request for this deck, and close obsolete competing requests.
        update public.account_requests set
            status=case when user_id=auth.uid() then 'approved' else 'rejected' end,
            reviewed_at=now(),reviewed_by=null,review_note='Deck assumido diretamente por uma conta.'
        where request_type='deck_claim' and decklist_id=deck.id and status='pending';
        select id into request_id from public.account_requests
        where request_type='deck_claim' and decklist_id=deck.id and user_id=auth.uid()
        order by created_at desc limit 1;
        if request_id is null then
            insert into public.account_requests(user_id,request_type,decklist_id,note,status,reviewed_at,review_note)
            values(auth.uid(),'deck_claim',deck.id,coalesce(p_note,''),'approved',now(),'Atribuição direta, sem aprovação administrativa.')
            returning id into request_id;
        end if;
        perform site_audit.record('deck.claimed','decklists',deck.id::text,jsonb_build_object('owner_user_id',auth.uid()));
        return request_id;
    end if;
    insert into public.account_requests(user_id,request_type,player_id,decklist_id,note)
    values(auth.uid(),p_type,case when p_type='player_link' then p_player_id end,
        case when p_type='deck_claim' then p_decklist_id end,coalesce(p_note,'')) returning id into request_id;
    return request_id;
end;
$$;

-- Administrative responses and searches do not expose account e-mail addresses.
create or replace function public.admin_list_site_accounts(p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select p.user_id,p.username,p.display_name,p.player_id,p.status,p.created_at,
            u.email_confirmed_at is not null as email_confirmed,
            exists(select 1 from public.admin_users where user_id=p.user_id) as is_admin
        from public.user_profiles p left join auth.users u on u.id=p.user_id
        where p.username ilike '%'||left(p_search,100)||'%'
            or p.display_name ilike '%'||left(p_search,100)||'%'
        order by p.created_at desc,p.user_id limit 50 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record('accounts.viewed','user_profiles',null,jsonb_build_object('offset',p_offset));
    return result;
end;
$$;

create or replace function public.admin_account_requests(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select r.*,p.username,p.display_name,pl.name as player_name
        from public.account_requests r join public.user_profiles p on p.user_id=r.user_id
        left join public.players pl on pl.id=r.player_id
        order by (r.status='pending') desc,r.created_at desc,r.id limit 50 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record('account_requests.viewed','account_requests',null,jsonb_build_object('offset',p_offset));
    return result;
end;
$$;

commit;
