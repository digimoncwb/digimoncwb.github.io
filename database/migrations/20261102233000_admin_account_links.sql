begin;

create or replace function public.admin_list_account_links(p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
  select p.user_id,p.username,p.display_name,p.status,p.player_id,pl.name as player_name,pl.bandai_nick,pl.bandai_id
  from public.user_profiles p left join public.players pl on pl.id=p.player_id
  where p.username ilike '%'||left(p_search,100)||'%' or p.display_name ilike '%'||left(p_search,100)||'%'
   or pl.name ilike '%'||left(p_search,100)||'%' or pl.bandai_nick ilike '%'||left(p_search,100)||'%'
  order by p.display_name,p.user_id limit 50 offset greatest(0,least(p_offset,100000))
 ) rows;
 return result;
end $$;

create or replace function public.admin_search_link_players(p_search text,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 if length(btrim(p_search))<2 then return '[]'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
  select pl.id,pl.name,pl.bandai_nick,pl.bandai_id from public.players pl
  where coalesce(pl.is_active,true) and (pl.name ilike '%'||left(p_search,100)||'%'
   or pl.bandai_nick ilike '%'||left(p_search,100)||'%' or pl.bandai_id ilike '%'||left(p_search,100)||'%')
   and not exists(select 1 from public.user_profiles p where p.player_id=pl.id and p.user_id<>p_user_id)
  order by pl.name,pl.id limit 10
 ) rows;
 return result;
end $$;

create or replace function public.admin_set_account_player(p_user_id uuid,p_player_id uuid,p_expected_player_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(868601);
 select * into profile from public.user_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Conta não encontrada.'; end if;
 if profile.player_id is distinct from p_expected_player_id then raise exception 'O vínculo mudou. Atualize antes de continuar.' using errcode='40001'; end if;
 if profile.player_id is not distinct from p_player_id then return; end if;
 if p_player_id is not null then
  if profile.status<>'active' or not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then
   raise exception 'Selecione uma conta ativa com e-mail confirmado.'; end if;
  if not exists(select 1 from public.players where id=p_player_id and coalesce(is_active,true)) then raise exception 'Jogador indisponível.'; end if;
  if exists(select 1 from public.user_profiles where player_id=p_player_id and user_id<>p_user_id) then raise exception 'Este jogador já está vinculado a outra conta.'; end if;
 end if;
 update public.user_profiles set player_id=p_player_id,updated_at=now() where user_id=p_user_id;
 if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
 perform site_audit.record('account.player_link.updated','user_profiles',p_user_id::text,
  jsonb_build_object('player_id',jsonb_build_object('before',profile.player_id,'after',p_player_id)));
exception when unique_violation then raise exception 'Este jogador já está vinculado a outra conta.';
end $$;

revoke all on function public.admin_list_account_links(text,integer),public.admin_search_link_players(text,uuid),public.admin_set_account_player(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_list_account_links(text,integer),public.admin_search_link_players(text,uuid),public.admin_set_account_player(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
