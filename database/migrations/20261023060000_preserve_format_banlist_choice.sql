begin;

-- Older editor tabs may omit this setting. An update must retain the saved
-- choice instead of silently enabling the official banlist again.
create or replace function public.default_format_banlist() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare selected jsonb;
begin
    if not coalesce(new.validation_rules,'{}'::jsonb) ? 'use_official_banlist' then
        selected := to_jsonb(upper(new.code)<>'DIGICREST');
        if tg_op='UPDATE' then
            if coalesce(old.validation_rules,'{}'::jsonb) ? 'use_official_banlist' then
                selected := old.validation_rules->'use_official_banlist';
            end if;
        end if;
        new.validation_rules := coalesce(new.validation_rules,'{}'::jsonb)
            || jsonb_build_object('use_official_banlist',selected);
    end if;
    return new;
end;
$$;

commit;
