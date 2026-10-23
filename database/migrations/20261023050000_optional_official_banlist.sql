begin;

create or replace function public.valid_format_rules(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare key text; item jsonb; member jsonb; entry record;
begin
    if value is null then return true; end if;
    if jsonb_typeof(value) <> 'object' then return false; end if;
    for key,item in select * from jsonb_each(value) loop
        if key in ('main_count','egg_max','copies','security_count') then
            if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
            if item::numeric > 999 or (key not in ('egg_max','security_count') and item::numeric < 1) then return false; end if;
        elsif key='use_official_banlist' then
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

create or replace function public.default_format_banlist() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
    if not coalesce(new.validation_rules,'{}'::jsonb) ? 'use_official_banlist' then
        new.validation_rules := coalesce(new.validation_rules,'{}'::jsonb) || '{"use_official_banlist":true}'::jsonb;
    end if;
    return new;
end;
$$;
drop trigger if exists default_format_banlist on public.deck_formats;
create trigger default_format_banlist before insert or update on public.deck_formats
for each row execute function public.default_format_banlist();

-- Preserve later explicit administrator choices when this migration is repeated.
update public.deck_formats
set validation_rules=coalesce(validation_rules,'{}'::jsonb) || jsonb_build_object('use_official_banlist',upper(code)<>'DIGICREST'),
    rules_text=case when upper(code)='DIGICREST' then replace(rules_text,
        'respeitando a banlist e os limites específicos do sistema.',
        'sem aplicar a banlist oficial da Bandai.') else rules_text end,
    change_note=case when upper(code)='DIGICREST'
        then 'Banlist oficial desativada: as restrições do DigiCrest são definidas pela pontuação e pelas regras próprias do formato.'
        else 'Uso da banlist oficial da Bandai explicitado nas regras do formato.' end
where not coalesce(validation_rules,'{}'::jsonb) ? 'use_official_banlist';

commit;
