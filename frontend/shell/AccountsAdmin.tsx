import { AuditHealth } from './AuditHealth';
import { AuditChanges } from './AuditChanges';
import { prepareAuditExport } from './audit-export';
import { AccountErasure } from './AccountErasure';
import { useEffect, useRef, useState } from 'react';
import type { SiteAuth } from '../contracts';
import { useSiteAuth } from '../shared/site-auth';
import { SearchSelect } from '../shared/SearchSelect';
import { downloadAccountJson } from '../shared/account-download';

type Account = {
    user_id: string;
    username: string;
    display_name: string;
    status: string;
    is_admin: boolean;
    player_id: string | null;
    email_confirmed: boolean;
};
type Request = {
    id: string;
    user_id: string;
    display_name: string;
    username: string;
    request_type: string;
    status: string;
    player_id: string | null;
    player_name: string | null;
    decklist_id: number | null;
    note: string;
    review_note: string | null;
};
type AuditEvent = {
    event_id: number;
    occurred_at: string;
    actor_user_id: string | null;
    actor_kind: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    outcome: string;
    changes: unknown;
    operation_id: string;
};
type LegacyDeck = { id: number; name: string; updated_at: string };
type PlayerAdmin = {
    player_id: string;
    player_name: string;
    bandai_nick: string | null;
    username: string;
    enabled: boolean;
    claimed: boolean;
};
const tabs = [
    { value: 'accounts', label: 'Contas' },
    { value: 'requests', label: 'Solicitações' },
    { value: 'legacy', label: 'Propriedade de decks' },
    { value: 'audit', label: 'Auditoria' }
];

export function AccountsAdmin({
    auth,
    onBusy,
    scope = 'accounts'
}: {
    auth: SiteAuth;
    onBusy(value: boolean): void;
    scope?: 'accounts' | 'audit';
}) {
    const state = useSiteAuth();
    const [tab, setTab] = useState(scope === 'audit' ? 'audit' : 'accounts');
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [term, setTerm] = useState('');
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [playerAdmins, setPlayerAdmins] = useState<PlayerAdmin[]>([]);
    const [requests, setRequests] = useState<Request[]>([]);
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [unownedOnly, setUnownedOnly] = useState(true);
    const [outcome, setOutcome] = useState('');
    const [operation, setOperation] = useState('');
    const [legacy, setLegacy] = useState<LegacyDeck[]>([]);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [transfer, setTransfer] = useState<LegacyDeck | null>(null);
    const [ownerId, setOwnerId] = useState('');
    const [transferReason, setTransferReason] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const [entity, setEntity] = useState('');
    const [entityId, setEntityId] = useState('');
    const [actor, setActor] = useState('');
    const [action, setAction] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [auditQuery, setAuditQuery] = useState<Record<string, unknown>>({
        p_to: new Date().toISOString()
    });
    const exportController = useRef<AbortController | null>(null);
    const [exportProgress, setExportProgress] = useState('');
    const requestGeneration = useRef(0);
    useEffect(
        () => () => {
            exportController.current?.abort();
        },
        []
    );
    useEffect(() => {
        const generation = ++requestGeneration.current;
        setAccounts([]);
        setPlayerAdmins([]);
        setRequests([]);
        setEvents([]);
        setLegacy([]);
        if (!state.isAdmin) return;
        setLoading(true);
        setError('');
        (async () => {
            if (tab === 'accounts' || tab === 'legacy') {
                const [rows, grants] = await Promise.all([
                    auth.rpc<Account[]>('admin_list_site_accounts', {
                        p_search: term,
                        p_offset: tab === 'legacy' ? 0 : page * 50
                    }),
                    tab === 'accounts'
                        ? auth.rpc<PlayerAdmin[]>('admin_list_player_admins')
                        : Promise.resolve([])
                ]);
                if (generation === requestGeneration.current) {
                    setAccounts(rows);
                    setPlayerAdmins(grants);
                }
            }
            if (tab === 'requests') {
                const rows = await auth.rpc<Request[]>('admin_account_requests', {
                    p_offset: page * 50
                });
                if (generation === requestGeneration.current) setRequests(rows);
            }
            if (tab === 'audit') {
                const rows = await auth.rpc<AuditEvent[]>('admin_audit_events', {
                    ...auditQuery,
                    p_offset: page * 100
                });
                if (generation === requestGeneration.current) setEvents(rows);
            }
            if (tab === 'legacy') {
                const response = await auth.request(
                    `/rest/v1/decklists?tournament_result_id=is.null&${unownedOnly ? 'owner_user_id=is.null&' : ''}select=id,name,updated_at&order=updated_at.desc&limit=50&offset=${page * 50}`
                );
                if (!response.ok)
                    throw new Error('Não foi possível carregar os decks sem proprietário.');
                const rows = await response.json();
                if (generation === requestGeneration.current) setLegacy(rows);
            }
        })()
            .catch((error) => {
                if (generation === requestGeneration.current) setError(error.message);
            })
            .finally(() => {
                if (generation === requestGeneration.current) setLoading(false);
            });
        return () => {
            requestGeneration.current++;
        };
    }, [auth, state.isAdmin, state.user?.id, tab, page, term, auditQuery, revision, unownedOnly]);
    async function run(task: () => Promise<void>, success: string) {
        if (busy) return;
        setBusy(true);
        onBusy(true);
        setError('');
        setNotice('');
        try {
            await task();
            setNotice(success);
            setRevision((value) => value + 1);
        } catch (error) {
            setError((error as Error).message);
        } finally {
            setBusy(false);
            onBusy(false);
        }
    }
    if (!state.isAdmin)
        return <p role="alert">Entre com uma conta administrativa ativa para acessar esta área.</p>;
    const count =
        tab === 'accounts'
            ? accounts.length
            : tab === 'requests'
              ? requests.length
              : tab === 'legacy'
                ? legacy.length
                : events.length;
    return (
        <section className="site-account-admin">
            {scope === 'accounts' && (
                <div className="site-account-tabs" aria-label="Gerenciamento de contas">
                    {tabs
                        .filter((item) => item.value !== 'audit')
                        .map((item) => (
                            <button
                                type="button"
                                className="button secondary"
                                key={item.value}
                                aria-pressed={tab === item.value}
                                disabled={busy}
                                onClick={() => {
                                    setTab(item.value);
                                    setPage(0);
                                    setNotice('');
                                }}
                            >
                                {item.label}
                            </button>
                        ))}
                </div>
            )}
            {error && (
                <p role="alert">
                    {error}{' '}
                    <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setRevision((value) => value + 1)}
                    >
                        Atualizar
                    </button>
                </p>
            )}
            {notice && <p role="status">{notice}</p>}
            {loading && <p role="status">Carregando…</p>}
            {(tab === 'accounts' || tab === 'legacy') && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        setTerm(search);
                        setPage(0);
                    }}
                >
                    <label>
                        Buscar conta
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Nome de usuário ou nome de exibição"
                        />
                    </label>
                    <button className="text-action" disabled={busy}>
                        Buscar
                    </button>
                </form>
            )}
            {tab === 'accounts' && (
                <section>
                    <h3>Administradores por jogador</h3>
                    <p className="muted">
                        O acesso é liberado quando a conta Google assume o jogador reservado.
                    </p>
                    <div className="site-account-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Jogador</th>
                                    <th>Nome na Bandai</th>
                                    <th>Vínculo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {playerAdmins.map((grant) => (
                                    <tr key={grant.player_id}>
                                        <td>{grant.player_name}</td>
                                        <td>{grant.bandai_nick || grant.player_name}</td>
                                        <td>
                                            {!grant.enabled
                                                ? 'Desativado'
                                                : grant.claimed
                                                  ? 'Vinculado'
                                                  : 'Aguardando claim'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!loading && !playerAdmins.length && (
                        <p>Nenhum jogador com privilégio reservado.</p>
                    )}
                </section>
            )}
            {tab === 'accounts' && (
                <div className="site-account-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Conta</th>
                                <th>Estado</th>
                                <th>Admin</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {accounts.map((account) => (
                                <tr key={account.user_id}>
                                    <td>
                                        <strong>{account.display_name}</strong>
                                        <br />@{account.username}
                                        <br />
                                        {!account.email_confirmed && (
                                            <small> · E-mail não confirmado</small>
                                        )}
                                    </td>
                                    <td>
                                        {account.status === 'active'
                                            ? 'Ativa'
                                            : account.status === 'blocked'
                                              ? 'Bloqueada'
                                              : 'Encerrada'}
                                    </td>
                                    <td>{account.is_admin ? 'Sim' : 'Não'}</td>
                                    <td>
                                        <div className="site-account-actions">
                                            <button
                                                className="button secondary"
                                                disabled={busy}
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            `${account.status === 'active' ? 'Bloquear' : 'Reativar'} a conta de ${account.display_name}?`
                                                        )
                                                    )
                                                        void run(async () => {
                                                            await auth.rpc(
                                                                'admin_update_site_account',
                                                                {
                                                                    p_user_id: account.user_id,
                                                                    p_status:
                                                                        account.status === 'active'
                                                                            ? 'blocked'
                                                                            : 'active',
                                                                    p_is_admin: null
                                                                }
                                                            );
                                                            await auth.refresh();
                                                        }, 'Estado da conta atualizado.');
                                                }}
                                            >
                                                {account.status === 'active'
                                                    ? 'Bloquear'
                                                    : 'Reativar'}
                                            </button>
                                            <button
                                                className="button secondary"
                                                disabled={
                                                    busy ||
                                                    (!account.is_admin &&
                                                        (!account.email_confirmed ||
                                                            !account.player_id ||
                                                            account.status !== 'active'))
                                                }
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            `${account.is_admin ? 'Remover' : 'Conceder'} acesso administrativo para ${account.display_name}?`
                                                        )
                                                    )
                                                        void run(async () => {
                                                            await auth.rpc(
                                                                'admin_update_site_account',
                                                                {
                                                                    p_user_id: account.user_id,
                                                                    p_status: null,
                                                                    p_is_admin: !account.is_admin
                                                                }
                                                            );
                                                            await auth.refresh();
                                                        }, 'Permissão atualizada.');
                                                }}
                                            >
                                                {account.is_admin
                                                    ? 'Remover admin'
                                                    : 'Tornar admin'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!loading && !accounts.length && <p>Nenhuma conta encontrada.</p>}
                </div>
            )}
            {tab === 'requests' &&
                requests.map((request) => (
                    <section key={request.id}>
                        <h3>
                            {request.display_name} (@{request.username})
                        </h3>
                        <p>
                            {
                                (
                                    {
                                        player_link: 'Vínculo com jogador',
                                        deck_claim: 'Propriedade de deck',
                                        data_access: 'Acesso a dados',
                                        correction: 'Correção',
                                        erasure: 'Eliminação de dados',
                                        account_closure: 'Encerramento de conta'
                                    } as Record<string, string>
                                )[request.request_type]
                            }{' '}
                            · {request.status}
                        </p>
                        {request.player_id && (
                            <p>Jogador: {request.player_name || request.player_id}</p>
                        )}
                        {request.decklist_id && <p>Deck: {request.decklist_id}</p>}
                        <p>{request.note || 'Sem observação.'}</p>
                        {request.status === 'pending' && request.request_type === 'erasure' && (
                            <AccountErasure
                                auth={auth}
                                requestId={request.id}
                                onBusy={(value) => {
                                    setBusy(value);
                                    onBusy(value);
                                }}
                                onCompleted={() => setRevision((value) => value + 1)}
                            />
                        )}
                        {request.status === 'pending' ? (
                            <>
                                <label>
                                    Resposta à solicitação
                                    <textarea
                                        rows={2}
                                        maxLength={1000}
                                        value={reviewNotes[request.id] || ''}
                                        onChange={(e) =>
                                            setReviewNotes((old) => ({
                                                ...old,
                                                [request.id]: e.target.value
                                            }))
                                        }
                                    />
                                </label>
                                <div className="site-account-actions">
                                    {(request.request_type === 'player_link' ||
                                    request.request_type === 'deck_claim' ||
                                    request.request_type === 'account_closure'
                                        ? ['approved', 'rejected']
                                        : ['completed', 'rejected']
                                    )
                                        .filter(
                                            (decision) =>
                                                request.request_type !== 'erasure' ||
                                                decision === 'rejected'
                                        )
                                        .map((decision) => (
                                            <button
                                                className="button secondary"
                                                disabled={busy}
                                                key={decision}
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            `Confirmar ${decision === 'approved' ? 'aprovação após validar a titularidade' : decision === 'completed' ? 'conclusão do atendimento' : 'recusa'} da solicitação de ${request.display_name}?`
                                                        )
                                                    )
                                                        void run(async () => {
                                                            await auth.rpc(
                                                                'admin_review_account_request',
                                                                {
                                                                    p_request_id: request.id,
                                                                    p_decision: decision,
                                                                    p_note:
                                                                        reviewNotes[request.id] ||
                                                                        ''
                                                                }
                                                            );
                                                            await auth.refresh();
                                                        }, 'Solicitação analisada.');
                                                }}
                                            >
                                                {decision === 'approved'
                                                    ? 'Aprovar'
                                                    : decision === 'completed'
                                                      ? 'Concluir atendimento'
                                                      : 'Recusar'}
                                            </button>
                                        ))}
                                </div>
                            </>
                        ) : (
                            request.review_note && <p>{request.review_note}</p>
                        )}
                    </section>
                ))}
            {tab === 'legacy' && (
                <>
                    <label>
                        <input
                            type="checkbox"
                            checked={unownedOnly}
                            onChange={(e) => {
                                setUnownedOnly(e.target.checked);
                                setPage(0);
                            }}
                        />{' '}
                        Apenas decks sem proprietário
                    </label>
                    <p>
                        Decks de autores com conta vinculada recebem o proprietário automaticamente.
                    </p>
                    {legacy.map((deck) => (
                        <div className="site-account-actions" key={deck.id}>
                            <span>
                                {deck.name} · #{deck.id}
                            </span>
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => {
                                    setTransfer(deck);
                                    setOwnerId('');
                                    setTransferReason('');
                                }}
                            >
                                Atribuir proprietário
                            </button>
                        </div>
                    ))}
                    {!loading && !legacy.length && <p>Nenhum deck sem proprietário.</p>}
                    {transfer && (
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(async () => {
                                    await auth.rpc('admin_transfer_community_deck', {
                                        p_decklist_id: transfer.id,
                                        p_owner_user_id: ownerId,
                                        p_updated_at: transfer.updated_at,
                                        p_reason: transferReason
                                    });
                                    setTransfer(null);
                                }, 'Proprietário atribuído.');
                            }}
                        >
                            <h3>{transfer.name}</h3>
                            <SearchSelect
                                label="Nova conta proprietária"
                                value={ownerId}
                                onChange={setOwnerId}
                                required
                                emptyMessage="Nenhuma conta encontrada. Ajuste a busca acima."
                                options={accounts
                                    .filter((account) => account.status === 'active')
                                    .map((account) => ({
                                        value: account.user_id,
                                        label: `${account.display_name} (@${account.username})`
                                    }))}
                            />
                            <label>
                                Motivo
                                <input
                                    required
                                    minLength={3}
                                    maxLength={500}
                                    value={transferReason}
                                    onChange={(e) => setTransferReason(e.target.value)}
                                />
                            </label>
                            <button className="button primary" disabled={busy || !ownerId}>
                                Confirmar atribuição
                            </button>
                            <button
                                type="button"
                                className="button secondary"
                                disabled={busy}
                                onClick={() => setTransfer(null)}
                            >
                                Cancelar
                            </button>
                        </form>
                    )}
                </>
            )}
            {tab === 'audit' && (
                <>
                    <AuditHealth
                        auth={auth}
                        onBusy={(value) => {
                            setBusy(value);
                            onBusy(value);
                        }}
                    />
                    <div className="site-account-actions">
                        <button
                            className="button primary"
                            disabled={busy || loading}
                            onClick={() =>
                                void run(async () => {
                                    const controller = new AbortController();
                                    exportController.current = controller;
                                    setExportProgress('Preparando exportação…');
                                    try {
                                        const result = await prepareAuditExport(
                                            auth,
                                            auditQuery,
                                            controller.signal,
                                            (rows, total) =>
                                                setExportProgress(`${rows} / ${total} eventos`)
                                        );
                                        downloadAccountJson('auditoria-periodo.json', result);
                                    } finally {
                                        exportController.current = null;
                                        setExportProgress('');
                                    }
                                }, 'Arquivo preparado.')
                            }
                        >
                            Exportar eventos
                        </button>
                        {exportProgress && (
                            <>
                                <span role="status">{exportProgress}</span>
                                <button
                                    className="button secondary"
                                    onClick={() => exportController.current?.abort()}
                                >
                                    Cancelar exportação
                                </button>
                            </>
                        )}
                    </div>

                    <details className="audit-event-filters">
                        <summary>
                            Filtros de eventos
                            {Object.entries(auditQuery).some(
                                ([key, value]) => key !== 'p_to' && !!value
                            ) || !!to
                                ? ' (ativos)'
                                : ''}
                        </summary>
                        <form
                            className="audit-filter-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const until = new Date().toISOString();
                                let end = until;
                                if (to) {
                                    const date = new Date(`${to}T00:00:00`);
                                    date.setDate(date.getDate() + 1);
                                    end = new Date(
                                        Math.min(date.getTime(), Date.now())
                                    ).toISOString();
                                }
                                setAuditQuery({
                                    p_entity: entity,
                                    p_entity_id: entityId,
                                    p_actor: actor || null,
                                    p_action: action,
                                    p_outcome: outcome,
                                    p_operation: operation,
                                    p_from: from
                                        ? new Date(`${from}T00:00:00`).toISOString()
                                        : null,
                                    p_to: end
                                });
                                setPage(0);
                            }}
                        >
                            <div className="site-account-actions">
                                <label>
                                    Entidade
                                    <input
                                        value={entity}
                                        onChange={(e) => setEntity(e.target.value)}
                                        placeholder="decklists, players…"
                                    />
                                </label>
                                <label>
                                    ID do registro
                                    <input
                                        value={entityId}
                                        onChange={(e) => setEntityId(e.target.value)}
                                    />
                                </label>
                                <label>
                                    Conta responsável (UUID)
                                    <input
                                        value={actor}
                                        onChange={(e) => setActor(e.target.value)}
                                        pattern="[0-9a-fA-F-]{36}"
                                    />
                                </label>
                                <label>
                                    Ação
                                    <input
                                        value={action}
                                        onChange={(e) => setAction(e.target.value)}
                                        placeholder="decklists.update"
                                    />
                                </label>
                                <label>
                                    Resultado
                                    <select
                                        value={outcome}
                                        onChange={(e) => setOutcome(e.target.value)}
                                    >
                                        <option value="">Todos</option>
                                        <option value="success">Sucesso</option>
                                        <option value="denied">Recusado</option>
                                        <option value="failure">Falha</option>
                                    </select>
                                </label>
                                <label>
                                    Operação
                                    <input
                                        value={operation}
                                        onChange={(e) => setOperation(e.target.value)}
                                    />
                                </label>
                                <label>
                                    De
                                    <input
                                        type="date"
                                        value={from}
                                        onChange={(e) => setFrom(e.target.value)}
                                    />
                                </label>
                                <label>
                                    Até
                                    <input
                                        type="date"
                                        value={to}
                                        onChange={(e) => setTo(e.target.value)}
                                    />
                                </label>
                            </div>
                            <button className="button secondary" disabled={busy}>
                                Aplicar filtros
                            </button>
                        </form>
                    </details>
                    <button
                        className="text-action"
                        disabled={busy || loading}
                        onClick={() =>
                            void run(async () => {
                                const rows = await auth.rpc('admin_audit_events', {
                                    ...auditQuery,
                                    p_offset: page * 100,
                                    p_export: true
                                });
                                downloadAccountJson('auditoria-pagina.json', rows);
                            }, 'Página exportada.')
                        }
                    >
                        Exportar esta página
                    </button>
                    <div className="site-account-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Quando / responsável</th>
                                    <th>Ação / registro</th>
                                    <th>Alterações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event) => (
                                    <tr key={event.event_id}>
                                        <td>
                                            {new Date(event.occurred_at).toLocaleString('pt-BR')}
                                            <br />
                                            <small>{event.actor_user_id || event.actor_kind}</small>
                                        </td>
                                        <td>
                                            {event.action}
                                            <br />
                                            {event.entity_type} · {event.entity_id || '—'}
                                            <br />
                                            <small>
                                                Operação {event.operation_id} · {event.outcome}
                                            </small>
                                        </td>
                                        <td>
                                            <details>
                                                <summary>Ver alterações</summary>
                                                <AuditChanges value={event.changes} />
                                            </details>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!loading && !events.length && <p>Nenhum evento neste período.</p>}
                    </div>
                </>
            )}
            {(page > 0 || count >= (tab === 'audit' ? 100 : 50)) && (
                <div className="site-account-actions site-admin-pagination">
                    <button
                        className="button secondary"
                        disabled={busy || loading || !page}
                        onClick={() => setPage(page - 1)}
                    >
                        Anterior
                    </button>
                    <span>Página {page + 1}</span>
                    <button
                        className="button secondary"
                        disabled={busy || loading || count < (tab === 'audit' ? 100 : 50)}
                        onClick={() => setPage(page + 1)}
                    >
                        Próxima
                    </button>
                </div>
            )}
        </section>
    );
}
