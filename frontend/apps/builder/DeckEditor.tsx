import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Format, MicroContext, RouteName } from '../../contracts';
import { Dialog } from '../../shared/ListPage';
import { Loader } from '../../shared/runtime';
import { PointsBadge } from '../../shared/PointsBadge';
import {
    aggregate,
    adjustCopies,
    copyLimit,
    orderCatalog,
    normalizeRarity,
    cardEligibility,
    colorHex,
    colorLabels,
    effectiveRules,
    filterCatalog,
    groupName,
    parseImport,
    sortEntries,
    validateDeck,
    pendingFormatRules,
    type Card,
    type CatalogFilters,
    type Entry,
    type FormatRules,
    type Issue
} from './editor-model';
import {
    loadAssets,
    loadCatalog,
    loadDeck,
    loadFormats,
    loadRules,
    resolveDetails,
    saveDraft,
    type DeckRecord
} from './editor-service';
import './editor.css';
import { DeckImageDialog } from './DeckImageDialog';
import { loadDecks, type DeckRecord as ArchetypeRecord } from '../workspace/catalog-service';
import { Portrait } from '../../shared/cards';
import { SearchSelect } from '../../shared/SearchSelect';
import { Select } from '../../shared/Select';
import { CatalogViewport } from './CatalogViewport';
import { createPortal } from 'react-dom';

function FormatRulesButton({
    format,
    rules,
    pill = false
}: {
    format?: Format;
    rules: Required<FormatRules>;
    pill?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    return (
        <>
            <button
                ref={button}
                type="button"
                className={pill ? undefined : 'ed-text-button ed-format-rules'}
                title={`Ver regras de ${format?.name || 'formato'}`}
                onClick={() => setOpen(true)}
            >
                {pill ? format?.name : 'Ver regras'}
            </button>
            {open &&
                createPortal(
                    <Dialog
                        title={`Regulamento · ${format?.name || format?.code || 'Formato'}`}
                        onClose={() => setOpen(false)}
                        wide
                    >
                        <div className="ed-dialog-body">
                            <p>{format?.description}</p>
                            <div className="ed-rules-text">
                                {format?.rules_text ||
                                    (pendingFormatRules(format).length
                                        ? 'Regulamento ainda não publicado.'
                                        : `Deck principal: ${rules.main_count} cartas. Digi-Eggs: até ${rules.egg_max}. Limite geral: ${rules.copies} cópias por carta, respeitando as restrições cadastradas.`)}
                            </div>
                            {safeLink(format?.rules_url) && (
                                <a
                                    className="ed-button"
                                    href={safeLink(format?.rules_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Abrir regulamento ↗
                                </a>
                            )}
                            <p className="ed-muted">
                                Revisão das regras: {format?.rules_revision || 1}.{' '}
                                {format?.validation_rules
                                    ? 'Validação com regras específicas deste formato.'
                                    : 'Validação pelas regras gerais do sistema; nenhuma regra adicional estruturada foi cadastrada para este formato.'}
                            </p>
                        </div>
                    </Dialog>,
                    button.current?.closest('.deck-editor') || document.body
                )}
        </>
    );
}

function CatalogMultiSelect({
    id,
    label,
    values,
    options,
    onChange
}: {
    id: string;
    label: string;
    values: string[];
    options: { value: string; label: string }[];
    onChange(values: string[]): void;
}) {
    const root = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (root.current && !root.current.contains(event.target as Node))
                root.current.open = false;
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, []);
    return (
        <div className="ed-multi-filter">
            <span id={`${id}-label`}>{label}</span>
            <details
                ref={root}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        root.current!.open = false;
                        root.current!.querySelector('summary')?.focus({ preventScroll: true });
                    }
                }}
            >
                <summary aria-labelledby={`${id}-label ${id}-value`}>
                    <span id={`${id}-value`}>
                        {values.length
                            ? options
                                  .filter((option) => values.includes(option.value))
                                  .map((option) => option.label)
                                  .join(', ')
                            : 'Todas'}
                    </span>
                    <span aria-hidden="true">⌄</span>
                </summary>
                <div className="ed-multi-options" role="group" aria-labelledby={`${id}-label`}>
                    <button type="button" className="ed-text-button" onClick={() => onChange([])}>
                        Todas
                    </button>
                    {options.map((option) => (
                        <label key={option.value}>
                            <input
                                type="checkbox"
                                checked={values.includes(option.value)}
                                onChange={(event) =>
                                    onChange(
                                        event.target.checked
                                            ? [...values, option.value]
                                            : values.filter((value) => value !== option.value)
                                    )
                                }
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            </details>
        </div>
    );
}

function EditorIcon({
    name
}: {
    name: 'check' | 'alert' | 'save' | 'upload' | 'trash' | 'sort' | 'image' | 'pencil';
}) {
    const paths = {
        check: 'm5 12 4 4L19 6',
        alert: 'M12 3 2 21h20L12 3Zm0 6v5',
        save: 'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8',
        upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
        trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
        sort: 'M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4',
        image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01',
        pencil: 'm16 3 5 5-12 12-6 1 1-6ZM14 5l5 5'
    };
    return (
        <svg
            className="ed-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={name === 'alert' ? 2.3 : 1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={paths[name]} />
            {name === 'alert' && (
                <circle cx="12" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
            )}
        </svg>
    );
}

function CardWarning({
    name,
    issues,
    onClick
}: {
    name: string;
    issues: Issue[];
    onClick(): void;
}) {
    if (!issues.length) return null;
    return (
        <button
            className="ed-card-warning"
            aria-label={`Pendências de ${name}: ${issues.map((issue) => issue.message).join(' ')}`}
            title={issues.map((issue) => issue.message).join(' ')}
            onClick={onClick}
        >
            <EditorIcon name="alert" />
        </button>
    );
}
function ValidationMark({ warning = false }: { warning?: boolean }) {
    return (
        <span
            className={`ed-validation-mark ${warning ? 'is-warning' : 'is-good'}`}
            aria-hidden="true"
        >
            <EditorIcon name={warning ? 'alert' : 'check'} />
        </span>
    );
}

const emptyFilters: CatalogFilters = {
    query: '',
    color: '',
    color2: '',
    colors: [],
    rarities: [],
    type: '',
    level: '',
    cost: '',
    set: '',
    permitted: false
};
const labels: Record<string, string> = {
    digimon: 'Digimon',
    'digi-egg': 'Digi-Egg',
    tamer: 'Tamer',
    option: 'Option',
    dual: 'Dual'
};
const signature = (name: string, format: string, entries: Entry[], archetype = '') =>
    JSON.stringify([name.trim(), format, entries, archetype]);
const safeLink = (value?: string | null) => {
    try {
        const url = new URL(value || '');
        return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
    } catch {
        return undefined;
    }
};

function CardImage({
    card,
    onClick,
    small = false,
    points
}: {
    card: Card;
    onClick?: () => void;
    small?: boolean;
    points?: number;
}) {
    const [failed, setFailed] = useState(false);
    const [fallback, setFallback] = useState(false);
    useEffect(() => {
        setFailed(false);
        setFallback(false);
    }, [card.code, card.image]);
    const content = (
        <>
            {failed ? (
                <span className="ed-image-missing">
                    Imagem indisponível
                    <br />
                    {card.code}
                </span>
            ) : (
                <img
                    src={
                        fallback
                            ? `https://deckbuilder.egmanevents.com/card_images/digimon/${card.code}.png`
                            : card.image
                    }
                    alt={card.name}
                    draggable={false}
                    loading="lazy"
                    onError={() => {
                        if (!fallback) setFallback(true);
                        else setFailed(true);
                    }}
                />
            )}
            {points !== undefined && <PointsBadge points={points} />}
        </>
    );
    const className = `ed-card-image${small ? ' ed-small-image' : ''}`;
    return onClick ? (
        <button
            type="button"
            className={className}
            onClick={onClick}
            aria-label={`Ver detalhes de ${card.name}`}
        >
            {content}
        </button>
    ) : (
        <div className={className}>{content}</div>
    );
}
function RulesPanel({
    validation,
    rules,
    showCard,
    retry,
    available
}: {
    validation: ReturnType<typeof validateDeck>;
    rules: Required<FormatRules>;
    showCard(code: string): void;
    retry(): void;
    available: boolean;
}) {
    if (!available)
        return (
            <div className="ed-validation">
                <h2>Validação do deck</h2>
                <div className="ed-check">
                    <ValidationMark warning />
                    <div>
                        <strong>Validação indisponível</strong>
                        <p>
                            O regulamento ainda não foi publicado ou as regras não puderam ser
                            carregadas. Nenhuma carta será removida.
                        </p>
                        <button className="ed-text-button" onClick={retry}>
                            Tentar carregar regras novamente
                        </button>
                    </div>
                </div>
            </div>
        );
    return (
        <div className="ed-validation">
            <div className="ed-panel-heading">
                <h2>Validação do deck</h2>
                <span
                    className={`ed-validation-summary ${validation.valid ? 'ed-good' : 'ed-warning'}`}
                >
                    <ValidationMark warning={!validation.valid} />
                    {validation.valid
                        ? 'Válido'
                        : `${validation.issues.length} ${validation.issues.length === 1 ? 'pendência' : 'pendências'}`}
                </span>
            </div>
            <div
                className={`ed-progress${validation.main > rules.main_count ? ' is-over' : ''}`}
                role="progressbar"
                aria-label="Quantidade do deck principal"
                aria-valuemin={0}
                aria-valuemax={rules.main_count}
                aria-valuenow={Math.min(validation.main, rules.main_count)}
                aria-valuetext={`${validation.main} de ${rules.main_count} cartas no deck principal`}
            >
                <span
                    style={{
                        width: `${Math.min(100, (validation.main / rules.main_count) * 100)}%`
                    }}
                />
            </div>
            <p className="ed-progress-caption">
                {validation.main} / {rules.main_count} cartas no principal
            </p>
            {rules.points_limit !== null && validation.points <= rules.points_limit && (
                <article className="ed-check">
                    <ValidationMark />
                    <div>
                        <strong>
                            Pontos: {validation.points} / {rules.points_limit}
                        </strong>
                        <p>Cada cópia soma os pontos cadastrados. Cartas fora da lista valem 0.</p>
                    </div>
                </article>
            )}
            {rules.allowed_rarities.length > 0 && validation.raritiesValid && (
                <article className="ed-check">
                    <ValidationMark />
                    <div>
                        <strong>Raridades permitidas</strong>
                        <p>Todas as cartas têm raridade {rules.allowed_rarities.join(' ou ')}.</p>
                    </div>
                </article>
            )}
            {validation.main === rules.main_count && (
                <article className="ed-check">
                    <ValidationMark />
                    <div>
                        <strong>
                            Deck principal: {validation.main} / {rules.main_count}
                        </strong>
                        <p>Quantidade exigida atendida.</p>
                    </div>
                </article>
            )}
            {validation.eggs <= rules.egg_max && (
                <article className="ed-check">
                    <ValidationMark />
                    <div>
                        <strong>
                            Digi-Eggs: {validation.eggs} / {rules.egg_max}
                        </strong>
                        <p>Quantidade dentro do limite.</p>
                    </div>
                </article>
            )}
            {validation.issues.map((issue) => (
                <article className="ed-check" key={issue.id}>
                    <ValidationMark warning />
                    <div>
                        <strong>{issue.title}</strong>
                        <p>{issue.message}</p>
                        {issue.codes.length > 0 && (
                            <button
                                className="ed-text-button"
                                onClick={() => showCard(issue.codes[0])}
                            >
                                Mostrar carta →
                            </button>
                        )}
                        {issue.id === 'unavailable' && (
                            <button className="ed-text-button" onClick={retry}>
                                Tentar carregar regras novamente
                            </button>
                        )}
                    </div>
                </article>
            ))}
            {!rules.allowed_colors.length && available && (
                <article className="ed-check">
                    <ValidationMark />
                    <div>
                        <strong>Cores permitidas</strong>
                        <p>Sem restrições de cor neste formato.</p>
                    </div>
                </article>
            )}
        </div>
    );
}

export function DeckEditor({ context }: { context: MicroContext }) {
    const p = context.route.params;
    const resultId = p.get('resultId') || p.get('result_id');
    const identity = resultId || p.get('decklistId') || 'new';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [record, setRecord] = useState<DeckRecord | null>(null);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);
    const [name, setName] = useState('Meu deck Digimon');
    const nameField = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const field = nameField.current;
        if (!field) return;
        const resize = () => {
            field.style.height = 'auto';
            field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
        };
        resize();
        let width = field.clientWidth;
        const observer = new ResizeObserver(() => {
            if (field.clientWidth !== width) {
                width = field.clientWidth;
                resize();
            }
        });
        observer.observe(field);
        return () => observer.disconnect();
    }, [name, loading]);
    const [formatId, setFormatId] = useState('');
    const [formats, setFormats] = useState<Format[]>([]);
    const [archetypes, setArchetypes] = useState<ArchetypeRecord[]>([]);
    const [archetypeId, setArchetypeId] = useState('');
    const [entries, setEntries] = useState<Entry[]>([]);
    const [catalog, setCatalog] = useState<Card[]>([]);
    const [catalogBusy, setCatalogBusy] = useState(true);
    const [catalogError, setCatalogError] = useState('');
    const [catalogWarning, setCatalogWarning] = useState('');
    const [catalogRetry, setCatalogRetry] = useState(0);
    const [baseRules, setBaseRules] = useState<FormatRules>({});
    const [rulesAvailable, setRulesAvailable] = useState(false);
    const [rulesBusy, setRulesBusy] = useState(true);
    const [metadataAttempted, setMetadataAttempted] = useState<Set<string>>(new Set());
    const [rulesRetry, setRulesRetry] = useState(0);
    const [filters, setFilters] = useState<CatalogFilters>(emptyFilters);
    // Older open tabs may retain a shared module without this named re-export.
    const deferredFilters = React.useDeferredValue(filters);
    const [mobileTab, setMobileTab] = useState('catalog');
    const [deckView, setDeckView] = useState<'list' | 'photo'>('photo');
    const [savedSignature, setSavedSignature] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveToast, setSaveToast] = useState(0);
    useEffect(() => {
        if (!saveToast) return;
        const timer = window.setTimeout(() => setSaveToast(0), 4500);
        return () => window.clearTimeout(timer);
    }, [saveToast]);
    const [saveError, setSaveError] = useState('');
    const [announcement, setAnnouncement] = useState('');
    const [detail, setDetail] = useState<Card | null>(null);
    const [detailsBusy, setDetailsBusy] = useState(false);
    const [detailsError, setDetailsError] = useState('');
    const [validationOpen, setValidationOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [importPreview, setImportPreview] = useState<ReturnType<typeof parseImport> | null>(null);
    const [importBusy, setImportBusy] = useState(false);
    const [importMode, setImportMode] = useState('replace');
    const [acknowledged, setAcknowledged] = useState(false);
    const [pendingHref, setPendingHref] = useState('');
    const [highlight, setHighlight] = useState('');
    const [moreActions, setMoreActions] = useState(false);
    const [imageOpen, setImageOpen] = useState(false);
    const detailToken = useRef(0);
    const editorRef = useRef<HTMLElement>(null);
    const catalogScroll = useRef<HTMLDivElement>(null);
    useEffect(() => {
        catalogScroll.current?.scrollTo({ top: 0 });
    }, [deferredFilters]);
    const alive = useRef(true);
    const currentSignature = signature(name, formatId, entries, archetypeId);
    const dirty = !loading && !error && currentSignature !== savedSignature;
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const urlRef = useRef(location.href);
    const format = formats.find((f) => String(f.id) === formatId);
    const standardFormat = format?.code.toUpperCase() === 'STANDARD';
    const tournamentCollection = (result?.event as Record<string, unknown> | undefined)
        ?.collection as { code?: string; name?: string } | undefined;
    const rules = useMemo(
        () => effectiveRules(baseRules, format?.validation_rules),
        [baseRules, format]
    );
    const formatRarities = rules.allowed_rarities.map(normalizeRarity);
    const formatRarityKey = formatRarities.join('|');
    useEffect(() => {
        setFilters((old) => ({
            ...old,
            rarities: formatRarityKey ? formatRarityKey.split('|') : []
        }));
    }, [formatId, formatRarityKey]);
    const rarityOptions = useMemo(
        () => [
            ...new Set([
                'C',
                'U',
                'R',
                'SR',
                'SEC',
                'P',
                'UR',
                ...catalog.map((card) => card.rarity).filter(Boolean),
                ...formatRarities
            ])
        ],
        [catalog, formatRarityKey]
    );
    const filtersActive = Object.entries(filters).some(([key, value]) =>
        key === 'rarities'
            ? [...((value as string[]) || [])].sort().join('|') !==
              [...formatRarities].sort().join('|')
            : Array.isArray(value)
              ? value.length > 0
              : Boolean(value)
    );
    const cards = useMemo(() => new Map(catalog.map((card) => [card.code, card])), [catalog]);
    const pendingMetadata = entries
        .filter((entry) => !cards.get(entry.code)?.known && !metadataAttempted.has(entry.code))
        .map((entry) => entry.code);
    const pendingMetadataKey = pendingMetadata.join(',');
    const metadataPending = catalogBusy || (!catalogError && pendingMetadata.length > 0);
    const validationPending = metadataPending || rulesBusy;
    const validationReady = !validationPending && !catalogError;
    const validation = useMemo(
        () =>
            validateDeck(
                entries,
                cards,
                rules,
                rulesAvailable && !!format && pendingFormatRules(format).length === 0
            ),
        [entries, cards, rules, rulesAvailable, format]
    );
    const getCard = (code: string): Card =>
        cards.get(code) || {
            code,
            name: code,
            type: '',
            level: null,
            colors: [],
            cost: null,
            image: `https://digimon.digilab.cards/api/card/${code}.jpg`,
            payload: {},
            known: false,
            rarity: ''
        };
    const mergeDetails = (incoming: Card[]) =>
        setCatalog((old) => {
            const map = new Map(old.map((c) => [c.code, c]));
            for (const card of incoming) {
                if (card.known) map.set(card.code, card);
            }
            return [...map.values()];
        });
    const returnParams = p.has('libraryState')
        ? Object.fromEntries(new URLSearchParams(p.get('libraryState') || ''))
        : Object.fromEntries(p);
    const returnView =
        (
            { decks: 'decks', players: 'players', statistics: 'meta', meta: 'meta' } as Record<
                string,
                RouteName
            >
        )[p.get('returnView') || 'decks'] || 'tournaments';
    if (returnView === 'meta') {
        returnParams.format = p.get('returnFormat') || p.get('format') || '';
        returnParams.period = p.get('returnPeriod') || '';
        returnParams.store = p.get('returnStore') || '';
    }
    const backHref = context.href(returnView, returnParams);
    const navigateHref = (href: string) => {
        const url = new URL(href, location.href);
        const route = url.hash.slice(1) as RouteName;
        dirtyRef.current = false;
        setPendingHref('');
        context.navigate(route || 'decks', Object.fromEntries(url.searchParams));
    };
    const leave = (href: string) => (dirty ? setPendingHref(href) : navigateHref(href));

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    useEffect(() => {
        if (!context.active) return;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setSaveError('');

        setEntries([]);
        setMetadataAttempted(new Set());

        setDetail(null);
        Promise.all([
            loadDeck(context, controller.signal),
            loadFormats(controller.signal),
            loadDecks(context, controller.signal)
        ])
            .then(([loaded, availableFormats, types]) => {
                if (controller.signal.aborted) return;
                const event = loaded.result?.event as Record<string, unknown> | undefined;
                const selected = String(
                    event?.deck_format_id ||
                        loaded.deck.deck_format_id ||
                        availableFormats.find((f) => f.code === p.get('format'))?.id ||
                        availableFormats.find((f) => f.is_default)?.id ||
                        availableFormats.find((f) => f.is_active !== false)?.id ||
                        ''
                );
                setRecord(loaded.deck);
                setResult(loaded.result);
                setName(loaded.deck.name);
                setFormatId(selected);
                setFormats(availableFormats);
                const typeId = String(loaded.result?.deck_id || loaded.deck.archetype_id || '');
                setArchetypes(types);
                setArchetypeId(typeId);
                setEntries(loaded.entries);
                setSavedSignature(signature(loaded.deck.name, selected, loaded.entries, typeId));
                setLoading(false);
                urlRef.current = location.href;
                if (p.get('openImport') === '1') {
                    setImportOpen(true);
                    setImportPreview(null);
                    setImportText('');
                    const url = new URL(location.href);
                    url.searchParams.delete('openImport');
                    history.replaceState(history.state, '', url.href);
                    urlRef.current = url.href;
                }
            })
            .catch((e) => {
                if (!controller.signal.aborted) {
                    setError(e.message);
                    setLoading(false);
                }
            });
        return () => controller.abort();
    }, [context.active, identity, retry]);
    useEffect(() => {
        if (!context.active) return;
        const controller = new AbortController();
        setCatalogBusy(true);
        setCatalogError('');
        loadCatalog(context, controller.signal)
            .then(({ cards, warning }) => {
                if (!controller.signal.aborted) {
                    setCatalog(cards);
                    setCatalogWarning(warning);
                }
            })
            .catch((e) => {
                if (!controller.signal.aborted) setCatalogError(e.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setCatalogBusy(false);
            });
        return () => controller.abort();
    }, [context.active, catalogRetry]);
    useEffect(() => {
        if (!context.active) return;
        const controller = new AbortController();
        setRulesAvailable(false);
        setRulesBusy(true);
        loadAssets(context)
            .then((assets) => loadRules(controller.signal, assets))
            .then((rules) => {
                if (!controller.signal.aborted) {
                    setBaseRules(rules);
                    setRulesAvailable(true);
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) setRulesAvailable(false);
            })
            .finally(() => {
                if (!controller.signal.aborted) setRulesBusy(false);
            });
        return () => controller.abort();
    }, [context.active, rulesRetry]);
    useEffect(() => {
        if (!context.active || catalogBusy || catalogError || loading) return;
        const missing = pendingMetadata;
        if (!missing.length) return;
        let cancelled = false;
        Promise.allSettled(missing.map((code) => resolveDetails(context, code))).then((items) => {
            if (!cancelled) {
                mergeDetails(
                    items.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []))
                );
                setMetadataAttempted((old) => new Set([...old, ...missing]));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [context.active, loading, catalogBusy, catalogError, identity, pendingMetadataKey]);
    useEffect(() => {
        if (!context.active) return;
        const before = (e: BeforeUnloadEvent) => {
            if (dirtyRef.current) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        const click = (e: MouseEvent) => {
            if (
                !dirtyRef.current ||
                e.defaultPrevented ||
                e.button !== 0 ||
                e.ctrlKey ||
                e.metaKey ||
                e.shiftKey ||
                e.altKey
            )
                return;
            const anchor = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
            if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
            const url = new URL(anchor.href);
            if (url.origin !== location.origin || url.href === location.href) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            setPendingHref(url.href);
        };
        const back = () => {
            if (dirtyRef.current && location.href !== urlRef.current) {
                const target = location.href;
                history.pushState(history.state, '', urlRef.current);
                setPendingHref(target);
            }
        };
        window.addEventListener('beforeunload', before);
        document.addEventListener('click', click, true);
        window.addEventListener('popstate', back, true);
        return () => {
            window.removeEventListener('beforeunload', before);
            document.removeEventListener('click', click, true);
            window.removeEventListener('popstate', back, true);
        };
    }, [context.active]);
    useEffect(() => {
        if (!highlight) return;
        const timer = setTimeout(() => setHighlight(''), 3500);
        return () => clearTimeout(timer);
    }, [highlight]);
    const filter = (change: Partial<CatalogFilters>) => {
        setFilters((old) =>
            Object.entries(change).every(
                ([key, value]) => old[key as keyof CatalogFilters] === value
            )
                ? old
                : { ...old, ...change }
        );
    };
    const sets = context.data.getSnapshot().data.formats;
    const orderedCatalog = useMemo(() => orderCatalog(catalog, sets), [catalog, sets]);
    const matched = useMemo(
        () => filterCatalog(orderedCatalog, deferredFilters, rules),
        [orderedCatalog, deferredFilters, rules]
    );
    const counts = new Map(entries.map((e) => [e.code, e.qty]));
    const cannotAdd = (code: string) =>
        rulesBusy || !rulesAvailable || (counts.get(code) || 0) >= copyLimit(code, rules);
    const changeQty = (code: string, delta: number) => {
        if (delta > 0 && cannotAdd(code)) {
            setAnnouncement(
                `Limite de ${copyLimit(code, rules)} cópias para ${getCard(code).name}.`
            );
            return;
        }
        setEntries((old) => adjustCopies(old, code, delta, rules));

        setAnnouncement(
            `${getCard(code).name}: ${Math.max(0, (counts.get(code) || 0) + delta)} cópias no deck.`
        );
    };
    const openDetails = async (card: Card) => {
        const token = ++detailToken.current;
        setDetail(card);
        setDetailsBusy(true);
        setDetailsError('');
        try {
            const full = await resolveDetails(context, card.code);
            if (token === detailToken.current) {
                setDetail(full);
                mergeDetails([full]);
            }
        } catch {
            if (token === detailToken.current)
                setDetailsError('Não foi possível carregar os detalhes adicionais.');
        } finally {
            if (token === detailToken.current) setDetailsBusy(false);
        }
    };
    const showCard = (code: string) => {
        setMobileTab('deck');
        setValidationOpen(false);
        setHighlight(code);
        setTimeout(() => {
            const row = editorRef.current?.querySelector<HTMLElement>(`[data-deck-code="${code}"]`);
            row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            row?.focus();
        }, 80);
    };
    const save = async () => {
        if (saving || !record) return;
        if (!resultId && !archetypeId) {
            setSaveError('Selecione um tipo de deck cadastrado.');
            return;
        }
        if (!name.trim() || name.trim().length > 120 || !formatId) {
            setSaveError('Informe o nome do deck e um formato.');
            return;
        }
        setSaving(true);
        setSaveError('');

        const snapshot = signature(name, formatId, entries, archetypeId);
        try {
            const saved = await saveDraft({
                id: record.id,
                resultId,
                name: name.trim(),
                formatId,
                entries,
                revision: record.draft_revision,
                archetypeId,
                creatorPlayerId: record.creator_player_id
            });
            if (!alive.current) return;
            setRecord((old) =>
                old ? { ...old, id: saved.id, draft_revision: saved.draft_revision } : old
            );
            setSavedSignature(snapshot);
            setSaveToast(Date.now());
            if (!resultId) {
                const url = new URL(location.href);
                url.searchParams.set('decklistId', String(saved.id));
                url.searchParams.delete('new');
                history.replaceState(history.state, '', url.href);
                urlRef.current = url.href;
            }
        } catch (e) {
            if (alive.current) {
                setSaveError((e as Error).message);
            }
        } finally {
            if (alive.current) setSaving(false);
        }
    };
    const previewImport = async () => {
        setImportBusy(true);
        const parsed = parseImport(importText);
        try {
            const unknown = parsed.entries.filter((e) => !cards.get(e.code)?.known);
            const resolved = await Promise.allSettled(
                unknown.map((e) => resolveDetails(context, e.code))
            );
            const resolvedCards = resolved.flatMap((r) =>
                r.status === 'fulfilled' ? [r.value] : []
            );
            mergeDetails(resolvedCards);
            const importCards = new Map(cards);
            resolvedCards
                .filter((card) => card.known)
                .forEach((card) => importCards.set(card.code, card));
            setImportPreview({
                ...parsed,
                entries: sortEntries(parsed.entries, importCards, 'level')
            });
            setAcknowledged(false);
        } finally {
            setImportBusy(false);
        }
    };
    const unknownImport = importPreview?.entries.filter((e) => !cards.get(e.code)?.known) || [];
    const importCopyIssues = importPreview
        ? aggregate([...(importMode === 'add' ? entries : []), ...importPreview.entries]).filter(
              (entry) => entry.qty > copyLimit(entry.code, rules)
          )
        : [];
    const displayed = sortEntries(entries, cards, 'level');
    const groups = new Map<string, Entry[]>();
    for (const entry of displayed) {
        const key = groupName(cards.get(entry.code));
        groups.set(key, [...(groups.get(key) || []), entry]);
    }
    const issuesByCode = new Map<string, Issue[]>();
    for (const issue of validationReady ? validation.issues : [])
        for (const code of issue.codes)
            issuesByCode.set(code, [...(issuesByCode.get(code) || []), issue]);
    const panel = validationPending ? (
        <Loader text="Carregando dados para validação…" />
    ) : catalogError ? (
        <div className="ed-error" role="alert">
            Não foi possível carregar as cartas para validar o deck.
            <button className="ed-button" onClick={() => setCatalogRetry((value) => value + 1)}>
                Tentar novamente
            </button>
        </div>
    ) : (
        <RulesPanel
            validation={validation}
            rules={rules}
            showCard={showCard}
            retry={() => setRulesRetry((v) => v + 1)}
            available={rulesAvailable && pendingFormatRules(format).length === 0}
        />
    );
    if (!context.active) return null;
    if (loading) return <Loader text="Carregando deck…" />;
    if (error)
        return (
            <div className="ed-error" role="alert">
                {error}
                <button className="ed-button" onClick={() => setRetry((v) => v + 1)}>
                    Tentar novamente
                </button>
                <button className="ed-button" onClick={() => leave(backHref)}>
                    Voltar ao Deckbuilder
                </button>
            </div>
        );
    return (
        <section className="deck-editor" ref={editorRef} data-mobile-panel={mobileTab}>
            <div className="ed-breadcrumb">
                <button onClick={() => leave(backHref)}>Deckbuilder</button>
                <span>/</span>
                <span>{record?.id ? 'Editar deck' : 'Novo deck'}</span>
            </div>
            <header className={`ed-header${resultId ? ' ed-tournament-header' : ''}`}>
                <div className="ed-title">
                    <ul className="ed-context-tags" aria-label="Contexto do deck">
                        {!result && (
                            <li className="ed-archetype-tag">
                                <Portrait
                                    image={
                                        archetypes.find((deck) => String(deck.id) === archetypeId)
                                            ?.image
                                    }
                                />
                                <SearchSelect
                                    id="editor-archetype"
                                    label="Tipo de deck"
                                    placeholder="Buscar tipo de deck"
                                    value={archetypeId}
                                    commitOnly
                                    options={archetypes.map((deck) => ({
                                        value: String(deck.id),
                                        label: deck.name
                                    }))}
                                    onChange={(value) => {
                                        setArchetypeId(value);
                                    }}
                                />
                            </li>
                        )}
                        {result && (
                            <>
                                {!!(result.player as { name?: string })?.name && (
                                    <li title="Jogador" className="ed-context-pill">
                                        {String((result.player as { name?: string }).name)}
                                    </li>
                                )}
                                {!!(result.store as { name?: string })?.name && (
                                    <li title="Loja" className="ed-context-pill">
                                        {String((result.store as { name?: string }).name)}
                                    </li>
                                )}
                                {!!result.tournament_date && (
                                    <li title="Data" className="ed-context-pill">
                                        {new Date(
                                            String(result.tournament_date) + 'T12:00:00'
                                        ).toLocaleDateString('pt-BR')}
                                    </li>
                                )}
                            </>
                        )}
                        {format && !resultId && (
                            <li title="Formato" className="ed-format-tag">
                                {result ? (
                                    <strong>{format.name}</strong>
                                ) : (
                                    <Select
                                        label="Formato do deck"
                                        overlay
                                        value={formatId}
                                        onChange={(value) => {
                                            setFormatId(value);
                                        }}
                                        options={formats
                                            .filter(
                                                (f) =>
                                                    f.is_active !== false ||
                                                    String(f.id) === formatId
                                            )
                                            .map((f) => ({
                                                value: String(f.id),
                                                label: f.name || f.code
                                            }))}
                                    />
                                )}
                                <FormatRulesButton format={format} rules={rules} />
                            </li>
                        )}
                        {result && !!(result.event as Record<string, unknown>)?.tournament_name && (
                            <li title="Tipo do torneio" className="ed-context-pill">
                                {String(
                                    (result.event as Record<string, unknown>).tournament_name
                                ).replace(/_/g, ' ')}
                            </li>
                        )}
                        {!result && record?.creator && (
                            <li title="Criado por" className="ed-context-pill">
                                {record.creator.name}
                            </li>
                        )}
                        {resultId && tournamentCollection && (
                            <li title="Coleção do torneio" className="ed-context-pill">
                                {tournamentCollection.code || tournamentCollection.name}
                            </li>
                        )}
                        {resultId && format && !standardFormat && (
                            <li title="Formato" className="ed-context-pill ed-format-pill">
                                <FormatRulesButton format={format} rules={rules} pill />
                            </li>
                        )}
                    </ul>
                </div>
                <div className="ed-header-actions">
                    <button
                        className="ed-button"
                        disabled={!entries.length}
                        onClick={() => setClearOpen(true)}
                    >
                        <EditorIcon name="trash" /> Limpar
                    </button>
                    <button
                        className="ed-button"
                        onClick={() => {
                            setImportOpen(true);
                            setImportPreview(null);
                            setImportText('');
                        }}
                    >
                        <EditorIcon name="upload" /> Importar lista
                    </button>
                    <button className="ed-button ed-primary" disabled={saving} onClick={save}>
                        <EditorIcon name="save" /> {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                    <div className="ed-more">
                        <button
                            className="ed-button"
                            aria-expanded={moreActions}
                            onClick={() => setMoreActions(!moreActions)}
                        >
                            Mais ações ⌄
                        </button>
                        {moreActions && (
                            <div className="ed-more-menu">
                                <button
                                    onClick={async () => {
                                        setMoreActions(false);
                                        const text = entries
                                            .map((e) => `${e.qty} ${e.code}`)
                                            .join('\n');
                                        try {
                                            await navigator.clipboard.writeText(text);
                                            setAnnouncement('Lista copiada.');
                                        } catch {
                                            const blob = new Blob([text], {
                                                type: 'text/plain;charset=utf-8'
                                            });
                                            const url = URL.createObjectURL(blob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.download = 'decklist.txt';
                                            link.click();
                                            URL.revokeObjectURL(url);
                                            setAnnouncement('Lista exportada.');
                                        }
                                    }}
                                >
                                    ⇥ Exportar lista
                                </button>
                                <button
                                    disabled={!entries.length}
                                    onClick={() => {
                                        setMoreActions(false);
                                        setImageOpen(true);
                                    }}
                                >
                                    <EditorIcon name="image" /> Gerar imagem
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            {saveToast > 0 && (
                <div className="ed-save-toast" role="status" aria-live="polite">
                    <EditorIcon name="check" />
                    <span>Deck salvo com sucesso.</span>
                    <button aria-label="Fechar aviso" onClick={() => setSaveToast(0)}>
                        ×
                    </button>
                </div>
            )}
            {imageOpen && (
                <DeckImageDialog
                    context={context}
                    entries={sortEntries(entries, cards, 'level')}
                    cards={cards}
                    scoring={
                        rules.points_limit !== null
                            ? {
                                  limit: rules.points_limit,
                                  points: Object.fromEntries(
                                      Object.entries(rules.card_points).map(([code, value]) => [
                                          code,
                                          value.points
                                      ])
                                  )
                              }
                            : undefined
                    }
                    metadata={{
                        name,
                        format: format?.name || '',
                        player: String(
                            (result?.player as { name?: string })?.name ||
                                record?.creator?.name ||
                                ''
                        ),
                        store: String((result?.store as { name?: string })?.name || ''),
                        date: result?.tournament_date
                            ? new Date(
                                  String(result.tournament_date) + 'T12:00:00'
                              ).toLocaleDateString('pt-BR')
                            : '',
                        tournament: String(
                            (result?.event as Record<string, unknown>)?.tournament_name || ''
                        ).replace(/_/g, ' ')
                    }}
                    onClose={() => setImageOpen(false)}
                />
            )}
            {saveError && (
                <div className="ed-error" role="alert">
                    {saveError}
                    <button className="ed-button" disabled={saving} onClick={save}>
                        Tentar salvar novamente
                    </button>
                </div>
            )}
            <div className="ed-sr-only" role="status" aria-live="polite">
                {announcement}
            </div>
            <section className="ed-catalog-filters" aria-label="Filtros do Card pool">
                <div className="ed-catalog-filters-main">
                    <div className="ed-search">
                        <label htmlFor="card-pool-query" className="ed-search-label">
                            Filtro livre
                        </label>
                        <input
                            id="card-pool-query"
                            aria-label="Filtro livre"
                            value={filters.query}
                            placeholder="Buscar por nome da carta ou código (ex.: BT17-001)"
                            onChange={(e) => filter({ query: e.target.value })}
                        />
                        <button aria-label="Limpar pesquisa" onClick={() => filter({ query: '' })}>
                            ×
                        </button>
                    </div>
                    <div className="ed-filter-row">
                        <CatalogMultiSelect
                            id="card-pool-colors"
                            label="Cor"
                            values={filters.colors || []}
                            options={Object.entries(colorLabels).map(([value, label]) => ({
                                value,
                                label
                            }))}
                            onChange={(colors) => filter({ colors })}
                        />
                        <label>
                            Nível
                            <select
                                value={filters.level}
                                onChange={(e) => filter({ level: e.target.value })}
                            >
                                <option value="">Todos</option>
                                {[2, 3, 4, 5, 6, 7].map((v) => (
                                    <option key={v} value={v}>
                                        Nível {v}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Tipo
                            <select
                                value={filters.type}
                                onChange={(e) => filter({ type: e.target.value })}
                            >
                                <option value="">Todos</option>
                                {Object.entries(labels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="ed-filter-row">
                        <CatalogMultiSelect
                            id="card-pool-rarities"
                            label="Raridade"
                            values={filters.rarities || []}
                            options={rarityOptions.map((value) => ({ value, label: value }))}
                            onChange={(rarities) => filter({ rarities })}
                        />
                        <label>
                            Custo
                            <input
                                type="number"
                                min={0}
                                max={30}
                                value={filters.cost}
                                onChange={(e) => filter({ cost: e.target.value })}
                            />
                        </label>
                        <label>
                            Coleção
                            <input
                                type="search"
                                placeholder="Ex.: BT17"
                                autoComplete="off"
                                value={filters.set}
                                onChange={(e) => filter({ set: e.target.value })}
                            />
                        </label>
                    </div>
                </div>
                {filtersActive && (
                    <button
                        className="ed-text-button ed-catalog-clear"
                        onClick={() => {
                            setFilters({
                                ...emptyFilters,
                                rarities: rules.allowed_rarities.map(normalizeRarity)
                            });
                        }}
                    >
                        Limpar filtros
                    </button>
                )}
            </section>
            <div className="ed-mobile-tabs" role="tablist" aria-label="Área do editor">
                <button
                    role="tab"
                    aria-selected={mobileTab === 'catalog'}
                    aria-controls="editor-catalog"
                    onClick={() => setMobileTab('catalog')}
                >
                    ▦ Cartas
                </button>
                <button
                    role="tab"
                    aria-selected={mobileTab === 'deck'}
                    aria-controls="editor-deck"
                    onClick={() => setMobileTab('deck')}
                >
                    ▤ Meu deck{validationReady ? ` (${validation.main})` : ''}
                </button>
            </div>
            <div
                className="ed-workspace"
                aria-busy={catalogBusy || metadataPending || validationPending}
            >
                <section className="ed-panel ed-catalog" id="editor-catalog" aria-label="Card pool">
                    <div className="ed-panel-heading">
                        <h2>Card pool</h2>
                        <span className="ed-sr-only" role="status">
                            {matched.length} resultados
                        </span>
                    </div>
                    {catalogWarning && (
                        <p className="ed-notice">
                            {catalogWarning}
                            <button
                                className="ed-text-button"
                                onClick={() => setCatalogRetry((v) => v + 1)}
                            >
                                Atualizar catálogo
                            </button>
                        </p>
                    )}
                    {catalogBusy ? (
                        <Loader text="Carregando cartas…" />
                    ) : catalogError ? (
                        <p className="ed-error" role="alert">
                            {catalogError}
                            <button
                                className="ed-button"
                                onClick={() => setCatalogRetry((v) => v + 1)}
                            >
                                Tentar novamente
                            </button>
                        </p>
                    ) : (
                        <>
                            <div className="ed-catalog-scroll" ref={catalogScroll}>
                                <CatalogViewport
                                    key={JSON.stringify(deferredFilters)}
                                    cards={matched}
                                >
                                    {(card, index) => {
                                        const reason = cardEligibility(card, rules);
                                        const limit = rules.limited_cards[card.code];
                                        return (
                                            <article
                                                className="ed-catalog-card"
                                                key={card.code}
                                                role="listitem"
                                                aria-posinset={index + 1}
                                                aria-setsize={matched.length}
                                            >
                                                <div className="ed-catalog-art">
                                                    <CardImage
                                                        card={card}
                                                        points={
                                                            rules.points_limit !== null
                                                                ? rules.card_points[card.code]
                                                                      ?.points
                                                                : undefined
                                                        }
                                                    />
                                                    <div className="ed-catalog-hover-actions">
                                                        <button
                                                            className="ed-button ed-card-info"
                                                            aria-label={`Informações de ${card.name} (${card.code})`}
                                                            onClick={() => void openDetails(card)}
                                                        >
                                                            i
                                                        </button>
                                                        <button
                                                            className="ed-button ed-card-hover-add"
                                                            aria-label={`Adicionar ${card.name} (${card.code})`}
                                                            disabled={cannotAdd(card.code)}
                                                            onClick={() => changeQty(card.code, 1)}
                                                        >
                                                            + Add
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="ed-catalog-card-caption">
                                                    <strong>{card.name}</strong>
                                                    <small>{card.code}</small>
                                                </div>
                                                {counts.get(card.code) ? (
                                                    <small className="ed-owned">
                                                        No deck: {counts.get(card.code)}
                                                    </small>
                                                ) : null}
                                                {(reason || limit !== undefined || !card.known) && (
                                                    <small className="ed-warning">
                                                        {reason ||
                                                            (limit !== undefined
                                                                ? `Limite: ${limit} ${limit === 1 ? 'cópia' : 'cópias'}`
                                                                : 'Metadados não confirmados')}
                                                    </small>
                                                )}
                                            </article>
                                        );
                                    }}
                                </CatalogViewport>
                                {!matched.length && (
                                    <p className="ed-empty">
                                        Nenhuma carta encontrada. Ajuste a busca ou os filtros.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </section>
                <section className="ed-panel ed-deck" id="editor-deck" aria-label="Meu deck">
                    <div className="ed-panel-heading ed-deck-heading">
                        <div className="ed-deck-title">
                            {!resultId && (
                                <label className="ed-sr-only" htmlFor="editor-name">
                                    Nome do deck
                                </label>
                            )}
                            <h1 className="ed-title-heading">
                                {resultId ? (
                                    <span className="ed-fixed-name">{name}</span>
                                ) : (
                                    <>
                                        <textarea
                                            id="editor-name"
                                            ref={nameField}
                                            rows={1}
                                            value={name}
                                            maxLength={120}
                                            onChange={(e) => {
                                                setName(e.target.value.replace(/[\r\n]+/g, ' '));
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    event.currentTarget.blur();
                                                }
                                            }}
                                        />
                                        <button
                                            className="ed-rename"
                                            type="button"
                                            aria-label="Renomear deck"
                                            title="Renomear deck"
                                            onClick={() => {
                                                const input = document.getElementById(
                                                    'editor-name'
                                                ) as HTMLTextAreaElement;
                                                input.focus();
                                                input.select();
                                            }}
                                        >
                                            <EditorIcon name="pencil" />
                                        </button>
                                    </>
                                )}
                            </h1>

                            {validationReady && (
                                <div className="ed-deck-totals">
                                    <strong>
                                        {validation.main} / {rules.main_count}{' '}
                                        <span className="ed-muted">cartas</span>
                                    </strong>
                                    <span className="ed-muted">· {validation.eggs} Digi-Eggs</span>
                                    {rules.points_limit !== null && (
                                        <span
                                            className="ed-deck-points"
                                            data-over={validation.points > rules.points_limit}
                                        >
                                            · {validation.points} / {rules.points_limit} pontos
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="ed-deck-toolbar">
                            <fieldset className="ed-view-switch">
                                <legend className="ed-sr-only">Visualizar decklist</legend>
                                {(['photo', 'list'] as const).map((view) => (
                                    <label key={view}>
                                        <input
                                            type="radio"
                                            name="deck-view"
                                            value={view}
                                            checked={deckView === view}
                                            onChange={() => setDeckView(view)}
                                        />
                                        <span>{view === 'list' ? 'Lista' : 'Foto'}</span>
                                    </label>
                                ))}
                            </fieldset>
                        </div>
                    </div>
                    <div className="ed-deck-scroll">
                        {metadataPending && <Loader text="Carregando cartas do deck…" />}
                        {!metadataPending && deckView === 'photo' && (
                            <div className="ed-photo-grid">
                                {displayed.map((entry) => {
                                    const card = getCard(entry.code);
                                    const issues = issuesByCode.get(entry.code) || [];
                                    return (
                                        <article
                                            key={entry.code}
                                            data-deck-code={entry.code}
                                            tabIndex={-1}
                                            className={`ed-photo-card${issues.length ? ' has-issue' : ''}${highlight === entry.code ? ' is-highlighted' : ''}`}
                                        >
                                            <div className="ed-photo-art">
                                                <CardImage
                                                    card={card}
                                                    points={
                                                        rules.points_limit !== null
                                                            ? rules.card_points[card.code]?.points
                                                            : undefined
                                                    }
                                                    onClick={() => void openDetails(card)}
                                                />
                                                <CardWarning
                                                    name={card.name}
                                                    issues={issues}
                                                    onClick={() => setValidationOpen(true)}
                                                />
                                                <span
                                                    className="ed-photo-quantity"
                                                    aria-label={`${entry.qty} cópias de ${card.name}`}
                                                >
                                                    ×{entry.qty}
                                                </span>
                                            </div>
                                            <div className="ed-stepper ed-photo-stepper">
                                                <button
                                                    aria-label={`Remover uma cópia de ${card.name}`}
                                                    onClick={() => changeQty(entry.code, -1)}
                                                >
                                                    −
                                                </button>
                                                <output aria-label={`Quantidade de ${card.name}`}>
                                                    {entry.qty}
                                                </output>
                                                <button
                                                    aria-label={`Adicionar uma cópia de ${card.name}`}
                                                    disabled={cannotAdd(entry.code)}
                                                    onClick={() => changeQty(entry.code, 1)}
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <span className="ed-photo-code">{entry.code}</span>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                        {!metadataPending &&
                            deckView === 'list' &&
                            [...groups].map(([group, items]) => (
                                <section className="ed-deck-group" key={group}>
                                    <div className="ed-group-heading">
                                        <h3>{group}</h3>
                                        <span>
                                            {items.reduce((sum, e) => sum + e.qty, 0)} cartas
                                        </span>
                                    </div>
                                    {items.map((entry) => {
                                        const card = getCard(entry.code),
                                            issues = issuesByCode.get(entry.code) || [];
                                        return (
                                            <article
                                                className={`ed-deck-row${issues.length ? ' has-issue' : ''}${highlight === entry.code ? ' is-highlighted' : ''}`}
                                                key={entry.code}
                                                data-deck-code={entry.code}
                                                tabIndex={-1}
                                            >
                                                <div className="ed-row-art">
                                                    <CardImage
                                                        card={card}
                                                        points={
                                                            rules.points_limit !== null
                                                                ? rules.card_points[card.code]
                                                                      ?.points
                                                                : undefined
                                                        }
                                                        small
                                                        onClick={() => void openDetails(card)}
                                                    />
                                                    <CardWarning
                                                        name={card.name}
                                                        issues={issues}
                                                        onClick={() => setValidationOpen(true)}
                                                    />
                                                </div>
                                                <div className="ed-row-info">
                                                    <button
                                                        className="ed-card-name"
                                                        onClick={() => void openDetails(card)}
                                                    >
                                                        {card.name}
                                                    </button>
                                                    <div className="ed-row-meta">
                                                        <span
                                                            className="ed-color-dots"
                                                            aria-label={card.colors
                                                                .map((c) => colorLabels[c])
                                                                .join(', ')}
                                                        >
                                                            {card.colors.map((c) => (
                                                                <span
                                                                    key={c}
                                                                    style={{
                                                                        background: colorHex[c]
                                                                    }}
                                                                />
                                                            ))}
                                                        </span>
                                                        <span>{card.code}</span>
                                                        {card.level != null && card.level > 0 && (
                                                            <span>Lv.{card.level}</span>
                                                        )}
                                                        <span>
                                                            {labels[card.type] ||
                                                                'Tipo não confirmado'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="ed-stepper">
                                                    <button
                                                        aria-label={`Remover uma cópia de ${card.name}`}
                                                        onClick={() => changeQty(entry.code, -1)}
                                                    >
                                                        −
                                                    </button>
                                                    <output
                                                        aria-label={`Quantidade de ${card.name}`}
                                                    >
                                                        {entry.qty}
                                                    </output>
                                                    <button
                                                        aria-label={`Adicionar uma cópia de ${card.name}`}
                                                        disabled={cannotAdd(entry.code)}
                                                        onClick={() => changeQty(entry.code, 1)}
                                                    >
                                                        ＋
                                                    </button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </section>
                            ))}
                        {!metadataPending && !displayed.length && (
                            <div className="ed-empty">
                                <p>Adicione cartas pelo catálogo ou importe uma lista.</p>
                            </div>
                        )}
                    </div>
                </section>
                <aside className="ed-panel ed-validation-desktop">{panel}</aside>
                <details className="ed-validation-intermediate">
                    <summary>
                        Validação do deck
                        {validationReady
                            ? ` · ${validation.issues.length} pendências`
                            : validationPending
                              ? ' · Carregando…'
                              : ' · Indisponível'}
                    </summary>
                    <div className="ed-panel">{panel}</div>
                </details>
            </div>
            <div className="ed-mobile-bar">
                {validationReady ? (
                    <span>
                        <strong>
                            {validation.main} / {rules.main_count}
                        </strong>
                        <small>{validation.issues.length} pendências</small>
                    </span>
                ) : (
                    <span>
                        {validationPending ? 'Carregando validação…' : 'Validação indisponível'}
                    </span>
                )}
                <button className="ed-button" onClick={() => setValidationOpen(true)}>
                    ⚠ Validar
                </button>
                <button className="ed-button ed-primary" disabled={saving} onClick={save}>
                    <EditorIcon name="save" /> {saving ? 'Salvando…' : 'Salvar'}
                </button>
            </div>
            {pendingHref && (
                <Dialog title="Alterações não salvas" onClose={() => setPendingHref('')}>
                    <div className="ed-dialog-body">
                        <p>Seu deck tem alterações que ainda não foram salvas.</p>
                        <div className="ed-dialog-actions">
                            <button
                                className="ed-button ed-primary"
                                onClick={() => setPendingHref('')}
                            >
                                Continuar editando
                            </button>
                            <button className="ed-button" onClick={() => navigateHref(pendingHref)}>
                                Descartar alterações e sair
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}
            {clearOpen && (
                <Dialog title="Limpar deck?" onClose={() => setClearOpen(false)}>
                    <div className="ed-dialog-body">
                        <p>
                            Todas as cartas do rascunho serão removidas. Salve para atualizar a
                            lista no sistema.
                        </p>
                        <button
                            className="ed-button ed-primary"
                            onClick={() => {
                                setEntries([]);
                                setClearOpen(false);

                                setAnnouncement('Deck esvaziado.');
                            }}
                        >
                            Confirmar limpeza
                        </button>
                    </div>
                </Dialog>
            )}
            {validationOpen && (
                <Dialog title="Validação do deck" onClose={() => setValidationOpen(false)}>
                    <div className="ed-dialog-body">{panel}</div>
                </Dialog>
            )}
            {detail && (
                <Dialog
                    title={`${detail.name} · ${detail.code}`}
                    onClose={() => {
                        detailToken.current++;
                        setDetail(null);
                    }}
                    wide
                >
                    <div className="ed-dialog-body ed-card-detail">
                        <CardImage
                            card={detail}
                            points={
                                rules.points_limit !== null
                                    ? rules.card_points[detail.code]?.points
                                    : undefined
                            }
                        />
                        <div>
                            <p>
                                {labels[detail.type] || 'Tipo não confirmado'}
                                {detail.level ? ` · Nível ${detail.level}` : ''}
                            </p>
                            <p>{detail.colors.map((c) => colorLabels[c]).join(' / ')}</p>
                            {detail.rarity && <p>Raridade: {detail.rarity}</p>}
                            {detailsBusy && <p role="status">Carregando detalhes…</p>}
                            {detailsError && <p role="alert">{detailsError}</p>}
                            {['main_effect', 'source_effect', 'security_effect', 'alt_effect'].map(
                                (key) =>
                                    detail.payload[key] ? (
                                        <section key={key}>
                                            <h3>
                                                {
                                                    {
                                                        main_effect: 'Efeito',
                                                        source_effect: 'Efeito herdado',
                                                        security_effect: 'Efeito de segurança',
                                                        alt_effect: 'Efeito adicional'
                                                    }[key]
                                                }
                                            </h3>
                                            <p>{String(detail.payload[key])}</p>
                                        </section>
                                    ) : null
                            )}
                            <div className="ed-detail-quantity">
                                {!!counts.get(detail.code) && (
                                    <div className="ed-stepper">
                                        <button
                                            aria-label={`Remover uma cópia de ${detail.name}`}
                                            onClick={() => changeQty(detail.code, -1)}
                                        >
                                            −
                                        </button>
                                        <output aria-label={`Quantidade de ${detail.name}`}>
                                            {counts.get(detail.code)}
                                        </output>
                                        <button
                                            aria-label={`Adicionar uma cópia de ${detail.name}`}
                                            disabled={cannotAdd(detail.code)}
                                            onClick={() => changeQty(detail.code, 1)}
                                        >
                                            ＋
                                        </button>
                                    </div>
                                )}
                                <button
                                    className="ed-button ed-primary"
                                    disabled={cannotAdd(detail.code)}
                                    onClick={() => changeQty(detail.code, 1)}
                                >
                                    ＋ Adicionar ao deck
                                </button>
                            </div>
                        </div>
                    </div>
                </Dialog>
            )}
            {importOpen && (
                <Dialog
                    title="Importar lista"
                    onClose={() => setImportOpen(false)}
                    busy={importBusy}
                    wide
                >
                    <div className="ed-dialog-body">
                        {!result && (
                            <label>
                                Tipo de deck
                                <select
                                    aria-label="Tipo de deck da importação"
                                    value={archetypeId}
                                    onChange={(e) => {
                                        setArchetypeId(e.target.value);
                                    }}
                                    required
                                >
                                    <option value="">Selecione um tipo de deck</option>
                                    {archetypes.map((deck) => (
                                        <option key={deck.id} value={deck.id}>
                                            {deck.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <label>
                            Cole a decklist
                            <textarea
                                rows={8}
                                value={importText}
                                onChange={(e) => {
                                    setImportText(e.target.value);
                                    setImportPreview(null);
                                }}
                                placeholder={'4 BT1-010\n4 BT17-001'}
                            />
                        </label>
                        <button
                            className="ed-button"
                            disabled={!importText.trim() || importBusy}
                            onClick={() => void previewImport()}
                        >
                            {importBusy ? 'Reconhecendo cartas…' : 'Ver prévia da importação'}
                        </button>
                        {importPreview && (
                            <>
                                {!!importCopyIssues.length && (
                                    <p className="ed-error" role="alert">
                                        Ajuste as quantidades antes de importar:{' '}
                                        {importCopyIssues
                                            .map(
                                                (entry) =>
                                                    `${entry.code}: máximo de ${copyLimit(entry.code, rules)} cópias`
                                            )
                                            .join('; ')}
                                        .
                                    </p>
                                )}
                                <h3>
                                    {importPreview.entries.reduce((sum, e) => sum + e.qty, 0)}{' '}
                                    cartas em {importPreview.entries.length} códigos
                                </h3>
                                <ul className="ed-import-list">
                                    {importPreview.entries.map((entry) => (
                                        <li key={entry.code}>
                                            {entry.qty} × {entry.code} · {getCard(entry.code).name}
                                            {!cards.get(entry.code)?.known && (
                                                <strong className="ed-warning">
                                                    {' '}
                                                    · Código não encontrado no catálogo
                                                </strong>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                {importPreview.errors.length > 0 && (
                                    <div className="ed-warning">
                                        <strong>Linhas não reconhecidas</strong>
                                        <ul>
                                            {importPreview.errors.map((line, index) => (
                                                <li key={index}>{line}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {(unknownImport.length > 0 || importPreview.errors.length > 0) && (
                                    <label className="ed-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={acknowledged}
                                            onChange={(e) => setAcknowledged(e.target.checked)}
                                        />{' '}
                                        Entendi: códigos desconhecidos serão mantidos com pendência;
                                        linhas não reconhecidas não serão importadas.
                                    </label>
                                )}
                                <fieldset>
                                    <legend>Como importar?</legend>
                                    <label className="ed-checkbox">
                                        <input
                                            type="radio"
                                            name="import-mode"
                                            checked={importMode === 'replace'}
                                            onChange={() => setImportMode('replace')}
                                        />{' '}
                                        Substituir todas as cartas atuais
                                    </label>
                                    <label className="ed-checkbox">
                                        <input
                                            type="radio"
                                            name="import-mode"
                                            checked={importMode === 'add'}
                                            onChange={() => setImportMode('add')}
                                        />{' '}
                                        Adicionar às cartas atuais
                                    </label>
                                </fieldset>
                                <button
                                    className="ed-button ed-primary"
                                    disabled={
                                        (!result && !archetypeId) ||
                                        !importPreview.entries.length ||
                                        importCopyIssues.length > 0 ||
                                        rulesBusy ||
                                        !rulesAvailable ||
                                        ((unknownImport.length > 0 ||
                                            importPreview.errors.length > 0) &&
                                            !acknowledged)
                                    }
                                    onClick={() => {
                                        setEntries((old) =>
                                            sortEntries(
                                                aggregate([
                                                    ...(importMode === 'add' ? old : []),
                                                    ...importPreview.entries
                                                ]),
                                                cards,
                                                'level'
                                            )
                                        );

                                        setImportOpen(false);

                                        setAnnouncement(
                                            'Lista importada. Revise as pendências antes de salvar.'
                                        );
                                    }}
                                >
                                    {importMode === 'replace'
                                        ? 'Substituir conteúdo do deck'
                                        : 'Adicionar cartas ao deck'}
                                </button>
                            </>
                        )}
                    </div>
                </Dialog>
            )}
        </section>
    );
}
