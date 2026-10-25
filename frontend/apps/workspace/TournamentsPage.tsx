import { useEffect, useState } from 'react';
import type { MicroContext, Tournament } from '../../contracts';
import { useData, Loader } from '../../shared/runtime';
import { PageHeading } from '../../shared/PageHeading';
import { Portrait, StoreLogo } from '../../shared/cards';
import { Select } from '../../shared/Select';
import { ActionMenu, Dialog, EmptyState, ListToolbar, Pagination } from '../../shared/ListPage';
import {
    normalizeSearch,
    loadTournamentResults,
    type TournamentResultRecord
} from './catalog-service';
import { paginateTournamentWeeks } from './tournament-weeks';
import { useSiteAuth } from '../../shared/site-auth';

export interface TournamentCommand {
    kind: 'create' | 'edit';
    id?: string;
    date?: string;
    token: number;
}
export function TournamentsPage({
    context,
    onEditor
}: {
    context: MicroContext;
    onEditor(command: TournamentCommand): void;
}) {
    const account = useSiteAuth();
    const snapshot = useData(context.data);
    const [query, setQuery] = useState(''),
        [period, setPeriod] = useState(''),
        [store, setStore] = useState(''),
        [format, setFormat] = useState(''),
        [type, setType] = useState(''),
        [social, setSocial] = useState(''),
        [order, setOrder] = useState('recent'),
        [view, setView] = useState('list'),
        [page, setPage] = useState(1),
        [size, setSize] = useState(20),
        [selected, setSelected] = useState<Tournament | null>(null);
    const data = snapshot.data;
    const months = [...new Set(data.events.map((event) => event.isoDate.slice(0, 7)))]
        .sort()
        .reverse();
    const openEditor = (kind: 'create' | 'edit', id?: string, date?: string) => {
        if (account.enabled && !account.isAdmin) {
            window.digistatsAuth?.open(account.user ? 'profile' : 'login');
            return;
        }
        setSelected(null);
        onEditor({ kind, id, date, token: Date.now() });
    };
    useEffect(() => {
        if (!context.active) {
            setSelected(null);
            return;
        }
        setFormat(context.route.params.get('format') || '');
        setStore(context.route.params.get('store') || '');
        setPeriod(context.route.params.get('period') || '');
        if (context.route.params.get('create') === '1') openEditor('create');
        if (context.route.params.has('edit')) openEditor('edit', context.route.params.get('edit')!);
    }, [context.route, context.active]);
    useEffect(() => {
        if (!context.active) return;
        const id =
            context.route.params.get('tournament') ||
            context.route.params.get('returnTournamentId');
        if (id) setSelected(data.events.find((event) => String(event.id) === id) || null);
    }, [context.route, context.active, data.events]);
    useEffect(() => setPage(1), [query, period, store, format, type, social, order, size]);
    const events = window.liveData
        .eventsForFormat(data.events, format)
        .filter(
            (event) =>
                normalizeSearch(
                    `${event.title} ${event.store} ${event.results.map((result) => `${result.name} ${result.deck}`).join(' ')}`
                ).includes(normalizeSearch(query)) &&
                (!store || String(event.storeId) === store) &&
                (!type || event.title === type) &&
                (!social || (social === 'with') === !!event.instagram) &&
                (!period ||
                    (period.startsWith('week:')
                        ? event.isoDate >= period.slice(5) &&
                          event.isoDate <= window.liveData.weekEnd(period.slice(5))
                        : event.isoDate.startsWith(period.replace('month:', ''))))
        )
        .sort(
            order === 'players'
                ? (a, b) => b.players - a.players || b.isoDate.localeCompare(a.isoDate)
                : (a, b) => b.isoDate.localeCompare(a.isoDate) || Number(b.id) - Number(a.id)
        );
    const paging = paginateTournamentWeeks(events, page, size);
    return (
        <section className="catalog-app">
            <div className="catalog-heading">
                <PageHeading
                    eyebrow="Resultados da comunidade"
                    title="Torneios"
                    description="Consulte os eventos, resultados e decklists em um só lugar."
                />
                <button className="button primary" onClick={() => openEditor('create')}>
                    + Adicionar torneio
                </button>
            </div>
            <ListToolbar
                query={query}
                onQuery={setQuery}
                placeholder="Buscar torneio, deck ou jogador"
                count={Number(!!format) + Number(!!type) + Number(!!social)}
                children={
                    <>
                        <Select
                            label="Período"
                            value={period}
                            onChange={setPeriod}
                            options={[
                                { value: '', label: 'Todos os períodos' },
                                ...(period.startsWith('week:')
                                    ? [
                                          {
                                              value: period,
                                              label: `Semana de ${window.liveData.displayDate(period.slice(5))}`
                                          }
                                      ]
                                    : []),
                                ...months.map((month) => ({
                                    value: `month:${month}`,
                                    label: new Date(`${month}-01T12:00:00`).toLocaleDateString(
                                        'pt-BR',
                                        { month: 'long', year: 'numeric' }
                                    )
                                }))
                            ]}
                        />
                        <Select
                            label="Loja"
                            value={store}
                            onChange={setStore}
                            options={[
                                { value: '', label: 'Todas as lojas' },
                                ...data.stores.map((store) => ({
                                    value: String(store.id),
                                    label: store.name
                                }))
                            ]}
                        />
                    </>
                }
                filters={
                    <>
                        <Select
                            label="Formato"
                            value={format}
                            onChange={setFormat}
                            options={[
                                { value: '', label: 'Todos os formatos' },
                                ...data.formats.map((format) => ({
                                    value: format.code,
                                    label: window.liveData.formatLabel(format.code, data.formats)
                                }))
                            ]}
                        />
                        <Select
                            label="Tipo do torneio"
                            value={type}
                            onChange={setType}
                            options={[
                                { value: '', label: 'Todos os tipos' },
                                ...[...new Set(data.events.map((event) => event.title))]
                                    .sort()
                                    .map((title) => ({ value: title, label: title }))
                            ]}
                        />
                        <Select
                            label="Link do Instagram"
                            value={social}
                            onChange={setSocial}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'with', label: 'Com link' },
                                { value: 'without', label: 'Sem link' }
                            ]}
                        />
                        <Select
                            label="Ordenação"
                            value={order}
                            onChange={setOrder}
                            options={[
                                { value: 'recent', label: 'Mais recentes' },
                                { value: 'players', label: 'Mais participantes' }
                            ]}
                        />
                        <button
                            className="button secondary"
                            onClick={() => {
                                setPeriod('');
                                setStore('');
                                setFormat('');
                                setType('');
                                setSocial('');
                                setQuery('');
                            }}
                        >
                            Limpar filtros
                        </button>
                    </>
                }
            />
            <div className="catalog-list-heading">
                <p className="catalog-count">{events.length} torneios encontrados</p>
                <div className="catalog-view-switch" aria-label="Visualização">
                    <button
                        className={`button secondary${view === 'list' ? ' is-active' : ''}`}
                        aria-pressed={view === 'list'}
                        onClick={() => setView('list')}
                    >
                        Lista
                    </button>
                    <button
                        className={`button secondary${view === 'calendar' ? ' is-active' : ''}`}
                        aria-pressed={view === 'calendar'}
                        onClick={() => setView('calendar')}
                    >
                        Calendário
                    </button>
                </div>
            </div>
            {snapshot.error && (
                <div className="list-error" role="alert">
                    {snapshot.error}
                    <button
                        className="button secondary"
                        onClick={() => void context.data.refresh()}
                    >
                        Tentar novamente
                    </button>
                </div>
            )}
            {snapshot.loading && !data.events.length ? (
                <Loader text="Carregando torneios…" />
            ) : view === 'calendar' ? (
                <TournamentCalendar
                    events={events}
                    month={
                        period.startsWith('month:')
                            ? period.slice(6)
                            : months[0] || new Date().toISOString().slice(0, 7)
                    }
                    onDetails={setSelected}
                    onCreate={(date) => openEditor('create', undefined, date)}
                />
            ) : (
                <>
                    <div className="tournament-weeks">
                        {paging.weeks.map((week) => (
                            <section
                                className="tournament-week"
                                key={week.start}
                                aria-labelledby={`tournament-week-${week.start}`}
                            >
                                <header className="tournament-week-heading">
                                    <h2 id={`tournament-week-${week.start}`}>
                                        Semana de{' '}
                                        {week.start
                                            .split('-')
                                            .reverse()
                                            .slice(
                                                0,
                                                week.start.slice(0, 4) === week.end.slice(0, 4)
                                                    ? 2
                                                    : 3
                                            )
                                            .join('/')}{' '}
                                        a {week.end.split('-').reverse().join('/')}
                                    </h2>
                                    <span>
                                        {week.events.length}{' '}
                                        {week.events.length === 1 ? 'torneio' : 'torneios'}
                                    </span>
                                </header>
                                <div className="catalog-list tournament-list-grid">
                                    {week.events.map((event) => (
                                        <article
                                            className="catalog-row tournament-list-row"
                                            key={event.id}
                                        >
                                            <button
                                                className="catalog-item"
                                                onClick={() => setSelected(event)}
                                            >
                                                <time
                                                    className="tournament-list-date"
                                                    dateTime={event.isoDate}
                                                >
                                                    <strong>{event.date.split('/')[0]}</strong>
                                                    <span>
                                                        {new Date(
                                                            `${event.isoDate}T12:00:00`
                                                        ).toLocaleDateString('pt-BR', {
                                                            month: 'short',
                                                            year: '2-digit'
                                                        })}
                                                    </span>
                                                </time>
                                                <StoreLogo logo={event.logo} name={event.store} />
                                                <span className="catalog-identity">
                                                    <strong>{event.title}</strong>
                                                    <span>{event.store}</span>
                                                </span>
                                                <span className="tournament-list-meta">
                                                    <span className="catalog-badge">
                                                        {event.format || '—'}
                                                    </span>
                                                    <span>{event.players} jogadores</span>
                                                    {event.team && (
                                                        <span>{event.players / 2} duplas</span>
                                                    )}
                                                </span>
                                                <span className="tournament-list-winner">
                                                    {(event.winner?.members || [event.winner]).map(
                                                        (member, index) => (
                                                            <Portrait
                                                                key={index}
                                                                image={member?.image}
                                                            />
                                                        )
                                                    )}
                                                    <span>
                                                        <strong>
                                                            {event.winner?.name || 'Sem resultados'}
                                                        </strong>
                                                        {event.team && event.winner?.members ? (
                                                            <span className="tournament-list-decks">
                                                                {event.winner.members.map(
                                                                    (member, index) => (
                                                                        <span
                                                                            key={member.id || index}
                                                                        >
                                                                            {index ? '& ' : ''}
                                                                            {member.deck}
                                                                        </span>
                                                                    )
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span>
                                                                {event.deckless
                                                                    ? 'Vencedor'
                                                                    : event.winner?.deck ||
                                                                      'Classificação pendente'}
                                                            </span>
                                                        )}
                                                    </span>
                                                </span>
                                            </button>
                                            <ActionMenu label={`${event.title} ${event.date}`}>
                                                <button onClick={() => setSelected(event)}>
                                                    Ver resultados
                                                </button>
                                                <button
                                                    onClick={() => openEditor('edit', event.id)}
                                                >
                                                    Editar torneio
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        context.navigate('posts', {
                                                            tournament: event.id
                                                        })
                                                    }
                                                >
                                                    Criar post
                                                </button>
                                                {event.instagram && (
                                                    <a
                                                        href={event.instagram}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Abrir Instagram ↗
                                                    </a>
                                                )}
                                            </ActionMenu>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                    {!events.length && !snapshot.error && (
                        <EmptyState>
                            Nenhum torneio encontrado. Tente outra busca ou limpe os filtros.
                        </EmptyState>
                    )}
                    <div className="tournament-week-pagination">
                        <p role="status">
                            {events.length
                                ? `${paging.start}–${paging.end} de ${events.length}`
                                : 'Nenhum resultado'}
                        </p>
                        <Pagination
                            compact
                            page={paging.page}
                            pages={paging.totalPages}
                            size={size}
                            total={events.length}
                            onPage={setPage}
                            onSize={setSize}
                        />
                    </div>
                </>
            )}
            {selected && (
                <TournamentDetails
                    event={selected}
                    context={context}
                    onClose={() => setSelected(null)}
                    onEdit={() => openEditor('edit', selected.id)}
                />
            )}
        </section>
    );
}
function TournamentCalendar({
    events,
    month,
    onDetails,
    onCreate
}: {
    events: Tournament[];
    month: string;
    onDetails(event: Tournament): void;
    onCreate(date: string): void;
}) {
    const [visible, setVisible] = useState(month);
    useEffect(() => setVisible(month), [month]);
    const first = new Date(`${visible}-01T12:00:00`),
        offset = (first.getDay() + 6) % 7;
    const days = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(first);
        date.setDate(index - offset + 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    function move(delta: number) {
        const date = new Date(first);
        date.setMonth(date.getMonth() + delta);
        setVisible(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return (
        <section className="tournament-calendar">
            <header>
                <button
                    className="button secondary"
                    aria-label="Mês anterior"
                    onClick={() => move(-1)}
                >
                    ‹
                </button>
                <h2>{first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
                <button
                    className="button secondary"
                    aria-label="Próximo mês"
                    onClick={() => move(1)}
                >
                    ›
                </button>
            </header>
            <div className="tournament-calendar-grid">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                    <strong key={day} className="calendar-weekday">
                        {day}
                    </strong>
                ))}
                {days.map((date) => (
                    <div
                        key={date}
                        className={`calendar-day${date.startsWith(visible) ? '' : ' is-outside'}`}
                    >
                        <button
                            className="calendar-day-number"
                            aria-label={`Cadastrar torneio em ${window.liveData.displayDate(date)}`}
                            onClick={() => onCreate(date)}
                        >
                            {Number(date.slice(8))}
                            <span aria-hidden="true">+</span>
                        </button>
                        {events
                            .filter((event) => event.isoDate === date)
                            .map((event) => (
                                <button
                                    className="calendar-event"
                                    key={event.id}
                                    onClick={() => onDetails(event)}
                                >
                                    <strong>{event.store}</strong>
                                    <span>
                                        {event.title} · {event.players} jogadores
                                        {event.team ? ` · ${event.players / 2} duplas` : ''}
                                    </span>
                                </button>
                            ))}
                    </div>
                ))}
            </div>
        </section>
    );
}
function TournamentDetails({
    event,
    context,
    onClose,
    onEdit
}: {
    event: Tournament;
    context: MicroContext;
    onClose(): void;
    onEdit(): void;
}) {
    const [ids, setIds] = useState<TournamentResultRecord[]>([]),
        [error, setError] = useState(''),
        [exportText, setExportText] = useState(''),
        [exportNotice, setExportNotice] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        loadTournamentResults(event, context.data.getSnapshot().data.events, controller.signal)
            .then(setIds)
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, [event.id]);
    const results = ids.length
        ? ids.map((row) => ({
              placement: row.placement,
              name:
                  row.player?.name ||
                  event.results.find((result) => result.id === row.id)?.name ||
                  event.results.find((result) => result.placement === row.placement)?.name ||
                  'Jogador não informado',
              deck:
                  row.deck?.name ||
                  event.results.find((result) => result.id === row.id)?.deck ||
                  event.results.find((result) => result.placement === row.placement)?.deck ||
                  'Deck não informado',
              id: row.id,
              image: event.results.find((result) => result.id === row.id)?.image || ''
          }))
        : event.results;
    const resultGroups = event.team
        ? [...new Set(results.map((result) => result.placement))].map((placement) =>
              results.filter((result) => result.placement === placement)
          )
        : results.map((result) => [result]);
    const renderMember = (result: (typeof results)[number]) => {
        const row =
            ids.find((row) => row.id === result.id) ||
            ids.find(
                (row) => row.placement === result.placement && row.player?.name === result.name
            ) ||
            (!event.team ? ids.find((row) => row.placement === result.placement) : undefined);
        return (
            <>
                {!event.deckless && <Portrait image={result.image} />}
                <div className="catalog-result-identity">
                    <strong>{result.name}</strong>
                    {!event.deckless && <span>{result.deck}</span>}
                </div>
                {!event.deckless && row && (
                    <button
                        className="button secondary"
                        onClick={() =>
                            context.navigate('builder', {
                                resultId: String(row.id),
                                deck: result.deck,
                                player: result.name,
                                store: event.store,
                                date: event.isoDate,
                                returnTournamentId: event.id,
                                returnView: 'tournaments'
                            })
                        }
                    >
                        Decklist ↗
                    </button>
                )}
            </>
        );
    };
    return (
        <Dialog title={`${event.title} · ${event.date}`} onClose={onClose} wide>
            <div className="tournament-detail-heading">
                <StoreLogo logo={event.logo} name={event.store} />
                <div>
                    <strong>{event.store}</strong>
                    <span>
                        {event.players} jogadores
                        {event.team ? ` · ${event.players / 2} duplas` : ''} · {event.format}
                    </span>
                </div>
            </div>
            <div className="catalog-detail-actions">
                <button className="button secondary" onClick={onEdit}>
                    Editar evento e resultados
                </button>
                <button
                    className="button primary"
                    onClick={() => context.navigate('posts', { tournament: event.id })}
                >
                    Criar post ↗
                </button>
                {event.instagram && (
                    <a
                        className="button secondary"
                        href={event.instagram}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Instagram ↗
                    </a>
                )}
                {!event.team && (
                    <button
                        className="button secondary"
                        disabled={!ids.length}
                        onClick={async () => {
                            try {
                                await context.loadScript('config/digilab-export.js');
                                const rows = window.digilabExport.normalizeDigilabExportRows(ids);
                                setExportText(window.digilabExport.buildDigilabClipboardText(rows));
                                const missing = window.digilabExport.getMissingMemberNames(rows);
                                setExportNotice(
                                    missing.length
                                        ? `ID Bandai não cadastrado: ${missing.join(', ')}.`
                                        : 'Dados prontos para copiar para o DigiLab.'
                                );
                            } catch {
                                setExportNotice(
                                    'Não foi possível preparar a exportação. Tente novamente.'
                                );
                            }
                        }}
                    >
                        Exportar para DigiLab
                    </button>
                )}
            </div>
            {exportNotice && (
                <p role="status" className="muted">
                    {exportNotice}
                </p>
            )}
            {exportText && (
                <div className="catalog-export">
                    <label>
                        Classificação para DigiLab
                        <textarea readOnly rows={Math.min(ids.length + 1, 10)} value={exportText} />
                    </label>
                    <button
                        className="button secondary"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(exportText);
                                setExportNotice('Classificação copiada.');
                            } catch {
                                setExportNotice('Selecione e copie o texto acima.');
                            }
                        }}
                    >
                        Copiar classificação
                    </button>
                </div>
            )}
            {error && (
                <p className="list-error" role="alert">
                    Não foi possível carregar os links de decklist. {error}
                </p>
            )}
            <div className="catalog-results">
                {resultGroups.map((members, index) => {
                    const placement = members[0].placement;
                    return (
                        <article
                            className={`catalog-result-row${event.team ? ' catalog-team-result-row' : ''}`}
                            key={`${placement}:${index}`}
                        >
                            <span className={`catalog-placement rank-${placement}`}>
                                {placement}º
                            </span>
                            {event.team ? (
                                <div className="catalog-team-members">
                                    {members.map((member, memberIndex) => (
                                        <div
                                            className="catalog-team-member"
                                            key={member.id || memberIndex}
                                        >
                                            {renderMember(member)}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                renderMember(members[0])
                            )}
                        </article>
                    );
                })}
            </div>
            {!results.length && <EmptyState>Classificação ainda não registrada.</EmptyState>}
        </Dialog>
    );
}
