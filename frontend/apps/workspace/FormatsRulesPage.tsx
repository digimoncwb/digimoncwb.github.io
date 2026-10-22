import { useEffect, useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import { Loader } from '../../shared/runtime';
import { EmptyState } from '../../shared/ListPage';
import { readRows } from './catalog-service';
import { loadAssets, loadRules } from '../builder/editor-service';
import {
    effectiveRules,
    pendingFormatRules,
    textKey,
    colorLabels,
    type FormatRules
} from '../builder/editor-model';
import './formats-rules.css';
interface RuleVersion {
    version: number;
    created_at: string;
    description: string;
}
const dateLabel = (date?: string) => (date ? new Date(date).toLocaleDateString('pt-BR') : '');
export function FormatsRulesPage({
    context,
    formats,
    admin,
    onCreate,
    onBrowse,
    onEdit,
    onNew
}: {
    context: MicroContext;
    formats: Format[];
    admin: boolean;
    onCreate(id: string): void;
    onBrowse(id: string): void;
    onEdit(format: Format): void;
    onNew(): void;
}) {
    const [query, setQuery] = useState('');
    const [base, setBase] = useState<FormatRules>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [history, setHistory] = useState<RuleVersion[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [historyRevision, setHistoryRevision] = useState(0);
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
    useEffect(() => {
        if (!selected) return;
        const controller = new AbortController();
        setHistoryLoading(true);
        setHistoryError('');
        readRows<RuleVersion>(
            `/rest/v1/deck_format_rule_versions?deck_format_id=eq.${encodeURIComponent(selected.id)}&select=version,created_at,description&order=version.desc`,
            controller.signal
        )
            .then((rows) => {
                if (!controller.signal.aborted) setHistory(rows);
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setHistoryError('Não foi possível carregar o histórico.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setHistoryLoading(false);
            });
        return () => controller.abort();
    }, [selected?.id, historyRevision]);
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
    const changeRule = (name: string, value: string) => (
        <div className="format-rule-row">
            <strong>{name}</strong>
            <span>{value}</span>
        </div>
    );
    return (
        <>
            <div className="deck-section-heading">
                <h2>Formatos e regras</h2>
                <p className="muted">Entenda cada formato e escolha como montar seu deck.</p>
                {admin && (
                    <button className="button secondary" onClick={onNew}>
                        ＋ Novo formato de jogo
                    </button>
                )}
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
                                {admin && (
                                    <button
                                        className="button secondary"
                                        onClick={() => onEdit(selected)}
                                    >
                                        Editar formato
                                    </button>
                                )}
                            </div>
                            <p>{selected.description || 'Descrição ainda não publicada.'}</p>
                            <div className="format-version-meta">
                                {selected.rules_revision && (
                                    <span>▤ Regulamento · versão {selected.rules_revision}</span>
                                )}
                                {selected.updated_at && (
                                    <span>◷ Atualizado em {dateLabel(selected.updated_at)}</span>
                                )}
                            </div>
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
                                    <h4>Regras de construção</h4>
                                    <div className="format-rules-list">
                                        {changeRule(
                                            'Deck principal',
                                            selected.validation_rules?.main_count == null
                                                ? 'A definir'
                                                : `${ruleValue('main_count')} cartas`
                                        )}
                                        {changeRule(
                                            'Digi-Eggs',
                                            selected.validation_rules?.egg_max == null
                                                ? 'A definir'
                                                : `Até ${ruleValue('egg_max')} cartas`
                                        )}
                                        {changeRule(
                                            'Limite de cópias',
                                            selected.validation_rules?.copies == null
                                                ? 'A definir'
                                                : `${ruleValue('copies')} por carta, respeitando as exceções abaixo`
                                        )}
                                        {changeRule(
                                            'Cores permitidas',
                                            pending.length
                                                ? 'A definir'
                                                : rules.allowed_colors.length
                                                  ? rules.allowed_colors
                                                        .map((c) => colorLabels[c] || c)
                                                        .join(', ')
                                                  : 'Todas as cores'
                                        )}
                                        {changeRule(
                                            'Coleções permitidas',
                                            pending.length
                                                ? 'A definir'
                                                : rules.allowed_sets.length
                                                  ? rules.allowed_sets.join(', ')
                                                  : 'Todas as coleções do catálogo'
                                        )}
                                    </div>
                                    {ready && (
                                        <div className="format-card-restrictions">
                                            <details>
                                                <summary>
                                                    Cartas proibidas · {rules.banned_codes.length}
                                                </summary>
                                                <p>
                                                    {rules.banned_codes.join(', ') ||
                                                        'Nenhuma proibição adicional cadastrada.'}
                                                </p>
                                            </details>
                                            <details>
                                                <summary>
                                                    Limites específicos ·{' '}
                                                    {Object.keys(rules.limited_cards).length}
                                                </summary>
                                                <ul>
                                                    {Object.entries(rules.limited_cards).map(
                                                        ([code, count]) => (
                                                            <li key={code}>
                                                                {code}: {count}{' '}
                                                                {count === 1 ? 'cópia' : 'cópias'}
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            </details>
                                            {rules.unlimited_codes.length > 0 && (
                                                <details>
                                                    <summary>
                                                        Cartas com exceção ao limite geral
                                                    </summary>
                                                    <p>
                                                        {rules.unlimited_codes.join(', ')} · até{' '}
                                                        {rules.main_count} cópias, respeitando a
                                                        quantidade do principal.
                                                    </p>
                                                </details>
                                            )}
                                            <details>
                                                <summary>
                                                    Combinações restritas ·{' '}
                                                    {rules.choice_groups.length}
                                                </summary>
                                                <ul>
                                                    {rules.choice_groups.map((group, index) => (
                                                        <li key={index}>
                                                            Use apenas uma destas cartas:{' '}
                                                            {group.join(', ')}.
                                                        </li>
                                                    ))}
                                                </ul>
                                                {!rules.choice_groups.length && (
                                                    <p>Nenhuma combinação restrita cadastrada.</p>
                                                )}
                                            </details>
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
                            <details className="format-history">
                                <summary>◷ Histórico de alterações</summary>
                                {historyLoading ? (
                                    <Loader text="Carregando histórico…" />
                                ) : historyError ? (
                                    <p role="alert">
                                        {historyError}
                                        <button
                                            className="button secondary"
                                            onClick={() => setHistoryRevision((v) => v + 1)}
                                        >
                                            Tentar novamente
                                        </button>
                                    </p>
                                ) : history.length ? (
                                    <ol>
                                        {history.map((version) => (
                                            <li key={version.version}>
                                                <strong>
                                                    Versão {version.version} ·{' '}
                                                    {dateLabel(version.created_at)}
                                                </strong>
                                                <p>{version.description}</p>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p>Nenhuma alteração registrada.</p>
                                )}
                            </details>
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
                            <small className="muted">
                                O formato será selecionado automaticamente no editor.
                            </small>
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
