begin;

-- Editing identity labels neither grants membership nor records legal acceptance.
create or replace function public.update_my_site_profile(p_username text,p_display_name text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result public.user_profiles; username_value text:=lower(btrim(p_username)); display_name_value text:=btrim(p_display_name);
begin
    if not public.site_has_identity() then
        raise exception 'Confirme seu e-mail e use uma conta ativa.' using errcode='42501';
    end if;
    if username_value is null or username_value !~ '^[a-z0-9_-]{3,40}$' then
        raise exception 'Use de 3 a 40 letras minúsculas, números, _ ou - no nome de usuário.' using errcode='22023';
    end if;
    if display_name_value is null or length(display_name_value) not between 1 and 100 then
        raise exception 'Informe um nome de exibição com até 100 caracteres.' using errcode='22023';
    end if;
    update public.user_profiles set username=username_value,display_name=display_name_value,updated_at=now()
    where user_id=auth.uid() returning * into result;
    if not found then raise exception 'Perfil não encontrado.' using errcode='P0002'; end if;
    return to_jsonb(result);
end;
$$;
revoke all on function public.update_my_site_profile(text,text) from public,anon;
grant execute on function public.update_my_site_profile(text,text) to authenticated;
notify pgrst, 'reload schema';

commit;
