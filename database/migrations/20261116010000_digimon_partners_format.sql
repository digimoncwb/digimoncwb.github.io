begin;

-- Format options: Digi-Egg copy cap, official bans/pairs without official limits, and a partner level.
create or replace function public.valid_format_rules(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare key text; item jsonb; member jsonb; entry record;
begin
    if value is null then return true; end if;
    if jsonb_typeof(value) <> 'object' then return false; end if;
    for key,item in select * from jsonb_each(value) loop
        if key in ('main_count','egg_max','copies','security_count','rarity_exception_limit') then
            if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
            if item::numeric > 999 or (key not in ('egg_max','security_count','rarity_exception_limit') and item::numeric < 1) then return false; end if;
        elsif key in ('egg_copies','partner_level') then
            if item <> 'null'::jsonb then
                if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
                if item::numeric < 1 or item::numeric > 999 then return false; end if;
            end if;
        elsif key in ('use_official_banlist','use_official_limits','digi_egg_any_rarity') then
            if jsonb_typeof(item)<>'boolean' then return false; end if;
        elsif key='points_limit' then
            if item <> 'null'::jsonb then
                if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
                if item::numeric < 1 or item::numeric > 1000000 then return false; end if;
            end if;
        elsif key='card_points' then
            if jsonb_typeof(item)<>'object' then return false; end if;
            if (select count(*) from jsonb_each(item)) > 5000 then return false; end if;
            for entry in select * from jsonb_each(item) loop
                if entry.key !~ '^(BT[0-9]+|EX[0-9]+|ST[0-9]+|RB[0-9]+|AD[0-9]+|LM[0-9]*|P)-[0-9]{1,4}$' then return false; end if;
                if jsonb_typeof(entry.value)<>'object' or not(entry.value ?& array['name','points']) then return false; end if;
                if jsonb_typeof(entry.value->'name')<>'string' or length(btrim(entry.value->>'name')) not between 1 and 200 then return false; end if;
                if jsonb_typeof(entry.value->'points')<>'number' or (entry.value->>'points') !~ '^[0-9]+$' then return false; end if;
                if (entry.value->>'points')::numeric>1000000 then return false; end if;
            end loop;
        elsif key='points_pending' then
            if jsonb_typeof(item)<>'array' or jsonb_array_length(item)>5000 then return false; end if;
            for member in select * from jsonb_array_elements(item) loop
                if jsonb_typeof(member)<>'object' or not(member ?& array['code','name','points']) then return false; end if;
                if jsonb_typeof(member->'code')<>'string' or length(btrim(member->>'code')) not between 1 and 80 then return false; end if;
                if jsonb_typeof(member->'name')<>'string' or length(btrim(member->>'name')) not between 1 and 200 then return false; end if;
                if jsonb_typeof(member->'points')<>'number' or (member->>'points') !~ '^[0-9]+$' then return false; end if;
                if (member->>'points')::numeric>1000000 then return false; end if;
            end loop;
        elsif key='limited_cards' then
            if jsonb_typeof(item)<>'object' then return false; end if;
            if exists(select 1 from jsonb_each(item) x where x.key !~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$' or jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-9]{1,3}$') then return false; end if;
        elsif key in ('banned_codes','unlimited_codes','allowed_colors','allowed_sets','allowed_rarities') then
            if jsonb_typeof(item)<>'array' then return false; end if;
            if exists(select 1 from jsonb_array_elements(item) x where jsonb_typeof(x)<>'string') then return false; end if;
            if key='allowed_colors' and exists(select 1 from jsonb_array_elements_text(item) x where x not in ('red','blue','green','yellow','purple','black','white')) then return false; end if;
            if key='allowed_rarities' and exists(select 1 from jsonb_array_elements_text(item) x where x !~ '^[A-Z]{1,8}$' or x='UNKNOWN') then return false; end if;
        elsif key='rarity_exceptions' then
            if jsonb_typeof(item)<>'array' or jsonb_array_length(item)>50 then return false; end if;
            for member in select * from jsonb_array_elements(item) loop
                if jsonb_typeof(member)<>'object' or not(member ?& array['type','rarities']) then return false; end if;
                if exists(select 1 from jsonb_object_keys(member) k where k not in ('type','name_contains','rarities')) then return false; end if;
                if jsonb_typeof(member->'type')<>'string' or member->>'type' not in ('digimon','digi-egg','tamer','option','dual') then return false; end if;
                if member ? 'name_contains' and (jsonb_typeof(member->'name_contains')<>'string' or length(btrim(member->>'name_contains')) not between 1 and 80) then return false; end if;
                if jsonb_typeof(member->'rarities')<>'array' or jsonb_array_length(member->'rarities')<1 then return false; end if;
                if exists(select 1 from jsonb_array_elements(member->'rarities') x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[A-Z]{1,8}$' or x#>>'{}'='UNKNOWN') then return false; end if;
            end loop;
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

-- Partner: one Digimon kept outside the deck. Eligibility is checked by the editor like other rules.
alter table public.decklists add column if not exists partner_card_code text;
alter table public.decklists drop constraint if exists decklists_partner_card_code_format;
alter table public.decklists add constraint decklists_partner_card_code_format
    check(partner_card_code is null or partner_card_code ~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$');

drop function if exists public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer,uuid,uuid);
create or replace function public.save_deck_draft(p_decklist_id bigint,p_result_id uuid,p_name text,p_deck_format_id bigint,p_cards jsonb,p_expected_revision integer,p_archetype_id uuid default null,p_creator_player_id uuid default null,p_partner_card_code text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare deck_row public.decklists%rowtype; result_row record; format_key bigint; revision integer; event_matches integer; archetype_key uuid; creator_key uuid;
begin
    if public.site_accounts_enabled() and not public.site_is_member() then raise exception 'Entre com uma conta ativa e e-mail confirmado.' using errcode='42501'; end if;
    if public.site_accounts_enabled() and p_result_id is not null and not public.site_is_admin() then raise exception 'Listas de torneios exigem acesso administrativo.' using errcode='42501'; end if;
    if length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Informe um nome de deck entre 1 e 120 caracteres.'; end if;
    if p_cards is null or not public.valid_deck_draft_cards(p_cards) then raise exception 'O rascunho contém códigos ou quantidades inválidos.'; end if;
    if p_partner_card_code is not null and p_partner_card_code !~ '^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$' then raise exception 'Código do partner inválido.'; end if;
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
    if deck_row.id is null and creator_key is null and auth.uid() is not null then
        select player_id into creator_key from public.user_profiles where user_id=auth.uid();
    end if;
    if creator_key is not null and not exists(select 1 from public.players where id=creator_key) then raise exception 'Selecione um jogador cadastrado.'; end if;
    select rules_revision into revision from public.deck_formats where id=format_key;
    if not found then raise exception 'Selecione um formato cadastrado.'; end if;
    if deck_row.id is null then
        insert into public.decklists(name,deck_format_id,tournament_result_id,source,draft_cards,draft_revision,format_rules_revision,archetype_id,creator_player_id,partner_card_code)
            values(upper(btrim(p_name)),format_key,p_result_id,'builder',p_cards,1,revision,archetype_key,creator_key,p_partner_card_code) returning * into deck_row;
    else
        update public.decklists set name=upper(btrim(p_name)),deck_format_id=format_key,draft_cards=p_cards,archetype_id=archetype_key,creator_player_id=creator_key,partner_card_code=p_partner_card_code,
            draft_revision=draft_revision+1,format_rules_revision=revision,updated_at=timezone('utc',now()) where id=deck_row.id returning * into deck_row;
        if not found then raise exception 'Sem permissão para salvar o rascunho.' using errcode='42501'; end if;
    end if;
    return jsonb_build_object('id',deck_row.id,'draft_revision',deck_row.draft_revision,'rules_revision',revision,'owner_user_id',deck_row.owner_user_id,'partner_card_code',deck_row.partner_card_code);
end;
$$;
revoke all on function public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer,uuid,uuid,text) from public;
grant execute on function public.save_deck_draft(bigint,uuid,text,bigint,jsonb,integer,uuid,uuid,text) to anon,authenticated;

insert into public.deck_formats(code,name,description,rules_text,rules_status,validation_rules,change_note)
values('PARTNERS','Digimon Partners',
'Deck de 80 cartas com até 2 cópias, 8 Digi-Eggs com até 4 cópias e um partner nível 6 fora do deck.',
'Deck principal de 80 cartas, com no máximo 2 cópias de cada carta, e até 8 Digi-Eggs, com no máximo 4 cópias de cada. Valem as cartas banidas e os pares proibidos da Bandai, mas não as cartas limitadas da Bandai. Limitadas a 1 cópia: BT17-018, EX2-074, BT12-085, EX2-073 e BT9-112. Cada deck pode ter 1 partner representado fora do deck: obrigatoriamente um Digimon nível 6 que não esteja no deck.',
'published',
$json${
  "main_count":80,"egg_max":8,"copies":2,"egg_copies":4,
  "use_official_banlist":true,"use_official_limits":false,
  "limited_cards":{"BT17-018":1,"EX2-074":1,"BT12-085":1,"EX2-073":1,"BT9-112":1},
  "partner_level":6
}$json$::jsonb,
'Cadastro inicial do formato Digimon Partners.')
on conflict(code) do nothing;

commit;
