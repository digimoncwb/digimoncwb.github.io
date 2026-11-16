begin;

-- Rarity exceptions: cards outside allowed_rarities admitted by type/name/rarity, capped per deck.
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
        elsif key in ('use_official_banlist','digi_egg_any_rarity') then
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

-- EDEN v1.1.1 (RedskarrTCG). Card codes were checked against decklist_card_metadata; the
-- source document lists a few wrong codes, corrected here by card name.
insert into public.deck_formats(code,name,description,rules_text,rules_url,rules_status,validation_rules,change_note)
values('EDEN','EDEN',
'Somente cartas Comuns (C) e Incomuns (U), com até 4 exceções raras e Digi-Eggs de qualquer raridade.',
'Regras padrão de construção: deck principal de 50 cartas, até 5 Digi-Eggs e limite geral de 4 cópias por carta. Somente cartas C e U são permitidas; versões alternativas e foil de cartas permitidas também valem. EDEN Anomaly Protocol: Digi-Eggs de qualquer raridade podem ser usados, exceto os banidos ou limitados, e cada deck pode ter até 4 cartas no total entre Tamers R ou P, Options Memory Boost R ou P (incluindo as promos SR originais), Options Training P e Options Scramble P. Tamers C e U não contam no limite. A banlist própria do EDEN se aplica, incluindo Marcus Damon (BT12-092), Mother D-Reaper (EX2-007) e Sora Takenouchi (BT15-082) banidos e o par Gaomon (EX4-015) / Sayo & Koh (EX5-065).',
'https://docs.google.com/document/d/1sfUcJihqU86OOGKHzUM721PrBASbOmrW7-YhSbexV6U/edit',
'published',
$json${
  "main_count":50,"egg_max":5,"copies":4,
  "allowed_rarities":["C","U"],
  "digi_egg_any_rarity":true,
  "rarity_exception_limit":4,
  "rarity_exceptions":[
    {"type":"tamer","rarities":["R","P"]},
    {"type":"option","name_contains":"memory boost","rarities":["R","P","SR"]},
    {"type":"option","name_contains":"training","rarities":["P"]},
    {"type":"option","name_contains":"scramble","rarities":["P"]}
  ],
  "banned_codes":["BT3-097","BT9-103","BT16-011","EX4-008","EX6-042","BT12-092","EX2-007","BT15-082"],
  "limited_cards":{
    "BT1-107":1,"BT1-112":1,"BT2-039":1,"BT2-047":1,"BT2-069":1,"BT3-054":1,"BT3-058":1,"BT3-103":1,
    "BT4-098":1,"BT4-109":1,"BT5-062":1,"BT6-085":4,"BT6-097":1,"BT6-100":1,"BT7-014":1,"BT7-025":1,
    "BT7-051":1,"BT7-038":1,"BT7-064":1,"BT7-072":1,"BT7-075":1,"BT7-107":1,"BT8-095":1,"BT8-097":1,
    "BT9-109":1,"BT11-064":1,"BT13-012":1,"BT14-002":1,"BT14-060":1,"BT14-093":1,"BT16-024":1,
    "BT17-012":1,"BT17-023":1,"BT17-065":1,"BT17-067":1,"BT17-075":1,"BT17-092":1,"BT18-087":1,
    "BT19-070":1,"EX3-067":1,"EX5-048":1,"ST1-07":1
  },
  "choice_groups":[["EX4-015","EX5-065"]]
}$json$::jsonb,
'Cadastro inicial do formato EDEN (regulamento v1.1.1). Códigos corrigidos em relação ao documento: Howling Memory Boost! BT6-097, RhinoKabuterimon BT7-051, BurningGreymon BT17-012 e Greymon ST1-07.')
on conflict(code) do nothing;

commit;
