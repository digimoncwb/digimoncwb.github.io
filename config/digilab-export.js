(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.digilabExport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function toNumberText(value) {
        if (value === null || value === undefined || value === '') return '';
        const number = Number(value);
        return Number.isFinite(number) ? String(number) : '';
    }

    function buildDigilabClipboardText(rows, options = {}) {
        return [...(Array.isArray(rows) ? rows : [])]
            .sort((a, b) => Number(a?.placement || 0) - Number(b?.placement || 0))
            .map((row) => {
                const placement = toNumberText(row?.placement);
                const playerName = String(row?.playerName || '').trim().replace(/\s+/g, ' ');
                const memberId = String(row?.memberNumber || '').trim().replace(/^#+/, '');
                const memberNumber = memberId && options.hashPrefix ? `#${memberId}` : memberId;
                const points = toNumberText(row?.points);
                return [placement, playerName, memberNumber, points]
                    .filter((value) => value !== '')
                    .join(' ');
            })
            .join('\n');
    }

    function normalizeDigilabExportRows(rows) {
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            placement: Number(row?.placement) || '',
            playerName: String(row?.player?.digilab_name || row?.player?.name || '').trim(),
            memberNumber: String(row?.player?.bandai_id || '').trim(),
            points:
                row?.match_points === null || row?.match_points === undefined
                    ? ''
                    : Number(row.match_points)
        }));
    }

    function getMissingMemberNames(rows) {
        return (Array.isArray(rows) ? rows : [])
            .filter((row) => !String(row?.memberNumber || '').trim())
            .map((row) => String(row?.playerName || '').trim() || `Colocação ${row?.placement || '-'}`);
    }

    return {
        buildDigilabClipboardText,
        getMissingMemberNames,
        normalizeDigilabExportRows
    };
});
