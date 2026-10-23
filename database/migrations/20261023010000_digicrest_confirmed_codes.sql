begin;

-- Resolve only original pending entries confirmed by the supplied card names.
-- Never replace a point value subsequently edited by an administrator.
do $$
declare
    target record;
    entry jsonb;
    corrected jsonb;
    registry jsonb;
    pending jsonb := '[]'::jsonb;
    resolved_code text;
    resolved_name text;
begin
    select id,validation_rules into target from public.deck_formats where code='DIGICREST' for update;
    if not found then return; end if;
    registry := coalesce(target.validation_rules->'card_points','{}'::jsonb);
    for entry in select value from jsonb_array_elements(coalesce(target.validation_rules->'points_pending','[]'::jsonb)) loop
        resolved_code := case
            when entry->>'code'='BT14-0' and entry->>'points'='2' then 'BT14-009'
            when entry->>'code'='BT12-57' and entry->>'points'='15' then 'BT12-057'
            else null end;
        resolved_name := null;
        if resolved_code is not null then
            select name into resolved_name from public.decklist_card_metadata where card_code=resolved_code;
        end if;
        if resolved_name is not null and (not registry ? resolved_code or registry->resolved_code->>'points'=entry->>'points') then
            if not registry ? resolved_code then
                registry := registry || jsonb_build_object(resolved_code,jsonb_build_object('name',resolved_name,'points',(entry->>'points')::integer));
            end if;
        else
            corrected := entry;
            if entry->>'name'=entry->>'code' then
                if entry->>'code'='BT21-02' then corrected := jsonb_set(entry,'{name}','"Gomamon"'); end if;
                if entry->>'code'='EX6' then corrected := jsonb_set(entry,'{name}','"Tapirmon"'); end if;
            end if;
            pending := pending || jsonb_build_array(corrected);
        end if;
    end loop;
    corrected := target.validation_rules || jsonb_build_object('card_points',registry,'points_pending',pending);
    if corrected is distinct from target.validation_rules then
        update public.deck_formats set validation_rules=corrected,
            change_note='Códigos de Gotsumon e Quartzmon conferidos pelos nomes fornecidos; códigos ST mantêm dois dígitos.'
        where id=target.id;
    end if;
end;
$$;

commit;
