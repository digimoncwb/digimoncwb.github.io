begin;

create schema if not exists site_audit;
revoke all on schema site_audit from public,anon,authenticated;

create table public.site_security_config (
    singleton boolean primary key default true check(singleton),
    accounts_enabled boolean not null default false,
    technical_contact text not null default 'Eduardo Lopes',
    support_email text not null default 'dulopes1997@gmail.com',
    privacy_url text,
    privacy_version text,
    audit_retention_days integer check(audit_retention_days between 30 and 3650),
    retention_reason text,
    updated_at timestamptz not null default now()
);
insert into public.site_security_config(singleton) values(true);
alter table public.site_security_config enable row level security;
revoke all on public.site_security_config from public,anon,authenticated;

create table public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete restrict,
    username text not null unique check(username=lower(username) and username ~ '^[a-z0-9_-]{3,40}$'),
    display_name text not null check(length(btrim(display_name)) between 1 and 100),
    player_id uuid unique references public.players(id) on delete restrict,
    status text not null default 'active' check(status in ('active','blocked','closed')),
    privacy_version text,
    privacy_acknowledged_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public,anon,authenticated;

create table site_audit.events (
    event_id bigint generated always as identity primary key,
    occurred_at timestamptz not null default clock_timestamp(),
    actor_user_id uuid,
    actor_kind text not null,
    action text not null,
    entity_type text not null,
    entity_id text,
    changes jsonb not null default '{}',
    operation_id text not null default txid_current()::text,
    outcome text not null default 'success' check(outcome in ('success','denied','failure')),
    schema_version integer not null default 1
);
create index audit_time on site_audit.events(occurred_at desc,event_id desc);
create index audit_entity on site_audit.events(entity_type,entity_id,occurred_at desc);
create index audit_actor on site_audit.events(actor_user_id,occurred_at desc);
revoke all on site_audit.events from public,anon,authenticated;
alter table site_audit.events enable row level security;

create or replace function public.site_accounts_enabled() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select accounts_enabled from public.site_security_config where singleton
$$;
create or replace function public.site_has_identity() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
        where p.user_id=auth.uid() and p.status='active' and u.email_confirmed_at is not null
        and (not public.site_accounts_enabled() or u.email not like '%@admin.digistats.local'))
$$;
create or replace function public.site_is_member() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select public.site_has_identity() and (not public.site_accounts_enabled() or exists(
        select 1 from public.user_profiles p cross join public.site_security_config c
        where p.user_id=auth.uid() and p.privacy_version=c.privacy_version and c.privacy_version is not null))
$$;
create or replace function public.site_is_admin() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select public.site_is_member() and exists(select 1 from public.admin_users where user_id=auth.uid())
$$;
create or replace function public.site_is_maintenance() returns boolean
language sql stable set search_path=pg_catalog,public as $$
    select coalesce(auth.role(),'')='service_role'
        or (auth.role() is null and session_user in ('postgres','supabase_admin'))
$$;
revoke all on function public.site_is_maintenance() from public;
grant execute on function public.site_is_maintenance() to anon,authenticated,service_role;

-- Triggers also cover legacy SECURITY DEFINER RPCs, which can bypass RLS.
create or replace function public.guard_site_admin_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if public.site_accounts_enabled() and not public.site_is_maintenance() and not public.site_is_admin() then
        raise exception 'Acesso administrativo necessário.' using errcode='42501';
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_site_admin_write() from public,anon,authenticated;

create or replace function site_audit.record(p_action text,p_type text,p_id text,p_changes jsonb default '{}') returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); operation text:=txid_current()::text; headers jsonb;
begin
    if auth.role()='service_role' then
        headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
        if (headers->>'x-site-operation-id') ~ '^[0-9a-f-]{36}$' then operation:=headers->>'x-site-operation-id'; end if;
        if (headers->>'x-site-actor-id') ~ '^[0-9a-f-]{36}$' then actor:=(headers->>'x-site-actor-id')::uuid; end if;
    end if;
    insert into site_audit.events(actor_user_id,actor_kind,action,entity_type,entity_id,changes,operation_id)
    values(actor,case when actor is not null then 'user' when auth.role()='service_role' then 'service' when auth.role()='anon' then 'anonymous' else 'maintenance' end,
        p_action,p_type,p_id,p_changes,operation);
end;
$$;
revoke all on function site_audit.record(text,text,text,jsonb) from public,anon,authenticated;

create or replace function site_audit.capture() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare before_row jsonb; after_row jsonb; changes jsonb='{}'; field text; identifier text;
begin
    if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
    if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
    identifier:=coalesce(after_row->>'id',before_row->>'id',after_row->>'user_id',before_row->>'user_id',after_row->>'player_id',before_row->>'player_id',after_row->>'tournament_id',before_row->>'tournament_id',after_row->>'deck_id',before_row->>'deck_id',after_row->>'card_code',before_row->>'card_code',after_row->>'digilab_archetype_id',before_row->>'digilab_archetype_id',after_row->>'singleton',before_row->>'singleton');
    foreach field in array tg_argv loop
        if (before_row->field) is distinct from (after_row->field) then
            changes:=changes||jsonb_build_object(field,jsonb_build_object('before',before_row->field,'after',after_row->field));
        end if;
    end loop;
    -- Unknown/private fields are recorded by name only, never by copying their values.
    for field in select jsonb_object_keys(coalesce(after_row,before_row)) loop
        if not(field=any(tg_argv)) and field not in ('created_at','updated_at') and (before_row->field) is distinct from (after_row->field) then
            changes:=changes||jsonb_build_object(field,jsonb_build_object('changed',true));
        end if;
    end loop;
    if changes<>'{}'::jsonb or tg_op<>'UPDATE' then
        perform site_audit.record(lower(tg_table_name)||'.'||lower(tg_op),tg_table_name,identifier,changes);
    end if;
    if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function site_audit.capture() from public,anon,authenticated;

create or replace function public.bootstrap_user_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    insert into public.user_profiles(user_id,username,display_name)
    values(new.id,'u_'||replace(new.id::text,'-',''),
        left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Novo usuário'),100))
    on conflict(user_id) do nothing;
    return new;
end;
$$;
revoke all on function public.bootstrap_user_profile() from public,anon,authenticated;
create trigger site_bootstrap_user after insert on auth.users for each row execute function public.bootstrap_user_profile();
insert into public.user_profiles(user_id,username,display_name)
select u.id,'u_'||replace(u.id::text,'-',''),left(coalesce(nullif(a.display_name,''),'Usuário existente'),100)
from auth.users u left join public.admin_users a on a.user_id=u.id on conflict(user_id) do nothing;

create policy own_profile on public.user_profiles for select to authenticated
using(user_id=auth.uid() or public.site_is_admin());
grant select on public.user_profiles to authenticated;

create or replace function public.site_account_status() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
    select jsonb_build_object('enabled',accounts_enabled,'technical_contact',technical_contact,'support_email',support_email,
        'privacy_url',privacy_url,'privacy_version',privacy_version,'audit_retention_days',audit_retention_days)
    from public.site_security_config where singleton
$$;
create or replace function public.my_site_account() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
    select jsonb_build_object('profile',to_jsonb(p),'is_admin',public.site_is_admin(),'is_member',public.site_is_member())
    from public.user_profiles p where user_id=auth.uid()
$$;
create or replace function public.save_my_site_profile(p_username text,p_display_name text,p_privacy_version text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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

create table public.account_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete restrict,
    request_type text not null check(request_type in ('player_link','deck_claim','data_access','correction','erasure','account_closure')),
    player_id uuid references public.players(id) on delete restrict,
    decklist_id bigint references public.decklists(id) on delete set null,
    note text not null default '' check(length(note)<=1000),
    status text not null default 'pending' check(status in ('pending','approved','rejected','completed')),
    reviewed_by uuid references public.user_profiles(user_id),
    review_note text check(length(review_note)<=1000),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
);
create unique index one_pending_account_request on public.account_requests(user_id,request_type)
    where status='pending';
alter table public.account_requests enable row level security;
revoke all on public.account_requests from public,anon,authenticated;
create policy own_account_requests on public.account_requests for select to authenticated using(user_id=auth.uid() or public.site_is_admin());
grant select on public.account_requests to authenticated;

alter table public.decklists
    add column if not exists owner_user_id uuid references public.user_profiles(user_id) on delete restrict,
    add column if not exists created_by_user_id uuid references public.user_profiles(user_id) on delete restrict,
    add column if not exists updated_by_user_id uuid references public.user_profiles(user_id) on delete restrict;
create index if not exists community_deck_owner on public.decklists(owner_user_id) where tournament_result_id is null;

create or replace function public.guard_site_deck_ownership() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); admin boolean:=public.site_is_admin(); enabled boolean:=public.site_accounts_enabled();
begin
    if not public.site_is_maintenance() then
        if enabled and not public.site_is_member() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
        if tg_op='INSERT' then
            if enabled and new.tournament_result_id is not null and not admin then raise exception 'Somente administradores podem alterar listas de torneios.' using errcode='42501'; end if;
            if new.owner_user_id is not null and new.owner_user_id is distinct from actor then raise exception 'Proprietário inválido.' using errcode='42501'; end if;
            new.owner_user_id:=case when new.tournament_result_id is null then actor else null end;
            new.created_by_user_id:=actor;
            new.updated_by_user_id:=actor;
        else
            if enabled and not admin and (old.tournament_result_id is not null or old.owner_user_id is distinct from actor) then
                raise exception 'Você não pode alterar este deck.' using errcode='42501';
            end if;
            if tg_op='UPDATE' then
                if new.created_by_user_id is distinct from old.created_by_user_id then raise exception 'O responsável original não pode ser alterado.' using errcode='42501'; end if;
                if new.owner_user_id is distinct from old.owner_user_id and
                    (not admin or coalesce(current_setting('app.site_owner_transfer',true),'')<>'approved') then
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
revoke all on function public.guard_site_deck_ownership() from public,anon,authenticated;
create trigger site_deck_ownership before insert or update or delete on public.decklists
for each row execute function public.guard_site_deck_ownership();

-- Restrictive policies intersect with old permissive policies; installing this migration
-- does not close the existing site until accounts_enabled is explicitly activated.
create policy site_deck_insert on public.decklists as restrictive for insert to anon,authenticated
with check(not public.site_accounts_enabled() or (public.site_is_member() and
    ((tournament_result_id is null and owner_user_id=auth.uid()) or public.site_is_admin())));
create policy site_deck_update on public.decklists as restrictive for update to anon,authenticated
using(not public.site_accounts_enabled() or (public.site_is_member() and
    ((tournament_result_id is null and owner_user_id=auth.uid()) or public.site_is_admin())))
with check(not public.site_accounts_enabled() or (public.site_is_member() and
    ((tournament_result_id is null and owner_user_id=auth.uid()) or public.site_is_admin())));
create policy site_deck_delete on public.decklists as restrictive for delete to anon,authenticated
using(not public.site_accounts_enabled() or (public.site_is_member() and
    ((tournament_result_id is null and owner_user_id=auth.uid()) or public.site_is_admin())));
create policy account_deck_access on public.decklists for all to authenticated
using(public.site_is_member() and (owner_user_id=auth.uid() or public.site_is_admin()))
with check(public.site_is_member() and (owner_user_id=auth.uid() or public.site_is_admin()));
create policy authenticated_deck_read on public.decklists for select to authenticated using(true);
grant select,insert,update,delete on public.decklists to authenticated;
drop policy if exists "Keep free decks" on public.decklists;
create policy "Keep free decks" on public.decklists as restrictive for delete to anon,authenticated
using(tournament_result_id is not null or (public.site_accounts_enabled() and public.site_is_member() and
    (owner_user_id=auth.uid() or public.site_is_admin())));

create or replace function public.site_can_edit_deck(p_id bigint) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select not public.site_accounts_enabled() or exists(select 1 from public.decklists where id=p_id and public.site_is_member()
        and (public.site_is_admin() or (tournament_result_id is null and owner_user_id=auth.uid())))
$$;
create policy site_cards_insert on public.decklist_cards as restrictive for insert to anon,authenticated with check(public.site_can_edit_deck(decklist_id));
create policy site_cards_update on public.decklist_cards as restrictive for update to anon,authenticated using(public.site_can_edit_deck(decklist_id)) with check(public.site_can_edit_deck(decklist_id));
create policy site_cards_delete on public.decklist_cards as restrictive for delete to anon,authenticated using(public.site_can_edit_deck(decklist_id));
create policy account_cards_access on public.decklist_cards for all to authenticated
using(public.site_can_edit_deck(decklist_id) and public.site_is_member()) with check(public.site_can_edit_deck(decklist_id) and public.site_is_member());
create policy account_cards_read on public.decklist_cards for select to authenticated using(true);
grant select,insert,update,delete on public.decklist_cards to authenticated;

-- Existing business records remain readable. Writes become admin-only at activation.
do $$
declare table_name text; command text;
begin
    foreach table_name in array array['players','stores','decks','deck_images','deck_families','formats','deck_formats','ban_list','tournament','tournament_results','tournament_schedule','card_portrait_settings'] loop
        if to_regclass('public.'||table_name) is not null then
            execute format('alter table public.%I enable row level security',table_name);
            execute format('create trigger site_admin_write before insert or update or delete on public.%I for each row execute function public.guard_site_admin_write()',table_name);
            foreach command in array array['insert','update','delete'] loop
                execute format('create policy %I on public.%I as restrictive for %s to anon,authenticated %s',
                    'site_'||command,table_name,command,
                    case when command='insert' then 'with check(not public.site_accounts_enabled() or public.site_is_admin())'
                    when command='update' then 'using(not public.site_accounts_enabled() or public.site_is_admin()) with check(not public.site_accounts_enabled() or public.site_is_admin())'
                    else 'using(not public.site_accounts_enabled() or public.site_is_admin())' end);
            end loop;
            execute format('create policy site_admin_access on public.%I for all to authenticated using(public.site_is_admin()) with check(public.site_is_admin())',table_name);
            execute format('create policy site_member_read on public.%I for select to authenticated using(true)',table_name);
            execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
        end if;
    end loop;
end;
$$;

-- Auditing uses an explicit field allowlist, never full Auth rows, passwords or tokens.
do $$
declare table_name text;
begin
    foreach table_name in array array['user_profiles','admin_users','site_security_config','account_requests','players','stores','decks','deck_images','deck_families','formats','deck_formats','ban_list','tournament','tournament_results','decklists','decklist_cards','tournament_schedule','card_portrait_settings'] loop
        if to_regclass('public.'||table_name) is not null then
            execute format($f$create trigger site_audit_change after insert or update or delete on public.%I for each row execute function site_audit.capture(
                'username','display_name','player_id','status','privacy_version','user_id','request_type','reviewed_by',
                'name','code','is_active','owner_user_id','creator_player_id','created_by_user_id','updated_by_user_id',
                'draft_revision','draft_cards','deck_format_id','archetype_id','rules_status','validation_rules','rules_revision',
                'tournament_id','tournament_result_id','store_id','tournament_date','placement','deck_id','match_points',
                'card_code','qty','position','restriction','accounts_enabled','privacy_url','audit_retention_days','retention_reason')$f$,table_name);
        end if;
    end loop;
end;
$$;

revoke all on function public.site_accounts_enabled(),public.site_has_identity(),public.site_is_member(),public.site_is_admin(),public.site_can_edit_deck(bigint),public.site_account_status(),public.my_site_account(),public.save_my_site_profile(text,text,text) from public;
grant execute on function public.site_accounts_enabled(),public.site_has_identity(),public.site_is_member(),public.site_is_admin(),public.site_can_edit_deck(bigint),public.site_account_status() to anon,authenticated;
grant execute on function public.site_accounts_enabled(),public.site_account_status() to service_role;
grant execute on function public.my_site_account(),public.save_my_site_profile(text,text,text) to authenticated;

commit;
