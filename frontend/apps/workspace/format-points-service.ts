import type { FormatRules } from '../builder/editor-model';

export type PointAddition = { code: string; name: string; points: number };
export async function savePointAdditions(
    formatId: string | number,
    additions: PointAddition[],
    session = window.digistatsAdminSession
) {
    return savePointChanges(formatId, additions, [], session);
}
export async function savePointChanges(
    formatId: string | number,
    additions: PointAddition[],
    removedCodes: string[] = [],
    session = window.digistatsAdminSession
) {
    if (!additions.length && !removedCodes.length) return;
    if (
        additions.some(
            (row) =>
                !/^[A-Z0-9]+-[0-9]{1,4}$/.test(row.code) ||
                !row.name.trim() ||
                !Number.isInteger(row.points) ||
                row.points < 0 ||
                row.points > 1000000
        )
    )
        throw new Error('Confira os códigos e os pontos antes de salvar.');
    if (!(await session.restore())) throw new Error('Entre no Admin para salvar a pontuação.');
    await session.refresh();
    await session.verify();
    const path = `/rest/v1/deck_formats?id=eq.${encodeURIComponent(formatId)}`;
    const current = await session.request(`${path}&select=validation_rules,rules_revision`, {
        method: 'GET'
    });
    if (!current.ok)
        throw new Error('Não foi possível conferir o formato antes de salvar a pontuação.');
    const [format] = (await current.json()) as {
        validation_rules: FormatRules;
        rules_revision: number;
    }[];
    if (!format) throw new Error('Formato não encontrado. Reabra a edição e tente novamente.');
    if (format.validation_rules?.points_limit == null)
        throw new Error('Ative e salve a pontuação do formato antes de adicionar cartas.');
    const codes = new Set([...additions.map((row) => row.code), ...removedCodes]);
    const removed = new Set(removedCodes);
    const rules: FormatRules = {
        ...format.validation_rules,
        card_points: {
            ...Object.fromEntries(
                Object.entries(format.validation_rules.card_points || {}).filter(
                    ([code]) => !removed.has(code)
                )
            ),
            ...Object.fromEntries(
                additions.map((row) => [row.code, { name: row.name, points: row.points }])
            )
        },
        points_pending: (format.validation_rules.points_pending || []).filter(
            (row) => !codes.has(row.code)
        )
    };
    const response = await session.request(`${path}&rules_revision=eq.${format.rules_revision}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
            validation_rules: rules,
            change_note: removedCodes.length
                ? `${removedCodes.length} carta(s) removida(s) da pontuação com salvamento automático.`
                : `${additions.length === 1 ? 'Carta adicionada ou atualizada' : `${additions.length} cartas adicionadas ou atualizadas`} na pontuação com salvamento automático.`
        })
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
            response.status === 403
                ? 'Somente administradores podem salvar a pontuação.'
                : body.message || 'Não foi possível salvar a pontuação. Tente novamente.'
        );
    }
    if (!(await response.json()).length)
        throw new Error(
            'O formato foi alterado durante a gravação. Tente salvar a pontuação novamente.'
        );
}
