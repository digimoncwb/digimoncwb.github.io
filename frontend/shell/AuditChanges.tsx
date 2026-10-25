const labels: Record<string, string> = {
    name: 'Nome',
    username: 'Usuário',
    display_name: 'Nome de exibição',
    status: 'Estado',
    owner_user_id: 'Proprietário',
    creator_player_id: 'Autor creditado',
    player_id: 'Jogador',
    draft_cards: 'Cartas do deck',
    draft_revision: 'Revisão do deck',
    privacy_version: 'Versão do aviso',
    terms_version: 'Versão dos termos',
    declared_adult: 'Declaração de maioridade',
    audit_retention_days: 'Retenção (dias)',
    accounts_enabled: 'Controle de contas',
    qty: 'Quantidade'
};
function display(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (
        Array.isArray(value) &&
        value.every((item) => item && typeof item === 'object' && 'code' in item && 'qty' in item)
    )
        return value.map((item) => `${item.code} ×${item.qty}`).join(', ') || 'Sem cartas';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function AuditChanges({ value }: { value: unknown }) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return <span>{display(value)}</span>;
    return (
        <div className="site-audit-changes">
            <table>
                <thead>
                    <tr>
                        <th>Campo</th>
                        <th>Antes</th>
                        <th>Depois</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(value).map(([field, delta]) => {
                        const change =
                            delta && typeof delta === 'object'
                                ? (delta as Record<string, unknown>)
                                : null;
                        return (
                            <tr key={field}>
                                <th>{labels[field] || field}</th>
                                {change?.changed === true ? (
                                    <td colSpan={2}>Alteração registrada; conteúdo protegido.</td>
                                ) : change && ('before' in change || 'after' in change) ? (
                                    <>
                                        <td>{display(change.before)}</td>
                                        <td>{display(change.after)}</td>
                                    </>
                                ) : (
                                    <td colSpan={2}>{display(delta)}</td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <details>
                <summary>Dados técnicos do evento</summary>
                <pre>{JSON.stringify(value, null, 2)}</pre>
            </details>
        </div>
    );
}
