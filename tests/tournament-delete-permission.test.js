const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const original = readFileSync(
    'database/migrations/20260729030000_delete_tournament_transaction.sql',
    'utf8'
);
const fix = readFileSync(
    'database/migrations/20261118010000_protect_tournament_deletion.sql',
    'utf8'
);

test('only administrators or maintenance can delete a tournament through the RPC', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated; create role service_role;
            create function public.site_is_admin() returns boolean language sql stable as
                $$select coalesce(current_setting('test.admin', true), '') = 'yes'$$;
            create function public.site_is_maintenance() returns boolean language sql stable as $$select false$$;
            grant execute on function public.site_is_admin(), public.site_is_maintenance() to anon, authenticated;
            create table public.tournament(id bigint primary key, store_id uuid, tournament_date date);
            create table public.tournament_results(id bigserial primary key, tournament_id bigint, store_id uuid, tournament_date date);
            create table public.tournament_ocr_files(id bigserial primary key, tournament_id bigint, storage_path text);
            insert into public.tournament values (1, null, '2026-11-16');
            insert into public.tournament_results(tournament_id) values (1), (1);`);
        await db.exec(original);
        await db.exec(fix);
        const privilege = async (role) =>
            (
                await db.query(
                    `select has_function_privilege($1, 'public.delete_tournament_transaction(bigint)', 'execute') ok`,
                    [role]
                )
            ).rows[0].ok;
        assert.equal(await privilege('anon'), false);
        assert.equal(await privilege('authenticated'), true);

        await assert.rejects(
            db.query('select public.delete_tournament_transaction(1)'),
            /Acesso administrativo necessário/
        );
        assert.equal(
            (await db.query('select count(*)::int n from public.tournament_results')).rows[0].n,
            2
        );

        await db.exec(`set test.admin = 'yes'`);
        const result = (await db.query('select public.delete_tournament_transaction(1) value'))
            .rows[0].value;
        assert.equal(result.tournament_id, 1);
        assert.equal(
            (await db.query('select count(*)::int n from public.tournament')).rows[0].n,
            0
        );
        assert.equal(
            (await db.query('select count(*)::int n from public.tournament_results')).rows[0].n,
            0
        );
    } finally {
        await db.close();
    }
});
