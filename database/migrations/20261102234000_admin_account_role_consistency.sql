begin;

-- Manual grants are authorized by an existing admin and do not depend on the target's login provider.
-- Automatic Google claims and the reserved-player list keep their existing rules.
create or replace function public.admin_update_site_account(p_user_id uuid,p_status text,p_is_admin boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare profile public.user_profiles;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(868601);
 select * into profile from public.user_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Conta não encontrada.'; end if;
 if p_is_admin is true then
  if profile.player_id is null or coalesce(p_status,profile.status)<>'active'
   or not exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
    and u.email is not null and u.email not like '%@admin.digistats.local') then
   raise exception 'Selecione uma conta ativa, com e-mail confirmado e jogador vinculado.';
  end if;
  update public.player_admin_grants set enabled=true where player_id=profile.player_id;
  insert into public.admin_users(user_id,username,display_name,created_by)
  values(p_user_id,profile.username,profile.display_name,auth.uid()) on conflict(user_id) do nothing;
 elsif p_is_admin is false then
  update public.player_admin_grants set enabled=false where player_id=profile.player_id;
  delete from public.admin_users where user_id=p_user_id;
 end if;
 if p_status is not null then update public.user_profiles set status=p_status,updated_at=now() where user_id=p_user_id; end if;
 perform public.sync_player_admin_user(p_user_id);
 if public.site_active_admin_count()<1 then raise exception 'A última conta administrativa ativa não pode perder o acesso.'; end if;
end $$;

create or replace function public.admin_list_player_admins() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not public.site_is_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from (
  select g.player_id,p.name as player_name,p.bandai_nick,g.username,g.enabled,
   exists(select 1 from public.admin_users a where a.admin_player_id=g.player_id) as claimed,
   exists(select 1 from public.user_profiles u where u.player_id=g.player_id) as linked,
   exists(select 1 from public.user_profiles u join public.admin_users a on a.user_id=u.user_id
    join auth.users au on au.id=u.user_id where u.player_id=g.player_id and u.status='active' and au.email_confirmed_at is not null) as is_admin
  from public.player_admin_grants g join public.players p on p.id=g.player_id order by p.name
 ) rows;
 return result;
end $$;
revoke all on function public.admin_update_site_account(uuid,text,boolean),public.admin_list_player_admins() from public,anon,authenticated;
grant execute on function public.admin_update_site_account(uuid,text,boolean),public.admin_list_player_admins() to authenticated;
notify pgrst,'reload schema';
commit;
