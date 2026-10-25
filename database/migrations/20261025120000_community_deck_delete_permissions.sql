begin;

-- Ownership is enforced even while account rollout is disabled.
create or replace function public.site_can_delete_community_deck(p_owner uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
    select auth.uid() is not null and public.site_is_member() and
        case when p_owner is null then public.site_is_admin() else p_owner=auth.uid() end
$$;
revoke all on function public.site_can_delete_community_deck(uuid) from public;
grant execute on function public.site_can_delete_community_deck(uuid) to anon,authenticated;

create or replace function public.guard_community_deck_delete() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if old.tournament_result_id is null and not public.site_is_maintenance()
        and not public.site_can_delete_community_deck(old.owner_user_id) then
        raise exception 'Você só pode excluir seus próprios decks. Administradores também podem excluir decks anônimos.' using errcode='42501';
    end if;
    return old;
end;
$$;
revoke all on function public.guard_community_deck_delete() from public,anon,authenticated;
create trigger community_deck_delete_permission before delete on public.decklists
for each row execute function public.guard_community_deck_delete();

create policy community_deck_delete_permission on public.decklists as restrictive for delete to anon,authenticated
using(tournament_result_id is not null or public.site_can_delete_community_deck(owner_user_id));

create or replace function public.delete_community_deck(p_decklist_id bigint,p_updated_at timestamptz) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare deck public.decklists;
begin
    select * into deck from public.decklists where id=p_decklist_id and tournament_result_id is null for update;
    if not found then raise exception 'Deck da comunidade não encontrado.' using errcode='P0002'; end if;
    if not public.site_can_delete_community_deck(deck.owner_user_id) then
        raise exception 'Você não pode excluir este deck.' using errcode='42501';
    end if;
    if p_updated_at is null or deck.updated_at is distinct from p_updated_at then
        raise exception 'Este deck foi alterado. Atualize a lista.' using errcode='40001';
    end if;
    delete from public.decklists where id=deck.id;
    return deck.id;
end;
$$;

commit;
