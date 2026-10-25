begin;

-- A verified player/account link is the identity boundary. Names alone never
-- establish ownership, and explicit owners (including transfers) always win.
create or replace function public.reconcile_linked_player_deck_ownership(p_player_id uuid default null)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare deck record; affected integer:=0;
    previous_transfer text:=current_setting('app.site_owner_transfer',true);
begin
    if not (public.site_is_maintenance() or public.site_is_admin()) then
        raise exception 'Acesso administrativo necessário.' using errcode='42501';
    end if;
    perform set_config('app.site_owner_transfer','approved',true);
    for deck in
        update public.decklists d set owner_user_id=p.user_id,
            updated_at=now(),draft_revision=d.draft_revision+1
        from public.user_profiles p join auth.users u on u.id=p.user_id
        where d.tournament_result_id is null and d.owner_user_id is null
            and d.creator_player_id=p.player_id and p.status='active'
            and u.email_confirmed_at is not null
            and u.email not like '%@admin.digistats.local'
            and (p_player_id is null or p.player_id=p_player_id)
        returning d.id,d.owner_user_id,d.creator_player_id
    loop
        affected:=affected+1;
        perform site_audit.record('deck.ownership_reconciled','decklists',deck.id::text,
            jsonb_build_object('owner_user_id',deck.owner_user_id,
                'player_id',deck.creator_player_id,'reason','Conta vinculada ao autor cadastrado'));
        update public.account_requests set
            status=case when user_id=deck.owner_user_id then 'approved' else 'rejected' end,
            reviewed_by=auth.uid(),reviewed_at=now(),
            review_note='Propriedade reconciliada com a conta vinculada ao autor cadastrado.'
        where request_type='deck_claim' and decklist_id=deck.id and status='pending';
    end loop;
    perform set_config('app.site_owner_transfer',coalesce(previous_transfer,''),true);
    return affected;
end;
$$;
revoke all on function public.reconcile_linked_player_deck_ownership(uuid) from public,anon,authenticated;

create or replace function public.sync_linked_player_deck_ownership() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if public.site_is_maintenance() or public.site_is_admin() then
        if tg_table_name='user_profiles' then
            if new.player_id is not null and new.status='active' then
                perform public.reconcile_linked_player_deck_ownership(new.player_id);
            end if;
        elsif new.creator_player_id is not null and new.owner_user_id is null
            and new.tournament_result_id is null then
            perform public.reconcile_linked_player_deck_ownership(new.creator_player_id);
        end if;
    end if;
    return new;
end;
$$;
revoke all on function public.sync_linked_player_deck_ownership() from public,anon,authenticated;
create trigger site_linked_player_deck_ownership
after insert or update of player_id,status on public.user_profiles
for each row execute function public.sync_linked_player_deck_ownership();
create trigger site_author_deck_ownership
after insert or update of creator_player_id,tournament_result_id on public.decklists
for each row execute function public.sync_linked_player_deck_ownership();

select public.reconcile_linked_player_deck_ownership();
commit;
