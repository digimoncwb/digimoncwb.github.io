begin;

create or replace function site_audit.health_snapshot() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare missing integer; failed integer; unresolved integer; stalled integer; last_event timestamptz; last_retention timestamptz;
    scheduled boolean:=false; last_job_success timestamptz; installed timestamptz; reviews jsonb; severity text:='ok';
begin
    select installed_at into installed from site_audit.monitor_installation where singleton;
    select count(*) into missing from (values
        ('public.decklists','site_audit_change'),('public.user_profiles','site_audit_change'),
        ('public.admin_users','site_audit_change'),('public.tournament','site_audit_change'),
        ('public.players','site_audit_change'),('storage.objects','site_storage_audit')
    ) required(relation,trigger_name) where to_regclass(relation) is not null and not exists(
        select 1 from pg_trigger where tgrelid=to_regclass(relation) and tgname=trigger_name and tgenabled<>'D');
    -- Only the scheduled global catalog snapshot has a known recovery scope.
    -- A later success for a different operation, actor or overlapping run does
    -- not prove recovery. Keep every historical failure in the raw count.
    with failures as (
        select exists(
            select 1 from site_audit.integration_runs recovered
            where failed.operation='digilab-deck-catalog'
                and failed.actor_user_id is null and failed.parent_operation_id is null
                and recovered.operation=failed.operation
                and recovered.actor_user_id is null and recovered.parent_operation_id is null
                and recovered.http_status between 200 and 299
                and recovered.started_at>failed.finished_at
                and recovered.finished_at>=recovered.started_at
        ) as recovered
        from site_audit.integration_runs failed
        where failed.started_at>now()-interval '24 hours' and failed.http_status>=500
    ) select count(*),count(*) filter(where not recovered) into failed,unresolved from failures;
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
    elsif stalled>0 or unresolved>0 or not scheduled or (installed<now()-interval '48 hours' and coalesce(last_retention,installed)<now()-interval '48 hours') then severity:='warning'; end if;
    return jsonb_build_object('checked_at',clock_timestamp(),'severity',severity,'missing_triggers',missing,'failed_integrations_24h',failed,
        'unresolved_failed_integrations_24h',unresolved,'recovered_failed_integrations_24h',failed-unresolved,
        'stalled_integrations',stalled,'last_event_at',last_event,'last_retention_at',last_retention,'retention_job_active',scheduled,
        'retention_job_last_success',last_job_success,'provider_reviews',reviews,'auth_log_source_available',to_regclass('auth.audit_log_entries') is not null,
        'api_log_ingestion_configured',false,'external_alert_delivery_configured',false);
end;
$$;

commit;
