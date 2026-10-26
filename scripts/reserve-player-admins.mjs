// Apply the reviewed player-admin transition to the configured Supabase project.
// The database URL stays in process memory. Auth e-mails and passwords are untouched.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('../.tmp/digilab-tools/node_modules/pg');
const apply = process.argv.includes('--apply');
const keepUsername = process.argv.find((value) => value.startsWith('--keep-admin='))?.slice(13);
if (!keepUsername || !/^[a-z0-9_-]{3,40}$/.test(keepUsername))
    throw Error('Informe --keep-admin=<nome>.');
const connectionString = readFileSync('.env', 'utf8')
    .match(/^SUPABASE_DB_URL\s*=\s*(.*)$/m)?.[1]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2');
if (!connectionString) throw Error('SUPABASE_DB_URL ausente.');
const target = new URL(connectionString);
target.port = '6543';
const db = new Client({
    connectionString: target.href,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});
try {
    await db.connect();
    await db.query(apply ? 'begin' : 'begin read only');
    const keep = (
        await db.query(
            `select a.user_id from public.admin_users a
        join public.user_profiles p on p.user_id=a.user_id join auth.users u on u.id=a.user_id
        where a.username=$1 and p.username='edu_lopes' and p.status='active' and p.player_id is not null
        and u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='google')`,
            [keepUsername]
        )
    ).rows;
    if (keep.length !== 1)
        throw Error('A conta administrativa preservada não corresponde ao plano.');
    const installed = (
        await db.query(
            "select to_regprocedure('public.reserve_legacy_player_admins(uuid)') is not null as installed"
        )
    ).rows[0].installed;
    const expected = ['braga', 'fonseca', 'fortes', 'fujisawa', 'lopes', 'oliveira'];
    const actual = (
        await db.query(
            installed
                ? 'select username from public.player_admin_grants order by username'
                : 'select username from public.admin_users order by username'
        )
    ).rows.map((row) => row.username);
    if (JSON.stringify(expected) !== JSON.stringify(actual))
        throw Error('A lista de administradores mudou. Revise o plano antes de aplicar.');
    if (!apply) {
        console.log(
            JSON.stringify({
                ready: true,
                keep_admin: keepUsername,
                players_to_reserve: expected.filter((name) => name !== keepUsername),
                schema_installed: installed
            })
        );
        await db.query('rollback');
    } else {
        if (!installed) {
            const migration = readFileSync(
                'database/migrations/20261026020000_admin_privileges_on_bandai_players.sql',
                'utf8'
            )
                .replace(/^\s*begin;\s*/i, '')
                .replace(/\s*commit;\s*$/i, '');
            await db.query(migration);
        }
        const released = (
            await db.query('select public.reserve_legacy_player_admins($1) count', [
                keep[0].user_id
            ])
        ).rows[0].count;
        const roles = (
            await db.query(`select g.username,p.name as player_name,p.bandai_nick,
            exists(select 1 from public.admin_users a where a.admin_player_id=g.player_id) as claimed
            from public.player_admin_grants g join public.players p on p.id=g.player_id order by g.username`)
        ).rows;
        const preserved = (
            await db.query(
                'select exists(select 1 from public.admin_users where user_id=$1) as preserved',
                [keep[0].user_id]
            )
        ).rows[0].preserved;
        if (!preserved || roles.length !== 6)
            throw Error('Verificação final recusada. Nenhuma alteração foi confirmada.');
        await db.query('commit');
        console.log(
            JSON.stringify({
                applied: true,
                released_accounts: released,
                retained_admin: keepUsername,
                player_roles: roles
            })
        );
    }
} catch (error) {
    try {
        await db.query('rollback');
    } catch {}
    console.error(
        JSON.stringify({
            applied: false,
            code: error.code || 'verification_failed',
            message: error.message?.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]')
        })
    );
    process.exitCode = 1;
} finally {
    await db.end();
}
