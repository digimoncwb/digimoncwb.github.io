-- Hardening from the November database audit. Legacy policies still let anonymous
-- visitors write to tournaments, results, players, decks, decklists, formats, the ban
-- list, OCR files and the weekly schedule, and anon kept ALL privileges on those
-- tables. Today restrictive "site_*" policies block those writes only while site
-- accounts are enabled; disabling accounts would reopen them. Remove anonymous write
-- access itself so protection no longer depends on that switch. Reads are unchanged.

begin;

-- 1. Write policies: drop the ones that only serve anon; keep the others for
--    signed-in users only (restrictive policies still require admin or deck owner).
do $$
declare
    policy record;
begin
    for policy in
        select schemaname, tablename, policyname, roles
        from pg_policies
        where schemaname = 'public'
            and permissive = 'PERMISSIVE'
            and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
            and ('anon' = any (roles) or 'public' = any (roles))
    loop
        if policy.roles = array['anon']::name[] then
            execute format('drop policy %I on %I.%I',
                policy.policyname, policy.schemaname, policy.tablename);
        else
            execute format('alter policy %I on %I.%I to authenticated',
                policy.policyname, policy.schemaname, policy.tablename);
        end if;
    end loop;
end;
$$;

-- 2. Privileges: anon keeps SELECT only, on tables, views and sequences.
revoke insert, update, delete, truncate, trigger, references
    on all tables in schema public from anon;
revoke update, usage on all sequences in schema public from anon;

-- 3. Objects created later by this role no longer grant writes to anon by default.
alter default privileges in schema public
    revoke insert, update, delete, truncate, trigger, references on tables from anon;
alter default privileges in schema public
    revoke update, usage on sequences from anon;

commit;
