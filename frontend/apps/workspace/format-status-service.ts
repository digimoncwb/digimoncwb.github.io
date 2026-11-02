import type { Format } from '../../contracts';

export async function loadAdminGameFormats(
    signal?: AbortSignal,
    session = window.digistatsAdminSession
): Promise<Format[]> {
    if (!(await session.restore()))
        throw new Error('Entre no Admin para visualizar todos os formatos.');
    await session.refresh();
    await session.verify();
    const response = await session.request(
        '/rest/v1/deck_formats?select=*&order=is_default.desc,created_at.asc,id.asc',
        { method: 'GET', signal }
    );
    if (!response.ok)
        throw new Error('Não foi possível carregar todos os formatos administrativos.');
    return response.json();
}

export async function setFormatPublication(
    formatId: string | number,
    status: 'draft' | 'published',
    session = window.digistatsAdminSession
) {
    if (!(await session.restore())) throw new Error('Entre no Admin para gerenciar os formatos.');
    await session.refresh();
    await session.verify();
    const path = `/rest/v1/deck_formats?id=eq.${encodeURIComponent(formatId)}`;
    const current = await session.request(
        `${path}&select=rules_revision,rules_status,validation_rules`,
        {
            method: 'GET'
        }
    );
    if (!current.ok)
        throw new Error('Não foi possível conferir o formato antes de alterar a publicação.');
    const [format] = await current.json();
    if (!format || !Number.isInteger(format.rules_revision))
        throw new Error('Formato indisponível. Atualize a página e tente novamente.');
    if (format.rules_status === status) return;
    if (status === 'published') {
        const rules = format.validation_rules;
        if (!rules || ['main_count', 'egg_max', 'copies'].some((key) => rules[key] == null))
            throw new Error(
                'Defina deck principal, Digi-Eggs e limite de cópias antes de publicar.'
            );
        if (rules.points_pending?.length)
            throw new Error('Confira os códigos pendentes da pontuação antes de publicar.');
    }
    const response = await session.request(`${path}&rules_revision=eq.${format.rules_revision}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
            rules_status: status,
            change_note:
                status === 'draft'
                    ? 'Formato voltou para rascunho; regras e pontuação preservadas.'
                    : 'Formato publicado; regras e pontuação preservadas.'
        })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(
            response.status === 403
                ? 'Somente administradores podem alterar a publicação de formatos.'
                : result?.message || 'Não foi possível voltar o formato para rascunho.'
        );
    if (!Array.isArray(result) || !result.length)
        throw new Error('O formato mudou durante a operação. Atualize a página e tente novamente.');
}

export function returnFormatToDraft(
    formatId: string | number,
    session = window.digistatsAdminSession
) {
    return setFormatPublication(formatId, 'draft', session);
}
