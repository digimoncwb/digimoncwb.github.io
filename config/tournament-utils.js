(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.tournamentUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function isTeamTournament(value) {
        return (
            String(value || '')
                .trim()
                .toLowerCase() === '2v2'
        );
    }

    function resultPlacement(index, type) {
        return isTeamTournament(type) ? Math.floor(index / 2) + 1 : index + 1;
    }

    function expandTeamOcrResults(results, type) {
        if (!isTeamTournament(type)) return results;
        if (results.length > 18)
            throw new Error('O torneio 2v2 permite até 18 duplas (36 jogadores).');
        return results.flatMap((row) => [
            row,
            {
                id: null,
                player_id: '',
                player_name: '',
                deck_id: '',
                deck_name: '',
                match_points: row.match_points,
                ocr_member_id: '',
                ocr_player_unmatched: false
            }
        ]);
    }

    function validateTeamResults(results, type) {
        if (!isTeamTournament(type)) return '';
        if (!results.length || results.length % 2)
            return 'Cada dupla precisa de dois jogadores e dois decks.';
        if (results.some((row) => !row.player_id || !row.deck_id))
            return 'Informe os dois jogadores e os dois decks de cada dupla.';
        if (new Set(results.map((row) => String(row.player_id))).size !== results.length)
            return 'Um jogador não pode participar de mais de uma dupla.';
        return '';
    }
    function normalizeMatchPoints(value) {
        if (value === null || value === undefined || String(value).trim() === '') return null;
        const points = Number(String(value).trim().replace(',', '.'));
        return Number.isInteger(points) && points >= 0 ? points : null;
    }

    function normalizeEntityName(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseDigilabTournamentId(value) {
        const raw = String(value || '').trim();
        if (/^\d+$/.test(raw)) {
            const id = Number(raw);
            return Number.isSafeInteger(id) && id > 0 ? id : null;
        }

        try {
            const url = new URL(raw);
            const host = url.hostname.toLowerCase().replace(/^www\./, '');
            const match = url.pathname.match(/^\/tournament\/(\d+)\/?$/i);
            if (host !== 'digilab.cards' || !match) return null;
            const id = Number(match[1]);
            return Number.isSafeInteger(id) && id > 0 ? id : null;
        } catch {
            return null;
        }
    }

    function getWeekdayFromIsoDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        )
            return null;
        return date.getUTCDay();
    }

    function findScheduledStoreId(schedule, dateValue) {
        const weekday = getWeekdayFromIsoDate(dateValue);
        if (weekday === null || !Array.isArray(schedule)) return null;
        const entry = schedule.find(
            (item) => Number(item?.weekday) === weekday && item?.is_active !== false
        );
        return entry?.store_id ? String(entry.store_id) : null;
    }

    return {
        isTeamTournament,
        resultPlacement,
        expandTeamOcrResults,
        validateTeamResults,
        findScheduledStoreId,
        getWeekdayFromIsoDate,
        normalizeEntityName,
        normalizeMatchPoints,
        parseDigilabTournamentId
    };
});
