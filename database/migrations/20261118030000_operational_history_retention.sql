-- Retention for operational history that grew without limit (November database audit):
-- the DigiLab sync history runs every 15 minutes (~35k runs a year) and pg_cron keeps
-- every job run. Keep 90 days of sync history and 30 days of scheduler logs.

begin;

create or replace function public.purge_operational_history()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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

revoke all on function public.purge_operational_history() from public, anon, authenticated;
grant execute on function public.purge_operational_history() to service_role;

do $$
declare job record;
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        for job in select jobid from cron.job where jobname = 'operational-history-retention' loop
            perform cron.unschedule(job.jobid);
        end loop;
        perform cron.schedule(
            'operational-history-retention',
            '35 4 * * *',
            'select public.purge_operational_history()'
        );
    end if;
end;
$$;

commit;
