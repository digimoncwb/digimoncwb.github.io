begin;

alter table public.formats
    add column if not exists description text,
    add column if not exists rules_text text,
    add column if not exists rules_url text,
    add column if not exists is_community_highlight boolean not null default false;
alter table public.formats drop constraint if exists formats_rules_url_safe;
alter table public.formats add constraint formats_rules_url_safe
    check (rules_url is null or rules_url ~ '^https?://[^[:space:]]+$');

-- Existing permissive policies must not allow visitors to write regulations.
create or replace function public.guard_format_regulations()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
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
drop trigger if exists guard_format_regulations on public.formats;
create trigger guard_format_regulations before insert or update or delete on public.formats
for each row execute function public.guard_format_regulations();
alter table public.formats enable row level security;
drop policy if exists "Admins manage format regulations" on public.formats;
create policy "Admins manage format regulations" on public.formats for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
grant select, insert, update, delete on public.formats to authenticated;
grant usage, select on sequence public.formats_id_seq to authenticated;

alter table public.decklists
    alter column tournament_result_id drop not null,
    add column if not exists name text,
    add column if not exists format_id bigint references public.formats(id);
alter table public.decklists drop constraint if exists decklists_free_identity;
alter table public.decklists add constraint decklists_free_identity check (
    tournament_result_id is not null or (name is not null and length(btrim(name)) between 1 and 120 and format_id is not null)
);
create index if not exists decklists_free_updated on public.decklists(updated_at desc, id desc) where tournament_result_id is null;
drop policy if exists "Public read free decks" on public.decklists;
create policy "Public read free decks" on public.decklists for select to anon, authenticated using (tournament_result_id is null);
drop policy if exists "Public create free decks" on public.decklists;
create policy "Public create free decks" on public.decklists for insert to anon, authenticated with check (tournament_result_id is null);
drop policy if exists "Public edit free decks" on public.decklists;
create policy "Public edit free decks" on public.decklists for update to anon, authenticated using (tournament_result_id is null) with check (tournament_result_id is null);
-- Preserve tournament deletes, but do not introduce public removal of library decks.
drop policy if exists "Keep free decks" on public.decklists;
create policy "Keep free decks" on public.decklists as restrictive for delete to anon, authenticated using (tournament_result_id is not null);
drop policy if exists "Public manage free deck cards" on public.decklist_cards;
create policy "Public manage free deck cards" on public.decklist_cards for all to anon, authenticated
using (exists (select 1 from public.decklists d where d.id = decklist_id and d.tournament_result_id is null))
with check (exists (select 1 from public.decklists d where d.id = decklist_id and d.tournament_result_id is null));
grant select, insert, update on public.decklists to anon, authenticated;
grant select, insert, update, delete on public.decklist_cards to anon, authenticated;
grant usage, select on sequence public.decklists_id_seq, public.decklist_cards_id_seq to anon, authenticated;

-- Invoker rights preserve existing RLS. A failure rolls back the whole replacement.
create or replace function public.replace_decklist_cards(p_decklist_id bigint, p_cards jsonb)
returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
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

create or replace function public.copy_free_deck_to_result(p_source_id bigint, p_result_id uuid, p_replace boolean default false)
returns bigint language plpgsql security invoker set search_path = pg_catalog, public as $$
declare target_id bigint; legacy_text text; cards jsonb; target_format bigint;
    result_row record; matching_events integer;
begin
    -- Lock in the same order as editor saves, including concurrent copies.
    perform 1 from public.decklists where id = p_source_id and tournament_result_id is null for update;
    if not found then raise exception 'Deck livre não encontrado.'; end if;
    select r.tournament_id,r.store_id,r.tournament_date into result_row
        from public.tournament_results r where r.id = p_result_id for update;
    if not found then raise exception 'Participação não encontrada.'; end if;
    if result_row.tournament_id is not null then
        select format_id into target_format from public.tournament where id = result_row.tournament_id;
    else
        select count(*),min(format_id) into matching_events,target_format from public.tournament
            where store_id = result_row.store_id and tournament_date = result_row.tournament_date;
        if matching_events <> 1 then raise exception 'Não foi possível identificar um único torneio para esta participação.'; end if;
    end if;
    if target_format is null then raise exception 'Formato do torneio não encontrado.'; end if;
    select id into target_id from public.decklists where tournament_result_id = p_result_id for update;
    if not coalesce(p_replace,false) and (target_id is not null or exists (select 1 from public.tournament_results where id = p_result_id and nullif(btrim(decklist),'') is not null)) then
        raise exception 'Esta participação já tem uma lista. Confirme a substituição.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('position',position,'card_code',card_code,'qty',qty) order by position),'[]'::jsonb),
        coalesce(string_agg(qty::text || ' ' || card_code, E'\n' order by position),'')
        into cards, legacy_text from public.decklist_cards where decklist_id = p_source_id;
    if jsonb_array_length(cards) = 0 then raise exception 'O deck livre ainda não possui cartas.'; end if;
    if target_id is null then
        insert into public.decklists(tournament_result_id,source,format_id) values(p_result_id,'builder',target_format) returning id into target_id;
    else
        update public.decklists set format_id = target_format where id = target_id;
    end if;
    perform public.replace_decklist_cards(target_id,cards);
    update public.tournament_results set decklist = legacy_text where id = p_result_id;
    if not found then raise exception 'Sem permissão para associar lista.'; end if;
    return target_id;
end;
$$;
revoke all on function public.replace_decklist_cards(bigint,jsonb) from public;
revoke all on function public.copy_free_deck_to_result(bigint,uuid,boolean) from public;
grant execute on function public.replace_decklist_cards(bigint,jsonb), public.copy_free_deck_to_result(bigint,uuid,boolean) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
