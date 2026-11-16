begin;

-- Copies keep the deck's partner (added in 20261116010000).
create or replace function public.copy_community_deck(p_source_id bigint) returns bigint
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare source public.decklists; new_id bigint; contents jsonb; author_id uuid;
begin
    if not public.site_is_member() then raise exception 'Entre com uma conta ativa.' using errcode='42501'; end if;
    select * into source from public.decklists where id=p_source_id and tournament_result_id is null;
    if not found then raise exception 'Deck da comunidade não encontrado.'; end if;
    contents:=source.draft_cards;
    if contents is null then
        select coalesce(jsonb_agg(jsonb_build_object('code',card_code,'qty',qty) order by position),'[]') into contents from public.decklist_cards where decklist_id=p_source_id;
    end if;
    select player_id into author_id from public.user_profiles where user_id=auth.uid();
    insert into public.decklists(name,deck_format_id,tournament_result_id,source,draft_cards,draft_revision,archetype_id,creator_player_id,partner_card_code)
    values(left(upper(source.name),110)||' (CÓPIA)',source.deck_format_id,null,'builder',contents,1,source.archetype_id,author_id,source.partner_card_code)
    returning id into new_id;
    return new_id;
end;
$$;

-- EDEN has its own complete banlist: the official one banned Sayo & Koh (legal in EDEN, only
-- paired with Gaomon) and limited C/U cards EDEN allows at 4 copies.
update public.deck_formats
set validation_rules=validation_rules || '{"use_official_banlist":false}'::jsonb,
    rules_text=rules_text || ' A banlist oficial da Bandai não se aplica: o EDEN usa somente a banlist própria.',
    change_note='Banlist oficial desativada: o EDEN usa somente a banlist própria do regulamento.'
where code='EDEN' and coalesce((validation_rules->>'use_official_banlist')::boolean,true);

commit;
