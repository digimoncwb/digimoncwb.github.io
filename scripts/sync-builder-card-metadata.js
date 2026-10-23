/* global AbortSignal */
// Repair the editor's database catalog. Default: inspect; --apply persists real source data.
const fs = require('node:fs');
const vm = require('node:vm');
const GAME_CODE = /^(?:BT\d+|EX\d+|ST\d+|RB\d+|AD\d+|LM\d*|P)-\d{1,4}$/;
function metadata(row) {
    const p = row.card_payload && Object.keys(row.card_payload).length > 2 ? row.card_payload : row;
    const code = String(row.card_code || p.card_code || p.id || p.cardnumber || '').toUpperCase();
    const type = String(p.type || p.card_type || row.card_type || '').toLowerCase();
    const types = {
        digimon: 'Digimon',
        digitama: 'Digi-Egg',
        'digi-egg': 'Digi-Egg',
        tamer: 'Tamer',
        option: 'Option',
        dual: 'Dual'
    };
    const rawLevel = p.level ?? p.card_level ?? row.card_level;
    const level =
        rawLevel === null || rawLevel === undefined || rawLevel === '' ? null : Number(rawLevel);
    const colors = [
        ...new Set(
            [p.color, p.color2, row.color]
                .flatMap((c) => String(c || '').split(/[\s/,]+/))
                .filter(Boolean)
        )
    ];
    return {
        card_code: code,
        id: code,
        name: p.name || row.name || null,
        pack: row.pack || p.pack || code.split('-')[0],
        color: colors.join('/') || null,
        card_type: types[type] || null,
        card_level: Number.isFinite(level) && level > 0 ? Math.trunc(level) : null,
        is_digi_egg: types[type] === 'Digi-Egg',
        card_payload:
            code === 'BT26-091' && String(p.rarity).toUpperCase() === 'RC'
                ? { ...p, rarity: 'R' }
                : p
    };
}
function complete(row) {
    const r = metadata(row);
    return (
        GAME_CODE.test(r.card_code) &&
        !!r.name &&
        r.name !== r.card_code &&
        !!r.card_type &&
        !!r.color &&
        Object.keys(r.card_payload).length > 4
    );
}
async function main() {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync('config/supabase.js', 'utf8'), sandbox);
    const { SUPABASE_URL: base, SUPABASE_ANON_KEY: key } = sandbox.window.APP_CONFIG;
    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
    };
    const apply = process.argv.includes('--apply');
    const get = async (url, options = {}) => {
        for (let retry = 0; retry < 4; retry++) {
            const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
            if (res.status === 429 && retry < 3) {
                await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
                continue;
            }
            if (!res.ok) throw new Error(`Source request failed: HTTP ${res.status}`);
            return res.json();
        }
    };
    const existing = [];
    for (let offset = 0; ; offset += 500) {
        const rows = await get(
            `${base}/rest/v1/decklist_card_metadata?select=*&order=card_code.asc&limit=500&offset=${offset}`,
            { headers }
        );
        existing.push(...rows);
        if (rows.length < 500) break;
    }
    const index = await get(
        'https://digimoncard.io/api-public/getAllCards?series=Digimon%20Card%20Game&sort=card_number&sortdirection=asc'
    );
    const db = new Map(existing.map((r) => [r.card_code, r]));
    const gameCodes = [
        ...new Set(
            [
                ...existing.map((r) => r.card_code),
                ...index.map((r) => String(r.cardnumber || '').toUpperCase())
            ].filter((code) => GAME_CODE.test(code))
        )
    ];
    const pending = gameCodes.filter(
        (code) =>
            !db.has(code) ||
            !complete(db.get(code)) ||
            (process.argv.includes('--rarities') &&
                !String(db.get(code)?.card_payload?.rarity || '')
                    .trim()
                    .match(/^(?!unknown$).+/i))
    );
    const updates = new Map();
    // Correct typed columns from already persisted rich payloads, including Dual cards.
    for (const row of existing.filter((r) => GAME_CODE.test(r.card_code))) {
        const derived = metadata(row);
        if (
            complete(derived) &&
            ['name', 'color', 'card_type', 'card_level', 'is_digi_egg'].some(
                (field) => derived[field] !== row[field]
            )
        )
            updates.set(row.card_code, derived);
    }
    console.log(
        `DCG database records: ${gameCodes.filter((code) => db.has(code)).length}; missing/incomplete: ${pending.length}; typed-field repairs: ${updates.size}.`
    );
    for (let offset = 0; offset < pending.length; offset += 20) {
        const codes = pending.slice(offset, offset + 20);
        const params = new URLSearchParams({
            card: codes.join(','),
            series: 'Digimon Card Game',
            limit: String(codes.length * 3)
        });
        const rows = await get('https://digimoncard.io/api-public/search?' + params);
        for (const raw of Array.isArray(rows) ? rows : []) {
            const row = metadata(raw);
            if (codes.includes(row.card_code) && complete(row)) updates.set(row.card_code, row);
        }
        console.log(
            `Metadata batch ${Math.floor(offset / 20) + 1}: ${updates.size} verified repairs ready.`
        );
        if (offset + 20 < pending.length) await new Promise((r) => setTimeout(r, 1000));
    }
    for (const code of pending.filter((c) => !updates.has(c))) {
        const rows = await get(
            'https://digimoncard.io/api-public/search?' +
                new URLSearchParams({ card: code, series: 'Digimon Card Game', limit: '10' })
        );
        for (const raw of Array.isArray(rows) ? rows : []) {
            const row = metadata(raw);
            if (row.card_code === code && complete(row)) updates.set(code, row);
        }
        await new Promise((r) => setTimeout(r, 700));
    }
    const unresolved = pending.filter((code) => !updates.has(code));
    const unresolvedRarities = process.argv.includes('--rarities')
        ? pending.filter(
              (code) =>
                  !String(updates.get(code)?.card_payload?.rarity || '')
                      .trim()
                      .match(/^(?!unknown$).+/i)
          )
        : [];
    fs.mkdirSync('.tmp', { recursive: true });
    fs.writeFileSync(
        '.tmp/builder-card-metadata-values.json',
        JSON.stringify([...updates.values()])
    );
    fs.writeFileSync(
        '.tmp/builder-card-metadata-report.json',
        JSON.stringify(
            {
                checked: gameCodes.length,
                updates: [...updates.keys()],
                unresolved,
                unresolvedRarities
            },
            null,
            2
        )
    );
    console.log(
        `Verified updates: ${updates.size}; unresolved: ${unresolved.join(', ') || 'none'}.`
    );
    if (unresolvedRarities.length)
        console.log(`Source has no confirmed rarity for: ${unresolvedRarities.join(', ')}.`);
    if (apply) {
        const rows = [...updates.values()];
        for (let offset = 0; offset < rows.length; offset += 100) {
            const res = await fetch(
                base + '/rest/v1/decklist_card_metadata?on_conflict=card_code',
                {
                    method: 'POST',
                    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify(rows.slice(offset, offset + 100)),
                    signal: AbortSignal.timeout(30000)
                }
            );
            if (!res.ok) throw new Error(`Database repair failed: HTTP ${res.status}`);
        }
        console.log(
            `${rows.length} metadata records persisted. Existing deck cards and quantities were not modified.`
        );
    } else console.log('Inspection only. Pass --apply to persist verified metadata.');
    if (unresolved.length) process.exitCode = 1;
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { metadata, complete, GAME_CODE };
