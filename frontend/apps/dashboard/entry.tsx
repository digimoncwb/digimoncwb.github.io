import { useEffect, useMemo, useState } from 'react';
import type { MicroContext, Tournament, StatisticsRow } from '../../contracts';
import { mountReact, useData, Loader } from '../../shared/runtime';
import { EventCard, EventDialog, Portrait, Metrics } from '../../shared/cards';
import { RecentTournaments } from './RecentTournaments';
import { PageHeading } from '../../shared/PageHeading';
import { Select } from '../../shared/Select';
import { featuredDecks, latestStoreTournaments, overviewWeekEvents } from './overview-model';
import { MetagamePage } from './MetagamePage';
import { OverviewHighlights } from './OverviewHighlights';
export const apiVersion = 1;
export const mount = (element: HTMLElement, context: MicroContext) =>
    mountReact(DashboardRouter, element, context);
function DashboardRouter({ context }: { context: MicroContext }) {
    return context.route.name === 'meta' ? (
        <MetagamePage context={context} />
    ) : (
        <Dashboard context={context} />
    );
}
function Dashboard({ context }: { context: MicroContext }) {
    const snapshot = useData(context.data);
    const { data } = snapshot;
    const [format, setFormat] = useState(''),
        [store, setStore] = useState(''),
        [period, setPeriod] = useState(''),
        [query, setQuery] = useState(''),
        [order, setOrder] = useState('recent'),
        [limit, setLimit] = useState(24),
        [analysis, setAnalysis] = useState('participation'),
        [selected, setSelected] = useState<Tournament | null>(null);
    const formats = useMemo(
        () =>
            data.formats.filter((format) =>
                data.events.some((event) => event.format === format.code)
            ),
        [data]
    );
    useEffect(() => {
        if (context.route.params.has('format')) setFormat(context.route.params.get('format')!);
        if (context.route.params.has('store')) setStore(context.route.params.get('store')!);
        if (context.route.params.has('period')) setPeriod(context.route.params.get('period')!);
    }, [context.route]);
    useEffect(() => setLimit(24), [format, store, period, query, order]);
    useEffect(() => {
        if (!context.active) setSelected(null);
    }, [context.active]);
    const baseEvents = data.events.filter((event) => {
        if (!period) return true;
        if (period.startsWith('month:')) return event.isoDate.startsWith(period.slice(6));
        return (
            event.isoDate >= period.slice(5) &&
            event.isoDate <= window.liveData.weekEnd(period.slice(5))
        );
    });
    const latestWeek = overviewWeekEvents(data.events);
    const events =
        context.route.name === 'overview'
            ? latestWeek
            : window.liveData
                  .eventsForFormat(baseEvents, format)
                  .filter((event) => !store || event.storeId === store);
    const deckRows = useMemo(() => featuredDecks(events), [events]);
    const recentEvents = latestStoreTournaments(data.events, data.stores);
    const total = deckRows.reduce((sum, row) => sum + row.count, 0);
    const weeks = [
        ...new Set(data.events.map((event) => window.liveData.weekStart(event.isoDate)))
    ];
    const months = [...new Set(data.events.map((event) => event.isoDate.slice(0, 7)))];
    const filtered = events
        .filter((event) =>
            `${event.store} ${event.title} ${event.results.map((result) => `${result.deck} ${result.name}`).join(' ')}`
                .toLocaleLowerCase('pt-BR')
                .includes(query.toLocaleLowerCase('pt-BR'))
        )
        .sort(
            order === 'players'
                ? (a, b) => b.players - a.players
                : (a, b) => b.isoDate.localeCompare(a.isoDate) || Number(b.id) - Number(a.id)
        );
    const analysisRows = window.resultStatistics.analyze(events);
    const go = (route: 'meta' | 'tournaments', params: Record<string, string> = {}) =>
        context.navigate(route, params);
    const periodLabel = period
        ? period.replace('week:', 'Semana de ').replace('month:', 'Mês ')
        : 'Todos os períodos';
    return (
        <section className={`view${context.route.name === 'overview' ? ' overview-view' : ''}`}>
            {snapshot.loading && data.events.length === 0 ? (
                <Loader text="Carregando torneios…" />
            ) : null}
            {snapshot.error && (
                <div role="alert">
                    <p>{snapshot.error}</p>
                    <button className="text-action" onClick={() => void context.data.refresh()}>
                        Tentar novamente
                    </button>
                </div>
            )}
            {context.route.name === 'overview' ? (
                <>
                    <h1 className="sr-only">Visão geral</h1>
                    <div className="section-heading overview-tournaments-heading">
                        <div className="overview-section-title">
                            <h2>Últimos torneios</h2>
                        </div>
                        <div className="overview-format-actions">
                            <a
                                href={context.href('tournaments')}
                                onClick={(e) => {
                                    e.preventDefault();
                                    go('tournaments');
                                }}
                            >
                                Ver todos ↗
                            </a>
                        </div>
                    </div>
                    <RecentTournaments
                        events={recentEvents}
                        latestTournamentId={latestWeek[0]?.id}
                        onDetails={setSelected}
                    />
                    {!events.length && !snapshot.loading && (
                        <p className="muted">Nenhum torneio cadastrado ainda.</p>
                    )}
                    <OverviewHighlights context={context} />
                </>
            ) : (
                <>
                    <PageHeading title={context.route.name === 'meta' ? 'Metagame' : 'Torneios'} />
                    <div className="data-toolbar">
                        <Select
                            label="Período"
                            value={period}
                            onChange={setPeriod}
                            options={[
                                { value: '', label: 'Todos os períodos' },
                                ...weeks.map((week) => ({
                                    value: `week:${week}`,
                                    label: `Semana ${window.liveData.displayDate(week)} — ${window.liveData.displayDate(window.liveData.weekEnd(week))}`
                                })),
                                ...months.map((month) => ({
                                    value: `month:${month}`,
                                    label: `Mês ${month.slice(5)}/${month.slice(0, 4)}`
                                }))
                            ]}
                        />
                        <button
                            className="button secondary"
                            disabled={snapshot.loading}
                            onClick={() => void context.data.refresh()}
                        >
                            {snapshot.loading ? 'Atualizando…' : 'Atualizar dados'}
                        </button>
                        <p className="muted" role="status">
                            {data.events.length} torneios cadastrados
                        </p>
                    </div>
                    {context.route.name === 'tournaments' && (
                        <div className="section-heading">
                            <a
                                className="button primary"
                                href={context.href('manage', { create: '1' })}
                                onClick={(e) => {
                                    e.preventDefault();
                                    context.navigate('manage', { create: '1' });
                                }}
                            >
                                Cadastrar torneio
                            </a>
                            <a
                                className="button secondary"
                                href={context.href('manage')}
                                onClick={(e) => {
                                    e.preventDefault();
                                    context.navigate('manage');
                                }}
                            >
                                Gerenciar torneios e resultados
                            </a>
                        </div>
                    )}
                    <div className="filter-toolbar">
                        {context.route.name === 'tournaments' && (
                            <label>
                                Buscar torneio, deck ou jogador
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Ex.: Semanal ou Red Hybrid"
                                />
                            </label>
                        )}
                        <Select
                            label="Formato"
                            value={format}
                            onChange={setFormat}
                            options={[
                                { value: '', label: 'Todos os formatos' },
                                ...formats.map((format) => ({
                                    value: format.code,
                                    label:
                                        format.name && format.name !== format.code
                                            ? `${format.name} - ${format.code}`
                                            : format.code
                                }))
                            ]}
                        />
                        <Select
                            label="Loja"
                            value={store}
                            onChange={setStore}
                            options={[
                                { value: '', label: 'Todas as lojas' },
                                ...data.stores.map((shop) => ({
                                    value: String(shop.id),
                                    label: shop.name
                                }))
                            ]}
                        />
                        {context.route.name === 'tournaments' && (
                            <Select
                                label="Ordenar"
                                value={order}
                                onChange={setOrder}
                                options={[
                                    { value: 'recent', label: 'Mais recentes' },
                                    { value: 'players', label: 'Mais participantes' }
                                ]}
                            />
                        )}
                    </div>
                    {context.route.name === 'tournaments' ? (
                        <>
                            <p className="muted" role="status">
                                {filtered.length} torneios · {periodLabel}
                            </p>
                            <div id="allTournaments" className="tournament-grid">
                                {filtered.slice(0, limit).map((event) => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        context={context}
                                        onDetails={setSelected}
                                    />
                                ))}
                            </div>
                            {!filtered.length && !snapshot.loading && (
                                <p>Nenhum torneio encontrado.</p>
                            )}
                            {filtered.length > limit && (
                                <button
                                    className="button secondary"
                                    onClick={() => setLimit(limit + 24)}
                                >
                                    Carregar mais torneios
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <Metrics
                                rows={[
                                    [
                                        'Resultados registrados',
                                        total,
                                        `${events.reduce((sum, event) => sum + event.players, 0)} entradas nos torneios`
                                    ],
                                    ['Torneios', events.length, periodLabel],
                                    [
                                        'Deck mais jogado',
                                        deckRows[0]?.deck || '—',
                                        deckRows[0]
                                            ? `${((deckRows[0].count / total) * 100).toFixed(1).replace('.', ',')}% dos resultados`
                                            : 'Sem resultados no período'
                                    ]
                                ]}
                            />
                            <div
                                className="analysis-tabs"
                                role="tablist"
                                aria-label="Análise de resultados"
                            >
                                {[
                                    ['participation', 'Participação'],
                                    ['decks', 'Desempenho dos decks'],
                                    ['players', 'Jogadores']
                                ].map(([value, label]) => (
                                    <button
                                        key={value}
                                        role="tab"
                                        aria-selected={analysis === value}
                                        onClick={() => setAnalysis(value)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {analysis === 'participation' ? (
                                <div className="meta-panel">
                                    <div className="section-heading">
                                        <h2>O que está na mesa</h2>
                                        <span>
                                            {total} resultados · {events.length} torneios
                                        </span>
                                    </div>
                                    {deckRows.map((row, index) => (
                                        <div key={row.deck} className="meta-row dashboard-meta-row">
                                            <span className="meta-rank">
                                                {String(index + 1).padStart(2, '0')}
                                            </span>
                                            <Portrait image={row.image} />
                                            <strong>{row.deck}</strong>
                                            <div className="meta-bar">
                                                <span
                                                    style={{
                                                        width: `${(row.count / total) * 100}%`
                                                    }}
                                                />
                                            </div>
                                            <span className="meta-number">
                                                {((row.count / total) * 100)
                                                    .toFixed(1)
                                                    .replace('.', ',')}
                                                %<small>{row.count} resultados</small>
                                            </span>
                                        </div>
                                    ))}
                                    {!deckRows.length && (
                                        <p className="muted">
                                            Nenhum resultado encontrado com estes filtros.
                                        </p>
                                    )}
                                    <p className="muted">
                                        Popularidade por participação em torneios. Estes dados não
                                        representam taxa de vitória por partida.
                                    </p>
                                </div>
                            ) : (
                                <div className="surface">
                                    <h2>
                                        {analysis === 'players'
                                            ? 'Resultados dos jogadores'
                                            : 'Conquistas por deck'}
                                    </h2>
                                    <StatisticsTable
                                        rows={
                                            analysis === 'players'
                                                ? analysisRows.players
                                                : analysisRows.decks
                                        }
                                        players={analysis === 'players'}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
            <EventDialog event={selected} onClose={() => setSelected(null)} context={context} />
        </section>
    );
}
function StatisticsTable({ rows, players }: { rows: StatisticsRow[]; players: boolean }) {
    return rows.length ? (
        <div className="analysis-table-scroll">
            <table className="analysis-table">
                <thead>
                    <tr>
                        <th>{players ? 'Jogador' : 'Deck'}</th>
                        <th>Títulos</th>
                        <th>Top 3</th>
                        <th>Participações</th>
                        {!players && <th>Conversão em títulos</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.name}>
                            <th scope="row">
                                <div className="analysis-name">
                                    {!players && <Portrait image={row.image} />}
                                    <span>{row.name}</span>
                                </div>
                            </th>
                            <td>{row.titles}</td>
                            <td>{row.top3}</td>
                            <td>{row.count}</td>
                            {!players && (
                                <td>
                                    {row.eligible
                                        ? `${((row.titles / row.eligible) * 100).toFixed(1).replace('.', ',')}%`
                                        : '—'}
                                    <small>{row.eligible} participações elegíveis</small>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    ) : (
        <p className="muted">Nenhum resultado encontrado com estes filtros.</p>
    );
}
