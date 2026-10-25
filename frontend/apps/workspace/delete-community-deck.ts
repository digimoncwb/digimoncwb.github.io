export async function deleteCommunityDeck(
    id: string | number,
    updatedAt: string,
    session = window.digistatsAdminSession
) {
    if (typeof window !== 'undefined' && window.digistatsAuth?.getSnapshot().available) {
        await window.digistatsAuth.requireMember();
        const result = await window.digistatsAuth.rpc('delete_community_deck', {
            p_decklist_id: id,
            p_updated_at: updatedAt
        });
        if (String(result) !== String(id))
            throw new Error('Não foi possível confirmar a exclusão. Atualize a lista.');
        return;
    }
    if (!(await session.restore())) throw new Error('Entre no Admin para excluir um deck.');
    await session.refresh();
    await session.verify();
    const response = await session.request('/rest/v1/rpc/delete_community_deck', {
        method: 'POST',
        body: JSON.stringify({ p_decklist_id: id, p_updated_at: updatedAt })
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error.code === '42501'
                ? 'Somente administradores podem excluir decks da comunidade.'
                : error.code === '40001'
                  ? 'Este deck foi alterado. Feche esta confirmação, atualize a lista e tente novamente.'
                  : error.message || 'Não foi possível excluir o deck. Tente novamente.'
        );
    }
    if (String(await response.json()) !== String(id))
        throw new Error('Não foi possível confirmar a exclusão. Atualize a lista.');
}
