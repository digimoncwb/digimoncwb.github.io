begin;

create table site_audit.exports (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now()+interval '15 minutes',
    filters jsonb not null,
    upper_event_id bigint not null,
    expected_rows integer not null,
    stage text not null default 'reading' check(stage in ('reading','prepared','aborted'))
);
revoke all on site_audit.exports from public,anon,authenticated;
alter table site_audit.exports enable row level security;

create function public.admin_begin_audit_export(p_entity text default '',p_entity_id text default '',p_actor uuid default null,p_action text default '',
    p_from timestamptz default null,p_to timestamptz default null,p_outcome text default '',p_operation text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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
create function public.admin_audit_export_page(p_export_id uuid,p_cursor bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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
create function public.admin_finish_audit_export(p_export_id uuid,p_rows integer,p_aborted boolean default false) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
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

revoke all on function public.admin_begin_audit_export(text,text,uuid,text,timestamptz,timestamptz,text,text),
    public.admin_audit_export_page(uuid,bigint),public.admin_finish_audit_export(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_begin_audit_export(text,text,uuid,text,timestamptz,timestamptz,text,text),
    public.admin_audit_export_page(uuid,bigint),public.admin_finish_audit_export(uuid,integer,boolean) to authenticated;

commit;
