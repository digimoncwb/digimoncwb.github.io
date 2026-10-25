import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CANDIDATES = (code: string) => [
    `https://digimon.digilab.cards/api/card/${code}.jpg`,
    `https://aegis-digi.online/assets/card-images/${code}-Sample.webp`,
    `https://digimoncardgame.fandom.com/wiki/Special:FilePath/${code}-Sample.png`,
    `https://deckbuilder.egmanevents.com/card_images/digimon/${code}.webp`,
];

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    let code: string;
    try {
        ({ code } = await req.json());
    } catch {
        return json({ error: 'body inválido' }, 400);
    }

    if (!code || !/^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/i.test(code)) {
        return json({ error: 'código inválido' }, 400);
    }

    code = code.toUpperCase();

    let imageData: ArrayBuffer | null = null;
    let contentType = 'image/webp';

    for (const url of CANDIDATES(code)) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                redirect: 'follow',
            });
            if (!res.ok) continue;
            const ct = res.headers.get('content-type') || '';
            if (!ct.startsWith('image/')) continue;
            const buf = await res.arrayBuffer();
            if (buf.byteLength < 5000) continue; // branco/placeholder do egmanevents
            imageData = buf;
            contentType = ct;
            break;
        } catch { continue; }
    }

    if (!imageData) return json({ error: 'imagem não encontrada', code }, 404);

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase.storage
        .from('deck-images')
        .upload(`${code}.webp`, imageData, {
            contentType,
            upsert: true,
            cacheControl: '3600',
        });

    if (error) return json({ error: error.message }, 500);

    const publicUrl =
        `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/deck-images/${encodeURIComponent(code)}.webp`;

    return json({ url: publicUrl });
});

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}
