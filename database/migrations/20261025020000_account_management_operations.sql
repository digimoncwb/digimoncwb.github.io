begin;

create or replace function public.submit_account_request(p_type text,p_player_id uuid default null,p_decklist_id bigint default null,p_note text default '') returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare request_id uuid;
begin
    if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
        raise exception 'Entre e confirme seu e-mail.' using errcode='42501';
    end if;
    if p_type in ('player_link','deck_claim') and not public.site_is_member() then raise exception 'Conta inativa.' using errcode='42501'; end if;
    if p_type='player_link' and (p_player_id is null or not exists(select 1 from public.players where id=p_player_id)) then raise exception 'Selecione um jogador cadastrado.'; end if;
    if p_type='deck_claim' and not exists(select 1 from public.decklists where id=p_decklist_id and tournament_result_id is null and owner_user_id is null) then
        raise exception 'Este deck não está disponível para solicitação de propriedade.';
    end if;
    insert into public.account_requests(user_id,request_type,player_id,decklist_id,note)
    values(auth.uid(),p_type,case when p_type='player_link' then p_player_id end,
        case when p_type='deck_claim' then p_decklist_id end,coalesce(p_note,'')) returning id into request_id;
    return request_id;
end;
$$;

create or replace function public.site_active_admin_count() returns integer
language sql stable security definer set search_path=pg_catalog,public as $$
    select count(*)::integer from public.admin_users a join public.user_profiles p on p.user_id=a.user_id
    join auth.users u on u.id=a.user_id where p.status='active' and u.email_confirmed_at is not null
    and (not public.site_accounts_enabled() or u.email not like '%@admin.digistats.local')
$$;

create or replace function public.admin_update_site_account(p_user_id uuid,p_status text,p_is_admin boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(868601);
    select * into profile from public.user_profiles where user_id=p_user_id for update;
    if not found then raise exception 'Conta não encontrada.'; end if;
    if p_status is not null then update public.user_profiles set status=p_status,updated_at=now() where user_id=p_user_id; end if;
    if p_is_admin is true then
        insert into public.admin_users(user_id,username,display_name,created_by)
        values(p_user_id,profile.username,profile.display_name,auth.uid()) on conflict(user_id) do nothing;
    elsif p_is_admin is false then delete from public.admin_users where user_id=p_user_id;
    end if;
    if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end;
$$;

create or replace function public.admin_transfer_community_deck(p_decklist_id bigint,p_owner_user_id uuid,p_updated_at timestamptz,p_reason text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Informe o motivo da transferência.'; end if;
    if not exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id where p.user_id=p_owner_user_id and p.status='active' and u.email_confirmed_at is not null) then raise exception 'Selecione uma conta ativa com e-mail confirmado.'; end if;
    perform set_config('app.site_owner_transfer','approved',true);
    update public.decklists set owner_user_id=p_owner_user_id,updated_at=now(),draft_revision=draft_revision+1
    where id=p_decklist_id and tournament_result_id is null and updated_at=p_updated_at;
    if not found then raise exception 'Deck alterado ou não encontrado. Atualize a lista.' using errcode='40001'; end if;
    perform site_audit.record('deck.transferred','decklists',p_decklist_id::text,jsonb_build_object('reason',btrim(p_reason),'owner_user_id',p_owner_user_id));
end;
$$;

create or replace function public.admin_review_account_request(p_request_id uuid,p_decision text,p_note text default '') returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare request public.account_requests; current_deck public.decklists;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if p_decision not in ('approved','rejected','completed') then raise exception 'Decisão inválida.'; end if;
    perform pg_advisory_xact_lock(868601);
    select * into request from public.account_requests where id=p_request_id and status='pending' for update;
    if not found then raise exception 'Solicitação já analisada ou não encontrada.' using errcode='40001'; end if;
    if p_decision='approved' and request.request_type='player_link' then
        if not exists(select 1 from public.user_profiles where user_id=request.user_id and status='active') then raise exception 'Conta inativa.'; end if;
        update public.user_profiles set player_id=request.player_id,updated_at=now() where user_id=request.user_id;
    elsif p_decision='approved' and request.request_type='deck_claim' then
        select * into current_deck from public.decklists where id=request.decklist_id and tournament_result_id is null and owner_user_id is null for update;
        if not found then raise exception 'Este deck já tem proprietário ou não está disponível.'; end if;
        perform public.admin_transfer_community_deck(current_deck.id,request.user_id,current_deck.updated_at,'Solicitação de propriedade aprovada');
    elsif p_decision='approved' and request.request_type='account_closure' then
        perform public.admin_update_site_account(request.user_id,'closed',false);
    elsif p_decision='completed' and request.request_type in ('player_link','deck_claim','account_closure') then
        raise exception 'Aprove ou recuse esta solicitação.';
    end if;
    update public.account_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=coalesce(p_note,'') where id=p_request_id;
end;
$$;

create or replace function public.admin_list_site_accounts(p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select p.user_id,p.username,p.display_name,p.player_id,p.status,p.created_at,
            exists(select 1 from public.admin_users where user_id=p.user_id) as is_admin
        from public.user_profiles p where p.username ilike '%'||left(p_search,100)||'%' or p.display_name ilike '%'||left(p_search,100)||'%'
        order by p.created_at desc,p.user_id limit 50 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record('accounts.viewed','user_profiles',null,jsonb_build_object('offset',p_offset));
    return result;
end;
$$;

create or replace function public.my_site_data() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if auth.uid() is null then raise exception 'Entre para consultar seus dados.' using errcode='42501'; end if;
    select jsonb_build_object(
        'profile',(select to_jsonb(p) from public.user_profiles p where user_id=auth.uid()),
        'email',(select email from auth.users where id=auth.uid()),
        'player',(select to_jsonb(p) from public.players p join public.user_profiles u on u.player_id=p.id where u.user_id=auth.uid()),
        'decks',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'creator_player_id',creator_player_id,'deck_format_id',deck_format_id,'draft_cards',draft_cards,'updated_at',updated_at)),'[]') from public.decklists where owner_user_id=auth.uid()),
        'requests',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.account_requests r where user_id=auth.uid())
    ) into result;
    perform site_audit.record('account.data_exported','user_profiles',auth.uid()::text,'{}');
    return result;
end;
$$;

create or replace function public.admin_account_requests(p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select r.*,p.username,p.display_name from public.account_requests r join public.user_profiles p on p.user_id=r.user_id
        order by (r.status='pending') desc,r.created_at desc,r.id limit 50 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record('account_requests.viewed','account_requests',null,jsonb_build_object('offset',p_offset));
    return result;
end;
$$;
create or replace function public.admin_security_configuration() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    return (select to_jsonb(c) from public.site_security_config c where singleton);
end;
$$;

create or replace function public.copy_community_deck(p_source_id bigint) returns bigint
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare source public.decklists; new_id bigint; contents jsonb; author_id uuid;
begin
    if not public.site_is_member() then raise exception 'Entre com uma conta ativa.' using errcode='42501'; end if;
    select * into source from public.decklists where id=p_source_id and tournament_result_id is null;
    if not found then raise exception 'Deck da comunidade não encontrado.'; end if;
    contents:=source.draft_cards;
    if contents is null then
        select coalesce(jsonb_agg(jsonb_build_object('code',card_code,'qty',qty) order by position),'[]') into contents from public.decklist_cards where decklist_id=p_source_id;
    end if;
    select player_id into author_id from public.user_profiles where user_id=auth.uid();
    insert into public.decklists(name,deck_format_id,tournament_result_id,source,draft_cards,draft_revision,archetype_id,creator_player_id)
    values(left(upper(source.name),110)||' (CÓPIA)',source.deck_format_id,null,'builder',contents,1,source.archetype_id,author_id)
    returning id into new_id;
    return new_id;
end;
$$;

create or replace function public.delete_community_deck(p_decklist_id bigint,p_updated_at timestamptz) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare deck public.decklists;
begin
    select * into deck from public.decklists where id=p_decklist_id and tournament_result_id is null for update;
    if not found then raise exception 'Deck da comunidade não encontrado.' using errcode='P0002'; end if;
    if not public.site_is_admin() and not coalesce((public.site_accounts_enabled() and public.site_is_member() and deck.owner_user_id=auth.uid()),false) then
        raise exception 'Você não pode excluir este deck.' using errcode='42501';
    end if;
    if p_updated_at is null or deck.updated_at is distinct from p_updated_at then raise exception 'Este deck foi alterado. Atualize a lista.' using errcode='40001'; end if;
    delete from public.decklists where id=deck.id;
    return deck.id;
end;
$$;

create or replace function public.admin_audit_events(p_entity text default '',p_entity_id text default '',p_actor uuid default null,p_action text default '',p_from timestamptz default null,p_to timestamptz default null,p_offset integer default 0,p_export boolean default false,p_outcome text default '',p_operation text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select * from site_audit.events where (p_entity='' or entity_type=p_entity) and (p_entity_id='' or entity_id=p_entity_id)
        and (p_actor is null or actor_user_id=p_actor) and (p_action='' or action=p_action)
        and (p_outcome='' or outcome=p_outcome) and (p_operation='' or operation_id=p_operation)
        and (p_from is null or occurred_at>=p_from) and (p_to is null or occurred_at<p_to)
        order by occurred_at desc,event_id desc limit 100 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record(case when p_export then 'audit.exported' else 'audit.viewed' end,'audit_events',null,
        jsonb_build_object('entity',p_entity,'entity_id',p_entity_id,'outcome',p_outcome,'operation',p_operation,'from',p_from,'to',p_to,'offset',p_offset));
    return result;
end;
$$;

create or replace function public.admin_configure_site_accounts(p_enabled boolean,p_privacy_url text,p_privacy_version text,p_retention_days integer,p_retention_reason text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if public.site_accounts_enabled() and not p_enabled then raise exception 'O controle de contas já está ativo. A recuperação deve manter as permissões fechadas.'; end if;
    if p_enabled then
        if coalesce(p_privacy_url,'') !~ '^https://' or length(btrim(coalesce(p_privacy_version,'')))<1 then raise exception 'Publique o aviso de privacidade HTTPS e informe sua versão.'; end if;
        if p_retention_days is null or length(btrim(coalesce(p_retention_reason,'')))<10 then raise exception 'Defina a retenção e sua justificativa antes de ativar.'; end if;
        if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and email not like '%@admin.digistats.local') then
            raise exception 'Migre seu acesso administrativo para um e-mail pessoal confirmado antes de ativar.';
        end if;
        if not public.site_accounts_enabled() and not exists(select 1 from public.user_profiles where user_id=auth.uid() and privacy_version=p_privacy_version) then
            raise exception 'Salve a configuração, leia o aviso e atualize seu perfil antes de ativar.';
        end if;
    end if;
    update public.site_security_config set accounts_enabled=p_enabled,privacy_url=nullif(btrim(p_privacy_url),''),
        privacy_version=nullif(btrim(p_privacy_version),''),audit_retention_days=p_retention_days,retention_reason=p_retention_reason,updated_at=now() where singleton;
end;
$$;

create or replace function public.purge_site_audit() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare retention integer; removed integer; cutoff timestamptz;
begin
    if not public.site_is_maintenance() then raise exception 'Operação restrita à rotina de manutenção.' using errcode='42501'; end if;
    select audit_retention_days into retention from public.site_security_config where singleton;
    if retention is null then raise exception 'Retenção ainda não configurada.'; end if;
    cutoff:=now()-make_interval(days=>retention);
    delete from site_audit.events where occurred_at<cutoff;
    get diagnostics removed=row_count;
    perform site_audit.record('audit.retention_applied','audit_events',null,jsonb_build_object('before',cutoff,'removed',removed));
    return removed;
end;
$$;

-- Called only by backend integrations after validating the user's JWT.
create or replace function public.site_actor_authorized(p_user_id uuid,p_require_admin boolean default true) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select not public.site_accounts_enabled() or exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
        where p.user_id=p_user_id and p.status='active' and u.email_confirmed_at is not null
        and u.email not like '%@admin.digistats.local'
        and p.privacy_version=(select privacy_version from public.site_security_config where singleton)
        and (not p_require_admin or exists(select 1 from public.admin_users where user_id=p_user_id)))
$$;

create or replace function public.record_site_integration_event(p_actor_user_id uuid,p_operation text,p_execution_id uuid,p_status integer) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    if p_operation !~ '^[a-z0-9-]{1,80}$' or p_status not between 100 and 599 then raise exception 'Evento inválido.'; end if;
    insert into site_audit.events(actor_user_id,actor_kind,action,entity_type,entity_id,operation_id,outcome,changes)
    values(p_actor_user_id,case when p_actor_user_id is not null then 'user' when p_status in (401,403) then 'anonymous' else 'service' end,
        'integration.'||p_operation,'integration',p_execution_id::text,p_execution_id::text,
        case when p_status in (401,403) then 'denied' when p_status>=400 then 'failure' else 'success' end,
        jsonb_build_object('http_status',p_status));
end;
$$;

do $$
declare fn record;
begin
    for fn in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('submit_account_request','site_active_admin_count','admin_update_site_account','admin_transfer_community_deck','admin_review_account_request','admin_list_site_accounts','admin_account_requests','admin_security_configuration','my_site_data','copy_community_deck','delete_community_deck','admin_audit_events','admin_configure_site_accounts','purge_site_audit','site_actor_authorized','record_site_integration_event') loop
        execute 'revoke all on function '||fn.signature||' from public,anon,authenticated';
        if fn.signature like 'purge_site_audit(%' or fn.signature like 'site_actor_authorized(%' or fn.signature like 'record_site_integration_event(%' then
            execute 'grant execute on function '||fn.signature||' to service_role';
        elsif fn.signature not like 'site_active_admin_count(%' then
            execute 'grant execute on function '||fn.signature||' to authenticated';
        end if;
    end loop;
end;
$$;

commit;
