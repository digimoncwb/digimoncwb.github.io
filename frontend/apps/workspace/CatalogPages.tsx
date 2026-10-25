import { tryCardImageFallback } from '../../shared/card-image-fallback';
import { useEffect, useState } from 'react';
import { playerStatistics } from './player-statistics';
import { orderListCards } from '../builder/editor-service';
import type { MicroContext } from '../../contracts';
import { Loader } from '../../shared/runtime';
import { PageHeading } from '../../shared/PageHeading';
import { DeckColors } from '../../shared/DeckColors';
import { Portrait } from '../../shared/cards';
import { Select } from '../../shared/Select';
import { ActionMenu, Dialog, EmptyState, ListToolbar, Pagination } from '../../shared/ListPage';
import {
    cardCode,
    loadHistory,
    loadHistoryDecklists,
    loadPlayers,
    normalizeSearch,
    paginate,
    request,
    savePlayer,
    setActivity,
    type DeckRecord,
    type HistoryRecord,
    type PlayerRecord
} from './catalog-service';

function useRecords<T>(load: (signal: AbortSignal) => Promise<T[]>, active: boolean, key: string) {
    const [items, setItems] = useState<T[]>([]),
        [loading, setLoading] = useState(true),
        [loadedKey, setLoadedKey] = useState(''),
        [error, setError] = useState(''),
        [revision, setRevision] = useState(0);
    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        load(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setItems(data);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoadedKey(key);
                    setLoading(false);
                }
            });
        return () => controller.abort();
    }, [active, key, revision]);
    return {
        items: loadedKey === key ? items : [],
        loading: loading || loadedKey !== key,
        error: loadedKey === key ? error : '',
        refresh: () => setRevision((value) => value + 1)
    };
}
function usePageSize(key: string) {
    const [size, changeSize] = useState(() => {
        try {
            const stored = Number(localStorage.getItem(key));
            return [10, 20, 40, 80].includes(stored) ? stored : 20;
        } catch {
            return 20;
        }
    });
    return [
        size,
        (value: number) => {
            changeSize(value);
            try {
                localStorage.setItem(key, String(value));
            } catch {
                /* storage can be unavailable */
            }
        }
    ] as const;
}
function LoadError({ error, retry }: { error: string; retry(): void }) {
    return error ? (
        <div className="list-error" role="alert">
            <span>{error}</span>
            <button className="button secondary" onClick={retry}>
                Tentar novamente
            </button>
        </div>
    ) : null;
}
function Colors({ colors }: { colors?: string }) {
    return <DeckColors colors={colors || ''} />;
}
export function PlayersPage({ context }: { context: MicroContext }) {
    const records = useRecords(loadPlayers, context.active, 'players');
    const [query, setQuery] = useState(''),
        [inactive, setInactive] = useState(false),
        [page, setPage] = useState(1),
        [size, setSize] = usePageSize('playersPageSize');
    const [selected, setSelected] = useState<PlayerRecord | null>(null),
        [editing, setEditing] = useState<Partial<PlayerRecord> | null>(null),
        [confirming, setConfirming] = useState<PlayerRecord | null>(null),
        [notice, setNotice] = useState('');
    useEffect(() => {
        setPage(1);
    }, [query, inactive, size]);
    useEffect(() => {
        if (!context.active) {
            setSelected(null);
            setEditing(null);
            setConfirming(null);
            return;
        }
        const selectedId = context.route.params.get('playerId');
        if (selectedId)
            setSelected(records.items.find((player) => String(player.id) === selectedId) || null);
    }, [context.active, context.route, records.items]);
    useEffect(() => {
        if (context.active && context.route.params.get('action') === 'create-player')
            setEditing({});
    }, [context.active, context.route]);
    const filtered = records.items.filter(
        (player) =>
            (inactive || player.is_active !== false) &&
            normalizeSearch(
                [player.name, player.bandai_nick, player.digilab_name, player.bandai_id].join(' ')
            ).includes(normalizeSearch(query))
    );
    const paging = paginate(filtered, page, size);
    const selectedPlayer = records.items.find((player) => player.id === selected?.id) || selected;
    return (
        <section className="catalog-app">
            <div className="catalog-heading">
                <PageHeading
                    eyebrow="Pessoas da comunidade"
                    title="Jogadores"
                    description="Encontre jogadores e acompanhe seus resultados."
                />
                <button className="button primary" onClick={() => setEditing({})}>
                    + Adicionar jogador
                </button>
            </div>
            <ListToolbar
                query={query}
                onQuery={setQuery}
                placeholder="Buscar nome, apelido ou ID Bandai"
                count={inactive ? 1 : 0}
                filters={
                    <label className="list-checkbox">
                        <input
                            type="checkbox"
                            checked={inactive}
                            onChange={(event) => setInactive(event.target.checked)}
                        />
                        Incluir jogadores inativos
                    </label>
                }
            />
            {notice && (
                <p className="catalog-notice" role="status">
                    {notice}
                </p>
            )}
            <LoadError error={records.error} retry={records.refresh} />
            {records.loading && !records.items.length ? (
                <Loader text="Carregando jogadores…" />
            ) : (
                <>
                    <p className="catalog-count">{filtered.length} jogadores encontrados</p>
                    <div className="catalog-list">
                        {paging.items.map((player) => (
                            <article className="catalog-row" key={player.id}>
                                <button
                                    className="catalog-item"
                                    onClick={() => setSelected(player)}
                                >
                                    <span className="catalog-avatar" aria-hidden="true">
                                        {player.name
                                            .split(/\s+/)
                                            .slice(0, 2)
                                            .map((word) => word[0])
                                            .join('')}
                                    </span>
                                    <span className="catalog-identity">
                                        <strong>{player.name}</strong>
                                        <span>
                                            {[
                                                player.bandai_nick &&
                                                    `Bandai: ${player.bandai_nick}`,
                                                player.digilab_name &&
                                                    `DigiLab: ${player.digilab_name}`
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || 'Abrir perfil e histórico'}
                                        </span>
                                    </span>
                                    {player.is_active === false && (
                                        <span className="catalog-badge">Inativo</span>
                                    )}
                                </button>
                                <ActionMenu label={player.name}>
                                    <button onClick={() => setSelected(player)}>Ver perfil</button>
                                    <button onClick={() => setEditing(player)}>
                                        Editar cadastro
                                    </button>
                                    <button onClick={() => setConfirming(player)}>
                                        {player.is_active === false
                                            ? 'Reativar jogador'
                                            : 'Inativar jogador'}
                                    </button>
                                </ActionMenu>
                            </article>
                        ))}
                    </div>
                    {!filtered.length && !records.error && (
                        <EmptyState>
                            Nenhum jogador encontrado. Tente outra busca ou inclua os inativos.
                        </EmptyState>
                    )}
                    <Pagination
                        page={paging.page}
                        pages={paging.totalPages}
                        total={filtered.length}
                        size={size}
                        onPage={setPage}
                        onSize={setSize}
                    />
                </>
            )}
            {selectedPlayer && (
                <RecordDetails
                    context={context}
                    kind="players"
                    record={selectedPlayer}
                    onClose={() => setSelected(null)}
                    onEdit={() => {
                        setSelected(null);
                        setEditing(selectedPlayer);
                    }}
                />
            )}
            {editing && (
                <PlayerForm
                    player={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        records.refresh();
                        setNotice('Cadastro salvo.');
                    }}
                />
            )}
            {confirming && (
                <ActivityDialog
                    kind="players"
                    record={confirming}
                    onClose={() => setConfirming(null)}
                    onSaved={() => {
                        setConfirming(null);
                        records.refresh();
                        setNotice('Situação do jogador atualizada.');
                    }}
                />
            )}
        </section>
    );
}
export { DecksPage } from './DeckbuilderPage';
function PlayerForm({
    player,
    onClose,
    onSaved
}: {
    player: Partial<PlayerRecord>;
    onClose(): void;
    onSaved(): void;
}) {
    const [values, setValues] = useState(player),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    const fields = [
        ['name', 'Nome', true],
        ['bandai_nick', 'Apelido Bandai', false],
        ['digilab_name', 'Nome no DigiLab', false],
        ['bandai_id', 'ID Bandai', false]
    ] as const;
    return (
        <Dialog
            title={player.id ? 'Editar jogador' : 'Adicionar jogador'}
            onClose={onClose}
            busy={busy}
        >
            <form
                className="catalog-form"
                onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError('');
                    try {
                        await savePlayer(values);
                        onSaved();
                    } catch (error) {
                        setError((error as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {fields.map(([field, label, required]) => (
                    <label key={field}>
                        {label}
                        {required && ' *'}
                        <input
                            value={String(values[field] || '')}
                            required={required}
                            minLength={required ? 2 : undefined}
                            disabled={busy}
                            onChange={(event) =>
                                setValues({ ...values, [field]: event.target.value })
                            }
                        />
                    </label>
                ))}
                {error && (
                    <p className="list-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="catalog-form-actions">
                    <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button className="button primary" disabled={busy}>
                        {busy ? 'Salvando…' : 'Salvar jogador'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
function ActivityDialog({
    kind,
    record,
    onClose,
    onSaved
}: {
    kind: 'players' | 'decks';
    record: PlayerRecord | DeckRecord;
    onClose(): void;
    onSaved(): void;
}) {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    const activate = 'is_active' in record && record.is_active === false;
    return (
        <Dialog
            title={`${activate ? 'Reativar' : 'Inativar'} ${kind === 'players' ? 'jogador' : 'deck'}`}
            onClose={onClose}
            busy={busy}
        >
            <p>
                {activate ? 'Reativar' : 'Inativar'} <strong>{record.name}</strong>?
            </p>
            <p className="muted">O histórico de torneios será preservado.</p>
            {error && (
                <p role="alert" className="list-error">
                    {error}
                </p>
            )}
            <div className="catalog-form-actions">
                <button className="button secondary" disabled={busy} onClick={onClose}>
                    Cancelar
                </button>
                <button
                    className="button primary"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await setActivity(kind, record.id, activate);
                            onSaved();
                        } catch (error) {
                            setError((error as Error).message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    {busy ? 'Salvando…' : activate ? 'Reativar' : 'Inativar'}
                </button>
            </div>
        </Dialog>
    );
}
function RecordDetails({
    context,
    kind,
    record,
    onClose,
    onEdit,
    initialTab
}: {
    context: MicroContext;
    kind: 'players' | 'decks';
    record: PlayerRecord | DeckRecord;
    onClose(): void;
    onEdit?(): void;
    initialTab?: string;
}) {
    const [tab, setTab] = useState(kind === 'decks' ? initialTab || 'lists' : 'info');
    const history = useRecords(
        (signal) => loadHistory(kind, record.id, signal),
        true,
        `${kind}:${record.id}`
    );
    const player = record as PlayerRecord,
        deck = record as DeckRecord;
    return (
        <Dialog
            title={record.name}
            onClose={onClose}
            wide
            headerContent={
                kind === 'decks' ? (
                    <div className="catalog-deck-header-group">
                        <div className="catalog-deck-header">
                            <Portrait image={deck.image} />
                            <div>
                                <h2>{deck.name}</h2>
                                <div className="catalog-deck-header-meta">
                                    <span>{deck.code || 'Código não identificado'}</span>
                                    <Colors colors={deck.colors} />
                                </div>
                            </div>
                        </div>
                        <nav
                            className="catalog-tabs catalog-deck-header-actions"
                            aria-label="Detalhes do deck"
                        >
                            {[
                                ['history', 'Histórico'],
                                ['lists', 'Decklists']
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    className={`button secondary${tab === value ? ' is-active' : ''}`}
                                    aria-pressed={tab === value}
                                    onClick={() => setTab(value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>
                ) : undefined
            }
        >
            {tab === 'info' && (
                <div
                    className={`catalog-detail-summary${kind === 'players' ? ' catalog-player-info' : ''}`}
                >
                    <div className="catalog-detail-info">
                        {kind === 'decks' && <Portrait image={deck.image} />}
                        <dl>
                            {(kind === 'players'
                                ? [
                                      ['Nome', player.name],
                                      ['Apelido Bandai', player.bandai_nick],
                                      ['Nome no DigiLab', player.digilab_name],
                                      ['ID Bandai', player.bandai_id],
                                      ['Situação', player.is_active === false ? 'Inativo' : 'Ativo']
                                  ]
                                : [
                                      ['Deck', deck.name],
                                      ['Código', deck.code || 'Não identificado']
                                  ]
                            ).map(([label, value]) => (
                                <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>{value || 'Não informado'}</dd>
                                </div>
                            ))}
                        </dl>
                        {kind === 'decks' && <Colors colors={deck.colors} />}
                    </div>
                    <button className="button secondary" onClick={onEdit}>
                        Editar cadastro
                    </button>
                </div>
            )}
            {(kind === 'players' || tab !== 'info') && (
                <>
                    {kind === 'decks' && tab === 'history' && (
                        <h3 className="catalog-history-heading">Histórico de torneios</h3>
                    )}
                    <LoadError error={history.error} retry={history.refresh} />
                    {history.loading ? (
                        <Loader text="Carregando histórico…" />
                    ) : history.error ? null : (
                        <>
                            {kind === 'players' && (
                                <>
                                    <h3>Estatísticas</h3>
                                    <PlayerStatistics rows={history.items} />
                                    <h3>Histórico de torneios</h3>
                                </>
                            )}
                            <HistoryList
                                rows={history.items}
                                context={context}
                                kind={kind}
                                name={record.name}
                                recordId={String(record.id)}
                                showLists={tab === 'lists'}
                            />
                        </>
                    )}
                </>
            )}
        </Dialog>
    );
}
function PlayerStatistics({ rows, compact = false }: { rows: HistoryRecord[]; compact?: boolean }) {
    const stats = playerStatistics(rows);
    if (!stats.events) return <EmptyState>Nenhum torneio registrado para este jogador.</EmptyState>;
    const date = (value?: string) => (value ? window.liveData.displayDate(value) : '—');
    return (
        <div className="catalog-player-stats">
            {stats.decks.length > 0 && (
                <span
                    className="catalog-favorite-deck"
                    title="Deck mais utilizado nos torneios registrados"
                >
                    <span>Deck favorito</span>
                    <strong>{stats.decks[0].name}</strong>
                </span>
            )}
            <dl className="catalog-player-metrics">
                {[
                    ['Torneios', stats.events],
                    ['Títulos', stats.titles],
                    ['Top 3', stats.top3],
                    [
                        'Posição média',
                        stats.averagePlacement === null
                            ? '—'
                            : stats.averagePlacement.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1
                              })
                    ]
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            {!compact && (
                <>
                    <p className="muted">
                        {date(stats.first)} a {date(stats.recent)} · {stats.stores} lojas
                    </p>
                    <h3>Decks utilizados</h3>
                    {stats.decks.length ? (
                        <div className="catalog-player-table-scroll">
                            <table className="catalog-player-table">
                                <thead>
                                    <tr>
                                        <th>Deck</th>
                                        <th>Torneios</th>
                                        <th>Títulos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.decks.map((deck) => (
                                        <tr key={deck.name}>
                                            <th>{deck.name}</th>
                                            <td>{deck.count}</td>
                                            <td>{deck.titles}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="muted">Os resultados não têm decks identificados.</p>
                    )}
                    <p className="catalog-stats-note">
                        Estatísticas dos resultados cadastrados. Top 3 conta colocações de 1º a 3º,
                        independentemente do tamanho do torneio.
                    </p>
                </>
            )}
        </div>
    );
}
function HistoryList({
    rows,
    context,
    kind,
    name,
    showLists,
    recordId
}: {
    rows: HistoryRecord[];
    context: MicroContext;
    kind: 'players' | 'decks';
    name: string;
    showLists: boolean;
    recordId: string;
}) {
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    useEffect(() => setPage(1), [rows, showLists, size]);
    const visible = showLists
        ? rows.filter((row) => row.decklists?.length || row.decklist || row.decklist_link)
        : rows;
    if (showLists && !visible.length)
        return (
            <EmptyState>
                Nenhuma decklist registrada. Abra um resultado na aba Histórico para cadastrar.
            </EmptyState>
        );
    if (!rows.length)
        return (
            <EmptyState>
                Nenhum resultado registrado para este {kind === 'players' ? 'jogador' : 'deck'}.
            </EmptyState>
        );
    return (
        <div className="catalog-history">
            <p className="muted">
                {showLists
                    ? `${visible.length} resultados com decklist.`
                    : `Últimos ${rows.length} resultados.`}
            </p>
            {paginate(visible, page, size).items.map((row) => (
                <HistoryEntry
                    key={row.id}
                    row={row}
                    context={context}
                    kind={kind}
                    name={name}
                    recordId={recordId}
                />
            ))}
            {visible.length > 10 && (
                <Pagination
                    page={paginate(visible, page, size).page}
                    pages={Math.ceil(visible.length / size)}
                    total={visible.length}
                    size={size}
                    onPage={setPage}
                    onSize={setSize}
                />
            )}
        </div>
    );
}
function HistoryEntry({
    row,
    context,
    kind,
    name,
    recordId
}: {
    row: HistoryRecord;
    context: MicroContext;
    kind: 'players' | 'decks';
    name: string;
    recordId: string;
}) {
    const [open, setOpen] = useState(false);
    const lists = useRecords(
        async (signal) => {
            const rows = await loadHistoryDecklists(row.id, signal);
            return Promise.all(
                rows.map(async (list) => ({
                    ...list,
                    decklist_cards: await orderListCards(list.decklist_cards || [], signal)
                }))
            );
        },
        open,
        String(row.id)
    );
    const matches = context.data
        .getSnapshot()
        .data.events.filter(
            (event) => event.isoDate === row.tournament_date && event.store === row.store?.name
        );
    const tournamentId = row.tournament_id
        ? String(row.tournament_id)
        : matches.length === 1
          ? matches[0].id
          : '';
    const params = {
        resultId: String(row.id),
        ...(tournamentId ? { tournamentId, returnTournamentId: tournamentId } : {}),
        returnView: kind,
        ...(kind === 'players' ? { playerId: recordId } : { deckId: recordId }),
        deck: row.deck?.name || (kind === 'decks' ? name : ''),
        player: row.player?.name || (kind === 'players' ? name : ''),
        store: row.store?.name || '',
        date: row.tournament_date
    };
    return (
        <article className="catalog-history-entry">
            <div className="catalog-history-row">
                <span className={`catalog-placement rank-${row.placement}`}>{row.placement}º</span>
                <div>
                    <strong>
                        {kind === 'players'
                            ? row.deck?.name || 'Deck não informado'
                            : row.player?.name || 'Jogador não informado'}
                    </strong>
                    <span>
                        {row.store?.name || 'Loja'} ·{' '}
                        {window.liveData.displayDate(row.tournament_date)}
                    </span>
                </div>
                <button
                    className="button secondary"
                    aria-expanded={open}
                    onClick={() => setOpen(!open)}
                >
                    {open ? 'Fechar' : 'Decklist'}
                </button>
                {tournamentId && (
                    <button
                        className="button secondary"
                        onClick={() =>
                            context.navigate('tournaments', { tournament: tournamentId })
                        }
                    >
                        Torneio ↗
                    </button>
                )}
            </div>
            {open && (
                <div className="catalog-history-cards">
                    <LoadError error={lists.error} retry={lists.refresh} />
                    {lists.loading ? (
                        <Loader text="Carregando decklist…" />
                    ) : (
                        <>
                            {lists.items.flatMap((list) => list.decklist_cards || []).length ? (
                                <div className="catalog-card-grid">
                                    {lists.items
                                        .flatMap((list) => list.decklist_cards || [])
                                        .sort((a, b) => a.position - b.position)
                                        .map((card) => (
                                            <figure key={card.card_code}>
                                                <img
                                                    src={`https://digimon.digilab.cards/api/card/${card.card_code}.jpg`}
                                                    onError={(event) => {
                                                        tryCardImageFallback(
                                                            event.currentTarget,
                                                            card.card_code
                                                        );
                                                    }}
                                                    alt={card.card_code}
                                                    loading="lazy"
                                                />
                                                <figcaption>
                                                    {card.qty} × {card.card_code}
                                                </figcaption>
                                            </figure>
                                        ))}
                                </div>
                            ) : (
                                <p className="muted">
                                    {row.decklist || row.decklist_link
                                        ? 'Decklist legada disponível no editor.'
                                        : 'Decklist ainda não registrada.'}
                                </p>
                            )}
                            <button
                                className="button primary"
                                onClick={() => context.navigate('builder', params)}
                            >
                                Abrir no deckbuilder ↗
                            </button>
                        </>
                    )}
                </div>
            )}
        </article>
    );
}
