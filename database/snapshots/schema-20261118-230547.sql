


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."admin_account_requests"("p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_account_requests"("p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_audit_events"("p_entity" "text" DEFAULT ''::"text", "p_entity_id" "text" DEFAULT ''::"text", "p_actor" "uuid" DEFAULT NULL::"uuid", "p_action" "text" DEFAULT ''::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_offset" integer DEFAULT 0, "p_export" boolean DEFAULT false, "p_outcome" "text" DEFAULT ''::"text", "p_operation" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare result jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
        select * from site_audit.events where (p_entity='' or entity_type=p_entity) and (p_entity_id='' or entity_id=p_entity_id)
        and (p_actor is null or actor_user_id=p_actor) and (p_action='' or action=p_action)
        and (p_outcome='' or outcome=p_outcome) and (p_operation='' or operation_id=p_operation or changes->>'parent_operation_id'=p_operation)
        and (p_from is null or occurred_at>=p_from) and (p_to is null or occurred_at<p_to)
        order by occurred_at desc,event_id desc limit 100 offset greatest(0,least(p_offset,100000))
    ) rows;
    perform site_audit.record(case when p_export then 'audit.exported' else 'audit.viewed' end,'audit_events',null,
        jsonb_build_object('entity',p_entity,'entity_id',p_entity_id,'outcome',p_outcome,'operation',p_operation,'from',p_from,'to',p_to,'offset',p_offset));
    return result;
end;
$$;


ALTER FUNCTION "public"."admin_audit_events"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_offset" integer, "p_export" boolean, "p_outcome" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_audit_export_page"("p_export_id" "uuid", "p_cursor" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare job site_audit.exports; result jsonb; next_cursor bigint; count_rows integer;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select * into job from site_audit.exports where id=p_export_id and actor_user_id=auth.uid() and stage='reading' and expires_at>now();
    if not found then raise exception 'Exportação indisponível ou expirada.' using errcode='42501'; end if;
    if p_cursor is not null and (p_cursor<1 or p_cursor>job.upper_event_id) then raise exception 'Cursor inválido.'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows) order by event_id desc),'[]'),min(event_id),count(*) into result,next_cursor,count_rows from (
        select * from site_audit.events where event_id<=job.upper_event_id and (p_cursor is null or event_id<p_cursor)
        and (coalesce(job.filters->>'entity','')='' or entity_type=job.filters->>'entity')
        and (coalesce(job.filters->>'entity_id','')='' or entity_id=job.filters->>'entity_id')
        and (job.filters->>'actor' is null or actor_user_id=(job.filters->>'actor')::uuid)
        and (coalesce(job.filters->>'action','')='' or action=job.filters->>'action')
        and (job.filters->>'from' is null or occurred_at>=(job.filters->>'from')::timestamptz)
        and occurred_at<(job.filters->>'to')::timestamptz
        and (coalesce(job.filters->>'outcome','')='' or outcome=job.filters->>'outcome')
        and (coalesce(job.filters->>'operation','')='' or operation_id=job.filters->>'operation' or changes->>'parent_operation_id'=job.filters->>'operation')
        order by event_id desc limit 500
    ) rows;
    return jsonb_build_object('events',result,'next_cursor',next_cursor,'done',count_rows<500);
end;
$$;


ALTER FUNCTION "public"."admin_audit_export_page"("p_export_id" "uuid", "p_cursor" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_begin_audit_export"("p_entity" "text" DEFAULT ''::"text", "p_entity_id" "text" DEFAULT ''::"text", "p_actor" "uuid" DEFAULT NULL::"uuid", "p_action" "text" DEFAULT ''::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_outcome" "text" DEFAULT ''::"text", "p_operation" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare export_id uuid; upper_id bigint; total integer; cutoff timestamptz:=least(coalesce(p_to,now()),now());
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if p_from is not null and p_from>=cutoff then raise exception 'Intervalo de exportação inválido.'; end if;
    select coalesce(max(event_id),0) into upper_id from site_audit.events;
    select count(*) into total from (select event_id from site_audit.events where event_id<=upper_id
        and (p_entity='' or entity_type=p_entity) and (p_entity_id='' or entity_id=p_entity_id)
        and (p_actor is null or actor_user_id=p_actor) and (p_action='' or action=p_action)
        and (p_from is null or occurred_at>=p_from) and occurred_at<cutoff
        and (p_outcome='' or outcome=p_outcome) and (p_operation='' or operation_id=p_operation or changes->>'parent_operation_id'=p_operation) limit 100001) bounded;
    if total>100000 then raise exception 'Mais de 100.000 eventos. Reduza o período ou refine os filtros.'; end if;
    insert into site_audit.exports(actor_user_id,filters,upper_event_id,expected_rows)
    values(auth.uid(),jsonb_build_object('entity',p_entity,'entity_id',p_entity_id,'actor',p_actor,'action',p_action,
        'from',p_from,'to',cutoff,'outcome',p_outcome,'operation',p_operation),upper_id,total) returning id into export_id;
    perform site_audit.record('audit.export_started','audit_exports',export_id::text,jsonb_build_object('rows',total,'from',p_from,'to',cutoff));
    return jsonb_build_object('id',export_id,'total',total,'upper_event_id',upper_id,'until',cutoff,'expires_in_seconds',900);
end;
$$;


ALTER FUNCTION "public"."admin_begin_audit_export"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_outcome" "text", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_complete_account_erasure"("p_job_id" "uuid", "p_external_reviewed" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare j public.site_account_erasure_jobs;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if p_external_reviewed is distinct from true then raise exception 'Conclua a revisão de e-mails, arquivos, fontes externas e conservação justificada.'; end if;
    select * into j from public.site_account_erasure_jobs where id=p_job_id for update;
    if not found or j.stage<>'auth_deleted' or exists(select 1 from auth.users where id=j.user_id) then raise exception 'Conclua primeiro a remoção de credenciais.'; end if;
    update public.site_account_erasure_jobs set stage='completed',completed_at=now(),external_reviewed_at=now(),completed_by=auth.uid() where id=j.id;
    update public.account_requests set status='completed',review_note='Atendimento concluído com desidentificação do perfil e revisão de conservação.',
        reviewed_at=now(),reviewed_by=auth.uid() where id=j.request_id;
end;
$$;


ALTER FUNCTION "public"."admin_complete_account_erasure"("p_job_id" "uuid", "p_external_reviewed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_configure_site_accounts"("p_enabled" boolean, "p_privacy_url" "text", "p_privacy_version" "text", "p_retention_days" integer, "p_retention_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_configure_site_accounts"("p_enabled" boolean, "p_privacy_url" "text", "p_privacy_version" "text", "p_retention_days" integer, "p_retention_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_configure_site_terms"("p_url" "text", "p_version" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if not exists(select 1 from public.site_legal_documents where kind='terms' and version=p_version and url=p_url) then
        raise exception 'Registre a versão e o texto dos termos publicados antes de selecioná-los.';
    end if;
    update public.site_security_config set terms_url=p_url,terms_version=p_version,updated_at=now() where singleton;
end;
$$;


ALTER FUNCTION "public"."admin_configure_site_terms"("p_url" "text", "p_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_finish_audit_export"("p_export_id" "uuid", "p_rows" integer, "p_aborted" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare job site_audit.exports;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    select * into job from site_audit.exports where id=p_export_id and actor_user_id=auth.uid() and stage='reading' for update;
    if not found then raise exception 'Exportação indisponível.'; end if;
    if not p_aborted and (job.expires_at<=now() or p_rows is distinct from job.expected_rows) then raise exception 'Exportação incompleta ou expirada. Gere um novo arquivo.'; end if;
    update site_audit.exports set stage=case when p_aborted then 'aborted' else 'prepared' end where id=job.id;
    perform site_audit.record(case when p_aborted then 'audit.export_aborted' else 'audit.export_prepared' end,'audit_exports',job.id::text,
        jsonb_build_object('rows',p_rows,'expected_rows',job.expected_rows,'filters',job.filters));
end;
$$;


ALTER FUNCTION "public"."admin_finish_audit_export"("p_export_id" "uuid", "p_rows" integer, "p_aborted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_account_links"("p_search" "text" DEFAULT ''::"text", "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare result jsonb;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
  select p.user_id,p.username,p.display_name,p.status,p.player_id,pl.name as player_name,pl.bandai_nick,pl.bandai_id
  from public.user_profiles p left join public.players pl on pl.id=p.player_id
  where p.username ilike '%'||left(p_search,100)||'%' or p.display_name ilike '%'||left(p_search,100)||'%'
   or pl.name ilike '%'||left(p_search,100)||'%' or pl.bandai_nick ilike '%'||left(p_search,100)||'%'
  order by p.display_name,p.user_id limit 50 offset greatest(0,least(p_offset,100000))
 ) rows;
 return result;
end $$;


ALTER FUNCTION "public"."admin_list_account_links"("p_search" "text", "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_player_admins"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare result jsonb;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
  select g.player_id,p.name as player_name,p.bandai_nick,g.username,g.enabled,
   exists(select 1 from public.admin_users a where a.admin_player_id=g.player_id) as claimed,
   exists(select 1 from public.user_profiles u where u.player_id=g.player_id) as linked,
   exists(select 1 from public.user_profiles u join public.admin_users a on a.user_id=u.user_id
    join auth.users au on au.id=u.user_id where u.player_id=g.player_id and u.status='active' and au.email_confirmed_at is not null) as is_admin
  from public.player_admin_grants g join public.players p on p.id=g.player_id order by p.name
 ) rows;
 return result;
end $$;


ALTER FUNCTION "public"."admin_list_player_admins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_site_accounts"("p_search" "text" DEFAULT ''::"text", "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_list_site_accounts"("p_search" "text", "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_prepare_account_erasure"("p_request_id" "uuid", "p_public_data_action" "text", "p_reason" "text", "p_reviewed" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
declare r public.account_requests; p public.user_profiles; job_id uuid; linked_player uuid;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if p_reviewed is distinct from true then raise exception 'Valide a titularidade, os registros e a decisão de conservação antes de continuar.'; end if;
    if p_public_data_action not in ('anonymize_linked_player','preserve_reviewed_history') or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Informe a decisão e sua justificativa.'; end if;
    perform pg_advisory_xact_lock(868601);
    select * into r from public.account_requests where id=p_request_id and request_type='erasure' and status='pending' for update;
    if not found then raise exception 'Solicitação de eliminação pendente não encontrada.'; end if;
    if r.user_id=auth.uid() then raise exception 'Outro administrador deve analisar a eliminação da sua conta.'; end if;
    if exists(select 1 from public.site_account_erasure_jobs where request_id=r.id) then raise exception 'Já existe um procedimento para esta solicitação.'; end if;
    select * into p from public.user_profiles where user_id=r.user_id for update;
    linked_player:=p.player_id;
    -- Restrict access first, protect the last admin and remove any privileged role.
    perform public.admin_update_site_account(p.user_id,'closed',false);
    perform set_config('app.site_owner_transfer','approved',true);
    update public.decklists set owner_user_id=null,draft_revision=draft_revision+1,updated_at=now()
        where owner_user_id=p.user_id and tournament_result_id is null;
    if p_public_data_action='anonymize_linked_player' and linked_player is not null then
        update public.players set name='Jogador anonimizado',bandai_id=null,bandai_nick=null,digilab_name=null,is_active=false where id=linked_player;
        if to_regclass('public.digilab_player_sync') is not null then
            execute 'delete from public.digilab_player_sync where player_id=$1' using linked_player;
        end if;
    end if;
    update public.user_profiles set username='deleted_'||replace(gen_random_uuid()::text,'-',''),display_name='Conta encerrada',
        player_id=null,privacy_version=null,privacy_acknowledged_at=null,terms_version=null,terms_accepted_at=null,
        adult_declared_at=null,legal_acceptance_id=null,anonymized_at=now(),updated_at=now() where user_id=p.user_id;
    update public.account_requests set note='',review_note=null where user_id=p.user_id;
    insert into public.site_account_erasure_jobs(request_id,user_id,prepared_by,public_data_action,reason)
    values(r.id,p.user_id,auth.uid(),p_public_data_action,btrim(p_reason)) returning id into job_id;
    perform site_audit.record('account.erasure_prepared','user_profiles',p.user_id::text,
        jsonb_build_object('job_id',job_id,'public_data_action',p_public_data_action));
    return job_id;
end;
$_$;


ALTER FUNCTION "public"."admin_prepare_account_erasure"("p_request_id" "uuid", "p_public_data_action" "text", "p_reason" "text", "p_reviewed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_record_audit_provider_review"("p_source" "text", "p_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    insert into site_audit.provider_reviews(source,reviewed_by,note) values(p_source,auth.uid(),p_note)
    on conflict(source) do update set reviewed_at=now(),reviewed_by=auth.uid(),note=excluded.note;
    perform site_audit.record('audit.provider_reviewed','audit_monitor',p_source,'{}');
end;
$$;


ALTER FUNCTION "public"."admin_record_audit_provider_review"("p_source" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_register_site_legal_document"("p_kind" "text", "p_version" "text", "p_url" "text", "p_body" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare result text;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    insert into public.site_legal_documents(kind,version,url,body,sha256,published_by)
    values(p_kind,btrim(p_version),btrim(p_url),p_body,encode(pg_catalog.sha256(convert_to(p_body,'UTF8')),'hex'),auth.uid()) returning sha256 into result;
    return result;
end;
$$;


ALTER FUNCTION "public"."admin_register_site_legal_document"("p_kind" "text", "p_version" "text", "p_url" "text", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_account_request"("p_request_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_review_account_request"("p_request_id" "uuid", "p_decision" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_link_players"("p_search" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare result jsonb;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 if length(btrim(p_search))<2 then return '[]'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
  select pl.id,pl.name,pl.bandai_nick,pl.bandai_id from public.players pl
  where coalesce(pl.is_active,true) and (pl.name ilike '%'||left(p_search,100)||'%'
   or pl.bandai_nick ilike '%'||left(p_search,100)||'%' or pl.bandai_id ilike '%'||left(p_search,100)||'%')
   and not exists(select 1 from public.user_profiles p where p.player_id=pl.id and p.user_id<>p_user_id)
  order by pl.name,pl.id limit 10
 ) rows;
 return result;
end $$;


ALTER FUNCTION "public"."admin_search_link_players"("p_search" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_security_configuration"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    return (select to_jsonb(c) from public.site_security_config c where singleton);
end;
$$;


ALTER FUNCTION "public"."admin_security_configuration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_account_player"("p_user_id" "uuid", "p_player_id" "uuid", "p_expected_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare profile public.user_profiles;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(868601);
 select * into profile from public.user_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Conta não encontrada.'; end if;
 if profile.player_id is distinct from p_expected_player_id then raise exception 'O vínculo mudou. Atualize antes de continuar.' using errcode='40001'; end if;
 if profile.player_id is not distinct from p_player_id then return; end if;
 if p_player_id is not null then
  if profile.status<>'active' or not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then
   raise exception 'Selecione uma conta ativa com e-mail confirmado.'; end if;
  if not exists(select 1 from public.players where id=p_player_id and coalesce(is_active,true)) then raise exception 'Jogador indisponível.'; end if;
  if exists(select 1 from public.user_profiles where player_id=p_player_id and user_id<>p_user_id) then raise exception 'Este jogador já está vinculado a outra conta.'; end if;
 end if;
 update public.user_profiles set player_id=p_player_id,updated_at=now() where user_id=p_user_id;
 if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
 perform site_audit.record('account.player_link.updated','user_profiles',p_user_id::text,
  jsonb_build_object('player_id',jsonb_build_object('before',profile.player_id,'after',p_player_id)));
exception when unique_violation then raise exception 'Este jogador já está vinculado a outra conta.';
end $$;


ALTER FUNCTION "public"."admin_set_account_player"("p_user_id" "uuid", "p_player_id" "uuid", "p_expected_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_site_audit_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare report jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    report:=site_audit.health_snapshot()||jsonb_build_object('recent_checks',(select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from (
        select checked_at,severity from site_audit.monitor_checks order by checked_at desc limit 12) rows));
    perform site_audit.record('audit.health_viewed','audit_monitor',null,'{}');
    return report;
end;
$$;


ALTER FUNCTION "public"."admin_site_audit_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_transfer_community_deck"("p_decklist_id" bigint, "p_owner_user_id" "uuid", "p_updated_at" timestamp with time zone, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_transfer_community_deck"("p_decklist_id" bigint, "p_owner_user_id" "uuid", "p_updated_at" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_site_account"("p_user_id" "uuid", "p_status" "text", "p_is_admin" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare profile public.user_profiles;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(868601);
 select * into profile from public.user_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Conta não encontrada.'; end if;
 if p_is_admin is true then
  if profile.player_id is null or coalesce(p_status,profile.status)<>'active'
   or not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
    and u.email is not null and u.email not like '%@admin.digistats.local') then
   raise exception 'Selecione uma conta ativa, com e-mail confirmado e jogador vinculado.';
  end if;
  update public.player_admin_grants set enabled=true where player_id=profile.player_id;
  insert into public.admin_users(user_id,username,display_name,created_by)
  values(p_user_id,profile.username,profile.display_name,auth.uid()) on conflict(user_id) do nothing;
 elsif p_is_admin is false then
  update public.player_admin_grants set enabled=false where player_id=profile.player_id;
  delete from public.admin_users where user_id=p_user_id;
 end if;
 if p_status is not null then update public.user_profiles set status=p_status,updated_at=now() where user_id=p_user_id; end if;
 perform public.sync_player_admin_user(p_user_id);
 if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end $$;


ALTER FUNCTION "public"."admin_update_site_account"("p_user_id" "uuid", "p_status" "text", "p_is_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_digilab_catalog_snapshot"("p_decks" "jsonb", "p_formats" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
    r record; resolved_id uuid; family_id_value uuid; codes text; color_name text;
    used_ids uuid[] := array[]::uuid[]; source_ids bigint[];
    created_count integer:=0; archived_count integer:=0;
    formats_created integer:=0; formats_updated integer:=0; previous_count integer;
    existing_format_id bigint; release_time timestamptz; timestamp_value timestamptz:=now();
begin
    if not pg_try_advisory_xact_lock(hashtext('digilab-catalog-sync')) then
        raise exception 'Sincronização de catálogo já em andamento';
    end if;
    if jsonb_typeof(p_decks) is distinct from 'array' or jsonb_array_length(p_decks)=0
       or jsonb_typeof(p_formats) is distinct from 'array' or jsonb_array_length(p_formats)=0 then
        raise exception 'Catálogo ou formatos incompletos';
    end if;
    select count(*) into previous_count from public.digilab_deck_catalog where is_active;
    if previous_count>0 and jsonb_array_length(p_decks)<previous_count*0.8 then
        raise exception 'Queda inesperada no catálogo; dados anteriores preservados';
    end if;
    create temporary table digilab_snapshot_plan (
        external_id bigint primary key, slug text unique not null, name text unique not null,
        family_slug text, family_name text, primary_color text, secondary_color text,
        display_card_id text, image_url text, total_entries integer, firsts integer, pilots integer,
        raw_payload jsonb, local_id uuid unique
    ) on commit drop;
    insert into digilab_snapshot_plan(external_id,slug,name,family_slug,family_name,primary_color,secondary_color,display_card_id,image_url,total_entries,firsts,pilots,raw_payload)
    select digilab_archetype_id,slug,name,family_slug,family_name,primary_color,secondary_color,display_card_id,image_url,total_entries,firsts,pilots,raw_payload
    from jsonb_to_recordset(p_decks) x(digilab_archetype_id bigint,slug text,name text,family_slug text,family_name text,primary_color text,secondary_color text,display_card_id text,image_url text,total_entries integer,firsts integer,pilots integer,raw_payload jsonb);
    if exists(select 1 from digilab_snapshot_plan where external_id<=0 or slug!~'^[a-z0-9-]+$' or btrim(name)='' or lower(primary_color) not in ('red','blue','yellow','green','black','purple','white') or primary_color is null or (secondary_color is not null and lower(secondary_color) not in ('red','blue','yellow','green','black','purple','white')) or (display_card_id is not null and display_card_id!~'^[A-Z0-9]+-[0-9]+$')) then
        raise exception 'Arquétipo inválido';
    end if;
    if exists(select 1 from digilab_snapshot_plan where display_card_id is not null and
        (image_url is null or image_url !~ ('^https://[^/]+/storage/v1/object/public/deck-images/digilab/'||display_card_id||'\.(jpg|webp|png)$'))) then
        raise exception 'Imagem do catálogo não armazenada no Supabase';
    end if;
    -- Resolve every identity before changing any names or slugs.
    for r in select * from digilab_snapshot_plan order by external_id loop
        resolved_id:=null;
        select m.deck_id into resolved_id from public.digilab_deck_sync m where m.digilab_archetype_id=r.external_id;
        if resolved_id is null then select m.deck_id into resolved_id from public.digilab_deck_sync m where m.digilab_deck_slug=r.slug; end if;
        if resolved_id is null then
            if (select count(*) from public.decks d where lower(btrim(d.name))=lower(btrim(r.name)))>1 then raise exception 'Nome local ambíguo: %',r.name; end if;
            select d.id into resolved_id from public.decks d where lower(btrim(d.name))=lower(btrim(r.name));
        end if;
        if resolved_id=any(used_ids) then raise exception 'Vínculo duplicado: %',r.name; end if;
        if resolved_id is null then created_count:=created_count+1; resolved_id:=gen_random_uuid(); end if;
        used_ids:=array_append(used_ids,resolved_id);
        update digilab_snapshot_plan p set local_id=resolved_id where p.external_id=r.external_id;
    end loop;
    update public.decks d set slug=null from digilab_snapshot_plan p where d.id=p.local_id and d.slug is distinct from p.slug;
    for r in select * from digilab_snapshot_plan order by external_id loop
        family_id_value:=null;
        if r.family_slug is not null then
            insert into public.deck_families(name,slug,is_active) values(r.family_name,r.family_slug,true)
            on conflict(slug) do update set name=excluded.name,is_active=true returning id into family_id_value;
        end if;
        codes:='';
        foreach color_name in array array[r.primary_color,r.secondary_color] loop
            if color_name is null then continue; end if;
            color_name:=case lower(color_name) when 'red' then 'r' when 'blue' then 'u' when 'yellow' then 'y' when 'green' then 'g' when 'black' then 'b' when 'purple' then 'p' when 'white' then 'w' end;
            if not color_name=any(string_to_array(codes,',')) then codes:=concat_ws(',',nullif(codes,''),color_name); end if;
        end loop;
        insert into public.decks(id,name,slug,colors,primary_color,secondary_color,display_card_id,family_id,is_active)
        values(r.local_id,r.name,r.slug,codes,r.primary_color,r.secondary_color,r.display_card_id,family_id_value,true)
        on conflict(id) do update set name=excluded.name,slug=excluded.slug,colors=excluded.colors,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,display_card_id=excluded.display_card_id,family_id=excluded.family_id,is_active=true;
        insert into public.digilab_deck_catalog(digilab_archetype_id,slug,name,family_slug,family_name,primary_color,secondary_color,display_card_id,total_entries,firsts,pilots,raw_payload,is_active,last_seen_at)
        values(r.external_id,r.slug,r.name,r.family_slug,r.family_name,r.primary_color,r.secondary_color,r.display_card_id,r.total_entries,r.firsts,r.pilots,coalesce(r.raw_payload,'{}'),true,timestamp_value)
        on conflict(digilab_archetype_id) do update set slug=excluded.slug,name=excluded.name,family_slug=excluded.family_slug,family_name=excluded.family_name,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,display_card_id=excluded.display_card_id,total_entries=excluded.total_entries,firsts=excluded.firsts,pilots=excluded.pilots,raw_payload=excluded.raw_payload,is_active=true,last_seen_at=excluded.last_seen_at;
        update public.digilab_deck_sync set digilab_deck_slug=r.slug,digilab_deck_name=r.name,updated_at=timestamp_value where digilab_archetype_id=r.external_id;
        insert into public.digilab_deck_sync(digilab_archetype_id,digilab_deck_slug,digilab_deck_name,deck_id)
        values(r.external_id,r.slug,r.name,r.local_id) on conflict(digilab_deck_slug) do update set digilab_archetype_id=excluded.digilab_archetype_id,digilab_deck_name=excluded.digilab_deck_name,deck_id=excluded.deck_id,updated_at=timestamp_value;
        if r.display_card_id is not null then
            update public.deck_images set image_url=r.image_url where deck_id=r.local_id;
            if not found then insert into public.deck_images(deck_id,image_url) values(r.local_id,r.image_url); end if;
        else
            delete from public.deck_images where deck_id=r.local_id;
        end if;
    end loop;
    update public.decks set is_active=false where is_active and not(id=any(used_ids));
    get diagnostics archived_count=row_count;
    select array_agg(external_id) into source_ids from digilab_snapshot_plan;
    update public.digilab_deck_catalog set is_active=false where is_active and not(digilab_archetype_id=any(source_ids));
    for r in select * from jsonb_to_recordset(p_formats) x(code text,name text,release_date text) loop
        if r.code is null or btrim(r.code)='' or r.name is null or btrim(r.name)='' then raise exception 'Formato inválido'; end if;
        release_time:=case when r.release_date is null then null else r.release_date::date::timestamp at time zone 'America/Sao_Paulo' end;
        select f.id into existing_format_id from public.formats f where upper(btrim(f.code))=upper(btrim(r.code));
        if existing_format_id is null then
            insert into public.formats(code,name,created_at,is_active,is_default) values(r.code,r.name,coalesce(release_time,timestamp_value),true,false);
            formats_created:=formats_created+1;
        else
            update public.formats set name=r.name,created_at=coalesce(release_time,created_at) where id=existing_format_id;
            formats_updated:=formats_updated+1;
        end if;
    end loop;
    return jsonb_build_object('archetypes',jsonb_array_length(p_decks),'created',created_count,'updated',jsonb_array_length(p_decks)-created_count,'archived',archived_count,'formats',jsonb_array_length(p_formats),'formats_created',formats_created,'formats_updated',formats_updated);
end $_$;


ALTER FUNCTION "public"."apply_digilab_catalog_snapshot"("p_decks" "jsonb", "p_formats" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_team_tournament_digilab_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF TG_TABLE_NAME = 'tournament_digilab_sync' THEN
        IF EXISTS (SELECT 1 FROM public.tournament WHERE id = NEW.tournament_id
                   AND lower(btrim(tournament_name)) = '2v2') THEN
            RAISE EXCEPTION 'O torneio 2v2 e exclusivamente local.' USING ERRCODE = '22023';
        END IF;
    ELSIF lower(btrim(NEW.tournament_name)) = '2v2' AND
          EXISTS (SELECT 1 FROM public.tournament_digilab_sync WHERE tournament_id = NEW.id) THEN
        RAISE EXCEPTION 'Remova o vinculo DigiLab antes de converter para 2v2.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."block_team_tournament_digilab_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."bootstrap_user_profile"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."digilab_background_imports" (
    "digilab_tournament_id" bigint NOT NULL,
    "tournament_id" bigint,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "event_date" "date",
    "store_name" "text",
    "format" "text",
    "player_count" integer,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "next_attempt_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "imported_at" timestamp with time zone,
    "last_error" "text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "claim_run_id" "uuid",
    "lease_until" timestamp with time zone,
    CONSTRAINT "digilab_background_imports_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "digilab_background_imports_digilab_tournament_id_check" CHECK (("digilab_tournament_id" > 0)),
    CONSTRAINT "digilab_background_imports_player_count_check" CHECK ((("player_count" IS NULL) OR ("player_count" >= 0))),
    CONSTRAINT "digilab_background_imports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'needs_review'::"text", 'retry'::"text", 'imported'::"text"])))
);


ALTER TABLE "public"."digilab_background_imports" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint DEFAULT NULL::bigint) RETURNS SETOF "public"."digilab_background_imports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    if not exists(select 1 from public.digilab_sync_state where id and run_id = p_run_id and lease_until > now()) then
        raise exception 'Execucao expirada.';
    end if;
    return query with candidate as (
        select q.digilab_tournament_id from public.digilab_background_imports q
        where (p_external_id is null or q.digilab_tournament_id = p_external_id)
          and ((q.status in ('pending','needs_review','retry','imported') and q.next_attempt_at <= now())
               or (q.status = 'processing' and q.lease_until < now()))
        order by q.next_attempt_at, q.first_seen_at for update skip locked limit 1
    ) update public.digilab_background_imports q set status = 'processing', claim_run_id = p_run_id,
        lease_until = now() + interval '5 minutes', last_attempt_at = now(), attempt_count = q.attempt_count + 1, last_error = null
      from candidate c where q.digilab_tournament_id = c.digilab_tournament_id returning q.*;
end;
$$;


ALTER FUNCTION "public"."claim_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."collect_site_audit_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare report jsonb;
begin
    if not public.site_is_maintenance() then raise exception 'Operação restrita à manutenção.' using errcode='42501'; end if;
    report:=site_audit.health_snapshot();
    insert into site_audit.monitor_checks(severity,metrics) values(report->>'severity',report);
    delete from site_audit.monitor_checks where checked_at<now()-interval '30 days';
    delete from site_audit.integration_runs where coalesce(finished_at,started_at)<now()-interval '90 days';
    delete from site_audit.exports where expires_at<now()-interval '1 day';
    return report;
end;
$$;


ALTER FUNCTION "public"."collect_site_audit_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_add_players"("p_event" "uuid", "p_players" "jsonb", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; selected_ids uuid[]; added integer; existing integer;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status not in ('draft','published') then raise exception 'A inclusão de jogadores encerra ao iniciar o torneio.'; end if;
 if p_revision is null or p_revision>e.revision then raise exception 'Atualize o torneio e tente novamente.' using errcode='40001'; end if;
 if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players)>128 then raise exception 'Seleção de jogadores inválida.'; end if;
 select array_agg(distinct value::uuid) into selected_ids from jsonb_array_elements_text(p_players);
 if coalesce(cardinality(selected_ids),0)=0 or array_position(selected_ids,null) is not null then raise exception 'Selecione pelo menos um jogador.'; end if;
 if exists(select 1 from unnest(selected_ids) as selected(player_id) where not exists(select 1 from public.players p where p.id=selected.player_id)) then raise exception 'Um dos jogadores selecionados não está cadastrado.'; end if;
 select count(*) into existing from public.community_entries where event_id=e.id;
 select count(*) into added from unnest(selected_ids) as selected(player_id) where not exists(select 1 from public.community_entries n where n.event_id=e.id and n.player_id=selected.player_id);
 if existing+added>e.capacity then raise exception 'A seleção ultrapassa as vagas disponíveis. Nenhum jogador foi incluído.'; end if;
 insert into public.community_entries(event_id,player_id) select e.id,selected.player_id from unnest(selected_ids) as selected(player_id) on conflict(event_id,player_id) do nothing;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'add_players',jsonb_build_object('player_ids',selected_ids,'added',added));
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_add_players"("p_event" "uuid", "p_players" "jsonb", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
 select auth.uid() is not null and public.site_has_identity() and public.site_is_admin()
$$;


ALTER FUNCTION "public"."community_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_audit_context"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare author text; targets jsonb;
begin
 select coalesce(nullif(p.name,''),nullif(to_jsonb(u)->>'display_name','')) into author
 from public.user_profiles u left join public.players p on p.id=u.player_id where u.user_id=new.actor;
 new.details:=(new.details-'actor_name')||jsonb_build_object('actor_name',coalesce(author,case when new.actor is null then 'Sistema' else 'Conta indisponível' end));
 if new.action in ('add_players','create') and jsonb_typeof(new.details->'player_ids')='array' then
  select jsonb_agg(p.name order by p.name) into targets from public.players p where p.id::text in (select jsonb_array_elements_text(new.details->'player_ids'));
 elsif new.action='add_player' then
  select jsonb_agg(p.name) into targets from public.players p where p.id::text=new.details->>'player_id';
 elsif new.action<>'drop' and new.details ? 'entry_id' then
  select jsonb_agg(p.name) into targets from public.community_entries n join public.players p on p.id=n.player_id where n.event_id=new.event_id and n.id::text=new.details->>'entry_id';
 end if;
 if new.action<>'drop' then new.details:=(new.details-'target_names')||jsonb_build_object('target_names',coalesce(targets,'[]'::jsonb)); end if;
 return new;
end $$;


ALTER FUNCTION "public"."community_audit_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_command"("p_event" "uuid", "p_action" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb", "p_revision" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; r public.community_rounds; m public.community_matches; admin boolean:=public.community_admin();
 me uuid; entry uuid; count_players integer; next_round integer; pair jsonb; pair_ids uuid[]:='{}'; a uuid; b uuid;
 w integer; l integer; d integer; standings jsonb; ordered jsonb; line text; header jsonb; actor_entry uuid; v_reason text:=btrim(coalesce(p_data->>'reason',''));
begin
 if auth.uid() is null or not public.site_has_identity() then raise exception 'Entre com uma conta ativa.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found then raise exception 'Torneio indisponível.'; end if;
 -- Independent registrations/results must not conflict merely because another table changed.
 -- Capacity is serialized by the event lock; result writes also check their own revision below.
 if p_revision is null or (e.revision<>p_revision and p_action not in ('register','propose','confirm','contest')) then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select player_id into me from public.user_profiles where user_id=auth.uid();
 select id into actor_entry from public.community_entries where event_id=e.id and player_id=me;
 if p_action not in ('register','deck','propose','confirm','contest') and not (p_action='drop' and e.status in ('draft','published')) and not admin then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 if e.status in ('finished','cancelled') and p_action not in ('export','link_digilab','reconcile') then raise exception 'O torneio está encerrado.'; end if;

 if p_action in ('register','add_player') then
  if e.status not in ('draft','published') or (not admin and (e.status<>'published' or not e.registration_open)) then raise exception 'Inscrições encerradas.'; end if;
  if p_action='register' and me is null then raise exception 'Vincule sua conta a um jogador.' using errcode='42501'; end if;
  a:=case when p_action='add_player' then (p_data->>'player_id')::uuid else me end;
  if exists(select 1 from public.community_entries where event_id=e.id and player_id=a) then raise exception 'Jogador já inscrito.'; end if;
  if (select count(*) from public.community_entries where event_id=e.id)>=e.capacity then raise exception 'Vagas esgotadas.'; end if;
  insert into public.community_entries(event_id,player_id) values(e.id,a);
 elsif p_action='configure' then
  if e.status not in ('draft','published') then raise exception 'Configuração bloqueada após o início.'; end if;
  if (p_data->>'capacity')::integer < (select count(*) from public.community_entries where event_id=e.id) then raise exception 'A capacidade não pode ser menor que as inscrições existentes.'; end if;
  update public.community_events set name=btrim(p_data->>'name'),store_id=nullif(p_data->>'store_id','')::uuid,
   location=left(coalesce(p_data->>'location',''),500),modality=p_data->>'modality',starts_at=(p_data->>'starts_at')::timestamptz,
   event_type=p_data->>'event_type',format_id=(p_data->>'format_id')::bigint,capacity=(p_data->>'capacity')::integer where id=e.id;
 elsif p_action='publish' then
  if e.status<>'draft' then raise exception 'O evento já foi publicado.'; end if;
  update public.community_events set status='published' where id=e.id;
 elsif p_action='registration' then
  if e.status not in ('draft','published') then raise exception 'Publique o evento antes de abrir inscrições.'; end if;
  update public.community_events set status='published',registration_open=(p_data->>'open')::boolean where id=e.id;
 elsif p_action='deck' then
  if not admin and e.status not in ('draft','published') then raise exception 'Deck bloqueado após o início.'; end if;
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  update public.community_entries set deck_id=nullif(p_data->>'deck_id','')::uuid,decklist=coalesce(p_data->>'decklist','') where id=entry and event_id=e.id;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='start' then
  if e.status not in ('draft','published') then raise exception 'O torneio ja foi iniciado.'; end if;
  select count(*) into count_players from public.community_entries where event_id=e.id and not dropped;
  if count_players<4 or count_players>128 then raise exception 'Inscreva de 4 a 128 participantes.'; end if;
  update public.community_events set status='running',registration_open=false,checkin_open=false,initial_players=count_players,
   rounds=case when count_players<=8 then 3 when count_players<=16 then 4 when count_players<=32 then 5 when count_players<=64 then 6 else 7 end where id=e.id;
 elsif p_action='drop' then
  if not admin and (actor_entry is null or (nullif(p_data->>'entry_id','') is not null and (p_data->>'entry_id')::uuid<>actor_entry)) then raise exception 'Você só pode cancelar sua própria inscrição.' using errcode='42501'; end if;
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  p_data:=p_data||jsonb_build_object('target_names',coalesce((select jsonb_agg(p.name) from public.community_entries n join public.players p on p.id=n.player_id where n.id=entry and n.event_id=e.id),'[]'::jsonb),'entry_removed',e.status in ('draft','published'));
  if exists(select 1 from public.community_matches mm join public.community_rounds rr on rr.id=mm.round_id where mm.event_id=e.id and rr.status<>'closed' and (mm.p1=entry or mm.p2=entry) and mm.status<>'confirmed') then raise exception 'Resolva a partida atual com a organização antes de desistir.'; end if;
  if e.status in ('draft','published') then
   delete from public.community_entries where id=entry and event_id=e.id;
  else
   update public.community_entries set dropped=true where id=entry and event_id=e.id;
  end if;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='pair' then
  if e.status<>'running' or exists(select 1 from public.community_rounds where event_id=e.id and status<>'closed') then raise exception 'Encerre a rodada anterior.'; end if;
  select coalesce(max(number),0)+1 into next_round from public.community_rounds where event_id=e.id;
  if next_round>e.rounds then raise exception 'Todas as rodadas já foram realizadas.'; end if;
  if jsonb_typeof(p_data->'pairs') is distinct from 'array' then raise exception 'Mesas inválidas.'; end if;
  for pair in select value from jsonb_array_elements(p_data->'pairs') loop
   a:=(pair->>'p1')::uuid; b:=nullif(pair->>'p2','')::uuid;
   if a is null or a=any(pair_ids) or b=a or (b is not null and b=any(pair_ids)) then raise exception 'Participante repetido nas mesas.'; end if;
   if not exists(select 1 from public.community_entries where id=a and event_id=e.id and not dropped) or
    (b is not null and not exists(select 1 from public.community_entries where id=b and event_id=e.id and not dropped)) then raise exception 'Participante inativo ou de outro evento.'; end if;
   if v_reason='' and b is not null and exists(select 1 from public.community_matches where event_id=e.id and ((p1=a and p2=b) or(p1=b and p2=a))) then raise exception 'Reencontro exige justificativa da organização.'; end if;
   pair_ids:=array_append(pair_ids,a); if b is not null then pair_ids:=array_append(pair_ids,b); end if;
  end loop;
  select count(*) into count_players from public.community_entries where event_id=e.id and not dropped;
  if count_players<2 or cardinality(pair_ids)<>count_players or jsonb_array_length(p_data->'pairs')<>(count_players+1)/2 then raise exception 'Informe todas as mesas e no máximo um bye.'; end if;
  -- Automatic byes may not be repeated while an active player has fewer byes.
  if v_reason='' and exists(select 1 from jsonb_array_elements(p_data->'pairs') q where q->>'p2' is null and
    (select count(*) from public.community_matches where event_id=e.id and p1=(q->>'p1')::uuid and p2 is null)>
    (select min(x.n) from (select (select count(*) from public.community_matches where event_id=e.id and p1=n.id and p2 is null) n from public.community_entries n where event_id=e.id and not dropped) x)) then raise exception 'Bye repetido exige justificativa.'; end if;
  insert into public.community_rounds(event_id,number,seed) values(e.id,next_round,left(coalesce(p_data->>'seed','manual'),100)) returning * into r;
  count_players:=0;
  for pair in select value from jsonb_array_elements(p_data->'pairs') loop
   count_players:=count_players+1; a:=(pair->>'p1')::uuid; b:=nullif(pair->>'p2','')::uuid;
   insert into public.community_matches(event_id,round_id,table_number,p1,p2,wins,losses,draws,status,reason)
    values(e.id,r.id,count_players,a,b,case when b is null then 2 end,case when b is null then 0 end,case when b is null then 0 end,case when b is null then 'confirmed' else 'pending' end,v_reason);
  end loop;
 elsif p_action in ('start_round','close_round','adjust_clock','undo_round','reopen_round') then
  select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
  if not found then raise exception 'Rodada não encontrada.'; end if;
  if p_action='start_round' then
   if r.status<>'paired' then raise exception 'Rodada já iniciada.'; end if;
   update public.community_rounds set status='running',started_at=now(),ends_at=now()+make_interval(mins=>e.round_minutes),overtime_ends_at=now()+make_interval(mins=>e.round_minutes+e.overtime_minutes) where id=r.id;
  elsif p_action='reopen_round' then
   if r.status<>'closed' then raise exception 'A rodada precisa estar encerrada.'; end if;
   update public.community_rounds set status='running' where id=r.id;
  elsif p_action='adjust_clock' then
   if r.status<>'running' or (p_data->>'seconds') is null or abs((p_data->>'seconds')::integer)>3600 then raise exception 'Informe ajuste de até uma hora.'; end if;
   update public.community_rounds set ends_at=ends_at+make_interval(secs=>(p_data->>'seconds')::integer),overtime_ends_at=overtime_ends_at+make_interval(secs=>(p_data->>'seconds')::integer) where id=r.id;
  elsif p_action='undo_round' then
   if v_reason='' then raise exception 'Justifique a invalidação da última rodada.'; end if;
   insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'invalidated_round_snapshot',
    jsonb_build_object('round',to_jsonb(r),'matches',(select jsonb_agg(to_jsonb(mm)) from public.community_matches mm where mm.round_id=r.id),'reason',v_reason));
   delete from public.community_rounds where id=r.id;
  else
   if r.status<>'running' or exists(select 1 from public.community_matches where round_id=r.id and status<>'confirmed') then raise exception 'Resolva todos os resultados da rodada.'; end if;
   update public.community_rounds set status='closed' where id=r.id;
  end if;
 elsif p_action in ('propose','confirm','contest','resolve') then
  select * into m from public.community_matches where id=(p_data->>'match_id')::uuid and event_id=e.id for update;
  if not found or m.p2 is null then raise exception 'Partida inválida.'; end if;
  if (p_data->>'match_revision') is null or (p_data->>'match_revision')::integer<>m.revision then raise exception 'O placar mudou. Atualize antes de confirmar ou corrigir.' using errcode='40001'; end if;
  select * into r from public.community_rounds where id=m.round_id;
  if r.status<>'running' then raise exception 'A rodada não está em andamento. Invalide as rodadas posteriores para corrigir.'; end if;
  if not admin and (actor_entry is null or actor_entry not in (m.p1,m.p2)) then raise exception 'Você não participa desta partida.' using errcode='42501'; end if;
  if p_action in ('propose','contest','resolve') then
   if p_action='resolve' and not admin then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
   if p_action='contest' and (m.status<>'proposed' or actor_entry is null or actor_entry=m.proposed_by or actor_entry not in (m.p1,m.p2)) then raise exception 'Somente o adversário pode refutar a proposta.'; end if;
   if p_action='propose' and m.status not in ('pending','contested') then raise exception 'Já existe resultado. Confirme ou conteste.'; end if;
   if admin then
    insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'match_before_resolution',to_jsonb(m));
   end if;
   w:=(p_data->>'wins')::integer; l:=(p_data->>'losses')::integer; d:=(p_data->>'draws')::integer;
   if w is null or l is null or d is null then raise exception 'Informe o placar completo.'; end if;
   if w<0 or w>2 or l<0 or l>2 or d<0 or d>1 or w+l+d not between 1 and 3 then raise exception 'O placar deve somar de 1 a 3 jogos.'; end if;
   if not admin and w<2 and l<2 and now()<r.ends_at then raise exception 'Placar incompleto: aguarde o limite de tempo ou procure a organização.'; end if;
   if not admin and d>0 and now()<r.overtime_ends_at then raise exception 'O jogo empatado por tempo só deve ser informado após o overtime.'; end if;
   if p_action<>'resolve' and actor_entry=m.p2 then count_players:=w; w:=l; l:=count_players; end if;
   update public.community_matches set wins=w,losses=l,draws=d,status=case when admin then 'confirmed' else 'proposed' end,proposed_by=actor_entry,reason=v_reason,revision=revision+1 where id=m.id;
  else
   if m.status<>'proposed' or actor_entry=m.proposed_by or actor_entry is null then raise exception 'Somente o adversário pode confirmar ou contestar a proposta.'; end if;
   update public.community_matches set status=case when p_action='confirm' then 'confirmed' else 'contested' end,revision=revision+1 where id=m.id;
  end if;
 elsif p_action='finish' then
  if e.status<>'running' or (select count(*) from public.community_rounds where event_id=e.id and status='closed')<>e.rounds then raise exception 'Conclua todas as rodadas.'; end if;
  standings:=public.community_standings(e.id);
  select coalesce(jsonb_agg(v->>'id'),'[]') into ordered from jsonb_array_elements(standings) v where (v->>'checked_in')::boolean;
  if p_data ? 'order' then
   if jsonb_typeof(p_data->'order')<>'array' or jsonb_array_length(p_data->'order')<>jsonb_array_length(ordered) or
    exists(select 1 from jsonb_array_elements_text(ordered) x where not (p_data->'order') ? x) or
    (select count(distinct x) from jsonb_array_elements_text(p_data->'order') x)<>jsonb_array_length(ordered) then raise exception 'Ordem final inválida.'; end if;
   ordered:=p_data->'order';
  end if;
  -- Explicit staff review is required while the TCG+ reference validation remains pending.
  if coalesce((p_data->>'reviewed')::boolean,false)=false then raise exception 'Confirme a classificacao final.'; end if;
  update public.community_events set status='finished',final_order=ordered,final_snapshot=standings where id=e.id;
 elsif p_action='export' then
  if e.status<>'finished' then raise exception 'Finalize e revise o torneio antes de copiar.'; end if;
  standings:=e.final_snapshot;
  select string_agg(o.ordinality::text||' '||regexp_replace(btrim(coalesce(nullif(btrim(s->>'digilab_name'),''),s->>'name')),'\s+',' ','g')||
   case when nullif(btrim(s->>'bandai_id'),'') is null then '' else ' #'||regexp_replace(btrim(s->>'bandai_id'),'^#+','') end||' '||(s->>'points'),E'\n' order by o.ordinality)
   into line from jsonb_array_elements_text(e.final_order) with ordinality o(id,ordinality) join jsonb_array_elements(standings) s on s->>'id'=o.id;
  header:=jsonb_build_object('store_id',e.store_id,'organizer',e.organizer,'type',e.event_type,'date',(e.starts_at at time zone 'America/Sao_Paulo')::date,
   'format',(select code from public.formats where id=e.format_id),'rounds',e.rounds,'players',e.initial_players);
  insert into public.community_exports(event_id,revision,header,body) values(e.id,e.revision,header,line);
 elsif p_action='link_digilab' then
  if e.status<>'finished' or (p_data->>'digilab_id')::bigint<=0 then raise exception 'Informe o ID DigiLab de um evento finalizado.'; end if;
  update public.community_events set digilab_id=(p_data->>'digilab_id')::bigint,reconciliation='pending' where id=e.id;
 elsif p_action='cancel' then
  update public.community_events set status='cancelled',registration_open=false,checkin_open=false where id=e.id;
 else raise exception 'Ação desconhecida.';
 end if;
 -- Close once every result is confirmed, including direct admin submissions.
 if p_action in ('confirm','resolve') or (admin and p_action in ('propose','contest')) then
  update public.community_rounds rr set status='closed'
  where rr.event_id=e.id and rr.status='running'
   and not exists(select 1 from public.community_matches mm where mm.round_id=rr.id and mm.status<>'confirmed');
 end if;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),p_action,p_data-'decklist');
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_command"("p_event" "uuid", "p_action" "text", "p_data" "jsonb", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_configure_event"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; planned timestamptz; seats integer; chosen_round integer; chosen_overtime integer;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status='cancelled' then raise exception 'Torneio indisponível para edição.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 planned:=(p_data->>'starts_at')::timestamptz;
 if planned is null or not isfinite(planned) then raise exception 'Informe uma data e horário válidos.'; end if;
 seats:=coalesce((p_data->>'capacity')::integer,e.capacity);
 if seats not between 4 and 128 or seats<(select count(*) from public.community_entries where event_id=e.id) then raise exception 'A capacidade não pode ser menor que as inscrições existentes.'; end if;
 chosen_round:=coalesce((p_data->>'round_minutes')::integer,e.round_minutes);
 chosen_overtime:=coalesce((p_data->>'overtime_minutes')::integer,e.overtime_minutes);
 if chosen_round not between 1 and 1440 or chosen_overtime not between 0 and 1440 then raise exception 'Informe tempos válidos em minutos (tempo normal maior que zero e overtime a partir de zero).'; end if;
 update public.community_events set name=btrim(p_data->>'name'),store_id=nullif(p_data->>'store_id','')::uuid,
  location=left(coalesce(p_data->>'location',''),500),modality=p_data->>'modality',starts_at=planned,
  event_type=p_data->>'event_type',format_id=(p_data->>'format_id')::bigint,capacity=seats,round_minutes=chosen_round,overtime_minutes=chosen_overtime,revision=revision+1,
  reconciliation=case when e.status='finished' and (e.digilab_id is not null or e.canonical_tournament_id is not null) then 'review' else reconciliation end,
  reconcile_error=case when e.status='finished' and (e.digilab_id is not null or e.canonical_tournament_id is not null) then 'Configurações locais alteradas. Confira a submissão no DigiLab.' else reconcile_error end
 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'configure',p_data-'decklist');
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_configure_event"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_correct_result"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; m public.community_matches; r public.community_rounds;
 w integer; l integer; d integer; first_name text; second_name text;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status not in ('running','finished') then raise exception 'Torneio indisponível para correção.'; end if;
 if p_revision is null or e.revision<>p_revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into m from public.community_matches where id=(p_data->>'match_id')::uuid and event_id=e.id for update;
 if not found or m.p2 is null then raise exception 'Partida inválida.'; end if;
 if (p_data->>'match_revision') is null or (p_data->>'match_revision')::integer<>m.revision then raise exception 'O placar mudou. Atualize antes de corrigir.' using errcode='40001'; end if;
 select * into r from public.community_rounds where id=m.round_id;
 if r.status not in ('running','closed') then raise exception 'Inicie a rodada antes de informar resultados.'; end if;
 w:=(p_data->>'wins')::integer; l:=(p_data->>'losses')::integer; d:=(p_data->>'draws')::integer;
 if w is null or l is null or d is null or w<0 or w>2 or l<0 or l>2 or d<0 or d>1 or w+l+d not between 1 and 3 then raise exception 'O placar deve somar de 1 a 3 jogos.'; end if;
 select p.name into first_name from public.community_entries n join public.players p on p.id=n.player_id where n.id=m.p1;
 select p.name into second_name from public.community_entries n join public.players p on p.id=n.player_id where n.id=m.p2;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'match_before_resolution',to_jsonb(m));
 update public.community_matches set wins=w,losses=l,draws=d,status='confirmed',proposed_by=null,reason='',revision=revision+1 where id=m.id;
 update public.community_rounds rr set status='closed' where rr.id=r.id and rr.status='running'
  and not exists(select 1 from public.community_matches mm where mm.round_id=rr.id and mm.status<>'confirmed');
 -- Future pairings remain intact. A frozen final result requires a fresh staff review.
 if e.status='finished' then
  update public.community_events set status='running',final_order=null,final_snapshot=null,
   reconciliation=case when digilab_id is not null or canonical_tournament_id is not null then 'review' else reconciliation end,
   reconcile_error=case when digilab_id is not null or canonical_tournament_id is not null then 'Resultados locais corrigidos. Revise a classificação final e a submissão no DigiLab.' else reconcile_error end
  where id=e.id;
 end if;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'correct_result',
  jsonb_build_object('match_id',m.id,'round',r.number,'player_one',first_name,'player_two',second_name,'wins',w,'losses',l,'draws',d,'final_review_required',e.status='finished'));
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_correct_result"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_create"("p_data" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare target uuid; chosen_start timestamptz; chosen_format bigint; initial_players jsonb:=coalesce(p_data->'player_ids','[]'::jsonb);
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 chosen_start:=coalesce(nullif(p_data->>'starts_at','')::timestamptz,
  nullif(p_data->>'date','')::date::timestamp at time zone 'America/Sao_Paulo',
  date_trunc('minute',now()));
 if not isfinite(chosen_start) then raise exception 'Informe uma data e horário válidos.'; end if;
 chosen_format:=nullif(p_data->>'format_id','')::bigint;
 if chosen_format is null then
  select id into chosen_format from public.formats where coalesce(is_active,true) and code<>'UNSPECIFIED'
   order by is_default desc nulls last,created_at desc nulls last,id desc limit 1;
 end if;
 if chosen_format is null then raise exception 'Cadastre um formato ativo antes de criar o torneio.'; end if;
 if jsonb_typeof(initial_players) is distinct from 'array' then raise exception 'Seleção de jogadores inválida.'; end if;
 insert into public.community_events(name,store_id,location,modality,starts_at,event_type,format_id,capacity,created_by,status,registration_open,round_minutes,overtime_minutes)
 values(btrim(p_data->>'name'),nullif(p_data->>'store_id','')::uuid,left(coalesce(p_data->>'location','Curitiba, Brazil'),500),
  coalesce(nullif(p_data->>'modality',''),'presencial'),chosen_start,
  coalesce(nullif(btrim(p_data->>'event_type'),''),'For Fun'),chosen_format,32,auth.uid(),'published',true,coalesce((p_data->>'round_minutes')::integer,45),coalesce((p_data->>'overtime_minutes')::integer,5)) returning id into target;
 insert into public.community_audit(event_id,actor,action,details) values(target,auth.uid(),'create',p_data||jsonb_build_object('capacity',32,'starts_at',chosen_start));
 if jsonb_array_length(initial_players)>0 then perform public.community_add_players(target,initial_players,0); end if;
 return target;
end $$;


ALTER FUNCTION "public"."community_create"("p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_delete_event"("p_event" "uuid", "p_revision" integer, "p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found then raise exception 'Torneio não encontrado.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e confirme a exclusão novamente.' using errcode='40001'; end if;
 if p_name is null or btrim(p_name)<>'deletar' then raise exception 'Digite "deletar" para confirmar a exclusão.'; end if;
 -- Delete dependents explicitly, including audit/export tables without cascading FKs.
 delete from public.community_exports where event_id=e.id;
 delete from public.community_audit where event_id=e.id;
 delete from public.community_matches where event_id=e.id;
 delete from public.community_rounds where event_id=e.id;
 delete from public.community_entries where event_id=e.id;
 delete from public.community_events where id=e.id;
 -- A separately imported official DigiLab result is not owned by this event.
 return e.id;
end $$;


ALTER FUNCTION "public"."community_delete_event"("p_event" "uuid", "p_revision" integer, "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_import_context"("p_external" bigint) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
 select to_jsonb(e) from public.community_events e where e.digilab_id=p_external and e.status='finished'
$$;


ALTER FUNCTION "public"."community_import_context"("p_external" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_import_failure"("p_external" bigint, "p_message" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
 update public.community_events set last_reconcile_at=now(),reconcile_error=left(p_message,1000) where digilab_id=p_external
$$;


ALTER FUNCTION "public"."community_import_failure"("p_external" bigint, "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_list"("p_admin" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
 if p_admin and not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)-'final_snapshot' order by x.starts_at),'[]') from (
  select e.*,f.code format_code,s.name store_name,(select count(*) from public.community_entries n where n.event_id=e.id)::integer registered,
   exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and u.user_id=auth.uid()) enrolled,
   exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and not n.dropped and u.user_id=auth.uid()) active_participant
  from public.community_events e join public.formats f on f.id=e.format_id left join public.stores s on s.id=e.store_id
  where p_admin or (e.status='published' and e.registration_open) or (e.status='running' and exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and not n.dropped and u.user_id=auth.uid())) or (e.status='finished' and exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and u.user_id=auth.uid()))
 ) x);
end $$;


ALTER FUNCTION "public"."community_list"("p_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_pause_round"("p_event" "uuid", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; r public.community_rounds; previous_matches jsonb;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status<>'running' then raise exception 'O torneio precisa estar em andamento.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
 if not found or r.status='paused' then raise exception 'Não há rodada ativa para parar.'; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.table_number),'[]'::jsonb) into previous_matches from public.community_matches m where m.round_id=r.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'paused_round_snapshot',jsonb_build_object('round',to_jsonb(r),'matches',previous_matches));
 delete from public.community_matches where round_id=r.id;
 update public.community_rounds set status='paused' where id=r.id;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'pause_round',jsonb_build_object('round',r.number));
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_pause_round"("p_event" "uuid", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_pending_links"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
  select id,digilab_id from public.community_events where status='finished' and digilab_id is not null
   and (last_reconcile_at is null or last_reconcile_at<now()-interval '1 hour') order by last_reconcile_at nulls first,id limit 5
 ) x
$$;


ALTER FUNCTION "public"."community_pending_links"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_reconcile"("p_external" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_dnfs" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; s jsonb; local_entry public.community_entries; local_player public.players;
 mappings jsonb:='[]'; result jsonb; local_scores jsonb; pos integer:=0; ext_points integer; issue text;
begin
 select * into e from public.community_events where digilab_id=p_external and status='finished' for update;
 if not found then raise exception 'Vínculo operacional não encontrado.'; end if;
 update public.community_events set last_reconcile_at=now() where id=e.id;
 begin
  if jsonb_typeof(p_standings) is distinct from 'array' or jsonb_array_length(p_standings)<>e.initial_players or
   (p_tournament->>'player_count')::integer is distinct from e.initial_players or jsonb_array_length(p_dnfs)>0 then raise exception 'Classificação externa incompleta ou com DNF: revise o envio.'; end if;
  if (p_tournament->>'date')::date is distinct from (e.starts_at at time zone 'America/Sao_Paulo')::date or
   public.digilab_normalize(p_tournament->>'format') is distinct from (select public.digilab_normalize(code) from public.formats where id=e.format_id) or
   (nullif(p_tournament->>'rounds','') is not null and (p_tournament->>'rounds')::integer<>e.rounds) then raise exception 'Data, formato ou rodadas diferem do evento operacional.'; end if;
  if e.store_id is not null and public.digilab_normalize(p_tournament#>>'{store,name}') is distinct from
   (select public.digilab_normalize(name) from public.stores where id=e.store_id) then raise exception 'A loja do DigiLab difere da loja do evento.'; end if;
  local_scores:=public.community_standings(e.id);
  for s in select value from jsonb_array_elements(p_standings) order by (value->>'placement')::integer loop
   pos:=pos+1;
   if (s->>'placement')::integer is distinct from pos then raise exception 'Colocações externas incompletas ou empatadas.'; end if;
   select * into local_entry from public.community_entries where id=(e.final_order->>(pos-1))::uuid and event_id=e.id;
   if not found then raise exception 'Participante local não encontrado.'; end if;
   select * into local_player from public.players where id=local_entry.player_id;
   if nullif(s#>>'{player,slug}','') is null or not (
    public.digilab_normalize(s#>>'{player,name}')=public.digilab_normalize(local_player.name) or
    public.digilab_normalize(s#>>'{player,name}')=public.digilab_normalize(local_player.digilab_name) or
    exists(select 1 from public.digilab_player_sync where digilab_player_slug=s#>>'{player,slug}' and player_id=local_player.id)
   ) then raise exception 'Jogador ou colocação divergente na posição %.',pos; end if;
   if exists(select 1 from public.digilab_player_sync where digilab_player_slug=s#>>'{player,slug}' and player_id<>local_player.id) then raise exception 'Identidade DigiLab vinculada a outro jogador.'; end if;
   ext_points:=case when s#>>'{record,wins}' is not null and s#>>'{record,ties}' is not null
    then 3*(s#>>'{record,wins}')::integer+(s#>>'{record,ties}')::integer else nullif(s->>'match_points','')::integer end;
   if ext_points is not null and ext_points is distinct from (select (v->>'points')::integer from jsonb_array_elements(local_scores) v where v->>'id'=local_entry.id::text) then raise exception 'Pontos divergentes na posição %.',pos; end if;
   mappings:=mappings||jsonb_build_array(jsonb_build_object('digilab_player_slug',s#>>'{player,slug}','player_id',local_player.id));
  end loop;
  result:=public.sync_digilab_tournament_atomic(p_external,p_tournament||jsonb_build_object('tournament_name',e.event_type),p_standings,mappings,'[]',e.canonical_tournament_id);
  update public.community_events set canonical_tournament_id=(result->>'tournament_id')::bigint,reconciliation='matched',reconcile_error=null,revision=revision+1 where id=e.id;
  insert into public.community_audit(event_id,action,details) values(e.id,'digilab_reconciled',jsonb_build_object('external_id',p_external,'tournament_id',result->'tournament_id'));
  return result||jsonb_build_object('ok',true);
 exception when others then
  get stacked diagnostics issue=message_text;
  update public.community_events set reconciliation='review',reconcile_error=left(issue,1000),revision=revision+1 where id=e.id;
  insert into public.community_audit(event_id,action,details) values(e.id,'digilab_review',jsonb_build_object('external_id',p_external,'error',left(issue,1000)));
  return jsonb_build_object('ok',false,'needs_review',true,'error',issue);
 end;
end $$;


ALTER FUNCTION "public"."community_reconcile"("p_external" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_dnfs" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_restart_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; r public.community_rounds; state jsonb;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status<>'running' then raise exception 'O torneio precisa estar em andamento.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
 if not found or r.status<>'paused' then raise exception 'Pare a rodada antes de refazer os pareamentos.'; end if;
 if exists(select 1 from public.community_matches where round_id=r.id) then raise exception 'A rodada pausada recebeu resultados. Atualize antes de continuar.'; end if;
 -- Pair validation and clock start share this transaction; a failure restores the paused row.
 delete from public.community_rounds where id=r.id;
 state:=public.community_command(e.id,'pair',jsonb_build_object('pairs',p_data->'pairs','seed',p_data->>'seed'),e.revision);
 state:=public.community_command(e.id,'start_round','{}'::jsonb,(state->'event'->>'revision')::integer);
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'restart_round',jsonb_build_object('round',r.number));
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_restart_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_resume_round"("p_event" "uuid", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; r public.community_rounds; archived public.community_audit;
 saved public.community_rounds; elapsed interval;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status<>'running' then raise exception 'O torneio precisa estar em andamento.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
 if not found or r.status<>'paused' then raise exception 'A rodada precisa estar pausada para continuar.'; end if;
 select * into archived from public.community_audit
 where event_id=e.id and action='paused_round_snapshot' and details->'round'->>'id'=r.id::text
 order by id desc limit 1;
 if not found then raise exception 'Não foi possível recuperar esta rodada. Refaça os pareamentos.'; end if;
 select * into saved from jsonb_populate_record(null::public.community_rounds,archived.details->'round');
 if saved.status not in ('running','paired','closed') then raise exception 'Estado salvo da rodada inválido.'; end if;
 if exists(select 1 from public.community_matches where round_id=r.id) then raise exception 'A rodada pausada recebeu resultados. Atualize antes de continuar.'; end if;
 -- A pending table with a new drop must be paired again, rather than silently restoring an absent opponent.
 if exists(
  select 1 from jsonb_populate_recordset(null::public.community_matches,archived.details->'matches') m
  join public.community_entries n on n.id=m.p1 or n.id=m.p2
  where m.status<>'confirmed' and n.dropped
 ) then raise exception 'Um jogador desta rodada deu DROP. Refaça os pareamentos para continuar.'; end if;
 insert into public.community_matches
 select (jsonb_populate_record(null::public.community_matches,to_jsonb(m)||jsonb_build_object('revision',m.revision+1))).*
 from jsonb_populate_recordset(null::public.community_matches,archived.details->'matches') m;
 -- Freeze the clock across the entire pause, retaining elapsed overtime as well as normal time.
 elapsed:=case when saved.status='running' then greatest(now()-archived.created_at,interval '0 seconds') else interval '0 seconds' end;
 update public.community_rounds set status=saved.status,started_at=saved.started_at+elapsed,
  ends_at=saved.ends_at+elapsed,overtime_ends_at=saved.overtime_ends_at+elapsed where id=r.id;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details)
 values(e.id,auth.uid(),'resume_round',jsonb_build_object('round',r.number));
 return public.community_snapshot(e.id);
end $$;


ALTER FUNCTION "public"."community_resume_round"("p_event" "uuid", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_set_finished_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
 if new.status='finished' then
  if old.status is distinct from 'finished' then new.finished_at:=now();
  else new.finished_at:=old.finished_at;
  end if;
 else new.finished_at:=null;
 end if;
 return new;
end $$;


ALTER FUNCTION "public"."community_set_finished_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_snapshot"("p_event" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare e public.community_events; mine uuid; admin boolean:=public.community_admin(); result jsonb;
begin
 select * into e from public.community_events where id=p_event;
 if not found or (e.status='draft' and not admin) then raise exception 'Torneio indisponível.'; end if;
 select p.player_id into mine from public.user_profiles p where user_id=auth.uid();
 select jsonb_build_object('server_now',statement_timestamp(),'event',(to_jsonb(e)-'final_snapshot')||jsonb_build_object('format_code',f.code,'store_name',s.name),
  'entries',coalesce((select jsonb_agg((to_jsonb(n)-'decklist')||jsonb_build_object('name',p.name,'bandai_id',case when admin or p.id=mine then p.bandai_id else null end,
   'decklist',case when admin or p.id=mine then n.decklist else null end)) from public.community_entries n join public.players p on p.id=n.player_id where n.event_id=e.id),'[]'),
  'rounds',coalesce((select jsonb_agg(to_jsonb(r) order by number) from public.community_rounds r where r.event_id=e.id),'[]'),
  'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.table_number) from public.community_matches m where m.event_id=e.id),'[]'),
  'standings',case when admin then coalesce(e.final_snapshot,public.community_standings(e.id)) else coalesce((select jsonb_agg(v-'bandai_id') from jsonb_array_elements(coalesce(e.final_snapshot,public.community_standings(e.id))) v),'[]') end,
  'exports',case when admin then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.community_exports x where x.event_id=e.id),'[]') else '[]'::jsonb end,
  'audit',case when admin then coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select id,actor,action,created_at,details-'decklist' as details from public.community_audit where event_id=e.id order by id desc limit 100) x),'[]') else '[]'::jsonb end)
 into result from public.formats f left join public.stores s on s.id=e.store_id where f.id=e.format_id;
 return result;
end $$;


ALTER FUNCTION "public"."community_snapshot"("p_event" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_standings"("p_event" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
 with scores as (
  select e.id,e.player_id,e.checked_in,e.dropped,p.name,p.bandai_id,p.digilab_name,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then 3
    when (case when m.p1=e.id then m.wins-m.losses else m.losses-m.wins end)>0 then 3
    when m.wins=m.losses then 1 else 0 end),0)::integer points,
   count(m.id) filter(where m.p2 is null)::integer byes,
   count(m.id) filter(where m.p2 is not null)::numeric played,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then case when rules.include_bye_games then 6 else 0 end
    when m.p1=e.id then 3*m.wins+m.draws else 3*m.losses+m.draws end),0)::numeric game_points,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then case when rules.include_bye_games then 2 else 0 end
    else m.wins+m.losses+m.draws end),0)::numeric games
  from public.community_entries e join public.players p on p.id=e.player_id
  cross join (select rules_version='community-bo3-50-5-preview-v2' as include_bye_games from public.community_events where id=p_event) rules
  left join public.community_matches m on m.event_id=e.event_id and (m.p1=e.id or m.p2=e.id) and m.status='confirmed'
  where e.event_id=p_event group by e.id,p.id
 ), rates as (
  select *,coalesce((points-3*byes)/(3*nullif(played,0)),0) mw,coalesce(game_points/(3*nullif(games,0)),0) gw from scores
 ), ranked as (
  select a.*,coalesce(avg(greatest(b.mw,0.33)) filter(where b.id is not null),0) omw,coalesce(avg(greatest(b.gw,0.33)) filter(where b.id is not null),0) ogw
  from rates a left join public.community_matches m on m.event_id=p_event and m.status='confirmed' and m.p2 is not null and (m.p1=a.id or m.p2=a.id)
  left join rates b on b.id=case when m.p1=a.id then m.p2 else m.p1 end group by a.id,a.player_id,a.checked_in,a.dropped,a.name,a.bandai_id,a.digilab_name,a.points,a.byes,a.played,a.game_points,a.games,a.mw,a.gw
 ) select coalesce(jsonb_agg(to_jsonb(r) order by r.points desc,r.omw desc,r.gw desc,r.ogw desc,r.id),'[]') from ranked r
$$;


ALTER FUNCTION "public"."community_standings"("p_event" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_start_event"("p_event" "uuid", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare state jsonb; participants uuid[]; pairs jsonb; seed text:=gen_random_uuid()::text;
begin
 state:=public.community_command(p_event,'start','{}'::jsonb,p_revision);
 select array_agg(n.id order by md5(n.id::text||seed)) into participants
 from public.community_entries n where n.event_id=p_event and not n.dropped;
 select jsonb_agg(jsonb_build_object('p1',participants[i],'p2',participants[i+1]) order by i)
 into pairs from generate_series(1,cardinality(participants),2) as slots(i);
 state:=public.community_command(p_event,'pair',jsonb_build_object('pairs',pairs,'seed',seed),(state->'event'->>'revision')::integer);
 state:=public.community_command(p_event,'start_round','{}'::jsonb,(state->'event'->>'revision')::integer);
 return state;
end $$;


ALTER FUNCTION "public"."community_start_event"("p_event" "uuid", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_start_next_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare state jsonb;
begin
 -- The pairing command checks admin rights, locks the event and validates all tables.
 -- Both commands share one transaction so a failed clock start cannot leave half a round.
 state:=public.community_command(p_event,'pair',jsonb_build_object('pairs',p_data->'pairs','seed',p_data->>'seed'),p_revision);
 return public.community_command(p_event,'start_round','{}'::jsonb,(state->'event'->>'revision')::integer);
end $$;


ALTER FUNCTION "public"."community_start_next_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_my_player_link"("p_bandai_name" "text", "p_player_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."complete_my_player_link"("p_bandai_name" "text", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_my_player_link_without_admin"("p_bandai_name" "text", "p_player_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."complete_my_player_link_without_admin"("p_bandai_name" "text", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."copy_community_deck"("p_source_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."copy_community_deck"("p_source_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."copy_free_deck_to_result"("p_source_id" bigint, "p_result_id" "uuid", "p_replace" boolean DEFAULT false) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare source_draft jsonb; target_id bigint; legacy_text text; cards jsonb; target_format bigint; result_row record; matching_events integer;
begin
    select draft_cards into source_draft from public.decklists where id=p_source_id and tournament_result_id is null for update;
    if not found then raise exception 'Deck livre não encontrado.'; end if;
    select tournament_id,store_id,tournament_date into result_row from public.tournament_results where id=p_result_id for update;
    if not found then raise exception 'Participação não encontrada.'; end if;
    if result_row.tournament_id is not null then select deck_format_id into target_format from public.tournament where id=result_row.tournament_id;
    else select count(*),min(deck_format_id) into matching_events,target_format from public.tournament where store_id=result_row.store_id and tournament_date=result_row.tournament_date;
        if matching_events<>1 then raise exception 'Não foi possível identificar um único torneio para esta participação.'; end if;
    end if;
    if target_format is null then raise exception 'Formato do torneio não encontrado.'; end if;
    select id into target_id from public.decklists where tournament_result_id=p_result_id for update;
    if not coalesce(p_replace,false) and (target_id is not null or exists(select 1 from public.tournament_results where id=p_result_id and nullif(btrim(decklist),'') is not null)) then
        raise exception 'Esta participação já tem uma lista. Confirme a substituição.';
    end if;
    if source_draft is not null then
        select coalesce(jsonb_agg(jsonb_build_object('position',n,'card_code',c->>'code','qty',(c->>'qty')::integer) order by n),'[]'::jsonb),
            coalesce(string_agg((c->>'qty')||' '||(c->>'code'),E'\n' order by n),'') into cards,legacy_text from jsonb_array_elements(source_draft) with ordinality as x(c,n);
    else
        select coalesce(jsonb_agg(jsonb_build_object('position',position,'card_code',card_code,'qty',qty) order by position),'[]'::jsonb),
            coalesce(string_agg(qty::text||' '||card_code,E'\n' order by position),'') into cards,legacy_text from public.decklist_cards where decklist_id=p_source_id;
    end if;
    if jsonb_array_length(cards)=0 then raise exception 'O deck livre ainda não possui cartas.'; end if;
    if target_id is null then insert into public.decklists(tournament_result_id,source,deck_format_id) values(p_result_id,'builder',target_format) returning id into target_id;
    else update public.decklists set deck_format_id=target_format,draft_cards=null,draft_revision=draft_revision+1 where id=target_id;
    end if;
    perform public.replace_decklist_cards(target_id,cards);
    update public.tournament_results set decklist=legacy_text where id=p_result_id;
    if not found then raise exception 'Sem permissão para associar lista.'; end if;
    return target_id;
end;
$$;


ALTER FUNCTION "public"."copy_free_deck_to_result"("p_source_id" bigint, "p_result_id" "uuid", "p_replace" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."correct_known_card_rarity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if new.card_code='BT26-091' and upper(new.card_payload->>'rarity')='RC' then
        new.card_payload=jsonb_set(new.card_payload,'{rarity}','"R"'::jsonb);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."correct_known_card_rarity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."default_format_banlist"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare selected jsonb;
begin
    if not coalesce(new.validation_rules,'{}'::jsonb) ? 'use_official_banlist' then
        selected := to_jsonb(upper(new.code)<>'DIGICREST');
        if tg_op='UPDATE' then
            if coalesce(old.validation_rules,'{}'::jsonb) ? 'use_official_banlist' then
                selected := old.validation_rules->'use_official_banlist';
            end if;
        end if;
        new.validation_rules := coalesce(new.validation_rules,'{}'::jsonb)
            || jsonb_build_object('use_official_banlist',selected);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."default_format_banlist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."default_format_security"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if not coalesce(new.validation_rules,'{}'::jsonb) ? 'security_count' then
        new.validation_rules := coalesce(new.validation_rules,'{}'::jsonb) || '{"security_count":5}'::jsonb;
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."default_format_security"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_community_deck"("p_decklist_id" bigint, "p_updated_at" timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare deck public.decklists;
begin
    select * into deck from public.decklists where id=p_decklist_id and tournament_result_id is null for update;
    if not found then raise exception 'Deck da comunidade não encontrado.' using errcode='P0002'; end if;
    if not public.site_can_delete_community_deck(deck.owner_user_id) then
        raise exception 'Você não pode excluir este deck.' using errcode='42501';
    end if;
    if p_updated_at is null or deck.updated_at is distinct from p_updated_at then
        raise exception 'Este deck foi alterado. Atualize a lista.' using errcode='40001';
    end if;
    delete from public.decklists where id=deck.id;
    return deck.id;
end;
$$;


ALTER FUNCTION "public"."delete_community_deck"("p_decklist_id" bigint, "p_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_tournament_transaction"("p_tournament_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
    v_store_id uuid;
    v_tournament_date date;
    v_storage_paths jsonb;
begin
    if not (public.site_is_admin() or public.site_is_maintenance()) then
        raise exception 'Acesso administrativo necessário.' using errcode = '42501';
    end if;

    select store_id, tournament_date
    into v_store_id, v_tournament_date
    from public.tournament
    where id = p_tournament_id
    for update;

    if not found then
        raise exception 'Tournament % not found', p_tournament_id
            using errcode = 'P0002';
    end if;

    select coalesce(jsonb_agg(storage_path order by id), '[]'::jsonb)
    into v_storage_paths
    from public.tournament_ocr_files
    where tournament_id = p_tournament_id;

    delete from public.tournament_results
    where tournament_id = p_tournament_id
       or (
            tournament_id is null
            and store_id = v_store_id
            and tournament_date = v_tournament_date
       );

    delete from public.tournament
    where id = p_tournament_id;

    return jsonb_build_object(
        'tournament_id', p_tournament_id,
        'storage_paths', v_storage_paths
    );
end;
$$;


ALTER FUNCTION "public"."delete_tournament_transaction"("p_tournament_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."digilab_normalize"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
    select btrim(regexp_replace(
        regexp_replace(normalize(lower(coalesce(p_value, '')), NFKD), U&'[\0300-\036f]', '', 'g'),
        '[^a-z0-9]+', ' ', 'g'));
$$;


ALTER FUNCTION "public"."digilab_normalize"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_single_default_format"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE public.formats
        SET is_default = false
        WHERE id <> COALESCE(NEW.id, -1)
          AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_single_default_format"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint, "p_outcome" "text", "p_details" "jsonb", "p_next_attempt" timestamp with time zone, "p_tournament_id" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    update public.digilab_background_imports set
        status = case when p_outcome in ('imported','updated','unchanged') then 'imported' else p_outcome end,
        tournament_id = coalesce(p_tournament_id, tournament_id),
        imported_at = case when p_outcome in ('imported','updated','unchanged') then now() else imported_at end,
        last_error = p_details->>'error', next_attempt_at = p_next_attempt,
        claim_run_id = null, lease_until = null
    where digilab_tournament_id = p_external_id and claim_run_id = p_run_id;
    if not found then raise exception 'Reserva da fila expirada.'; end if;
    insert into public.digilab_sync_events(run_id, digilab_tournament_id, outcome, details)
      values(p_run_id, p_external_id, p_outcome, p_details);
end;
$$;


ALTER FUNCTION "public"."finish_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint, "p_outcome" "text", "p_details" "jsonb", "p_next_attempt" timestamp with time zone, "p_tournament_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_digilab_sync_run"("p_run_id" "uuid", "p_summary" "jsonb", "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    update public.digilab_sync_runs set finished_at = now(), status = case when p_error is null then 'completed' else 'failed' end,
        summary = p_summary, error = p_error where id = p_run_id and status = 'running';
    update public.digilab_sync_state set lease_until = null where id and run_id = p_run_id;
end;
$$;


ALTER FUNCTION "public"."finish_digilab_sync_run"("p_run_id" "uuid", "p_summary" "jsonb", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_site_account_auth_erasure"("p_job_id" "uuid", "p_success" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare j public.site_account_erasure_jobs;
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    select * into j from public.site_account_erasure_jobs where id=p_job_id for update;
    if not found then raise exception 'Procedimento não encontrado.'; end if;
    if j.stage='completed' then return; end if;
    if p_success and exists(select 1 from auth.users where id=j.user_id) then raise exception 'As credenciais ainda existem no provedor.'; end if;
    update public.site_account_erasure_jobs set stage=case when p_success then 'auth_deleted' else 'failed' end,
        auth_deleted_at=case when p_success then coalesce(auth_deleted_at,now()) else auth_deleted_at end,
        error_code=case when p_success then null else 'auth_delete_failed' end where id=j.id;
end;
$$;


ALTER FUNCTION "public"."finish_site_account_auth_erasure"("p_job_id" "uuid", "p_success" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_community_deck_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if old.tournament_result_id is null and not public.site_is_maintenance()
        and not public.site_can_delete_community_deck(old.owner_user_id) then
        raise exception 'Você só pode excluir seus próprios decks. Administradores também podem excluir decks anônimos.' using errcode='42501';
    end if;
    return old;
end;
$$;


ALTER FUNCTION "public"."guard_community_deck_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_erasure_request_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if new.request_type='erasure' and new.status in ('approved','completed') and not exists(
        select 1 from public.site_account_erasure_jobs where request_id=new.id and stage='completed') then
        raise exception 'Use o procedimento de eliminação e conclua a revisão externa antes de encerrar esta solicitação.';
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."guard_erasure_request_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_format_regulations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare changed boolean;
begin
    if tg_op = 'INSERT' then
        changed := new.description is not null or new.rules_text is not null or new.rules_url is not null or new.is_community_highlight;
    elsif tg_op = 'DELETE' then
        changed := old.description is not null or old.rules_text is not null or old.rules_url is not null or old.is_community_highlight;
    else
        changed := row(new.description,new.rules_text,new.rules_url,new.is_community_highlight)
            is distinct from row(old.description,old.rules_text,old.rules_url,old.is_community_highlight);
    end if;
    if changed and coalesce(auth.role(), '') <> 'service_role'
        and not (auth.role() is null and session_user in ('postgres', 'supabase_admin'))
        and not exists (select 1 from public.admin_users where user_id = auth.uid()) then
        raise exception 'Somente administradores podem alterar regulamentos.' using errcode = '42501';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."guard_format_regulations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_format_validation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare changed boolean;
begin
    changed := case when tg_op='INSERT' then new.validation_rules is not null
        when tg_op='DELETE' then old.validation_rules is not null
        else row(new.validation_rules,new.rules_revision,new.rules_status) is distinct from row(old.validation_rules,old.rules_revision,old.rules_status) end;
    if changed and coalesce(auth.role(),'')<>'service_role'
        and not(auth.role() is null and session_user in ('postgres','supabase_admin'))
        and not exists(select 1 from public.admin_users where user_id=auth.uid()) then
        raise exception 'Somente administradores podem alterar regras de validação.' using errcode='42501';
    end if;
    if tg_op='DELETE' then return old; end if;
    if tg_op='INSERT' then new.rules_revision:=1;
    else new.rules_revision:=old.rules_revision + case when row(new.validation_rules,new.rules_text,new.rules_url,new.rules_status) is distinct from row(old.validation_rules,old.rules_text,old.rules_url,old.rules_status) then 1 else 0 end;
    end if;
    if new.rules_status='published' and not (new.validation_rules ?& array['main_count','egg_max','copies']) then raise exception 'Defina deck principal, Digi-Eggs e limite de cópias antes de publicar o regulamento.'; end if;
    if new.rules_status='published' and new.validation_rules is null then raise exception 'Cadastre as regras antes de publicar.'; end if;
    new.updated_at:=now();
    return new;
end;
$$;


ALTER FUNCTION "public"."guard_format_validation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_pending_format_points"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if new.rules_status='published' and coalesce(jsonb_array_length(new.validation_rules->'points_pending'),0)>0 then
        raise exception 'Corrija os códigos pendentes da pontuação antes de publicar o regulamento.';
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."guard_pending_format_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_site_admin_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if public.site_accounts_enabled() and not public.site_is_maintenance() and not public.site_is_admin() then
        raise exception 'Acesso administrativo necessário.' using errcode='42501';
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
end;
$$;


ALTER FUNCTION "public"."guard_site_admin_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_site_deck_ownership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."guard_site_deck_ownership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_site_legal_activation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if new.accounts_enabled then
        if not exists(select 1 from public.site_legal_documents where kind='terms' and version=new.terms_version and url=new.terms_url)
            or not exists(select 1 from public.site_legal_documents where kind='privacy' and version=new.privacy_version and url=new.privacy_url) then
            raise exception 'Publique e registre os termos e o aviso de privacidade antes de ativar.';
        end if;
        if not old.accounts_enabled and not public.site_legal_current(auth.uid()) then
            raise exception 'Atualize seu perfil com os aceites e a declaração de maioridade antes de ativar.';
        end if;
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."guard_site_legal_activation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_site_legal_document"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin raise exception 'Uma versão publicada é imutável. Publique uma nova versão.' using errcode='42501'; end;
$$;


ALTER FUNCTION "public"."guard_site_legal_document"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_site_player_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."guard_site_player_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_digilab_tournament_transaction"("p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_existing_tournament_id bigint;
    v_saved jsonb;
    v_tournament_id bigint;
    v_mapping jsonb;
    v_result jsonb;
    v_updated_results integer := 0;
    v_rows_updated integer := 0;
begin
    if p_digilab_tournament_id is null or p_digilab_tournament_id <= 0 then
        raise exception 'ID DigiLab invalido.' using errcode = '22023';
    end if;

    if p_results is null or jsonb_typeof(p_results) <> 'array' then
        raise exception 'Resultados invalidos.' using errcode = '22023';
    end if;

    if p_player_mappings is null or jsonb_typeof(p_player_mappings) <> 'array' then
        raise exception 'Mapeamentos de jogadores invalidos.' using errcode = '22023';
    end if;

    select tournament_id
    into v_existing_tournament_id
    from public.tournament_digilab_sync
    where digilab_tournament_id = p_digilab_tournament_id
      and status = 'matched'
    limit 1
    for update;

    for v_mapping in
        select item from jsonb_array_elements(p_player_mappings) as source(item)
    loop
        if nullif(btrim(v_mapping->>'digilab_player_slug'), '') is null
           or nullif(v_mapping->>'player_id', '') is null then
            raise exception 'Mapeamento de jogador incompleto.' using errcode = '22023';
        end if;

        insert into public.digilab_player_sync (
            digilab_player_slug,
            digilab_player_name,
            player_id,
            updated_at
        ) values (
            btrim(v_mapping->>'digilab_player_slug'),
            nullif(btrim(v_mapping->>'digilab_player_name'), ''),
            (v_mapping->>'player_id')::uuid,
            timezone('utc', now())
        )
        on conflict (digilab_player_slug) do update
        set
            digilab_player_name = excluded.digilab_player_name,
            player_id = excluded.player_id,
            updated_at = timezone('utc', now());
    end loop;

    for v_result in
        select item from jsonb_array_elements(p_results) as source(item)
    loop
        if nullif(btrim(v_result->>'digilab_deck_slug'), '') is not null
           and nullif(v_result->>'deck_id', '') is not null then
            insert into public.digilab_deck_sync (
                digilab_deck_slug,
                digilab_deck_name,
                deck_id,
                updated_at
            ) values (
                btrim(v_result->>'digilab_deck_slug'),
                nullif(btrim(v_result->>'digilab_deck_name'), ''),
                (v_result->>'deck_id')::uuid,
                timezone('utc', now())
            )
            on conflict (digilab_deck_slug) do update
            set
                digilab_deck_name = excluded.digilab_deck_name,
                deck_id = excluded.deck_id,
                updated_at = timezone('utc', now());
        end if;
    end loop;

    if v_existing_tournament_id is not null then
        for v_result in
            select item from jsonb_array_elements(p_results) as source(item)
        loop
            update public.tournament_results
            set
                deck_id = coalesce(nullif(v_result->>'deck_id', '')::uuid, deck_id),
                match_points = coalesce(
                    nullif(v_result->>'match_points', '')::integer,
                    match_points
                )
            where tournament_id = v_existing_tournament_id
              and player_id = (v_result->>'player_id')::uuid;
            get diagnostics v_rows_updated = row_count;
            v_updated_results := v_updated_results + v_rows_updated;
        end loop;

        update public.tournament_digilab_sync
        set
            last_checked_at = timezone('utc', now()),
            comparison_summary = coalesce(comparison_summary, '{}'::jsonb) ||
                jsonb_build_object(
                    'source', 'digilab_reverse_sync',
                    'results_updated', v_updated_results
                )
        where tournament_id = v_existing_tournament_id;

        return jsonb_build_object(
            'tournament_id', v_existing_tournament_id,
            'digilab_tournament_id', p_digilab_tournament_id,
            'results_count', jsonb_array_length(p_results),
            'results_updated', v_updated_results,
            'reused', true
        );
    end if;

    v_saved := public.save_tournament_transaction(
        null,
        p_tournament,
        p_results,
        '[]'::jsonb
    );
    v_tournament_id := (v_saved->>'tournament_id')::bigint;

    update public.tournament
    set rounds = nullif(p_tournament->>'rounds', '')::smallint
    where id = v_tournament_id;

    insert into public.tournament_digilab_sync (
        tournament_id,
        digilab_tournament_id,
        digilab_url,
        status,
        verified_at,
        last_checked_at,
        last_error_code,
        comparison_summary
    ) values (
        v_tournament_id,
        p_digilab_tournament_id,
        p_digilab_url,
        'matched',
        timezone('utc', now()),
        timezone('utc', now()),
        null,
        jsonb_build_object(
            'source', 'digilab_reverse_import',
            'results_count', jsonb_array_length(p_results)
        )
    );

    return jsonb_build_object(
        'tournament_id', v_tournament_id,
        'digilab_tournament_id', p_digilab_tournament_id,
        'results_count', jsonb_array_length(p_results),
        'reused', false
    );
end;
$$;


ALTER FUNCTION "public"."import_digilab_tournament_transaction"("p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_player_bandai"("p_bandai_id" "text", "p_bandai_nick" "text") RETURNS TABLE("id" "uuid", "name" "text", "bandai_id" "text", "bandai_nick" "text", "match_type" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 1. Tenta pelo bandai_id (mais confiável, exceto GUEST)
  IF p_bandai_id IS NOT NULL AND p_bandai_id NOT ILIKE 'GUEST%' THEN
    RETURN QUERY
      SELECT p.id, p.name, p.bandai_id, p.bandai_nick, 'bandai_id'::TEXT
      FROM players p
      WHERE p.bandai_id = p_bandai_id
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Tenta pelo bandai_nick (case-insensitive)
  IF p_bandai_nick IS NOT NULL AND p_bandai_nick <> '' THEN
    RETURN QUERY
      SELECT p.id, p.name, p.bandai_id, p.bandai_nick, 'bandai_nick'::TEXT
      FROM players p
      WHERE LOWER(p.bandai_nick) = LOWER(p_bandai_nick)
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3. Fallback: tenta pelo name da tabela (case-insensitive)
  IF p_bandai_nick IS NOT NULL AND p_bandai_nick <> '' THEN
    RETURN QUERY
      SELECT p.id, p.name, p.bandai_id, p.bandai_nick, 'name_fallback'::TEXT
      FROM players p
      WHERE LOWER(p.name) = LOWER(p_bandai_nick)
      LIMIT 1;
  END IF;
END;
$$;


ALTER FUNCTION "public"."match_player_bandai"("p_bandai_id" "text", "p_bandai_nick" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_site_account"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select jsonb_build_object('profile',to_jsonb(p),'is_admin',public.site_is_admin(),
        'is_member',public.site_is_member(),'legal_current',public.site_legal_current(auth.uid()),
        'player_link_required',p.player_id is null and public.site_has_identity())
    from public.user_profiles p where user_id=auth.uid()
$$;


ALTER FUNCTION "public"."my_site_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_site_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare result jsonb;
begin
    if auth.uid() is null then raise exception 'Entre para consultar seus dados.' using errcode='42501'; end if;
    select jsonb_build_object(
        'profile',(select to_jsonb(p) from public.user_profiles p where user_id=auth.uid()),
        'legal_acceptances',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.site_legal_acceptances a where user_id=auth.uid()),
        'email',(select email from auth.users where id=auth.uid()),
        'player',(select to_jsonb(p) from public.players p join public.user_profiles u on u.player_id=p.id where u.user_id=auth.uid()),
        'decks',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'creator_player_id',creator_player_id,'deck_format_id',deck_format_id,'draft_cards',draft_cards,'updated_at',updated_at)),'[]') from public.decklists where owner_user_id=auth.uid()),
        'requests',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.account_requests r where user_id=auth.uid())
    ) into result;
    perform site_audit.record('account.data_exported','user_profiles',auth.uid()::text,'{}');
    return result;
end;
$$;


ALTER FUNCTION "public"."my_site_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_tournament_type_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    new.tournament_name := case
        when lower(btrim(new.tournament_name)) = 'locals' then 'Semanal'
        when lower(btrim(new.tournament_name)) in ('evo_cup', 'evo cup', 'evo-cup')
            then 'Evo Cup'
        else new.tournament_name
    end;

    return new;
end;
$$;


ALTER FUNCTION "public"."normalize_tournament_type_name"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_tournament_type_name"() IS 'Normalizes DigiLab tournament type slugs to the display values used by DigiStats.';



CREATE OR REPLACE FUNCTION "public"."purge_operational_history"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
    sync_runs integer := 0;
    catalog_runs integer := 0;
    cron_runs integer := 0;
begin
    if not public.site_is_maintenance() then
        raise exception 'Operação restrita à rotina de manutenção.' using errcode = '42501';
    end if;

    -- Events go with their run (on delete cascade). Keep running runs and runs still
    -- referenced by the sync state or by an import claim.
    delete from public.digilab_sync_runs run
    where coalesce(run.finished_at, run.started_at) < now() - interval '90 days'
        and run.status <> 'running'
        and not exists (select 1 from public.digilab_sync_state state where state.run_id = run.id)
        and not exists (
            select 1 from public.digilab_background_imports import where import.claim_run_id = run.id
        );
    get diagnostics sync_runs = row_count;

    delete from public.digilab_catalog_sync_runs
    where coalesce(finished_at, started_at) < now() - interval '90 days'
        and status <> 'running';
    get diagnostics catalog_runs = row_count;

    if to_regclass('cron.job_run_details') is not null then
        execute 'delete from cron.job_run_details where end_time < now() - interval ''30 days''';
        get diagnostics cron_runs = row_count;
    end if;

    return jsonb_build_object(
        'digilab_sync_runs', sync_runs,
        'digilab_catalog_sync_runs', catalog_runs,
        'cron_job_run_details', cron_runs
    );
end;
$$;


ALTER FUNCTION "public"."purge_operational_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_site_audit"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."purge_site_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_digilab_tournament_results"("p_tournament_id" bigint, "p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_result jsonb;
    v_mapping jsonb;
    v_result_id uuid;
    v_locked_tournament_id bigint;
    v_added integer := 0;
    v_updated integer := 0;
begin
    if p_tournament_id is null or p_tournament_id <= 0 then
        raise exception 'ID do torneio DigiStats invalido.' using errcode = '22023';
    end if;
    if p_digilab_tournament_id is null or p_digilab_tournament_id <= 0 then
        raise exception 'ID DigiLab invalido.' using errcode = '22023';
    end if;
    if p_results is null or jsonb_typeof(p_results) <> 'array' then
        raise exception 'Resultados invalidos.' using errcode = '22023';
    end if;
    select id
    into v_locked_tournament_id
    from public.tournament
    where id = p_tournament_id
    for update;
    if v_locked_tournament_id is null then
        raise exception 'Torneio DigiStats nao encontrado.' using errcode = 'P0002';
    end if;

    for v_mapping in
        select item from jsonb_array_elements(p_player_mappings) as source(item)
    loop
        insert into public.digilab_player_sync (
            digilab_player_slug,
            digilab_player_name,
            player_id,
            updated_at
        ) values (
            btrim(v_mapping->>'digilab_player_slug'),
            nullif(btrim(v_mapping->>'digilab_player_name'), ''),
            (v_mapping->>'player_id')::uuid,
            timezone('utc', now())
        )
        on conflict (digilab_player_slug) do update
        set
            digilab_player_name = excluded.digilab_player_name,
            player_id = excluded.player_id,
            updated_at = timezone('utc', now());
    end loop;

    for v_result in
        select item from jsonb_array_elements(p_results) as source(item)
    loop
        if nullif(v_result->>'player_id', '') is null
           or nullif(v_result->>'deck_id', '') is null
           or coalesce((v_result->>'placement')::integer, 0) <= 0 then
            raise exception 'Resultado incompleto para reconciliacao.' using errcode = '22023';
        end if;

        if nullif(btrim(v_result->>'digilab_deck_slug'), '') is not null then
            insert into public.digilab_deck_sync (
                digilab_deck_slug,
                digilab_deck_name,
                deck_id,
                updated_at
            ) values (
                btrim(v_result->>'digilab_deck_slug'),
                nullif(btrim(v_result->>'digilab_deck_name'), ''),
                (v_result->>'deck_id')::uuid,
                timezone('utc', now())
            )
            on conflict (digilab_deck_slug) do update
            set
                digilab_deck_name = excluded.digilab_deck_name,
                deck_id = excluded.deck_id,
                updated_at = timezone('utc', now());
        end if;

        select id
        into v_result_id
        from public.tournament_results
        where tournament_id = p_tournament_id
          and player_id = (v_result->>'player_id')::uuid
        order by created_at
        limit 1
        for update;

        if v_result_id is null then
            insert into public.tournament_results (
                tournament_id,
                store_id,
                tournament_date,
                total_players,
                placement,
                deck_id,
                player_id,
                match_points
            ) values (
                p_tournament_id,
                (p_tournament->>'store_id')::uuid,
                (p_tournament->>'tournament_date')::date,
                (p_tournament->>'total_players')::smallint,
                (v_result->>'placement')::smallint,
                (v_result->>'deck_id')::uuid,
                (v_result->>'player_id')::uuid,
                nullif(v_result->>'match_points', '')::integer
            );
            v_added := v_added + 1;
        else
            update public.tournament_results
            set
                store_id = (p_tournament->>'store_id')::uuid,
                tournament_date = (p_tournament->>'tournament_date')::date,
                total_players = (p_tournament->>'total_players')::smallint,
                placement = (v_result->>'placement')::smallint,
                deck_id = (v_result->>'deck_id')::uuid,
                match_points = nullif(v_result->>'match_points', '')::integer
            where id = v_result_id;
            v_updated := v_updated + 1;
        end if;
        v_result_id := null;
    end loop;

    update public.tournament
    set
        total_players = (p_tournament->>'total_players')::smallint,
        rounds = nullif(p_tournament->>'rounds', '')::smallint
    where id = p_tournament_id;

    insert into public.tournament_digilab_sync (
        tournament_id,
        digilab_tournament_id,
        digilab_url,
        status,
        verified_at,
        last_checked_at,
        last_error_code,
        comparison_summary
    ) values (
        p_tournament_id,
        p_digilab_tournament_id,
        p_digilab_url,
        'matched',
        timezone('utc', now()),
        timezone('utc', now()),
        null,
        jsonb_build_object(
            'source', 'admin_digilab_reconciliation',
            'results_added', v_added,
            'results_updated', v_updated,
            'positions_replaced', true
        )
    )
    on conflict (tournament_id) do update
    set
        digilab_tournament_id = excluded.digilab_tournament_id,
        digilab_url = excluded.digilab_url,
        status = 'matched',
        verified_at = excluded.verified_at,
        last_checked_at = excluded.last_checked_at,
        last_error_code = null,
        comparison_summary = excluded.comparison_summary;

    return jsonb_build_object(
        'tournament_id', p_tournament_id,
        'digilab_tournament_id', p_digilab_tournament_id,
        'results_count', jsonb_array_length(p_results),
        'results_added', v_added,
        'results_updated', v_updated,
        'positions_replaced', true,
        'reused', true
    );
end;
$$;


ALTER FUNCTION "public"."reconcile_digilab_tournament_results"("p_tournament_id" bigint, "p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reconcile_digilab_tournament_results"("p_tournament_id" bigint, "p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") IS 'Completa e corrige resultados de um torneio local escolhido usando standings revisados do DigiLab.';



CREATE OR REPLACE FUNCTION "public"."reconcile_linked_player_deck_ownership"("p_player_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare deck record; affected integer:=0;
    previous_transfer text:=current_setting('app.site_owner_transfer',true);
begin
    if not (public.site_is_maintenance() or public.site_is_admin()) then
        raise exception 'Acesso administrativo necessário.' using errcode='42501';
    end if;
    perform set_config('app.site_owner_transfer','approved',true);
    for deck in
        update public.decklists d set owner_user_id=p.user_id,
            updated_at=now(),draft_revision=d.draft_revision+1
        from public.user_profiles p join auth.users u on u.id=p.user_id
        where d.tournament_result_id is null and d.owner_user_id is null
            and d.creator_player_id=p.player_id and p.status='active'
            and u.email_confirmed_at is not null
            and u.email not like '%@admin.digistats.local'
            and (p_player_id is null or p.player_id=p_player_id)
        returning d.id,d.owner_user_id,d.creator_player_id
    loop
        affected:=affected+1;
        perform site_audit.record('deck.ownership_reconciled','decklists',deck.id::text,
            jsonb_build_object('owner_user_id',deck.owner_user_id,
                'player_id',deck.creator_player_id,'reason','Conta vinculada ao autor cadastrado'));
        update public.account_requests set
            status=case when user_id=deck.owner_user_id then 'approved' else 'rejected' end,
            reviewed_by=auth.uid(),reviewed_at=now(),
            review_note='Propriedade reconciliada com a conta vinculada ao autor cadastrado.'
        where request_type='deck_claim' and decklist_id=deck.id and status='pending';
    end loop;
    perform set_config('app.site_owner_transfer',coalesce(previous_transfer,''),true);
    return affected;
end;
$$;


ALTER FUNCTION "public"."reconcile_linked_player_deck_ownership"("p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_deck_format_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if tg_op='INSERT' or new.rules_revision<>old.rules_revision then
        insert into public.deck_format_rule_versions(deck_format_id,version,description,rules_snapshot)
        values(new.id,new.rules_revision,coalesce(nullif(btrim(new.change_note),''),'Regulamento atualizado.'),jsonb_build_object('rules',new.validation_rules,'text',new.rules_text,'status',new.rules_status))
        on conflict(deck_format_id,version) do nothing;
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."record_deck_format_revision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select public.record_site_integration_event(p_actor_user_id,p_operation,p_execution_id,p_status,null)
$$;


ALTER FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select public.record_site_integration_event(p_actor_user_id,p_operation,p_execution_id,p_status,p_parent_operation_id,
        case when p_actor_user_id is not null then 'user' when p_status in (401,403) then 'anonymous' else 'service' end)
$$;


ALTER FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid", "p_actor_kind" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    if p_operation !~ '^[a-z0-9-]{1,80}$' or p_status not between 100 and 599
        or p_actor_kind not in ('user','service','anonymous')
        or (p_actor_kind='user' and p_actor_user_id is null)
        or (p_actor_kind<>'user' and p_actor_user_id is not null) then raise exception 'Evento inválido.'; end if;
    insert into site_audit.integration_runs(operation_id,parent_operation_id,operation,actor_user_id,finished_at,http_status)
    values(p_execution_id,p_parent_operation_id,p_operation,p_actor_user_id,clock_timestamp(),p_status)
    on conflict(operation_id) do update set finished_at=excluded.finished_at,http_status=excluded.http_status;
    insert into site_audit.events(actor_user_id,actor_kind,action,entity_type,entity_id,operation_id,outcome,changes)
    values(p_actor_user_id,p_actor_kind,'integration.'||p_operation,'integration',p_execution_id::text,p_execution_id::text,
        case when p_status in (401,403) then 'denied' when p_status>=400 then 'failure' else 'success' end,
        jsonb_build_object('http_status',p_status,'parent_operation_id',p_parent_operation_id));
end;
$_$;


ALTER FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid", "p_actor_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_decklist_cards"("p_decklist_id" bigint, "p_cards" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    perform 1 from public.decklists where id = p_decklist_id for update;
    if not found then raise exception 'Lista não encontrada ou sem permissão.'; end if;
    if jsonb_typeof(p_cards) is distinct from 'array' then raise exception 'Cartas inválidas.'; end if;
    delete from public.decklist_cards where decklist_id = p_decklist_id;
    insert into public.decklist_cards(decklist_id,position,card_code,qty)
        select p_decklist_id, c.position, c.card_code, c.qty
        from jsonb_to_recordset(p_cards) as c(position integer,card_code text,qty integer);
    update public.decklists set updated_at = timezone('utc',now()) where id = p_decklist_id;
end;
$$;


ALTER FUNCTION "public"."replace_decklist_cards"("p_decklist_id" bigint, "p_cards" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_legacy_player_admins"("p_keep_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."reserve_legacy_player_admins"("p_keep_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_deck_draft"("p_decklist_id" bigint, "p_result_id" "uuid", "p_name" "text", "p_deck_format_id" bigint, "p_cards" "jsonb", "p_expected_revision" integer, "p_archetype_id" "uuid" DEFAULT NULL::"uuid", "p_creator_player_id" "uuid" DEFAULT NULL::"uuid", "p_partner_card_code" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
declare deck_row public.decklists%rowtype; result_row record; format_key bigint; revision integer; event_matches integer; archetype_key uuid; creator_key uuid;
begin
    if public.site_accounts_enabled() and not public.site_is_member() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
    if public.site_accounts_enabled() and p_result_id is not null and not public.site_is_admin() then raise exception 'Listas de torneios exigem acesso administrativo.' using errcode='42501'; end if;
    if length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Informe um nome de deck entre 1 e 120 caracteres.'; end if;
    if p_cards is null or not public.valid_deck_draft_cards(p_cards) then raise exception 'O rascunho contém códigos ou quantidades inválidos.'; end if;
    if p_partner_card_code is not null and p_partner_card_code !~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$' then raise exception 'Código do partner inválido.'; end if;
    format_key:=p_deck_format_id;
    archetype_key:=p_archetype_id;
    if p_result_id is not null then
        select tournament_id,store_id,tournament_date,deck_id into result_row from public.tournament_results where id=p_result_id for update;
        if not found then raise exception 'Participação não encontrada ou sem permissão.'; end if;
        archetype_key:=result_row.deck_id;
        if result_row.tournament_id is not null then select deck_format_id into format_key from public.tournament where id=result_row.tournament_id;
        else
            select count(*),min(deck_format_id) into event_matches,format_key from public.tournament where store_id=result_row.store_id and tournament_date=result_row.tournament_date;
            if event_matches<>1 then raise exception 'Não foi possível identificar um único torneio para esta participação.'; end if;
        end if;
        select * into deck_row from public.decklists where tournament_result_id=p_result_id for update;
    elsif p_decklist_id is not null then
        select * into deck_row from public.decklists where id=p_decklist_id and tournament_result_id is null for update;
        if not found then raise exception 'Deck livre não encontrado ou sem permissão.'; end if;
    end if;
    if deck_row.id is not null and deck_row.draft_revision is distinct from p_expected_revision then
        raise exception 'O deck foi atualizado por outra pessoa.' using errcode='40001';
    end if;
    if p_result_id is null then
        archetype_key:=coalesce(archetype_key,deck_row.archetype_id);
        if deck_row.id is null and archetype_key is null then raise exception 'Selecione um tipo de deck cadastrado.'; end if;
        if archetype_key is distinct from deck_row.archetype_id and not exists(select 1 from public.decks where id=archetype_key and is_active=true) then
            raise exception 'Selecione um tipo de deck ativo e cadastrado.';
        end if;
    end if;
    creator_key:=coalesce(p_creator_player_id,deck_row.creator_player_id);
    if deck_row.id is null and creator_key is null and auth.uid() is not null then
        select player_id into creator_key from public.user_profiles where user_id=auth.uid();
    end if;
    if creator_key is not null and not exists(select 1 from public.players where id=creator_key) then raise exception 'Selecione um jogador cadastrado.'; end if;
    select rules_revision into revision from public.deck_formats where id=format_key;
    if not found then raise exception 'Selecione um formato cadastrado.'; end if;
    if deck_row.id is null then
        insert into public.decklists(name,deck_format_id,tournament_result_id,source,draft_cards,draft_revision,format_rules_revision,archetype_id,creator_player_id,partner_card_code)
            values(upper(btrim(p_name)),format_key,p_result_id,'builder',p_cards,1,revision,archetype_key,creator_key,p_partner_card_code) returning * into deck_row;
    else
        update public.decklists set name=upper(btrim(p_name)),deck_format_id=format_key,draft_cards=p_cards,archetype_id=archetype_key,creator_player_id=creator_key,partner_card_code=p_partner_card_code,
            draft_revision=draft_revision+1,format_rules_revision=revision,updated_at=timezone('utc',now()) where id=deck_row.id returning * into deck_row;
        if not found then raise exception 'Sem permissão para salvar o rascunho.' using errcode='42501'; end if;
    end if;
    return jsonb_build_object('id',deck_row.id,'draft_revision',deck_row.draft_revision,'rules_revision',revision,'owner_user_id',deck_row.owner_user_id,'partner_card_code',deck_row.partner_card_code);
end;
$_$;


ALTER FUNCTION "public"."save_deck_draft"("p_decklist_id" bigint, "p_result_id" "uuid", "p_name" "text", "p_deck_format_id" bigint, "p_cards" "jsonb", "p_expected_revision" integer, "p_archetype_id" "uuid", "p_creator_player_id" "uuid", "p_partner_card_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_my_site_profile"("p_username" "text", "p_display_name" "text", "p_privacy_version" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare required_version text; result public.user_profiles;
begin
    if not public.site_has_identity() then raise exception 'Confirme seu e-mail e use uma conta ativa.' using errcode='42501'; end if;
    select privacy_version into required_version from public.site_security_config where singleton;
    if required_version is null or p_privacy_version is distinct from required_version then raise exception 'Leia a versão atual do aviso de privacidade.'; end if;
    update public.user_profiles set username=lower(btrim(p_username)),display_name=btrim(p_display_name),
        privacy_version=required_version,privacy_acknowledged_at=now(),updated_at=now()
    where user_id=auth.uid() returning * into result;
    return to_jsonb(result);
end;
$$;


ALTER FUNCTION "public"."save_my_site_profile"("p_username" "text", "p_display_name" "text", "p_privacy_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_my_site_profile_legal"("p_username" "text", "p_display_name" "text", "p_terms_version" "text", "p_privacy_version" "text", "p_accept_terms" boolean, "p_ack_privacy" boolean, "p_declare_adult" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare c public.site_security_config; t public.site_legal_documents; p public.site_legal_documents; acceptance uuid;
begin
    if not public.site_has_identity() then raise exception 'Confirme seu e-mail e use uma conta ativa.' using errcode='42501'; end if;
    if p_accept_terms is distinct from true or p_ack_privacy is distinct from true or p_declare_adult is distinct from true then
        raise exception 'Aceite os termos, leia o aviso e declare ter 18 anos ou mais.' using errcode='22023';
    end if;
    select * into c from public.site_security_config where singleton for share;
    if p_terms_version is distinct from c.terms_version or p_privacy_version is distinct from c.privacy_version or not public.site_legal_ready() then
        raise exception 'Os documentos foram atualizados ou ainda não estão publicados. Leia as versões vigentes.' using errcode='40001';
    end if;
    select * into t from public.site_legal_documents where kind='terms' and version=c.terms_version;
    select * into p from public.site_legal_documents where kind='privacy' and version=c.privacy_version;
    -- Store authenticated evidence only; signup metadata is never an acceptance.
    if not public.site_legal_current(auth.uid()) then
        insert into public.site_legal_acceptances(user_id,terms_version,privacy_version,terms_sha256,privacy_sha256,declared_adult)
        values(auth.uid(),t.version,p.version,t.sha256,p.sha256,true) returning id into acceptance;
        update public.user_profiles set legal_acceptance_id=acceptance,terms_version=t.version,terms_accepted_at=now(),adult_declared_at=now()
        where user_id=auth.uid();
    end if;
    return public.save_my_site_profile(p_username,p_display_name,p_privacy_version);
end;
$$;


ALTER FUNCTION "public"."save_my_site_profile_legal"("p_username" "text", "p_display_name" "text", "p_terms_version" "text", "p_privacy_version" "text", "p_accept_terms" boolean, "p_ack_privacy" boolean, "p_declare_adult" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_tournament_transaction"("p_tournament_id" bigint, "p_tournament" "jsonb", "p_results" "jsonb", "p_ocr_files" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_tournament_id bigint;
    v_store_id uuid;
    v_tournament_date date;
    v_tournament_name text;
    v_total_players smallint;
    v_instagram_link text;
    v_format_id bigint;
    v_result jsonb;
    v_ordinality bigint;
    v_result_id uuid;
    v_existing_ids uuid[] := ARRAY[]::uuid[];
    v_rows_affected integer;
    v_team boolean;
    v_placement smallint;
    v_member smallint;
BEGIN
    IF p_tournament IS NULL OR jsonb_typeof(p_tournament) <> 'object' THEN
        RAISE EXCEPTION 'Dados do torneio invalidos.' USING ERRCODE = '22023';
    END IF;
    IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
        RAISE EXCEPTION 'Resultados invalidos.' USING ERRCODE = '22023';
    END IF;
    IF p_ocr_files IS NULL OR jsonb_typeof(p_ocr_files) <> 'array' THEN
        RAISE EXCEPTION 'Metadados dos prints invalidos.' USING ERRCODE = '22023';
    END IF;

    v_store_id := NULLIF(p_tournament->>'store_id', '')::uuid;
    v_tournament_date := NULLIF(p_tournament->>'tournament_date', '')::date;
    v_tournament_name := btrim(COALESCE(p_tournament->>'tournament_name', ''));
    v_team := lower(v_tournament_name) = '2v2';
    v_total_players := NULLIF(p_tournament->>'total_players', '')::smallint;
    v_instagram_link := NULLIF(btrim(COALESCE(p_tournament->>'instagram_link', '')), '');
    v_format_id := NULLIF(p_tournament->>'format_id', '')::bigint;

    IF v_format_id IS NULL THEN
        SELECT id INTO v_format_id
        FROM public.formats
        WHERE is_default = true
        ORDER BY id
        LIMIT 1;
    END IF;

    IF (v_store_id IS NULL AND NULLIF(btrim(p_tournament->>'organizer_name'),'') IS NULL) OR v_tournament_date IS NULL OR v_tournament_name = '' OR
       v_total_players IS NULL OR v_total_players < 1 OR v_total_players > 128 OR
       v_format_id IS NULL THEN
        RAISE EXCEPTION 'Campos obrigatorios do torneio invalidos.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_results) <> v_total_players THEN
        RAISE EXCEPTION 'O total de players deve corresponder aos resultados.' USING ERRCODE = '22023';
    END IF;

    IF v_team AND (v_total_players > 36 OR v_total_players % 2 <> 0 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_results) AS r(item)
        WHERE NULLIF(item->>'player_id', '') IS NULL OR NULLIF(item->>'deck_id', '') IS NULL
    )) THEN
        RAISE EXCEPTION 'Cada dupla precisa de dois jogadores e dois decks.' USING ERRCODE = '22023';
    END IF;
    IF v_team AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_results) WITH ORDINALITY AS r(item, pos)
        JOIN jsonb_array_elements(p_results) WITH ORDINALITY AS partner(item, pos)
          ON r.pos % 2 = 1 AND partner.pos = r.pos + 1
        WHERE NULLIF(r.item->>'match_points', '')::integer IS DISTINCT FROM
              NULLIF(partner.item->>'match_points', '')::integer
    ) THEN
        RAISE EXCEPTION 'Os pontos devem ser iguais para os dois integrantes da dupla.' USING ERRCODE = '22023';
    END IF;

    SET CONSTRAINTS unique_player_per_tournament, unique_tournament_placement DEFERRED;

    IF p_tournament_id IS NULL THEN
        INSERT INTO public.tournament (
            store_id, tournament_date, tournament_name, total_players, instagram_link, format_id
        ) VALUES (
            v_store_id, v_tournament_date, v_tournament_name, v_total_players,
            v_instagram_link, v_format_id
        )
        RETURNING id INTO v_tournament_id;
    ELSE
        UPDATE public.tournament
        SET store_id = v_store_id,
            tournament_date = v_tournament_date,
            tournament_name = v_tournament_name,
            total_players = v_total_players,
            instagram_link = v_instagram_link,
            format_id = v_format_id
        WHERE id = p_tournament_id
        RETURNING id INTO v_tournament_id;

        IF v_tournament_id IS NULL THEN
            RAISE EXCEPTION 'Torneio nao encontrado.' USING ERRCODE = 'P0002';
        END IF;

        SELECT COALESCE(array_agg((item->>'id')::uuid), ARRAY[]::uuid[])
        INTO v_existing_ids
        FROM jsonb_array_elements(p_results) AS source(item)
        WHERE NULLIF(item->>'id', '') IS NOT NULL;

        DELETE FROM public.tournament_results
        WHERE tournament_id = v_tournament_id
          AND NOT (id = ANY(v_existing_ids));
    END IF;

    FOR v_result, v_ordinality IN
        SELECT item, ordinality
        FROM jsonb_array_elements(p_results) WITH ORDINALITY AS source(item, ordinality)
    LOOP
        v_placement := CASE WHEN v_team THEN ((v_ordinality - 1) / 2 + 1)::smallint ELSE v_ordinality::smallint END;
        v_member := CASE WHEN v_team THEN ((v_ordinality - 1) % 2 + 1)::smallint ELSE 1 END;
        IF NULLIF(v_result->>'player_id', '') IS NULL THEN
            RAISE EXCEPTION 'Player ausente na colocacao %.', v_ordinality USING ERRCODE = '22023';
        END IF;
        IF NULLIF(v_result->>'match_points', '')::integer < 0 THEN
            RAISE EXCEPTION 'Pontos invalidos na colocacao %.', v_ordinality USING ERRCODE = '22023';
        END IF;

        v_result_id := NULLIF(v_result->>'id', '')::uuid;

        IF p_tournament_id IS NOT NULL AND v_result_id IS NOT NULL THEN
            UPDATE public.tournament_results
            SET store_id = v_store_id,
                tournament_date = v_tournament_date,
                total_players = v_total_players,
                placement = v_placement,
                team_member = v_member,
                deck_id = NULLIF(v_result->>'deck_id', '')::uuid,
                player_id = (v_result->>'player_id')::uuid,
                match_points = NULLIF(v_result->>'match_points', '')::integer
            WHERE id = v_result_id
              AND tournament_id = v_tournament_id;

            GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
            IF v_rows_affected <> 1 THEN
                RAISE EXCEPTION 'Resultado % nao pertence ao torneio.', v_result_id USING ERRCODE = '22023';
            END IF;
        ELSE
            v_result_id := NULL;

            -- Older imports may have left an unlinked row for the same event/place.
            IF p_tournament_id IS NULL AND NOT v_team THEN
                SELECT id INTO v_result_id
                FROM public.tournament_results
                WHERE tournament_id IS NULL
                  AND store_id = v_store_id
                  AND tournament_date = v_tournament_date
                  AND placement = v_placement
                  AND team_member = v_member
                FOR UPDATE
                LIMIT 1;
            END IF;

            IF v_result_id IS NOT NULL THEN
                UPDATE public.tournament_results
                SET tournament_id = v_tournament_id,
                    team_member = v_member,
                    total_players = v_total_players,
                    deck_id = NULLIF(v_result->>'deck_id', '')::uuid,
                    player_id = (v_result->>'player_id')::uuid,
                    match_points = NULLIF(v_result->>'match_points', '')::integer
                WHERE id = v_result_id;
            ELSE
                INSERT INTO public.tournament_results (
                    tournament_id, store_id, tournament_date, total_players, placement, team_member,
                    deck_id, player_id, match_points
                ) VALUES (
                    v_tournament_id, v_store_id, v_tournament_date, v_total_players,
                    v_placement, v_member, NULLIF(v_result->>'deck_id', '')::uuid,
                    (v_result->>'player_id')::uuid,
                    NULLIF(v_result->>'match_points', '')::integer
                );
            END IF;
        END IF;
    END LOOP;

    INSERT INTO public.tournament_ocr_files (
        tournament_id, batch_id, storage_path, original_name, mime_type, size_bytes
    )
    SELECT
        v_tournament_id,
        (item->>'batch_id')::uuid,
        item->>'storage_path',
        item->>'original_name',
        NULLIF(item->>'mime_type', ''),
        NULLIF(item->>'size_bytes', '')::bigint
    FROM jsonb_array_elements(p_ocr_files) AS source(item);

    UPDATE public.tournament SET organizer_name = COALESCE(NULLIF(btrim(p_tournament->>'organizer_name'),''),organizer_name) WHERE id=v_tournament_id;
    RETURN jsonb_build_object(
        'tournament_id', v_tournament_id,
        'results_count', jsonb_array_length(p_results),
        'ocr_files_count', jsonb_array_length(p_ocr_files)
    );
END;
$$;


ALTER FUNCTION "public"."save_tournament_transaction"("p_tournament_id" bigint, "p_tournament" "jsonb", "p_results" "jsonb", "p_ocr_files" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_bandai_players"("p_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."search_bandai_players"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_player_digilab_name_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    IF NEW.digilab_name IS NULL OR pg_catalog.btrim(NEW.digilab_name) = '' THEN
        NEW.digilab_name := NEW.name;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_player_digilab_name_default"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_temp', 'public'
    AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_account_erasure_target"("p_job_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare j public.site_account_erasure_jobs;
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    select * into j from public.site_account_erasure_jobs where id=p_job_id;
    if not found then raise exception 'Procedimento não encontrado.'; end if;
    if not exists(select 1 from public.user_profiles where user_id=j.user_id and status='closed' and anonymized_at is not null)
        or exists(select 1 from public.admin_users where user_id=j.user_id) then raise exception 'Conta não preparada para eliminação.'; end if;
    return jsonb_build_object('user_id',j.user_id,'stage',j.stage);
end;
$$;


ALTER FUNCTION "public"."site_account_erasure_target"("p_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_account_status"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select jsonb_build_object('enabled',accounts_enabled,'technical_contact',technical_contact,'support_email',support_email,
        'privacy_url',privacy_url,'privacy_version',privacy_version,'terms_url',terms_url,'terms_version',terms_version,
        'audit_retention_days',audit_retention_days,'legal_ready',public.site_legal_ready())
    from public.site_security_config where singleton
$$;


ALTER FUNCTION "public"."site_account_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_accounts_enabled"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select accounts_enabled from public.site_security_config where singleton
$$;


ALTER FUNCTION "public"."site_accounts_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_active_admin_count"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select count(*)::integer from public.admin_users a join public.user_profiles p on p.user_id=a.user_id
    join auth.users u on u.id=a.user_id where p.status='active' and u.email_confirmed_at is not null
    and (not public.site_accounts_enabled() or (u.email not like '%@admin.digistats.local' and p.adult_declared_at is not null))
$$;


ALTER FUNCTION "public"."site_active_admin_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_actor_authorized"("p_user_id" "uuid", "p_require_admin" boolean DEFAULT true) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select not public.site_accounts_enabled() or exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
        where p.user_id=p_user_id and p.status='active' and u.email_confirmed_at is not null
        and u.email not like '%@admin.digistats.local' and public.site_legal_current(p_user_id)
        and (not p_require_admin or exists(select 1 from public.admin_users where user_id=p_user_id)))
$$;


ALTER FUNCTION "public"."site_actor_authorized"("p_user_id" "uuid", "p_require_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_can_delete_community_deck"("p_owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select auth.uid() is not null and public.site_is_member() and
        case when p_owner is null then public.site_is_admin() else p_owner=auth.uid() end
$$;


ALTER FUNCTION "public"."site_can_delete_community_deck"("p_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_can_edit_deck"("p_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select not public.site_accounts_enabled() or exists(select 1 from public.decklists where id=p_id and public.site_is_member()
        and (public.site_is_admin() or (tournament_result_id is null and owner_user_id=auth.uid())))
$$;


ALTER FUNCTION "public"."site_can_edit_deck"("p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_has_identity"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
        where p.user_id=auth.uid() and p.status='active' and u.email_confirmed_at is not null
        and (not public.site_accounts_enabled() or u.email not like '%@admin.digistats.local'))
$$;


ALTER FUNCTION "public"."site_has_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select public.site_is_member() and exists(select 1 from public.admin_users where user_id=auth.uid())
$$;


ALTER FUNCTION "public"."site_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_is_maintenance"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select coalesce(auth.role(),'')='service_role'
        or (auth.role() is null and session_user in ('postgres','supabase_admin'))
$$;


ALTER FUNCTION "public"."site_is_maintenance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_is_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select public.site_has_identity() and (not public.site_accounts_enabled() or
        (public.site_legal_current(auth.uid()) and exists(select 1 from public.user_profiles p where p.user_id=auth.uid()
            and (p.player_id is not null or exists(select 1 from public.admin_users a where a.user_id=p.user_id)))))
$$;


ALTER FUNCTION "public"."site_is_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_legal_current"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select exists(select 1 from public.user_profiles u
        join public.site_legal_acceptances a on a.id=u.legal_acceptance_id and a.user_id=u.user_id
        cross join public.site_security_config c
        join public.site_legal_documents t on t.kind='terms' and t.version=c.terms_version and t.url=c.terms_url
        join public.site_legal_documents p on p.kind='privacy' and p.version=c.privacy_version and p.url=c.privacy_url
        where u.user_id=p_user_id and a.declared_adult and u.adult_declared_at is not null
        and a.terms_version=t.version and a.privacy_version=p.version and a.terms_sha256=t.sha256 and a.privacy_sha256=p.sha256)
$$;


ALTER FUNCTION "public"."site_legal_current"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."site_legal_ready"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    select exists(select 1 from public.site_security_config c
        join public.site_legal_documents t on t.kind='terms' and t.version=c.terms_version and t.url=c.terms_url
        join public.site_legal_documents p on p.kind='privacy' and p.version=c.privacy_version and p.url=c.privacy_url where c.singleton)
$$;


ALTER FUNCTION "public"."site_legal_ready"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_digilab_sync_run"("p_source" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_state public.digilab_sync_state%rowtype; v_id uuid;
begin
    select * into v_state from public.digilab_sync_state where id for update;
    if v_state.lease_until > now() then return jsonb_build_object('busy', true, 'run_id', v_state.run_id); end if;
    update public.digilab_sync_runs set status = 'interrupted', finished_at = now(), error = 'Execucao interrompida; fila liberada para nova tentativa.'
      where id = v_state.run_id and status = 'running';
    insert into public.digilab_sync_runs(source) values(p_source) returning id into v_id;
    update public.digilab_sync_state set run_id = v_id, lease_until = now() + interval '5 minutes' where id;
    return jsonb_build_object('run_id', v_id, 'next_page', v_state.next_page, 'busy', false);
end;
$$;


ALTER FUNCTION "public"."start_digilab_sync_run"("p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_site_integration_event"("p_execution_id" "uuid", "p_operation" "text", "p_actor_user_id" "uuid", "p_parent_operation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    if p_operation !~ '^[a-z0-9-]{1,80}$' then raise exception 'Operação inválida.'; end if;
    insert into site_audit.integration_runs(operation_id,parent_operation_id,operation,actor_user_id)
    values(p_execution_id,p_parent_operation_id,p_operation,p_actor_user_id);
end;
$_$;


ALTER FUNCTION "public"."start_site_integration_event"("p_execution_id" "uuid", "p_operation" "text", "p_actor_user_id" "uuid", "p_parent_operation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_account_request"("p_type" "text", "p_player_id" "uuid" DEFAULT NULL::"uuid", "p_decklist_id" bigint DEFAULT NULL::bigint, "p_note" "text" DEFAULT ''::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."submit_account_request"("p_type" "text", "p_player_id" "uuid", "p_decklist_id" bigint, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_digilab_tournament_atomic"("p_external_id" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_player_mappings" "jsonb" DEFAULT '[]'::"jsonb", "p_deck_mappings" "jsonb" DEFAULT '[]'::"jsonb", "p_target_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
    v_row jsonb; v_results jsonb := '[]'; v_mappings jsonb := '[]'; v_payload jsonb;
    v_saved jsonb; v_existing public.tournament%rowtype;
    v_target bigint; v_linked bigint; v_store uuid; v_format bigint;
    v_player uuid; v_deck uuid; v_ids uuid[]; v_name text; v_slug text;
    v_format_code text; v_players integer := 0; v_decks integer := 0;
    v_result_id uuid; v_old_deck uuid; v_old_points integer;
    v_count integer; v_updated integer := 0; v_added integer := 0;
begin
    if p_external_id is null or p_external_id <= 0 or
       jsonb_typeof(p_standings) is distinct from 'array' or
       jsonb_typeof(p_player_mappings) is distinct from 'array' or
       jsonb_typeof(p_deck_mappings) is distinct from 'array' then
        raise exception 'Dados DigiLab invalidos.' using errcode = '22023';
    end if;
    if lower(btrim(p_tournament->>'tournament_name')) = '2v2' then
        raise exception 'O torneio 2v2 e exclusivamente local.' using errcode = '22023';
    end if;
    v_count := jsonb_array_length(p_standings);
    if v_count = 0 or v_count <> (p_tournament->>'player_count')::integer then
        raise exception 'Classificacao incompleta.' using errcode = '22023';
    end if;
    -- Serialize registration across imports, including differently spelled names.
    -- This is a short DB transaction; no external request runs under these locks.
    perform pg_advisory_xact_lock(724092401);
    lock table public.players, public.decks, public.formats in share row exclusive mode;
    select tournament_id into v_linked from public.tournament_digilab_sync
      where digilab_tournament_id = p_external_id and status = 'matched' for update;
    if p_target_id is not null and v_linked is not null and p_target_id <> v_linked then
        raise exception 'DigiLab ja vinculado a outro torneio.' using errcode = '22023';
    end if;
    v_target := coalesce(p_target_id, v_linked);
    select array[store_id] into v_ids from public.community_events where digilab_id=p_external_id and status='finished';
    if not found then
      select array_agg(id) into v_ids from public.stores
        where public.digilab_normalize(name) = public.digilab_normalize(p_tournament#>>'{store,name}');
    end if;
    if coalesce(cardinality(v_ids), 0) <> 1 then
        raise exception 'Loja sem correspondente unico.' using errcode = '22023';
    end if;
    v_store := v_ids[1];
    if v_target is not null then
        select * into v_existing from public.tournament where id = v_target for update;
        if lower(btrim(v_existing.tournament_name)) = '2v2' then
            raise exception 'O torneio 2v2 e exclusivamente local.' using errcode = '22023';
        end if;
        if not found or v_existing.store_id IS DISTINCT FROM v_store or
           v_existing.tournament_date <> (p_tournament->>'date')::date then
            raise exception 'A sincronizacao exige a mesma data e loja.' using errcode = '22023';
        end if;
        if exists(select 1 from public.tournament_digilab_sync where tournament_id = v_target
                  and digilab_tournament_id is not null and digilab_tournament_id <> p_external_id) then
            raise exception 'Torneio local ja vinculado a outro DigiLab.' using errcode = '22023';
        end if;
    elsif exists(select 1 from public.tournament where store_id = v_store
                 and tournament_date = (p_tournament->>'date')::date
                 and lower(btrim(coalesce(tournament_name, ''))) <> '2v2') then
        raise exception 'Possivel torneio local na mesma data; revise o vinculo.' using errcode = '22023';
    end if;

    v_format_code := btrim(coalesce(p_tournament->>'format', ''));
    if regexp_replace(upper(v_format_code), '[^A-Z0-9]', '', 'g') <> '' then
        select id into v_format from public.formats
          where regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') =
                regexp_replace(upper(v_format_code), '[^A-Z0-9]', '', 'g')
          order by (code = v_format_code) desc, id limit 1;
        if v_format is null then
            insert into public.formats(code, name, is_active, is_default)
              values(v_format_code, v_format_code, true, false) returning id into v_format;
        else
            update public.formats set is_active = true where id = v_format;
        end if;
    else
        raise exception 'Formato DigiLab ausente; revise o torneio em vez de usar o formato padrao.' using errcode = '22023';
    end if;
    if v_format is null then raise exception 'Formato nao resolvido.' using errcode = '22023'; end if;

    for v_row in select value from jsonb_array_elements(p_standings) order by (value->>'placement')::integer loop
        v_player := null; v_deck := null; v_result_id := null; v_old_deck := null; v_old_points := null;
        v_slug := nullif(btrim(v_row#>>'{player,slug}'), '');
        v_name := btrim(coalesce(v_row#>>'{player,name}', ''));
        if v_slug is null or public.digilab_normalize(v_name) = '' then
            raise exception 'Jogador anonimo exige revisao.' using errcode = '22023';
        end if;
        select nullif(value->>'player_id', '')::uuid into v_player
          from jsonb_array_elements(p_player_mappings) where value->>'digilab_player_slug' = v_slug limit 1;
        if v_player is null then
            select player_id into v_player from public.digilab_player_sync where digilab_player_slug = v_slug;
        end if;
        if v_player is null then
            select array_agg(id) into v_ids from public.players where
              public.digilab_normalize(name) = public.digilab_normalize(v_name) or
              public.digilab_normalize(digilab_name) = public.digilab_normalize(v_name);
            if cardinality(v_ids) > 1 then raise exception 'Jogador ambiguo: %', v_name using errcode = '22023'; end if;
            v_player := v_ids[1];
            if v_player is null then
                insert into public.players(name, bandai_nick, digilab_name, bandai_id, is_active)
                  values(v_name, v_name, v_name, null, true) returning id into v_player;
                v_players := v_players + 1;
            end if;
        end if;
        if not exists(select 1 from public.players where id = v_player) then
            raise exception 'Mapeamento de jogador invalido.' using errcode = '22023';
        end if;
        if exists(select 1 from jsonb_array_elements(v_results) where value->>'player_id' = v_player::text) then
            raise exception 'Dois jogadores apontam para a mesma pessoa.' using errcode = '22023';
        end if;
        v_mappings := v_mappings || jsonb_build_array(jsonb_build_object(
            'digilab_player_slug', v_slug, 'digilab_player_name', v_name, 'player_id', v_player));

        v_slug := nullif(btrim(v_row#>>'{deck,slug}'), '');
        v_name := btrim(coalesce(v_row#>>'{deck,name}', ''));
        if v_slug is not null or v_name <> '' then
            if v_slug is null then raise exception 'Deck sem slug.' using errcode = '22023'; end if;
            select nullif(value->>'deck_id', '')::uuid into v_deck
              from jsonb_array_elements(p_deck_mappings) where value->>'digilab_deck_slug' = v_slug limit 1;
            if v_deck is null then
                select deck_id into v_deck from public.digilab_deck_sync where digilab_deck_slug = v_slug;
            end if;
            if v_deck is null then
                if public.digilab_normalize(v_name) = '' then
                    raise exception 'Deck sem nome.' using errcode = '22023';
                end if;
                select array_agg(id) into v_ids from public.decks
                  where public.digilab_normalize(name) = public.digilab_normalize(v_name);
                if cardinality(v_ids) > 1 then raise exception 'Deck ambiguo: %', v_name using errcode = '22023'; end if;
                v_deck := v_ids[1];
                if v_deck is null then
                    insert into public.decks(name, is_active) values(v_name, true) returning id into v_deck;
                    v_decks := v_decks + 1;
                end if;
            end if;
            if not exists(select 1 from public.decks where id = v_deck) then
                raise exception 'Mapeamento de deck invalido.' using errcode = '22023';
            end if;
        end if;
        if v_target is not null then
            select id, deck_id, match_points into v_result_id, v_old_deck, v_old_points
              from public.tournament_results where tournament_id = v_target and player_id = v_player for update;
        end if;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'id', v_result_id, 'player_id', v_player, 'deck_id', coalesce(v_deck, v_old_deck),
            'placement', (v_row->>'placement')::integer,
            'digilab_deck_slug', v_slug, 'digilab_deck_name', nullif(v_name, ''),
            'match_points', coalesce((v_row#>>'{record,wins}')::integer * 3 + (v_row#>>'{record,ties}')::integer, v_old_points)));
    end loop;
    if exists(select 1 from jsonb_array_elements(v_results) with ordinality as r(value, pos)
              where (value->>'placement')::integer is distinct from pos::integer) then
        raise exception 'Colocacoes incompletas ou empatadas exigem revisao.' using errcode = '22023';
    end if;
    if v_target is not null and exists(
        select 1 from public.tournament_results r where r.tournament_id = v_target and not exists(
            select 1 from jsonb_array_elements(v_results) where value->>'player_id' = r.player_id::text)) then
        raise exception 'Jogadores locais ausentes no DigiLab; revise antes de remover resultados.' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('store_id', v_store, 'organizer_name',(select organizer from public.community_events where digilab_id=p_external_id and status='finished'), 'tournament_date', p_tournament->>'date',
        'tournament_name', coalesce(v_existing.tournament_name, nullif(p_tournament->>'tournament_name', ''), 'Semanal'),
        'total_players', v_count, 'format_id', v_format, 'instagram_link', v_existing.instagram_link,
        'rounds', p_tournament->'rounds');
    if v_target is not null then
        select count(*) into v_added from jsonb_array_elements(v_results) r where nullif(r->>'id', '') is null;
        select count(*) into v_updated from jsonb_array_elements(v_results) r
          join public.tournament_results t on t.id = nullif(r->>'id', '')::uuid
          where t.deck_id is distinct from nullif(r->>'deck_id', '')::uuid
             or t.match_points is distinct from nullif(r->>'match_points', '')::integer
             or t.placement is distinct from (r->>'placement')::integer;
        perform public.save_tournament_transaction(v_target, v_payload, v_results, '[]');
        update public.tournament set rounds = coalesce(nullif(p_tournament->>'rounds', '')::smallint, rounds) where id = v_target;
        insert into public.tournament_digilab_sync(tournament_id, digilab_tournament_id, digilab_url, status, verified_at)
          values(v_target, p_external_id, 'https://digilab.cards/tournament/' || p_external_id, 'matched', now())
          on conflict(tournament_id) do update set
            digilab_tournament_id = excluded.digilab_tournament_id, digilab_url = excluded.digilab_url,
            status = 'matched', verified_at = excluded.verified_at, last_error_code = null;
    end if;
    -- Existing RPC persists the mappings and link in this same transaction.
    v_saved := public.import_digilab_tournament_transaction(p_external_id,
        'https://digilab.cards/tournament/' || p_external_id, v_payload, v_results, v_mappings);
    return v_saved || jsonb_build_object('players_created', v_players, 'decks_created', v_decks,
        'results_updated', v_updated, 'results_added', v_added, 'reused', v_target is not null,
        'tournament_updated', v_target is not null and (
            v_existing.format_id is distinct from v_format or v_existing.total_players is distinct from v_count or
            v_existing.rounds is distinct from coalesce(nullif(p_tournament->>'rounds', '')::smallint, v_existing.rounds)));
end;
$$;


ALTER FUNCTION "public"."sync_digilab_tournament_atomic"("p_external_id" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_player_mappings" "jsonb", "p_deck_mappings" "jsonb", "p_target_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_linked_player_deck_ownership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
    if public.site_is_maintenance() or public.site_is_admin() then
        if tg_table_name='user_profiles' then
            if new.player_id is not null and new.status='active' then
                perform public.reconcile_linked_player_deck_ownership(new.player_id);
            end if;
        elsif new.creator_player_id is not null and new.owner_user_id is null
            and new.tournament_result_id is null then
            perform public.reconcile_linked_player_deck_ownership(new.creator_player_id);
        end if;
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."sync_linked_player_deck_ownership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_my_player_google_avatar"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_my_player_google_avatar"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_player_admin_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_player_admin_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_player_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin perform public.sync_player_admin_user(new.user_id); return new; end;
$$;


ALTER FUNCTION "public"."sync_profile_player_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_tournament_date_to_results"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Verifica se a data realmente mudou para não pesar o banco à toa
    IF (OLD.tournament_date IS DISTINCT FROM NEW.tournament_date) THEN
        UPDATE tournament_results
        SET tournament_date = NEW.tournament_date
        WHERE tournament_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_tournament_date_to_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  -- update "updated_at" timestamp
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_site_profile"("p_username" "text", "p_display_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
declare result public.user_profiles; username_value text:=lower(btrim(p_username)); display_name_value text:=btrim(p_display_name);
begin
    if not public.site_has_identity() then
        raise exception 'Confirme seu e-mail e use uma conta ativa.' using errcode='42501';
    end if;
    if username_value is null or username_value !~ '^[a-z0-9_-]{3,40}$' then
        raise exception 'Use de 3 a 40 letras minúsculas, números, _ ou - no nome de usuário.' using errcode='22023';
    end if;
    if display_name_value is null or length(display_name_value) not between 1 and 100 then
        raise exception 'Informe um nome de exibição com até 100 caracteres.' using errcode='22023';
    end if;
    update public.user_profiles set username=username_value,display_name=display_name_value,updated_at=now()
    where user_id=auth.uid() returning * into result;
    if not found then raise exception 'Perfil não encontrado.' using errcode='P0002'; end if;
    return to_jsonb(result);
end;
$_$;


ALTER FUNCTION "public"."update_my_site_profile"("p_username" "text", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_deck_draft_cards"("value" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
declare item jsonb; seen text[] := '{}'; code text;
begin
    if value is null then return true; end if;
    if jsonb_typeof(value)<>'array' then return false; end if;
    for item in select * from jsonb_array_elements(value) loop
        code:=item->>'code';
        if jsonb_typeof(item)<>'object' or code is null or code !~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$'
            or jsonb_typeof(item->'qty') is distinct from 'number' or (item->>'qty') !~ '^[1-9][0-9]{0,2}$' or code=any(seen) then return false; end if;
        seen:=array_append(seen,code);
    end loop;
    return true;
end;
$_$;


ALTER FUNCTION "public"."valid_deck_draft_cards"("value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_format_rules"("value" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
declare key text; item jsonb; member jsonb; entry record;
begin
    if value is null then return true; end if;
    if jsonb_typeof(value) <> 'object' then return false; end if;
    for key,item in select * from jsonb_each(value) loop
        if key in ('main_count','egg_max','copies','security_count','rarity_exception_limit') then
            if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
            if item::numeric > 999 or (key not in ('egg_max','security_count','rarity_exception_limit') and item::numeric < 1) then return false; end if;
        elsif key in ('egg_copies','partner_level') then
            if item <> 'null'::jsonb then
                if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
                if item::numeric < 1 or item::numeric > 999 then return false; end if;
            end if;
        elsif key in ('use_official_banlist','use_official_limits','digi_egg_any_rarity') then
            if jsonb_typeof(item)<>'boolean' then return false; end if;
        elsif key='points_limit' then
            if item <> 'null'::jsonb then
                if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
                if item::numeric < 1 or item::numeric > 1000000 then return false; end if;
            end if;
        elsif key='card_points' then
            if jsonb_typeof(item)<>'object' then return false; end if;
            if (select count(*) from jsonb_each(item)) > 5000 then return false; end if;
            for entry in select * from jsonb_each(item) loop
                if entry.key !~ '^(BT[0-9]+|EX[0-9]+|ST[0-9]+|RB[0-9]+|AD[0-9]+|LM[0-9]*|P)-[0-9]{1,4}$' then return false; end if;
                if jsonb_typeof(entry.value)<>'object' or not(entry.value ?& array['name','points']) then return false; end if;
                if jsonb_typeof(entry.value->'name')<>'string' or length(btrim(entry.value->>'name')) not between 1 and 200 then return false; end if;
                if jsonb_typeof(entry.value->'points')<>'number' or (entry.value->>'points') !~ '^[0-9]+$' then return false; end if;
                if (entry.value->>'points')::numeric>1000000 then return false; end if;
            end loop;
        elsif key='points_pending' then
            if jsonb_typeof(item)<>'array' or jsonb_array_length(item)>5000 then return false; end if;
            for member in select * from jsonb_array_elements(item) loop
                if jsonb_typeof(member)<>'object' or not(member ?& array['code','name','points']) then return false; end if;
                if jsonb_typeof(member->'code')<>'string' or length(btrim(member->>'code')) not between 1 and 80 then return false; end if;
                if jsonb_typeof(member->'name')<>'string' or length(btrim(member->>'name')) not between 1 and 200 then return false; end if;
                if jsonb_typeof(member->'points')<>'number' or (member->>'points') !~ '^[0-9]+$' then return false; end if;
                if (member->>'points')::numeric>1000000 then return false; end if;
            end loop;
        elsif key='limited_cards' then
            if jsonb_typeof(item)<>'object' then return false; end if;
            if exists(select 1 from jsonb_each(item) x where x.key !~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$' or jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-9]{1,3}$') then return false; end if;
        elsif key in ('banned_codes','unlimited_codes','allowed_colors','allowed_sets','allowed_rarities') then
            if jsonb_typeof(item)<>'array' then return false; end if;
            if exists(select 1 from jsonb_array_elements(item) x where jsonb_typeof(x)<>'string') then return false; end if;
            if key='allowed_colors' and exists(select 1 from jsonb_array_elements_text(item) x where x not in ('red','blue','green','yellow','purple','black','white')) then return false; end if;
            if key='allowed_rarities' and exists(select 1 from jsonb_array_elements_text(item) x where x !~ '^[A-Z]{1,8}$' or x='UNKNOWN') then return false; end if;
        elsif key='rarity_exceptions' then
            if jsonb_typeof(item)<>'array' or jsonb_array_length(item)>50 then return false; end if;
            for member in select * from jsonb_array_elements(item) loop
                if jsonb_typeof(member)<>'object' or not(member ?& array['type','rarities']) then return false; end if;
                if exists(select 1 from jsonb_object_keys(member) k where k not in ('type','name_contains','rarities')) then return false; end if;
                if jsonb_typeof(member->'type')<>'string' or member->>'type' not in ('digimon','digi-egg','tamer','option','dual') then return false; end if;
                if member ? 'name_contains' and (jsonb_typeof(member->'name_contains')<>'string' or length(btrim(member->>'name_contains')) not between 1 and 80) then return false; end if;
                if jsonb_typeof(member->'rarities')<>'array' or jsonb_array_length(member->'rarities')<1 then return false; end if;
                if exists(select 1 from jsonb_array_elements(member->'rarities') x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[A-Z]{1,8}$' or x#>>'{}'='UNKNOWN') then return false; end if;
            end loop;
        elsif key='choice_groups' then
            if jsonb_typeof(item)<>'array' then return false; end if;
            for member in select * from jsonb_array_elements(item) loop
                if jsonb_typeof(member)<>'array' then return false; end if;
                if jsonb_array_length(member)<2 or exists(select 1 from jsonb_array_elements(member) x where jsonb_typeof(x)<>'string') then return false; end if;
            end loop;
        else return false;
        end if;
    end loop;
    return true;
end;
$_$;


ALTER FUNCTION "public"."valid_format_rules"("value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_decklist_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_decklist_id bigint;
    v_egg integer;
    v_main integer;
BEGIN
    v_decklist_id := coalesce(NEW.decklist_id, OLD.decklist_id);

    SELECT
        coalesce(sum(CASE WHEN meta.is_digi_egg THEN dc.qty ELSE 0 END), 0),
        coalesce(sum(CASE WHEN NOT meta.is_digi_egg THEN dc.qty ELSE 0 END), 0)
    INTO v_egg, v_main
    FROM public.decklist_cards dc
    JOIN public.decklist_card_metadata meta ON meta.card_code = dc.card_code
    WHERE dc.decklist_id = v_decklist_id;

    IF v_egg > 5 THEN
        RAISE EXCEPTION 'Decklist inválida: Digi-Egg > 5 (atual: %)', v_egg;
    END IF;

    IF v_main > 50 THEN
        RAISE EXCEPTION 'Decklist inválida: Main deck > 50 (atual: %)', v_main;
    END IF;

    IF (v_egg + v_main) > 55 THEN
        RAISE EXCEPTION 'Decklist inválida: Total > 55 (atual: %)', (v_egg + v_main);
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."validate_decklist_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_tournament_team_results"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_id bigint;
    v_ids bigint[];
    v_event public.tournament%rowtype;
BEGIN
    IF TG_TABLE_NAME = 'tournament' THEN
        v_ids := ARRAY[NEW.id];
    ELSIF TG_OP = 'UPDATE' AND OLD.tournament_id IS DISTINCT FROM NEW.tournament_id THEN
        v_ids := ARRAY[OLD.tournament_id, NEW.tournament_id];
    ELSE
        v_ids := ARRAY[CASE WHEN TG_OP = 'DELETE' THEN OLD.tournament_id ELSE NEW.tournament_id END];
    END IF;
    FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO v_event FROM public.tournament WHERE id = v_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF lower(btrim(v_event.tournament_name)) = '2v2' THEN
        IF v_event.total_players < 2 OR v_event.total_players % 2 <> 0 OR
           (SELECT count(*) FROM public.tournament_results WHERE tournament_id = v_id) <> v_event.total_players OR
           EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = v_id
                   AND (player_id IS NULL OR deck_id IS NULL OR placement > v_event.total_players / 2)) OR
           EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = v_id GROUP BY placement
                   HAVING count(*) <> 2 OR count(DISTINCT team_member) <> 2 OR
                          count(DISTINCT match_points) > 1 OR count(match_points) = 1) THEN
            RAISE EXCEPTION '2v2 exige dois jogadores e dois decks por colocacao, com pontos iguais.' USING ERRCODE = '22023';
        END IF;
    ELSIF EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = v_id AND team_member <> 1) THEN
        RAISE EXCEPTION 'Apenas torneios 2v2 permitem dois integrantes por colocacao.' USING ERRCODE = '22023';
    END IF;
    END LOOP;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."validate_tournament_team_results"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "player_id" "uuid",
    "decklist_id" bigint,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "account_requests_note_check" CHECK (("length"("note") <= 1000)),
    CONSTRAINT "account_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['player_link'::"text", 'deck_claim'::"text", 'data_access'::"text", 'correction'::"text", 'erasure'::"text", 'account_closure'::"text"]))),
    CONSTRAINT "account_requests_review_note_check" CHECK (("length"("review_note") <= 1000)),
    CONSTRAINT "account_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."account_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid",
    "admin_player_id" "uuid",
    CONSTRAINT "admin_users_username_format" CHECK ((("username" = "lower"("username")) AND ("username" ~ '^[a-z0-9_-]{3,40}$'::"text")))
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_users" IS 'Allowlist de usuários do Supabase Auth autorizados a acessar o Admin do DigiStats.';



COMMENT ON COLUMN "public"."admin_users"."user_id" IS 'Identificador do usuário correspondente em auth.users.';



COMMENT ON COLUMN "public"."admin_users"."username" IS 'Identificador curto e único usado na tela de login do Admin.';



COMMENT ON COLUMN "public"."admin_users"."display_name" IS 'Nome exibido no Admin e usado na auditoria das operações.';



CREATE TABLE IF NOT EXISTS "public"."ban_list" (
    "card_code" "text" NOT NULL,
    "restriction" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "card_name" "text",
    CONSTRAINT "ban_list_restriction_check" CHECK (("restriction" = ANY (ARRAY['banned'::"text", 'limited'::"text", 'choice-restricted'::"text"])))
);


ALTER TABLE "public"."ban_list" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ban_list"."card_name" IS 'card_name';



CREATE TABLE IF NOT EXISTS "public"."card_portrait_settings" (
    "card_code" "text" NOT NULL,
    "center_x" double precision DEFAULT 0.5 NOT NULL,
    "offset_y" double precision DEFAULT 0 NOT NULL,
    "zoom" double precision DEFAULT 2.3 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_portrait_settings_card_code_check" CHECK (("card_code" ~ '^(BT[0-9]{1,2}|EX[0-9]{1,2}|ST[0-9]{1,2}|RB[0-9]{1,2}|AD[0-9]{1,2}|LM|P)-[0-9]{1,3}$'::"text")),
    CONSTRAINT "card_portrait_settings_center_x_check" CHECK ((("center_x" >= (0)::double precision) AND ("center_x" <= (1)::double precision))),
    CONSTRAINT "card_portrait_settings_offset_y_check" CHECK ((("offset_y" >= ('-1'::integer)::double precision) AND ("offset_y" <= (1)::double precision))),
    CONSTRAINT "card_portrait_settings_zoom_check" CHECK ((("zoom" >= (1)::double precision) AND ("zoom" <= (5)::double precision)))
);


ALTER TABLE "public"."card_portrait_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_audit" (
    "id" bigint NOT NULL,
    "event_id" "uuid" NOT NULL,
    "actor" "uuid",
    "action" "text" NOT NULL,
    "details" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_audit" OWNER TO "postgres";


ALTER TABLE "public"."community_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."community_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."community_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "checked_in" boolean DEFAULT true NOT NULL,
    "dropped" boolean DEFAULT false NOT NULL,
    "deck_id" "uuid",
    "decklist" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_entries_decklist_check" CHECK (("length"("decklist") <= 20000))
);


ALTER TABLE "public"."community_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "organizer" "text" DEFAULT 'Digimon CWB'::"text" NOT NULL,
    "limitless_organization_id" integer DEFAULT 2806 NOT NULL,
    "store_id" "uuid",
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "modality" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "event_type" "text" NOT NULL,
    "format_id" bigint NOT NULL,
    "capacity" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "registration_open" boolean DEFAULT false NOT NULL,
    "checkin_open" boolean DEFAULT false NOT NULL,
    "rounds" integer,
    "initial_players" integer,
    "revision" integer DEFAULT 0 NOT NULL,
    "rules_version" "text" DEFAULT 'community-bo3-50-5-preview-v2'::"text" NOT NULL,
    "final_order" "jsonb",
    "final_snapshot" "jsonb",
    "digilab_id" bigint,
    "canonical_tournament_id" bigint,
    "reconciliation" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reconcile_at" timestamp with time zone,
    "reconcile_error" "text",
    "round_minutes" integer DEFAULT 45 NOT NULL,
    "overtime_minutes" integer DEFAULT 5 NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "community_events_capacity_check" CHECK ((("capacity" >= 4) AND ("capacity" <= 128))),
    CONSTRAINT "community_events_modality_check" CHECK (("modality" = ANY (ARRAY['presencial'::"text", 'online'::"text"]))),
    CONSTRAINT "community_events_name_check" CHECK ((("length"("btrim"("name")) >= 3) AND ("length"("btrim"("name")) <= 120))),
    CONSTRAINT "community_events_overtime_minutes_check" CHECK ((("overtime_minutes" >= 0) AND ("overtime_minutes" <= 1440))),
    CONSTRAINT "community_events_reconciliation_check" CHECK (("reconciliation" = ANY (ARRAY['pending'::"text", 'review'::"text", 'matched'::"text"]))),
    CONSTRAINT "community_events_round_minutes_check" CHECK ((("round_minutes" >= 1) AND ("round_minutes" <= 1440))),
    CONSTRAINT "community_events_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'running'::"text", 'finished'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."community_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "revision" integer NOT NULL,
    "header" "jsonb" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_exports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "round_id" "uuid" NOT NULL,
    "table_number" integer NOT NULL,
    "p1" "uuid" NOT NULL,
    "p2" "uuid",
    "wins" integer,
    "losses" integer,
    "draws" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "proposed_by" "uuid",
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "revision" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "community_matches_check" CHECK ((("p2" IS NULL) OR ("p1" <> "p2"))),
    CONSTRAINT "community_matches_check1" CHECK (((("wins" IS NULL) AND ("losses" IS NULL) AND ("draws" IS NULL)) OR ((("wins" >= 0) AND ("wins" <= 2)) AND (("losses" >= 0) AND ("losses" <= 2)) AND (("draws" >= 0) AND ("draws" <= 1)) AND (((("wins" + "losses") + "draws") >= 1) AND ((("wins" + "losses") + "draws") <= 3)) AND (NOT (("wins" = 2) AND ("losses" = 2)))))),
    CONSTRAINT "community_matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'proposed'::"text", 'contested'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."community_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "number" integer NOT NULL,
    "status" "text" DEFAULT 'paired'::"text" NOT NULL,
    "seed" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "overtime_ends_at" timestamp with time zone,
    CONSTRAINT "community_rounds_number_check" CHECK ((("number" >= 1) AND ("number" <= 7))),
    CONSTRAINT "community_rounds_status_check" CHECK (("status" = ANY (ARRAY['paired'::"text", 'running'::"text", 'closed'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."community_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deck_families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "deck_families_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "deck_families_slug_not_blank" CHECK (("btrim"("slug") <> ''::"text"))
);


ALTER TABLE "public"."deck_families" OWNER TO "postgres";


COMMENT ON TABLE "public"."deck_families" IS 'Famílias canônicas de arquétipos; um deck específico pode pertencer a uma família.';



CREATE TABLE IF NOT EXISTS "public"."deck_format_rule_versions" (
    "id" bigint NOT NULL,
    "deck_format_id" bigint NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text" NOT NULL,
    "rules_snapshot" "jsonb" NOT NULL
);


ALTER TABLE "public"."deck_format_rule_versions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."deck_format_rule_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."deck_format_rule_versions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."deck_format_rule_versions_id_seq" OWNED BY "public"."deck_format_rule_versions"."id";



CREATE TABLE IF NOT EXISTS "public"."deck_formats" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "rules_text" "text",
    "rules_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_community_highlight" boolean DEFAULT false NOT NULL,
    "rules_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "validation_rules" "jsonb",
    "rules_revision" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "change_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deck_formats_rules_status_check" CHECK (("rules_status" = ANY (ARRAY['draft'::"text", 'published'::"text"]))),
    CONSTRAINT "deck_formats_safe_rules_url" CHECK ((("rules_url" IS NULL) OR ("rules_url" ~ '^https?://[^[:space:]]+$'::"text"))),
    CONSTRAINT "formats_validation_rules_valid" CHECK ("public"."valid_format_rules"("validation_rules"))
);


ALTER TABLE "public"."deck_formats" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."deck_formats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."deck_formats_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."deck_formats_id_seq" OWNED BY "public"."deck_formats"."id";



CREATE TABLE IF NOT EXISTS "public"."deck_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deck_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deck_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decklist_card_metadata" (
    "card_code" "text" NOT NULL,
    "card_type" "text",
    "card_level" smallint,
    "is_digi_egg" boolean DEFAULT false NOT NULL,
    "is_staple" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "id" "text",
    "name" "text",
    "pack" "text",
    "color" "text",
    "card_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."decklist_card_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decklist_cards" (
    "id" bigint NOT NULL,
    "decklist_id" bigint NOT NULL,
    "position" integer NOT NULL,
    "card_code" "text" NOT NULL,
    "qty" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "decklist_cards_position_check" CHECK (("position" > 0)),
    CONSTRAINT "decklist_cards_qty_check" CHECK ((("qty" >= 1) AND ("qty" <= 50)))
);


ALTER TABLE "public"."decklist_cards" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."decklist_cards_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."decklist_cards_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."decklist_cards_id_seq" OWNED BY "public"."decklist_cards"."id";



CREATE TABLE IF NOT EXISTS "public"."decklists" (
    "id" bigint NOT NULL,
    "tournament_result_id" "uuid",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" "text",
    "format_id" bigint,
    "deck_format_id" bigint DEFAULT 1 NOT NULL,
    "draft_cards" "jsonb",
    "draft_revision" integer DEFAULT 0 NOT NULL,
    "format_rules_revision" integer,
    "archetype_id" "uuid",
    "creator_player_id" "uuid",
    "owner_user_id" "uuid",
    "created_by_user_id" "uuid",
    "updated_by_user_id" "uuid",
    "partner_card_code" "text",
    CONSTRAINT "decklists_draft_cards_valid" CHECK ("public"."valid_deck_draft_cards"("draft_cards")),
    CONSTRAINT "decklists_free_identity" CHECK ((("tournament_result_id" IS NOT NULL) OR (("name" IS NOT NULL) AND (("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 120)) AND ("deck_format_id" IS NOT NULL)))),
    CONSTRAINT "decklists_partner_card_code_format" CHECK ((("partner_card_code" IS NULL) OR ("partner_card_code" ~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$'::"text")))
);


ALTER TABLE "public"."decklists" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."decklists_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."decklists_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."decklists_id_seq" OWNED BY "public"."decklists"."id";



CREATE TABLE IF NOT EXISTS "public"."decks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "colors" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "family_id" "uuid",
    "slug" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "display_card_id" "text",
    "deck_format_id" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."decks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."decks"."family_id" IS 'Família opcional do arquétipo específico armazenado em decks.';



CREATE TABLE IF NOT EXISTS "public"."digilab_catalog_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "summary" "jsonb",
    "error" "text",
    CONSTRAINT "digilab_catalog_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."digilab_catalog_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digilab_deck_catalog" (
    "digilab_archetype_id" bigint NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "family_slug" "text",
    "family_name" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "display_card_id" "text",
    "total_entries" integer,
    "firsts" integer,
    "pilots" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "digilab_deck_catalog_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "digilab_deck_catalog_slug_not_blank" CHECK (("btrim"("slug") <> ''::"text"))
);


ALTER TABLE "public"."digilab_deck_catalog" OWNER TO "postgres";


COMMENT ON TABLE "public"."digilab_deck_catalog" IS 'Espelho auditável do catálogo de arquétipos e famílias retornado pelo DigiLab.';



CREATE TABLE IF NOT EXISTS "public"."digilab_deck_sync" (
    "digilab_deck_slug" "text" NOT NULL,
    "digilab_deck_name" "text",
    "deck_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "digilab_archetype_id" bigint,
    CONSTRAINT "digilab_deck_sync_slug_not_blank" CHECK (("btrim"("digilab_deck_slug") <> ''::"text"))
);


ALTER TABLE "public"."digilab_deck_sync" OWNER TO "postgres";


COMMENT ON TABLE "public"."digilab_deck_sync" IS 'Mapeamento persistente entre o slug de deck do DigiLab e decks.id no DigiStats.';



CREATE TABLE IF NOT EXISTS "public"."digilab_player_sync" (
    "digilab_player_slug" "text" NOT NULL,
    "digilab_player_name" "text",
    "player_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "digilab_player_sync_slug_not_blank" CHECK (("btrim"("digilab_player_slug") <> ''::"text"))
);


ALTER TABLE "public"."digilab_player_sync" OWNER TO "postgres";


COMMENT ON TABLE "public"."digilab_player_sync" IS 'Mapeamento persistente entre o slug público do jogador no DigiLab e players.id no DigiStats.';



CREATE TABLE IF NOT EXISTS "public"."digilab_sync_events" (
    "id" bigint NOT NULL,
    "run_id" "uuid" NOT NULL,
    "digilab_tournament_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outcome" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "digilab_sync_events_outcome_check" CHECK (("outcome" = ANY (ARRAY['imported'::"text", 'updated'::"text", 'unchanged'::"text", 'needs_review'::"text", 'retry'::"text"])))
);


ALTER TABLE "public"."digilab_sync_events" OWNER TO "postgres";


ALTER TABLE "public"."digilab_sync_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."digilab_sync_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."digilab_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    CONSTRAINT "digilab_sync_runs_source_check" CHECK (("source" = ANY (ARRAY['scheduled'::"text", 'admin'::"text"]))),
    CONSTRAINT "digilab_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text", 'interrupted'::"text"])))
);


ALTER TABLE "public"."digilab_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digilab_sync_state" (
    "id" boolean DEFAULT true NOT NULL,
    "next_page" integer DEFAULT 2 NOT NULL,
    "run_id" "uuid",
    "lease_until" timestamp with time zone,
    CONSTRAINT "digilab_sync_state_id_check" CHECK ("id"),
    CONSTRAINT "digilab_sync_state_next_page_check" CHECK (("next_page" >= 2))
);


ALTER TABLE "public"."digilab_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_submissions" (
    "id" bigint NOT NULL,
    "request_id" "uuid" NOT NULL,
    "feedback_type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "contact_email" "text",
    "page_url" "text",
    "app_version" "text",
    "user_agent" "text",
    "client_hash" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "provider_message_id" "text",
    "email_sent_at" timestamp with time zone,
    "email_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feedback_submissions_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['bug'::"text", 'suggestion'::"text"]))),
    CONSTRAINT "feedback_submissions_message_check" CHECK ((("char_length"("message") >= 10) AND ("char_length"("message") <= 5000))),
    CONSTRAINT "feedback_submissions_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."feedback_submissions" OWNER TO "postgres";


ALTER TABLE "public"."feedback_submissions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."feedback_submissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."formats" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text",
    "background_path" "text",
    "background_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "rules_text" "text",
    "rules_url" "text",
    "is_community_highlight" boolean DEFAULT false NOT NULL,
    CONSTRAINT "formats_rules_url_safe" CHECK ((("rules_url" IS NULL) OR ("rules_url" ~ '^https?://[^[:space:]]+$'::"text")))
);


ALTER TABLE "public"."formats" OWNER TO "postgres";


ALTER TABLE "public"."formats" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."formats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."player_admin_grants" (
    "player_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_admin_grants_username_check" CHECK ((("username" = "lower"("username")) AND ("username" ~ '^[a-z0-9_-]{3,40}$'::"text")))
);


ALTER TABLE "public"."player_admin_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bandai_id" "text",
    "bandai_nick" "text",
    "digilab_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "avatar_url" "text"
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_account_erasure_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "prepared_by" "uuid" NOT NULL,
    "public_data_action" "text" NOT NULL,
    "stage" "text" DEFAULT 'prepared'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "error_code" "text",
    "prepared_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_deleted_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "external_reviewed_at" timestamp with time zone,
    "completed_by" "uuid",
    CONSTRAINT "site_account_erasure_jobs_public_data_action_check" CHECK (("public_data_action" = ANY (ARRAY['anonymize_linked_player'::"text", 'preserve_reviewed_history'::"text"]))),
    CONSTRAINT "site_account_erasure_jobs_reason_check" CHECK ((("length"("btrim"("reason")) >= 10) AND ("length"("btrim"("reason")) <= 500))),
    CONSTRAINT "site_account_erasure_jobs_stage_check" CHECK (("stage" = ANY (ARRAY['prepared'::"text", 'auth_deleted'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."site_account_erasure_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_legal_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "terms_version" "text" NOT NULL,
    "privacy_version" "text" NOT NULL,
    "terms_sha256" "text" NOT NULL,
    "privacy_sha256" "text" NOT NULL,
    "declared_adult" boolean NOT NULL,
    "declaration_method" "text" DEFAULT 'self_declaration'::"text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_legal_acceptances_declaration_method_check" CHECK (("declaration_method" = 'self_declaration'::"text")),
    CONSTRAINT "site_legal_acceptances_declared_adult_check" CHECK ("declared_adult")
);


ALTER TABLE "public"."site_legal_acceptances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_legal_documents" (
    "kind" "text" NOT NULL,
    "version" "text" NOT NULL,
    "url" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sha256" "text" NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_by" "uuid",
    CONSTRAINT "site_legal_documents_body_check" CHECK ((("length"("btrim"("body")) >= 30) AND ("length"("btrim"("body")) <= 200000))),
    CONSTRAINT "site_legal_documents_check" CHECK (("sha256" = "encode"("sha256"("convert_to"("body", 'UTF8'::"name")), 'hex'::"text"))),
    CONSTRAINT "site_legal_documents_kind_check" CHECK (("kind" = ANY (ARRAY['terms'::"text", 'privacy'::"text"]))),
    CONSTRAINT "site_legal_documents_url_check" CHECK (("url" ~ '^https://[^[:space:]]+$'::"text")),
    CONSTRAINT "site_legal_documents_version_check" CHECK ((("length"("btrim"("version")) >= 1) AND ("length"("btrim"("version")) <= 50)))
);


ALTER TABLE "public"."site_legal_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_security_config" (
    "singleton" boolean DEFAULT true NOT NULL,
    "accounts_enabled" boolean DEFAULT false NOT NULL,
    "technical_contact" "text" DEFAULT 'Eduardo Lopes'::"text" NOT NULL,
    "support_email" "text" DEFAULT 'dulopes1997@gmail.com'::"text" NOT NULL,
    "privacy_url" "text",
    "privacy_version" "text",
    "audit_retention_days" integer,
    "retention_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "terms_url" "text",
    "terms_version" "text",
    CONSTRAINT "site_security_config_audit_retention_days_check" CHECK ((("audit_retention_days" >= 30) AND ("audit_retention_days" <= 3650))),
    CONSTRAINT "site_security_config_singleton_check" CHECK ("singleton")
);


ALTER TABLE "public"."site_security_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bandai_nick" "text",
    "logo_url" "text",
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tournament_name" "text",
    "tournament_date" "date",
    "store_id" "uuid",
    "total_players" smallint,
    "instagram_link" "text",
    "format_id" bigint NOT NULL,
    "rounds" smallint,
    "deck_format_id" bigint DEFAULT 1 NOT NULL,
    "organizer_name" "text"
);


ALTER TABLE "public"."tournament" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_digilab_sync" (
    "tournament_id" bigint NOT NULL,
    "digilab_tournament_id" bigint,
    "digilab_url" "text",
    "status" "text" NOT NULL,
    "verified_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_error_code" "text",
    "comparison_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "tournament_digilab_sync_external_id_positive" CHECK ((("digilab_tournament_id" IS NULL) OR ("digilab_tournament_id" > 0))),
    CONSTRAINT "tournament_digilab_sync_last_error_code_check" CHECK ((("last_error_code" IS NULL) OR ("char_length"("last_error_code") <= 100))),
    CONSTRAINT "tournament_digilab_sync_match_fields_consistent" CHECK (((("status" = 'matched'::"text") AND ("digilab_tournament_id" IS NOT NULL) AND ("digilab_url" IS NOT NULL) AND ("verified_at" IS NOT NULL)) OR (("status" <> 'matched'::"text") AND ("digilab_tournament_id" IS NULL) AND ("digilab_url" IS NULL) AND ("verified_at" IS NULL)))),
    CONSTRAINT "tournament_digilab_sync_status_check" CHECK (("status" = ANY (ARRAY['matched'::"text", 'not_found'::"text", 'ambiguous'::"text", 'mismatch'::"text", 'api_error'::"text"]))),
    CONSTRAINT "tournament_digilab_sync_summary_is_object" CHECK ((("comparison_summary" IS NULL) OR ("jsonb_typeof"("comparison_summary") = 'object'::"text"))),
    CONSTRAINT "tournament_digilab_sync_url_not_blank" CHECK ((("digilab_url" IS NULL) OR ("btrim"("digilab_url") <> ''::"text")))
);


ALTER TABLE "public"."tournament_digilab_sync" OWNER TO "postgres";


ALTER TABLE "public"."tournament" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."tournament_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tournament_ocr_files" (
    "id" bigint NOT NULL,
    "tournament_id" bigint NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_name" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tournament_ocr_files_size_bytes_check" CHECK ((("size_bytes" IS NULL) OR ("size_bytes" >= 0)))
);


ALTER TABLE "public"."tournament_ocr_files" OWNER TO "postgres";


ALTER TABLE "public"."tournament_ocr_files" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."tournament_ocr_files_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tournament_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_id" "uuid",
    "tournament_date" "date" NOT NULL,
    "total_players" smallint NOT NULL,
    "placement" smallint NOT NULL,
    "deck_id" "uuid",
    "decklist" "text",
    "player_id" "uuid",
    "tournament_id" bigint,
    "match_points" integer,
    "team_member" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "community_result_has_event" CHECK ((("store_id" IS NOT NULL) OR ("tournament_id" IS NOT NULL))),
    CONSTRAINT "placement_valid" CHECK (("placement" <= "total_players")),
    CONSTRAINT "tournament_results_match_points_check" CHECK ((("match_points" IS NULL) OR ("match_points" >= 0))),
    CONSTRAINT "tournament_results_placement_check" CHECK (("placement" > 0)),
    CONSTRAINT "tournament_results_team_member_check" CHECK (("team_member" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "tournament_results_total_players_check" CHECK (("total_players" > 0))
);


ALTER TABLE "public"."tournament_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_weekly_schedule" (
    "weekday" smallint NOT NULL,
    "store_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tournament_weekly_schedule_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."tournament_weekly_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "player_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "privacy_version" "text",
    "privacy_acknowledged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "terms_version" "text",
    "terms_accepted_at" timestamp with time zone,
    "adult_declared_at" timestamp with time zone,
    "legal_acceptance_id" "uuid",
    "auth_user_id" "uuid",
    "anonymized_at" timestamp with time zone,
    CONSTRAINT "user_profiles_display_name_check" CHECK ((("length"("btrim"("display_name")) >= 1) AND ("length"("btrim"("display_name")) <= 100))),
    CONSTRAINT "user_profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'blocked'::"text", 'closed'::"text"]))),
    CONSTRAINT "user_profiles_username_check" CHECK ((("username" = "lower"("username")) AND ("username" ~ '^[a-z0-9_-]{3,40}$'::"text")))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_deck_color_stats" WITH ("security_invoker"='true') AS
 WITH "color_tokens" AS (
         SELECT "tr"."id" AS "result_id",
            "tr"."placement",
            "d"."name" AS "deck_name",
            "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
                CASE "lower"(TRIM(BOTH FROM "token"."token"))
                    WHEN 'r'::"text" THEN 'r'::"text"
                    WHEN 'red'::"text" THEN 'r'::"text"
                    WHEN 'vermelho'::"text" THEN 'r'::"text"
                    WHEN 'u'::"text" THEN 'u'::"text"
                    WHEN 'blue'::"text" THEN 'u'::"text"
                    WHEN 'azul'::"text" THEN 'u'::"text"
                    WHEN 'b'::"text" THEN 'b'::"text"
                    WHEN 'black'::"text" THEN 'b'::"text"
                    WHEN 'preto'::"text" THEN 'b'::"text"
                    WHEN 'w'::"text" THEN 'w'::"text"
                    WHEN 'white'::"text" THEN 'w'::"text"
                    WHEN 'branco'::"text" THEN 'w'::"text"
                    WHEN 'g'::"text" THEN 'g'::"text"
                    WHEN 'green'::"text" THEN 'g'::"text"
                    WHEN 'verde'::"text" THEN 'g'::"text"
                    WHEN 'y'::"text" THEN 'y'::"text"
                    WHEN 'yellow'::"text" THEN 'y'::"text"
                    WHEN 'amarelo'::"text" THEN 'y'::"text"
                    WHEN 'p'::"text" THEN 'p'::"text"
                    WHEN 'purple'::"text" THEN 'p'::"text"
                    WHEN 'roxo'::"text" THEN 'p'::"text"
                    ELSE NULL::"text"
                END AS "color_code"
           FROM ((("public"."tournament_results" "tr"
             JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
             LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
             LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id"))),
            LATERAL "regexp_split_to_table"("lower"(COALESCE("d"."colors", ''::"text")), '[^a-z0-9]+'::"text") "token"("token")
          WHERE ("tr"."placement" > 0)
        ), "valid_tokens" AS (
         SELECT "color_tokens"."result_id",
            "color_tokens"."placement",
            "color_tokens"."deck_name",
            "color_tokens"."month",
            "color_tokens"."format_code",
            "color_tokens"."color_code"
           FROM "color_tokens"
          WHERE ("color_tokens"."color_code" IS NOT NULL)
        ), "period_totals" AS (
         SELECT "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
            "count"(*) AS "total"
           FROM (("public"."tournament_results" "tr"
             LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
             LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")))
          WHERE ("tr"."placement" > 0)
          GROUP BY ("date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone)), COALESCE("f"."code", 'UNSPECIFIED'::"text")
        ), "color_agg" AS (
         SELECT "valid_tokens"."month",
            "valid_tokens"."format_code",
            "valid_tokens"."color_code",
            "count"(*) AS "usage_count",
            "sum"(
                CASE
                    WHEN ("valid_tokens"."placement" = 1) THEN 1
                    ELSE 0
                END) AS "titles",
            "sum"(
                CASE
                    WHEN ("valid_tokens"."placement" <= 4) THEN 1
                    ELSE 0
                END) AS "top4_total"
           FROM "valid_tokens"
          GROUP BY "valid_tokens"."month", "valid_tokens"."format_code", "valid_tokens"."color_code"
        ), "deck_color_agg" AS (
         SELECT "valid_tokens"."month",
            "valid_tokens"."format_code",
            "valid_tokens"."color_code",
            "valid_tokens"."deck_name",
            "count"(*) AS "deck_usage",
            "sum"(
                CASE
                    WHEN ("valid_tokens"."placement" = 1) THEN 1
                    ELSE 0
                END) AS "deck_titles",
            "sum"(
                CASE
                    WHEN ("valid_tokens"."placement" <= 4) THEN 1
                    ELSE 0
                END) AS "deck_top4"
           FROM "valid_tokens"
          GROUP BY "valid_tokens"."month", "valid_tokens"."format_code", "valid_tokens"."color_code", "valid_tokens"."deck_name"
        ), "top_deck_per_color" AS (
         SELECT DISTINCT ON ("deck_color_agg"."month", "deck_color_agg"."format_code", "deck_color_agg"."color_code") "deck_color_agg"."month",
            "deck_color_agg"."format_code",
            "deck_color_agg"."color_code",
            "deck_color_agg"."deck_name" AS "top_deck",
            "deck_color_agg"."deck_titles" AS "top_deck_titles"
           FROM "deck_color_agg"
          ORDER BY "deck_color_agg"."month", "deck_color_agg"."format_code", "deck_color_agg"."color_code", "deck_color_agg"."deck_titles" DESC, "deck_color_agg"."deck_top4" DESC, "deck_color_agg"."deck_usage" DESC, "deck_color_agg"."deck_name"
        )
 SELECT "ca"."month",
    "ca"."format_code",
    "ca"."color_code",
        CASE "ca"."color_code"
            WHEN 'r'::"text" THEN 'Red'::"text"
            WHEN 'u'::"text" THEN 'Blue'::"text"
            WHEN 'b'::"text" THEN 'Black'::"text"
            WHEN 'w'::"text" THEN 'White'::"text"
            WHEN 'g'::"text" THEN 'Green'::"text"
            WHEN 'y'::"text" THEN 'Yellow'::"text"
            WHEN 'p'::"text" THEN 'Purple'::"text"
            ELSE "upper"("ca"."color_code")
        END AS "color",
    "ca"."usage_count",
    "round"(((100.0 * ("ca"."usage_count")::numeric) / (NULLIF("pt"."total", 0))::numeric), 2) AS "usage_percent",
    "ca"."titles",
    "ca"."top4_total",
    "td"."top_deck",
    "td"."top_deck_titles"
   FROM (("color_agg" "ca"
     JOIN "period_totals" "pt" USING ("month", "format_code"))
     JOIN "top_deck_per_color" "td" USING ("month", "format_code", "color_code"))
  ORDER BY "ca"."month" DESC, "ca"."format_code", ((100.0 * ("ca"."usage_count")::numeric) / (NULLIF("pt"."total", 0))::numeric) DESC;


ALTER VIEW "public"."v_deck_color_stats" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_deck_color_stats" IS 'Metagame color statistics per month/format. Replaces client-side aggregation. One row per (month, format_code, color_code). usage_percent denominator = all tournament_results in the period (placement > 0).';



CREATE OR REPLACE VIEW "public"."v_deck_family_stats" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT COALESCE("df"."id", "d"."id") AS "family_id",
            COALESCE("df"."name", "d"."name") AS "family_name",
            ("df"."id" IS NOT NULL) AS "has_explicit_family",
            "d"."id" AS "deck_id",
            "tr"."placement",
                CASE
                    WHEN ("tr"."placement" = 1) THEN 15
                    WHEN ("tr"."placement" = 2) THEN 10
                    WHEN ("tr"."placement" = 3) THEN 7
                    WHEN ("tr"."placement" = 4) THEN 5
                    ELSE 0
                END AS "placement_points"
           FROM (("public"."tournament_results" "tr"
             JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
             LEFT JOIN "public"."deck_families" "df" ON (("df"."id" = "d"."family_id")))
        )
 SELECT "family_id",
    "family_name" AS "family",
    "bool_or"("has_explicit_family") AS "has_explicit_family",
    "count"(DISTINCT "deck_id") AS "archetype_count",
    "count"(*) AS "entries",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_total",
    "round"("avg"(("placement")::numeric), 2) AS "avg_placement",
    "min"("placement") AS "best_finish",
    "max"("placement") AS "worst_finish",
    "sum"("placement_points") AS "ranking_points",
    "round"(((100.0 * ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END))::numeric) / (NULLIF("count"(*), 0))::numeric), 2) AS "title_rate_percent",
    "round"(((100.0 * ("sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END))::numeric) / (NULLIF("count"(*), 0))::numeric), 2) AS "top4_rate_percent",
    "dense_rank"() OVER (ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC) AS "performance_rank"
   FROM "base"
  GROUP BY "family_id", "family_name"
  ORDER BY ("dense_rank"() OVER (ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC)), "family_name";


ALTER VIEW "public"."v_deck_family_stats" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_deck_family_stats" IS 'Estatísticas agregadas por família; decks ainda sem família permanecem como grupos próprios.';



CREATE OR REPLACE VIEW "public"."v_deck_pilot_stats" WITH ("security_invoker"='true') AS
 SELECT "d"."name" AS "deck",
    COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
    "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
    COALESCE("p"."name", 'Desconhecido'::"text") AS "player",
    ("count"(*))::integer AS "times_played",
    ("sum"(
        CASE
            WHEN ("tr"."placement" = 1) THEN 1
            ELSE 0
        END))::integer AS "titles",
    ("sum"(
        CASE
            WHEN ("tr"."placement" = 1) THEN 15
            WHEN ("tr"."placement" = 2) THEN 10
            WHEN ("tr"."placement" = 3) THEN 7
            WHEN ("tr"."placement" = 4) THEN 5
            ELSE 0
        END))::integer AS "points"
   FROM (((("public"."tournament_results" "tr"
     JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
     LEFT JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
     LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
     LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")))
  GROUP BY "d"."name", "f"."code", ("date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone)), "p"."name"
  ORDER BY "d"."name", COALESCE("f"."code", 'UNSPECIFIED'::"text"), ("date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone)), (("sum"(
        CASE
            WHEN ("tr"."placement" = 1) THEN 15
            WHEN ("tr"."placement" = 2) THEN 10
            WHEN ("tr"."placement" = 3) THEN 7
            WHEN ("tr"."placement" = 4) THEN 5
            ELSE 0
        END))::integer) DESC;


ALTER VIEW "public"."v_deck_pilot_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_deck_rank" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            "tr"."tournament_id",
            "tr"."store_id",
            "tr"."tournament_date",
            "tr"."player_id",
            "tr"."placement",
            "tr"."total_players",
            COALESCE(("t"."rounds")::integer,
                CASE
                    WHEN ("tr"."total_players" <= 8) THEN 3
                    ELSE 4
                END) AS "rounds",
            "d"."name" AS "deck_name"
           FROM (("public"."tournament_results" "tr"
             JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
             LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
        ), "scored" AS (
         SELECT "b"."month",
            "b"."tournament_id",
            "b"."store_id",
            "b"."tournament_date",
            "b"."player_id",
            "b"."placement",
            "b"."total_players",
            "b"."rounds",
            "b"."deck_name",
                CASE
                    WHEN ("b"."placement" = 1) THEN 4
                    WHEN ("b"."placement" = 2) THEN 3
                    WHEN ("b"."placement" = 3) THEN 2
                    WHEN ("b"."placement" = 4) THEN 1
                    ELSE 0
                END AS "placement_points",
                CASE
                    WHEN (COALESCE(("b"."total_players")::integer, 0) <= 8) THEN 1.0
                    WHEN (("b"."total_players" >= 9) AND ("b"."total_players" <= 16)) THEN 1.2
                    WHEN (("b"."total_players" >= 17) AND (COALESCE("b"."rounds", 0) >= 5)) THEN 1.5
                    WHEN ("b"."total_players" >= 17) THEN 1.0
                    ELSE 1.0
                END AS "points_multiplier",
                CASE
                    WHEN (COALESCE(("b"."total_players")::integer, 0) <= 8) THEN 100
                    WHEN (("b"."total_players" >= 9) AND ("b"."total_players" <= 16)) THEN 120
                    WHEN (("b"."total_players" >= 17) AND (COALESCE("b"."rounds", 0) >= 5)) THEN 150
                    WHEN ("b"."total_players" >= 17) THEN 100
                    ELSE 100
                END AS "points_weight_percent"
           FROM "base" "b"
        )
 SELECT "month",
    "deck_name" AS "deck",
    "count"(*) AS "monthly_appearances",
    "count"(DISTINCT COALESCE(("tournament_id")::"text", "concat_ws"('|'::"text", ("store_id")::"text", ("tournament_date")::"text"))) AS "tournament_appearances",
    "count"(DISTINCT "player_id") AS "unique_players",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_total",
    ("round"("avg"(("placement")::numeric), 0))::integer AS "avg_placement",
    "min"("placement") AS "best_finish",
    "max"("placement") AS "worst_finish",
    "sum"("placement_points") AS "base_points",
    "round"("sum"((("placement_points")::numeric * "points_multiplier")), 2) AS "ranking_points",
    "dense_rank"() OVER (PARTITION BY "month" ORDER BY ("sum"((("placement_points")::numeric * "points_multiplier"))) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC) AS "performance_rank"
   FROM "scored" "s"
  GROUP BY "month", "deck_name"
  ORDER BY "month" DESC, ("dense_rank"() OVER (PARTITION BY "month" ORDER BY ("sum"((("placement_points")::numeric * "points_multiplier"))) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC)), "deck_name";


ALTER VIEW "public"."v_deck_rank" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_deck_representation" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "tr"."id",
            "tr"."tournament_id",
            "tr"."tournament_date",
            "tr"."placement",
            "tr"."player_id",
            "d"."name" AS "deck_name"
           FROM ("public"."tournament_results" "tr"
             JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
        )
 SELECT "deck_name" AS "deck",
    "count"(*) AS "appearances",
    "count"(DISTINCT "tournament_id") AS "tournaments_played",
    "count"(DISTINCT "player_id") AS "unique_players",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_finishes",
    "round"("avg"(("placement")::numeric), 2) AS "avg_placement",
    "round"(((100.0 * ("count"(*))::numeric) / NULLIF("sum"("count"(*)) OVER (), (0)::numeric)), 2) AS "meta_share_percent"
   FROM "base" "b"
  GROUP BY "deck_name"
  ORDER BY ("round"(((100.0 * ("count"(*))::numeric) / NULLIF("sum"("count"(*)) OVER (), (0)::numeric)), 2)) DESC, ("count"(*)) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC;


ALTER VIEW "public"."v_deck_representation" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_deck_stats" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "tr"."placement",
            "d"."name" AS "deck_name"
           FROM ("public"."tournament_results" "tr"
             JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
        ), "scored" AS (
         SELECT "b"."placement",
            "b"."deck_name",
                CASE
                    WHEN ("b"."placement" = 1) THEN 15
                    WHEN ("b"."placement" = 2) THEN 10
                    WHEN ("b"."placement" = 3) THEN 7
                    WHEN ("b"."placement" = 4) THEN 5
                    ELSE 0
                END AS "placement_points"
           FROM "base" "b"
        )
 SELECT "deck_name" AS "deck",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_total",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "count"(*) AS "entries",
    "round"("avg"(("placement")::numeric), 2) AS "avg_placement",
    "min"("placement") AS "best_finish",
    "max"("placement") AS "worst_finish",
    "sum"("placement_points") AS "ranking_points",
    "round"(((100.0 * ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END))::numeric) / (NULLIF("count"(*), 0))::numeric), 2) AS "title_rate_percent",
    "round"(((100.0 * ("sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END))::numeric) / (NULLIF("count"(*), 0))::numeric), 2) AS "top4_rate_percent",
    "dense_rank"() OVER (ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC) AS "performance_rank"
   FROM "scored" "s"
  GROUP BY "deck_name"
  ORDER BY ("dense_rank"() OVER (ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC)), "deck_name";


ALTER VIEW "public"."v_deck_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_meta_by_month" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            "tr"."tournament_date",
            COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
            "d"."name" AS "deck_name",
            "tr"."placement"
           FROM ((("public"."tournament_results" "tr"
             JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
             LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
             LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")))
        ), "rollup" AS (
         SELECT "b"."month",
            "b"."format_code",
            "b"."deck_name",
            "count"(*) AS "appearances",
            "sum"(
                CASE
                    WHEN ("b"."placement" = 1) THEN 1
                    ELSE 0
                END) AS "titles",
            "sum"(
                CASE
                    WHEN ("b"."placement" <= 2) THEN 1
                    ELSE 0
                END) AS "top2_total",
            "sum"(
                CASE
                    WHEN ("b"."placement" <= 3) THEN 1
                    ELSE 0
                END) AS "top3_total",
            "sum"(
                CASE
                    WHEN ("b"."placement" <= 4) THEN 1
                    ELSE 0
                END) AS "top4_total",
            "max"("b"."tournament_date") AS "last_tournament_date"
           FROM "base" "b"
          GROUP BY "b"."month", "b"."format_code", "b"."deck_name"
        )
 SELECT "month",
    "deck_name" AS "deck",
    "appearances",
    "format_code",
    "round"(((100.0 * ("appearances")::numeric) / NULLIF("sum"("appearances") OVER (PARTITION BY "month", "format_code"), (0)::numeric)), 2) AS "meta_share_percent",
    "titles",
    "top2_total",
    "top3_total",
    "top4_total",
    "last_tournament_date"
   FROM "rollup" "r"
  ORDER BY "month" DESC, "format_code", ("round"(((100.0 * ("appearances")::numeric) / NULLIF("sum"("appearances") OVER (PARTITION BY "month", "format_code"), (0)::numeric)), 2)) DESC, "appearances" DESC;


ALTER VIEW "public"."v_meta_by_month" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_meta_by_month" IS 'Meta share per deck per month. Placement counts: titles=1st, top2_total=1st–2nd, top3_total=1st–3rd, top4_total=1st–4th. Derive exact placement counts: 2nd = top2_total-titles, 3rd = top3_total-top2_total, 4th = top4_total-top3_total. last_tournament_date: exact date of the most recent tournament for that deck in that month.';



CREATE OR REPLACE VIEW "public"."v_monthly_ranking" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            "p"."name" AS "player_name",
            "tr"."placement"
           FROM ("public"."tournament_results" "tr"
             JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
        ), "scored" AS (
         SELECT "b"."month",
            "b"."player_name",
            "b"."placement",
                CASE
                    WHEN ("b"."placement" = 1) THEN 15
                    WHEN ("b"."placement" = 2) THEN 10
                    WHEN ("b"."placement" = 3) THEN 7
                    WHEN ("b"."placement" = 4) THEN 5
                    ELSE 0
                END AS "placement_points"
           FROM "base" "b"
        )
 SELECT "month",
    "player_name" AS "player",
    "sum"("placement_points") AS "points",
    "count"(*) AS "entries",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_total",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "round"("avg"(("placement")::numeric), 2) AS "avg_placement",
    "dense_rank"() OVER (PARTITION BY "month" ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC) AS "monthly_rank"
   FROM "scored" "s"
  GROUP BY "month", "player_name"
  ORDER BY "month" DESC, ("dense_rank"() OVER (PARTITION BY "month" ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC)), "player_name";


ALTER VIEW "public"."v_monthly_ranking" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_player_points_by_month" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
            "p"."name" AS "player",
            "tr"."placement"
           FROM ((("public"."tournament_results" "tr"
             JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
             LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
             LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")))
        ), "scored" AS (
         SELECT "b"."month",
            "b"."format_code",
            "b"."player",
            "b"."placement",
                CASE
                    WHEN ("b"."placement" = 1) THEN 15
                    WHEN ("b"."placement" = 2) THEN 10
                    WHEN ("b"."placement" = 3) THEN 7
                    WHEN ("b"."placement" = 4) THEN 5
                    WHEN ("b"."placement" <= 8) THEN 3
                    WHEN ("b"."placement" <= 16) THEN 1
                    ELSE 0
                END AS "points"
           FROM "base" "b"
        )
 SELECT "month",
    "format_code",
    "player",
    "sum"("points") AS "points",
    "count"(*) AS "entries",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_total",
    "sum"(
        CASE
            WHEN ("placement" <= 8) THEN 1
            ELSE 0
        END) AS "top8_total"
   FROM "scored" "s"
  GROUP BY "month", "format_code", "player"
  ORDER BY "month" DESC, "format_code", ("sum"("points")) DESC, "player";


ALTER VIEW "public"."v_player_points_by_month" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_player_points_by_month" IS 'Player points per month and format. Points: 1st=15, 2nd=10, 3rd=7, 4th=5, top8=3, top16=1.';



CREATE OR REPLACE VIEW "public"."v_player_ranking" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "p"."name" AS "player_name",
            "tr"."tournament_date",
            "tr"."deck_id",
            "tr"."placement"
           FROM ("public"."tournament_results" "tr"
             JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
        ), "scored" AS (
         SELECT "b"."player_name",
            "b"."tournament_date",
            "b"."deck_id",
            "b"."placement",
                CASE
                    WHEN ("b"."placement" = 1) THEN 15
                    WHEN ("b"."placement" = 2) THEN 10
                    WHEN ("b"."placement" = 3) THEN 7
                    WHEN ("b"."placement" = 4) THEN 5
                    ELSE 0
                END AS "placement_points"
           FROM "base" "b"
        )
 SELECT "player_name" AS "player",
    "sum"(
        CASE
            WHEN ("placement" <= 4) THEN 1
            ELSE 0
        END) AS "top4_total",
    "sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END) AS "titles",
    "sum"("placement_points") AS "ranking_points",
    "count"(*) AS "entries",
    "round"("avg"(("placement")::numeric), 2) AS "avg_placement",
    "count"(DISTINCT "deck_id") AS "unique_decks_used",
    "max"("tournament_date") AS "last_event_date",
    "round"(((100.0 * ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END))::numeric) / (NULLIF("count"(*), 0))::numeric), 2) AS "title_rate_percent",
    "dense_rank"() OVER (ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC) AS "overall_rank"
   FROM "scored" "s"
  GROUP BY "player_name"
  ORDER BY ("dense_rank"() OVER (ORDER BY ("sum"("placement_points")) DESC, ("sum"(
        CASE
            WHEN ("placement" = 1) THEN 1
            ELSE 0
        END)) DESC, ("count"(*)) DESC)), "player_name";


ALTER VIEW "public"."v_player_ranking" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_podium" WITH ("security_invoker"='true') AS
 SELECT "tr"."id",
    "s"."name" AS "store",
    "tr"."tournament_date",
    "tr"."placement",
    "p"."name" AS "player",
    "d"."name" AS "deck",
    "tr"."tournament_id",
    "t"."tournament_name",
    COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code"
   FROM ((((("public"."tournament_results" "tr"
     JOIN "public"."stores" "s" ON (("s"."id" = "tr"."store_id")))
     JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
     LEFT JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
     LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
     LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")));


ALTER VIEW "public"."v_podium" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_podium_full" WITH ("security_invoker"='true') AS
 SELECT "tr"."id",
    "tr"."store_id",
    COALESCE("s"."name", "t"."organizer_name", 'Comunidade'::"text") AS "store",
    "tr"."tournament_date",
    "tr"."placement",
    "p"."name" AS "player",
    "d"."name" AS "deck",
    "di"."image_url",
    "tr"."total_players",
    "tr"."tournament_id",
    "tr"."decklist",
    "t"."tournament_name",
    "t"."instagram_link",
    COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
    "tr"."match_points",
    "tr"."team_member"
   FROM (((((("public"."tournament_results" "tr"
     LEFT JOIN "public"."stores" "s" ON (("s"."id" = "tr"."store_id")))
     LEFT JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
     LEFT JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
     LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
     LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")))
     LEFT JOIN LATERAL ( SELECT "dimg"."image_url"
           FROM "public"."deck_images" "dimg"
          WHERE ("dimg"."deck_id" = "d"."id")
          ORDER BY "dimg"."created_at" DESC, "dimg"."id" DESC
         LIMIT 1) "di" ON (true));


ALTER VIEW "public"."v_podium_full" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_stats_base" WITH ("security_invoker"='true') AS
 SELECT "tr"."id",
    "tr"."tournament_id",
    "tr"."store_id",
    "tr"."deck_id",
    "tr"."player_id",
    "tr"."tournament_date",
    "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
    "tr"."placement",
    "tr"."total_players",
    "s"."name" AS "store",
    "d"."name" AS "deck",
    "p"."name" AS "player",
    COALESCE("f"."code", 'UNSPECIFIED'::"text") AS "format_code",
        CASE
            WHEN ("tr"."placement" = 1) THEN 15
            WHEN ("tr"."placement" = 2) THEN 10
            WHEN ("tr"."placement" = 3) THEN 7
            WHEN ("tr"."placement" = 4) THEN 5
            WHEN ("tr"."placement" <= 8) THEN 3
            WHEN ("tr"."placement" <= 16) THEN 1
            ELSE 0
        END AS "ranking_points",
        CASE
            WHEN ("tr"."placement" = 1) THEN 1
            ELSE 0
        END AS "is_title",
        CASE
            WHEN ("tr"."placement" <= 4) THEN 1
            ELSE 0
        END AS "is_top4",
        CASE
            WHEN ("tr"."placement" <= LEAST(8, COALESCE(("tr"."total_players")::integer, 8))) THEN 1
            ELSE 0
        END AS "is_top8",
        CASE
            WHEN ("tr"."placement" <= LEAST(16, COALESCE(("tr"."total_players")::integer, 16))) THEN 1
            ELSE 0
        END AS "is_top16"
   FROM ((((("public"."tournament_results" "tr"
     JOIN "public"."stores" "s" ON (("s"."id" = "tr"."store_id")))
     JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
     LEFT JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
     LEFT JOIN "public"."tournament" "t" ON (("t"."id" = "tr"."tournament_id")))
     LEFT JOIN "public"."formats" "f" ON (("f"."id" = "t"."format_id")));


ALTER VIEW "public"."v_stats_base" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_store_champions" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "s"."name" AS "store_name",
            "p"."name" AS "player_name",
            "tr"."placement"
           FROM (("public"."tournament_results" "tr"
             JOIN "public"."stores" "s" ON (("s"."id" = "tr"."store_id")))
             JOIN "public"."players" "p" ON (("p"."id" = "tr"."player_id")))
        ), "scored" AS (
         SELECT "b"."store_name",
            "b"."player_name",
            "b"."placement",
                CASE
                    WHEN ("b"."placement" = 1) THEN 15
                    WHEN ("b"."placement" = 2) THEN 10
                    WHEN ("b"."placement" = 3) THEN 7
                    WHEN ("b"."placement" = 4) THEN 5
                    ELSE 0
                END AS "placement_points"
           FROM "base" "b"
        ), "agg" AS (
         SELECT "s"."store_name",
            "s"."player_name",
            "count"(*) AS "entries",
            "sum"(
                CASE
                    WHEN ("s"."placement" = 1) THEN 1
                    ELSE 0
                END) AS "titles",
            "sum"(
                CASE
                    WHEN ("s"."placement" <= 4) THEN 1
                    ELSE 0
                END) AS "top4_total",
            "sum"("s"."placement_points") AS "ranking_points",
            "round"("avg"(("s"."placement")::numeric), 2) AS "avg_placement"
           FROM "scored" "s"
          GROUP BY "s"."store_name", "s"."player_name"
        )
 SELECT "store_name" AS "store",
    "player_name" AS "player",
    "titles",
    "entries",
    "top4_total",
    "ranking_points",
    "avg_placement",
    "round"(((100.0 * ("titles")::numeric) / NULLIF("sum"("titles") OVER (PARTITION BY "store_name"), (0)::numeric)), 2) AS "store_title_share_percent",
    "dense_rank"() OVER (PARTITION BY "store_name" ORDER BY "titles" DESC, "ranking_points" DESC, "entries" DESC) AS "store_rank"
   FROM "agg" "a"
  ORDER BY "store_name", ("dense_rank"() OVER (PARTITION BY "store_name" ORDER BY "titles" DESC, "ranking_points" DESC, "entries" DESC)), "player_name";


ALTER VIEW "public"."v_store_champions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_top_cards_by_deck" WITH ("security_invoker"='true') AS
 SELECT "d"."name" AS "deck_name",
    "dc"."card_code",
    COALESCE("max"(NULLIF(TRIM(BOTH FROM "meta"."name"), ''::"text")), "dc"."card_code") AS "card_name",
    "max"("meta"."card_level") AS "card_level",
    "max"("meta"."card_type") AS "card_type",
    "bool_or"(COALESCE("meta"."is_staple", false)) AS "is_staple",
    "count"(DISTINCT "tr"."id") AS "total",
    "count"(DISTINCT
        CASE
            WHEN ("tr"."placement" = 1) THEN "tr"."id"
            ELSE NULL::"uuid"
        END) AS "champion",
    "count"(DISTINCT
        CASE
            WHEN ("tr"."placement" <= 2) THEN "tr"."id"
            ELSE NULL::"uuid"
        END) AS "top2",
    "count"(DISTINCT
        CASE
            WHEN ("tr"."placement" <= 3) THEN "tr"."id"
            ELSE NULL::"uuid"
        END) AS "top3",
    "count"(DISTINCT
        CASE
            WHEN ("tr"."placement" <= 4) THEN "tr"."id"
            ELSE NULL::"uuid"
        END) AS "top4"
   FROM (((("public"."tournament_results" "tr"
     JOIN "public"."decks" "d" ON (("d"."id" = "tr"."deck_id")))
     JOIN "public"."decklists" "dl" ON (("dl"."tournament_result_id" = "tr"."id")))
     JOIN "public"."decklist_cards" "dc" ON (("dc"."decklist_id" = "dl"."id")))
     LEFT JOIN "public"."decklist_card_metadata" "meta" ON (("meta"."card_code" = "dc"."card_code")))
  WHERE ((("tr"."placement" >= 1) AND ("tr"."placement" <= 4)) AND ("dc"."card_code" IS NOT NULL))
  GROUP BY "d"."name", "dc"."card_code"
  ORDER BY "d"."name", ("count"(DISTINCT
        CASE
            WHEN ("tr"."placement" = 1) THEN "tr"."id"
            ELSE NULL::"uuid"
        END)) DESC, ("count"(DISTINCT
        CASE
            WHEN ("tr"."placement" <= 4) THEN "tr"."id"
            ELSE NULL::"uuid"
        END)) DESC, ("count"(DISTINCT "tr"."id")) DESC;


ALTER VIEW "public"."v_top_cards_by_deck" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_top_cards_by_deck" IS 'Top-4 card usage aggregated per deck archetype. One row per (deck_name, card_code). Use deck_name=eq.<name> to filter to a specific deck in the statistics panel.';



CREATE OR REPLACE VIEW "public"."v_top_cards_by_month" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "date_trunc"('month'::"text", ("tr"."tournament_date")::timestamp with time zone) AS "month",
            "tr"."placement",
            "dl"."id" AS "decklist_id",
            "dc"."card_code"
           FROM (("public"."tournament_results" "tr"
             JOIN "public"."decklists" "dl" ON (("dl"."tournament_result_id" = "tr"."id")))
             JOIN "public"."decklist_cards" "dc" ON (("dc"."decklist_id" = "dl"."id")))
          WHERE ("tr"."placement" <= 4)
        ), "agg" AS (
         SELECT "b"."month",
            "b"."card_code",
            "count"(DISTINCT "b"."decklist_id") AS "total",
            "count"(DISTINCT
                CASE
                    WHEN ("b"."placement" = 1) THEN "b"."decklist_id"
                    ELSE NULL::bigint
                END) AS "champion",
            "count"(DISTINCT
                CASE
                    WHEN ("b"."placement" <= 2) THEN "b"."decklist_id"
                    ELSE NULL::bigint
                END) AS "top2",
            "count"(DISTINCT
                CASE
                    WHEN ("b"."placement" <= 3) THEN "b"."decklist_id"
                    ELSE NULL::bigint
                END) AS "top3",
            "count"(DISTINCT
                CASE
                    WHEN ("b"."placement" <= 4) THEN "b"."decklist_id"
                    ELSE NULL::bigint
                END) AS "top4"
           FROM "base" "b"
          GROUP BY "b"."month", "b"."card_code"
        )
 SELECT "a"."month",
    "a"."card_code",
    COALESCE(NULLIF(TRIM(BOTH FROM "meta"."name"), ''::"text"), "a"."card_code") AS "card_name",
    "meta"."card_type",
    "meta"."card_level",
    COALESCE("meta"."is_digi_egg", false) AS "is_digi_egg",
    COALESCE("meta"."is_staple", false) AS "is_staple",
    "a"."total",
    "a"."champion",
    "a"."top2",
    "a"."top3",
    "a"."top4",
    "dense_rank"() OVER (PARTITION BY "a"."month" ORDER BY "a"."total" DESC, "a"."champion" DESC, "a"."top2" DESC, "a"."card_code") AS "monthly_rank"
   FROM ("agg" "a"
     LEFT JOIN "public"."decklist_card_metadata" "meta" ON (("meta"."card_code" = "a"."card_code")))
  ORDER BY "a"."month" DESC, ("dense_rank"() OVER (PARTITION BY "a"."month" ORDER BY "a"."total" DESC, "a"."champion" DESC, "a"."top2" DESC, "a"."card_code")), "a"."card_code";


ALTER VIEW "public"."v_top_cards_by_month" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_top_cards_by_month" IS 'Top-4 card usage aggregated per month. card_name is resolved via decklist_card_metadata so the client does not need to fetch cards_cache or call digimoncard.io. Falls back to card_code when name is missing.';



ALTER TABLE ONLY "public"."deck_format_rule_versions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deck_format_rule_versions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."deck_formats" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deck_formats_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."decklist_cards" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."decklist_cards_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."decklists" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."decklists_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."ban_list"
    ADD CONSTRAINT "ban_list_pkey" PRIMARY KEY ("card_code");



ALTER TABLE ONLY "public"."card_portrait_settings"
    ADD CONSTRAINT "card_portrait_settings_pkey" PRIMARY KEY ("card_code");



ALTER TABLE ONLY "public"."community_audit"
    ADD CONSTRAINT "community_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_entries"
    ADD CONSTRAINT "community_entries_event_id_player_id_key" UNIQUE ("event_id", "player_id");



ALTER TABLE ONLY "public"."community_entries"
    ADD CONSTRAINT "community_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_canonical_tournament_id_key" UNIQUE ("canonical_tournament_id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_digilab_id_key" UNIQUE ("digilab_id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_exports"
    ADD CONSTRAINT "community_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_round_id_table_number_key" UNIQUE ("round_id", "table_number");



ALTER TABLE ONLY "public"."community_rounds"
    ADD CONSTRAINT "community_rounds_event_id_number_key" UNIQUE ("event_id", "number");



ALTER TABLE ONLY "public"."community_rounds"
    ADD CONSTRAINT "community_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deck_families"
    ADD CONSTRAINT "deck_families_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."deck_families"
    ADD CONSTRAINT "deck_families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deck_families"
    ADD CONSTRAINT "deck_families_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."deck_format_rule_versions"
    ADD CONSTRAINT "deck_format_rule_versions_deck_format_id_version_key" UNIQUE ("deck_format_id", "version");



ALTER TABLE ONLY "public"."deck_format_rule_versions"
    ADD CONSTRAINT "deck_format_rule_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deck_formats"
    ADD CONSTRAINT "deck_formats_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."deck_formats"
    ADD CONSTRAINT "deck_formats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deck_images"
    ADD CONSTRAINT "deck_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decklist_card_metadata"
    ADD CONSTRAINT "decklist_card_metadata_pkey" PRIMARY KEY ("card_code");



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "decklist_cards_decklist_id_card_code_key" UNIQUE ("decklist_id", "card_code");



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "decklist_cards_decklist_id_position_key" UNIQUE ("decklist_id", "position");



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "decklist_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_tournament_result_id_key" UNIQUE ("tournament_result_id");



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digilab_background_imports"
    ADD CONSTRAINT "digilab_background_imports_pkey" PRIMARY KEY ("digilab_tournament_id");



ALTER TABLE ONLY "public"."digilab_catalog_sync_runs"
    ADD CONSTRAINT "digilab_catalog_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digilab_deck_catalog"
    ADD CONSTRAINT "digilab_deck_catalog_pkey" PRIMARY KEY ("digilab_archetype_id");



ALTER TABLE ONLY "public"."digilab_deck_sync"
    ADD CONSTRAINT "digilab_deck_sync_pkey" PRIMARY KEY ("digilab_deck_slug");



ALTER TABLE ONLY "public"."digilab_player_sync"
    ADD CONSTRAINT "digilab_player_sync_pkey" PRIMARY KEY ("digilab_player_slug");



ALTER TABLE ONLY "public"."digilab_sync_events"
    ADD CONSTRAINT "digilab_sync_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digilab_sync_runs"
    ADD CONSTRAINT "digilab_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digilab_sync_state"
    ADD CONSTRAINT "digilab_sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_submissions"
    ADD CONSTRAINT "feedback_submissions_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."formats"
    ADD CONSTRAINT "formats_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."formats"
    ADD CONSTRAINT "formats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_admin_grants"
    ADD CONSTRAINT "player_admin_grants_pkey" PRIMARY KEY ("player_id");



ALTER TABLE ONLY "public"."player_admin_grants"
    ADD CONSTRAINT "player_admin_grants_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_account_erasure_jobs"
    ADD CONSTRAINT "site_account_erasure_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_account_erasure_jobs"
    ADD CONSTRAINT "site_account_erasure_jobs_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."site_legal_acceptances"
    ADD CONSTRAINT "site_legal_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_legal_documents"
    ADD CONSTRAINT "site_legal_documents_pkey" PRIMARY KEY ("kind", "version");



ALTER TABLE ONLY "public"."site_security_config"
    ADD CONSTRAINT "site_security_config_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_digilab_sync"
    ADD CONSTRAINT "tournament_digilab_sync_digilab_tournament_id_key" UNIQUE ("digilab_tournament_id");



ALTER TABLE ONLY "public"."tournament_digilab_sync"
    ADD CONSTRAINT "tournament_digilab_sync_pkey" PRIMARY KEY ("tournament_id");



ALTER TABLE ONLY "public"."tournament_ocr_files"
    ADD CONSTRAINT "tournament_ocr_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_ocr_files"
    ADD CONSTRAINT "tournament_ocr_files_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."tournament"
    ADD CONSTRAINT "tournament_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "tournament_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_weekly_schedule"
    ADD CONSTRAINT "tournament_weekly_schedule_pkey" PRIMARY KEY ("weekday");



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "unique_player_per_tournament" UNIQUE ("tournament_id", "player_id") DEFERRABLE;



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "unique_tournament_placement" UNIQUE ("tournament_id", "placement", "team_member") DEFERRABLE;



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "uq_decklist_cards_code" UNIQUE ("decklist_id", "card_code");



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "uq_decklist_cards_position" UNIQUE ("decklist_id", "position");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_player_id_key" UNIQUE ("player_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");



CREATE INDEX "account_requests_decklist_idx" ON "public"."account_requests" USING "btree" ("decklist_id");



CREATE INDEX "account_requests_player_idx" ON "public"."account_requests" USING "btree" ("player_id");



CREATE INDEX "community_deck_owner" ON "public"."decklists" USING "btree" ("owner_user_id") WHERE ("tournament_result_id" IS NULL);



CREATE INDEX "community_entries_deck_idx" ON "public"."community_entries" USING "btree" ("deck_id");



CREATE INDEX "community_entries_event_idx" ON "public"."community_entries" USING "btree" ("event_id");



CREATE INDEX "community_entries_player_idx" ON "public"."community_entries" USING "btree" ("player_id");



CREATE INDEX "community_events_registration_idx" ON "public"."community_events" USING "btree" ("starts_at") WHERE (("status" = 'published'::"text") AND "registration_open");



CREATE INDEX "community_events_store_idx" ON "public"."community_events" USING "btree" ("store_id");



CREATE INDEX "community_matches_event_round_idx" ON "public"."community_matches" USING "btree" ("event_id", "round_id");



CREATE UNIQUE INDEX "deck_families_name_key" ON "public"."deck_families" USING "btree" ("lower"("btrim"("name")));



CREATE UNIQUE INDEX "deck_families_slug_key" ON "public"."deck_families" USING "btree" ("lower"("btrim"("slug")));



CREATE INDEX "deck_images_deck_latest_idx" ON "public"."deck_images" USING "btree" ("deck_id", "created_at" DESC, "id" DESC);



CREATE INDEX "decklists_archetype_idx" ON "public"."decklists" USING "btree" ("archetype_id");



CREATE INDEX "decklists_creator_player_idx" ON "public"."decklists" USING "btree" ("creator_player_id");



CREATE INDEX "decklists_free_updated" ON "public"."decklists" USING "btree" ("updated_at" DESC, "id" DESC) WHERE ("tournament_result_id" IS NULL);



CREATE UNIQUE INDEX "decks_slug_key" ON "public"."decks" USING "btree" ("lower"("btrim"("slug"))) WHERE (("slug" IS NOT NULL) AND ("btrim"("slug") <> ''::"text"));



CREATE INDEX "digilab_background_imports_claim_run_idx" ON "public"."digilab_background_imports" USING "btree" ("claim_run_id");



CREATE INDEX "digilab_background_imports_tournament_idx" ON "public"."digilab_background_imports" USING "btree" ("tournament_id");



CREATE UNIQUE INDEX "digilab_deck_catalog_slug_key" ON "public"."digilab_deck_catalog" USING "btree" ("lower"("btrim"("slug")));



CREATE UNIQUE INDEX "digilab_deck_sync_archetype_key" ON "public"."digilab_deck_sync" USING "btree" ("digilab_archetype_id") WHERE ("digilab_archetype_id" IS NOT NULL);



CREATE INDEX "digilab_deck_sync_deck_idx" ON "public"."digilab_deck_sync" USING "btree" ("deck_id");



CREATE INDEX "digilab_player_sync_player_idx" ON "public"."digilab_player_sync" USING "btree" ("player_id");



CREATE INDEX "digilab_sync_events_run" ON "public"."digilab_sync_events" USING "btree" ("run_id", "id" DESC);



CREATE INDEX "idx_decklist_cards_card_code" ON "public"."decklist_cards" USING "btree" ("card_code");



CREATE INDEX "idx_decklist_cards_decklist_card_code" ON "public"."decklist_cards" USING "btree" ("decklist_id", "card_code");



CREATE INDEX "idx_decklist_cards_decklist_id" ON "public"."decklist_cards" USING "btree" ("decklist_id");



CREATE INDEX "idx_decklist_cards_decklist_position" ON "public"."decklist_cards" USING "btree" ("decklist_id", "position");



CREATE INDEX "idx_decklists_tournament_result_id" ON "public"."decklists" USING "btree" ("tournament_result_id");



CREATE INDEX "idx_decks_family_id" ON "public"."decks" USING "btree" ("family_id");



CREATE INDEX "idx_decks_is_active" ON "public"."decks" USING "btree" ("is_active");



CREATE INDEX "idx_digilab_background_imports_due" ON "public"."digilab_background_imports" USING "btree" ("status", "next_attempt_at", "first_seen_at");



CREATE INDEX "idx_digilab_deck_catalog_family_slug" ON "public"."digilab_deck_catalog" USING "btree" ("family_slug");



CREATE INDEX "idx_digilab_player_sync_player_id" ON "public"."digilab_player_sync" USING "btree" ("player_id");



CREATE INDEX "idx_feedback_submissions_client_hash" ON "public"."feedback_submissions" USING "btree" ("client_hash", "created_at" DESC);



CREATE INDEX "idx_feedback_submissions_created_at" ON "public"."feedback_submissions" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_players_bandai_id" ON "public"."players" USING "btree" ("bandai_id") WHERE ("bandai_id" IS NOT NULL);



CREATE INDEX "idx_players_bandai_nick" ON "public"."players" USING "btree" ("lower"("bandai_nick")) WHERE ("bandai_nick" IS NOT NULL);



CREATE INDEX "idx_players_digilab_name" ON "public"."players" USING "btree" ("lower"("digilab_name")) WHERE ("digilab_name" IS NOT NULL);



CREATE INDEX "idx_players_is_active" ON "public"."players" USING "btree" ("is_active");



CREATE INDEX "idx_results_date" ON "public"."tournament_results" USING "btree" ("tournament_date");



CREATE INDEX "idx_results_deck" ON "public"."tournament_results" USING "btree" ("deck_id");



CREATE INDEX "idx_results_store" ON "public"."tournament_results" USING "btree" ("store_id");



CREATE INDEX "idx_top4_results" ON "public"."tournament_results" USING "btree" ("placement") WHERE ("placement" <= 4);



CREATE INDEX "idx_tournament_digilab_sync_status_checked" ON "public"."tournament_digilab_sync" USING "btree" ("status", "last_checked_at" DESC);



CREATE INDEX "idx_tournament_format_id" ON "public"."tournament" USING "btree" ("format_id");



CREATE INDEX "idx_tournament_ocr_files_tournament_id" ON "public"."tournament_ocr_files" USING "btree" ("tournament_id", "created_at");



CREATE INDEX "legal_acceptance_user" ON "public"."site_legal_acceptances" USING "btree" ("user_id", "accepted_at" DESC);



CREATE UNIQUE INDEX "one_pending_account_request" ON "public"."account_requests" USING "btree" ("user_id", "request_type") WHERE ("status" = 'pending'::"text");



CREATE INDEX "tournament_results_player_idx" ON "public"."tournament_results" USING "btree" ("player_id");



CREATE INDEX "tournament_results_tournament_idx" ON "public"."tournament_results" USING "btree" ("tournament_id");



CREATE INDEX "tournament_store_idx" ON "public"."tournament" USING "btree" ("store_id");



CREATE UNIQUE INDEX "unique_legacy_tournament_placement" ON "public"."tournament_results" USING "btree" ("store_id", "tournament_date", "placement", "team_member") WHERE ("tournament_id" IS NULL);



CREATE UNIQUE INDEX "unique_legacy_tournament_player" ON "public"."tournament_results" USING "btree" ("store_id", "tournament_date", "player_id") WHERE ("tournament_id" IS NULL);



CREATE UNIQUE INDEX "uq_formats_single_default" ON "public"."formats" USING "btree" ("is_default") WHERE ("is_default" = true);



CREATE OR REPLACE TRIGGER "card_portrait_updated_at" BEFORE UPDATE ON "public"."card_portrait_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "community_audit_context" BEFORE INSERT ON "public"."community_audit" FOR EACH ROW EXECUTE FUNCTION "public"."community_audit_context"();



CREATE OR REPLACE TRIGGER "community_deck_delete_permission" BEFORE DELETE ON "public"."decklists" FOR EACH ROW EXECUTE FUNCTION "public"."guard_community_deck_delete"();



CREATE OR REPLACE TRIGGER "community_event_finished_at" BEFORE UPDATE OF "status" ON "public"."community_events" FOR EACH ROW EXECUTE FUNCTION "public"."community_set_finished_at"();



CREATE OR REPLACE TRIGGER "correct_known_card_rarity" BEFORE INSERT OR UPDATE ON "public"."decklist_card_metadata" FOR EACH ROW EXECUTE FUNCTION "public"."correct_known_card_rarity"();



CREATE OR REPLACE TRIGGER "default_format_banlist" BEFORE INSERT OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."default_format_banlist"();



CREATE OR REPLACE TRIGGER "default_format_security" BEFORE INSERT OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."default_format_security"();



CREATE OR REPLACE TRIGGER "guard_erasure_completion" BEFORE UPDATE ON "public"."account_requests" FOR EACH ROW EXECUTE FUNCTION "public"."guard_erasure_request_completion"();



CREATE OR REPLACE TRIGGER "guard_format_regulations" BEFORE INSERT OR DELETE OR UPDATE ON "public"."formats" FOR EACH ROW EXECUTE FUNCTION "public"."guard_format_regulations"();



CREATE OR REPLACE TRIGGER "guard_format_validation" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."guard_format_validation"();



CREATE OR REPLACE TRIGGER "guard_game_format_regulations" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."guard_format_regulations"();



CREATE OR REPLACE TRIGGER "guard_pending_format_points" BEFORE INSERT OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."guard_pending_format_points"();



CREATE OR REPLACE TRIGGER "immutable_legal_document" BEFORE DELETE OR UPDATE ON "public"."site_legal_documents" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_legal_document"();



CREATE OR REPLACE TRIGGER "record_deck_format_revision" AFTER INSERT OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."record_deck_format_revision"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."ban_list" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."card_portrait_settings" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deck_families" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deck_format_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deck_images" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."decklist_card_metadata" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."decks" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_background_imports" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_catalog_sync_runs" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_deck_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_deck_sync" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_player_sync" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_sync_events" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_sync_runs" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."digilab_sync_state" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."formats" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_player_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."stores" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournament" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournament_digilab_sync" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournament_ocr_files" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournament_results" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_admin_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournament_weekly_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_admin_write"();



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."account_requests" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."admin_users" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."ban_list" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."card_portrait_settings" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."deck_families" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."deck_format_rule_versions" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."deck_formats" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."deck_images" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."decklist_card_metadata" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."decklist_cards" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."decklists" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."decks" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_background_imports" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_catalog_sync_runs" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_deck_catalog" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_deck_sync" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_player_sync" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_sync_events" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_sync_runs" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."digilab_sync_state" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."feedback_submissions" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."formats" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."site_security_config" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."stores" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."tournament" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."tournament_digilab_sync" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."tournament_ocr_files" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."tournament_results" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."tournament_weekly_schedule" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('name', 'code', 'is_active', 'player_id', 'tournament_id', 'deck_id', 'card_code', 'card_level', 'restriction', 'status', 'source', 'rules_revision', 'rules');



CREATE OR REPLACE TRIGGER "site_audit_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('username', 'display_name', 'player_id', 'status', 'privacy_version', 'user_id', 'request_type', 'reviewed_by', 'name', 'code', 'is_active', 'owner_user_id', 'creator_player_id', 'created_by_user_id', 'updated_by_user_id', 'draft_revision', 'draft_cards', 'deck_format_id', 'archetype_id', 'rules_status', 'validation_rules', 'rules_revision', 'tournament_id', 'tournament_result_id', 'store_id', 'tournament_date', 'placement', 'deck_id', 'match_points', 'card_code', 'qty', 'position', 'restriction', 'accounts_enabled', 'privacy_url', 'audit_retention_days', 'retention_reason');



CREATE OR REPLACE TRIGGER "site_author_deck_ownership" AFTER INSERT OR UPDATE OF "creator_player_id", "tournament_result_id" ON "public"."decklists" FOR EACH ROW EXECUTE FUNCTION "public"."sync_linked_player_deck_ownership"();



CREATE OR REPLACE TRIGGER "site_deck_ownership" BEFORE INSERT OR DELETE OR UPDATE ON "public"."decklists" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_deck_ownership"();



CREATE OR REPLACE TRIGGER "site_erasure_job_audit" AFTER INSERT OR UPDATE ON "public"."site_account_erasure_jobs" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('user_id', 'request_id', 'prepared_by', 'public_data_action', 'stage', 'error_code', 'completed_by');



CREATE OR REPLACE TRIGGER "site_legal_acceptance_audit" AFTER INSERT ON "public"."site_legal_acceptances" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('user_id', 'terms_version', 'privacy_version', 'terms_sha256', 'privacy_sha256', 'declared_adult', 'declaration_method');



CREATE OR REPLACE TRIGGER "site_legal_activation" BEFORE UPDATE ON "public"."site_security_config" FOR EACH ROW EXECUTE FUNCTION "public"."guard_site_legal_activation"();



CREATE OR REPLACE TRIGGER "site_legal_document_audit" AFTER INSERT ON "public"."site_legal_documents" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('kind', 'version', 'url', 'sha256', 'published_by');



CREATE OR REPLACE TRIGGER "site_linked_player_deck_ownership" AFTER INSERT OR UPDATE OF "player_id", "status" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_linked_player_deck_ownership"();



CREATE OR REPLACE TRIGGER "site_player_admin_grant_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."player_admin_grants" FOR EACH ROW EXECUTE FUNCTION "site_audit"."capture"('player_id', 'username', 'display_name', 'enabled', 'created_by');



CREATE OR REPLACE TRIGGER "site_player_admin_membership" AFTER INSERT OR UPDATE OF "player_id", "status" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_player_admin"();



CREATE OR REPLACE TRIGGER "trg_ban_list_updated_at" BEFORE UPDATE ON "public"."ban_list" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_block_linked_team_tournament" BEFORE UPDATE OF "tournament_name" ON "public"."tournament" FOR EACH ROW EXECUTE FUNCTION "public"."block_team_tournament_digilab_sync"();



CREATE OR REPLACE TRIGGER "trg_block_team_digilab_sync" BEFORE INSERT OR UPDATE ON "public"."tournament_digilab_sync" FOR EACH ROW EXECUTE FUNCTION "public"."block_team_tournament_digilab_sync"();



CREATE OR REPLACE TRIGGER "trg_decklist_cards_updated_at" BEFORE UPDATE ON "public"."decklist_cards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_decklists_updated_at" BEFORE UPDATE ON "public"."decklists" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_digilab_background_imports_updated_at" BEFORE UPDATE ON "public"."digilab_background_imports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_formats_single_default" BEFORE INSERT OR UPDATE OF "is_default" ON "public"."formats" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_single_default_format"();



CREATE OR REPLACE TRIGGER "trg_players_default_digilab_name" BEFORE INSERT OR UPDATE OF "name", "digilab_name" ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."set_player_digilab_name_default"();



CREATE OR REPLACE TRIGGER "trg_sync_date_after_tournament_update" AFTER UPDATE OF "tournament_date" ON "public"."tournament" FOR EACH ROW EXECUTE FUNCTION "public"."sync_tournament_date_to_results"();



CREATE OR REPLACE TRIGGER "trg_touch_decklist_card_metadata_updated_at" BEFORE UPDATE ON "public"."decklist_card_metadata" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_decklist_cards_updated_at" BEFORE UPDATE ON "public"."decklist_cards" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_touch_decklists_updated_at" BEFORE UPDATE ON "public"."decklists" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tournament_digilab_sync_updated_at" BEFORE UPDATE ON "public"."tournament_digilab_sync" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tournament_normalize_type_name" BEFORE INSERT OR UPDATE OF "tournament_name" ON "public"."tournament" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_tournament_type_name"();



CREATE CONSTRAINT TRIGGER "trg_validate_decklist_limits_del" AFTER DELETE ON "public"."decklist_cards" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."validate_decklist_limits"();



CREATE CONSTRAINT TRIGGER "trg_validate_decklist_limits_insupd" AFTER INSERT OR UPDATE ON "public"."decklist_cards" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."validate_decklist_limits"();



CREATE CONSTRAINT TRIGGER "trg_validate_team_results" AFTER INSERT OR DELETE OR UPDATE ON "public"."tournament_results" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."validate_tournament_team_results"();



CREATE CONSTRAINT TRIGGER "trg_validate_team_tournament" AFTER INSERT OR UPDATE ON "public"."tournament" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."validate_tournament_team_results"();



ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_decklist_id_fkey" FOREIGN KEY ("decklist_id") REFERENCES "public"."decklists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("user_id");



ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_admin_player_id_fkey" FOREIGN KEY ("admin_player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_audit"
    ADD CONSTRAINT "community_audit_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_audit"
    ADD CONSTRAINT "community_audit_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id");



ALTER TABLE ONLY "public"."community_entries"
    ADD CONSTRAINT "community_entries_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id");



ALTER TABLE ONLY "public"."community_entries"
    ADD CONSTRAINT "community_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_entries"
    ADD CONSTRAINT "community_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_canonical_tournament_id_fkey" FOREIGN KEY ("canonical_tournament_id") REFERENCES "public"."tournament"("id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id");



ALTER TABLE ONLY "public"."community_events"
    ADD CONSTRAINT "community_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."community_exports"
    ADD CONSTRAINT "community_exports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id");



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_p1_fkey" FOREIGN KEY ("p1") REFERENCES "public"."community_entries"("id");



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_p2_fkey" FOREIGN KEY ("p2") REFERENCES "public"."community_entries"("id");



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "public"."community_entries"("id");



ALTER TABLE ONLY "public"."community_matches"
    ADD CONSTRAINT "community_matches_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."community_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_rounds"
    ADD CONSTRAINT "community_rounds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."community_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deck_format_rule_versions"
    ADD CONSTRAINT "deck_format_rule_versions_deck_format_id_fkey" FOREIGN KEY ("deck_format_id") REFERENCES "public"."deck_formats"("id");



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "decklist_cards_decklist_id_fkey" FOREIGN KEY ("decklist_id") REFERENCES "public"."decklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "public"."decks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_creator_player_id_fkey" FOREIGN KEY ("creator_player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_deck_format_id_fkey" FOREIGN KEY ("deck_format_id") REFERENCES "public"."deck_formats"("id");



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id");



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_tournament_result_id_fkey" FOREIGN KEY ("tournament_result_id") REFERENCES "public"."tournament_results"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."decklists"
    ADD CONSTRAINT "decklists_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_deck_format_id_fkey" FOREIGN KEY ("deck_format_id") REFERENCES "public"."deck_formats"("id");



ALTER TABLE ONLY "public"."decks"
    ADD CONSTRAINT "decks_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."deck_families"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."digilab_background_imports"
    ADD CONSTRAINT "digilab_background_imports_claim_run_id_fkey" FOREIGN KEY ("claim_run_id") REFERENCES "public"."digilab_sync_runs"("id");



ALTER TABLE ONLY "public"."digilab_background_imports"
    ADD CONSTRAINT "digilab_background_imports_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."digilab_deck_sync"
    ADD CONSTRAINT "digilab_deck_sync_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."digilab_deck_sync"
    ADD CONSTRAINT "digilab_deck_sync_digilab_archetype_id_fkey" FOREIGN KEY ("digilab_archetype_id") REFERENCES "public"."digilab_deck_catalog"("digilab_archetype_id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."digilab_player_sync"
    ADD CONSTRAINT "digilab_player_sync_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."digilab_sync_events"
    ADD CONSTRAINT "digilab_sync_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."digilab_sync_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."digilab_sync_state"
    ADD CONSTRAINT "digilab_sync_state_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."digilab_sync_runs"("id");



ALTER TABLE ONLY "public"."deck_images"
    ADD CONSTRAINT "fk_deck" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "fk_deck" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id");



ALTER TABLE ONLY "public"."decklist_cards"
    ADD CONSTRAINT "fk_decklist_cards_card_code_metadata" FOREIGN KEY ("card_code") REFERENCES "public"."decklist_card_metadata"("card_code") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "fk_player" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "fk_store" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."player_admin_grants"
    ADD CONSTRAINT "player_admin_grants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_admin_grants"
    ADD CONSTRAINT "player_admin_grants_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "profile_legal_acceptance_fk" FOREIGN KEY ("legal_acceptance_id") REFERENCES "public"."site_legal_acceptances"("id");



ALTER TABLE ONLY "public"."site_account_erasure_jobs"
    ADD CONSTRAINT "site_account_erasure_jobs_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."user_profiles"("user_id");



ALTER TABLE ONLY "public"."site_account_erasure_jobs"
    ADD CONSTRAINT "site_account_erasure_jobs_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "public"."user_profiles"("user_id");



ALTER TABLE ONLY "public"."site_account_erasure_jobs"
    ADD CONSTRAINT "site_account_erasure_jobs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."account_requests"("id");



ALTER TABLE ONLY "public"."site_account_erasure_jobs"
    ADD CONSTRAINT "site_account_erasure_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id");



ALTER TABLE ONLY "public"."site_legal_acceptances"
    ADD CONSTRAINT "site_legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id");



ALTER TABLE ONLY "public"."site_legal_documents"
    ADD CONSTRAINT "site_legal_documents_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."user_profiles"("user_id");



ALTER TABLE ONLY "public"."tournament"
    ADD CONSTRAINT "tournament_deck_format_id_fkey" FOREIGN KEY ("deck_format_id") REFERENCES "public"."deck_formats"("id");



ALTER TABLE ONLY "public"."tournament_digilab_sync"
    ADD CONSTRAINT "tournament_digilab_sync_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament"
    ADD CONSTRAINT "tournament_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tournament_ocr_files"
    ADD CONSTRAINT "tournament_ocr_files_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_results"
    ADD CONSTRAINT "tournament_results_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id");



ALTER TABLE ONLY "public"."tournament"
    ADD CONSTRAINT "tournament_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id");



ALTER TABLE ONLY "public"."tournament_weekly_schedule"
    ADD CONSTRAINT "tournament_weekly_schedule_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE RESTRICT;



CREATE POLICY "Admin users read own membership" ON "public"."admin_users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Admins delete stores" ON "public"."stores" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins insert stores" ON "public"."stores" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins manage format regulations" ON "public"."formats" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins manage game formats" ON "public"."deck_formats" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins manage portraits" ON "public"."card_portrait_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins update stores" ON "public"."stores" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "Allow anonymous delete" ON "public"."deck_images" FOR DELETE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous delete" ON "public"."decks" FOR DELETE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous delete ban_list" ON "public"."ban_list" FOR DELETE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous insert" ON "public"."deck_images" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous insert" ON "public"."decks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous insert" ON "public"."tournament" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous insert ban_list" ON "public"."ban_list" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous insert formats" ON "public"."formats" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous select" ON "public"."deck_images" FOR SELECT USING (true);



CREATE POLICY "Allow anonymous select" ON "public"."decks" FOR SELECT USING (true);



CREATE POLICY "Allow anonymous select" ON "public"."tournament" FOR SELECT USING (true);



CREATE POLICY "Allow anonymous select" ON "public"."tournament_results" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anonymous select ban_list" ON "public"."ban_list" FOR SELECT USING (true);



CREATE POLICY "Allow anonymous select decklist card metadata" ON "public"."decklist_card_metadata" FOR SELECT TO "anon" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous select decklist cards" ON "public"."decklist_cards" FOR SELECT TO "anon" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous select decklists" ON "public"."decklists" FOR SELECT TO "anon" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous select formats" ON "public"."formats" FOR SELECT USING (true);



CREATE POLICY "Allow anonymous update" ON "public"."deck_images" FOR UPDATE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"]))) WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous update" ON "public"."decks" FOR UPDATE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"]))) WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous update" ON "public"."tournament" FOR UPDATE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"]))) WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous update ban_list" ON "public"."ban_list" FOR UPDATE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"]))) WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow anonymous update formats" ON "public"."formats" FOR UPDATE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"]))) WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow public delete" ON "public"."players" FOR DELETE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow public insert" ON "public"."players" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Allow public select" ON "public"."players" FOR SELECT USING (true);



CREATE POLICY "Allow public update" ON "public"."players" FOR UPDATE TO "authenticated" USING (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"]))) WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Keep free decks" ON "public"."decklists" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING ((("tournament_result_id" IS NOT NULL) OR ("public"."site_accounts_enabled"() AND "public"."site_is_member"() AND (("owner_user_id" = "auth"."uid"()) OR "public"."site_is_admin"()))));



CREATE POLICY "Public create free decks" ON "public"."decklists" FOR INSERT TO "authenticated" WITH CHECK (("tournament_result_id" IS NULL));



CREATE POLICY "Public delete tournament OCR files" ON "public"."tournament_ocr_files" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Public delete tournament weekly schedule" ON "public"."tournament_weekly_schedule" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Public edit free decks" ON "public"."decklists" FOR UPDATE TO "authenticated" USING (("tournament_result_id" IS NULL)) WITH CHECK (("tournament_result_id" IS NULL));



CREATE POLICY "Public insert tournament OCR files" ON "public"."tournament_ocr_files" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Public insert tournament results" ON "public"."tournament_results" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = ANY (ARRAY['anon'::"text", 'authenticated'::"text"])));



CREATE POLICY "Public insert tournament weekly schedule" ON "public"."tournament_weekly_schedule" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Public manage free deck cards" ON "public"."decklist_cards" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."decklists" "d"
  WHERE (("d"."id" = "decklist_cards"."decklist_id") AND ("d"."tournament_result_id" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."decklists" "d"
  WHERE (("d"."id" = "decklist_cards"."decklist_id") AND ("d"."tournament_result_id" IS NULL)))));



CREATE POLICY "Public read DigiLab tournament sync" ON "public"."tournament_digilab_sync" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read deck families" ON "public"."deck_families" FOR SELECT USING (true);



CREATE POLICY "Public read deck images" ON "public"."deck_images" FOR SELECT USING (true);



CREATE POLICY "Public read decks" ON "public"."decks" FOR SELECT USING (true);



CREATE POLICY "Public read free decks" ON "public"."decklists" FOR SELECT TO "authenticated", "anon" USING (("tournament_result_id" IS NULL));



CREATE POLICY "Public read game formats" ON "public"."deck_formats" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read portraits" ON "public"."card_portrait_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read results" ON "public"."tournament_results" FOR SELECT USING (true);



CREATE POLICY "Public read rule versions" ON "public"."deck_format_rule_versions" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public read stores" ON "public"."stores" FOR SELECT USING (true);



CREATE POLICY "Public read tournament OCR files" ON "public"."tournament_ocr_files" FOR SELECT USING (true);



CREATE POLICY "Public read tournament results" ON "public"."tournament_results" FOR SELECT USING (true);



CREATE POLICY "Public read tournament weekly schedule" ON "public"."tournament_weekly_schedule" FOR SELECT USING (true);



CREATE POLICY "Public update tournament weekly schedule" ON "public"."tournament_weekly_schedule" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "account_cards_access" ON "public"."decklist_cards" TO "authenticated" USING (("public"."site_can_edit_deck"("decklist_id") AND "public"."site_is_member"())) WITH CHECK (("public"."site_can_edit_deck"("decklist_id") AND "public"."site_is_member"()));



CREATE POLICY "account_cards_read" ON "public"."decklist_cards" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "account_deck_access" ON "public"."decklists" TO "authenticated" USING (("public"."site_is_member"() AND (("owner_user_id" = "auth"."uid"()) OR "public"."site_is_admin"()))) WITH CHECK (("public"."site_is_member"() AND (("owner_user_id" = "auth"."uid"()) OR "public"."site_is_admin"())));



ALTER TABLE "public"."account_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin can delete formats" ON "public"."formats" FOR DELETE TO "authenticated" USING (true);



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow delete formats" ON "public"."formats" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated_deck_read" ON "public"."decklists" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."ban_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_portrait_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_deck_delete_permission" ON "public"."decklists" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING ((("tournament_result_id" IS NOT NULL) OR "public"."site_can_delete_community_deck"("owner_user_id")));



ALTER TABLE "public"."community_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deck_families" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deck_format_rule_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deck_formats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deck_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decklist_card_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decklist_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_background_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_catalog_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_deck_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_deck_sync" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_player_sync" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_sync_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."digilab_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."formats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_acceptance_read" ON "public"."site_legal_acceptances" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."site_is_admin"()));



CREATE POLICY "legal_document_read" ON "public"."site_legal_documents" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "own_account_requests" ON "public"."account_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."site_is_admin"()));



CREATE POLICY "own_erasure_job" ON "public"."site_account_erasure_jobs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."site_is_admin"()));



CREATE POLICY "own_profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."site_is_admin"()));



ALTER TABLE "public"."player_admin_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "published_game_formats_only" ON "public"."deck_formats" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("rules_status" = 'published'::"text") OR "public"."site_is_admin"()));



ALTER TABLE "public"."site_account_erasure_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_admin_access" ON "public"."ban_list" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."card_portrait_settings" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."deck_families" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."deck_format_rule_versions" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."deck_formats" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."deck_images" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."decklist_card_metadata" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."decks" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."formats" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."players" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."stores" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."tournament" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."tournament_results" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_admin_access" ON "public"."tournament_weekly_schedule" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_cards_delete" ON "public"."decklist_cards" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING ("public"."site_can_edit_deck"("decklist_id"));



CREATE POLICY "site_cards_insert" ON "public"."decklist_cards" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."site_can_edit_deck"("decklist_id"));



CREATE POLICY "site_cards_update" ON "public"."decklist_cards" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING ("public"."site_can_edit_deck"("decklist_id")) WITH CHECK ("public"."site_can_edit_deck"("decklist_id"));



CREATE POLICY "site_deck_delete" ON "public"."decklists" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR ("public"."site_is_member"() AND ((("tournament_result_id" IS NULL) AND ("owner_user_id" = "auth"."uid"())) OR "public"."site_is_admin"()))));



CREATE POLICY "site_deck_insert" ON "public"."decklists" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR ("public"."site_is_member"() AND ((("tournament_result_id" IS NULL) AND ("owner_user_id" = "auth"."uid"())) OR "public"."site_is_admin"()))));



CREATE POLICY "site_deck_update" ON "public"."decklists" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR ("public"."site_is_member"() AND ((("tournament_result_id" IS NULL) AND ("owner_user_id" = "auth"."uid"())) OR "public"."site_is_admin"())))) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR ("public"."site_is_member"() AND ((("tournament_result_id" IS NULL) AND ("owner_user_id" = "auth"."uid"())) OR "public"."site_is_admin"()))));



CREATE POLICY "site_delete" ON "public"."ban_list" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."card_portrait_settings" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."deck_families" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."deck_format_rule_versions" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."deck_formats" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."deck_images" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."decklist_card_metadata" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."decks" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."formats" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."players" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."stores" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."tournament" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."tournament_results" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_delete" ON "public"."tournament_weekly_schedule" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."ban_list" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."card_portrait_settings" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."deck_families" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."deck_format_rule_versions" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."deck_formats" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."deck_images" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."decklist_card_metadata" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."decks" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."formats" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."players" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."stores" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."tournament" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."tournament_results" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_insert" ON "public"."tournament_weekly_schedule" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



ALTER TABLE "public"."site_legal_acceptances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_legal_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_member_read" ON "public"."ban_list" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."card_portrait_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."deck_families" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."deck_format_rule_versions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."deck_formats" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."deck_images" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."decklist_card_metadata" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."decks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."formats" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."players" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."stores" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."tournament" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."tournament_results" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_member_read" ON "public"."tournament_weekly_schedule" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_private_access" ON "public"."digilab_background_imports" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_catalog_sync_runs" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_deck_catalog" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_deck_sync" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_player_sync" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_sync_events" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_sync_runs" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."digilab_sync_state" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."tournament_digilab_sync" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_access" ON "public"."tournament_ocr_files" AS RESTRICTIVE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_private_admin" ON "public"."digilab_background_imports" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_catalog_sync_runs" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_deck_catalog" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_deck_sync" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_player_sync" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_sync_events" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_sync_runs" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."digilab_sync_state" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."tournament_digilab_sync" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



CREATE POLICY "site_private_admin" ON "public"."tournament_ocr_files" TO "authenticated" USING ("public"."site_is_admin"()) WITH CHECK ("public"."site_is_admin"());



ALTER TABLE "public"."site_security_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_update" ON "public"."ban_list" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."card_portrait_settings" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."deck_families" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."deck_format_rule_versions" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."deck_formats" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."deck_images" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."decklist_card_metadata" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."decks" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."formats" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."players" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."stores" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."tournament" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."tournament_results" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



CREATE POLICY "site_update" ON "public"."tournament_weekly_schedule" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"())) WITH CHECK (((NOT "public"."site_accounts_enabled"()) OR "public"."site_is_admin"()));



ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_digilab_sync" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_ocr_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_weekly_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visible_game_format_versions_only" ON "public"."deck_format_rule_versions" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING (("public"."site_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."deck_formats" "f"
  WHERE (("f"."id" = "deck_format_rule_versions"."deck_format_id") AND ("f"."rules_status" = 'published'::"text"))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_account_requests"("p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_account_requests"("p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_account_requests"("p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_audit_events"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_offset" integer, "p_export" boolean, "p_outcome" "text", "p_operation" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_audit_events"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_offset" integer, "p_export" boolean, "p_outcome" "text", "p_operation" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_audit_events"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_offset" integer, "p_export" boolean, "p_outcome" "text", "p_operation" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_audit_export_page"("p_export_id" "uuid", "p_cursor" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_audit_export_page"("p_export_id" "uuid", "p_cursor" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_audit_export_page"("p_export_id" "uuid", "p_cursor" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_begin_audit_export"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_outcome" "text", "p_operation" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_begin_audit_export"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_outcome" "text", "p_operation" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_begin_audit_export"("p_entity" "text", "p_entity_id" "text", "p_actor" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_outcome" "text", "p_operation" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_complete_account_erasure"("p_job_id" "uuid", "p_external_reviewed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_complete_account_erasure"("p_job_id" "uuid", "p_external_reviewed" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_complete_account_erasure"("p_job_id" "uuid", "p_external_reviewed" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_configure_site_accounts"("p_enabled" boolean, "p_privacy_url" "text", "p_privacy_version" "text", "p_retention_days" integer, "p_retention_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_configure_site_accounts"("p_enabled" boolean, "p_privacy_url" "text", "p_privacy_version" "text", "p_retention_days" integer, "p_retention_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_configure_site_accounts"("p_enabled" boolean, "p_privacy_url" "text", "p_privacy_version" "text", "p_retention_days" integer, "p_retention_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_configure_site_terms"("p_url" "text", "p_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_configure_site_terms"("p_url" "text", "p_version" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_configure_site_terms"("p_url" "text", "p_version" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_finish_audit_export"("p_export_id" "uuid", "p_rows" integer, "p_aborted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_finish_audit_export"("p_export_id" "uuid", "p_rows" integer, "p_aborted" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_finish_audit_export"("p_export_id" "uuid", "p_rows" integer, "p_aborted" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_account_links"("p_search" "text", "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_account_links"("p_search" "text", "p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_account_links"("p_search" "text", "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_player_admins"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_player_admins"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_player_admins"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_site_accounts"("p_search" "text", "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_site_accounts"("p_search" "text", "p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_site_accounts"("p_search" "text", "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_prepare_account_erasure"("p_request_id" "uuid", "p_public_data_action" "text", "p_reason" "text", "p_reviewed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_prepare_account_erasure"("p_request_id" "uuid", "p_public_data_action" "text", "p_reason" "text", "p_reviewed" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_prepare_account_erasure"("p_request_id" "uuid", "p_public_data_action" "text", "p_reason" "text", "p_reviewed" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_record_audit_provider_review"("p_source" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_record_audit_provider_review"("p_source" "text", "p_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_record_audit_provider_review"("p_source" "text", "p_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_register_site_legal_document"("p_kind" "text", "p_version" "text", "p_url" "text", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_register_site_legal_document"("p_kind" "text", "p_version" "text", "p_url" "text", "p_body" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_register_site_legal_document"("p_kind" "text", "p_version" "text", "p_url" "text", "p_body" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_review_account_request"("p_request_id" "uuid", "p_decision" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_account_request"("p_request_id" "uuid", "p_decision" "text", "p_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_review_account_request"("p_request_id" "uuid", "p_decision" "text", "p_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_link_players"("p_search" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_link_players"("p_search" "text", "p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_search_link_players"("p_search" "text", "p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_security_configuration"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_security_configuration"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_security_configuration"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_set_account_player"("p_user_id" "uuid", "p_player_id" "uuid", "p_expected_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_account_player"("p_user_id" "uuid", "p_player_id" "uuid", "p_expected_player_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_set_account_player"("p_user_id" "uuid", "p_player_id" "uuid", "p_expected_player_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_site_audit_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_site_audit_health"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_site_audit_health"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_transfer_community_deck"("p_decklist_id" bigint, "p_owner_user_id" "uuid", "p_updated_at" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_transfer_community_deck"("p_decklist_id" bigint, "p_owner_user_id" "uuid", "p_updated_at" timestamp with time zone, "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_transfer_community_deck"("p_decklist_id" bigint, "p_owner_user_id" "uuid", "p_updated_at" timestamp with time zone, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_site_account"("p_user_id" "uuid", "p_status" "text", "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_site_account"("p_user_id" "uuid", "p_status" "text", "p_is_admin" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_update_site_account"("p_user_id" "uuid", "p_status" "text", "p_is_admin" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."apply_digilab_catalog_snapshot"("p_decks" "jsonb", "p_formats" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_digilab_catalog_snapshot"("p_decks" "jsonb", "p_formats" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."block_team_tournament_digilab_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_team_tournament_digilab_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_team_tournament_digilab_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_user_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_user_profile"() TO "service_role";



GRANT ALL ON TABLE "public"."digilab_background_imports" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."digilab_background_imports" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."claim_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."collect_site_audit_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."collect_site_audit_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_add_players"("p_event" "uuid", "p_players" "jsonb", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_add_players"("p_event" "uuid", "p_players" "jsonb", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_add_players"("p_event" "uuid", "p_players" "jsonb", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_audit_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_audit_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_command"("p_event" "uuid", "p_action" "text", "p_data" "jsonb", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_command"("p_event" "uuid", "p_action" "text", "p_data" "jsonb", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_command"("p_event" "uuid", "p_action" "text", "p_data" "jsonb", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_configure_event"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_configure_event"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_configure_event"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_correct_result"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_correct_result"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_correct_result"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_create"("p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_create"("p_data" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."community_create"("p_data" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_delete_event"("p_event" "uuid", "p_revision" integer, "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_delete_event"("p_event" "uuid", "p_revision" integer, "p_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."community_delete_event"("p_event" "uuid", "p_revision" integer, "p_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_import_context"("p_external" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_import_context"("p_external" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_import_failure"("p_external" bigint, "p_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_import_failure"("p_external" bigint, "p_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_list"("p_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_list"("p_admin" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_list"("p_admin" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."community_list"("p_admin" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_pause_round"("p_event" "uuid", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_pause_round"("p_event" "uuid", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_pause_round"("p_event" "uuid", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_pending_links"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_pending_links"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_reconcile"("p_external" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_dnfs" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_reconcile"("p_external" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_dnfs" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_restart_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_restart_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_restart_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_resume_round"("p_event" "uuid", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_resume_round"("p_event" "uuid", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_resume_round"("p_event" "uuid", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_set_finished_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_set_finished_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_snapshot"("p_event" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_snapshot"("p_event" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."community_snapshot"("p_event" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."community_snapshot"("p_event" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_standings"("p_event" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_standings"("p_event" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_start_event"("p_event" "uuid", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_start_event"("p_event" "uuid", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_start_event"("p_event" "uuid", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."community_start_next_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_start_next_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."community_start_next_round"("p_event" "uuid", "p_data" "jsonb", "p_revision" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_my_player_link"("p_bandai_name" "text", "p_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_my_player_link"("p_bandai_name" "text", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_my_player_link"("p_bandai_name" "text", "p_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_my_player_link_without_admin"("p_bandai_name" "text", "p_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_my_player_link_without_admin"("p_bandai_name" "text", "p_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."copy_community_deck"("p_source_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."copy_community_deck"("p_source_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."copy_community_deck"("p_source_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."copy_free_deck_to_result"("p_source_id" bigint, "p_result_id" "uuid", "p_replace" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."copy_free_deck_to_result"("p_source_id" bigint, "p_result_id" "uuid", "p_replace" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."copy_free_deck_to_result"("p_source_id" bigint, "p_result_id" "uuid", "p_replace" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."copy_free_deck_to_result"("p_source_id" bigint, "p_result_id" "uuid", "p_replace" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."correct_known_card_rarity"() TO "anon";
GRANT ALL ON FUNCTION "public"."correct_known_card_rarity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."correct_known_card_rarity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."default_format_banlist"() TO "anon";
GRANT ALL ON FUNCTION "public"."default_format_banlist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."default_format_banlist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."default_format_security"() TO "anon";
GRANT ALL ON FUNCTION "public"."default_format_security"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."default_format_security"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_community_deck"("p_decklist_id" bigint, "p_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_community_deck"("p_decklist_id" bigint, "p_updated_at" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_community_deck"("p_decklist_id" bigint, "p_updated_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_tournament_transaction"("p_tournament_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_tournament_transaction"("p_tournament_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_tournament_transaction"("p_tournament_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."digilab_normalize"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."digilab_normalize"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."digilab_normalize"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_single_default_format"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_single_default_format"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_single_default_format"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint, "p_outcome" "text", "p_details" "jsonb", "p_next_attempt" timestamp with time zone, "p_tournament_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_digilab_sync_item"("p_run_id" "uuid", "p_external_id" bigint, "p_outcome" "text", "p_details" "jsonb", "p_next_attempt" timestamp with time zone, "p_tournament_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_digilab_sync_run"("p_run_id" "uuid", "p_summary" "jsonb", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_digilab_sync_run"("p_run_id" "uuid", "p_summary" "jsonb", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_site_account_auth_erasure"("p_job_id" "uuid", "p_success" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_site_account_auth_erasure"("p_job_id" "uuid", "p_success" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_community_deck_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_community_deck_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_erasure_request_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_erasure_request_completion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_format_regulations"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_format_regulations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_format_regulations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_format_validation"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_format_validation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_format_validation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_pending_format_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_pending_format_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_pending_format_points"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_site_admin_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_site_admin_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_site_deck_ownership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_site_deck_ownership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_site_legal_activation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_site_legal_activation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_site_legal_document"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_site_legal_document"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_site_player_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_site_player_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_digilab_tournament_transaction"("p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_digilab_tournament_transaction"("p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_player_bandai"("p_bandai_id" "text", "p_bandai_nick" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_player_bandai"("p_bandai_id" "text", "p_bandai_nick" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_player_bandai"("p_bandai_id" "text", "p_bandai_nick" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_site_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_site_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_site_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_site_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_site_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_site_data"() TO "service_role";
GRANT ALL ON FUNCTION "public"."my_site_data"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."normalize_tournament_type_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_tournament_type_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_tournament_type_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_operational_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_operational_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_site_audit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_site_audit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_digilab_tournament_results"("p_tournament_id" bigint, "p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_digilab_tournament_results"("p_tournament_id" bigint, "p_digilab_tournament_id" bigint, "p_digilab_url" "text", "p_tournament" "jsonb", "p_results" "jsonb", "p_player_mappings" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_linked_player_deck_ownership"("p_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_linked_player_deck_ownership"("p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_deck_format_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_deck_format_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_deck_format_revision"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid", "p_actor_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_site_integration_event"("p_actor_user_id" "uuid", "p_operation" "text", "p_execution_id" "uuid", "p_status" integer, "p_parent_operation_id" "uuid", "p_actor_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_decklist_cards"("p_decklist_id" bigint, "p_cards" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_decklist_cards"("p_decklist_id" bigint, "p_cards" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_decklist_cards"("p_decklist_id" bigint, "p_cards" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_decklist_cards"("p_decklist_id" bigint, "p_cards" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_legacy_player_admins"("p_keep_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_legacy_player_admins"("p_keep_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_deck_draft"("p_decklist_id" bigint, "p_result_id" "uuid", "p_name" "text", "p_deck_format_id" bigint, "p_cards" "jsonb", "p_expected_revision" integer, "p_archetype_id" "uuid", "p_creator_player_id" "uuid", "p_partner_card_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_deck_draft"("p_decklist_id" bigint, "p_result_id" "uuid", "p_name" "text", "p_deck_format_id" bigint, "p_cards" "jsonb", "p_expected_revision" integer, "p_archetype_id" "uuid", "p_creator_player_id" "uuid", "p_partner_card_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_deck_draft"("p_decklist_id" bigint, "p_result_id" "uuid", "p_name" "text", "p_deck_format_id" bigint, "p_cards" "jsonb", "p_expected_revision" integer, "p_archetype_id" "uuid", "p_creator_player_id" "uuid", "p_partner_card_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_deck_draft"("p_decklist_id" bigint, "p_result_id" "uuid", "p_name" "text", "p_deck_format_id" bigint, "p_cards" "jsonb", "p_expected_revision" integer, "p_archetype_id" "uuid", "p_creator_player_id" "uuid", "p_partner_card_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_my_site_profile"("p_username" "text", "p_display_name" "text", "p_privacy_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_my_site_profile"("p_username" "text", "p_display_name" "text", "p_privacy_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_my_site_profile"("p_username" "text", "p_display_name" "text", "p_privacy_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_my_site_profile"("p_username" "text", "p_display_name" "text", "p_privacy_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_my_site_profile_legal"("p_username" "text", "p_display_name" "text", "p_terms_version" "text", "p_privacy_version" "text", "p_accept_terms" boolean, "p_ack_privacy" boolean, "p_declare_adult" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_my_site_profile_legal"("p_username" "text", "p_display_name" "text", "p_terms_version" "text", "p_privacy_version" "text", "p_accept_terms" boolean, "p_ack_privacy" boolean, "p_declare_adult" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."save_my_site_profile_legal"("p_username" "text", "p_display_name" "text", "p_terms_version" "text", "p_privacy_version" "text", "p_accept_terms" boolean, "p_ack_privacy" boolean, "p_declare_adult" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_tournament_transaction"("p_tournament_id" bigint, "p_tournament" "jsonb", "p_results" "jsonb", "p_ocr_files" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_tournament_transaction"("p_tournament_id" bigint, "p_tournament" "jsonb", "p_results" "jsonb", "p_ocr_files" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_tournament_transaction"("p_tournament_id" bigint, "p_tournament" "jsonb", "p_results" "jsonb", "p_ocr_files" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_tournament_transaction"("p_tournament_id" bigint, "p_tournament" "jsonb", "p_results" "jsonb", "p_ocr_files" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_bandai_players"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_bandai_players"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_bandai_players"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_player_digilab_name_default"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_player_digilab_name_default"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_player_digilab_name_default"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_account_erasure_target"("p_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_account_erasure_target"("p_job_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_account_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_account_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_account_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_account_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_accounts_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_accounts_enabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_accounts_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_accounts_enabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_active_admin_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_active_admin_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_actor_authorized"("p_user_id" "uuid", "p_require_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_actor_authorized"("p_user_id" "uuid", "p_require_admin" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_can_delete_community_deck"("p_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_can_delete_community_deck"("p_owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."site_can_delete_community_deck"("p_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_can_delete_community_deck"("p_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_can_edit_deck"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_can_edit_deck"("p_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."site_can_edit_deck"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_can_edit_deck"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_has_identity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_has_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_has_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_has_identity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_is_maintenance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_is_maintenance"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_is_maintenance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_is_maintenance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_is_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_is_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."site_is_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."site_is_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_legal_current"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_legal_current"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."site_legal_ready"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."site_legal_ready"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_digilab_sync_run"("p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_digilab_sync_run"("p_source" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_site_integration_event"("p_execution_id" "uuid", "p_operation" "text", "p_actor_user_id" "uuid", "p_parent_operation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_site_integration_event"("p_execution_id" "uuid", "p_operation" "text", "p_actor_user_id" "uuid", "p_parent_operation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_account_request"("p_type" "text", "p_player_id" "uuid", "p_decklist_id" bigint, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_account_request"("p_type" "text", "p_player_id" "uuid", "p_decklist_id" bigint, "p_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."submit_account_request"("p_type" "text", "p_player_id" "uuid", "p_decklist_id" bigint, "p_note" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_digilab_tournament_atomic"("p_external_id" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_player_mappings" "jsonb", "p_deck_mappings" "jsonb", "p_target_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_digilab_tournament_atomic"("p_external_id" bigint, "p_tournament" "jsonb", "p_standings" "jsonb", "p_player_mappings" "jsonb", "p_deck_mappings" "jsonb", "p_target_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_linked_player_deck_ownership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_linked_player_deck_ownership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_my_player_google_avatar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_my_player_google_avatar"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_my_player_google_avatar"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_player_admin_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_player_admin_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_profile_player_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_profile_player_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_tournament_date_to_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_tournament_date_to_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_tournament_date_to_results"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_site_profile"("p_username" "text", "p_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_site_profile"("p_username" "text", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_site_profile"("p_username" "text", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."valid_deck_draft_cards"("value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."valid_deck_draft_cards"("value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_deck_draft_cards"("value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."valid_format_rules"("value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."valid_format_rules"("value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_format_rules"("value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_decklist_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_decklist_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_decklist_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_tournament_team_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_tournament_team_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_tournament_team_results"() TO "service_role";



GRANT ALL ON TABLE "public"."account_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."account_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT SELECT("user_id") ON TABLE "public"."admin_users" TO "authenticated";



GRANT SELECT("username") ON TABLE "public"."admin_users" TO "authenticated";



GRANT SELECT("display_name") ON TABLE "public"."admin_users" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."admin_users" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."ban_list" TO "anon";
GRANT ALL ON TABLE "public"."ban_list" TO "authenticated";
GRANT ALL ON TABLE "public"."ban_list" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."card_portrait_settings" TO "anon";
GRANT ALL ON TABLE "public"."card_portrait_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."card_portrait_settings" TO "service_role";



GRANT ALL ON TABLE "public"."community_audit" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."community_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."community_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."community_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."community_entries" TO "service_role";



GRANT ALL ON TABLE "public"."community_events" TO "service_role";



GRANT ALL ON TABLE "public"."community_exports" TO "service_role";



GRANT ALL ON TABLE "public"."community_matches" TO "service_role";



GRANT ALL ON TABLE "public"."community_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."deck_families" TO "service_role";
GRANT SELECT ON TABLE "public"."deck_families" TO "anon";
GRANT SELECT ON TABLE "public"."deck_families" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."deck_format_rule_versions" TO "anon";
GRANT ALL ON TABLE "public"."deck_format_rule_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."deck_format_rule_versions" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."deck_format_rule_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deck_format_rule_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deck_format_rule_versions_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."deck_formats" TO "anon";
GRANT ALL ON TABLE "public"."deck_formats" TO "authenticated";
GRANT ALL ON TABLE "public"."deck_formats" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."deck_formats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deck_formats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deck_formats_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."deck_images" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deck_images" TO "authenticated";
GRANT ALL ON TABLE "public"."deck_images" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."decklist_card_metadata" TO "anon";
GRANT ALL ON TABLE "public"."decklist_card_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."decklist_card_metadata" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."decklist_cards" TO "anon";
GRANT ALL ON TABLE "public"."decklist_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."decklist_cards" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."decklist_cards_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."decklist_cards_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."decklist_cards_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."decklists" TO "anon";
GRANT ALL ON TABLE "public"."decklists" TO "authenticated";
GRANT ALL ON TABLE "public"."decklists" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."decklists_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."decklists_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."decklists_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."decks" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."decks" TO "authenticated";
GRANT ALL ON TABLE "public"."decks" TO "service_role";



GRANT ALL ON TABLE "public"."digilab_catalog_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."digilab_deck_catalog" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."digilab_deck_catalog" TO "authenticated";



GRANT ALL ON TABLE "public"."digilab_deck_sync" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."digilab_deck_sync" TO "authenticated";



GRANT ALL ON TABLE "public"."digilab_player_sync" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."digilab_player_sync" TO "authenticated";



GRANT ALL ON TABLE "public"."digilab_sync_events" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."digilab_sync_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."digilab_sync_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."digilab_sync_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."digilab_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."digilab_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_submissions" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."feedback_submissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."feedback_submissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."feedback_submissions_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."formats" TO "anon";
GRANT ALL ON TABLE "public"."formats" TO "authenticated";
GRANT ALL ON TABLE "public"."formats" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."formats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."formats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."formats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."player_admin_grants" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."site_account_erasure_jobs" TO "service_role";
GRANT SELECT ON TABLE "public"."site_account_erasure_jobs" TO "authenticated";



GRANT ALL ON TABLE "public"."site_legal_acceptances" TO "service_role";
GRANT SELECT ON TABLE "public"."site_legal_acceptances" TO "authenticated";



GRANT ALL ON TABLE "public"."site_legal_documents" TO "service_role";
GRANT SELECT ON TABLE "public"."site_legal_documents" TO "anon";
GRANT SELECT ON TABLE "public"."site_legal_documents" TO "authenticated";



GRANT ALL ON TABLE "public"."site_security_config" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."stores" TO "anon";
GRANT ALL ON TABLE "public"."stores" TO "authenticated";
GRANT ALL ON TABLE "public"."stores" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."tournament" TO "anon";
GRANT ALL ON TABLE "public"."tournament" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_digilab_sync" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT("tournament_id") ON TABLE "public"."tournament_digilab_sync" TO "anon";
GRANT SELECT("tournament_id") ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT("digilab_tournament_id") ON TABLE "public"."tournament_digilab_sync" TO "anon";
GRANT SELECT("digilab_tournament_id") ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT("digilab_url") ON TABLE "public"."tournament_digilab_sync" TO "anon";
GRANT SELECT("digilab_url") ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."tournament_digilab_sync" TO "anon";
GRANT SELECT("status") ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT("verified_at") ON TABLE "public"."tournament_digilab_sync" TO "anon";
GRANT SELECT("verified_at") ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT("last_checked_at") ON TABLE "public"."tournament_digilab_sync" TO "anon";
GRANT SELECT("last_checked_at") ON TABLE "public"."tournament_digilab_sync" TO "authenticated";



GRANT SELECT ON SEQUENCE "public"."tournament_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tournament_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tournament_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."tournament_ocr_files" TO "anon";
GRANT ALL ON TABLE "public"."tournament_ocr_files" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_ocr_files" TO "service_role";



GRANT SELECT ON SEQUENCE "public"."tournament_ocr_files_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tournament_ocr_files_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tournament_ocr_files_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."tournament_results" TO "anon";
GRANT ALL ON TABLE "public"."tournament_results" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_results" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."tournament_weekly_schedule" TO "anon";
GRANT ALL ON TABLE "public"."tournament_weekly_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_weekly_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."user_profiles" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_deck_color_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_deck_color_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_deck_color_stats" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_deck_family_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_deck_family_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_deck_family_stats" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_deck_pilot_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_deck_pilot_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_deck_pilot_stats" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_deck_rank" TO "anon";
GRANT ALL ON TABLE "public"."v_deck_rank" TO "authenticated";
GRANT ALL ON TABLE "public"."v_deck_rank" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_deck_representation" TO "anon";
GRANT ALL ON TABLE "public"."v_deck_representation" TO "authenticated";
GRANT ALL ON TABLE "public"."v_deck_representation" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_deck_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_deck_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_deck_stats" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_meta_by_month" TO "anon";
GRANT ALL ON TABLE "public"."v_meta_by_month" TO "authenticated";
GRANT ALL ON TABLE "public"."v_meta_by_month" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_monthly_ranking" TO "anon";
GRANT ALL ON TABLE "public"."v_monthly_ranking" TO "authenticated";
GRANT ALL ON TABLE "public"."v_monthly_ranking" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_player_points_by_month" TO "anon";
GRANT ALL ON TABLE "public"."v_player_points_by_month" TO "authenticated";
GRANT ALL ON TABLE "public"."v_player_points_by_month" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_player_ranking" TO "anon";
GRANT ALL ON TABLE "public"."v_player_ranking" TO "authenticated";
GRANT ALL ON TABLE "public"."v_player_ranking" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_podium" TO "anon";
GRANT ALL ON TABLE "public"."v_podium" TO "authenticated";
GRANT ALL ON TABLE "public"."v_podium" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_podium_full" TO "anon";
GRANT ALL ON TABLE "public"."v_podium_full" TO "authenticated";
GRANT ALL ON TABLE "public"."v_podium_full" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_stats_base" TO "anon";
GRANT ALL ON TABLE "public"."v_stats_base" TO "authenticated";
GRANT ALL ON TABLE "public"."v_stats_base" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_store_champions" TO "anon";
GRANT ALL ON TABLE "public"."v_store_champions" TO "authenticated";
GRANT ALL ON TABLE "public"."v_store_champions" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_top_cards_by_deck" TO "anon";
GRANT ALL ON TABLE "public"."v_top_cards_by_deck" TO "authenticated";
GRANT ALL ON TABLE "public"."v_top_cards_by_deck" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."v_top_cards_by_month" TO "anon";
GRANT ALL ON TABLE "public"."v_top_cards_by_month" TO "authenticated";
GRANT ALL ON TABLE "public"."v_top_cards_by_month" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







