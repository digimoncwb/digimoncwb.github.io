import { useEffect, useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import { Loader } from '../../shared/runtime';
import { EmptyState } from '../../shared/ListPage';
import { PointsBadge } from '../../shared/PointsBadge';
import { loadAssets, loadRules } from '../builder/editor-service';
import {
    effectiveRules,
    formatSpecificRestrictions,
    pendingFormatRules,
    textKey,
    colorLabels,
    type FormatRules
} from '../builder/editor-model';
import './formats-rules.css';
function FormatRuleCard({
    code,
    name = code,
    points,
    note
}: {
    code: string;
    name?: string;
    points?: number;
    note?: string;
}) {
    return (
        <figure
            className="format-point-card"
            title={`${name}${note ? ` · ${note}` : ''}${points != null ? ` · ${points} pontos por cópia` : ''}`}
        >
            <div className="format-point-art">
                <span className="format-point-fallback" aria-hidden="true">
                    {code}
                </span>
                <img
                    src={`https://digimon.digilab.cards/api/card/${encodeURIComponent(code)}.jpg`}
                    alt={name}
                    loading="lazy"
                    decoding="async"
                    width="630"
                    height="880"
                    onError={(event) => {
                        event.currentTarget.hidden = true;
                    }}
                />
                {points != null && <PointsBadge className="format-point-badge" points={points} />}
            </div>
            <figcaption>
                {code}
                {note && <strong className="format-card-rule-note">{note}</strong>}
            </figcaption>
        </figure>
    );
}
export function FormatsRulesPage({
    context,
    formats,
    onCreate,
    onBrowse
}: {
    context: MicroContext;
    formats: Format[];
    onCreate(id: string): void;
    onBrowse(id: string): void;
}) {
    const [query, setQuery] = useState('');
    const [base, setBase] = useState<FormatRules>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [selectedId, setSelectedId] = useState(context.route.params.get('rulesFormat') || '');
    const available = formats.filter((format) => format.is_active !== false);
    const selected =
        available.find((f) => String(f.id) === selectedId) ||
        available.find((f) => f.code === 'STANDARD') ||
        available[0];
    const matched = available.filter((f) => textKey(f.name).includes(textKey(query)));
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        loadAssets(context)
            .then((assets) => loadRules(controller.signal, assets))
            .then((rules) => {
                if (!controller.signal.aborted) setBase(rules);
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setError(
                        'Não foi possível carregar as regras gerais. A validação não está disponível.'
                    );
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [revision]);
    const choose = (id: string) => {
        setSelectedId(id);
        const url = new URL(location.href);
        url.searchParams.set('rulesFormat', id);
        historyReplace(url);
    };
    const pending = pendingFormatRules(selected);
    const ready = pending.length === 0 && !error && !loading;
    const rules = effectiveRules(base, selected?.validation_rules);
    const ruleValue = (key: 'main_count' | 'egg_max' | 'copies') =>
        selected?.validation_rules?.[key] == null ? 'A definir' : String(rules[key]);
    const specific = formatSpecificRestrictions(base, selected?.validation_rules);
    const hasSpecific =
        specific.banned_codes.length ||
        Object.keys(specific.limited_cards).length ||
        specific.unlimited_codes.length ||
        specific.choice_groups.length;
    const stat = (label: string, value: string | number, note: string) => (
        <div className="format-stat">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
        </div>
    );
    return (
        <>
            <div className="deck-section-heading">
                <h2>Formatos e regras</h2>
                <p className="muted">Entenda cada formato e escolha como montar seu deck.</p>
            </div>
            {!available.length ? (
                <EmptyState>Nenhum formato disponível.</EmptyState>
            ) : (
                <div className="formats-layout">
                    <aside className="formats-selection" aria-label="Selecionar formato">
                        <label className="formats-search">
                            Buscar formato
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar por nome"
                            />
                        </label>
                        <label className="formats-mobile-select">
                            Formato
                            <select
                                value={selected?.id || ''}
                                onChange={(e) => choose(e.target.value)}
                            >
                                {available.map((format) => (
                                    <option key={format.id} value={format.id}>
                                        {format.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="formats-options">
                            {matched.map((format) => (
                                <button
                                    key={format.id}
                                    className="format-option"
                                    aria-pressed={format.id === selected?.id}
                                    onClick={() => choose(String(format.id))}
                                >
                                    <div>
                                        <strong>{format.name}</strong>
                                        <span
                                            className={`format-status${pendingFormatRules(format).length ? ' defining' : ' available'}`}
                                        >
                                            {pendingFormatRules(format).length
                                                ? 'Em definição'
                                                : 'Disponível'}
                                        </span>
                                    </div>
                                    <p>{format.description || 'Descrição ainda não publicada.'}</p>
                                </button>
                            ))}
                            {!matched.length && (
                                <EmptyState>Nenhum formato encontrado. Ajuste a busca.</EmptyState>
                            )}
                        </div>
                    </aside>
                    {selected && (
                        <article
                            className="format-details"
                            aria-label={`Detalhes de ${selected.name}`}
                        >
                            <div className="format-details-heading">
                                <h3>{selected.name}</h3>
                                <span
                                    className={`format-status${pending.length ? ' defining' : ' available'}`}
                                >
                                    {pending.length ? 'Em definição' : 'Disponível'}
                                </span>
                            </div>
                            <p>{selected.description || 'Descrição ainda não publicada.'}</p>
                            {loading ? (
                                <Loader text="Carregando regras de construção…" />
                            ) : error ? (
                                <div className="format-pending" role="alert">
                                    {error}
                                    <button
                                        className="button secondary"
                                        onClick={() => setRevision((v) => v + 1)}
                                    >
                                        Tentar novamente
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {pending.length > 0 && (
                                        <div className="format-pending">
                                            <strong>⚠ Regras ainda não publicadas</strong>
                                            <p>
                                                Você pode começar um rascunho. A validação ficará
                                                disponível quando o regulamento for definido.
                                            </p>
                                            <p>Pendente: {pending.join(', ')}.</p>
                                        </div>
                                    )}
                                    <div className="format-stats">
                                        {stat('Deck principal', ruleValue('main_count'), 'cartas')}
                                        {stat('Digi-Eggs', ruleValue('egg_max'), 'no máximo')}
                                        {stat('Security', rules.security_count, 'cartas iniciais')}
                                        {stat(
                                            'Cópias por carta',
                                            ruleValue('copies'),
                                            'salvo exceções'
                                        )}
                                        {rules.points_limit !== null &&
                                            stat(
                                                'Limite de pontos',
                                                rules.points_limit,
                                                'somando cada cópia'
                                            )}
                                    </div>
                                    <div className="format-summary-tags">
                                        {rules.allowed_rarities.length > 0 && (
                                            <span>
                                                Raridades · {rules.allowed_rarities.join(' / ')}
                                            </span>
                                        )}
                                        {rules.allowed_colors.length > 0 && (
                                            <span>
                                                Cores ·{' '}
                                                {rules.allowed_colors
                                                    .map((color) => colorLabels[color] || color)
                                                    .join(', ')}
                                            </span>
                                        )}
                                        {rules.allowed_sets.length > 0 && (
                                            <span>Coleções · {rules.allowed_sets.join(', ')}</span>
                                        )}
                                    </div>
                                    {ready && (
                                        <p className="format-banlist-note">
                                            Banlist padrão da Bandai aplicada.
                                        </p>
                                    )}
                                    {rules.points_limit !== null && (
                                        <p className="format-points-note">
                                            Cada cópia soma pontos. Cartas fora da lista valem 0.
                                        </p>
                                    )}
                                    {rules.points_limit !== null && (
                                        <details className="format-points-reference">
                                            <summary>
                                                Pontuação por carta ·{' '}
                                                {Object.keys(rules.card_points).length} cartas
                                            </summary>
                                            <div className="format-points-grid">
                                                {Object.entries(rules.card_points)
                                                    .sort(([a], [b]) =>
                                                        a.localeCompare(b, undefined, {
                                                            numeric: true
                                                        })
                                                    )
                                                    .map(([code, value]) => (
                                                        <FormatRuleCard
                                                            key={code}
                                                            code={code}
                                                            name={value.name}
                                                            points={value.points}
                                                        />
                                                    ))}
                                            </div>
                                            {!!rules.points_pending.length && (
                                                <p className="format-pending">
                                                    Códigos aguardando correção:{' '}
                                                    {rules.points_pending
                                                        .map((row) => row.code)
                                                        .join(', ')}
                                                    .
                                                </p>
                                            )}
                                        </details>
                                    )}
                                    {ready && !!hasSpecific && (
                                        <div className="format-card-restrictions">
                                            {!!specific.banned_codes.length && (
                                                <details>
                                                    <summary>
                                                        Cartas proibidas ·{' '}
                                                        {specific.banned_codes.length}
                                                    </summary>
                                                    {specific.banned_codes.length ? (
                                                        <div
                                                            className="format-points-grid"
                                                            data-rule-cards="banned"
                                                        >
                                                            {specific.banned_codes.map((code) => (
                                                                <FormatRuleCard
                                                                    key={code}
                                                                    code={code}
                                                                    note="Proibida"
                                                                />
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p>
                                                            Nenhuma proibição adicional cadastrada.
                                                        </p>
                                                    )}
                                                </details>
                                            )}
                                            {!!Object.keys(specific.limited_cards).length && (
                                                <details>
                                                    <summary>
                                                        Limites específicos ·{' '}
                                                        {Object.keys(specific.limited_cards).length}
                                                    </summary>
                                                    <div
                                                        className="format-points-grid"
                                                        data-rule-cards="limited"
                                                    >
                                                        {Object.entries(specific.limited_cards).map(
                                                            ([code, count]) => (
                                                                <FormatRuleCard
                                                                    key={code}
                                                                    code={code}
                                                                    note={`Máximo: ${count} ${count === 1 ? 'cópia' : 'cópias'}`}
                                                                />
                                                            )
                                                        )}
                                                    </div>
                                                    {!Object.keys(specific.limited_cards)
                                                        .length && (
                                                        <p>Nenhum limite específico cadastrado.</p>
                                                    )}
                                                </details>
                                            )}
                                            {specific.unlimited_codes.length > 0 && (
                                                <details>
                                                    <summary>
                                                        Cartas com exceção ao limite geral
                                                    </summary>
                                                    <p>
                                                        Até {rules.main_count} cópias, respeitando a
                                                        quantidade do principal.
                                                    </p>
                                                    <div
                                                        className="format-points-grid"
                                                        data-rule-cards="unlimited"
                                                    >
                                                        {specific.unlimited_codes.map((code) => (
                                                            <FormatRuleCard
                                                                key={code}
                                                                code={code}
                                                                note={`Até ${rules.main_count} cópias`}
                                                            />
                                                        ))}
                                                    </div>
                                                </details>
                                            )}
                                            {!!specific.choice_groups.length && (
                                                <details>
                                                    <summary>
                                                        Combinações restritas ·{' '}
                                                        {specific.choice_groups.length}
                                                    </summary>
                                                    <div className="format-choice-groups">
                                                        {specific.choice_groups.map(
                                                            (group, index) => (
                                                                <section
                                                                    className="format-choice-group"
                                                                    key={index}
                                                                    aria-label={`Combinação restrita ${index + 1}`}
                                                                >
                                                                    <p>
                                                                        <strong>
                                                                            Combinação {index + 1}
                                                                        </strong>{' '}
                                                                        · Use apenas uma destas
                                                                        cartas no deck.
                                                                    </p>
                                                                    <div
                                                                        className="format-points-grid"
                                                                        data-rule-cards="choice"
                                                                    >
                                                                        {group.map((code) => (
                                                                            <FormatRuleCard
                                                                                key={code}
                                                                                code={code}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </section>
                                                            )
                                                        )}
                                                    </div>
                                                    {!specific.choice_groups.length && (
                                                        <p>
                                                            Nenhuma combinação restrita cadastrada.
                                                        </p>
                                                    )}
                                                </details>
                                            )}
                                        </div>
                                    )}
                                    {selected.rules_text && (
                                        <details className="format-regulation">
                                            <summary>Regulamento completo</summary>
                                            <div>{selected.rules_text}</div>
                                        </details>
                                    )}
                                    {safeUrl(selected.rules_url) && (
                                        <a
                                            className="button secondary"
                                            href={safeUrl(selected.rules_url)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Ver regulamento externo ↗
                                        </a>
                                    )}
                                </>
                            )}
                            <div className="format-detail-actions">
                                <button
                                    className="button primary"
                                    onClick={() => onCreate(String(selected.id))}
                                >
                                    ＋{' '}
                                    {ready
                                        ? 'Criar deck neste formato'
                                        : 'Criar rascunho neste formato'}
                                </button>
                                <button
                                    className="button secondary"
                                    onClick={() => onBrowse(String(selected.id))}
                                >
                                    ☷ Ver decks deste formato
                                </button>
                            </div>
                        </article>
                    )}
                </div>
            )}
        </>
    );
}
function safeUrl(value?: string | null) {
    try {
        const url = new URL(value || '');
        return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
    } catch {
        return undefined;
    }
}
function historyReplace(url: URL) {
    window.history.replaceState(window.history.state, '', url.href);
}
