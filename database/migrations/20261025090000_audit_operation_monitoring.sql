begin;

create table site_audit.integration_runs (
    operation_id uuid primary key,
    parent_operation_id uuid,
    operation text not null,
    actor_user_id uuid,
    started_at timestamptz not null default clock_timestamp(),
    finished_at timestamptz,
    http_status integer
);
create index integration_run_started on site_audit.integration_runs(started_at desc);
create table site_audit.monitor_checks (
    id bigint generated always as identity primary key,
    checked_at timestamptz not null default clock_timestamp(),
    severity text not null,
    metrics jsonb not null
);
create table site_audit.provider_reviews (
    source text primary key check(source in ('auth','api')),
    reviewed_at timestamptz not null default now(),
    reviewed_by uuid not null,
    note text not null check(length(btrim(note)) between 10 and 500)
);
create table site_audit.monitor_installation (singleton boolean primary key default true check(singleton),installed_at timestamptz not null default now());
insert into site_audit.monitor_installation(singleton) values(true);
revoke all on site_audit.integration_runs,site_audit.monitor_checks,site_audit.provider_reviews,site_audit.monitor_installation from public,anon,authenticated;
alter table site_audit.integration_runs enable row level security;
alter table site_audit.monitor_checks enable row level security;
alter table site_audit.provider_reviews enable row level security;
alter table site_audit.monitor_installation enable row level security;

create function public.start_site_integration_event(p_execution_id uuid,p_operation text,p_actor_user_id uuid,p_parent_operation_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    if p_operation !~ '^[a-z0-9-]{1,80}$' then raise exception 'Operação inválida.'; end if;
    insert into site_audit.integration_runs(operation_id,parent_operation_id,operation,actor_user_id)
    values(p_execution_id,p_parent_operation_id,p_operation,p_actor_user_id);
end;
$$;
create function public.record_site_integration_event(p_actor_user_id uuid,p_operation text,p_execution_id uuid,p_status integer,p_parent_operation_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    if p_operation !~ '^[a-z0-9-]{1,80}$' or p_status not between 100 and 599 then raise exception 'Evento inválido.'; end if;
    insert into site_audit.integration_runs(operation_id,parent_operation_id,operation,actor_user_id,finished_at,http_status)
    values(p_execution_id,p_parent_operation_id,p_operation,p_actor_user_id,clock_timestamp(),p_status)
    on conflict(operation_id) do update set finished_at=excluded.finished_at,http_status=excluded.http_status;
    perform site_audit.record('integration.'||p_operation,'integration',p_execution_id::text,
        jsonb_build_object('http_status',p_status,'parent_operation_id',p_parent_operation_id));
    update site_audit.events set actor_user_id=p_actor_user_id,
        actor_kind=case when p_actor_user_id is not null then 'user' when p_status in (401,403) then 'anonymous' else 'service' end,
        operation_id=p_execution_id::text,outcome=case when p_status in (401,403) then 'denied' when p_status>=400 then 'failure' else 'success' end
        where event_id=currval(pg_get_serial_sequence('site_audit.events','event_id'));
end;
$$;
-- Preserve calls made by already deployed functions while rolling out the wrapper.
create or replace function public.record_site_integration_event(p_actor_user_id uuid,p_operation text,p_execution_id uuid,p_status integer) returns void
language sql security definer set search_path=pg_catalog,public as $$
    select public.record_site_integration_event(p_actor_user_id,p_operation,p_execution_id,p_status,null)
$$;

create function site_audit.health_snapshot() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare missing integer; failed integer; stalled integer; last_event timestamptz; last_retention timestamptz;
    scheduled boolean:=false; last_job_success timestamptz; installed timestamptz; reviews jsonb; severity text:='ok';
begin
    select installed_at into installed from site_audit.monitor_installation where singleton;
    select count(*) into missing from (values
        ('public.decklists','site_audit_change'),('public.user_profiles','site_audit_change'),
        ('public.admin_users','site_audit_change'),('public.tournament','site_audit_change'),
        ('public.players','site_audit_change'),('storage.objects','site_storage_audit')
    ) required(relation,trigger_name) where to_regclass(relation) is not null and not exists(
        select 1 from pg_trigger where tgrelid=to_regclass(relation) and tgname=trigger_name and tgenabled<>'D');
    select count(*) into failed from site_audit.integration_runs where started_at>now()-interval '24 hours' and http_status>=500;
    select count(*) into stalled from site_audit.integration_runs where finished_at is null and started_at<now()-interval '30 minutes';
    select max(occurred_at) into last_event from site_audit.events;
    select max(occurred_at) into last_retention from site_audit.events where action='audit.retention_applied';
    if to_regclass('cron.job') is not null then
        execute 'select exists(select 1 from cron.job where jobname=''site-audit-retention'' and active)' into scheduled;
        if to_regclass('cron.job_run_details') is not null then
            execute 'select max(end_time) from cron.job_run_details where status=''succeeded'' and jobid in(select jobid from cron.job where jobname=''site-audit-retention'')' into last_job_success;
        end if;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('source',source,'reviewed_at',reviewed_at,'reviewed_by',reviewed_by)),'[]') into reviews from site_audit.provider_reviews;
    if missing>0 then severity:='critical';
    elsif stalled>0 or failed>0 or not scheduled or (installed<now()-interval '48 hours' and coalesce(last_retention,installed)<now()-interval '48 hours') then severity:='warning'; end if;
    return jsonb_build_object('checked_at',clock_timestamp(),'severity',severity,'missing_triggers',missing,'failed_integrations_24h',failed,
        'stalled_integrations',stalled,'last_event_at',last_event,'last_retention_at',last_retention,'retention_job_active',scheduled,
        'retention_job_last_success',last_job_success,'provider_reviews',reviews,'auth_log_source_available',to_regclass('auth.audit_log_entries') is not null,
        'api_log_ingestion_configured',false,'external_alert_delivery_configured',false);
end;
$$;
revoke all on function site_audit.health_snapshot() from public,anon,authenticated;

create function public.collect_site_audit_health() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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
create function public.admin_site_audit_health() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare report jsonb;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    report:=site_audit.health_snapshot()||jsonb_build_object('recent_checks',(select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from (
        select checked_at,severity from site_audit.monitor_checks order by checked_at desc limit 12) rows));
    perform site_audit.record('audit.health_viewed','audit_monitor',null,'{}');
    return report;
end;
$$;
create function public.admin_record_audit_provider_review(p_source text,p_note text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    insert into site_audit.provider_reviews(source,reviewed_by,note) values(p_source,auth.uid(),p_note)
    on conflict(source) do update set reviewed_at=now(),reviewed_by=auth.uid(),note=excluded.note;
    perform site_audit.record('audit.provider_reviewed','audit_monitor',p_source,'{}');
end;
$$;
revoke all on function public.start_site_integration_event(uuid,text,uuid,uuid),public.record_site_integration_event(uuid,text,uuid,integer,uuid),
    public.collect_site_audit_health(),public.admin_site_audit_health(),public.admin_record_audit_provider_review(text,text) from public,anon,authenticated;
grant execute on function public.start_site_integration_event(uuid,text,uuid,uuid),public.record_site_integration_event(uuid,text,uuid,integer,uuid),public.collect_site_audit_health() to service_role;
grant execute on function public.admin_site_audit_health(),public.admin_record_audit_provider_review(text,text) to authenticated;

do $$ declare job record; begin
    if exists(select 1 from pg_extension where extname='pg_cron') then
        for job in select jobid from cron.job where jobname='site-audit-monitor' loop perform cron.unschedule(job.jobid); end loop;
        perform cron.schedule('site-audit-monitor','*/15 * * * *','select public.collect_site_audit_health()');
    end if;
end; $$;

create or replace function public.admin_audit_events(p_entity text default '',p_entity_id text default '',p_actor uuid default null,p_action text default '',p_from timestamptz default null,p_to timestamptz default null,p_offset integer default 0,p_export boolean default false,p_outcome text default '',p_operation text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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


commit;
