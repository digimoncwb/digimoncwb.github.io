const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');

const deck = (id, name, slug) => ({
    digilab_archetype_id: id,
    name,
    slug,
    primary_color: 'Green',
    secondary_color: 'Black',
    display_card_id: 'ST23-09',
    image_url:
        'https://project.supabase.co/storage/v1/object/public/deck-images/digilab/ST23-09.jpg',
    family_slug: 'dawn',
    family_name: 'Dawn',
    total_entries: 10,
    firsts: 2,
    pilots: 3
});
const formats = [
    { code: 'BT26', name: 'Timeless Bonds', release_date: '2026-09-25' },
    { code: 'EX13', name: 'New format', release_date: '2026-10-30' }
];
const reconciliationMigration =
    'database/migrations/20261025130000_reconcile_digilab_catalog_names.sql';
const catalogSchema = `
    create role anon; create role authenticated; create role service_role;
    create table decks(id uuid primary key default gen_random_uuid(),name text unique,slug text unique,colors text,primary_color text,secondary_color text,display_card_id text,family_id uuid,is_active boolean default true);
    create table deck_families(id uuid primary key default gen_random_uuid(),name text unique,slug text unique,is_active boolean default true);
    create table deck_images(id uuid primary key default gen_random_uuid(),deck_id uuid references decks(id),image_url text);
    create table digilab_deck_catalog(digilab_archetype_id bigint primary key,slug text unique,name text,family_slug text,family_name text,primary_color text,secondary_color text,display_card_id text,total_entries int,firsts int,pilots int,raw_payload jsonb,is_active boolean,last_seen_at timestamptz);
    create table digilab_deck_sync(digilab_deck_slug text primary key,digilab_archetype_id bigint unique references digilab_deck_catalog(digilab_archetype_id),deck_id uuid references decks(id),digilab_deck_name text,updated_at timestamptz);
    create table formats(id bigserial primary key,code text unique,name text,created_at timestamptz,is_active boolean,is_default boolean,background_path text);
    create table results(deck_id uuid references decks(id));
`;

test('catalog snapshot preserves links, replaces colors, registers formats and rejects partial updates atomically', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            ${catalogSchema}
            insert into decks(name,colors) values('Glowing Dawn','y,g,b,p'),('Historical deck','r');
            insert into results select id from decks where name='Glowing Dawn';
            insert into formats(code,name,is_active,is_default,background_path) values('BT26','Old name',false,true,'keep.jpg');
            insert into digilab_deck_catalog(digilab_archetype_id,slug,name,is_active) values(1,'glowing-dawn','Glowing Dawn',false);
            insert into digilab_deck_sync(digilab_deck_slug,digilab_archetype_id,deck_id)
                select 'retired-dawn',1,id from decks where name='Historical deck';
            insert into digilab_deck_sync(digilab_deck_slug,deck_id)
                select 'glowing-dawn',id from decks where name='Glowing Dawn';
        `);
        await db.exec(
            fs.readFileSync(
                'database/migrations/20261005010000_automate_digilab_catalog.sql',
                'utf8'
            )
        );
        await db.exec(
            fs.readFileSync(
                'database/migrations/20261005050000_store_digilab_catalog_images.sql',
                'utf8'
            )
        );
        await db.exec(fs.readFileSync(reconciliationMigration, 'utf8'));
        const apply = (decks, incomingFormats = formats) =>
            db.query('select apply_digilab_catalog_snapshot($1::jsonb,$2::jsonb) as summary', [
                JSON.stringify(decks),
                JSON.stringify(incomingFormats)
            ]);
        const originalId = (await db.query("select id from decks where name='Glowing Dawn'"))
            .rows[0].id;
        const incoming = [
            deck(1, 'Glowing Dawn', 'glowing-dawn'),
            deck(2, 'Other deck', 'other-deck')
        ];
        const first = (await apply(incoming)).rows[0].summary;
        assert.equal(first.created, 1);
        assert.equal(first.archived, 1);
        assert.equal(first.formats_created, 1);
        const saved = (await db.query("select * from decks where name='Glowing Dawn'")).rows[0];
        assert.equal(saved.id, originalId);
        assert.equal(saved.colors, 'g,b');
        assert.equal(
            (await db.query('select image_url from deck_images where deck_id=$1', [originalId]))
                .rows[0].image_url,
            incoming[0].image_url
        );
        await assert.rejects(
            apply([
                { ...incoming[0], image_url: 'https://digimon.digilab.cards/api/card/ST23-09.jpg' },
                incoming[1]
            ]),
            /não armazenada/
        );
        const format = (await db.query("select * from formats where code='BT26'")).rows[0];
        assert.equal(format.name, 'Timeless Bonds');
        assert.equal(format.is_default, true);
        assert.equal(format.is_active, false);
        assert.equal(format.background_path, 'keep.jpg');
        assert.equal(format.created_at.toISOString(), '2026-09-25T03:00:00.000Z');
        assert.equal((await apply(incoming)).rows[0].summary.created, 0);
        assert.equal((await db.query('select count(*)::int n from deck_images')).rows[0].n, 2);
        await apply([deck(1, 'Renamed Dawn', 'renamed-dawn'), incoming[1]]);
        assert.equal(
            (await db.query("select id from decks where name='Renamed Dawn'")).rows[0].id,
            originalId
        );
        assert.equal((await db.query('select deck_id from results')).rows[0].deck_id, originalId);
        assert.equal(
            (
                await db.query(
                    'select digilab_deck_slug from digilab_deck_sync where digilab_archetype_id=1'
                )
            ).rows[0].digilab_deck_slug,
            'renamed-dawn'
        );
        await apply([
            deck(1, 'Renamed Dawn', 'renamed-dawn'),
            { ...incoming[1], display_card_id: null }
        ]);
        assert.equal((await db.query('select count(*)::int n from deck_images')).rows[0].n, 1);
        await assert.rejects(apply([incoming[0]]), /Queda inesperada/);
        await assert.rejects(
            apply([incoming[0], { ...incoming[1], primary_color: 'Unknown' }]),
            /inválido/
        );
        await assert.rejects(
            apply(incoming, [
                { code: 'EX99', name: 'Temporary' },
                { code: 'Bad', name: null }
            ]),
            /inválido/
        );
        assert.equal(
            (await db.query("select count(*)::int n from formats where code='EX99'")).rows[0].n,
            0
        );
        assert.equal(
            (await db.query('select name from decks where id=$1', [originalId])).rows[0].name,
            'Renamed Dawn'
        );
        await db.exec('set role anon');
        await assert.rejects(apply(incoming), /permission denied/);
        await assert.rejects(db.query("update decks set colors='r'"), /permission denied/);
    } finally {
        await db.close();
    }
});

test('catalog reconciles name/slug swaps, historical collisions and reused identities atomically', async () => {
    const db = new PGlite();
    try {
        await db.exec(catalogSchema);
        await db.exec(
            fs.readFileSync(
                'database/migrations/20261005050000_store_digilab_catalog_images.sql',
                'utf8'
            )
        );
        const apply = (rows, incomingFormats = formats) =>
            db.query('select apply_digilab_catalog_snapshot($1::jsonb,$2::jsonb) as summary', [
                JSON.stringify(rows),
                JSON.stringify(incomingFormats)
            ]);
        const original = [deck(1, 'Alpha', 'alpha'), deck(2, 'Beta', 'beta')];
        await apply(original);
        const identities = (
            await db.query('select digilab_archetype_id,deck_id from digilab_deck_sync order by 1')
        ).rows;
        await db.exec('insert into results select id from decks');
        const swapped = [deck(1, 'Beta', 'beta'), deck(2, 'Alpha', 'alpha')];
        await assert.rejects(apply(swapped), /unique constraint/);
        await db.exec(fs.readFileSync(reconciliationMigration, 'utf8'));
        await apply(swapped);
        assert.deepEqual(
            (
                await db.query(
                    'select digilab_archetype_id,deck_id from digilab_deck_sync order by 1'
                )
            ).rows,
            identities
        );
        assert.equal(
            (await db.query('select name from decks where id=$1', [identities[0].deck_id])).rows[0]
                .name,
            'Beta'
        );
        assert.equal(
            (await db.query('select slug from digilab_deck_catalog where digilab_archetype_id=1'))
                .rows[0].slug,
            'beta'
        );

        // A local historical duplicate must retain its own ID and historical reference.
        const historical = (
            await db.query(
                "insert into decks(name,slug) values('Canonical','canonical') returning id"
            )
        ).rows[0].id;
        await db.query('insert into results values($1)', [historical]);
        const renamed = [deck(1, 'Canonical', 'canonical'), swapped[1]];
        const summary = (await apply(renamed)).rows[0].summary;
        assert.equal(summary.archived, 1);
        const archived = (
            await db.query('select name,is_active from decks where id=$1', [historical])
        ).rows[0];
        assert.equal(archived.is_active, false);
        assert.match(archived.name, /Canonical \[histórico /);
        assert.equal(
            (await db.query('select count(*)::int n from results where deck_id=$1', [historical]))
                .rows[0].n,
            1
        );

        // Reusing a slug/name with a NEW upstream ID must never steal the retired ID.
        const replacement = [deck(3, 'Canonical', 'canonical'), swapped[1]];
        assert.equal((await apply(replacement)).rows[0].summary.created, 1);
        const newId = (
            await db.query('select deck_id from digilab_deck_sync where digilab_archetype_id=3')
        ).rows[0].deck_id;
        assert.notEqual(newId, identities[0].deck_id);
        assert.equal(
            (await db.query('select deck_id from digilab_deck_sync where digilab_archetype_id=1'))
                .rows[0].deck_id,
            identities[0].deck_id
        );
        assert.equal((await db.query('select count(*)::int n from results')).rows[0].n, 3);
        assert.equal((await apply(replacement)).rows[0].summary.created, 0);

        const before = (await db.query('select id,name,slug,is_active from decks order by id'))
            .rows;
        await assert.rejects(
            apply(
                [deck(3, 'Alpha', 'alpha'), deck(2, 'Canonical', 'canonical')],
                [{ code: 'BAD', name: null }]
            ),
            /inválido/
        );
        assert.deepEqual(
            (await db.query('select id,name,slug,is_active from decks order by id')).rows,
            before
        );
        await db.exec('set role authenticated');
        await assert.rejects(apply(replacement), /permission denied/);
    } finally {
        await db.close();
    }
});

function api(fetch) {
    const sandbox = {
        fetch,
        URLSearchParams,
        Deno: { serve() {} },
        withSiteAudit: (handler) => handler
    };
    const source = stripTypeScriptTypes(
        fs.readFileSync('supabase/functions/digilab-deck-catalog/index.ts', 'utf8')
    ).replace(/^import[\s\S]*?;\s*/gm, '');
    vm.runInNewContext(source + '\nthis.api={syncCatalog,toFormatRow};', sandbox);
    return sandbox.api;
}
function service() {
    const calls = [];
    return {
        calls,
        from() {
            return {
                insert() {
                    return {
                        select() {
                            return { single: async () => ({ data: { id: 'run' } }) };
                        }
                    };
                },
                update() {
                    return { eq: async () => ({ error: null }) };
                }
            };
        },
        rpc: async (name, args) => {
            calls.push({ name, args });
            return { data: { created: 0 } };
        }
    };
}
test('API sync collects formats from page one and applies only complete snapshots', async () => {
    const actualFormat = api().toFormatRow({
        format: 'RSB2.0',
        set_name: 'Release Special Booster 2.0',
        display_name: 'RSB2.0 (Release Special Booster 2.0)'
    });
    assert.equal(actualFormat.code, 'RSB2.0');
    assert.equal(actualFormat.release_date, null);
    const pages = [1, 2].map((page) => ({
        data: [{ archetype_id: page, archetype_name: 'Deck ' + page, slug: 'deck-' + page }],
        pagination: { total: 2, total_pages: 2 },
        ...(page === 1
            ? {
                  formats: [
                      { format_id: 'BT26', set_name: 'Timeless Bonds', release_date: '2026-09-25' }
                  ]
              }
            : {})
    }));
    let index = 0;
    const s = service();
    const summary = await api(async () => ({
        ok: true,
        json: async () => pages[index++]
    })).syncCatalog(s, 'test-key');
    assert.equal(summary.request_count, 2);
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].args.p_formats[0].code, 'BT26');
    assert.equal(s.calls[0].args.p_decks.length, 2);
    index = 0;
    pages[1].data = [];
    const incomplete = service();
    await assert.rejects(
        api(async () => ({ ok: true, json: async () => pages[index++] })).syncCatalog(
            incomplete,
            'test-key'
        ),
        /incompleto/
    );
    assert.equal(incomplete.calls.length, 0);
    pages[0].formats = [];
    const missing = service();
    await assert.rejects(
        api(async () => ({ ok: true, json: async () => pages[0] })).syncCatalog(
            missing,
            'test-key'
        ),
        /Formatos ausentes/
    );
    assert.equal(missing.calls.length, 0);
});
