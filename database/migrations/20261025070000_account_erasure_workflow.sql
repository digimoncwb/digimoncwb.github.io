begin;

-- Keep a pseudonymous application identity for historical foreign keys while
-- allowing the provider to remove credentials. No historical rows cascade.
alter table public.user_profiles add column auth_user_id uuid unique references auth.users(id) on delete set null,
    add column anonymized_at timestamptz;
update public.user_profiles set auth_user_id=user_id;
alter table public.user_profiles drop constraint user_profiles_user_id_fkey;

create or replace function public.bootstrap_user_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    insert into public.user_profiles(user_id,auth_user_id,username,display_name)
    values(new.id,new.id,'u_'||replace(new.id::text,'-',''),
        left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Novo usuário'),100))
    on conflict(user_id) do nothing;
    return new;
end;
$$;

create table public.site_account_erasure_jobs (
    id uuid primary key default gen_random_uuid(),
    request_id uuid not null unique references public.account_requests(id),
    user_id uuid not null references public.user_profiles(user_id),
    prepared_by uuid not null references public.user_profiles(user_id),
    public_data_action text not null check(public_data_action in ('anonymize_linked_player','preserve_reviewed_history')),
    stage text not null default 'prepared' check(stage in ('prepared','auth_deleted','completed','failed')),
    reason text not null check(length(btrim(reason)) between 10 and 500),
    error_code text,
    prepared_at timestamptz not null default now(),
    auth_deleted_at timestamptz,
    completed_at timestamptz,
    external_reviewed_at timestamptz,
    completed_by uuid references public.user_profiles(user_id)
);
alter table public.site_account_erasure_jobs enable row level security;
revoke all on public.site_account_erasure_jobs from public,anon,authenticated;
grant select on public.site_account_erasure_jobs to authenticated;
create policy own_erasure_job on public.site_account_erasure_jobs for select to authenticated
using(user_id=auth.uid() or public.site_is_admin());
create trigger site_erasure_job_audit after insert or update on public.site_account_erasure_jobs
for each row execute function site_audit.capture('user_id','request_id','prepared_by','public_data_action','stage','error_code','completed_by');

create function public.admin_prepare_account_erasure(p_request_id uuid,p_public_data_action text,p_reason text,p_reviewed boolean) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
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
$$;

create function public.site_account_erasure_target(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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
create function public.finish_site_account_auth_erasure(p_job_id uuid,p_success boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
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
create function public.admin_complete_account_erasure(p_job_id uuid,p_external_reviewed boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
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

create function public.guard_erasure_request_completion() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if new.request_type='erasure' and new.status in ('approved','completed') and not exists(
        select 1 from public.site_account_erasure_jobs where request_id=new.id and stage='completed') then
        raise exception 'Use o procedimento de eliminação e conclua a revisão externa antes de encerrar esta solicitação.';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_erasure_request_completion() from public,anon,authenticated;
create trigger guard_erasure_completion before update on public.account_requests for each row execute function public.guard_erasure_request_completion();

revoke all on function public.admin_prepare_account_erasure(uuid,text,text,boolean),public.admin_complete_account_erasure(uuid,boolean),
    public.site_account_erasure_target(uuid),public.finish_site_account_auth_erasure(uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_prepare_account_erasure(uuid,text,text,boolean),public.admin_complete_account_erasure(uuid,boolean) to authenticated;
grant execute on function public.site_account_erasure_target(uuid),public.finish_site_account_auth_erasure(uuid,boolean) to service_role;

commit;
