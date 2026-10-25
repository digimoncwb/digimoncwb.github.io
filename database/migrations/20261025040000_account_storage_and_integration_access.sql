begin;

do $$
declare t text; command text; seq text;
begin
    foreach t in array array['tournament_weekly_schedule','decklist_card_metadata','cards_cache','deck_format_rule_versions'] loop
        if to_regclass('public.'||t) is not null then
            execute format('alter table public.%I enable row level security',t);
            execute format('create trigger site_admin_write before insert or update or delete on public.%I for each row execute function public.guard_site_admin_write()',t);
            foreach command in array array['insert','update','delete'] loop
                execute format('create policy %I on public.%I as restrictive for %s to anon,authenticated %s',
                    'site_'||command,t,command,
                    case when command='insert' then 'with check(not public.site_accounts_enabled() or public.site_is_admin())'
                    when command='update' then 'using(not public.site_accounts_enabled() or public.site_is_admin()) with check(not public.site_accounts_enabled() or public.site_is_admin())'
                    else 'using(not public.site_accounts_enabled() or public.site_is_admin())' end);
            end loop;
            execute format('create policy site_admin_access on public.%I for all to authenticated using(public.site_is_admin()) with check(public.site_is_admin())',t);
            execute format('create policy site_member_read on public.%I for select to authenticated using(true)',t);
            execute format('grant select,insert,update,delete on public.%I to authenticated',t);
        end if;
    end loop;
    foreach t in array array['tournament_ocr_files','tournament_digilab_sync','digilab_player_sync','digilab_deck_sync','digilab_deck_catalog','digilab_background_imports','digilab_sync_runs','digilab_sync_events','digilab_sync_state','digilab_catalog_sync_runs'] loop
        if to_regclass('public.'||t) is not null then
            execute format('alter table public.%I enable row level security',t);
            execute format('create trigger site_admin_write before insert or update or delete on public.%I for each row execute function public.guard_site_admin_write()',t);
            execute format('create policy site_private_access on public.%I as restrictive for all to anon,authenticated using(not public.site_accounts_enabled() or public.site_is_admin()) with check(not public.site_accounts_enabled() or public.site_is_admin())',t);
            execute format('create policy site_private_admin on public.%I for all to authenticated using(public.site_is_admin()) with check(public.site_is_admin())',t);
            execute format('grant select,insert,update,delete on public.%I to authenticated',t);
        end if;
    end loop;
    foreach t in array array['tournament_weekly_schedule','decklist_card_metadata','cards_cache','deck_format_rule_versions','tournament_ocr_files','tournament_digilab_sync','digilab_player_sync','digilab_deck_sync','digilab_deck_catalog','digilab_background_imports','digilab_sync_runs','digilab_sync_events','digilab_sync_state','digilab_catalog_sync_runs','feedback_submissions'] loop
        if to_regclass('public.'||t) is not null then
            execute format('create trigger site_audit_change after insert or update or delete on public.%I for each row execute function site_audit.capture(''name'',''code'',''is_active'',''player_id'',''tournament_id'',''deck_id'',''card_code'',''card_level'',''restriction'',''status'',''source'',''rules_revision'',''rules'')',t);
        end if;
    end loop;
    foreach t in array array['players','stores','decks','deck_images','deck_families','formats','deck_formats','ban_list','tournament','tournament_results','decklists','decklist_cards','tournament_weekly_schedule'] loop
        if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||t) and attname='id' and not attisdropped) then
            seq:=pg_get_serial_sequence('public.'||t,'id');
            if seq is not null then execute 'grant usage,select on sequence '||seq||' to authenticated'; end if;
        end if;
    end loop;
end;
$$;

do $$
begin
    if to_regclass('storage.objects') is not null then
        execute 'create trigger site_storage_write before insert or update or delete on storage.objects for each row execute function public.guard_site_admin_write()';
        execute 'create policy site_storage_insert on storage.objects as restrictive for insert to anon,authenticated with check(not public.site_accounts_enabled() or public.site_is_admin())';
        execute 'create policy site_storage_update on storage.objects as restrictive for update to anon,authenticated using(not public.site_accounts_enabled() or public.site_is_admin()) with check(not public.site_accounts_enabled() or public.site_is_admin())';
        execute 'create policy site_storage_delete on storage.objects as restrictive for delete to anon,authenticated using(not public.site_accounts_enabled() or public.site_is_admin())';
        execute 'create policy site_storage_admin on storage.objects for all to authenticated using(public.site_is_admin()) with check(public.site_is_admin())';
        execute 'create trigger site_storage_audit after insert or update or delete on storage.objects for each row execute function site_audit.capture(''bucket_id'',''name'',''owner_id'')';
    end if;
end;
$$;

commit;
