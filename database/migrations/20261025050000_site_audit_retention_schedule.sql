begin;

-- The existing DigiLab worker already uses pg_cron in production. Install no
-- extension implicitly: installations without it use the documented scheduler.
do $$
declare job record;
begin
    if exists(select 1 from pg_extension where extname='pg_cron') then
        for job in select jobid from cron.job where jobname='site-audit-retention' loop
            perform cron.unschedule(job.jobid);
        end loop;
        perform cron.schedule('site-audit-retention','20 4 * * *',
            'select public.purge_site_audit() where exists (select 1 from public.site_security_config where singleton and audit_retention_days is not null)');
    end if;
end;
$$;

commit;
