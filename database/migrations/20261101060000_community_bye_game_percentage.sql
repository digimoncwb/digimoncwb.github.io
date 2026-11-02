begin;

-- Community BO3 policy: a bye is a 2-0 win for GW%, with no fictional opponent.
-- Keep the previous preview profile reproducible for completed events.
alter table public.community_events alter column rules_version set default 'community-bo3-50-5-preview-v2';
with upgraded as (
 update public.community_events set rules_version='community-bo3-50-5-preview-v2',revision=revision+1
 where rules_version='community-bo3-50-5-preview-v1' and status in ('draft','published','running')
 returning id
)
insert into public.community_audit(event_id,actor,action,details)
 select id,null,'rules_updated',jsonb_build_object('from','community-bo3-50-5-preview-v1','to','community-bo3-50-5-preview-v2','reason','Bye conta como vitória de 2–0 no GW%.') from upgraded;

create or replace function public.community_standings(p_event uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 with scores as (
  select e.id,e.player_id,e.checked_in,e.dropped,p.name,p.bandai_id,p.digilab_name,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then 3
    when (case when m.p1=e.id then m.wins-m.losses else m.losses-m.wins end)>0 then 3
    when m.wins=m.losses then 1 else 0 end),0)::integer points,
   count(m.id) filter(where m.p2 is null)::integer byes,
   count(m.id) filter(where m.p2 is not null)::numeric played,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then case when rules.include_bye_games then 6 else 0 end
    when m.p1=e.id then 3*m.wins+m.draws else 3*m.losses+m.draws end),0)::numeric game_points,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then case when rules.include_bye_games then 2 else 0 end
    else m.wins+m.losses+m.draws end),0)::numeric games
  from public.community_entries e join public.players p on p.id=e.player_id
  cross join (select rules_version='community-bo3-50-5-preview-v2' as include_bye_games from public.community_events where id=p_event) rules
  left join public.community_matches m on m.event_id=e.event_id and (m.p1=e.id or m.p2=e.id) and m.status='confirmed'
  where e.event_id=p_event group by e.id,p.id
 ), rates as (
  select *,coalesce((points-3*byes)/(3*nullif(played,0)),0) mw,coalesce(game_points/(3*nullif(games,0)),0) gw from scores
 ), ranked as (
  select a.*,coalesce(avg(greatest(b.mw,0.33)) filter(where b.id is not null),0) omw,coalesce(avg(greatest(b.gw,0.33)) filter(where b.id is not null),0) ogw
  from rates a left join public.community_matches m on m.event_id=p_event and m.status='confirmed' and m.p2 is not null and (m.p1=a.id or m.p2=a.id)
  left join rates b on b.id=case when m.p1=a.id then m.p2 else m.p1 end group by a.id,a.player_id,a.checked_in,a.dropped,a.name,a.bandai_id,a.digilab_name,a.points,a.byes,a.played,a.game_points,a.games,a.mw,a.gw
 ) select coalesce(jsonb_agg(to_jsonb(r) order by r.points desc,r.omw desc,r.gw desc,r.ogw desc,r.id),'[]') from ranked r
$$;

revoke all on function public.community_standings(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
