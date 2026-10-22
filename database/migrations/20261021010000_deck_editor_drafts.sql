begin;
-- Game modalities are distinct from the existing formats table of sets/releases.
create table if not exists public.deck_formats (
    id bigserial primary key, code text not null unique, name text not null,
    description text, rules_text text, rules_url text,
    is_active boolean not null default true, is_default boolean not null default false,
    is_community_highlight boolean not null default false,
    rules_status text not null default 'draft' check(rules_status in ('draft','published')),
    validation_rules jsonb, rules_revision integer not null default 1,
    updated_at timestamptz not null default now(), change_note text,
    created_at timestamptz not null default now()
);
insert into public.deck_formats(code,name,description,is_default,rules_status,validation_rules)
values('STANDARD','Padrão','Formato de referência da comunidade. Usa as regras gerais já adotadas no sistema.',true,'published','{"main_count":50,"egg_max":5,"copies":4}'::jsonb)
on conflict(code) do nothing;
alter table public.deck_formats enable row level security;
drop policy if exists "Public read game formats" on public.deck_formats;
create policy "Public read game formats" on public.deck_formats for select to anon,authenticated using(true);
drop policy if exists "Admins manage game formats" on public.deck_formats;
create policy "Admins manage game formats" on public.deck_formats for all to authenticated
using(exists(select 1 from public.admin_users where user_id=auth.uid()))
with check(exists(select 1 from public.admin_users where user_id=auth.uid()));
grant select on public.deck_formats to anon,authenticated;
grant insert,update,delete on public.deck_formats to authenticated;
grant usage,select on sequence public.deck_formats_id_seq to authenticated;
drop trigger if exists guard_game_format_regulations on public.deck_formats;
create trigger guard_game_format_regulations before insert or update or delete on public.deck_formats
for each row execute function public.guard_format_regulations();
alter table public.deck_formats drop constraint if exists deck_formats_safe_rules_url;
alter table public.deck_formats add constraint deck_formats_safe_rules_url check(rules_url is null or rules_url ~ '^https?://[^[:space:]]+$');
do $$ declare standard_id bigint; target_table text; begin
    select id into standard_id from public.deck_formats where code='STANDARD';
    foreach target_table in array array['decklists','tournament','decks'] loop
        -- Constant column defaults backfill existing rows without firing update triggers.
        execute format('alter table public.%I add column if not exists deck_format_id bigint default %s references public.deck_formats(id)',target_table,standard_id);
        execute format('update public.%I set deck_format_id=%s where deck_format_id is null',target_table,standard_id);
        execute format('alter table public.%I alter column deck_format_id set default %s',target_table,standard_id);
    end loop;
end $$;
alter table public.decklists alter column deck_format_id set not null;
alter table public.tournament alter column deck_format_id set not null;
alter table public.decks alter column deck_format_id set not null;
alter table public.decklists drop constraint if exists decklists_free_identity;
alter table public.decklists add constraint decklists_free_identity check(tournament_result_id is not null or (name is not null and length(btrim(name)) between 1 and 120 and deck_format_id is not null));
alter table public.deck_formats add column if not exists validation_rules jsonb,
    add column if not exists rules_revision integer not null default 1;
-- Seed only the real general construction limits already used by the editor.
update public.deck_formats set validation_rules='{"main_count":50,"egg_max":5,"copies":4}'::jsonb
where code='STANDARD' and validation_rules is null and rules_revision=1;
create table if not exists public.deck_format_rule_versions (
    id bigserial primary key, deck_format_id bigint not null references public.deck_formats(id),
    version integer not null, created_at timestamptz not null default now(),
    description text not null, rules_snapshot jsonb not null,
    unique(deck_format_id,version)
);
alter table public.deck_format_rule_versions enable row level security;
drop policy if exists "Public read rule versions" on public.deck_format_rule_versions;
create policy "Public read rule versions" on public.deck_format_rule_versions for select to anon,authenticated using(true);
grant select on public.deck_format_rule_versions to anon,authenticated;


create or replace function public.valid_format_rules(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare key text; item jsonb; member jsonb;
begin
    if value is null then return true; end if;
    if jsonb_typeof(value) <> 'object' then return false; end if;
    for key,item in select * from jsonb_each(value) loop
        if key in ('main_count','egg_max','copies') then
            if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
            if item::numeric > 999 or (key <> 'egg_max' and item::numeric < 1) then return false; end if;
        elsif key='limited_cards' then
            if jsonb_typeof(item)<>'object' then return false; end if;
            if exists(select 1 from jsonb_each(item) x where x.key !~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$' or jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-9]{1,3}$') then return false; end if;
        elsif key in ('banned_codes','unlimited_codes','allowed_colors','allowed_sets') then
            if jsonb_typeof(item)<>'array' then return false; end if;
            if exists(select 1 from jsonb_array_elements(item) x where jsonb_typeof(x)<>'string') then return false; end if;
            if key='allowed_colors' and exists(select 1 from jsonb_array_elements_text(item) x where x not in ('red','blue','green','yellow','purple','black','white')) then return false; end if;
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
$$;
alter table public.deck_formats drop constraint if exists formats_validation_rules_valid;
alter table public.deck_formats add constraint formats_validation_rules_valid check(public.valid_format_rules(validation_rules));
create or replace function public.guard_format_validation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
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
drop trigger if exists guard_format_validation on public.deck_formats;
create trigger guard_format_validation before insert or update or delete on public.deck_formats for each row execute function public.guard_format_validation();

create or replace function public.record_deck_format_revision() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if tg_op='INSERT' or new.rules_revision<>old.rules_revision then
        insert into public.deck_format_rule_versions(deck_format_id,version,description,rules_snapshot)
        values(new.id,new.rules_revision,coalesce(nullif(btrim(new.change_note),''),'Regulamento atualizado.'),jsonb_build_object('rules',new.validation_rules,'text',new.rules_text,'status',new.rules_status))
        on conflict(deck_format_id,version) do nothing;
    end if;
    return new;
end;
$$;
drop trigger if exists record_deck_format_revision on public.deck_formats;
create trigger record_deck_format_revision after insert or update on public.deck_formats for each row execute function public.record_deck_format_revision();
insert into public.deck_format_rule_versions(deck_format_id,version,description,rules_snapshot)
select id,rules_revision,'Vínculo inicial ao formato Padrão; regras gerais já utilizadas no sistema.',jsonb_build_object('rules',validation_rules,'text',rules_text,'status',rules_status)
from public.deck_formats where code='STANDARD' on conflict(deck_format_id,version) do nothing;

alter table public.decklists add column if not exists draft_cards jsonb,
    add column if not exists draft_revision integer not null default 0,
    add column if not exists format_rules_revision integer;
create or replace function public.valid_deck_draft_cards(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
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
$$;
alter table public.decklists drop constraint if exists decklists_draft_cards_valid;
alter table public.decklists add constraint decklists_draft_cards_valid check(public.valid_deck_draft_cards(draft_cards));

create or replace function public.save_deck_draft(p_decklist_id bigint,p_result_id uuid,p_name text,p_deck_format_id bigint,p_cards jsonb,p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare deck_row public.decklists%rowtype; result_row record; format_key bigint; revision integer; event_matches integer;
begin
    if length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Informe um nome de deck entre 1 e 120 caracteres.'; end if;
    if p_cards is null or not public.valid_deck_draft_cards(p_cards) then raise exception 'O rascunho contém códigos ou quantidades inválidos.'; end if;
    format_key:=p_deck_format_id;
    if p_result_id is not null then
        select tournament_id,store_id,tournament_date into result_row from public.tournament_results where id=p_result_id for update;
        if not found then raise exception 'Participação não encontrada ou sem permissão.'; end if;
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
    select rules_revision into revision from public.deck_formats where id=format_key;
    if not found then raise exception 'Selecione um formato cadastrado.'; end if;
    if deck_row.id is null then
        insert into public.decklists(name,deck_format_id,tournament_result_id,source,draft_cards,draft_revision,format_rules_revision)
            values(btrim(p_name),format_key,p_result_id,'builder',p_cards,1,revision) returning * into deck_row;
    else
        update public.decklists set name=btrim(p_name),deck_format_id=format_key,draft_cards=p_cards,
            draft_revision=draft_revision+1,format_rules_revision=revision,updated_at=timezone('utc',now()) where id=deck_row.id returning * into deck_row;
        if not found then raise exception 'Sem permissão para salvar o rascunho.' using errcode='42501'; end if;
    end if;
    return jsonb_build_object('id',deck_row.id,'draft_revision',deck_row.draft_revision,'rules_revision',revision);
end;
$$;
revoke all on function public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer) from public;
grant execute on function public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer) to anon,authenticated;

-- Read previews/copies use the saved draft while existing published rows stay intact.
create or replace function public.copy_free_deck_to_result(p_source_id bigint,p_result_id uuid,p_replace boolean default false)
returns bigint language plpgsql security invoker set search_path=pg_catalog,public as $$
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
notify pgrst,'reload schema';
commit;
