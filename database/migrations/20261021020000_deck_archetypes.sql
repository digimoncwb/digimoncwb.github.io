begin;
alter table public.decklists add column if not exists archetype_id uuid references public.decks(id) on delete restrict;
alter table public.decklists add column if not exists creator_player_id uuid references public.players(id) on delete restrict;
-- Replace the old signature without leaving ambiguous default-argument overloads.
drop function if exists public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer);
create or replace function public.save_deck_draft(p_decklist_id bigint,p_result_id uuid,p_name text,p_deck_format_id bigint,p_cards jsonb,p_expected_revision integer,p_archetype_id uuid default null,p_creator_player_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare deck_row public.decklists%rowtype; result_row record; format_key bigint; revision integer; event_matches integer; archetype_key uuid; creator_key uuid;
begin
    if length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Informe um nome de deck entre 1 e 120 caracteres.'; end if;
    if p_cards is null or not public.valid_deck_draft_cards(p_cards) then raise exception 'O rascunho contém códigos ou quantidades inválidos.'; end if;
    format_key:=p_deck_format_id;
    archetype_key:=p_archetype_id;
    if p_result_id is not null then
        select tournament_id,store_id,tournament_date,deck_id into result_row from public.tournament_results where id=p_result_id for update;
        if not found then raise exception 'Participação não encontrada ou sem permissão.'; end if;
        archetype_key:=result_row.deck_id;
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
    if p_result_id is null then
        archetype_key:=coalesce(archetype_key,deck_row.archetype_id);
        if deck_row.id is null and archetype_key is null then raise exception 'Selecione um tipo de deck cadastrado.'; end if;
        if archetype_key is distinct from deck_row.archetype_id and not exists(select 1 from public.decks where id=archetype_key and is_active=true) then
            raise exception 'Selecione um tipo de deck ativo e cadastrado.';
        end if;
    end if;
    creator_key:=coalesce(p_creator_player_id,deck_row.creator_player_id);
    if creator_key is not null and not exists(select 1 from public.players where id=creator_key) then raise exception 'Selecione um jogador cadastrado.'; end if;
    select rules_revision into revision from public.deck_formats where id=format_key;
    if not found then raise exception 'Selecione um formato cadastrado.'; end if;
    if deck_row.id is null then
        insert into public.decklists(name,deck_format_id,tournament_result_id,source,draft_cards,draft_revision,format_rules_revision,archetype_id,creator_player_id)
            values(btrim(p_name),format_key,p_result_id,'builder',p_cards,1,revision,archetype_key,creator_key) returning * into deck_row;
    else
        update public.decklists set name=btrim(p_name),deck_format_id=format_key,draft_cards=p_cards,archetype_id=archetype_key,creator_player_id=creator_key,
            draft_revision=draft_revision+1,format_rules_revision=revision,updated_at=timezone('utc',now()) where id=deck_row.id returning * into deck_row;
        if not found then raise exception 'Sem permissão para salvar o rascunho.' using errcode='42501'; end if;
    end if;
    return jsonb_build_object('id',deck_row.id,'draft_revision',deck_row.draft_revision,'rules_revision',revision);
end;
$$;
revoke all on function public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer,uuid,uuid) from public;
grant execute on function public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer,uuid,uuid) to anon,authenticated;


commit;
