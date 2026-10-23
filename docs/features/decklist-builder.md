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
in the shared bar above the panels. The deck name and its edit pencil appear in
the deck panel, with card, Digi-Egg and point totals below. The type and format
controls remain above the catalog. The pencil focuses the editable title. “Ver regras” lives inside
the format control; free decks can change their format there.
All catalog filters stay visible. Collection is a case-insensitive free-text
filter accepting partial codes. Color and rarity use checkbox dropdowns with
multiple selections. Each filter matches any of its selected options, and filters
combine with one another. Changing formats preselects its allowed rarities; clearing
filters restores that default. All matching catalog cards appear in one scrolling
grid, ordered by the newest registered sets and then ascending card number.
Hover and keyboard focus reveal Add and information actions; touch devices keep
them visible. Clicking the catalog image is inert; only the information button
opens details. Dragging does not add cards. Copy limits, including
card-specific restrictions, bans and unlimited exceptions, apply to every add
control. Import previews block excessive quantities before application.
Existing invalid saved lists remain intact and can be corrected. Photo view also
includes quantity controls for every card. The deck panel groups main cards and Digi-Eggs in one list,
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
not paginate the visible Card pool: all matching cards share one scrollable grid,
with lazy-loaded images. DigiCrest point badges use the same red border, black
background and upright yellow numbers as the format reference. Points sit at the
bottom right; quantities move to the left only on cards with a point badge.
The catalog does not merge API index stubs or catalogs from other games into search results. Only
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

## Community game formats

Administrators open **Admin > Formatos de jogo** to create and edit formats.
Creation and editing live only inside the authenticated Admin area. The public
**Formatos e regras** page remains read-only, including for signed-in administrators.
The structured form configures deck sizes, copy limits, allowed rarities and an
optional point budget. Existing administrator permissions and rule version history
apply to these changes. The system banlist remains effective for custom formats.

Pauper permits only C and U cards, with 50 main cards, up to five Digi-Eggs and
four copies unless the banlist specifies a lower limit. Unknown rarity is a
validation issue; run `npm run cards:sync-builder -- --rarities --apply` to repair
missing rarities from verified metadata.

DigiCrest uses the same construction limits and a budget of 100 points inclusive.
Each copy, including Digi-Eggs, contributes its registered score; unlisted cards
cost zero. The editor displays per-copy point circles and a running total in both
photo and list views. Generated deck images include point circles and the total.
Administrators can search the complete catalog by card name or code, choose a
suggestion, then enter the per-copy score in a confirmation dialog. Existing codes
update their score without duplication. Point entries can also be removed, edited
in the table, or imported as tabular name/code/point data. Card identity is read-only
in the table; incomplete codes must be removed and re-added with a confirmed card
before publication.

Apply `20261023000000_community_format_rules.sql`,
`20261023010000_digicrest_confirmed_codes.sql` and
`20261023020000_activate_confirmed_digicrest.sql` in order. These are idempotent and
preserve later administrator edits. The original 193-row input remains in
`database/seeds/digicrest-initial.tsv`; canonical corrections use catalog codes,
including two digits for ST cards. Gotsumon is BT14-009 and Quartzmon BT12-057.
With the community's approval, DigiCrest is active with 191 confirmed entries.
The ambiguous initial Gomamon and Tapirmon entries are omitted from the active
point registry and can be added later after their codes are confirmed. Cards
outside the point registry count as zero and have no point badge.

Game formats include an editable initial security count, defaulting to five.
`20261023030000_format_security_count.sql` backfills missing values without replacing
existing custom counts and supplies the default for future formats. Security is a
setup rule and does not change the 50-card deck construction count.
`20261023040000_correct_bt26_091_rarity.sql` corrects Yoshino Fujieda (BT26-091) from
the erroneous RC metadata to R and prevents that known import error from returning.

The public format summary uses compact metric cards and shows only restrictions
additional to the shared Bandai banlist. Rule history, revisions and update dates
are omitted from this view. Version history remains stored for administration.

## Appearance and point registry

Single-choice fields share the same styled menu across the site, including legacy
forms, while retaining their native values, validation and change events. Menus
and scrollbars follow the Appearance accent. Each theme's color and name can be
edited, and a Custom option is available. Changes are previewed before being
applied and saved locally in the browser.

The admin points registry shows each card's thumbnail, name and immutable code.
Only points are editable in the table; cards can be removed and re-added from the
catalog search when their identity needs to change.

## Verification

The test suite covers filters, accent-insensitive search, availability counts,
paging, imports, rule readiness, full catalog search, game isolation, metadata
normalization, idempotent backfills, draft persistence, concurrency and database
permissions. Browser verification covers desktop/mobile layouts, stable full card
images, imports, failed saves and retry, reopening, navigation and validation.

Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build:release`.
