#!/usr/bin/env node

/**
 * Bulk metadata sync for Digimon cards → decklist_card_metadata.
 *
 * Modes:
 *   --all-cards          Fetch ALL cards from the public API (getAllCards) and upsert.
 *                        Use this to build a full card catalog in the DB.
 *   (default)            Only sync cards already present in decklist_cards table.
 *
 * Options:
 *   --chunk=20           Cards per API request (default 20, max ~50 before URL gets long)
 *   --sleep=800          Delay between API requests in ms (default 800 — stays under 15 req/10s)
 *   --dry-run            Fetch and log without writing to DB
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_KEY  (or SUPABASE_ANON_KEY)
 *
 * Usage examples:
 *   node scripts/sync-card-metadata.js --all-cards
 *   node scripts/sync-card-metadata.js --all-cards --chunk=15 --sleep=1000
 *   node scripts/sync-card-metadata.js                        # only registered decklist cards
 */

const { metadata: canonicalMetadata, complete, GAME_CODE } = require('./sync-builder-card-metadata');

const DIGIMON_API_URL     = 'https://digimoncard.io/api-public/search';
const DIGIMON_ALL_CARDS   = 'https://digimoncard.io/api-public/getAllCards';
const SERIES              = 'Digimon Card Game';
const DEFAULT_CHUNK       = 20;
const DEFAULT_SLEEP_MS    = 800;
const REST_PAGE_SIZE      = 1000;

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const argv             = process.argv.slice(2);
const allCardsMode     = argv.includes('--all-cards');
const dryRun           = argv.includes('--dry-run');
const chunkSize        = getNumericFlag('--chunk', DEFAULT_CHUNK);
const sleepMs          = getNumericFlag('--sleep', DEFAULT_SLEEP_MS);

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY/SUPABASE_ANON_KEY env vars.');
    process.exit(1);
}

const headers = {
    apikey: SUPABASE_URL.includes('supabase') ? SUPABASE_KEY : undefined,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`[sync] mode: ${allCardsMode ? 'ALL CARDS (full catalog)' : 'registered decklist cards only'}`);
    if (dryRun) console.log('[sync] DRY RUN — nothing will be written to DB');

    let codes;
    if (allCardsMode) {
        codes = await fetchAllCardNumbers();
    } else {
        codes = await fetchDistinctDecklistCodes();
    }

    if (codes.length === 0) {
        console.log('[sync] no card codes found. Exiting.');
        return;
    }
    console.log(`[sync] total card codes to sync: ${codes.length}`);

    const rows = await fetchMetadataFromApi(codes, chunkSize, sleepMs);
    console.log(`[sync] API returned metadata for ${rows.length} cards`);

    if (!rows.length) {
        console.log('[sync] nothing to upsert.');
        return;
    }

    if (dryRun) {
        console.log('[sync] sample row:', JSON.stringify(rows[0], null, 2));
        console.log(`[sync] dry run complete — would upsert ${rows.length} rows`);
        return;
    }

    await upsertCardMetadata(rows);
    console.log(`[sync] done — ${rows.length} rows upserted into decklist_card_metadata`);
}

// ─── Fetch card numbers ────────────────────────────────────────────────────────

async function fetchAllCardNumbers() {
    console.log('[sync] fetching full card list from getAllCards...');
    const params = new URLSearchParams({ series: SERIES, sort: 'card_number', sortdirection: 'asc' });
    const res = await fetch(`${DIGIMON_ALL_CARDS}?${params}`);
    if (!res.ok) throw new Error(`getAllCards failed: HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('getAllCards returned unexpected format');
    const codes = rows
        .map((r) => normalizeCode(r?.cardnumber || ''))
        .filter(Boolean);
    console.log(`[sync] getAllCards: ${codes.length} cards found`);
    return codes;
}

async function fetchDistinctDecklistCodes() {
    console.log('[sync] fetching distinct card codes from decklist_cards...');
    const result = new Set();
    let offset = 0;
    while (true) {
        const query = new URLSearchParams({
            select: 'card_code',
            order: 'card_code.asc',
            limit: String(REST_PAGE_SIZE),
            offset: String(offset),
        });
        const res = await fetch(`${SUPABASE_URL}/rest/v1/decklist_cards?${query}`, { headers });
        if (!res.ok) throw new Error(`decklist_cards fetch failed: HTTP ${res.status}`);
        const batch = await res.json();
        if (!Array.isArray(batch) || !batch.length) break;
        batch.forEach((r) => { const c = normalizeCode(r?.card_code); if (c) result.add(c); });
        if (batch.length < REST_PAGE_SIZE) break;
        offset += REST_PAGE_SIZE;
    }
    return Array.from(result);
}

// ─── Fetch metadata from public API ───────────────────────────────────────────

async function fetchMetadataFromApi(codes, size, waitMs) {
    const out = [];
    const chunks = chunkArray(codes, size);
    let failedChunks = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const params = new URLSearchParams({
            card: chunk.join(','),
            limit: String(chunk.length),
            series: SERIES,
        });

        let rows = [];
        try {
            const res = await fetch(`${DIGIMON_API_URL}?${params}`);
            if (res.status === 429) {
                console.warn(`[sync] rate limited on chunk ${i + 1} — waiting 10s...`);
                await sleep(10000);
                i--; // retry same chunk
                continue;
            }
            if (!res.ok) {
                console.warn(`[sync] chunk ${i + 1}/${chunks.length} failed: HTTP ${res.status}`);
                failedChunks++;
            } else {
                const payload = await res.json();
                rows = Array.isArray(payload) ? payload : [];
            }
        } catch (err) {
            console.warn(`[sync] chunk ${i + 1} network error: ${err.message}`);
            failedChunks++;
        }

        rows.forEach((row) => {
            const code = normalizeCode(row?.id || row?.card || '');
            if (!code) return;
            const derived = canonicalMetadata(row);
            if (complete(derived)) out.push(derived);
        });

        if ((i + 1) % 10 === 0 || i + 1 === chunks.length) {
            console.log(`[sync] API progress: ${i + 1}/${chunks.length} chunks · ${out.length} cards so far`);
        }

        await sleep(waitMs);
    }

    if (failedChunks > 0) console.warn(`[sync] ${failedChunks} chunks failed — those cards were skipped`);

    // Dedup by card_code (last write wins)
    const dedup = new Map();
    out.forEach((r) => dedup.set(r.card_code, r));
    return Array.from(dedup.values());
}

// ─── Upsert into decklist_card_metadata ───────────────────────────────────────

async function upsertCardMetadata(rows) {
    const nowIso = new Date().toISOString();
    const payload = rows.map((r) => ({
        card_code:    r.card_code,
        id:           r.id,
        name:         r.name,
        pack:         r.pack,
        color:        r.color,
        card_type:    r.card_type,
        card_level:   r.card_level,
        card_payload: r.card_payload,
        updated_at:   nowIso,
    }));

    const chunks = chunkArray(payload, 500);
    for (let i = 0; i < chunks.length; i++) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/decklist_card_metadata?on_conflict=card_code`,
            {
                method: 'POST',
                headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
                body: JSON.stringify(chunks[i]),
            }
        );
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`upsert failed (chunk ${i + 1}/${chunks.length}): HTTP ${res.status} — ${body}`);
        }
        console.log(`[sync] upserted chunk ${i + 1}/${chunks.length} (${chunks[i].length} rows)`);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return GAME_CODE.test(code) ? code : '';
}

function chunkArray(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function getNumericFlag(flag, fallback) {
    const found = argv.find((a) => a.startsWith(`${flag}=`));
    if (!found) return fallback;
    const n = Number(found.split('=')[1]);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
    console.error('[sync] fatal:', err?.message || err);
    process.exit(1);
});
