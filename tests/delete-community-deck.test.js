const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const migration = readFileSync(
    'database/migrations/20261025000000_delete_community_decks.sql',
    'utf8'
);
const admin = '10000000-0000-0000-0000-000000000001';
const visitor = '10000000-0000-0000-0000-000000000002';
const updatedAt = '2026-10-25T12:00:00.123456Z';

test('Only admins can delete community decks, with atomic card removal and stale-write protection', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated; create schema auth;
            create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            create table public.admin_users(user_id uuid primary key);
            insert into public.admin_users values('${admin}');
            create table public.decklists(id bigint primary key, tournament_result_id uuid, updated_at timestamptz not null);
            create table public.decklist_cards(id bigint primary key, decklist_id bigint references public.decklists on delete cascade);
            insert into public.decklists values(1,null,'${updatedAt}'),(2,'${visitor}','${updatedAt}'),(3,null,'${updatedAt}');
            insert into public.decklist_cards values(1,1),(2,2),(3,3);
            alter table public.decklists enable row level security;
            create policy public_read on public.decklists for select to anon,authenticated using(true);
            create policy legacy_delete on public.decklists for delete to anon,authenticated using(true);
            create policy "Keep free decks" on public.decklists as restrictive for delete to anon,authenticated using(tournament_result_id is not null);
            grant select,delete on public.decklists to anon,authenticated;
        `);
        await db.exec(migration);
        await db.exec(migration);
        await db.exec("set role anon; set request.jwt.claim.role='anon'");
        await assert.rejects(
            db.exec(`select public.delete_community_deck(1,'${updatedAt}')`),
            /permission denied/
        );
        await db.exec('delete from public.decklists where id=1');
        assert.equal(
            (await db.query('select count(*)::int n from public.decklists where id=1')).rows[0].n,
            1
        );

        await db.exec(
            `reset role; set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${visitor}'`
        );
        await assert.rejects(
            db.exec(`select public.delete_community_deck(1,'${updatedAt}')`),
            /administradores/
        );
        await db.exec(`set request.jwt.claim.sub='${admin}'`);
        await assert.rejects(
            db.exec("select public.delete_community_deck(1,'2026-10-25T11:00:00Z')"),
            /alterado/
        );
        await assert.rejects(db.exec('select public.delete_community_deck(1,null)'), /alterado/);
        await assert.rejects(
            db.exec(`select public.delete_community_deck(2,'${updatedAt}')`),
            /não encontrado/
        );
        const deleted = await db.query(`select public.delete_community_deck(1,'${updatedAt}') id`);
        assert.equal(Number(deleted.rows[0].id), 1);
        await assert.rejects(
            db.exec(`select public.delete_community_deck(1,'${updatedAt}')`),
            /não encontrado/
        );
        await db.exec('reset role');
        assert.deepEqual(
            (await db.query('select id::int id from public.decklists order by id')).rows.map(
                (row) => row.id
            ),
            [2, 3]
        );
        assert.deepEqual(
            (
                await db.query('select decklist_id::int id from public.decklist_cards order by id')
            ).rows.map((row) => row.id),
            [2, 3]
        );
    } finally {
        await db.close();
    }
});

test('Deletion service authenticates and only reports confirmed deletion as success', async () => {
    const { deleteCommunityDeck } = vm.runInNewContext(
        stripTypeScriptTypes(
            readFileSync('frontend/apps/workspace/delete-community-deck.ts', 'utf8')
        ).replace(/export /g, '') + '\n({deleteCommunityDeck})'
    );
    const calls = [];
    let response = new Response(JSON.stringify(42));
    const session = {
        restore: async () => {
            calls.push('restore');
            return true;
        },
        refresh: async () => {
            calls.push('refresh');
        },
        verify: async () => {
            calls.push('verify');
        },
        request: async (path, options) => {
            calls.push({ path, options });
            return response;
        }
    };
    await deleteCommunityDeck(42, updatedAt, session);
    assert.deepEqual(calls.slice(0, 3), ['restore', 'refresh', 'verify']);
    assert.equal(calls[3].path, '/rest/v1/rpc/delete_community_deck');
    assert.deepEqual(JSON.parse(calls[3].options.body), {
        p_decklist_id: 42,
        p_updated_at: updatedAt
    });
    for (const [code, message] of [
        ['42501', /administradores/],
        ['40001', /alterado/],
        ['P0002', /não encontrado/]
    ]) {
        response = new Response(JSON.stringify({ code, message: 'Deck não encontrado.' }), {
            status: 400
        });
        await assert.rejects(deleteCommunityDeck(42, updatedAt, session), message);
    }
    response = new Response('null');
    await assert.rejects(deleteCommunityDeck(42, updatedAt, session), /confirmar/);
    const before = calls.length;
    await assert.rejects(
        deleteCommunityDeck(42, updatedAt, { ...session, restore: async () => false }),
        /Entre no Admin/
    );
    assert.equal(calls.length, before);
});
