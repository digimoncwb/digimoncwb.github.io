import { tryCardImageFallback } from '../../shared/card-image-fallback';
import { useEffect, useState } from 'react';
import type { MicroContext } from '../../contracts';
import { FormatsRulesPage } from './FormatsRulesPage';
import { orderListCards } from '../builder/editor-service';
import { useData, Loader } from '../../shared/runtime';
import { PageHeading } from '../../shared/PageHeading';
import { Portrait, StoreLogo } from '../../shared/cards';
import { Select } from '../../shared/Select';
import { SearchSelect } from '../../shared/SearchSelect';
import { PointsBadge } from '../../shared/PointsBadge';
import { PointsTotalTag } from '../../shared/PointsTotalTag';
import { DeckColors } from '../../shared/DeckColors';
import { Dialog, EmptyState, Pagination } from '../../shared/ListPage';
import {
    loadBuilderResults,
    loadDecks,
    loadPlayers,
    normalizeSearch,
    paginate,
    type BuilderResultRecord,
    type DeckRecord,
    type PlayerRecord
} from './catalog-service';
import {
    participationRows,
    filterParticipations,
    loadLibraryDecks,
    filterCommunityDecks,
    loadMyDeckClaims,
    updateLibraryDeckAuthor,
    loadListCards,
    loadLibraryCardLists,
    listPoints,
    copyLibraryDeck,
    legacyCards,
    type LibraryDeck,
    type DeckClaim,
    type ListCard,
    type Participation
} from './deck-library';
import './deck-library.css';
import { deleteCommunityDeck } from './delete-community-deck';
import { DeckActionsMenu, type DeckAction } from './DeckActionsMenu';
import { useSiteAuth, canEditCommunityDeck, canDeleteCommunityDeck } from '../../shared/site-auth';

const tabs = [
    ['free', 'Comunidade'],
    ['mine', 'Meus decks'],
    ['tournaments', 'Torneios'],
    ['formats', 'Formatos e regras']
] as const;
type Preview = {
    title: string;
    id?: string | number;
    legacy?: string;
    params: Record<string, string>;
    participation?: Participation;
    formatId?: string | number;
};

function ListViewIcon() {
    return (
        <svg
            className="deck-view-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

export function DecksPage({ context }: { context: MicroContext }) {
    const account = useSiteAuth();
    const { data, loading: dataLoading, error: dataError } = useData(context.data);
    const params = context.route.params;
    const tab =
        params.get('tab') === 'free' && params.get('mine') === '1'
            ? 'mine'
            : tabs.some(([key]) => key === params.get('tab'))
              ? params.get('tab')!
              : 'tournaments';
    const communityTab = tab === 'free' || tab === 'mine';
    const get = (key: string) => params.get(key) || '';
    const communityQueryKey = tab === 'mine' ? 'myQuery' : 'freeQuery';
    const communityFormatKey = tab === 'mine' ? 'myFormat' : 'freeFormat';
    const [rows, setRows] = useState<BuilderResultRecord[]>([]);
    const [freeDecks, setFreeDecks] = useState<LibraryDeck[]>([]);
    const [summaries, setSummaries] = useState<{
        cards: Record<string, ListCard[]>;
        loading: boolean;
        error: string;
    }>({ cards: {}, loading: false, error: '' });
    const [summaryRetry, setSummaryRetry] = useState(0);
    const [archetypes, setArchetypes] = useState<DeckRecord[]>([]);
    const [players, setPlayers] = useState<PlayerRecord[]>([]);
    const [identityError, setIdentityError] = useState('');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [freeError, setFreeError] = useState('');
    const [revision, setRevision] = useState(0);
    const [more, setMore] = useState(false);
    const [create, setCreate] = useState<null | {
        importing: boolean;
        format: string;
        creator?: string;
    }>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [associate, setAssociate] = useState<Participation | null>(null);
    const [source, setSource] = useState('');
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [replace, setReplace] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<LibraryDeck | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [libraryNotice, setLibraryNotice] = useState('');
    const [authorDeck, setAuthorDeck] = useState<LibraryDeck | null>(null);
    const [authorId, setAuthorId] = useState('');
    const [authorBusy, setAuthorBusy] = useState(false);
    const [authorError, setAuthorError] = useState('');
    const [claims, setClaims] = useState<{
        owner: string;
        rows: DeckClaim[];
        loading: boolean;
        error: string;
    }>({ owner: '', rows: [], loading: false, error: '' });
    const [claimDeck, setClaimDeck] = useState<LibraryDeck | null>(null);
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimError, setClaimError] = useState('');
    const [claimRevision, setClaimRevision] = useState(0);
    const ownClaims = claims.owner === account.user?.id ? claims.rows : [];
    useEffect(() => {
        if (!context.active || !account.available || !account.user) {
            setClaims({ owner: '', rows: [], loading: false, error: '' });
            return;
        }
        const userId = account.user.id;
        const controller = new AbortController();
        setClaims((previous) => ({
            owner: userId,
            rows: previous.owner === userId ? previous.rows : [],
            loading: true,
            error: ''
        }));
        loadMyDeckClaims(userId, controller.signal)
            .then((rows) => {
                if (!controller.signal.aborted)
                    setClaims({ owner: userId, rows, loading: false, error: '' });
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setClaims((previous) => ({
                        owner: userId,
                        rows: previous.owner === userId ? previous.rows : [],
                        loading: false,
                        error: 'Não foi possível consultar seus pedidos de propriedade.'
                    }));
            });
        return () => controller.abort();
    }, [context.active, account.available, account.user?.id, claimRevision, revision]);
    useEffect(() => {
        setClaimDeck(null);
        setClaimError('');
        setLibraryNotice('');
    }, [account.user?.id, tab, context.active]);
    useEffect(() => {
        if (!context.active) return;
        const refresh = () => setRevision((value) => value + 1);
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [context.active]);
    const activeFormats = (data.deckFormats || []).filter((f) => f.is_active !== false);
    const formatLabel = (code: string) =>
        (data.deckFormats || []).find((f) => f.code === code)?.name || code;
    const update = (changes: Record<string, string>, reset = true) => {
        const next = new URLSearchParams(params);
        if (reset) next.delete('page');
        for (const [key, value] of Object.entries(changes))
            value ? next.set(key, value) : next.delete(key);
        history.replaceState(null, '', context.href('decks', Object.fromEntries(next)));
        window.dispatchEvent(new Event('digistats:route'));
    };
    useEffect(() => {
        if (!context.active) return;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setFreeError('');
        Promise.allSettled([
            loadBuilderResults(controller.signal),
            loadLibraryDecks(controller.signal),
            loadDecks(context, controller.signal),
            loadPlayers(controller.signal)
        ]).then(([results, decks, types, people]) => {
            if (controller.signal.aborted) return;
            if (results.status === 'fulfilled') setRows(results.value);
            else setError(results.reason.message);
            if (decks.status === 'fulfilled') setFreeDecks(decks.value);
            else setFreeError(decks.reason.message);
            if (types.status === 'fulfilled') setArchetypes(types.value);
            if (people.status === 'fulfilled') setPlayers(people.value);
            setIdentityError(
                types.status === 'rejected' || people.status === 'rejected'
                    ? 'Não foi possível carregar os tipos de deck e jogadores.'
                    : ''
            );
            setLoading(false);
        });
        return () => controller.abort();
    }, [context.active, revision, account.available, account.user?.id]);
    const filters = {
        query: get('query'),
        store: get('store'),
        format: get('filterFormat'),
        date: get('date'),
        tournament: get('tournament'),
        tournamentId: get('tournamentId') || get('returnTournamentId'),
        status: get('status'),
        sort: get('sort')
    };
    const results = filterParticipations(participationRows(rows, data.events), filters);
    const filteredFree = filterCommunityDecks(freeDecks, {
        query: get(communityQueryKey),
        format: get(communityFormatKey),
        mine: tab === 'mine',
        userId: account.user?.id
    });
    const page = Math.max(1, Number(get('page')) || 1);
    const size = [5, 10, 20, 40, 80].includes(Number(get('size')))
        ? Number(get('size'))
        : communityTab
          ? 20
          : 5;
    const paging = paginate(results.items, page, size);
    const freePaging = paginate(filteredFree, page, size);
    const pointDecks = freePaging.items.filter(
        (deck) =>
            data.deckFormats?.find((format) => String(format.id) === String(deck.deck_format_id))
                ?.validation_rules?.points_limit != null
    );
    const summaryKey = communityTab
        ? pointDecks.map((deck) => `${deck.id}:${deck.updated_at}`).join('|')
        : '';
    useEffect(() => {
        if (!summaryKey) {
            setSummaries({ cards: {}, loading: false, error: '' });
            return;
        }
        const controller = new AbortController();
        setSummaries({ cards: {}, loading: true, error: '' });
        loadLibraryCardLists(
            pointDecks.map((deck) => deck.id),
            controller.signal
        )
            .then((cards) => {
                if (!controller.signal.aborted) setSummaries({ cards, loading: false, error: '' });
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setSummaries({
                        cards: {},
                        loading: false,
                        error: 'Não foi possível carregar a pontuação dos decks.'
                    });
            });
        return () => controller.abort();
    }, [summaryKey, summaryRetry]);
    const additional = [
        filters.store,
        filters.date,
        filters.tournament,
        filters.tournamentId
    ].filter(Boolean).length;
    const libraryState = params.toString();
    const editorParams = (item: Participation): Record<string, string> => ({
        resultId: String(item.row.id),
        tournamentId: item.event.id,
        returnTournamentId: item.event.id,
        returnView: 'decks',
        libraryState,
        deck: item.row.deck?.name || '',
        player: item.row.player?.name || '',
        store: item.event.store,
        date: item.event.isoDate,
        format: item.event.deckFormat || 'Padrão'
    });
    const freeParams = (deck: LibraryDeck): Record<string, string> => ({
        decklistId: String(deck.id),
        deck: deck.name,
        format:
            (data.deckFormats || []).find((f) => String(f.id) === String(deck.deck_format_id))
                ?.code || '',
        returnView: 'decks',
        libraryState
    });
    const beginCreate = async (importing = false, format = '') => {
        setActionError('');
        if (account.enabled) {
            try {
                await window.digistatsAuth?.requireMember();
            } catch (error) {
                setLibraryNotice((error as Error).message);
                return;
            }
        }
        setCreate({
            importing,
            creator: account.profile?.player_id || '',
            format:
                format ||
                String(activeFormats.find((f) => f.is_default)?.id || activeFormats[0]?.id || '')
        });
    };
    const beginAssociation = (item: Participation) => {
        setActionError('');
        setSource('');
        setReplace(false);
        setAssociate(item);
        setPreview(null);
    };
    const openParticipation = (item: Participation) => {
        if (!item.hasList) {
            beginAssociation(item);
            return;
        }
        setPreview({
            title: item.row.deck?.name || 'Lista de torneio',
            id: item.row.decklists?.[0]?.id,
            legacy: item.row.decklist || '',
            params: editorParams(item),
            participation: item,
            formatId: item.event.deckFormatId || undefined
        });
    };
    const shownError = communityTab ? freeError : error;
    const retry = () => {
        setRevision((v) => v + 1);
        void context.data.refresh();
    };
    const highlight = activeFormats.find((f) => f.is_community_highlight);
    const pagination = (free = false, compact = false) => {
        const current = free ? freePaging : paging;
        return (
            <Pagination
                page={current.page}
                pages={current.totalPages}
                total={free ? filteredFree.length : results.items.length}
                size={size}
                compact={compact}
                sizes={[5, 10, 20, 40, 80]}
                onPage={(value) => update({ page: String(value) }, false)}
                onSize={(value) => update({ size: String(value) })}
            />
        );
    };
    return (
        <section className="catalog-app deck-library">
            <header className="deck-library-heading">
                <PageHeading title="Deckbuilder" />
                <div className="deck-library-actions">
                    <button
                        className="text-action"
                        disabled={dataLoading || !!dataError || !activeFormats.length}
                        onClick={() => beginCreate(true)}
                    >
                        ↑ Importar lista
                    </button>
                    <button
                        className="button primary"
                        disabled={dataLoading || !!dataError || !activeFormats.length}
                        onClick={() => beginCreate()}
                    >
                        ＋ Criar deck
                    </button>
                </div>
            </header>
            <div
                className="deck-library-tabs"
                role="tablist"
                aria-label="Biblioteca de decks"
                onKeyDown={(e) => {
                    const index = tabs.findIndex(([key]) => key === tab);
                    const next =
                        e.key === 'ArrowRight'
                            ? (index + 1) % tabs.length
                            : e.key === 'ArrowLeft'
                              ? (index + tabs.length - 1) % tabs.length
                              : e.key === 'Home'
                                ? 0
                                : e.key === 'End'
                                  ? tabs.length - 1
                                  : -1;
                    if (next >= 0) {
                        e.preventDefault();
                        update({ tab: tabs[next][0], mine: '' });
                        document.getElementById(`deck-tab-${tabs[next][0]}`)?.focus();
                    }
                }}
            >
                {tabs.map(([key, label]) => (
                    <button
                        key={key}
                        id={`deck-tab-${key}`}
                        role="tab"
                        aria-selected={tab === key}
                        aria-controls={`deck-panel-${key}`}
                        tabIndex={tab === key ? 0 : -1}
                        onClick={() => {
                            setMore(false);
                            update({ tab: key, mine: '' });
                        }}
                    >
                        <span aria-hidden="true" className="deck-tab-icon">
                            <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                {key === 'free' || key === 'mine' ? (
                                    <>
                                        <rect x="5" y="4" width="14" height="17" rx="2" />
                                        <path d="M8 1h8M9 9h6M9 13h6M9 17h4" />
                                    </>
                                ) : key === 'tournaments' ? (
                                    <>
                                        <path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v6M8 21h8" />
                                    </>
                                ) : (
                                    <>
                                        <path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1Z" />
                                    </>
                                )}
                            </svg>
                        </span>{' '}
                        {label}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`deck-panel-${tab}`} aria-labelledby={`deck-tab-${tab}`}>
                {dataError && (
                    <p className="list-error" role="alert">
                        {dataError}{' '}
                        <button className="text-action" onClick={retry}>
                            Tentar novamente
                        </button>
                    </p>
                )}
                {tab === 'formats' ? (
                    <FormatsRulesPage
                        context={context}
                        formats={data.deckFormats || []}
                        onCreate={(id) => beginCreate(false, id)}
                        onBrowse={(id) =>
                            update({
                                tab: 'free',
                                mine: '',
                                freeFormat: id,
                                filterFormat: id,
                                freeQuery: '',
                                query: '',
                                store: '',
                                date: '',
                                tournament: '',
                                tournamentId: '',
                                returnTournamentId: '',
                                status: ''
                            })
                        }
                    />
                ) : (
                    <>
                        {tab === 'tournaments' && highlight && (
                            <aside className="deck-community-notice">
                                <div>
                                    <span className="deck-community-badge">
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            aria-hidden="true"
                                        >
                                            <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
                                        </svg>
                                        Novidade
                                    </span>
                                    <strong className="deck-community-title">
                                        <span className="deck-community-intro">
                                            Conheça o novo formato da comunidade - formato{' '}
                                        </span>
                                        <span className="deck-community-mobile-intro">
                                            Novo formato:{' '}
                                        </span>
                                        <span className="deck-community-format-name">
                                            {highlight.name}
                                        </span>
                                    </strong>
                                    <p className="muted">
                                        {highlight.description ||
                                            'Consulte as regras antes de montar sua lista.'}
                                    </p>
                                </div>
                                <button
                                    className="button primary"
                                    onClick={() => {
                                        update({
                                            tab: 'formats',
                                            rulesFormat: String(highlight.id)
                                        });
                                        requestAnimationFrame(() =>
                                            document
                                                .getElementById(`deck-format-${highlight.id}`)
                                                ?.scrollIntoView({
                                                    block: 'center',
                                                    behavior: 'smooth'
                                                })
                                        );
                                    }}
                                >
                                    Ver formato →
                                </button>
                            </aside>
                        )}
                        {communityTab ? (
                            <div className="deck-library-filters free-filters">
                                <label>
                                    Buscar deck
                                    <input
                                        type="search"
                                        value={get(communityQueryKey)}
                                        onChange={(e) =>
                                            update({ [communityQueryKey]: e.target.value })
                                        }
                                        placeholder="Nome do deck"
                                    />
                                </label>
                                <Select
                                    label="Formato"
                                    value={get(communityFormatKey)}
                                    onChange={(value) => update({ [communityFormatKey]: value })}
                                    options={[
                                        { value: '', label: 'Todos os formatos' },
                                        ...(data.deckFormats || []).map((f) => ({
                                            value: String(f.id),
                                            label: formatLabel(f.code)
                                        }))
                                    ]}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="deck-library-filters">
                                    <label>
                                        Buscar participação
                                        <input
                                            type="search"
                                            value={filters.query}
                                            onChange={(e) => update({ query: e.target.value })}
                                            placeholder="Buscar jogador, deck ou torneio"
                                        />
                                    </label>
                                    <Select
                                        label="Formato"
                                        value={filters.format}
                                        onChange={(value) => update({ filterFormat: value })}
                                        options={[
                                            { value: '', label: 'Todos os formatos' },
                                            ...(data.deckFormats || []).map((format) => ({
                                                value: String(format.id),
                                                label: format.name
                                            }))
                                        ]}
                                    />
                                    <button
                                        className="button secondary"
                                        aria-expanded={more}
                                        aria-controls="deck-more-filters"
                                        onClick={() => setMore(!more)}
                                    >
                                        Filtros{additional ? ` (${additional})` : ''} ⌄
                                    </button>
                                </div>
                                {more && (
                                    <div className="deck-library-extra" id="deck-more-filters">
                                        <Select
                                            label="Loja"
                                            value={filters.store}
                                            onChange={(value) =>
                                                update({
                                                    store: value,
                                                    tournamentId: '',
                                                    returnTournamentId: ''
                                                })
                                            }
                                            options={[
                                                { value: '', label: 'Todas as lojas' },
                                                ...[
                                                    ...new Set(
                                                        data.events.map((event) => event.store)
                                                    )
                                                ]
                                                    .sort()
                                                    .map((name) => ({ value: name, label: name }))
                                            ]}
                                        />
                                        <label>
                                            Data do torneio
                                            <input
                                                type="date"
                                                value={filters.date}
                                                onChange={(e) =>
                                                    update({
                                                        date: e.target.value,
                                                        tournamentId: '',
                                                        returnTournamentId: ''
                                                    })
                                                }
                                            />
                                        </label>
                                        <label>
                                            Buscar torneio
                                            <input
                                                value={filters.tournament}
                                                onChange={(e) =>
                                                    update({ tournament: e.target.value })
                                                }
                                                placeholder="Loja, data, nome ou formato"
                                            />
                                        </label>
                                        <Select
                                            label="Torneio"
                                            value={filters.tournamentId}
                                            onChange={(value) =>
                                                update({
                                                    tournamentId: value,
                                                    returnTournamentId: ''
                                                })
                                            }
                                            options={[
                                                { value: '', label: 'Todos os torneios' },
                                                ...[...data.events]
                                                    .sort((a, b) =>
                                                        b.isoDate.localeCompare(a.isoDate)
                                                    )
                                                    .filter(
                                                        (event) =>
                                                            (!filters.store ||
                                                                event.store === filters.store) &&
                                                            (!filters.date ||
                                                                event.isoDate === filters.date)
                                                    )
                                                    .map((event) => ({
                                                        value: event.id,
                                                        label: `${event.date} · ${event.store} · ${event.title} · ${event.format}`
                                                    }))
                                            ]}
                                        />
                                    </div>
                                )}
                                {[
                                    filters.query,
                                    filters.store,
                                    filters.format,
                                    filters.date,
                                    filters.tournament,
                                    filters.tournamentId
                                ].some(Boolean) && (
                                    <button
                                        className="deck-clear-filters"
                                        onClick={() =>
                                            update({
                                                query: '',
                                                store: '',
                                                filterFormat: '',
                                                date: '',
                                                tournament: '',
                                                tournamentId: '',
                                                returnTournamentId: ''
                                            })
                                        }
                                    >
                                        Limpar filtros
                                    </button>
                                )}
                            </>
                        )}
                        {communityTab && (get(communityQueryKey) || get(communityFormatKey)) && (
                            <button
                                type="button"
                                className="deck-clear-filters"
                                onClick={() =>
                                    update({ [communityQueryKey]: '', [communityFormatKey]: '' })
                                }
                            >
                                Limpar filtros
                            </button>
                        )}
                        {shownError && (
                            <div className="list-error" role="alert">
                                {shownError}
                                <button className="text-action" onClick={retry}>
                                    Tentar novamente
                                </button>
                            </div>
                        )}
                        {loading || dataLoading ? (
                            <Loader text="Carregando biblioteca…" />
                        ) : (
                            !shownError &&
                            !dataError &&
                            (communityTab ? (
                                <>
                                    {(tab !== 'mine' || account.user) && (
                                        <p role="status">
                                            {filteredFree.length}{' '}
                                            {filteredFree.length === 1 ? 'deck' : 'decks'}
                                        </p>
                                    )}
                                    {claims.error && account.user?.id === claims.owner && (
                                        <p role="alert">
                                            {claims.error}{' '}
                                            <button
                                                type="button"
                                                className="deck-clear-filters"
                                                onClick={() =>
                                                    setClaimRevision((value) => value + 1)
                                                }
                                            >
                                                Tentar novamente
                                            </button>
                                        </p>
                                    )}
                                    {libraryNotice && <p role="status">{libraryNotice}</p>}
                                    {summaries.error && (
                                        <p role="alert">
                                            {summaries.error}{' '}
                                            <button
                                                type="button"
                                                className="deck-clear-filters"
                                                onClick={() =>
                                                    setSummaryRetry((value) => value + 1)
                                                }
                                            >
                                                Tentar novamente
                                            </button>
                                        </p>
                                    )}
                                    <div className="deck-free-grid">
                                        {freePaging.items.map((deck) => {
                                            const mayEdit = canEditCommunityDeck(
                                                account,
                                                deck.owner_user_id
                                            );
                                            const mine =
                                                !!account.user &&
                                                deck.owner_user_id === account.user.id;
                                            const pending =
                                                !deck.owner_user_id &&
                                                ownClaims.some(
                                                    (claim) =>
                                                        String(claim.decklist_id) ===
                                                            String(deck.id) &&
                                                        claim.status === 'pending'
                                                );
                                            const actions: DeckAction[] = [
                                                {
                                                    label: mayEdit ? 'Editar deck' : 'Abrir deck',
                                                    onSelect: () =>
                                                        context.navigate(
                                                            'builder',
                                                            freeParams(deck)
                                                        )
                                                }
                                            ];
                                            if (mayEdit)
                                                actions.push({
                                                    label: 'Editar autor',
                                                    onSelect: () => {
                                                        setAuthorDeck(deck);
                                                        setAuthorId(deck.creator_player_id || '');
                                                        setAuthorError('');
                                                        setLibraryNotice('');
                                                    }
                                                });
                                            if (account.available)
                                                actions.push({
                                                    label: 'Criar cópia',
                                                    onSelect: () => {
                                                        void (async () => {
                                                            try {
                                                                await window.digistatsAuth!.requireMember();
                                                                const id =
                                                                    await window.digistatsAuth!.rpc<number>(
                                                                        'copy_community_deck',
                                                                        { p_source_id: deck.id }
                                                                    );
                                                                context.navigate('builder', {
                                                                    ...freeParams(deck),
                                                                    decklistId: String(id)
                                                                });
                                                            } catch (error) {
                                                                setLibraryNotice(
                                                                    (error as Error).message
                                                                );
                                                            }
                                                        })();
                                                    }
                                                });
                                            if (account.user && !deck.owner_user_id)
                                                actions.push({
                                                    label: 'Adicionar aos meus decks',
                                                    onSelect: () => {
                                                        setClaimDeck(deck);
                                                        setClaimError('');
                                                    }
                                                });
                                            if (canDeleteCommunityDeck(account, deck.owner_user_id))
                                                actions.push({
                                                    label: 'Excluir deck',
                                                    danger: true,
                                                    onSelect: () => {
                                                        setPendingDelete(deck);
                                                        setDeleteError('');
                                                        setLibraryNotice('');
                                                    }
                                                });
                                            const format = data.deckFormats?.find(
                                                (format) =>
                                                    String(format.id) ===
                                                    String(deck.deck_format_id)
                                            );
                                            const pointsLimit =
                                                format?.validation_rules?.points_limit;
                                            const cards = summaries.cards[String(deck.id)];
                                            const points = cards
                                                ? listPoints(cards, format?.validation_rules)
                                                : null;
                                            return (
                                                <article
                                                    className="deck-format-card deck-community-card"
                                                    key={deck.id}
                                                >
                                                    <div className="deck-free-card-header">
                                                        <span className="overview-eyebrow">
                                                            {format?.name ||
                                                                'Formato não informado'}
                                                        </span>
                                                        {pointsLimit != null && (
                                                            <PointsTotalTag
                                                                className="deck-library-points"
                                                                points={points}
                                                                limit={pointsLimit}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="deck-free-identity">
                                                        <Portrait
                                                            image={
                                                                deck.archetype?.deck_images?.[0]
                                                                    ?.image_url
                                                            }
                                                        />
                                                        <div>
                                                            <h3>{deck.name}</h3>
                                                            {deck.archetype && (
                                                                <span className="muted deck-free-type">
                                                                    {deck.archetype.name}
                                                                    <DeckColors
                                                                        colors={
                                                                            deck.archetype.colors ||
                                                                            archetypes.find(
                                                                                (type) =>
                                                                                    String(
                                                                                        type.id
                                                                                    ) ===
                                                                                    String(
                                                                                        deck.archetype_id
                                                                                    )
                                                                            )?.colors ||
                                                                            ''
                                                                        }
                                                                    />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="deck-free-meta">
                                                        {mine && (
                                                            <span className="deck-ownership-badge">
                                                                Seu deck
                                                            </span>
                                                        )}
                                                        {pending && (
                                                            <span className="deck-ownership-badge is-pending">
                                                                Em análise
                                                            </span>
                                                        )}
                                                        {deck.creator && (
                                                            <p className="muted">
                                                                Criado por {deck.creator.name}
                                                            </p>
                                                        )}
                                                        <p className="muted">
                                                            Atualizado em{' '}
                                                            {new Date(
                                                                deck.updated_at
                                                            ).toLocaleDateString('pt-BR')}
                                                        </p>
                                                    </div>
                                                    <div className="deck-library-actions">
                                                        <button
                                                            className="button primary"
                                                            onClick={() =>
                                                                setPreview({
                                                                    title: deck.name,
                                                                    id: deck.id,
                                                                    formatId: deck.deck_format_id,
                                                                    params: freeParams(deck)
                                                                })
                                                            }
                                                        >
                                                            <ListViewIcon /> Ver lista
                                                        </button>
                                                        <DeckActionsMenu
                                                            name={deck.name}
                                                            actions={actions}
                                                        />
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                    {!filteredFree.length && (
                                        <EmptyState>
                                            {tab === 'mine' && !account.user ? (
                                                <>
                                                    <p>Entre para ver seus decks.</p>
                                                    <button
                                                        type="button"
                                                        className="button primary"
                                                        onClick={() =>
                                                            window.digistatsAuth?.open('login')
                                                        }
                                                    >
                                                        Login
                                                    </button>
                                                </>
                                            ) : tab === 'mine' ? (
                                                'Você ainda não tem decks com estes filtros. Crie um deck ou faça uma cópia.'
                                            ) : (
                                                'Nenhum deck encontrado. Ajuste os filtros ou crie um deck.'
                                            )}
                                        </EmptyState>
                                    )}
                                    {pagination(true)}
                                </>
                            ) : (
                                <>
                                    <div className="deck-results-toolbar">
                                        <div
                                            className="deck-status-filters"
                                            role="group"
                                            aria-label="Disponibilidade de lista"
                                        >
                                            {[
                                                ['', 'Todas', results.total],
                                                ['existing', 'Com lista', results.withList],
                                                ['missing', 'Sem lista', results.withoutList]
                                            ].map(([value, label, count]) => (
                                                <button
                                                    key={value}
                                                    aria-pressed={filters.status === value}
                                                    onClick={() =>
                                                        update({ status: String(value) })
                                                    }
                                                >
                                                    {label} ({count})
                                                </button>
                                            ))}
                                        </div>
                                        <div className="deck-table-controls">
                                            <Select
                                                label="Ordenar"
                                                value={filters.sort || 'recent'}
                                                onChange={(value) => update({ sort: value })}
                                                options={[
                                                    { value: 'recent', label: 'Mais recentes' },
                                                    { value: 'oldest', label: 'Mais antigos' },
                                                    { value: 'player', label: 'Jogador A–Z' }
                                                ]}
                                            />
                                            <div className="deck-pagination-top">
                                                {pagination(false, true)}
                                            </div>
                                        </div>
                                    </div>
                                    <table className="deck-participations">
                                        <thead>
                                            <tr>
                                                <th>Jogador</th>
                                                <th>Deck</th>
                                                <th>Torneio</th>
                                                <th>Lista</th>
                                                <th>Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paging.items.map((item) => (
                                                <tr key={item.row.id}>
                                                    <th scope="row" data-label="Jogador">
                                                        <span
                                                            className="deck-placement"
                                                            title="Posição no torneio"
                                                        >
                                                            {item.row.placement > 0
                                                                ? `${item.row.placement}º`
                                                                : '—'}
                                                        </span>
                                                        {item.row.player?.name ||
                                                            'Jogador não informado'}
                                                    </th>
                                                    <td data-label="Deck">
                                                        <span className="catalog-builder-deck">
                                                            <Portrait
                                                                image={
                                                                    item.row.deck?.deck_images?.[0]
                                                                        ?.image_url
                                                                }
                                                            />
                                                            <strong>
                                                                {item.row.deck?.name ||
                                                                    'Deck não informado'}
                                                            </strong>
                                                        </span>
                                                    </td>
                                                    <td data-label="Torneio">
                                                        <span className="deck-store-name">
                                                            <StoreLogo
                                                                logo={item.event.logo}
                                                                name={item.event.store}
                                                            />
                                                            <strong>
                                                                {item.event.store} ·{' '}
                                                                {item.event.title}
                                                            </strong>
                                                        </span>
                                                        <small>
                                                            {item.event.date} ·{' '}
                                                            {item.event.deckFormat || 'Padrão'} ·{' '}
                                                            {item.event.format}
                                                        </small>
                                                    </td>
                                                    <td data-label="Lista">
                                                        <span
                                                            className={`deck-list-status${item.hasList ? ' available' : ''}`}
                                                        >
                                                            {item.hasList
                                                                ? '✓ Disponível'
                                                                : '⊖ Sem lista'}
                                                        </span>
                                                    </td>
                                                    <td data-label="Ação">
                                                        <button
                                                            className="button secondary"
                                                            onClick={() => openParticipation(item)}
                                                        >
                                                            {item.hasList ? (
                                                                <ListViewIcon />
                                                            ) : (
                                                                <span aria-hidden="true">＋</span>
                                                            )}
                                                            {item.hasList
                                                                ? 'Ver lista'
                                                                : 'Criar lista'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {!results.items.length && (
                                        <EmptyState>
                                            Nenhuma participação encontrada. Ajuste os filtros.
                                        </EmptyState>
                                    )}
                                </>
                            ))
                        )}
                    </>
                )}
            </div>
            {claimDeck && (
                <Dialog
                    title="Adicionar aos meus decks"
                    busy={claimBusy}
                    onClose={() => setClaimDeck(null)}
                >
                    <form
                        className="deck-library-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (claimBusy) return;
                            setClaimBusy(true);
                            setClaimError('');
                            void (async () => {
                                try {
                                    const auth = window.digistatsAuth!;
                                    await auth.requireMember();
                                    const userId = auth.getSnapshot().user?.id;
                                    if (!userId || userId !== account.user?.id)
                                        throw new Error('Sua conta mudou. Entre novamente.');
                                    await auth.rpc<string>('submit_account_request', {
                                        p_type: 'deck_claim',
                                        p_decklist_id: claimDeck.id
                                    });
                                    setClaimDeck(null);
                                    setLibraryNotice('Deck adicionado aos seus decks.');
                                    setRevision((value) => value + 1);
                                } catch (error) {
                                    setClaimError((error as Error).message);
                                    setClaimRevision((value) => value + 1);
                                } finally {
                                    setClaimBusy(false);
                                }
                            })();
                        }}
                    >
                        <p>
                            Assumir a propriedade de <strong>{claimDeck.name}</strong>.
                        </p>
                        {claimError && <p role="alert">{claimError}</p>}
                        <div className="deck-library-actions">
                            <button
                                type="button"
                                className="button secondary"
                                disabled={claimBusy}
                                onClick={() => setClaimDeck(null)}
                            >
                                Cancelar
                            </button>
                            <button className="button primary" disabled={claimBusy}>
                                {claimBusy ? 'Adicionando…' : 'Adicionar aos meus decks'}
                            </button>
                        </div>
                    </form>
                </Dialog>
            )}
            {authorDeck && (
                <Dialog
                    title={`Editar autor — ${authorDeck.name}`}
                    busy={authorBusy}
                    onClose={() => {
                        if (!authorBusy) setAuthorDeck(null);
                    }}
                >
                    <form
                        className="deck-library-form"
                        onSubmit={async (event) => {
                            event.preventDefault();
                            if (authorBusy) return;
                            if (
                                authorId &&
                                !players.some((player) => String(player.id) === authorId)
                            ) {
                                setAuthorError('Selecione um jogador cadastrado nas sugestões.');
                                return;
                            }
                            setAuthorBusy(true);
                            setAuthorError('');
                            try {
                                const updated = await updateLibraryDeckAuthor(authorDeck, authorId);
                                setFreeDecks((old) =>
                                    old.map((deck) =>
                                        String(deck.id) === String(authorDeck.id)
                                            ? { ...deck, ...updated }
                                            : deck
                                    )
                                );
                                setAuthorDeck(null);
                                setLibraryNotice(`Autor de ${authorDeck.name} atualizado.`);
                            } catch (error) {
                                setAuthorError((error as Error).message);
                            } finally {
                                setAuthorBusy(false);
                            }
                        }}
                    >
                        <SearchSelect
                            label="Autor do deck"
                            value={authorId}
                            onChange={setAuthorId}
                            commitOnly
                            placeholder="Digite o nome do jogador"
                            emptyMessage="Nenhum jogador encontrado."
                            options={[
                                { value: '', label: 'Sem autor' },
                                ...(authorDeck.creator_player_id &&
                                !players.some(
                                    (player) => String(player.id) === authorDeck.creator_player_id
                                )
                                    ? [
                                          {
                                              value: authorDeck.creator_player_id,
                                              label: authorDeck.creator?.name || 'Autor atual'
                                          }
                                      ]
                                    : []),
                                ...players.map((player) => ({
                                    value: String(player.id),
                                    label: player.name
                                }))
                            ]}
                        />
                        {authorError && <p role="alert">{authorError}</p>}
                        <div className="deck-library-actions">
                            <button
                                type="button"
                                className="button secondary"
                                disabled={authorBusy}
                                onClick={() => setAuthorDeck(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="button primary"
                                disabled={
                                    authorBusy || authorId === (authorDeck.creator_player_id || '')
                                }
                            >
                                {authorBusy ? 'Salvando…' : 'Salvar autor'}
                            </button>
                        </div>
                    </form>
                </Dialog>
            )}
            {pendingDelete && (
                <Dialog
                    title="Excluir deck da comunidade?"
                    busy={deleteBusy}
                    onClose={() => {
                        if (!deleteBusy) setPendingDelete(null);
                    }}
                >
                    <div className="deck-library-form">
                        <p>
                            Excluir <strong>{pendingDelete.name}</strong> e sua lista de cartas?
                            Esta ação não pode ser desfeita.
                        </p>
                        {deleteError && <p role="alert">{deleteError}</p>}
                        <div className="deck-library-actions">
                            <button
                                type="button"
                                className="button secondary"
                                disabled={deleteBusy}
                                onClick={() => setPendingDelete(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="button secondary deck-delete-button"
                                disabled={deleteBusy}
                                onClick={async () => {
                                    if (deleteBusy) return;
                                    setDeleteBusy(true);
                                    setDeleteError('');
                                    try {
                                        await deleteCommunityDeck(
                                            pendingDelete.id,
                                            pendingDelete.updated_at
                                        );
                                        setFreeDecks((old) =>
                                            old.filter(
                                                (deck) =>
                                                    String(deck.id) !== String(pendingDelete.id)
                                            )
                                        );
                                        setPendingDelete(null);
                                        setLibraryNotice(`Deck ${pendingDelete.name} excluído.`);
                                    } catch (error) {
                                        setDeleteError((error as Error).message);
                                    } finally {
                                        setDeleteBusy(false);
                                    }
                                }}
                            >
                                {deleteBusy ? 'Excluindo…' : 'Excluir deck'}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}
            {create && (
                <Dialog
                    title={create.importing ? 'Importar lista' : 'Criar deck'}
                    onClose={() => setCreate(null)}
                    busy={busy}
                >
                    <form
                        className="deck-library-form deck-create-form"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (busy) return;
                            const form = new FormData(e.currentTarget);
                            const name = String(form.get('name') || '')
                                .trim()
                                .toLocaleUpperCase('pt-BR');
                            const format = String(form.get('format') || '');
                            const archetype = String(form.get('archetype') || '');
                            const creator = String(form.get('creator') || '');
                            if (
                                !archetypes.some((deck) => String(deck.id) === archetype) ||
                                (creator &&
                                    !players.some((player) => String(player.id) === creator))
                            ) {
                                setActionError(
                                    'Selecione um tipo de deck cadastrado e, se desejar, um jogador.'
                                );
                                return;
                            }
                            if (!name || !activeFormats.some((f) => String(f.id) === format)) {
                                setActionError('Informe o nome e um formato disponível.');
                                return;
                            }
                            setBusy(true);
                            setActionError('');
                            try {
                                const selectedFormat = activeFormats.find(
                                    (f) => String(f.id) === format
                                )!;
                                setCreate(null);
                                context.navigate('builder', {
                                    new: '1',
                                    deck: name,
                                    format: selectedFormat.code,
                                    formatId: format,
                                    archetypeId: archetype,
                                    creatorPlayerId: creator,
                                    creatorPlayerName:
                                        players.find((player) => String(player.id) === creator)
                                            ?.name || '',
                                    returnView: 'decks',
                                    libraryState,
                                    openImport: create.importing ? '1' : ''
                                });
                            } catch (e) {
                                setActionError((e as Error).message);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        <p className="muted">
                            O deck será salvo na biblioteca pública da comunidade.
                        </p>
                        <label>
                            Nome do deck
                            <input
                                name="name"
                                required
                                maxLength={120}
                                autoFocus
                                onChange={(event) => {
                                    event.currentTarget.value =
                                        event.currentTarget.value.toLocaleUpperCase('pt-BR');
                                }}
                            />
                        </label>
                        <label>
                            Formato
                            <select name="format" required defaultValue={create.format}>
                                <option value="">Selecione um formato</option>
                                {activeFormats.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {formatLabel(f.code)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="deck-create-type">
                            <SearchSelect
                                label="Tipo de deck"
                                name="archetype"
                                required
                                placeholder="Busque pelo nome, ex.: Gallantmon"
                                options={archetypes.map((deck) => ({
                                    value: String(deck.id),
                                    label: deck.name
                                }))}
                            />
                            <p className="muted">Digite parte do nome e selecione uma sugestão.</p>
                        </div>
                        <SearchSelect
                            label="Jogador (opcional)"
                            name="creator"
                            value={create.creator || ''}
                            onChange={(creator) =>
                                setCreate((old) => (old ? { ...old, creator } : old))
                            }
                            placeholder="Digite o nome do jogador"
                            emptyMessage="Nenhum jogador encontrado."
                            options={players.map((player) => ({
                                value: String(player.id),
                                label: player.name
                            }))}
                        />
                        {identityError && (
                            <p role="alert">
                                {identityError}
                                <button
                                    className="button secondary"
                                    type="button"
                                    onClick={() => setRevision((value) => value + 1)}
                                >
                                    Tentar novamente
                                </button>
                            </p>
                        )}

                        {actionError && <p role="alert">{actionError}</p>}
                        <button
                            className="button primary deck-desktop-create"
                            disabled={
                                busy ||
                                !activeFormats.length ||
                                !archetypes.length ||
                                !!identityError
                            }
                        >
                            {busy ? 'Criando…' : 'Continuar no editor'}
                        </button>
                    </form>
                </Dialog>
            )}
            {preview && (
                <ListPreview preview={preview} context={context} onClose={() => setPreview(null)} />
            )}
            {associate && (
                <Dialog
                    title={
                        associate.hasList
                            ? 'Substituir lista da participação'
                            : 'Criar lista da participação'
                    }
                    onClose={() => setAssociate(null)}
                    busy={busy}
                >
                    <div className="deck-library-form">
                        <p>
                            {associate.row.player?.name} · {associate.event.title} ·{' '}
                            {associate.event.deckFormat || 'Padrão'}
                        </p>
                        <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => {
                                context.navigate('builder', editorParams(associate));
                                setAssociate(null);
                            }}
                        >
                            Abrir editor de cartas →
                        </button>
                        <label>
                            Ou copiar um deck da comunidade
                            <select
                                disabled={busy}
                                value={source}
                                onChange={(e) => setSource(e.target.value)}
                            >
                                <option value="">Selecione um deck</option>
                                {freeDecks.map((deck) => (
                                    <option value={deck.id} key={deck.id}>
                                        {deck.name} ·{' '}
                                        {
                                            (data.deckFormats || []).find(
                                                (f) => String(f.id) === String(deck.deck_format_id)
                                            )?.name
                                        }
                                    </option>
                                ))}
                            </select>
                        </label>
                        {freeError && <p role="alert">{freeError}</p>}
                        <p className="muted">
                            As cartas serão copiadas para esta participação no formato{' '}
                            {associate.event.deckFormat || 'Padrão'}. O deck da comunidade será
                            preservado.
                        </p>
                        {associate.hasList && (
                            <label>
                                <input
                                    type="checkbox"
                                    disabled={busy}
                                    checked={replace}
                                    onChange={(e) => setReplace(e.target.checked)}
                                />{' '}
                                Confirmo a substituição da lista atual.
                            </label>
                        )}
                        {actionError && <p role="alert">{actionError}</p>}
                        <button
                            className="button secondary"
                            disabled={!source || busy || (associate.hasList && !replace)}
                            onClick={async () => {
                                if (busy) return;
                                setBusy(true);
                                setActionError('');
                                try {
                                    await copyLibraryDeck(
                                        source,
                                        String(associate.row.id),
                                        replace
                                    );
                                    setAssociate(null);
                                    setRevision((v) => v + 1);
                                } catch (e) {
                                    setActionError((e as Error).message);
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            {busy ? 'Copiando…' : 'Copiar lista para participação'}
                        </button>
                    </div>
                </Dialog>
            )}
        </section>
    );
}

function safeRulesUrl(value?: string | null) {
    try {
        const url = new URL(value || '');
        return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
    } catch {
        return undefined;
    }
}

function ListPreview({
    preview,
    context,
    onClose
}: {
    preview: Preview;
    context: MicroContext;
    onClose(): void;
}) {
    const [cards, setCards] = useState<ListCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [copyStatus, setCopyStatus] = useState('');
    const [manualCopy, setManualCopy] = useState(false);
    const { data } = useData(context.data);
    const format =
        data.deckFormats?.find((format) => String(format.id) === String(preview.formatId)) ||
        data.deckFormats?.find(
            (format) =>
                normalizeSearch(format.code) === normalizeSearch(preview.params.format) ||
                normalizeSearch(format.name) === normalizeSearch(preview.params.format)
        );
    const pointsLimit = format?.validation_rules?.points_limit;
    const points = listPoints(cards, format?.validation_rules);
    const clipboardText = cards.map((card) => `${card.qty} ${card.card_code}`).join('\n');
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        (preview.id
            ? loadListCards(preview.id, controller.signal)
            : Promise.resolve(legacyCards(preview.legacy || ''))
        )
            .then((items) =>
                orderListCards(
                    items.length ? items : legacyCards(preview.legacy || ''),
                    controller.signal
                )
            )
            .then((items) => {
                if (!controller.signal.aborted) setCards(items);
            })
            .catch((e) => {
                if (!controller.signal.aborted) setError(e.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [preview, revision]);
    return (
        <Dialog
            title={preview.title}
            onClose={onClose}
            wide
            headerContent={
                <div className="deck-preview-heading">
                    <h2>{preview.title}</h2>
                    {pointsLimit != null && (
                        <PointsTotalTag
                            className="deck-library-points"
                            points={loading || error ? null : points}
                            limit={pointsLimit}
                        />
                    )}
                </div>
            }
        >
            {loading ? (
                <Loader text="Carregando lista…" />
            ) : error ? (
                <p role="alert">
                    {error}{' '}
                    <button className="button secondary" onClick={() => setRevision((v) => v + 1)}>
                        Tentar novamente
                    </button>
                </p>
            ) : (
                <>
                    <div className="catalog-card-grid deck-preview-grid">
                        {cards.map((card) => (
                            <figure key={`${card.position}-${card.card_code}`}>
                                <div className="deck-preview-art">
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
                                    <span
                                        className="deck-preview-quantity"
                                        aria-label={`${card.qty} cópias`}
                                    >
                                        ×{card.qty}
                                    </span>
                                    {pointsLimit != null &&
                                        format?.validation_rules?.card_points?.[card.card_code] && (
                                            <PointsBadge
                                                className="deck-preview-card-points"
                                                points={
                                                    format.validation_rules.card_points[
                                                        card.card_code
                                                    ].points
                                                }
                                            />
                                        )}
                                </div>
                                <figcaption>{card.card_code}</figcaption>
                            </figure>
                        ))}
                    </div>
                    {!cards.length && (
                        <p className="muted">
                            {preview.legacy
                                ? 'Lista legada: consulte o conteúdo abaixo ou abra no editor.'
                                : 'Esta lista ainda não possui cartas.'}
                        </p>
                    )}
                    {!cards.length && preview.legacy && (
                        <pre className="deck-legacy-text">{preview.legacy}</pre>
                    )}
                </>
            )}
            <div className="deck-library-actions">
                <button
                    className="button primary"
                    onClick={() => {
                        onClose();
                        context.navigate('builder', preview.params);
                    }}
                >
                    {preview.participation ? 'Editar lista →' : 'Editar deck →'}
                </button>
                <button
                    className="button secondary"
                    disabled={loading || !!error || !cards.length}
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(clipboardText);
                            setCopyStatus('Decklist copiada.');
                            setManualCopy(false);
                        } catch {
                            setCopyStatus('Selecione o texto abaixo para copiar a decklist.');
                            setManualCopy(true);
                        }
                    }}
                >
                    Copiar decklist
                </button>
            </div>
            <p role="status">{copyStatus}</p>
            {manualCopy && (
                <label>
                    Decklist para copiar
                    <textarea
                        readOnly
                        value={clipboardText}
                        onFocus={(event) => event.target.select()}
                        rows={8}
                    />
                </label>
            )}
        </Dialog>
    );
}
