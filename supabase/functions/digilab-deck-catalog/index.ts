import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-digilab-verify-token'
};
const DIGILAB_API_URL = 'https://api.digilab.cards';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
type JsonRecord = Record<string, any>;

class DigilabHttpError extends Error {
    status: number;
    retryAfter: string | null;

    constructor(status: number, message: string, retryAfter: string | null = null) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    const apiKey = Deno.env.get('DIGILAB_API_KEY');
    const verifyToken = Deno.env.get('DIGILAB_VERIFY_TOKEN') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Integração DigiLab não configurada.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const backgroundToken = Deno.env.get('DIGILAB_BACKGROUND_SYNC_TOKEN') || '';
    const backgroundAuthorized = Boolean(
        backgroundToken &&
        (await secretsMatch(req.headers.get('x-digilab-background-token') || '', backgroundToken))
    );
    if (!backgroundAuthorized && !(await authorizeRequest(req, supabase, verifyToken))) {
        return json({ error: 'Não autorizado.' }, 401);
    }

    let input: JsonRecord = {};
    try {
        input = await req.json();
    } catch {
        return json({ error: 'JSON inválido.' }, 400);
    }

    const action = String(input.action || 'list');
    if (backgroundAuthorized && !['sync', 'audit_tournaments'].includes(action))
        return json({ error: 'Ação não autorizada para sincronização.' }, 403);
    try {
        if (action === 'audit_tournaments') {
            if (input.digilab_tournament_id) {
                const id = Number(input.digilab_tournament_id);
                if (!Number.isSafeInteger(id) || id <= 0)
                    return json({ error: 'ID inválido.' }, 400);
                const detail = await digilabGet(apiKey, `/api/tournament/${id}`);
                if (detail.tournament?.scene?.slug !== 'curitiba')
                    return json({ error: 'Scene inválida.' }, 422);
                return json({
                    ok: true,
                    tournament: detail.tournament,
                    standings: detail.standings?.map((row: JsonRecord) => ({
                        placement: row.placement,
                        player: row.player,
                        deck: row.deck
                    })),
                    dnfs: detail.dnfs
                });
            }
            const page = positiveInteger(input.page, 1, 1, MAX_PAGES);
            const listing = await digilabGet(
                apiKey,
                `/api/tournaments?scene=curitiba&per_page=100&page=${page}`
            );
            const meta =
                page === 1
                    ? await digilabGet(
                          apiKey,
                          '/api/meta?scene=curitiba&format=EX12&group_by=archetype&per_page=100'
                      )
                    : null;
            return json({
                ok: true,
                data: listing.data?.map((row: JsonRecord) => ({
                    tournament_id: row.tournament_id,
                    event_date: row.event_date,
                    format: row.format,
                    store_name: row.store_name,
                    player_count: row.player_count
                })),
                pagination: listing.pagination,
                formats: listing.formats,
                meta
            });
        }
        if (action === 'sync') {
            const synced = await syncCatalog(supabase, apiKey);
            const catalog = await loadCatalog(supabase);
            return json({ ok: true, ...synced, ...catalog });
        }
        if (action === 'list') {
            return json({ ok: true, ...(await loadCatalog(supabase)) });
        }
        return json(
            { error: 'O cadastro de decks é gerenciado automaticamente pelo DigiLab.' },
            403
        );
    } catch (error) {
        if (error instanceof DigilabHttpError) {
            return json(
                {
                    error: error.status === 429 ? 'Limite do DigiLab atingido.' : error.message,
                    digilab_status: error.status,
                    retry_after: error.retryAfter
                },
                error.status === 429 ? 429 : 502,
                error.retryAfter ? { 'Retry-After': error.retryAfter } : undefined
            );
        }
        return json(
            { error: error instanceof Error ? error.message : 'Falha no catálogo de decks.' },
            500
        );
    }
});

async function syncCatalog(supabase: any, apiKey: string) {
    const { data: run, error: runError } = await supabase
        .from('digilab_catalog_sync_runs')
        .insert({})
        .select('id')
        .single();
    if (runError) throw new Error('Falha ao registrar sincronização do catálogo.');
    try {
        const rows: JsonRecord[] = [];
        let formats: JsonRecord[] = [];
        let totalPages = 1;
        let totalRows = 0;
        for (let page = 1; page <= totalPages; page += 1) {
            const query = new URLSearchParams({
                format: 'all',
                group_by: 'archetype',
                page: String(page),
                per_page: String(PAGE_SIZE),
                sort: 'entries',
                sort_dir: 'desc'
            });
            const response = await digilabGet(apiKey, `/api/meta?${query}`);
            const pages = Number(response?.pagination?.total_pages);
            const total = Number(response?.pagination?.total);
            if (
                !Array.isArray(response?.data) ||
                !Number.isSafeInteger(pages) ||
                pages < 1 ||
                pages > MAX_PAGES ||
                !Number.isSafeInteger(total) ||
                total < 1
            )
                throw new Error('Paginação inválida; dados anteriores preservados.');
            if (page === 1) {
                totalPages = pages;
                totalRows = total;
                if (!Array.isArray(response.formats) || !response.formats.length)
                    throw new Error('Formatos ausentes; dados anteriores preservados.');
                formats = response.formats.map(toFormatRow);
            } else if (pages !== totalPages || total !== totalRows)
                throw new Error('Catálogo mudou durante a consulta; tente novamente.');
            rows.push(...response.data);
        }
        const catalogRows = rows.map(toCatalogRow);
        if (rows.length !== totalRows || catalogRows.some((row) => !row))
            throw new Error('Catálogo incompleto; dados anteriores preservados.');
        const images = await storeCatalogImages(supabase, catalogRows as JsonRecord[]);
        const { data, error } = await supabase.rpc('apply_digilab_catalog_snapshot', {
            p_decks: catalogRows,
            p_formats: formats
        });
        if (error) throw new Error(`Falha ao aplicar catálogo: ${error.message}`);
        const summary = {
            ...data,
            images,
            request_count: totalPages,
            fetched_archetypes: rows.length,
            fetched_families: new Set(rows.map((row) => row.family_slug).filter(Boolean)).size
        };
        const { error: logError } = await supabase
            .from('digilab_catalog_sync_runs')
            .update({ status: 'completed', finished_at: new Date().toISOString(), summary })
            .eq('id', run.id);
        if (logError) throw new Error('Catálogo aplicado, mas falhou o registro da conclusão.');
        return summary;
    } catch (error) {
        await supabase
            .from('digilab_catalog_sync_runs')
            .update({
                status: 'failed',
                finished_at: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Falha na sincronização.'
            })
            .eq('id', run.id);
        throw error;
    }
}

async function storeCatalogImages(supabase: any, rows: JsonRecord[]) {
    const codes = [...new Set(rows.map((row) => row.display_card_id).filter(Boolean))] as string[];
    if (codes.some((code) => !/^[A-Z0-9]+-\d+$/.test(code)))
        throw new Error('Código de imagem inválido; catálogo anterior preservado.');
    const summary = { uploaded: 0, reused: 0 };
    if (!codes.length) return summary;
    const bucket = supabase.storage.from('deck-images');
    const existing = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list('digilab', {
            limit: 1000,
            offset,
            sortBy: { column: 'name', order: 'asc' }
        });
        if (error) throw new Error(`Falha ao consultar imagens: ${error.message}`);
        for (const file of data) if (file.metadata?.size > 0) existing.add(file.name);
        if (data.length < 1000) break;
    }
    let next = 0;
    const urls = new Map<string, string>();
    await Promise.all(
        Array.from({ length: Math.min(4, codes.length) }, async () => {
            while (next < codes.length) {
                const code = codes[next++];
                const cached = ['jpg', 'webp', 'png']
                    .map((extension) => code + '.' + extension)
                    .find((filename) => existing.has(filename));
                let path = cached ? 'digilab/' + cached : '';
                if (cached) summary.reused++;
                else {
                    const { bytes, extension, contentType } = await downloadCatalogImage(
                        bucket,
                        code
                    );
                    path = 'digilab/' + code + '.' + extension;
                    const { error } = await bucket.upload(path, bytes, {
                        contentType,
                        cacheControl: '31536000',
                        upsert: true
                    });
                    if (error) throw new Error(`Falha ao armazenar ${code}: ${error.message}`);
                    summary.uploaded++;
                }
                urls.set(code, bucket.getPublicUrl(path).data.publicUrl);
            }
        })
    );
    for (const row of rows) row.image_url = urls.get(row.display_card_id) || null;
    return summary;
}

async function downloadCatalogImage(bucket: any, code: string) {
    const candidates = [
        'https://digimon.digilab.cards/api/card/' + code + '.jpg',
        bucket.getPublicUrl(code + '.webp').data.publicUrl
    ];
    for (const url of candidates) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) {
                await response.body?.cancel();
                continue;
            }
            const contentType = response.headers.get('content-type')?.split(';')[0];
            if (!['image/jpeg', 'image/webp', 'image/png'].includes(contentType || '')) {
                await response.body?.cancel();
                continue;
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length < 5000 || bytes.length > 10 * 1024 * 1024) continue;
            const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && contentType === 'image/jpeg';
            const webp =
                String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
                String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' &&
                contentType === 'image/webp';
            const png =
                bytes[0] === 0x89 &&
                String.fromCharCode(...bytes.slice(1, 4)) === 'PNG' &&
                contentType === 'image/png';
            if (jpeg || webp || png)
                return { bytes, extension: jpeg ? 'jpg' : webp ? 'webp' : 'png', contentType };
        } catch {
            /* Try the next source for the same representative card. */
        }
    }
    throw new Error('Imagem ' + code + ' indisponível ou inválida; catálogo anterior preservado.');
}

function toFormatRow(row: JsonRecord) {
    const code = cleanText(row.format_id || row.code || row.format)?.toUpperCase();
    const name = cleanText(row.set_name) || cleanText(row.display_name);
    const date = cleanText(row.release_date);
    if (
        !code ||
        !/^[A-Z0-9][A-Z0-9.-]*$/.test(code) ||
        !name ||
        (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    )
        throw new Error(`Formato inválido; dados anteriores preservados: ${JSON.stringify(row)}`);
    return { code, name, release_date: date };
}

function toCatalogRow(row: JsonRecord) {
    const id = Number(row.archetype_id);
    const slug = String(row.slug || '').trim();
    const name = String(row.archetype_name || '').trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !slug || !name) return null;
    return {
        digilab_archetype_id: id,
        slug,
        name,
        family_slug: cleanText(row.family_slug),
        family_name: cleanText(row.family_name),
        primary_color: cleanText(row.primary_color),
        secondary_color: cleanText(row.secondary_color),
        display_card_id: cleanText(row.display_card_id),
        total_entries: nullableInteger(row.entries),
        firsts: nullableInteger(row.firsts),
        pilots: nullableInteger(row.pilots),
        raw_payload: row
    };
}

async function loadCatalog(supabase: any) {
    const [catalogResult, mappingsResult, decksResult, familiesResult, resultsResult] =
        await Promise.all([
            supabase
                .from('digilab_deck_catalog')
                .select(
                    'digilab_archetype_id,slug,name,family_slug,family_name,primary_color,secondary_color,display_card_id,total_entries,is_active,last_seen_at'
                )
                .order('total_entries', { ascending: false, nullsFirst: false })
                .order('name'),
            supabase
                .from('digilab_deck_sync')
                .select('digilab_archetype_id,digilab_deck_slug,deck_id'),
            supabase
                .from('decks')
                .select(
                    'id,name,slug,family_id,primary_color,secondary_color,display_card_id,is_active'
                )
                .order('name'),
            supabase.from('deck_families').select('id,name,slug,is_active').order('name'),
            supabase.from('tournament_results').select('deck_id')
        ]);
    if (
        catalogResult.error ||
        mappingsResult.error ||
        decksResult.error ||
        familiesResult.error ||
        resultsResult.error
    ) {
        throw new Error('Falha ao carregar o catálogo comparado.');
    }

    const decks = decksResult.data || [];
    const families = familiesResult.data || [];
    const decksById = new Map(decks.map((deck: JsonRecord) => [deck.id, deck]));
    const familyById = new Map(families.map((family: JsonRecord) => [family.id, family]));
    const usedDeckIds = new Set(
        (resultsResult.data || []).map((result: JsonRecord) => String(result.deck_id))
    );
    const mappingBySlug = new Map(
        (mappingsResult.data || []).map((mapping: JsonRecord) => [
            mapping.digilab_deck_slug,
            mapping
        ])
    );

    const data = (catalogResult.data || []).map((item: JsonRecord) => {
        const mapping = mappingBySlug.get(item.slug);
        const mappedDeck = mapping ? decksById.get(mapping.deck_id) : null;
        const exact = decks.filter(
            (deck: JsonRecord) => normalize(deck.name) === normalize(item.name)
        );
        const suggestedDeck = mappedDeck || (exact.length === 1 ? exact[0] : null);
        const family = suggestedDeck?.family_id
            ? familyById.get(suggestedDeck.family_id)
            : families.find(
                  (candidate: JsonRecord) =>
                      normalize(candidate.slug) === normalize(item.family_slug)
              ) || null;
        return {
            ...item,
            used_in_digistats: suggestedDeck ? usedDeckIds.has(String(suggestedDeck.id)) : false,
            status: mappedDeck ? 'mapped' : exact.length === 1 ? 'exact_name' : 'unmapped',
            local_deck: suggestedDeck
                ? {
                      deck_id: suggestedDeck.id,
                      deck_name: suggestedDeck.name,
                      family_id: suggestedDeck.family_id || null
                  }
                : null,
            local_family: family
                ? { family_id: family.id, family_name: family.name, family_slug: family.slug }
                : null
        };
    });

    return {
        data,
        deck_options: decks.map((deck: JsonRecord) => ({
            deck_id: deck.id,
            deck_name: deck.name,
            family_id: deck.family_id || null
        })),
        family_options: families.map((family: JsonRecord) => ({
            family_id: family.id,
            family_name: family.name,
            family_slug: family.slug
        })),
        counts: data.reduce(
            (counts: JsonRecord, row: JsonRecord) => {
                counts[row.status] = (counts[row.status] || 0) + 1;
                return counts;
            },
            { mapped: 0, exact_name: 0, unmapped: 0 }
        )
    };
}

async function digilabGet(apiKey: string, path: string) {
    let response: Response;
    try {
        response = await fetch(`${DIGILAB_API_URL}${path}`, {
            headers: { 'X-API-Key': apiKey }
        });
    } catch {
        throw new DigilabHttpError(0, 'Falha de rede ao consultar o DigiLab.');
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new DigilabHttpError(
            response.status,
            typeof body?.error === 'string' ? body.error : `DigiLab HTTP ${response.status}`,
            response.headers.get('retry-after')
        );
    }
    return body;
}

async function authorizeRequest(req: Request, supabase: any, verifyToken: string) {
    const operatorToken = req.headers.get('x-digilab-verify-token') || '';
    if (verifyToken && (await secretsMatch(operatorToken, verifyToken))) return true;
    const match = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return false;
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user?.id) return false;
    const { data: admin, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
    return !adminError && Boolean(admin);
}

async function secretsMatch(provided: string, expected: string) {
    if (!provided || !expected) return false;
    const encoder = new TextEncoder();
    const [leftHash, rightHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(provided)),
        crypto.subtle.digest('SHA-256', encoder.encode(expected))
    ]);
    const left = new Uint8Array(leftHash);
    const right = new Uint8Array(rightHash);
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

function normalize(value: unknown) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function cleanText(value: unknown) {
    const text = String(value || '').trim();
    return text || null;
}

function nullableInteger(value: unknown) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number) {
    const number = Number(value ?? fallback);
    return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, ...extraHeaders, 'Content-Type': 'application/json' }
    });
}
