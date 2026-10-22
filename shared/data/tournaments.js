'use strict';

(function defineLiveData(root) {
    const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    function orderFormats(formats) {
        return [...formats].sort(
            (a, b) =>
                (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) ||
                Number(b.id) - Number(a.id)
        );
    }
    function compareFormatCodes(a, b, formats) {
        const ordered = orderFormats(formats).map((format) => String(format.code).toUpperCase());
        const left = ordered.indexOf(String(a).toUpperCase());
        const right = ordered.indexOf(String(b).toUpperCase());
        return (
            (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right) ||
            String(b).localeCompare(String(a), 'pt-BR', { numeric: true })
        );
    }
    function validImage(value) {
        try {
            const url = new URL(value);
            return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
        } catch {
            return '';
        }
    }
    function formatLabel(code, formats) {
        const row = formats.find(
            (format) => String(format.code).toUpperCase() === String(code).toUpperCase()
        );
        const name = String(row?.name || '').trim();
        return name && name.toUpperCase() !== String(code).toUpperCase()
            ? `${name} - ${code}`
            : String(code);
    }
    function eventsForFormat(events, code) {
        const selected = String(code || '')
            .trim()
            .toUpperCase();
        return events.filter(
            (event) => !selected || String(event.format).trim().toUpperCase() === selected
        );
    }
    function weekStart(date) {
        const day = new Date(`${date}T12:00:00Z`);
        day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
        return day.toISOString().slice(0, 10);
    }
    function weekEnd(start) {
        const day = new Date(`${start}T12:00:00Z`);
        day.setUTCDate(day.getUTCDate() + 6);
        return day.toISOString().slice(0, 10);
    }
    function displayDate(date) {
        return date.split('-').reverse().join('/');
    }
    function normalize(data) {
        const stores = new Map(data.stores.map((store) => [String(store.id), store]));
        const formats = new Map(data.formats.map((format) => [String(format.id), format]));
        const deckFormats = new Map((data.deckFormats || []).map((format) => [String(format.id), format]));
        const dates = new Map();
        data.tournaments.forEach((event) => {
            const key = `${event.store_id}:${event.tournament_date}`;
            dates.set(key, (dates.get(key) || 0) + 1);
        });
        const resultsByEvent = new Map();
        const legacyResults = new Map();
        data.results.forEach((row) => {
            const map = row.tournament_id == null ? legacyResults : resultsByEvent;
            const key =
                row.tournament_id == null
                    ? `${row.store_id}:${row.tournament_date}`
                    : String(row.tournament_id);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(row);
        });
        return data.tournaments
            .map((event) => {
                const team =
                    String(event.tournament_name || '')
                        .trim()
                        .toLowerCase() === '2v2';
                const deckless =
                    String(event.tournament_name || '')
                        .trim()
                        .toLowerCase()
                        .replaceAll(' ', '_') === 'release_event';
                const store = stores.get(String(event.store_id));
                const key = `${event.store_id}:${event.tournament_date}`;
                const rows = [
                    ...(resultsByEvent.get(String(event.id)) || []),
                    ...(dates.get(key) === 1 ? legacyResults.get(key) || [] : [])
                ].sort(
                    (a, b) =>
                        Number(a.placement) - Number(b.placement) ||
                        Number(a.team_member || 1) - Number(b.team_member || 1)
                );
                const player = (row) =>
                    row
                        ? {
                              id: String(row.id),
                              name: row.player || 'Jogador não informado',
                              deck: deckless ? '' : row.deck || 'Deck não informado',
                              image: deckless ? '' : validImage(row.image_url),
                              placement: Number(row.placement)
                          }
                        : null;
                const standing = (place) => {
                    const members = rows
                        .filter((row) => Number(row.placement) === place)
                        .map(player);
                    if (!members.length) return null;
                    return team
                        ? {
                              ...members[0],
                              name: members.map((member) => member.name).join(' & '),
                              deck: members.map((member) => member.deck).join(' / '),
                              members
                          }
                        : members[0];
                };
                return {
                    id: String(event.id),
                    storeId: String(event.store_id),
                    title: deckless ? 'Release Event' : event.tournament_name || 'Torneio',
                    deckless,
                    team,
                    store: store?.name || 'Loja não informada',
                    logo: validImage(store?.logo_url),
                    isoDate: event.tournament_date,
                    date: displayDate(event.tournament_date),
                    day: weekdays[new Date(`${event.tournament_date}T12:00:00Z`).getUTCDay()],
                    players: Number(event.total_players) || 0,
                    format: formats.get(String(event.format_id))?.code || 'Não informado',
                    deckFormatId: String(event.deck_format_id || ''),
                    deckFormat: deckFormats.get(String(event.deck_format_id))?.name || 'Padrão',
                    winner: standing(1),
                    podium: [1, 2, 3].map(standing),
                    results: rows.map(player),
                    instagram: validImage(event.instagram_link)
                };
            })
            .sort((a, b) => b.isoDate.localeCompare(a.isoDate) || a.id.localeCompare(b.id));
    }
    async function readAll(table, select, request, signal) {
        const rows = [];
        const size = 500;
        for (let offset = 0; ; offset += size) {
            const query = new URLSearchParams({
                select,
                order:
                    table === 'tournament_weekly_schedule'
                        ? 'weekday.asc'
                        : table === 'formats'
                          ? 'created_at.desc,id.desc'
                          : 'id.asc',
                limit: String(size),
                offset: String(offset)
            });
            const response = await request(`/rest/v1/${table}?${query}`, { signal });
            if (!response.ok)
                throw new Error(`Não foi possível carregar ${table} (HTTP ${response.status}).`);
            const page = await response.json();
            if (!Array.isArray(page)) throw new Error('Resposta de dados inválida.');
            rows.push(...page);
            if (page.length < size) return rows;
        }
    }
    async function load(request, signal) {
        const [tournaments, results, stores, formats, schedule, deckFormats] = await Promise.all([
            readAll(
                'tournament',
                'id,store_id,tournament_date,tournament_name,total_players,format_id,deck_format_id,instagram_link',
                request,
                signal
            ),
            readAll(
                'v_podium_full',
                'id,tournament_id,store_id,tournament_date,placement,player,deck,image_url,format_code,team_member',
                request,
                signal
            ),
            readAll('stores', 'id,name,logo_url,is_active,bandai_nick', request, signal),
            readAll('formats', 'id,code,name,is_active,is_default,created_at', request, signal),
            readAll('tournament_weekly_schedule', 'weekday,store_id,is_active', request, signal),
            readAll('deck_formats', 'id,code,name,is_active,is_default,created_at,description,rules_text,rules_url,is_community_highlight,validation_rules,rules_revision,rules_status,updated_at,change_note', request, signal)
        ]);
        return {
            events: normalize({ tournaments, results, stores, formats, deckFormats }),
            stores,
            formats: orderFormats(formats),
            deckFormats,
            schedule
        };
    }
    const api = {
        load,
        normalize,
        readAll,
        weekStart,
        weekEnd,
        displayDate,
        validImage,
        orderFormats,
        compareFormatCodes,
        formatLabel,
        eventsForFormat
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.liveData = api;
})(typeof window !== 'undefined' ? window : globalThis);
