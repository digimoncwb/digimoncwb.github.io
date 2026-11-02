begin;

-- Restrictive policies also constrain legacy permissive read policies.
-- Drafting a format changes visibility only; all rules, points, versions and FKs remain.
drop policy if exists published_game_formats_only on public.deck_formats;
create policy published_game_formats_only on public.deck_formats as restrictive
 for select to anon,authenticated
 using(rules_status='published' or public.site_is_admin());

drop policy if exists visible_game_format_versions_only on public.deck_format_rule_versions;
create policy visible_game_format_versions_only on public.deck_format_rule_versions as restrictive
 for select to anon,authenticated
 using(public.site_is_admin() or exists(
  select 1 from public.deck_formats f
  where f.id=deck_format_rule_versions.deck_format_id and f.rules_status='published'
 ));

notify pgrst,'reload schema';
commit;
