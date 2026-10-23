begin;

-- Official BT-26 card list: BT26-091 Yoshino Fujieda is Rare (R).
-- https://world.digimoncard.com/cards/?category=522038&search=true
create or replace function public.correct_known_card_rarity() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
    if new.card_code='BT26-091' and upper(new.card_payload->>'rarity')='RC' then
        new.card_payload=jsonb_set(new.card_payload,'{rarity}','"R"'::jsonb);
    end if;
    return new;
end;
$$;
drop trigger if exists correct_known_card_rarity on public.decklist_card_metadata;
create trigger correct_known_card_rarity before insert or update on public.decklist_card_metadata
for each row execute function public.correct_known_card_rarity();

update public.decklist_card_metadata set card_payload=jsonb_set(card_payload,'{rarity}','"R"'::jsonb)
where card_code='BT26-091' and upper(card_payload->>'rarity')='RC';

commit;
