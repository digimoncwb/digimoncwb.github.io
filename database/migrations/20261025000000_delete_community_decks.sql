begin;

-- Keep public DELETE protection intact; administrators use this narrowly scoped RPC.
create or replace function public.delete_community_deck(
    p_decklist_id bigint,
    p_updated_at timestamptz
) returns bigint
language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_updated_at timestamptz;
begin
    if auth.role() is distinct from 'authenticated'
        or not exists (select 1 from public.admin_users where user_id = auth.uid()) then
        raise exception 'Somente administradores podem excluir decks da comunidade.' using errcode = '42501';
    end if;

    select updated_at into current_updated_at from public.decklists
    where id = p_decklist_id and tournament_result_id is null for update;
    if not found then
        raise exception 'Deck da comunidade não encontrado.' using errcode = 'P0002';
    end if;
    if p_updated_at is null or current_updated_at is distinct from p_updated_at then
        raise exception 'Este deck foi alterado. Atualize a lista e confirme a exclusão novamente.' using errcode = '40001';
    end if;

    -- decklist_cards follows the existing ON DELETE CASCADE foreign key.
    delete from public.decklists where id = p_decklist_id and tournament_result_id is null;
    return p_decklist_id;
end;
$$;

revoke all on function public.delete_community_deck(bigint,timestamptz) from public, anon;
grant execute on function public.delete_community_deck(bigint,timestamptz) to authenticated;

commit;
