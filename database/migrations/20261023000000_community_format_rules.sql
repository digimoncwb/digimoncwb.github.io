begin;

-- Extend the existing central rules document; retain its admin RLS and version history.
create or replace function public.valid_format_rules(value jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare key text; item jsonb; member jsonb; entry record;
begin
    if value is null then return true; end if;
    if jsonb_typeof(value) <> 'object' then return false; end if;
    for key,item in select * from jsonb_each(value) loop
        if key in ('main_count','egg_max','copies') then
            if jsonb_typeof(item)<>'number' or item::text !~ '^[0-9]+$' then return false; end if;
            if item::numeric > 999 or (key <> 'egg_max' and item::numeric < 1) then return false; end if;
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

create or replace function public.guard_pending_format_points() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
    if new.rules_status='published' and coalesce(jsonb_array_length(new.validation_rules->'points_pending'),0)>0 then
        raise exception 'Corrija os códigos pendentes da pontuação antes de publicar o regulamento.';
    end if;
    return new;
end;
$$;
drop trigger if exists guard_pending_format_points on public.deck_formats;
create trigger guard_pending_format_points before insert or update on public.deck_formats
for each row execute function public.guard_pending_format_points();

insert into public.deck_formats(code,name,description,rules_text,rules_status,validation_rules,change_note)
values('PAUPER','Pauper','Somente cartas Comuns (C) e Incomuns (U), respeitando a banlist.',
'Deck principal de 50 cartas, até 5 Digi-Eggs e limite geral de 4 cópias por carta. Somente raridades C e U são permitidas. A banlist e os limites específicos do sistema se aplicam. Cartas sem raridade confirmada não podem ser consideradas válidas.',
'published','{"main_count":50,"egg_max":5,"copies":4,"allowed_rarities":["C","U"]}'::jsonb,'Cadastro inicial do formato Pauper.')
on conflict(code) do nothing;

-- Initial 193 rows: database/seeds/digicrest-initial.tsv. Unmatched codes remain editable draft rows.
do $$
declare initial_points jsonb; initial_pending jsonb;
begin
    if exists(select 1 from public.deck_formats where code='DIGICREST') then return; end if;
    with source(code,points) as (values
        ('LM-051',2),
        ('P-105',2),
        ('P-104',2),
        ('P-107',2),
        ('P-103',2),
        ('P-108',2),
        ('P-106',2),
        ('ST13-08',2),
        ('EX3-061',2),
        ('BT5-033',2),
        ('BT6-008',2),
        ('BT3-077',2),
        ('BT18-009',2),
        ('BT21-02',2),
        ('BT14-0',2),
        ('BT6-059',2),
        ('BT6-021',2),
        ('EX7-015',2),
        ('BT9-033',2),
        ('BT9-047',2),
        ('BT5-021',2),
        ('ST12-03',2),
        ('EX6',2),
        ('ST20-07',2),
        ('BT3-046',2),
        ('BT18-059',2),
        ('BT8-071',2),
        ('BT24-031',3),
        ('BT26-029',3),
        ('BT26-100',3),
        ('BT26-074',3),
        ('BT26-092',3),
        ('BT21-071',3),
        ('BT25-020',3),
        ('P-180',3),
        ('BT24-085',3),
        ('BT26-090',5),
        ('BT24-034',5),
        ('BT9-103',5),
        ('EX12-070',5),
        ('BT21-090',5),
        ('EX11-074',5),
        ('EX10-053',5),
        ('EX10-013',5),
        ('BT16-025',5),
        ('BT21-046',5),
        ('BT23-047',5),
        ('BT24-088',8),
        ('P-192',8),
        ('P-205',8),
        ('BT24-018',8),
        ('BT8-095',8),
        ('BT12-107',8),
        ('BT25-034',8),
        ('BT15-037',8),
        ('BT25-040',8),
        ('BT24-083',8),
        ('P-094',8),
        ('BT8-097',8),
        ('BT8-094',8),
        ('P-206',8),
        ('BT16-082',8),
        ('BT15-092',8),
        ('EX9-032',8),
        ('BT25-057',8),
        ('BT25-060',8),
        ('P-220',8),
        ('EX11-046',8),
        ('BT26-076',8),
        ('BT16-048',8),
        ('BT23-013',8),
        ('P-153',8),
        ('BT22-052',8),
        ('BT21-044',8),
        ('EX2-071',8),
        ('BT9-112',8),
        ('BT20-083',10),
        ('LM-059',10),
        ('LM-060',10),
        ('LM-056',10),
        ('LM-058',10),
        ('LM-055',10),
        ('LM-057',10),
        ('AD01-002',10),
        ('BT22-028',10),
        ('BT16-077',10),
        ('EX10-036',10),
        ('EX12-019',10),
        ('EX12-032',10),
        ('BT10-042',10),
        ('AD1-023',10),
        ('AD1-020',10),
        ('EX10-072',10),
        ('BT19-075',10),
        ('ST16-14',10),
        ('BT18-079',10),
        ('BT24-080',10),
        ('P-186',10),
        ('BT24-016',10),
        ('BT22-042',10),
        ('BT26-059',10),
        ('BT26-078',10),
        ('ST23-09',10),
        ('EX9-021',10),
        ('BT25-075',10),
        ('AD1-021',10),
        ('BT25-059',10),
        ('BT25-077',10),
        ('EX4-019',10),
        ('AD1-006',10),
        ('EX13-023',10),
        ('BT26-080',10),
        ('BT26-032',10),
        ('BT24-102',10),
        ('EX4-074',15),
        ('BT26-033',15),
        ('EX12-076',15),
        ('BT7-077',15),
        ('EX13-045',15),
        ('EX13-077',15),
        ('EX11-069',15),
        ('BT26-081',15),
        ('BT26-082',15),
        ('EX12-035',15),
        ('BT12-57',15),
        ('BT20-102',15),
        ('BT20-060',15),
        ('EX7-023',15),
        ('BT25-085',15),
        ('BT9-098',15),
        ('EX1-066',20),
        ('EX8-037',20),
        ('BT17-035',20),
        ('EX7-064',20),
        ('EX2-007',20),
        ('BT20-037',20),
        ('BT16-102',20),
        ('BT2-047',25),
        ('EX5-062',25),
        ('BT15-102',25),
        ('P-029',25),
        ('BT23-032',30),
        ('BT2-069',30),
        ('EX2-039',30),
        ('P-008',30),
        ('EX2-070',30),
        ('BT14-033',30),
        ('BT7-038',30),
        ('BT3-054',30),
        ('EX4-030',30),
        ('P-025',30),
        ('EX5-015',30),
        ('BT17-069',30),
        ('BT6-100',30),
        ('BT16-011',30),
        ('BT19-040',30),
        ('BT11-033',30),
        ('BT4-104',30),
        ('BT6-104',30),
        ('EX3-057',30),
        ('BT11-064',30),
        ('EX5-018',30),
        ('BT1-090',30),
        ('BT13-110',30),
        ('BT14-084',30),
        ('BT4-111',30),
        ('P-123',30),
        ('BT7-072',30),
        ('EX5-059',30),
        ('BT13-012',30),
        ('BT15-057',30),
        ('ST2-13',30),
        ('EX5-061',30),
        ('P-130',30),
        ('BT10-080',30),
        ('BT14-002',30),
        ('BT10-009',30),
        ('BT3-092',30),
        ('BT7-064',30),
        ('BT7-107',30),
        ('BT3-103',30),
        ('ST9-09',30),
        ('EX1-068',30),
        ('EX8-012',30),
        ('EX4-006',30),
        ('EX1-021',30),
        ('BT7-069',30),
        ('P-030',30),
        ('EX8-074',30),
        ('BT15-003',90),
        ('EX5-065',90),
        ('BT2-090',90),
        ('BT5-109',90)
    ), canonical as (
        select case code when 'AD01-002' then 'AD1-002' when 'BT14-0' then 'BT14-009' when 'BT12-57' then 'BT12-057' else code end as code,points from source
    ), resolved as (
        select c.code,c.points,m.card_code,coalesce(nullif(btrim(m.name),''),case c.code when 'BT21-02' then 'Gomamon' when 'EX6' then 'Tapirmon' else c.code end) as name
        from canonical c left join public.decklist_card_metadata m on m.card_code=c.code
    )
    select coalesce(jsonb_object_agg(code,jsonb_build_object('name',name,'points',points)) filter(where card_code is not null),'{}'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'points',points) order by code) filter(where card_code is null),'[]'::jsonb)
    into initial_points,initial_pending from resolved;
    insert into public.deck_formats(code,name,description,rules_text,rules_status,validation_rules,change_note)
    values('DIGICREST','DigiCrest','Monte um deck de até 100 pontos, somando cada cópia.',
    'Deck principal de 50 cartas, até 5 Digi-Eggs e limite geral de 4 cópias por carta, respeitando a banlist e os limites específicos do sistema. Cada cópia, incluindo Digi-Eggs, soma os pontos cadastrados. O total pode chegar a 100 pontos; 101 pontos torna o deck inválido. Cartas fora da lista de pontuação valem 0.',
    case when jsonb_array_length(initial_pending)=0 then 'published' else 'draft' end,
    jsonb_build_object('main_count',50,'egg_max',5,'copies',4,'points_limit',100,'card_points',initial_points,'points_pending',initial_pending),
    'Carga inicial fornecida pela comunidade; códigos não encontrados ficam pendentes sem substituir cartas por suposição.');
end;
$$;

commit;
