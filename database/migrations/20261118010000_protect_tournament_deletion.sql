-- Security fix: delete_tournament_transaction runs as SECURITY DEFINER (bypassing RLS)
-- and was executable by anon without any permission check, so anyone holding the public
-- key could delete any tournament and its results. Require an administrator (or the
-- maintenance role) and stop granting it to anonymous callers.

begin;

create or replace function public.delete_tournament_transaction(p_tournament_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_store_id uuid;
    v_tournament_date date;
    v_storage_paths jsonb;
begin
    if not (public.site_is_admin() or public.site_is_maintenance()) then
        raise exception 'Acesso administrativo necessário.' using errcode = '42501';
    end if;

    select store_id, tournament_date
    into v_store_id, v_tournament_date
    from public.tournament
    where id = p_tournament_id
    for update;

    if not found then
        raise exception 'Tournament % not found', p_tournament_id
            using errcode = 'P0002';
    end if;

    select coalesce(jsonb_agg(storage_path order by id), '[]'::jsonb)
    into v_storage_paths
    from public.tournament_ocr_files
    where tournament_id = p_tournament_id;

    delete from public.tournament_results
    where tournament_id = p_tournament_id
       or (
            tournament_id is null
            and store_id = v_store_id
            and tournament_date = v_tournament_date
       );

    delete from public.tournament
    where id = p_tournament_id;

    return jsonb_build_object(
        'tournament_id', p_tournament_id,
        'storage_paths', v_storage_paths
    );
end;
$$;

revoke all on function public.delete_tournament_transaction(bigint) from public, anon;
grant execute on function public.delete_tournament_transaction(bigint) to authenticated, service_role;

commit;
