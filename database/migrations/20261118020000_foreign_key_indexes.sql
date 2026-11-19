-- Indexes for frequently filtered or joined foreign keys found in the November database audit.
-- Tables are small enough for a plain (transactional) index build.

begin;

-- Results of a tournament and a player's history are the most common lookups;
-- 25 database functions filter results by tournament_id.
create index if not exists tournament_results_tournament_idx
    on public.tournament_results (tournament_id);
create index if not exists tournament_results_player_idx
    on public.tournament_results (player_id);

-- v_podium_full picks each deck's latest image per result row (loaded on every visit).
create index if not exists deck_images_deck_latest_idx
    on public.deck_images (deck_id, created_at desc, id desc);

create index if not exists tournament_store_idx on public.tournament (store_id);
create index if not exists decklists_archetype_idx on public.decklists (archetype_id);
create index if not exists decklists_creator_player_idx on public.decklists (creator_player_id);
create index if not exists community_entries_player_idx on public.community_entries (player_id);
create index if not exists community_entries_deck_idx on public.community_entries (deck_id);
create index if not exists community_events_store_idx on public.community_events (store_id);
create index if not exists digilab_player_sync_player_idx on public.digilab_player_sync (player_id);
create index if not exists digilab_deck_sync_deck_idx on public.digilab_deck_sync (deck_id);
create index if not exists digilab_background_imports_tournament_idx
    on public.digilab_background_imports (tournament_id);
-- Also lets the history retention skip runs still claimed by an import.
create index if not exists digilab_background_imports_claim_run_idx
    on public.digilab_background_imports (claim_run_id);
create index if not exists account_requests_player_idx on public.account_requests (player_id);
create index if not exists account_requests_decklist_idx on public.account_requests (decklist_id);

commit;
