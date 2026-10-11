# Database Tracking

This project tracks Supabase database changes in two ways:

1. Snapshots (full schema + roles)
2. Supabase migrations (when CLI project is linked)

## Prerequisites

- Supabase CLI installed
- `SUPABASE_DB_URL` set in your shell

Example (PowerShell):

```powershell
$env:SUPABASE_DB_URL = "postgresql://postgres:<password>@<host>:5432/postgres"
```

## Export snapshots

Run:

```powershell
npm run db:snapshot
```

This generates:

- `database/snapshots/schema-YYYYMMDD-HHMMSS.sql`
- `database/snapshots/roles-YYYYMMDD-HHMMSS.sql`
- `database/schema.latest.sql`
- `database/roles.latest.sql`

## Migration pull (optional but recommended)

If you initialized and linked Supabase CLI (`supabase init` + `supabase link`), the snapshot script also runs:

```bash
supabase db pull
```

This creates timestamped migration files under `supabase/migrations/`.

## Recommended workflow

1. Make DB changes in Supabase.
2. Run `npm run db:snapshot`.
3. Review diffs in `database/` and `supabase/migrations/`.
4. Commit all generated SQL files together with app code changes.

## Format release dates

`database/migrations/20261005000000_correct_format_release_dates.sql` corrects `formats.created_at` and product names for the 14 cataloged formats, plus EX09 if present, using official English release dates. It updates existing rows only and preserves the default, activation and tournament links. The researched dates, Bandai sources, timezone convention and verification query are documented in [format-release-dates.md](../docs/data/format-release-dates.md).

## Local 2v2 tournaments

Apply `database/migrations/20261010000000_local_2v2_tournaments.sql` before releasing the 2v2 frontend. Each teammate keeps their own result ID and decklist; two results share the same placement using `team_member` (1 or 2). `total_players` counts people, so four players occupy two team placements. The save RPC validates complete pairs, distinct players, required decks and shared match points in one transaction.

The migration also scopes result uniqueness to `tournament_id`, allowing solo and 2v2 events at the same store/date. Legacy unlinked rows retain their unique indexes. Database guards prohibit DigiLab links and imports for 2v2. Redeploy `preview-digilab-import` and `verify-digilab-tournament` with this release so the inventory omits 2v2 candidates and verification returns the local-only message.

Daily posts display both members of each podium team. Weekly recaps show the tournament type for every event and both winning decks/players for 2v2. The weekly caption describes all events in the selected week, including every page of a recap carousel.

Bandai screenshot imports support 2v2: each recognized entry starts a separate team with its points shared by both members. The second player and both decks are completed manually. Importing a screenshot while editing an existing event updates team points and preserves the players and decks.

## DigiLab synchronization

The integration state is defined by:

```text
database/migrations/20260731000000_create_tournament_digilab_sync.sql
```

This migration must be applied before the verification Edge Function starts persisting matches. It does not store the DigiLab API key; that credential belongs to **Edge Functions → Secrets** as `DIGILAB_API_KEY`.

After applying it, verify that:

- `public.tournament_digilab_sync` exists;
- RLS is enabled;
- `service_role` can insert and update rows;
- `anon` and `authenticated` cannot write;
- public clients can select only the six status/link columns granted by the migration.

Operational details are documented in `docs/features/digilab-integration.md`.

## Admin authentication

The DigiStats Admin allowlist is defined by:

```text
database/migrations/20260731010000_create_admin_users.sql
```

Before running it, create and confirm these users under **Supabase → Authentication → Users**:

```text
braga@admin.digistats.local
fujisawa@admin.digistats.local
fonseca@admin.digistats.local
fortes@admin.digistats.local
lopes@admin.digistats.local
oliveira@admin.digistats.local
```

The migration finds those identities in `auth.users` and adds them idempotently to `public.admin_users`. It never creates or stores passwords. If an Auth user is created after the migration, rerun only the migration's final `insert into public.admin_users ...` statement.

Authenticated users can read only their own membership row. The service role validates the same allowlist inside the DigiLab Edge Functions; anonymous users cannot read or write it.

Additional DigiLab/Admin migrations:

- `20260731020000_create_digilab_player_sync_and_import.sql`: persistent player mapping and transactional reverse import.
- `20260731030000_allow_admin_store_writes.sql`: allows only authenticated allowlisted admins to create, rename and delete stores.
- `20260731040000_add_digilab_deck_sync.sql`: persistent deck mapping and idempotent backfill of decks and points for an existing DigiLab link.
- `20260731050000_create_deck_families_and_digilab_catalog.sql`: two-level family/archetype model, mirrored DigiLab catalog and family statistics view.
- `20260803010000_background_digilab_import.sql`: persistent background queue plus a 15-minute `pg_cron` trigger. The worker creates unambiguous new players before importing a resolved Curitiba tournament; ambiguous players, unresolved decks and possible duplicate tournaments remain queued for review.
- `20260804010000_cleanup_digilab_queue_on_tournament_delete.sql`: removes orphaned imported queue entries and changes the queue foreign key to `ON DELETE CASCADE`, so deleting a DigiStats tournament also clears its background-import state.
