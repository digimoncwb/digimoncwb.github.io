import { useEffect, useMemo, useState } from 'react';
import { MetaProfileSummary } from './MetaProfileSummary';
import type { MicroContext } from '../../contracts';
import { useData, Loader } from '../../shared/runtime';
import { Select } from '../../shared/Select';
import { DeckColors } from '../../shared/DeckColors';
import { deckColors } from '../workspace/catalog-service';
import { Portrait } from '../../shared/cards';
import { Dialog, Pagination } from '../../shared/ListPage';
import { analyzeMeta, currentFormat, eventType, communityActivity } from './metagame-model';
import '../workspace/catalog.css';
import './metagame.css';
import { useMetaResults } from './useMetaResults';
import { useSiteAuth } from '../../shared/site-auth';
import { canAccessRoute } from '../../shared/route-access';

const percent = (n: number, d: number) =>
    d ? `${((n / d) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—';
const monthLabel = (month: string) =>
    new Date(month + '-15T12:00:00').toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
    });
const deckBarColor = (code: string) =>
    code === 'b'
        ? '#73777f'
        : deckColors.find((color) => color.code === code)?.color || 'var(--accent)';
export function MetagamePage({ context }: { context: MicroContext }) {
    const account = useSiteAuth();
    const canOpenLists = canAccessRoute('builder', account);
    const PlayerName = canAccessRoute('players', account) ? 'button' : 'span';
    const DeckName = canAccessRoute('decks', account) ? 'button' : 'span';
    const ListCard = canOpenLists ? 'button' : 'article';
    const snapshot = useData(context.data),
        { data } = snapshot;
    const { records, loading, error, retry } = useMetaResults(context, snapshot.updatedAt);
    const [historical, setHistorical] = useState(context.route.params.get('format') || ''),
        [month, setMonth] = useState(
            (context.route.params.get('period') || '').replace(/^month:/, '')
        ),
        [store, setStore] = useState(context.route.params.get('store') || ''),
        [type, setType] = useState(''),
        [tab, setTab] = useState('meta'),
        [query, setQuery] = useState(''),
        [sort, setSort] = useState('count'),
        [page, setPage] = useState(1),
        [size, setSize] = useState(20),
        [detail, setDetail] = useState(''),
        [listDeck, setListDeck] = useState(''),
        [minimum, setMinimum] = useState('0'),
        [communitySort, setCommunitySort] = useState('count'),
        [storeSort, setStoreSort] = useState('count');
    useEffect(() => {
        setHistorical(context.route.params.get('format') || '');
        const p = context.route.params.get('period') || '';
        setMonth(p.startsWith('month:') ? p.slice(6) : '');
        setStore(context.route.params.get('store') || '');
    }, [context.route]);
    const current = currentFormat(data.formats, data.events),
        format = historical || current;
    const formatEvents = data.events.filter((e) => e.format === format);
    const months = [...new Set(formatEvents.map((e) => e.isoDate.slice(0, 7)))].sort().reverse();
    const base = formatEvents.filter(
        (e) => (!store || e.storeId === store) && (!type || eventType(e.title) === type)
    );
    const events = base.filter((e) => !month || e.isoDate.startsWith(month));
    const model = useMemo(
        () => analyzeMeta(events, records),
        [records, data, format, month, store, type]
    );
    useEffect(() => {
        setPage(1);
        setDetail('');
    }, [format, month, store, type, query, sort, tab, size, minimum, communitySort]);
    const rows = model.decks
        .filter(
            (r) =>
                r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
                r.count >= Number(minimum)
        )
        .sort((a, b) => {
            const score = (r: typeof a) =>
                sort === 'players'
                    ? r.players.size
                    : sort === 'lists'
                      ? r.lists
                      : sort === 'top4'
                        ? r.topEligible
                            ? r.top4 / r.topEligible
                            : -1
                        : sort === 'titles'
                          ? r.titles
                          : sort === 'conversion'
                            ? r.eligible
                                ? r.titles / r.eligible
                                : 0
                            : r.count;
            return score(b) - score(a) || b.count - a.count || a.name.localeCompare(b.name);
        });
    const selected = model.decks.find((r) => r.id === detail);
    const mostEntries = Math.max(1, ...model.decks.map((deck) => deck.count));
    const lists = model.results.filter(
        (r) =>
            r.decklists?.length &&
            (!listDeck || r.deck_id === listDeck) &&
            (!query ||
                `${r.deck?.name || ''} ${r.player?.name || ''}`
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()))
    );
    const activity = communityActivity(events);
    const playerRows = [...model.players]
        .filter((r) => r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((a, b) =>
            communitySort === 'last'
                ? b.last.localeCompare(a.last) || a.name.localeCompare(b.name)
                : (communitySort === 'titles'
                      ? b.titles - a.titles
                      : communitySort === 'top4'
                        ? b.top4 - a.top4
                        : b.count - a.count) || a.name.localeCompare(b.name)
        );
    const storeRows = activity.stores
        .filter((r) => r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((a, b) =>
            storeSort === 'last'
                ? b.last.localeCompare(a.last) || a.name.localeCompare(b.name)
                : (storeSort === 'average'
                      ? b.entries / b.count - a.entries / a.count
                      : storeSort === 'entries'
                        ? b.entries - a.entries
                        : b.count - a.count) || a.name.localeCompare(b.name)
        );
    const leaders = [...model.decks]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 10);
    const latest = [...events].sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0];
    const entries = events.reduce((sum, e) => sum + e.players, 0);
    const sortHeader = (
        label: string,
        key: string,
        value: string,
        change: (key: string) => void
    ) => (
        <th aria-sort={value === key ? 'descending' : 'none'}>
            <button className="meta-sort-button" onClick={() => change(key)}>
                {label} {value === key ? '↓' : ''}
            </button>
        </th>
    );
    const total =
        tab === 'meta' ? rows.length : tab === 'community' ? playerRows.length : lists.length;
    const actualPage = Math.min(page, Math.max(1, Math.ceil(total / size))),
        start = (actualPage - 1) * size;
    const go = (
        name: 'decks' | 'players' | 'builder' | 'tournaments',
        params: Record<string, string>
    ) => {
        if (canAccessRoute(name, account)) context.navigate(name, params);
    };
    const openList = (result: (typeof model.results)[number]) => {
        if (!canOpenLists) return;
        const event = events.find((event) => event.id === String(result.tournament_id));
        go('builder', {
            resultId: result.id,
            tournamentId: String(result.tournament_id),
            deck: result.deck?.name || '',
            player: result.player?.name || '',
            store: event?.store || '',
            date: event?.isoDate || '',
            format: event?.format || format,
            returnView: 'meta',
            returnFormat: format,
            returnPeriod: month ? `month:${month}` : '',
            returnStore: store
        });
    };
    return (
        <section className="view metagame-view">
            <div className="page-heading meta-page-heading">
                <h1>Metagame</h1>
            </div>
            <div className="meta-controls">
                <div className="meta-filter-bar">
                    <Select
                        label="Formato"
                        value={format}
                        onChange={(v) => {
                            setHistorical(v);
                            setMonth('');
                        }}
                        options={[
                            ...(current
                                ? [
                                      {
                                          value: current,
                                          label: `Atual · ${window.liveData.formatLabel(current, data.formats)}`
                                      }
                                  ]
                                : []),
                            ...data.formats
                                .filter(
                                    (f) =>
                                        f.code !== current &&
                                        data.events.some((e) => e.format === f.code)
                                )
                                .map((f) => ({
                                    value: f.code,
                                    label: window.liveData.formatLabel(f.code, data.formats)
                                }))
                        ]}
                    />

                    <Select
                        label="Período"
                        value={month}
                        onChange={setMonth}
                        options={[
                            { value: '', label: 'Todo o formato' },
                            ...months.map((m) => ({ value: m, label: monthLabel(m) }))
                        ]}
                    />
                    <Select
                        label="Loja"
                        value={store}
                        onChange={setStore}
                        options={[
                            { value: '', label: 'Todas as lojas' },
                            ...data.stores.map((s) => ({ value: String(s.id), label: s.name }))
                        ]}
                    />
                    <Select
                        label="Tipo de evento"
                        value={type}
                        onChange={setType}
                        options={[
                            { value: '', label: 'Todos os tipos' },
                            ...[...new Set(formatEvents.map((e) => eventType(e.title)))]
                                .sort()
                                .map((t) => ({ value: t, label: t }))
                        ]}
                    />
                </div>
            </div>
            {snapshot.error && <p role="alert">{snapshot.error}</p>}
            {loading ? (
                <Loader text="Analisando resultados…" />
            ) : error ? (
                <div role="alert">
                    <p>{error}</p>
                    <button className="button secondary" onClick={retry}>
                        Tentar novamente
                    </button>
                </div>
            ) : (
                <>
                    <div className={`meta-summary ${tab === 'lists' ? 'meta-summary-lists' : ''}`}>
                        <div className="meta-summary-stats">
                            <h2>
                                {tab === 'community'
                                    ? 'Atividade da comunidade'
                                    : 'Decks e metagame'}
                            </h2>
                            <div className="meta-kpis">
                                {(tab === 'community'
                                    ? [
                                          ['Torneios', events.length],
                                          [
                                              'Média por torneio',
                                              events.length
                                                  ? (entries / events.length).toLocaleString(
                                                        'pt-BR',
                                                        { maximumFractionDigits: 1 }
                                                    )
                                                  : '—'
                                          ],
                                          ['Participações', entries],
                                          ['Último evento', latest?.date || '—']
                                      ]
                                    : [
                                          ['Decks', model.decks.length],
                                          ['Participações', model.known.length],
                                          ['Mais utilizado', leaders[0]?.name || '—'],
                                          [
                                              'Meta do líder',
                                              percent(leaders[0]?.count || 0, model.known.length)
                                          ]
                                      ]
                                ).map(([label, value]) => (
                                    <div className="meta-kpi" key={label}>
                                        <span>{label}</span>
                                        <strong>{value}</strong>
                                    </div>
                                ))}
                            </div>
                            {tab !== 'community' &&
                                leaders.length > 1 &&
                                leaders[0].count === leaders[1].count && (
                                    <p className="meta-tie">Liderança compartilhada</p>
                                )}
                        </div>
                        {tab === 'meta' && leaders.length > 0 && (
                            <div className="meta-chart">
                                <h2>Top 10 decks</h2>
                                {leaders.map((r) => (
                                    <button
                                        key={r.id}
                                        onClick={() => setDetail(r.id)}
                                        className="meta-chart-row"
                                    >
                                        <span>{r.name}</span>
                                        <span className="meta-chart-track">
                                            <i
                                                style={{
                                                    width: `${(100 * r.count) / leaders[0].count}%`,
                                                    background: deckBarColor(r.primaryColor)
                                                }}
                                            />
                                        </span>
                                        <strong>{percent(r.count, model.known.length)}</strong>
                                    </button>
                                ))}
                            </div>
                        )}
                        {tab === 'community' && activity.weeks.length > 0 && (
                            <div className="meta-chart">
                                <h2>Torneios por semana</h2>
                                <div className="meta-week-chart">
                                    {activity.weeks.map(([week, count]) => (
                                        <div
                                            key={week}
                                            className="meta-week"
                                            title={`Semana de ${window.liveData.displayDate(week)}: ${count} torneios`}
                                        >
                                            <strong>{count}</strong>
                                            <div className="meta-week-track">
                                                <i
                                                    style={{
                                                        height: `${(100 * count) / Math.max(1, ...activity.weeks.map(([, n]) => n))}%`
                                                    }}
                                                />
                                            </div>
                                            <span>{window.liveData.displayDate(week)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="analysis-tabs" aria-label="Análises">
                        {[
                            ['meta', 'Metagame'],
                            ['community', 'Comunidade'],
                            ['lists', 'Decklists']
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                aria-pressed={tab === value}
                                onClick={() => {
                                    setTab(value);
                                    setListDeck('');
                                    setQuery('');
                                }}
                            >
                                {label}
                                <span className="meta-tab-count">
                                    {value === 'meta'
                                        ? model.decks.length
                                        : value === 'community'
                                          ? model.players.length
                                          : model.results.filter((r) => r.decklists?.length).length}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="meta-table-tools">
                        <label>
                            Buscar{' '}
                            {tab === 'community'
                                ? 'jogador ou loja'
                                : tab === 'lists'
                                  ? 'deck ou jogador'
                                  : 'deck'}
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar na análise"
                            />
                        </label>
                        {tab === 'meta' && (
                            <Select
                                label="Amostra mínima"
                                value={minimum}
                                onChange={setMinimum}
                                options={[
                                    { value: '0', label: 'Todos os decks' },
                                    { value: '5', label: '5 participações' },
                                    { value: '10', label: '10 participações' }
                                ]}
                            />
                        )}
                        <span className="meta-result-count">
                            {tab === 'meta'
                                ? `${rows.length} de ${model.decks.length} decks`
                                : tab === 'community'
                                  ? `${playerRows.length} jogadores · ${storeRows.length} lojas`
                                  : `${lists.length} participações com listas`}
                        </span>
                    </div>
                    {tab === 'lists' && listDeck && (
                        <button className="button secondary" onClick={() => setListDeck('')}>
                            Mostrar listas de todos os decks
                        </button>
                    )}
                    {tab === 'meta' ? (
                        <div className="meta-table-scroll">
                            <table className="meta-results-table meta-deck-table">
                                <thead>
                                    <tr>
                                        <th>Deck</th>
                                        <th aria-sort={sort === 'count' ? 'descending' : 'none'}>
                                            <button
                                                className="meta-sort-button"
                                                onClick={() => setSort('count')}
                                            >
                                                Participações {sort === 'count' ? '↓' : ''}
                                            </button>
                                        </th>
                                        {sortHeader('Meta %', 'count', sort, setSort)}
                                        {sortHeader('Jogadores', 'players', sort, setSort)}
                                        <th aria-sort={sort === 'titles' ? 'descending' : 'none'}>
                                            <button
                                                className="meta-sort-button"
                                                onClick={() => setSort('titles')}
                                            >
                                                Títulos {sort === 'titles' ? '↓' : ''}
                                            </button>
                                        </th>
                                        <th
                                            aria-sort={
                                                sort === 'conversion' ? 'descending' : 'none'
                                            }
                                        >
                                            <button
                                                className="meta-sort-button"
                                                onClick={() => setSort('conversion')}
                                            >
                                                Taxa de títulos {sort === 'conversion' ? '↓' : ''}
                                            </button>
                                        </th>
                                        <th title="Somente torneios completos com pelo menos 8 participantes">
                                            <button
                                                className="meta-sort-button"
                                                onClick={() => setSort('top4')}
                                            >
                                                Top 4 {sort === 'top4' ? '↓' : ''}
                                            </button>
                                        </th>
                                        {sortHeader('Listas', 'lists', sort, setSort)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(start, start + size).map((r, index) => (
                                        <tr key={r.id}>
                                            <th>
                                                <button
                                                    className="meta-deck-button"
                                                    onClick={() => setDetail(r.id)}
                                                >
                                                    <span className="meta-row-number">
                                                        {String(start + index + 1).padStart(2, '0')}
                                                    </span>
                                                    <Portrait image={r.image} />
                                                    <span className="meta-deck-name">{r.name}</span>
                                                    <DeckColors colors={r.colors} />
                                                </button>
                                            </th>
                                            <td>
                                                <strong>{r.count}</strong>
                                                <div className="meta-share-bar" aria-hidden="true">
                                                    <i
                                                        style={{
                                                            width: `${(100 * r.count) / mostEntries}%`,
                                                            background: deckBarColor(r.primaryColor)
                                                        }}
                                                    />
                                                </div>
                                            </td>
                                            <td>{percent(r.count, model.known.length)}</td>
                                            <td>{r.players.size}</td>
                                            <td>
                                                <span
                                                    className={`meta-title-count${r.titles ? ' has-titles' : ''}`}
                                                >
                                                    {r.titles}
                                                </span>
                                            </td>
                                            <td className="meta-rate">
                                                {percent(r.titles, r.eligible)}{' '}
                                                <span className="meta-rate-base">
                                                    ({r.titles}/{r.eligible})
                                                </span>
                                            </td>
                                            <td
                                                className="meta-rate"
                                                title={
                                                    r.topEligible > 0 && r.topEligible < 5
                                                        ? 'Amostra pequena: menos de 5 participações elegíveis'
                                                        : undefined
                                                }
                                            >
                                                {percent(r.top4, r.topEligible)}{' '}
                                                <span className="meta-rate-base">
                                                    ({r.top4}/{r.topEligible})
                                                </span>
                                                {r.topEligible > 0 && r.topEligible < 5 && (
                                                    <span
                                                        className="meta-sample-marker"
                                                        aria-label="Amostra pequena"
                                                    >
                                                        *
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {r.lists ? (
                                                    <button
                                                        className="meta-text-button"
                                                        onClick={() => {
                                                            setTab('lists');
                                                            setQuery('');
                                                            setListDeck(r.id);
                                                        }}
                                                    >
                                                        {r.lists} ↗
                                                    </button>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : tab === 'community' ? (
                        <div className="meta-community-grid">
                            <section className="meta-dashboard-panel">
                                <h2 className="meta-section-title">Lojas</h2>
                                <div className="meta-table-scroll">
                                    <table className="meta-results-table">
                                        <thead>
                                            <tr>
                                                <th>Loja</th>
                                                {sortHeader(
                                                    'Torneios',
                                                    'count',
                                                    storeSort,
                                                    setStoreSort
                                                )}
                                                {sortHeader(
                                                    'Participações',
                                                    'entries',
                                                    storeSort,
                                                    setStoreSort
                                                )}
                                                {sortHeader(
                                                    'Média por torneio',
                                                    'average',
                                                    storeSort,
                                                    setStoreSort
                                                )}
                                                {sortHeader(
                                                    'Último evento',
                                                    'last',
                                                    storeSort,
                                                    setStoreSort
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {storeRows.map((r) => (
                                                <tr key={r.id}>
                                                    <th>
                                                        <button
                                                            className="meta-text-button"
                                                            onClick={() =>
                                                                context.navigate('tournaments', {
                                                                    format,
                                                                    store: r.id,
                                                                    ...(month
                                                                        ? {
                                                                              period: `month:${month}`
                                                                          }
                                                                        : {})
                                                                })
                                                            }
                                                        >
                                                            {r.name}
                                                        </button>
                                                    </th>
                                                    <td>{r.count}</td>
                                                    <td>{r.entries}</td>
                                                    <td>
                                                        {(r.entries / r.count).toLocaleString(
                                                            'pt-BR',
                                                            {
                                                                maximumFractionDigits: 1
                                                            }
                                                        )}
                                                    </td>
                                                    <td>{window.liveData.displayDate(r.last)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {!storeRows.length && (
                                    <p className="meta-empty">
                                        Nenhuma loja encontrada neste recorte.
                                    </p>
                                )}
                            </section>
                            <section className="meta-dashboard-panel">
                                <h2 className="meta-section-title">Jogadores</h2>
                                <div className="meta-table-scroll">
                                    <table className="meta-results-table">
                                        <thead>
                                            <tr>
                                                <th>Jogador</th>
                                                {sortHeader(
                                                    'Participações',
                                                    'count',
                                                    communitySort,
                                                    setCommunitySort
                                                )}
                                                {sortHeader(
                                                    'Títulos',
                                                    'titles',
                                                    communitySort,
                                                    setCommunitySort
                                                )}
                                                {sortHeader(
                                                    'Top 4',
                                                    'top4',
                                                    communitySort,
                                                    setCommunitySort
                                                )}
                                                <th>Deck mais utilizado</th>
                                                {sortHeader(
                                                    'Último evento',
                                                    'last',
                                                    communitySort,
                                                    setCommunitySort
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {playerRows.slice(start, start + size).map((r) => (
                                                <tr key={r.id}>
                                                    <th>
                                                        <PlayerName
                                                            className="meta-text-button"
                                                            onClick={
                                                                canAccessRoute('players', account)
                                                                    ? () =>
                                                                          go('players', {
                                                                              playerId: r.id
                                                                          })
                                                                    : undefined
                                                            }
                                                        >
                                                            {r.name}
                                                        </PlayerName>
                                                    </th>
                                                    <td>{r.count}</td>
                                                    <td>{r.titles}</td>
                                                    <td
                                                        title={`${r.topEligible} participações elegíveis`}
                                                    >
                                                        {r.top4}
                                                    </td>
                                                    <td>
                                                        {[...r.decks.values()]
                                                            .filter(
                                                                (d) =>
                                                                    d.count ===
                                                                    Math.max(
                                                                        ...[
                                                                            ...r.decks.values()
                                                                        ].map((d) => d.count)
                                                                    )
                                                            )
                                                            .map((d) => (
                                                                <DeckName
                                                                    key={d.id}
                                                                    className="meta-text-button meta-player-deck"
                                                                    onClick={
                                                                        canAccessRoute(
                                                                            'decks',
                                                                            account
                                                                        )
                                                                            ? () =>
                                                                                  go('decks', {
                                                                                      deckId: d.id
                                                                                  })
                                                                            : undefined
                                                                    }
                                                                >
                                                                    {d.name}{' '}
                                                                    <small>({d.count})</small>
                                                                </DeckName>
                                                            ))}
                                                        {!r.decks.size && '—'}
                                                    </td>
                                                    <td>{window.liveData.displayDate(r.last)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <>
                            <p className="meta-coverage">
                                Listas registradas neste recorte. Esta amostra não representa todas
                                as participações do formato.
                            </p>
                            <div className="meta-list-cards">
                                {lists.slice(start, start + size).map((r) => (
                                    <ListCard
                                        className="meta-list-card"
                                        key={r.id}
                                        onClick={canOpenLists ? () => openList(r) : undefined}
                                    >
                                        <strong>{r.deck?.name || 'Deck não informado'}</strong>
                                        <span>
                                            {r.player?.name || 'Jogador não informado'} ·{' '}
                                            {r.placement}º lugar
                                        </span>
                                        <span>
                                            {
                                                events.find((e) => e.id === String(r.tournament_id))
                                                    ?.date
                                            }{' '}
                                            {canOpenLists ? '· Abrir lista ↗' : ''}
                                        </span>
                                    </ListCard>
                                ))}
                            </div>
                        </>
                    )}
                    {!total && (
                        <p className="meta-empty">Nenhum registro encontrado neste recorte.</p>
                    )}
                    {!!total && (
                        <Pagination
                            page={actualPage}
                            pages={Math.max(1, Math.ceil(total / size))}
                            size={size}
                            total={total}
                            onPage={setPage}
                            onSize={setSize}
                        />
                    )}
                    <details className="meta-methodology">
                        <summary>Como interpretar os dados</summary>
                        <p>
                            {model.complete.size}/{events.length} torneios com classificação
                            completa. Decks identificados em {model.known.length}/
                            {model.deckExpected} participações elegíveis. Eventos sem deck ficam
                            fora do metagame.
                        </p>
                        <p>
                            Os valores entre parênteses mostram resultado/base da taxa. * indica
                            menos de cinco participações elegíveis. Semanas começam na
                            segunda-feira. As listas disponíveis representam somente a amostra
                            cadastrada.
                        </p>
                        <p>
                            Popularidade conta participações com deck identificado. Conversão é a
                            proporção de participações que terminaram em título, somente em
                            classificações completas. Top 4 considera torneios completos com pelo
                            menos 8 participantes. As taxas sempre mostram sua base; uma amostra
                            pequena exige cautela. Participações e jogadores únicos são medidas
                            diferentes. Não calculamos taxa de vitória por partida ou matchups
                            porque os registros não incluem confrontos individuais.
                        </p>
                    </details>
                    {selected && (
                        <Dialog title={selected.name} wide onClose={() => setDetail('')}>
                            <div className="meta-deck-profile">
                                <Portrait image={selected.image} className="art meta-deck-art" />
                                <div className="meta-deck-profile-info">
                                    <div className="meta-profile-identity">
                                        <DeckColors colors={selected.colors} />
                                        {selected.card && (
                                            <span className="meta-card-code">{selected.card}</span>
                                        )}
                                    </div>
                                    <MetaProfileSummary
                                        count={selected.count}
                                        share={percent(selected.count, model.known.length)}
                                        players={selected.players.size}
                                        titles={selected.titles}
                                    />
                                </div>
                            </div>
                            <h3>Evolução mensal no formato</h3>
                            <div className="meta-detail-table-scroll">
                                <table className="meta-detail-table">
                                    <thead>
                                        <tr>
                                            <th>Mês</th>
                                            <th>Participações</th>
                                            <th>Meta %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {months
                                            .slice()
                                            .reverse()
                                            .map((m) => {
                                                const a = analyzeMeta(
                                                    base.filter((e) => e.isoDate.startsWith(m)),
                                                    records
                                                );
                                                const count =
                                                    a.decks.find((d) => d.id === selected.id)
                                                        ?.count || 0;
                                                return (
                                                    <tr key={m}>
                                                        <th>{monthLabel(m)}</th>
                                                        <td>{count}</td>
                                                        <td>{percent(count, a.known.length)}</td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                            <h3>Resultados e listas</h3>
                            <div className="meta-detail-table-scroll">
                                <table className="meta-detail-table">
                                    <thead>
                                        <tr>
                                            <th>Pos.</th>
                                            <th>Jogador</th>
                                            <th>Torneio</th>
                                            <th>Lista</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {model.known
                                            .filter((r) => r.deck_id === selected.id)
                                            .sort((a, b) =>
                                                (
                                                    events.find(
                                                        (e) => e.id === String(b.tournament_id)
                                                    )?.isoDate || ''
                                                ).localeCompare(
                                                    events.find(
                                                        (e) => e.id === String(a.tournament_id)
                                                    )?.isoDate || ''
                                                )
                                            )
                                            .slice(0, 20)
                                            .map((r) => {
                                                const event = events.find(
                                                    (e) => e.id === String(r.tournament_id)
                                                );
                                                return (
                                                    <tr key={r.id}>
                                                        <td>{r.placement}º</td>
                                                        <th>
                                                            {r.player?.name ||
                                                                'Jogador não informado'}
                                                        </th>
                                                        <td>
                                                            <button
                                                                className="meta-table-link"
                                                                onClick={() =>
                                                                    go('tournaments', {
                                                                        tournament: String(
                                                                            r.tournament_id
                                                                        )
                                                                    })
                                                                }
                                                            >
                                                                {event?.date} ·{' '}
                                                                {event?.store || 'Abrir torneio'}
                                                            </button>
                                                        </td>
                                                        <td>
                                                            {canOpenLists && (
                                                                <button
                                                                    className="meta-table-link"
                                                                    onClick={() => openList(r)}
                                                                >
                                                                    {r.decklists?.length
                                                                        ? 'Ver lista ↗'
                                                                        : 'Cadastrar ↗'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </Dialog>
                    )}
                </>
            )}
        </section>
    );
}
