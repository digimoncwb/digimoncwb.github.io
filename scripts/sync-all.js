#!/usr/bin/env node

/**
 * Full card catalog sync — runs all steps in one go:
 *   1. Fetch all card codes from getAllCards (valid DCG codes only)
 *   2. Identify codes missing from DB or with stub/incomplete data
 *   3. Fetch metadata from search API (batches of 20, retry 1-by-1 for missed)
 *   4. Upsert to decklist_card_metadata
 *   5. Export catalog JSON to Supabase Storage (card-catalog.json)
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_KEY  (service role key — needed for Storage upload)
 *
 * Usage:
 *   node scripts/sync-all.js
 *   node scripts/sync-all.js --dry-run
 */

const { metadata: canonicalMetadata, complete: metadataComplete } = require('./sync-builder-card-metadata');

const DIGIMON_API_SEARCH  = 'https://digimoncard.io/api-public/search';
const DIGIMON_ALL_CARDS   = 'https://digimoncard.io/api-public/getAllCards';
const SERIES              = 'Digimon Card Game';
const CATALOG_BUCKET      = 'card-catalog';
const CATALOG_FILE        = 'card-catalog.json';
const CHUNK_SIZE          = 20;
const SLEEP_MS            = 800;
const SLEEP_RETRY_MS      = 400;
const REST_PAGE_SIZE      = 1000;

// Valid DCG card codes only — excludes BO-, MO-, DM-, etc.
const VALID_CODE_RE = /^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/;

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const argv   = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[sync-all] Missing SUPABASE_URL or SUPABASE_KEY env vars.');
    process.exit(1);
}

const dbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('[sync-all] Starting full card catalog sync…');
    if (dryRun) console.log('[sync-all] DRY RUN — nothing will be written');

    // Step 1: get all valid DCG codes from getAllCards
    console.log('\n[1/5] Fetching all card codes from getAllCards…');
    const allCodes = await fetchAllCardCodes();
    console.log(`[1/5] ${allCodes.length} valid DCG codes found`);

    // Step 2: compare with DB — find missing or stub records
    console.log('\n[2/5] Checking existing records in decklist_card_metadata…');
    const completeCodes = await fetchCompleteCodesFromDb();
    const toFetch = allCodes.filter(c => !completeCodes.has(c));
    console.log(`[2/5] ${completeCodes.size} already complete — ${toFetch.length} to fetch`);

    if (!toFetch.length) {
        console.log('[2/5] DB is up to date. Skipping API fetch.');
    }

    // Step 3 & 4: fetch metadata + upsert
    let upserted = 0;
    if (toFetch.length) {
        console.log('\n[3/5] Fetching metadata from search API…');
        const rows = await fetchMetadata(toFetch);
        console.log(`[3/5] API returned metadata for ${rows.length} / ${toFetch.length} codes`);

        if (!dryRun && rows.length) {
            console.log('\n[4/5] Upserting to decklist_card_metadata…');
            await upsertRows(rows);
            upserted = rows.length;
            console.log(`[4/5] ${upserted} rows upserted`);
        } else if (dryRun) {
            console.log('[4/5] DRY RUN — skipping upsert. Sample:', JSON.stringify(rows[0], null, 2));
        }
    } else {
        console.log('\n[3/5] No codes to fetch — skipping.');
        console.log('[4/5] No rows to upsert — skipping.');
    }

    // Step 5: export catalog to Supabase Storage
    console.log('\n[5/6] Exporting catalog JSON to Supabase Storage…');
    if (!dryRun) {
        const count = await exportCatalog();
        console.log(`[5/6] Catalog exported — ${count} cards`);
    } else {
        console.log('[5/6] DRY RUN — skipping catalog export.');
    }

    // Step 6: sync deck images to Storage via Edge Function
    console.log('\n[6/6] Syncing deck images to Storage…');
    if (!dryRun) {
        const { done: imgDone, skipped: imgSkipped, failed: imgFailed } = await syncDeckImages();
        console.log(`[6/6] Deck images: ${imgDone} migrated, ${imgSkipped} already in Storage, ${imgFailed} failed`);
    } else {
        console.log('[6/6] DRY RUN — skipping deck image sync.');
    }

    console.log(`\n[sync-all] Done. ${upserted} new/updated cards, catalog exported.`);
}

// ─── Step 1: getAllCards ───────────────────────────────────────────────────────

async function fetchAllCardCodes() {
    const params = new URLSearchParams({ series: SERIES, sort: 'card_number', sortdirection: 'asc' });
    const res = await fetch(`${DIGIMON_ALL_CARDS}?${params}`);
    if (!res.ok) throw new Error(`getAllCards failed: HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('getAllCards returned unexpected format');
    return rows
        .map(r => String(r?.cardnumber || '').trim().toUpperCase())
        .filter(c => c && VALID_CODE_RE.test(c));
}

// ─── Step 2: existing records ─────────────────────────────────────────────────

async function fetchCompleteCodesFromDb() {
    const complete = new Set();
    let offset = 0;
    while (true) {
        const q = new URLSearchParams({
            select: 'card_code,name,color,card_type,card_level,card_payload',
            order: 'card_code.asc',
            limit: String(REST_PAGE_SIZE),
            offset: String(offset),
        });
        const res = await fetch(`${SUPABASE_URL}/rest/v1/decklist_card_metadata?${q}`, { headers: dbHeaders });
        if (!res.ok) throw new Error(`DB fetch failed: HTTP ${res.status}`);
        const batch = await res.json();
        if (!Array.isArray(batch) || !batch.length) break;
        batch.forEach(r => {
            const code = String(r?.card_code || '').trim().toUpperCase();
            if (metadataComplete(r)) complete.add(code);
        });
        if (batch.length < REST_PAGE_SIZE) break;
        offset += REST_PAGE_SIZE;
    }
    return complete;
}

// ─── Step 3: fetch metadata from search API ───────────────────────────────────

async function fetchMetadata(codes) {
    const result = [];
    const found  = new Set();
    const chunks = chunkArray(codes, CHUNK_SIZE);

    // Batch fetch
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if ((i + 1) % 10 === 0 || i + 1 === chunks.length) {
            console.log(`  chunk ${i + 1}/${chunks.length} · ${result.length} cards so far`);
        }

        let retries = 0;
        while (retries < 3) {
            try {
                const q = new URLSearchParams({ card: chunk.join(','), limit: String(CHUNK_SIZE * 2), series: SERIES });
                const res = await fetch(`${DIGIMON_API_SEARCH}?${q}`);
                if (res.status === 429) {
                    console.warn(`  rate limited on chunk ${i + 1} — waiting 10s…`);
                    await sleep(10000);
                    retries++;
                    continue;
                }
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) rows.forEach(row => pushRow(row, result, found));
                }
                break;
            } catch (err) {
                console.warn(`  chunk ${i + 1} error: ${err.message}`);
                retries++;
            }
        }
        await sleep(SLEEP_MS);
    }

    // Retry missed codes 1-by-1
    const missed = codes.filter(c => !found.has(c));
    if (missed.length) {
        console.log(`  ${missed.length} missed in batch — retrying 1-by-1…`);
        for (const code of missed) {
            try {
                const q = new URLSearchParams({ card: code, limit: '2', series: SERIES });
                const res = await fetch(`${DIGIMON_API_SEARCH}?${q}`);
                if (res.status === 429) {
                    await sleep(10000);
                    const res2 = await fetch(`${DIGIMON_API_SEARCH}?${q}`);
                    if (res2.ok) { const rows = await res2.json(); if (Array.isArray(rows)) rows.forEach(r => pushRow(r, result, found)); }
                } else if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) rows.forEach(r => pushRow(r, result, found));
                }
            } catch {}
            await sleep(SLEEP_RETRY_MS);
        }
        const stillMissed = codes.filter(c => !found.has(c));
        if (stillMissed.length) console.warn(`  ${stillMissed.length} codes not found in API (may not exist yet): ${stillMissed.slice(0, 5).join(', ')}…`);
    }

    return result;
}

function pushRow(row, result, found) {
    const code = String(row?.id || row?.card || '').trim().toUpperCase();
    if (!VALID_CODE_RE.test(code) || found.has(code)) return;
    const normalized = canonicalMetadata(row);
    if (!metadataComplete(normalized)) return;
    found.add(code);
    result.push({ ...normalized, updated_at: new Date().toISOString() });
}

// ─── Step 4: upsert ───────────────────────────────────────────────────────────

async function upsertRows(rows) {
    const chunks = chunkArray(rows, 500);
    for (let i = 0; i < chunks.length; i++) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/decklist_card_metadata?on_conflict=card_code`,
            {
                method: 'POST',
                headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(chunks[i]),
            }
        );
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Upsert failed (chunk ${i + 1}/${chunks.length}): HTTP ${res.status} — ${body}`);
        }
        console.log(`  upserted chunk ${i + 1}/${chunks.length} (${chunks[i].length} rows)`);
    }
}

// ─── Step 5: export catalog ───────────────────────────────────────────────────

async function exportCatalog() {
    const all = [];
    let offset = 0;
    while (true) {
        const q = new URLSearchParams({
            select: 'card_code,name,pack,color,card_type,card_level,card_payload',
            order: 'card_code.asc',
            limit: String(REST_PAGE_SIZE),
            offset: String(offset),
        });
        const res = await fetch(`${SUPABASE_URL}/rest/v1/decklist_card_metadata?${q}`, { headers: dbHeaders });
        if (!res.ok) throw new Error(`DB read for catalog failed: HTTP ${res.status}`);
        const batch = await res.json();
        if (!Array.isArray(batch) || !batch.length) break;
        all.push(...batch);
        if (batch.length < REST_PAGE_SIZE) break;
        offset += REST_PAGE_SIZE;
    }

    const catalog = all.map(r => {
        const p = r.card_payload || {};
        return {
            card_code:     r.card_code,
            name:          r.name          || null,
            pack:          r.pack          || null,
            color:         r.color         || null,
            color2:        p.color2        || null,
            card_type:     r.card_type     || null,
            card_level:    r.card_level    ?? null,
            digi_type:     p.digi_type     || p.digitype  || null,
            digi_type2:    p.digi_type2    || null,
            digi_type3:    p.digi_type3    || null,
            digi_type4:    p.digi_type4    || null,
            play_cost:     p.play_cost     ?? p.playcost  ?? null,
            main_effect:   p.main_effect   || null,
            source_effect: p.source_effect || null,
            alt_effect:    p.alt_effect    || null,
        };
    });

    const json = JSON.stringify(catalog);
    const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${CATALOG_BUCKET}/${CATALOG_FILE}`,
        {
            method: 'POST',
            headers: {
                ...dbHeaders,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=21600',
                'x-upsert': 'true',
            },
            body: json,
        }
    );
    if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => '');
        throw new Error(`Storage upload failed: HTTP ${uploadRes.status} — ${detail}`);
    }
    return catalog.length;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────



function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Step 6: sync deck images ─────────────────────────────────────────────────

async function syncDeckImages() {
    const storagePrefix = `${SUPABASE_URL}/storage/v1/object/public/deck-images/`;
    const edgeFnUrl = `${SUPABASE_URL}/functions/v1/upload-card-image`;

    // Load deck_images not yet in Storage
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/deck_images?select=id,image_url&limit=1000`,
        { headers: dbHeaders }
    );
    if (!res.ok) { console.warn(`[deck-images] failed to read deck_images: HTTP ${res.status}`); return { done: 0, skipped: 0, failed: 0 }; }
    const rows = await res.json();

    const toMigrate = (Array.isArray(rows) ? rows : []).filter(r =>
        r.image_url && !String(r.image_url).startsWith(storagePrefix)
    );
    const skipped = rows.length - toMigrate.length;

    if (!toMigrate.length) return { done: 0, skipped, failed: 0 };

    let done = 0, failed = 0;
    for (const row of toMigrate) {
        const codeMatch = String(row.image_url || '').match(/([A-Z]{1,3}\d{0,2}-\d{1,3})\.(?:webp|jpg|png)/i);
        if (!codeMatch) { failed++; continue; }
        const code = codeMatch[1].toUpperCase();

        try {
            const efRes = await fetch(edgeFnUrl, {
                method: 'POST',
                headers: { ...dbHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!efRes.ok) { console.warn(`  ${code}: edge function failed (${efRes.status})`); failed++; continue; }
            const { url } = await efRes.json();
            if (!url) { failed++; continue; }

            await fetch(`${SUPABASE_URL}/rest/v1/deck_images?id=eq.${row.id}`, {
                method: 'PATCH',
                headers: { ...dbHeaders, Prefer: 'return=minimal' },
                body: JSON.stringify({ image_url: url }),
            });
            console.log(`  ${code}: ✓`);
            done++;
        } catch (err) {
            console.warn(`  ${code}: error — ${err.message}`);
            failed++;
        }
        await sleep(100);
    }
    return { done, skipped, failed };
}

main().catch(err => {
    console.error('[sync-all] Fatal error:', err?.message || err);
    process.exit(1);
});
