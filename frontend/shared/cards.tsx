import { useEffect, useRef, useState } from 'react';
import type { Tournament, Result, Store, MicroContext } from '../contracts';
export function Portrait({ image, className = 'art' }: { image?: string; className?: string }) {
    const [, update] = useState(0);
    useEffect(() => {
        const refresh = () => update((value) => value + 1);
        window.addEventListener('digistats:portraits-changed', refresh);
        return () => window.removeEventListener('digistats:portraits-changed', refresh);
    }, []);
    return image ? (
        <span className={`${className} art-portrait`}>
            <img
                src={image}
                alt=""
                loading="lazy"
                style={window.cardPortraits?.style(window.cardPortraits.get(image))}
            />
        </span>
    ) : (
        <span className={`${className} image-placeholder`} aria-hidden="true">
            —
        </span>
    );
}
export function StoreLogo({ logo, name = '' }: { logo?: string; name?: string }) {
    return logo ? (
        <img className="store-logo" src={logo} alt={name} loading="lazy" />
    ) : (
        <span className="store-logo image-placeholder" aria-hidden="true">
            —
        </span>
    );
}
export function RecentTournamentCard({
    event,
    onDetails,
    isLatest = false
}: {
    event: Tournament;
    onDetails(event: Tournament): void;
    isLatest?: boolean;
}) {
    return (
        <article className="event-card recent-event-card">
            {isLatest && (
                <span className="recent-event-new" aria-label="Torneio mais recente">
                    NOVO
                </span>
            )}
            <header className="recent-event-header">
                <span className="recent-event-store" title={event.store}>
                    {event.logo ? (
                        <StoreLogo logo={event.logo} name={event.store} />
                    ) : (
                        <span className="recent-store-initials" aria-label={event.store}>
                            {event.store
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((word) => word[0])
                                .join('')
                                .toUpperCase() || '—'}
                        </span>
                    )}
                </span>
                <div>
                    <time dateTime={event.isoDate}>{event.date}</time>
                    <h3>{event.title}</h3>
                </div>
            </header>
            <div className="recent-event-meta">
                <span className="event-format">{event.format}</span>
                <span>{event.players} jogadores</span>
            </div>
            <div className="card-podium" aria-label="Top 3">
                {event.podium
                    .filter((result): result is Result => !!result)
                    .map((result) => (
                        <div
                            key={result.placement}
                            className={`card-podium-row${event.deckless ? ' deckless' : ''}`}
                        >
                            <span
                                className={`card-place place-${result.placement - 1}`}
                                aria-label={`${result.placement}º lugar`}
                            >
                                {result.placement}º
                            </span>
                            <Identity event={event} result={result} />
                        </div>
                    ))}
                {!event.podium.some(Boolean) && (
                    <p className="muted">Classificação ainda não registrada.</p>
                )}
            </div>
            <button className="recent-event-results" onClick={() => onDetails(event)}>
                Ver torneio completo <span aria-hidden="true">↗</span>
            </button>
        </article>
    );
}
function Identity({ event, result }: { event: Tournament; result: Result }) {
    return event.deckless ? (
        <div>
            <strong>{result.name}</strong>
        </div>
    ) : (
        <>
            <Portrait image={result.image} />
            <div>
                <strong>{result.deck}</strong>
                <span>{result.name}</span>
            </div>
        </>
    );
}
export function EventCard({
    event,
    context,
    onDetails
}: {
    event: Tournament;
    context: MicroContext;
    onDetails(event: Tournament): void;
}) {
    const others = event.results.filter((result) => result.placement > 3);
    return (
        <article className="event-card">
            <div className="event-top">
                <span>
                    {event.date} · {event.players} jogadores
                </span>
                <span className="event-format">{event.format}</span>
            </div>
            <h3>{event.title}</h3>
            <div className="store-info">
                <StoreLogo logo={event.logo} />
                <p className="store-name">{event.store} · Curitiba</p>
            </div>
            <div className="card-podium" aria-label="Top 3">
                {event.podium
                    .filter((result): result is Result => !!result)
                    .map((result) => (
                        <div
                            key={result.placement}
                            className={`card-podium-row${event.deckless ? ' deckless' : ''}`}
                        >
                            <span
                                className={`card-place place-${result.placement - 1}`}
                                aria-label={`${result.placement}º lugar`}
                            >
                                {result.placement}º
                            </span>
                            <Identity event={event} result={result} />
                        </div>
                    ))}
            </div>
            {others.length > 0 && (
                <details className="card-other-results">
                    <summary>Mais {others.length} resultados</summary>
                    <div>
                        {others.map((result) => (
                            <div key={result.placement} className="card-result-row">
                                <span>{result.placement}º</span>
                                <div>
                                    <strong>{result.name}</strong>
                                    {!event.deckless && <span>{result.deck}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}
            <div className="card-actions">
                <button className="text-button" onClick={() => onDetails(event)}>
                    Ver resultados
                </button>
                {event.winner && (
                    <a
                        className="event-link"
                        href={context.href('posts', { tournament: event.id })}
                        onClick={(e) => {
                            e.preventDefault();
                            context.navigate('posts', { tournament: event.id });
                        }}
                    >
                        Criar post ↗
                    </a>
                )}
            </div>
        </article>
    );
}
export function EventDialog({
    event,
    onClose,
    context
}: {
    event: Tournament | null;
    onClose(): void;
    context: MicroContext;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (event) dialog.current?.showModal();
        else dialog.current?.close();
    }, [event]);
    return (
        <dialog
            className="event-results-dialog"
            ref={dialog}
            aria-labelledby="event-dialog-title"
            onClose={onClose}
        >
            <header className="event-results-header">
                <div className="event-results-title">
                    <span className="event-results-logo">
                        <StoreLogo logo={event?.logo} name={event?.store} />
                    </span>
                    <div>
                        <span className="overview-eyebrow">Resultados do torneio</span>
                        <h2 id="event-dialog-title">{event?.store}</h2>
                        <p>
                            {event?.title} <span aria-hidden="true">·</span> {event?.date}
                        </p>
                    </div>
                </div>
                <button className="button secondary cancel-close" onClick={onClose}>
                    Cancelar
                </button>
            </header>
            {event && (
                <div className="event-results-body">
                    <div className="event-results-summary">
                        <span className="event-format">{event.format}</span>
                        <span>{event.players} jogadores</span>
                        <span>{event.results.length} resultados registrados</span>
                    </div>
                    <h3 className="event-results-list-title">Classificação completa</h3>
                    <ol className="podium-details">
                        {[...event.results]
                            .sort((a, b) => a.placement - b.placement)
                            .map((result) => (
                                <li
                                    key={result.placement}
                                    className={`podium-detail${event.deckless ? ' deckless' : ''}`}
                                    data-placement={result.placement}
                                >
                                    <span className={`podium-place place-${result.placement - 1}`}>
                                        {result.placement}º
                                    </span>
                                    <Identity event={event} result={result} />
                                </li>
                            ))}
                    </ol>
                    {!event.results.length && (
                        <p className="muted">Nenhum resultado registrado ainda.</p>
                    )}
                </div>
            )}
        </dialog>
    );
}
export function Metrics({ rows }: { rows: [string, string | number, string][] }) {
    return (
        <div className="metrics">
            {rows.map(([label, value, detail]) => (
                <article className="metric" key={label}>
                    <span className="metric-label">{label}</span>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                </article>
            ))}
        </div>
    );
}
export function formatOptions(formats: { code: string; name: string }[]) {
    return formats.map((format) => (
        <option key={format.code} value={format.code}>
            {format.name && format.name !== format.code
                ? `${format.name} - ${format.code}`
                : format.code}
        </option>
    ));
}
