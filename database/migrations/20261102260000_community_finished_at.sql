begin;

alter table public.community_events add column if not exists finished_at timestamptz;

-- Recover actual completion times instead of restarting the notice window on deployment.
update public.community_events e set finished_at=(
 select max(a.created_at) from public.community_audit a where a.event_id=e.id and a.action='finish'
) where e.status='finished' and e.finished_at is null;

create or replace function public.community_set_finished_at()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.status='finished' then
  if old.status is distinct from 'finished' then new.finished_at:=now();
  else new.finished_at:=old.finished_at;
  end if;
 else new.finished_at:=null;
 end if;
 return new;
end $$;
drop trigger if exists community_event_finished_at on public.community_events;
create trigger community_event_finished_at before update of status on public.community_events
for each row execute function public.community_set_finished_at();
revoke all on function public.community_set_finished_at() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
