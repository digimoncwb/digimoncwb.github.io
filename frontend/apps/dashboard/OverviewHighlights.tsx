import type { MicroContext } from '../../contracts';
import { useData, Loader } from '../../shared/runtime';
import { Portrait } from '../../shared/cards';
import { analyzeMeta, currentFormat, overviewFourWeeks } from './metagame-model';
import './overview-highlights.css';
import { useMetaResults } from './useMetaResults';

export function OverviewHighlights({ context }: { context: MicroContext }) {
    const { data, updatedAt } = useData(context.data);
    const { records, loading, error, retry } = useMetaResults(context, updatedAt);
    const format = currentFormat(data.formats, data.events),
        range = overviewFourWeeks(data.events),
        model = analyzeMeta(range.events, records);
    const played = [...model.decks]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 3);
    const titles = [...model.decks]
        .filter((r) => r.titles > 0)
        .sort((a, b) => b.titles - a.titles || b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 3);
    const top = [...model.decks]
        .filter((r) => r.topEligible > 0 && r.top4 >= 2)
        .sort(
            (a, b) =>
                b.top4 / b.topEligible - a.top4 / a.topEligible ||
                b.topEligible - a.topEligible ||
                a.name.localeCompare(b.name)
        )
        .slice(0, 3);
    const columns = [
        { key: 'played', title: 'Mais jogados', rows: played },
        { key: 'titles', title: 'Mais títulos', rows: titles },
        { key: 'top4', title: 'Conversão em Top 4', rows: top }
    ];
    const topEligibleEvents = new Set(
        range.events
            .filter((event) => event.players >= 8 && model.complete.has(event.id))
            .map((event) => event.id)
    );
    return (
        <section className="overview-featured overview-highlights">
            <div className="section-heading">
                <div className="overview-section-title">
                    <span className="overview-eyebrow">Metagame · últimas 4 semanas</span>
                    <h2>Decks em destaque</h2>
                </div>
                <a
                    href={context.href('meta', { format })}
                    onClick={(e) => {
                        e.preventDefault();
                        context.navigate('meta', { format });
                    }}
                >
                    Ver metagame ↗
                </a>
            </div>
            {loading ? (
                <Loader text="Carregando destaques…" />
            ) : error ? (
                <div role="alert">
                    <p>{error}</p>
                    <button className="button secondary" onClick={retry}>
                        Tentar novamente
                    </button>
                </div>
            ) : (
                <div className="highlights-columns">
                    {columns.map((column) => (
                        <article className="highlights-column" key={column.key}>
                            <h3>
                                <span className="highlight-column-icon" aria-hidden="true">
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        {column.key === 'played' ? (
                                            <>
                                                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
                                            </>
                                        ) : column.key === 'titles' ? (
                                            <>
                                                <path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M10 18h4" />
                                            </>
                                        ) : (
                                            <>
                                                <path d="M4 18 10 12 14 15 20 5M14 5h6v6" />
                                                <path d="M4 4v16h16" />
                                            </>
                                        )}
                                    </svg>
                                </span>
                                <span>{column.title}</span>
                            </h3>
                            {column.rows.map((row, index) => {
                                const contributions = new Map<
                                    string,
                                    { name: string; count: number; top4: number }
                                >();
                                for (const result of model.known.filter(
                                    (r) =>
                                        r.deck_id === row.id &&
                                        r.player_id &&
                                        r.player &&
                                        (column.key !== 'top4' ||
                                            topEligibleEvents.has(String(r.tournament_id))) &&
                                        (column.key !== 'titles' ||
                                            (r.placement === 1 &&
                                                model.complete.has(String(r.tournament_id))))
                                )) {
                                    const player = contributions.get(result.player_id!) || {
                                        name: result.player!.name,
                                        count: 0,
                                        top4: 0
                                    };
                                    player.count++;
                                    if (result.placement <= 4) player.top4++;
                                    contributions.set(result.player_id!, player);
                                }
                                const contributors = [...contributions.entries()].sort(
                                    ([, a], [, b]) =>
                                        b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')
                                );
                                const value =
                                    column.key === 'played'
                                        ? String(row.count)
                                        : column.key === 'titles'
                                          ? String(row.titles)
                                          : `${((row.top4 / row.topEligible) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
                                const valueLabel =
                                    column.key === 'played'
                                        ? row.count === 1
                                            ? 'participação'
                                            : 'participações'
                                        : column.key === 'titles'
                                          ? row.titles === 1
                                              ? 'título'
                                              : 'títulos'
                                          : `${row.top4}/${row.topEligible} no Top 4`;
                                return (
                                    <div
                                        className="highlight-row"
                                        data-rank={index + 1}
                                        key={row.id}
                                    >
                                        <span
                                            className="highlight-place"
                                            aria-label={`${index + 1}º lugar`}
                                        >
                                            {index + 1}º
                                        </span>
                                        <Portrait image={row.image} />
                                        <div className="highlight-identity">
                                            <a
                                                href={context.href('decks', { deckId: row.id })}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    context.navigate('decks', {
                                                        deckId: row.id
                                                    });
                                                }}
                                            >
                                                {row.name}
                                            </a>
                                            {contributors.length > 0 && (
                                                <ul
                                                    className="highlight-contributors"
                                                    aria-label={
                                                        column.key === 'titles'
                                                            ? 'Jogadores campeões e quantidade de títulos'
                                                            : column.key === 'played'
                                                              ? 'Jogadores e quantidade de participações'
                                                              : 'Top 4 por participações elegíveis de cada jogador'
                                                    }
                                                >
                                                    {contributors.map(([id, player]) => (
                                                        <li key={id}>
                                                            {player.name}
                                                            {column.key !== 'top4' && (
                                                                <span
                                                                    className="highlight-title-count"
                                                                    aria-label={`${player.count} ${column.key === 'titles' ? 'títulos' : 'participações'}`}
                                                                >
                                                                    x{player.count}
                                                                </span>
                                                            )}
                                                            {column.key === 'top4' && (
                                                                <span
                                                                    className="highlight-title-count"
                                                                    title={`${player.top4} Top 4 em ${player.count} participações elegíveis`}
                                                                    aria-label={`${player.top4} Top 4 em ${player.count} participações elegíveis`}
                                                                >
                                                                    {player.top4}/{player.count}
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="highlight-metric">
                                            <strong>{value}</strong>
                                            <span>{valueLabel}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {!column.rows.length && (
                                <p className="highlights-empty">
                                    {column.key === 'top4'
                                        ? 'Nenhum deck com pelo menos 2 colocações no Top 4 em torneios de 8+ jogadores neste período.'
                                        : 'Sem resultados elegíveis neste recorte.'}
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
