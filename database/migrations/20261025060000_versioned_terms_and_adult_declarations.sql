begin;

alter table public.site_security_config add column terms_url text, add column terms_version text;
alter table public.user_profiles add column terms_version text, add column terms_accepted_at timestamptz,
    add column adult_declared_at timestamptz, add column legal_acceptance_id uuid;

create table public.site_legal_documents (
    kind text not null check(kind in ('terms','privacy')),
    version text not null check(length(btrim(version)) between 1 and 50),
    url text not null check(url ~ '^https://[^[:space:]]+$'),
    body text not null check(length(btrim(body)) between 30 and 200000),
    sha256 text not null check(sha256=encode(pg_catalog.sha256(convert_to(body,'UTF8')),'hex')),
    published_at timestamptz not null default now(),
    published_by uuid references public.user_profiles(user_id),
    primary key(kind,version)
);
alter table public.site_legal_documents enable row level security;
revoke all on public.site_legal_documents from public,anon,authenticated;
grant select on public.site_legal_documents to anon,authenticated;
create policy legal_document_read on public.site_legal_documents for select to anon,authenticated using(true);

create table public.site_legal_acceptances (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id),
    terms_version text not null,
    privacy_version text not null,
    terms_sha256 text not null,
    privacy_sha256 text not null,
    declared_adult boolean not null check(declared_adult),
    declaration_method text not null default 'self_declaration' check(declaration_method='self_declaration'),
    accepted_at timestamptz not null default now()
);
create index legal_acceptance_user on public.site_legal_acceptances(user_id,accepted_at desc);
alter table public.site_legal_acceptances enable row level security;
revoke all on public.site_legal_acceptances from public,anon,authenticated;
grant select on public.site_legal_acceptances to authenticated;
create policy legal_acceptance_read on public.site_legal_acceptances for select to authenticated
using(user_id=auth.uid() or public.site_is_admin());
alter table public.user_profiles add constraint profile_legal_acceptance_fk
foreign key(legal_acceptance_id) references public.site_legal_acceptances(id);

create function public.guard_site_legal_document() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Uma versão publicada é imutável. Publique uma nova versão.' using errcode='42501'; end;
$$;
revoke all on function public.guard_site_legal_document() from public,anon,authenticated;
create trigger immutable_legal_document before update or delete on public.site_legal_documents
for each row execute function public.guard_site_legal_document();
create trigger site_legal_document_audit after insert on public.site_legal_documents
for each row execute function site_audit.capture('kind','version','url','sha256','published_by');
create trigger site_legal_acceptance_audit after insert on public.site_legal_acceptances
for each row execute function site_audit.capture('user_id','terms_version','privacy_version','terms_sha256','privacy_sha256','declared_adult','declaration_method');

create function public.site_legal_ready() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select exists(select 1 from public.site_security_config c
        join public.site_legal_documents t on t.kind='terms' and t.version=c.terms_version and t.url=c.terms_url
        join public.site_legal_documents p on p.kind='privacy' and p.version=c.privacy_version and p.url=c.privacy_url where c.singleton)
$$;
create function public.site_legal_current(p_user_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select exists(select 1 from public.user_profiles u
        join public.site_legal_acceptances a on a.id=u.legal_acceptance_id and a.user_id=u.user_id
        cross join public.site_security_config c
        join public.site_legal_documents t on t.kind='terms' and t.version=c.terms_version and t.url=c.terms_url
        join public.site_legal_documents p on p.kind='privacy' and p.version=c.privacy_version and p.url=c.privacy_url
        where u.user_id=p_user_id and a.declared_adult and u.adult_declared_at is not null
        and a.terms_version=t.version and a.privacy_version=p.version and a.terms_sha256=t.sha256 and a.privacy_sha256=p.sha256)
$$;
revoke all on function public.site_legal_ready(),public.site_legal_current(uuid) from public,anon,authenticated;

create or replace function public.site_is_member() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select public.site_has_identity() and (not public.site_accounts_enabled() or public.site_legal_current(auth.uid()))
$$;
create or replace function public.site_account_status() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
    select jsonb_build_object('enabled',accounts_enabled,'technical_contact',technical_contact,'support_email',support_email,
        'privacy_url',privacy_url,'privacy_version',privacy_version,'terms_url',terms_url,'terms_version',terms_version,
        'audit_retention_days',audit_retention_days,'legal_ready',public.site_legal_ready())
    from public.site_security_config where singleton
$$;
create or replace function public.my_site_account() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
    select jsonb_build_object('profile',to_jsonb(p),'is_admin',public.site_is_admin(),
        'is_member',public.site_is_member(),'legal_current',public.site_legal_current(auth.uid()))
    from public.user_profiles p where user_id=auth.uid()
$$;

create function public.admin_register_site_legal_document(p_kind text,p_version text,p_url text,p_body text) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result text;
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    insert into public.site_legal_documents(kind,version,url,body,sha256,published_by)
    values(p_kind,btrim(p_version),btrim(p_url),p_body,encode(pg_catalog.sha256(convert_to(p_body,'UTF8')),'hex'),auth.uid()) returning sha256 into result;
    return result;
end;
$$;
create function public.admin_configure_site_terms(p_url text,p_version text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
    if not exists(select 1 from public.site_legal_documents where kind='terms' and version=p_version and url=p_url) then
        raise exception 'Registre a versão e o texto dos termos publicados antes de selecioná-los.';
    end if;
    update public.site_security_config set terms_url=p_url,terms_version=p_version,updated_at=now() where singleton;
end;
$$;
create function public.save_my_site_profile_legal(p_username text,p_display_name text,p_terms_version text,p_privacy_version text,
    p_accept_terms boolean,p_ack_privacy boolean,p_declare_adult boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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

create function public.guard_site_legal_activation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
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
revoke all on function public.guard_site_legal_activation() from public,anon,authenticated;
create trigger site_legal_activation before update on public.site_security_config
for each row execute function public.guard_site_legal_activation();

create or replace function public.site_actor_authorized(p_user_id uuid,p_require_admin boolean default true) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select not public.site_accounts_enabled() or exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
        where p.user_id=p_user_id and p.status='active' and u.email_confirmed_at is not null
        and u.email not like '%@admin.digistats.local' and public.site_legal_current(p_user_id)
        and (not p_require_admin or exists(select 1 from public.admin_users where user_id=p_user_id)))
$$;
create or replace function public.site_active_admin_count() returns integer
language sql stable security definer set search_path=pg_catalog,public as $$
    select count(*)::integer from public.admin_users a join public.user_profiles p on p.user_id=a.user_id
    join auth.users u on u.id=a.user_id where p.status='active' and u.email_confirmed_at is not null
    and (not public.site_accounts_enabled() or (u.email not like '%@admin.digistats.local' and p.adult_declared_at is not null))
$$;

revoke all on function public.admin_register_site_legal_document(text,text,text,text),public.admin_configure_site_terms(text,text),
    public.save_my_site_profile_legal(text,text,text,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.admin_register_site_legal_document(text,text,text,text),public.admin_configure_site_terms(text,text),
    public.save_my_site_profile_legal(text,text,text,text,boolean,boolean,boolean) to authenticated;

create or replace function public.my_site_data() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
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


commit;
