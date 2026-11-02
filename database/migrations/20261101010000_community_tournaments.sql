begin;

create table if not exists public.community_events (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 3 and 120),
 organizer text not null default 'Digimon CWB', limitless_organization_id integer not null default 2806,
 store_id uuid references public.stores(id), location text not null default '',
 modality text not null check(modality in ('presencial','online')), starts_at timestamptz not null,
 event_type text not null, format_id bigint not null references public.formats(id), capacity integer not null check(capacity between 4 and 128),
 status text not null default 'draft' check(status in ('draft','published','running','finished','cancelled')),
 registration_open boolean not null default false, checkin_open boolean not null default false,
 rounds integer, initial_players integer, revision integer not null default 0,
 rules_version text not null default 'community-bo3-50-5-preview-v1',
 final_order jsonb, final_snapshot jsonb, digilab_id bigint unique, canonical_tournament_id bigint unique references public.tournament(id),
 reconciliation text not null default 'pending' check(reconciliation in ('pending','review','matched')),
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.community_entries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.community_events(id) on delete cascade,
 player_id uuid not null references public.players(id), checked_in boolean not null default false, dropped boolean not null default false,
 deck_id uuid references public.decks(id), decklist text not null default '' check(length(decklist)<=20000),
 created_at timestamptz not null default now(), unique(event_id,player_id)
);
create table if not exists public.community_rounds (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.community_events(id) on delete cascade,
 number integer not null check(number between 1 and 7), status text not null default 'paired' check(status in ('paired','running','closed')),
 seed text not null, started_at timestamptz, ends_at timestamptz, overtime_ends_at timestamptz,
 unique(event_id,number)
);
create table if not exists public.community_matches (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.community_events(id) on delete cascade,
 round_id uuid not null references public.community_rounds(id) on delete cascade,
 table_number integer not null, p1 uuid not null references public.community_entries(id), p2 uuid references public.community_entries(id),
 wins integer, losses integer, draws integer,
 status text not null default 'pending' check(status in ('pending','proposed','contested','confirmed')),
 proposed_by uuid references public.community_entries(id), reason text not null default '',
 check(p2 is null or p1<>p2), unique(round_id,table_number),
 check ((wins is null and losses is null and draws is null) or
   (wins between 0 and 2 and losses between 0 and 2 and draws between 0 and 1 and wins+losses+draws between 1 and 3 and not(wins=2 and losses=2)))
);
create table if not exists public.community_audit (
 id bigint generated always as identity primary key, event_id uuid not null references public.community_events(id),
 actor uuid references auth.users(id) on delete set null, action text not null, details jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.community_exports (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.community_events(id),
 revision integer not null, header jsonb not null, body text not null, created_at timestamptz not null default now()
);
alter table public.community_matches add column if not exists revision integer not null default 0;
create index if not exists community_entries_event_idx on public.community_entries(event_id);
create index if not exists community_matches_event_round_idx on public.community_matches(event_id,round_id);
create index if not exists community_events_registration_idx on public.community_events(starts_at) where status='published' and registration_open;

alter table public.community_events enable row level security;
alter table public.community_entries enable row level security;
alter table public.community_rounds enable row level security;
alter table public.community_matches enable row level security;
alter table public.community_audit enable row level security;
alter table public.community_exports enable row level security;
revoke all on public.community_events,public.community_entries,public.community_rounds,public.community_matches,public.community_audit,public.community_exports from public,anon,authenticated;

create or replace function public.community_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and public.site_has_identity() and public.site_is_admin()
$$;

-- Preview profile only. Exact TCG+ equivalence must be validated against real reference events.
-- Exclude byes; use 3/1/0 per game and a 0.33 opponent floor. Never round before sorting.
create or replace function public.community_standings(p_event uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 with scores as (
  select e.id,e.player_id,e.checked_in,e.dropped,p.name,p.bandai_id,p.digilab_name,
   coalesce(sum(case when m.id is null then 0 when m.p2 is null then 3
    when (case when m.p1=e.id then m.wins-m.losses else m.losses-m.wins end)>0 then 3
    when m.wins=m.losses then 1 else 0 end),0)::integer points,
   count(m.id) filter(where m.p2 is null)::integer byes,
   count(m.id) filter(where m.p2 is not null)::numeric played,
   coalesce(sum(case when m.p2 is null then 0 when m.p1=e.id then 3*m.wins+m.draws else 3*m.losses+m.draws end),0)::numeric game_points,
   coalesce(sum(case when m.p2 is null then 0 else m.wins+m.losses+m.draws end),0)::numeric games
  from public.community_entries e join public.players p on p.id=e.player_id
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

create or replace function public.community_list(p_admin boolean default false) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_admin and not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)-'final_snapshot' order by x.starts_at),'[]') from (
  select e.*,f.code format_code,s.name store_name,(select count(*) from public.community_entries n where n.event_id=e.id)::integer registered,
   exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and u.user_id=auth.uid()) enrolled
  from public.community_events e join public.formats f on f.id=e.format_id left join public.stores s on s.id=e.store_id
  where p_admin or (e.status='published' and e.registration_open)
 ) x);
end $$;

create or replace function public.community_snapshot(p_event uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.community_events; mine uuid; admin boolean:=public.community_admin(); result jsonb;
begin
 select * into e from public.community_events where id=p_event;
 if not found or (e.status='draft' and not admin) then raise exception 'Torneio indisponível.'; end if;
 select p.player_id into mine from public.user_profiles p where user_id=auth.uid();
 select jsonb_build_object('server_now',statement_timestamp(),'event',(to_jsonb(e)-'final_snapshot')||jsonb_build_object('format_code',f.code,'store_name',s.name),
  'entries',coalesce((select jsonb_agg((to_jsonb(n)-'decklist')||jsonb_build_object('name',p.name,'bandai_id',case when admin or p.id=mine then p.bandai_id else null end,
   'decklist',case when admin or p.id=mine then n.decklist else null end)) from public.community_entries n join public.players p on p.id=n.player_id where n.event_id=e.id),'[]'),
  'rounds',coalesce((select jsonb_agg(to_jsonb(r) order by number) from public.community_rounds r where r.event_id=e.id),'[]'),
  'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.table_number) from public.community_matches m where m.event_id=e.id),'[]'),
  'standings',case when admin then coalesce(e.final_snapshot,public.community_standings(e.id)) else coalesce((select jsonb_agg(v-'bandai_id') from jsonb_array_elements(coalesce(e.final_snapshot,public.community_standings(e.id))) v),'[]') end,
  'exports',case when admin then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.community_exports x where x.event_id=e.id),'[]') else '[]'::jsonb end,
  'audit',case when admin then coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select id,actor,action,created_at,details-'decklist' as details from public.community_audit where event_id=e.id order by id desc limit 100) x),'[]') else '[]'::jsonb end)
 into result from public.formats f left join public.stores s on s.id=e.store_id where f.id=e.format_id;
 return result;
end $$;

create or replace function public.community_create(p_data jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 insert into public.community_events(name,store_id,location,modality,starts_at,event_type,format_id,capacity,created_by)
 values(btrim(p_data->>'name'),nullif(p_data->>'store_id','')::uuid,left(coalesce(p_data->>'location',''),500),p_data->>'modality',
 (p_data->>'starts_at')::timestamptz,p_data->>'event_type',(p_data->>'format_id')::bigint,(p_data->>'capacity')::integer,auth.uid()) returning id into target;
 insert into public.community_audit(event_id,actor,action,details) values(target,auth.uid(),'create',p_data);
 return target;
end $$;

create or replace function public.community_command(p_event uuid,p_action text,p_data jsonb default '{}',p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; r public.community_rounds; m public.community_matches; admin boolean:=public.community_admin();
 me uuid; entry uuid; count_players integer; next_round integer; pair jsonb; pair_ids uuid[]:='{}'; a uuid; b uuid;
 w integer; l integer; d integer; standings jsonb; ordered jsonb; line text; header jsonb; actor_entry uuid; v_reason text:=btrim(coalesce(p_data->>'reason',''));
begin
 if auth.uid() is null or not public.site_has_identity() then raise exception 'Entre com uma conta ativa.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found then raise exception 'Torneio indisponível.'; end if;
 -- Independent registrations/results must not conflict merely because another table changed.
 -- Capacity is serialized by the event lock; result writes also check their own revision below.
 if p_revision is null or (e.revision<>p_revision and p_action not in ('register','checkin','propose','confirm','contest')) then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select player_id into me from public.user_profiles where user_id=auth.uid();
 select id into actor_entry from public.community_entries where event_id=e.id and player_id=me;
 if p_action not in ('register','checkin','drop','deck','propose','confirm','contest') and not admin then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 if e.status in ('finished','cancelled') and p_action not in ('export','link_digilab','reconcile') then raise exception 'O torneio está encerrado.'; end if;

 if p_action in ('register','add_player') then
  if e.status not in ('draft','published') or (not admin and (e.status<>'published' or not e.registration_open)) then raise exception 'Inscrições encerradas.'; end if;
  if p_action='register' and me is null then raise exception 'Vincule sua conta a um jogador.' using errcode='42501'; end if;
  a:=case when p_action='add_player' then (p_data->>'player_id')::uuid else me end;
  if exists(select 1 from public.community_entries where event_id=e.id and player_id=a) then raise exception 'Jogador já inscrito.'; end if;
  if (select count(*) from public.community_entries where event_id=e.id)>=e.capacity then raise exception 'Vagas esgotadas.'; end if;
  insert into public.community_entries(event_id,player_id) values(e.id,a);
 elsif p_action='configure' then
  if e.status not in ('draft','published') then raise exception 'Configuração bloqueada após o início.'; end if;
  if (p_data->>'capacity')::integer < (select count(*) from public.community_entries where event_id=e.id) then raise exception 'A capacidade não pode ser menor que as inscrições existentes.'; end if;
  update public.community_events set name=btrim(p_data->>'name'),store_id=nullif(p_data->>'store_id','')::uuid,
   location=left(coalesce(p_data->>'location',''),500),modality=p_data->>'modality',starts_at=(p_data->>'starts_at')::timestamptz,
   event_type=p_data->>'event_type',format_id=(p_data->>'format_id')::bigint,capacity=(p_data->>'capacity')::integer where id=e.id;
 elsif p_action='publish' then
  if e.status<>'draft' then raise exception 'O evento já foi publicado.'; end if;
  update public.community_events set status='published' where id=e.id;
 elsif p_action='registration' then
  if e.status<>'published' then raise exception 'Publique o evento antes de abrir inscrições.'; end if;
  update public.community_events set registration_open=(p_data->>'open')::boolean where id=e.id;
 elsif p_action='checkin_window' then
  if e.status<>'published' then raise exception 'Check-in indisponível.'; end if;
  update public.community_events set checkin_open=(p_data->>'open')::boolean where id=e.id;
 elsif p_action='checkin' then
  if e.status not in ('draft','published') or (not admin and not e.checkin_open) then raise exception 'Check-in encerrado.'; end if;
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  update public.community_entries set checked_in=coalesce((p_data->>'checked')::boolean,true) where id=entry and event_id=e.id;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='deck' then
  if not admin and e.status not in ('draft','published') then raise exception 'Deck bloqueado após o início.'; end if;
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  update public.community_entries set deck_id=nullif(p_data->>'deck_id','')::uuid,decklist=coalesce(p_data->>'decklist','') where id=entry and event_id=e.id;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='start' then
  if e.status<>'published' then raise exception 'Publique o evento antes de iniciar.'; end if;
  select count(*) into count_players from public.community_entries where event_id=e.id and checked_in and not dropped;
  if count_players<4 or count_players>128 then raise exception 'Confirme de 4 a 128 participantes.'; end if;
  update public.community_events set status='running',registration_open=false,checkin_open=false,initial_players=count_players,
   rounds=case when count_players<=8 then 3 when count_players<=16 then 4 when count_players<=32 then 5 when count_players<=64 then 6 else 7 end where id=e.id;
 elsif p_action='drop' then
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  if exists(select 1 from public.community_matches mm join public.community_rounds rr on rr.id=mm.round_id where mm.event_id=e.id and rr.status<>'closed' and (mm.p1=entry or mm.p2=entry) and mm.status<>'confirmed') then raise exception 'Resolva a partida atual com a organização antes de desistir.'; end if;
  if e.status in ('draft','published') then
   delete from public.community_entries where id=entry and event_id=e.id;
  else
   update public.community_entries set dropped=true where id=entry and event_id=e.id;
  end if;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='pair' then
  if e.status<>'running' or exists(select 1 from public.community_rounds where event_id=e.id and status<>'closed') then raise exception 'Encerre a rodada anterior.'; end if;
  select coalesce(max(number),0)+1 into next_round from public.community_rounds where event_id=e.id;
  if next_round>e.rounds then raise exception 'Todas as rodadas já foram realizadas.'; end if;
  if jsonb_typeof(p_data->'pairs') is distinct from 'array' then raise exception 'Mesas inválidas.'; end if;
  for pair in select value from jsonb_array_elements(p_data->'pairs') loop
   a:=(pair->>'p1')::uuid; b:=nullif(pair->>'p2','')::uuid;
   if a is null or a=any(pair_ids) or b=a or (b is not null and b=any(pair_ids)) then raise exception 'Participante repetido nas mesas.'; end if;
   if not exists(select 1 from public.community_entries where id=a and event_id=e.id and checked_in and not dropped) or
    (b is not null and not exists(select 1 from public.community_entries where id=b and event_id=e.id and checked_in and not dropped)) then raise exception 'Participante inativo ou de outro evento.'; end if;
   if v_reason='' and b is not null and exists(select 1 from public.community_matches where event_id=e.id and ((p1=a and p2=b) or(p1=b and p2=a))) then raise exception 'Reencontro exige justificativa da organização.'; end if;
   pair_ids:=array_append(pair_ids,a); if b is not null then pair_ids:=array_append(pair_ids,b); end if;
  end loop;
  select count(*) into count_players from public.community_entries where event_id=e.id and checked_in and not dropped;
  if count_players<2 or cardinality(pair_ids)<>count_players or jsonb_array_length(p_data->'pairs')<>(count_players+1)/2 then raise exception 'Informe todas as mesas e no máximo um bye.'; end if;
  -- Automatic byes may not be repeated while an active player has fewer byes.
  if v_reason='' and exists(select 1 from jsonb_array_elements(p_data->'pairs') q where q->>'p2' is null and
    (select count(*) from public.community_matches where event_id=e.id and p1=(q->>'p1')::uuid and p2 is null)>
    (select min(x.n) from (select (select count(*) from public.community_matches where event_id=e.id and p1=n.id and p2 is null) n from public.community_entries n where event_id=e.id and checked_in and not dropped) x)) then raise exception 'Bye repetido exige justificativa.'; end if;
  insert into public.community_rounds(event_id,number,seed) values(e.id,next_round,left(coalesce(p_data->>'seed','manual'),100)) returning * into r;
  count_players:=0;
  for pair in select value from jsonb_array_elements(p_data->'pairs') loop
   count_players:=count_players+1; a:=(pair->>'p1')::uuid; b:=nullif(pair->>'p2','')::uuid;
   insert into public.community_matches(event_id,round_id,table_number,p1,p2,wins,losses,draws,status,reason)
    values(e.id,r.id,count_players,a,b,case when b is null then 2 end,case when b is null then 0 end,case when b is null then 0 end,case when b is null then 'confirmed' else 'pending' end,v_reason);
  end loop;
 elsif p_action in ('start_round','close_round','adjust_clock','undo_round','reopen_round') then
  select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
  if not found then raise exception 'Rodada não encontrada.'; end if;
  if p_action='start_round' then
   if r.status<>'paired' then raise exception 'Rodada já iniciada.'; end if;
   update public.community_rounds set status='running',started_at=now(),ends_at=now()+interval '50 minutes',overtime_ends_at=now()+interval '55 minutes' where id=r.id;
  elsif p_action='reopen_round' then
   if r.status<>'closed' or v_reason='' then raise exception 'Justifique a reabertura da última rodada encerrada.'; end if;
   update public.community_rounds set status='running' where id=r.id;
  elsif p_action='adjust_clock' then
   if r.status<>'running' or v_reason='' or (p_data->>'seconds') is null or abs((p_data->>'seconds')::integer)>3600 then raise exception 'Informe ajuste de até uma hora e justificativa.'; end if;
   update public.community_rounds set ends_at=ends_at+make_interval(secs=>(p_data->>'seconds')::integer),overtime_ends_at=overtime_ends_at+make_interval(secs=>(p_data->>'seconds')::integer) where id=r.id;
  elsif p_action='undo_round' then
   if v_reason='' then raise exception 'Justifique a invalidação da última rodada.'; end if;
   insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'invalidated_round_snapshot',
    jsonb_build_object('round',to_jsonb(r),'matches',(select jsonb_agg(to_jsonb(mm)) from public.community_matches mm where mm.round_id=r.id),'reason',v_reason));
   delete from public.community_rounds where id=r.id;
  else
   if r.status<>'running' or exists(select 1 from public.community_matches where round_id=r.id and status<>'confirmed') then raise exception 'Resolva todos os resultados da rodada.'; end if;
   update public.community_rounds set status='closed' where id=r.id;
  end if;
 elsif p_action in ('propose','confirm','contest','resolve') then
  select * into m from public.community_matches where id=(p_data->>'match_id')::uuid and event_id=e.id for update;
  if not found or m.p2 is null then raise exception 'Partida inválida.'; end if;
  if (p_data->>'match_revision') is null or (p_data->>'match_revision')::integer<>m.revision then raise exception 'O placar mudou. Atualize antes de confirmar ou corrigir.' using errcode='40001'; end if;
  select * into r from public.community_rounds where id=m.round_id;
  if r.status<>'running' then raise exception 'A rodada não está em andamento. Invalide as rodadas posteriores para corrigir.'; end if;
  if not admin and (actor_entry is null or actor_entry not in (m.p1,m.p2)) then raise exception 'Você não participa desta partida.' using errcode='42501'; end if;
  if p_action in ('propose','resolve') then
   if p_action='resolve' and not admin then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
   if p_action='propose' and m.status<>'pending' then raise exception 'Já existe resultado. Confirme ou conteste.'; end if;
   if p_action='resolve' and v_reason='' then raise exception 'Justifique a decisão.'; end if;
   if p_action='resolve' then
    insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'match_before_resolution',to_jsonb(m));
   end if;
   w:=(p_data->>'wins')::integer; l:=(p_data->>'losses')::integer; d:=(p_data->>'draws')::integer;
   if w is null or l is null or d is null then raise exception 'Informe o placar completo.'; end if;
   if not admin and w<2 and l<2 and now()<r.ends_at then raise exception 'Placar incompleto: aguarde o limite de tempo ou procure a organização.'; end if;
   if not admin and d>0 and now()<r.overtime_ends_at then raise exception 'O jogo empatado por tempo só deve ser informado após o overtime.'; end if;
   if not admin and actor_entry=m.p2 then count_players:=w; w:=l; l:=count_players; end if;
   update public.community_matches set wins=w,losses=l,draws=d,status=case when p_action='resolve' then 'confirmed' else 'proposed' end,proposed_by=actor_entry,reason=v_reason,revision=revision+1 where id=m.id;
  else
   if m.status<>'proposed' or actor_entry=m.proposed_by or actor_entry is null then raise exception 'Somente o adversário pode confirmar ou contestar a proposta.'; end if;
   update public.community_matches set status=case when p_action='confirm' then 'confirmed' else 'contested' end,revision=revision+1 where id=m.id;
  end if;
 elsif p_action='finish' then
  if e.status<>'running' or (select count(*) from public.community_rounds where event_id=e.id and status='closed')<>e.rounds then raise exception 'Conclua todas as rodadas.'; end if;
  standings:=public.community_standings(e.id);
  select coalesce(jsonb_agg(v->>'id'),'[]') into ordered from jsonb_array_elements(standings) v where (v->>'checked_in')::boolean;
  if p_data ? 'order' then
   if jsonb_typeof(p_data->'order')<>'array' or jsonb_array_length(p_data->'order')<>jsonb_array_length(ordered) or
    exists(select 1 from jsonb_array_elements_text(ordered) x where not (p_data->'order') ? x) or
    (select count(distinct x) from jsonb_array_elements_text(p_data->'order') x)<>jsonb_array_length(ordered) or v_reason='' then raise exception 'Ordem final inválida ou sem justificativa.'; end if;
   ordered:=p_data->'order';
  end if;
  -- Explicit staff review is required while the TCG+ reference validation remains pending.
  if coalesce((p_data->>'reviewed')::boolean,false)=false or v_reason='' then raise exception 'Revise e justifique a classificação final (perfil TCG+ ainda não homologado).'; end if;
  update public.community_events set status='finished',final_order=ordered,final_snapshot=standings where id=e.id;
 elsif p_action='export' then
  if e.status<>'finished' then raise exception 'Finalize e revise o torneio antes de copiar.'; end if;
  standings:=e.final_snapshot;
  select string_agg(o.ordinality::text||' '||regexp_replace(btrim(coalesce(nullif(btrim(s->>'digilab_name'),''),s->>'name')),'\s+',' ','g')||
   case when nullif(btrim(s->>'bandai_id'),'') is null then '' else ' #'||regexp_replace(btrim(s->>'bandai_id'),'^#+','') end||' '||(s->>'points'),E'\n' order by o.ordinality)
   into line from jsonb_array_elements_text(e.final_order) with ordinality o(id,ordinality) join jsonb_array_elements(standings) s on s->>'id'=o.id;
  header:=jsonb_build_object('store_id',e.store_id,'organizer',e.organizer,'type',e.event_type,'date',(e.starts_at at time zone 'America/Sao_Paulo')::date,
   'format',(select code from public.formats where id=e.format_id),'rounds',e.rounds,'players',e.initial_players);
  insert into public.community_exports(event_id,revision,header,body) values(e.id,e.revision,header,line);
 elsif p_action='link_digilab' then
  if e.status<>'finished' or (p_data->>'digilab_id')::bigint<=0 then raise exception 'Informe o ID DigiLab de um evento finalizado.'; end if;
  update public.community_events set digilab_id=(p_data->>'digilab_id')::bigint,reconciliation='pending' where id=e.id;
 elsif p_action='cancel' then
  update public.community_events set status='cancelled',registration_open=false,checkin_open=false where id=e.id;
 else raise exception 'Ação desconhecida.';
 end if;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),p_action,p_data-'decklist');
 return public.community_snapshot(e.id);
end $$;

revoke all on function public.community_admin(),public.community_standings(uuid),public.community_list(boolean),public.community_snapshot(uuid),public.community_create(jsonb),public.community_command(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.community_list(boolean),public.community_snapshot(uuid) to anon,authenticated;
grant execute on function public.community_create(jsonb),public.community_command(uuid,text,jsonb,integer) to authenticated;
commit;
