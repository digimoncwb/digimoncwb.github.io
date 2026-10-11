-- 2v2 uses one result per member, with two members sharing a placement.
BEGIN;

ALTER TABLE public.tournament_results
    ADD COLUMN IF NOT EXISTS team_member smallint NOT NULL DEFAULT 1
    CHECK (team_member IN (1, 2));

-- Scope linked results to their event: a 2v2 and a solo event can coexist.
ALTER TABLE public.tournament_results DROP CONSTRAINT IF EXISTS unique_player_per_tournament;
ALTER TABLE public.tournament_results ADD CONSTRAINT unique_player_per_tournament
    UNIQUE (tournament_id, player_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.tournament_results DROP CONSTRAINT IF EXISTS unique_tournament_placement;
ALTER TABLE public.tournament_results ADD CONSTRAINT unique_tournament_placement
    UNIQUE (tournament_id, placement, team_member) DEFERRABLE INITIALLY IMMEDIATE;

CREATE UNIQUE INDEX IF NOT EXISTS unique_legacy_tournament_player
    ON public.tournament_results(store_id, tournament_date, player_id) WHERE tournament_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unique_legacy_tournament_placement
    ON public.tournament_results(store_id, tournament_date, placement, team_member) WHERE tournament_id IS NULL;

CREATE OR REPLACE VIEW public.v_podium_full
WITH (security_invoker = true) AS
SELECT
    tr.id,
    tr.store_id,
    s.name AS store,
    tr.tournament_date,
    tr.placement,
    p.name AS player,
    d.name AS deck,
    di.image_url,
    tr.total_players,
    tr.tournament_id,
    tr.decklist,
    t.tournament_name,
    t.instagram_link,
    COALESCE(f.code, 'UNSPECIFIED') AS format_code,
    tr.match_points,
    tr.team_member
FROM public.tournament_results tr
JOIN public.stores s ON s.id = tr.store_id
LEFT JOIN public.decks d ON d.id = tr.deck_id
LEFT JOIN public.players p ON p.id = tr.player_id
LEFT JOIN public.tournament t ON t.id = tr.tournament_id
LEFT JOIN public.formats f ON f.id = t.format_id
LEFT JOIN LATERAL (
    SELECT dimg.image_url
    FROM public.deck_images dimg
    WHERE dimg.deck_id = d.id
    ORDER BY dimg.created_at DESC, dimg.id DESC
    LIMIT 1
) di ON true;

CREATE OR REPLACE FUNCTION public.save_tournament_transaction(
    p_tournament_id bigint,
    p_tournament jsonb,
    p_results jsonb,
    p_ocr_files jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tournament_id bigint;
    v_store_id uuid;
    v_tournament_date date;
    v_tournament_name text;
    v_total_players smallint;
    v_instagram_link text;
    v_format_id bigint;
    v_result jsonb;
    v_ordinality bigint;
    v_result_id uuid;
    v_existing_ids uuid[] := ARRAY[]::uuid[];
    v_rows_affected integer;
    v_team boolean;
    v_placement smallint;
    v_member smallint;
BEGIN
    IF p_tournament IS NULL OR jsonb_typeof(p_tournament) <> 'object' THEN
        RAISE EXCEPTION 'Dados do torneio invalidos.' USING ERRCODE = '22023';
    END IF;
    IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
        RAISE EXCEPTION 'Resultados invalidos.' USING ERRCODE = '22023';
    END IF;
    IF p_ocr_files IS NULL OR jsonb_typeof(p_ocr_files) <> 'array' THEN
        RAISE EXCEPTION 'Metadados dos prints invalidos.' USING ERRCODE = '22023';
    END IF;

    v_store_id := NULLIF(p_tournament->>'store_id', '')::uuid;
    v_tournament_date := NULLIF(p_tournament->>'tournament_date', '')::date;
    v_tournament_name := btrim(COALESCE(p_tournament->>'tournament_name', ''));
    v_team := lower(v_tournament_name) = '2v2';
    v_total_players := NULLIF(p_tournament->>'total_players', '')::smallint;
    v_instagram_link := NULLIF(btrim(COALESCE(p_tournament->>'instagram_link', '')), '');
    v_format_id := NULLIF(p_tournament->>'format_id', '')::bigint;

    IF v_format_id IS NULL THEN
        SELECT id INTO v_format_id
        FROM public.formats
        WHERE is_default = true
        ORDER BY id
        LIMIT 1;
    END IF;

    IF v_store_id IS NULL OR v_tournament_date IS NULL OR v_tournament_name = '' OR
       v_total_players IS NULL OR v_total_players < 1 OR v_total_players > 36 OR
       v_format_id IS NULL THEN
        RAISE EXCEPTION 'Campos obrigatorios do torneio invalidos.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_results) <> v_total_players THEN
        RAISE EXCEPTION 'O total de players deve corresponder aos resultados.' USING ERRCODE = '22023';
    END IF;

    IF v_team AND (v_total_players % 2 <> 0 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_results) AS r(item)
        WHERE NULLIF(item->>'player_id', '') IS NULL OR NULLIF(item->>'deck_id', '') IS NULL
    )) THEN
        RAISE EXCEPTION 'Cada dupla precisa de dois jogadores e dois decks.' USING ERRCODE = '22023';
    END IF;
    IF v_team AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_results) WITH ORDINALITY AS r(item, pos)
        JOIN jsonb_array_elements(p_results) WITH ORDINALITY AS partner(item, pos)
          ON r.pos % 2 = 1 AND partner.pos = r.pos + 1
        WHERE NULLIF(r.item->>'match_points', '')::integer IS DISTINCT FROM
              NULLIF(partner.item->>'match_points', '')::integer
    ) THEN
        RAISE EXCEPTION 'Os pontos devem ser iguais para os dois integrantes da dupla.' USING ERRCODE = '22023';
    END IF;

    SET CONSTRAINTS unique_player_per_tournament, unique_tournament_placement DEFERRED;

    IF p_tournament_id IS NULL THEN
        INSERT INTO public.tournament (
            store_id, tournament_date, tournament_name, total_players, instagram_link, format_id
        ) VALUES (
            v_store_id, v_tournament_date, v_tournament_name, v_total_players,
            v_instagram_link, v_format_id
        )
        RETURNING id INTO v_tournament_id;
    ELSE
        UPDATE public.tournament
        SET store_id = v_store_id,
            tournament_date = v_tournament_date,
            tournament_name = v_tournament_name,
            total_players = v_total_players,
            instagram_link = v_instagram_link,
            format_id = v_format_id
        WHERE id = p_tournament_id
        RETURNING id INTO v_tournament_id;

        IF v_tournament_id IS NULL THEN
            RAISE EXCEPTION 'Torneio nao encontrado.' USING ERRCODE = 'P0002';
        END IF;

        SELECT COALESCE(array_agg((item->>'id')::uuid), ARRAY[]::uuid[])
        INTO v_existing_ids
        FROM jsonb_array_elements(p_results) AS source(item)
        WHERE NULLIF(item->>'id', '') IS NOT NULL;

        DELETE FROM public.tournament_results
        WHERE tournament_id = v_tournament_id
          AND NOT (id = ANY(v_existing_ids));
    END IF;

    FOR v_result, v_ordinality IN
        SELECT item, ordinality
        FROM jsonb_array_elements(p_results) WITH ORDINALITY AS source(item, ordinality)
    LOOP
        v_placement := CASE WHEN v_team THEN ((v_ordinality - 1) / 2 + 1)::smallint ELSE v_ordinality::smallint END;
        v_member := CASE WHEN v_team THEN ((v_ordinality - 1) % 2 + 1)::smallint ELSE 1 END;
        IF NULLIF(v_result->>'player_id', '') IS NULL THEN
            RAISE EXCEPTION 'Player ausente na colocacao %.', v_ordinality USING ERRCODE = '22023';
        END IF;
        IF NULLIF(v_result->>'match_points', '')::integer < 0 THEN
            RAISE EXCEPTION 'Pontos invalidos na colocacao %.', v_ordinality USING ERRCODE = '22023';
        END IF;

        v_result_id := NULLIF(v_result->>'id', '')::uuid;

        IF p_tournament_id IS NOT NULL AND v_result_id IS NOT NULL THEN
            UPDATE public.tournament_results
            SET store_id = v_store_id,
                tournament_date = v_tournament_date,
                total_players = v_total_players,
                placement = v_placement,
                team_member = v_member,
                deck_id = NULLIF(v_result->>'deck_id', '')::uuid,
                player_id = (v_result->>'player_id')::uuid,
                match_points = NULLIF(v_result->>'match_points', '')::integer
            WHERE id = v_result_id
              AND tournament_id = v_tournament_id;

            GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
            IF v_rows_affected <> 1 THEN
                RAISE EXCEPTION 'Resultado % nao pertence ao torneio.', v_result_id USING ERRCODE = '22023';
            END IF;
        ELSE
            v_result_id := NULL;

            -- Older imports may have left an unlinked row for the same event/place.
            IF p_tournament_id IS NULL AND NOT v_team THEN
                SELECT id INTO v_result_id
                FROM public.tournament_results
                WHERE tournament_id IS NULL
                  AND store_id = v_store_id
                  AND tournament_date = v_tournament_date
                  AND placement = v_placement
                  AND team_member = v_member
                FOR UPDATE
                LIMIT 1;
            END IF;

            IF v_result_id IS NOT NULL THEN
                UPDATE public.tournament_results
                SET tournament_id = v_tournament_id,
                    team_member = v_member,
                    total_players = v_total_players,
                    deck_id = NULLIF(v_result->>'deck_id', '')::uuid,
                    player_id = (v_result->>'player_id')::uuid,
                    match_points = NULLIF(v_result->>'match_points', '')::integer
                WHERE id = v_result_id;
            ELSE
                INSERT INTO public.tournament_results (
                    tournament_id, store_id, tournament_date, total_players, placement, team_member,
                    deck_id, player_id, match_points
                ) VALUES (
                    v_tournament_id, v_store_id, v_tournament_date, v_total_players,
                    v_placement, v_member, NULLIF(v_result->>'deck_id', '')::uuid,
                    (v_result->>'player_id')::uuid,
                    NULLIF(v_result->>'match_points', '')::integer
                );
            END IF;
        END IF;
    END LOOP;

    INSERT INTO public.tournament_ocr_files (
        tournament_id, batch_id, storage_path, original_name, mime_type, size_bytes
    )
    SELECT
        v_tournament_id,
        (item->>'batch_id')::uuid,
        item->>'storage_path',
        item->>'original_name',
        NULLIF(item->>'mime_type', ''),
        NULLIF(item->>'size_bytes', '')::bigint
    FROM jsonb_array_elements(p_ocr_files) AS source(item);

    RETURN jsonb_build_object(
        'tournament_id', v_tournament_id,
        'results_count', jsonb_array_length(p_results),
        'ocr_files_count', jsonb_array_length(p_ocr_files)
    );
END;
$$;

create or replace function public.sync_digilab_tournament_atomic(
    p_external_id bigint, p_tournament jsonb, p_standings jsonb,
    p_player_mappings jsonb default '[]', p_deck_mappings jsonb default '[]',
    p_target_id bigint default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_row jsonb; v_results jsonb := '[]'; v_mappings jsonb := '[]'; v_payload jsonb;
    v_saved jsonb; v_existing public.tournament%rowtype;
    v_target bigint; v_linked bigint; v_store uuid; v_format bigint;
    v_player uuid; v_deck uuid; v_ids uuid[]; v_name text; v_slug text;
    v_format_code text; v_players integer := 0; v_decks integer := 0;
    v_result_id uuid; v_old_deck uuid; v_old_points integer;
    v_count integer; v_updated integer := 0; v_added integer := 0;
begin
    if p_external_id is null or p_external_id <= 0 or
       jsonb_typeof(p_standings) is distinct from 'array' or
       jsonb_typeof(p_player_mappings) is distinct from 'array' or
       jsonb_typeof(p_deck_mappings) is distinct from 'array' then
        raise exception 'Dados DigiLab invalidos.' using errcode = '22023';
    end if;
    if lower(btrim(p_tournament->>'tournament_name')) = '2v2' then
        raise exception 'O torneio 2v2 e exclusivamente local.' using errcode = '22023';
    end if;
    v_count := jsonb_array_length(p_standings);
    if v_count = 0 or v_count <> (p_tournament->>'player_count')::integer then
        raise exception 'Classificacao incompleta.' using errcode = '22023';
    end if;
    -- Serialize registration across imports, including differently spelled names.
    -- This is a short DB transaction; no external request runs under these locks.
    perform pg_advisory_xact_lock(724092401);
    lock table public.players, public.decks, public.formats in share row exclusive mode;
    select tournament_id into v_linked from public.tournament_digilab_sync
      where digilab_tournament_id = p_external_id and status = 'matched' for update;
    if p_target_id is not null and v_linked is not null and p_target_id <> v_linked then
        raise exception 'DigiLab ja vinculado a outro torneio.' using errcode = '22023';
    end if;
    v_target := coalesce(p_target_id, v_linked);
    select array_agg(id) into v_ids from public.stores
      where public.digilab_normalize(name) = public.digilab_normalize(p_tournament#>>'{store,name}');
    if coalesce(cardinality(v_ids), 0) <> 1 then
        raise exception 'Loja sem correspondente unico.' using errcode = '22023';
    end if;
    v_store := v_ids[1];
    if v_target is not null then
        select * into v_existing from public.tournament where id = v_target for update;
        if lower(btrim(v_existing.tournament_name)) = '2v2' then
            raise exception 'O torneio 2v2 e exclusivamente local.' using errcode = '22023';
        end if;
        if not found or v_existing.store_id <> v_store or
           v_existing.tournament_date <> (p_tournament->>'date')::date then
            raise exception 'A sincronizacao exige a mesma data e loja.' using errcode = '22023';
        end if;
        if exists(select 1 from public.tournament_digilab_sync where tournament_id = v_target
                  and digilab_tournament_id is not null and digilab_tournament_id <> p_external_id) then
            raise exception 'Torneio local ja vinculado a outro DigiLab.' using errcode = '22023';
        end if;
    elsif exists(select 1 from public.tournament where store_id = v_store
                 and tournament_date = (p_tournament->>'date')::date
                 and lower(btrim(coalesce(tournament_name, ''))) <> '2v2') then
        raise exception 'Possivel torneio local na mesma data; revise o vinculo.' using errcode = '22023';
    end if;

    v_format_code := btrim(coalesce(p_tournament->>'format', ''));
    if regexp_replace(upper(v_format_code), '[^A-Z0-9]', '', 'g') <> '' then
        select id into v_format from public.formats
          where regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') =
                regexp_replace(upper(v_format_code), '[^A-Z0-9]', '', 'g')
          order by (code = v_format_code) desc, id limit 1;
        if v_format is null then
            insert into public.formats(code, name, is_active, is_default)
              values(v_format_code, v_format_code, true, false) returning id into v_format;
        else
            update public.formats set is_active = true where id = v_format;
        end if;
    else
        raise exception 'Formato DigiLab ausente; revise o torneio em vez de usar o formato padrao.' using errcode = '22023';
    end if;
    if v_format is null then raise exception 'Formato nao resolvido.' using errcode = '22023'; end if;

    for v_row in select value from jsonb_array_elements(p_standings) order by (value->>'placement')::integer loop
        v_player := null; v_deck := null; v_result_id := null; v_old_deck := null; v_old_points := null;
        v_slug := nullif(btrim(v_row#>>'{player,slug}'), '');
        v_name := btrim(coalesce(v_row#>>'{player,name}', ''));
        if v_slug is null or public.digilab_normalize(v_name) = '' then
            raise exception 'Jogador anonimo exige revisao.' using errcode = '22023';
        end if;
        select nullif(value->>'player_id', '')::uuid into v_player
          from jsonb_array_elements(p_player_mappings) where value->>'digilab_player_slug' = v_slug limit 1;
        if v_player is null then
            select player_id into v_player from public.digilab_player_sync where digilab_player_slug = v_slug;
        end if;
        if v_player is null then
            select array_agg(id) into v_ids from public.players where
              public.digilab_normalize(name) = public.digilab_normalize(v_name) or
              public.digilab_normalize(digilab_name) = public.digilab_normalize(v_name);
            if cardinality(v_ids) > 1 then raise exception 'Jogador ambiguo: %', v_name using errcode = '22023'; end if;
            v_player := v_ids[1];
            if v_player is null then
                insert into public.players(name, bandai_nick, digilab_name, bandai_id, is_active)
                  values(v_name, v_name, v_name, null, true) returning id into v_player;
                v_players := v_players + 1;
            end if;
        end if;
        if not exists(select 1 from public.players where id = v_player) then
            raise exception 'Mapeamento de jogador invalido.' using errcode = '22023';
        end if;
        if exists(select 1 from jsonb_array_elements(v_results) where value->>'player_id' = v_player::text) then
            raise exception 'Dois jogadores apontam para a mesma pessoa.' using errcode = '22023';
        end if;
        v_mappings := v_mappings || jsonb_build_array(jsonb_build_object(
            'digilab_player_slug', v_slug, 'digilab_player_name', v_name, 'player_id', v_player));

        v_slug := nullif(btrim(v_row#>>'{deck,slug}'), '');
        v_name := btrim(coalesce(v_row#>>'{deck,name}', ''));
        if v_slug is not null or v_name <> '' then
            if v_slug is null then raise exception 'Deck sem slug.' using errcode = '22023'; end if;
            select nullif(value->>'deck_id', '')::uuid into v_deck
              from jsonb_array_elements(p_deck_mappings) where value->>'digilab_deck_slug' = v_slug limit 1;
            if v_deck is null then
                select deck_id into v_deck from public.digilab_deck_sync where digilab_deck_slug = v_slug;
            end if;
            if v_deck is null then
                if public.digilab_normalize(v_name) = '' then
                    raise exception 'Deck sem nome.' using errcode = '22023';
                end if;
                select array_agg(id) into v_ids from public.decks
                  where public.digilab_normalize(name) = public.digilab_normalize(v_name);
                if cardinality(v_ids) > 1 then raise exception 'Deck ambiguo: %', v_name using errcode = '22023'; end if;
                v_deck := v_ids[1];
                if v_deck is null then
                    insert into public.decks(name, is_active) values(v_name, true) returning id into v_deck;
                    v_decks := v_decks + 1;
                end if;
            end if;
            if not exists(select 1 from public.decks where id = v_deck) then
                raise exception 'Mapeamento de deck invalido.' using errcode = '22023';
            end if;
        end if;
        if v_target is not null then
            select id, deck_id, match_points into v_result_id, v_old_deck, v_old_points
              from public.tournament_results where tournament_id = v_target and player_id = v_player for update;
        end if;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'id', v_result_id, 'player_id', v_player, 'deck_id', coalesce(v_deck, v_old_deck),
            'placement', (v_row->>'placement')::integer,
            'digilab_deck_slug', v_slug, 'digilab_deck_name', nullif(v_name, ''),
            'match_points', coalesce((v_row#>>'{record,wins}')::integer * 3 + (v_row#>>'{record,ties}')::integer, v_old_points)));
    end loop;
    if exists(select 1 from jsonb_array_elements(v_results) with ordinality as r(value, pos)
              where (value->>'placement')::integer is distinct from pos::integer) then
        raise exception 'Colocacoes incompletas ou empatadas exigem revisao.' using errcode = '22023';
    end if;
    if v_target is not null and exists(
        select 1 from public.tournament_results r where r.tournament_id = v_target and not exists(
            select 1 from jsonb_array_elements(v_results) where value->>'player_id' = r.player_id::text)) then
        raise exception 'Jogadores locais ausentes no DigiLab; revise antes de remover resultados.' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('store_id', v_store, 'tournament_date', p_tournament->>'date',
        'tournament_name', coalesce(v_existing.tournament_name, nullif(p_tournament->>'tournament_name', ''), 'Semanal'),
        'total_players', v_count, 'format_id', v_format, 'instagram_link', v_existing.instagram_link,
        'rounds', p_tournament->'rounds');
    if v_target is not null then
        select count(*) into v_added from jsonb_array_elements(v_results) r where nullif(r->>'id', '') is null;
        select count(*) into v_updated from jsonb_array_elements(v_results) r
          join public.tournament_results t on t.id = nullif(r->>'id', '')::uuid
          where t.deck_id is distinct from nullif(r->>'deck_id', '')::uuid
             or t.match_points is distinct from nullif(r->>'match_points', '')::integer
             or t.placement is distinct from (r->>'placement')::integer;
        perform public.save_tournament_transaction(v_target, v_payload, v_results, '[]');
        update public.tournament set rounds = coalesce(nullif(p_tournament->>'rounds', '')::smallint, rounds) where id = v_target;
        insert into public.tournament_digilab_sync(tournament_id, digilab_tournament_id, digilab_url, status, verified_at)
          values(v_target, p_external_id, 'https://digilab.cards/tournament/' || p_external_id, 'matched', now())
          on conflict(tournament_id) do update set
            digilab_tournament_id = excluded.digilab_tournament_id, digilab_url = excluded.digilab_url,
            status = 'matched', verified_at = excluded.verified_at, last_error_code = null;
    end if;
    -- Existing RPC persists the mappings and link in this same transaction.
    v_saved := public.import_digilab_tournament_transaction(p_external_id,
        'https://digilab.cards/tournament/' || p_external_id, v_payload, v_results, v_mappings);
    return v_saved || jsonb_build_object('players_created', v_players, 'decks_created', v_decks,
        'results_updated', v_updated, 'results_added', v_added, 'reused', v_target is not null,
        'tournament_updated', v_target is not null and (
            v_existing.format_id is distinct from v_format or v_existing.total_players is distinct from v_count or
            v_existing.rounds is distinct from coalesce(nullif(p_tournament->>'rounds', '')::smallint, v_existing.rounds)));
end;
$$;


-- Validate the final transaction state, including writes made outside the RPC.
CREATE OR REPLACE FUNCTION public.validate_tournament_team_results()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    v_id bigint;
    v_ids bigint[];
    v_event public.tournament%rowtype;
BEGIN
    IF TG_TABLE_NAME = 'tournament' THEN
        v_ids := ARRAY[NEW.id];
    ELSIF TG_OP = 'UPDATE' AND OLD.tournament_id IS DISTINCT FROM NEW.tournament_id THEN
        v_ids := ARRAY[OLD.tournament_id, NEW.tournament_id];
    ELSE
        v_ids := ARRAY[CASE WHEN TG_OP = 'DELETE' THEN OLD.tournament_id ELSE NEW.tournament_id END];
    END IF;
    FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO v_event FROM public.tournament WHERE id = v_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF lower(btrim(v_event.tournament_name)) = '2v2' THEN
        IF v_event.total_players < 2 OR v_event.total_players % 2 <> 0 OR
           (SELECT count(*) FROM public.tournament_results WHERE tournament_id = v_id) <> v_event.total_players OR
           EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = v_id
                   AND (player_id IS NULL OR deck_id IS NULL OR placement > v_event.total_players / 2)) OR
           EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = v_id GROUP BY placement
                   HAVING count(*) <> 2 OR count(DISTINCT team_member) <> 2 OR
                          count(DISTINCT match_points) > 1 OR count(match_points) = 1) THEN
            RAISE EXCEPTION '2v2 exige dois jogadores e dois decks por colocacao, com pontos iguais.' USING ERRCODE = '22023';
        END IF;
    ELSIF EXISTS (SELECT 1 FROM public.tournament_results WHERE tournament_id = v_id AND team_member <> 1) THEN
        RAISE EXCEPTION 'Apenas torneios 2v2 permitem dois integrantes por colocacao.' USING ERRCODE = '22023';
    END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_team_results ON public.tournament_results;
CREATE CONSTRAINT TRIGGER trg_validate_team_results AFTER INSERT OR UPDATE OR DELETE
ON public.tournament_results DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tournament_team_results();
DROP TRIGGER IF EXISTS trg_validate_team_tournament ON public.tournament;
CREATE CONSTRAINT TRIGGER trg_validate_team_tournament AFTER INSERT OR UPDATE
ON public.tournament DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_tournament_team_results();

CREATE OR REPLACE FUNCTION public.block_team_tournament_digilab_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_TABLE_NAME = 'tournament_digilab_sync' THEN
        IF EXISTS (SELECT 1 FROM public.tournament WHERE id = NEW.tournament_id
                   AND lower(btrim(tournament_name)) = '2v2') THEN
            RAISE EXCEPTION 'O torneio 2v2 e exclusivamente local.' USING ERRCODE = '22023';
        END IF;
    ELSIF lower(btrim(NEW.tournament_name)) = '2v2' AND
          EXISTS (SELECT 1 FROM public.tournament_digilab_sync WHERE tournament_id = NEW.id) THEN
        RAISE EXCEPTION 'Remova o vinculo DigiLab antes de converter para 2v2.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_block_team_digilab_sync ON public.tournament_digilab_sync;
CREATE TRIGGER trg_block_team_digilab_sync BEFORE INSERT OR UPDATE ON public.tournament_digilab_sync
FOR EACH ROW EXECUTE FUNCTION public.block_team_tournament_digilab_sync();
DROP TRIGGER IF EXISTS trg_block_linked_team_tournament ON public.tournament;
CREATE TRIGGER trg_block_linked_team_tournament BEFORE UPDATE OF tournament_name ON public.tournament
FOR EACH ROW EXECUTE FUNCTION public.block_team_tournament_digilab_sync();

NOTIFY pgrst, 'reload schema';
COMMIT;
