# Deckbuilder

The community library lives at `/#decks` and the React editor at `/#builder`.
The shell keeps the existing sidebar and Appearance accent color.

## Library and navigation

The default tab is tournament lists. `tab=free` opens free decks and `tab=formats`
opens game formats and regulations. Filters, availability, sorting, page and page
size are URL state, restored through the editor's `libraryState` return parameter.
Tournament links retain `resultId`. The initial page size is five.

Availability counts use all other active filters, before availability and paging.
Player, deck and tournament searches ignore accents. Tournament rows retain player
placement, store logo, deck portrait, date, release set and game format. Mobile
uses cards with the same data and actions.
Recent sorting groups each tournament and orders its participations by placement.
Events on the same date use tournament ID as a stable tie-break; unranked players
follow ranked players within their own tournament.

## Editor and persistence

`frontend/apps/builder/DeckEditor.tsx` is the active editor. It supports desktop,
intermediate widths and mobile with catalog/deck tabs and a validation dialog.
The Card pool shows four cards per row on desktop, with search and catalog filters
in the shared bar above the panels. The title, type and format share a row when
space permits. The pencil focuses the editable title. “Ver regras” lives inside
the format control; free decks can change their format there.
All catalog filters stay visible. Collection is a case-insensitive free-text
filter accepting partial codes. Pagination sits in
the Card pool header. The deck panel groups main cards and Digi-Eggs in one list,
with separate counts in its header. Validation progress stays green; warning
badges and textual issues continue to report invalid or incomplete decks.
Image export opens `DeckImageDialog` with appearance controls and a live preview.
`shared/posts/deck-renderer.js` reuses the Content Creation renderer's branding,
background symbol, social footer and 1080 × 1350 feed dimensions. Each page holds
up to 24 distinct cards; additional pages retain every remaining card and quantity.
The PNG download uses the displayed preview. The legacy image engine remains
available for compatibility with the original standalone editor.
The default format name and total/page footer are omitted from generated images.
Custom format names remain visible.

- `resultId` loads a participation, its uniquely identified tournament and fixed game format.
- `decklistId` loads an existing free deck.
- `new=1`, `deck` and `formatId` initialize a new unsaved free deck.
- `openImport=1` opens import on entry. Creating or importing does not insert an empty deck.
- `save_deck_draft` saves name, game format and the ordered `draft_cards` JSON array atomically.
  It checks `draft_revision` to prevent overwriting a concurrent edit.
- Drafts retain invalid quantities and unresolved codes; validation never silently removes
  cards or clamps imported counts. Unrecognized import lines require acknowledgement.
- Existing normalized `decklist_cards` and legacy tournament text remain readable.
  Current draft content takes precedence in previews and when reopening a deck.
- Free decks remain publicly readable and editable; public deletion is not exposed.
  Tournament list operations retain the existing database permissions.
- Creation and import require a registered deck type. Creator attribution is an
  optional selection of an existing player and does not change editing permissions.
  Free deck cards show the type's circular portrait and offer copying a sorted
  import-compatible decklist, with a manual-copy dialog if clipboard access fails.
- Read-only previews, history and imported lists share the editor's canonical
  type/level/code ordering. Reopening a deck or importing resets the display sort.
- `copy_free_deck_to_result` copies a free deck without changing its source, uses
  the destination tournament's format, and requires confirmation before replacing
  an existing list. Legacy tournament matching requires exactly one store/date match.

Unsaved changes are guarded on navigation and page exit. Save failures preserve
local changes and offer retry. Text and image exports remain available.

## Formats and migration

Apply these migrations, in order, before deploying the frontend:

1. `database/migrations/20261021000000_deck_library.sql`
2. `database/migrations/20261021010000_deck_editor_drafts.sql`
3. `database/migrations/20261021020000_deck_archetypes.sql`

`deck_formats` stores game modalities, separately from the existing `formats`
table used for release sets. Only the existing Standard modality, displayed as
**Padrão**, is seeded. No illustrative community formats or regulations are added.

The second migration fills legacy `deck_format_id` references on decklists,
tournaments and archetypes without changing their cards, quantities, links,
authors or timestamps. Repeated execution preserves later explicit bindings.
A format association alone never implies a valid deck.

Administrators maintain descriptions, regulations, URLs, publication status and
structured `validation_rules` through the formats tab. RLS restricts these writes
to authorized administrators. Rule edits increment revisions and create entries in
`deck_format_rule_versions`. Public views expose history, revision and update date.

The format details page and editor share `effectiveRules`, the central configuration
and the existing system ban/restriction list. Unpublished or incomplete regulations
show pending rules and disable a definitive validation result; drafts remain savable.
New decks default to Padr?o or inherit the format from their creation context.

## Card catalog

The editor reads the complete, paginated `decklist_card_metadata` table. It does
not merge API index stubs or catalogs from other games into search results. Only
Digimon Card Game code families with a real name, recognized type and color enter
the catalog. Unknown imported codes remain visible as draft validation issues.

Synchronize verified public source metadata before publishing new cards:

```sh
npm run cards:sync-builder
npm run cards:sync-builder -- --apply
```

The first command inspects and reports; the second persists verified repairs.
The script fills missing rich payloads and repairs typed columns, supports Dual
cards and both colors, and is idempotent. It never updates deck contents. Printed
levels intentionally absent on special cards remain null; they are not invented
or treated as missing metadata. Other catalog synchronization scripts reuse the
same metadata checks.

## Validation

The test suite covers filters, accent-insensitive search, availability counts,
paging, imports, rule readiness, full catalog search, game isolation, metadata
normalization, idempotent backfills, draft persistence, concurrency and database
permissions. Browser verification covers desktop/mobile layouts, stable full card
images, imports, failed saves and retry, reopening, navigation and validation.

Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build:release`.
