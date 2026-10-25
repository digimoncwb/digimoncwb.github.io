import { useEffect, useId, useState } from 'react';
import type { MicroContext } from '../../contracts';
import { tryCardImageFallback } from '../../shared/card-image-fallback';
import { loadCatalog } from '../builder/editor-service';
import { textKey, type Card, type FormatRules } from '../builder/editor-model';
import { addBanlistRule, type BanlistKind } from './format-banlist-model';

function CopyLimit({
    code,
    copies,
    onChange
}: {
    code: string;
    copies: number;
    onChange(value: number): void;
}) {
    const [draft, setDraft] = useState(String(copies));
    useEffect(() => setDraft(String(copies)), [copies]);
    return (
        <label>
            Máximo de cópias
            <input
                aria-label={`Limite de ${code}`}
                type="number"
                min="0"
                max="999"
                step="1"
                required
                value={draft}
                onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft(value);
                    if (value !== '' && event.currentTarget.validity.valid) onChange(Number(value));
                }}
            />
        </label>
    );
}

function CardPicker({
    label,
    value,
    onChange,
    catalog
}: {
    label: string;
    value: string;
    onChange(value: string): void;
    catalog: Card[];
}) {
    const id = useId();
    const matches =
        value.trim() && !catalog.some((card) => card.code === value)
            ? catalog
                  .filter((card) => textKey(`${card.code} ${card.name}`).includes(textKey(value)))
                  .slice(0, 6)
            : [];
    return (
        <div className="format-banlist-picker">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                value={value}
                placeholder="Nome ou código da carta"
                autoComplete="off"
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                }}
            />
            {!!matches.length && (
                <div className="format-card-suggestions" aria-label={`Sugestões: ${label}`}>
                    {matches.map((card) => (
                        <button
                            type="button"
                            className="format-card-suggestion"
                            key={card.code}
                            onClick={() => onChange(card.code)}
                        >
                            <span>
                                <strong>{card.name}</strong>
                                <small>{card.code}</small>
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {catalog.find((card) => card.code === value)?.name && (
                <small>{catalog.find((card) => card.code === value)?.name}</small>
            )}
        </div>
    );
}

export function FormatBanlistEditor({
    context,
    rules,
    onChange
}: {
    context: MicroContext;
    rules: FormatRules;
    onChange(rules: FormatRules): void;
}) {
    const [catalog, setCatalog] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [catalogError, setCatalogError] = useState('');
    const [retry, setRetry] = useState(0);
    const [kind, setKind] = useState<BanlistKind>('banned');
    const [first, setFirst] = useState('');
    const [second, setSecond] = useState('');
    const [limit, setLimit] = useState('1');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setCatalogError('');
        loadCatalog(context, controller.signal)
            .then(({ cards }) => {
                if (!controller.signal.aborted) setCatalog(cards);
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setCatalogError(
                        'A busca de cartas está indisponível. Você pode cadastrar pelo código.'
                    );
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [context, retry]);
    const names = new Map(catalog.map((card) => [card.code, card.name]));
    function card(code: string) {
        return (
            <span className="format-registry-card">
                <img
                    src={`https://digimon.digilab.cards/api/card/${encodeURIComponent(code)}.jpg`}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                        if (!tryCardImageFallback(event.currentTarget, code))
                            event.currentTarget.hidden = true;
                    }}
                />
                <span>
                    <strong>{names.get(code) || code}</strong>
                    {names.has(code) && <small className="format-registry-card-code">{code}</small>}
                </span>
            </span>
        );
    }
    const banned = rules.banned_codes || [];
    const limited = Object.entries(rules.limited_cards || {});
    const groups = rules.choice_groups || [];
    return (
        <fieldset className="format-banlist-editor">
            <legend>Banlist personalizada</legend>
            <p className="muted">
                Cadastre restrições exclusivas deste formato. As alterações são gravadas ao clicar
                em “Salvar formato”.
            </p>
            {loading && <p role="status">Carregando busca de cartas…</p>}
            {catalogError && (
                <p role="status">
                    {catalogError}{' '}
                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => setRetry(retry + 1)}
                    >
                        Tentar novamente
                    </button>
                </p>
            )}
            <div className="format-banlist-add">
                <label>
                    Tipo de restrição
                    <select
                        value={kind}
                        onChange={(event) => {
                            setKind(event.target.value as BanlistKind);
                            setError('');
                            setMessage('');
                        }}
                    >
                        <option value="banned">Carta banida</option>
                        <option value="limited">Limite de cópias</option>
                        <option value="pair">Pair-ban</option>
                    </select>
                </label>
                <CardPicker
                    label={kind === 'pair' ? 'Primeira carta' : 'Carta'}
                    value={first}
                    onChange={setFirst}
                    catalog={catalog}
                />
                {kind === 'pair' && (
                    <CardPicker
                        label="Segunda carta"
                        value={second}
                        onChange={setSecond}
                        catalog={catalog}
                    />
                )}
                {kind === 'limited' && (
                    <label>
                        Máximo de cópias
                        <input
                            type="number"
                            min="1"
                            max="999"
                            step="1"
                            value={limit}
                            onChange={(event) => setLimit(event.target.value)}
                        />
                    </label>
                )}
                {kind === 'pair' && (
                    <p className="muted">
                        As duas cartas não podem estar juntas no mesmo deck. Cada uma pode ser usada
                        separadamente, respeitando seu limite de cópias.
                    </p>
                )}
                <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                        setMessage('');
                        setError('');
                        try {
                            onChange(addBanlistRule(rules, kind, first, second, Number(limit)));
                            setFirst('');
                            setSecond('');
                            setMessage('Restrição adicionada. Salve o formato para confirmar.');
                        } catch (error) {
                            setError((error as Error).message);
                        }
                    }}
                >
                    Adicionar restrição
                </button>
                {error && <p role="alert">{error}</p>}
                <p role="status" aria-live="polite">
                    {message}
                </p>
            </div>
            <section aria-label="Cartas banidas">
                <h4>Banidas ({banned.length})</h4>
                {!banned.length && <p className="muted">Nenhuma carta banida neste formato.</p>}
                {banned.map((code) => (
                    <div className="format-banlist-row" key={code}>
                        {card(code)}
                        <button
                            type="button"
                            className="button secondary"
                            aria-label={`Remover banimento de ${code}`}
                            onClick={() =>
                                onChange({
                                    ...rules,
                                    banned_codes: banned.filter((item) => item !== code)
                                })
                            }
                        >
                            Remover
                        </button>
                    </div>
                ))}
            </section>
            <section aria-label="Cartas limitadas">
                <h4>Limitadas ({limited.length})</h4>
                {!limited.length && <p className="muted">Nenhum limite específico cadastrado.</p>}
                {limited.map(([code, copies]) => (
                    <div className="format-banlist-row" key={code}>
                        {card(code)}
                        <CopyLimit
                            code={code}
                            copies={copies}
                            onChange={(value) =>
                                onChange({
                                    ...rules,
                                    limited_cards: { ...rules.limited_cards, [code]: value }
                                })
                            }
                        />
                        <button
                            type="button"
                            className="button secondary"
                            aria-label={`Remover limite de ${code}`}
                            onClick={() =>
                                onChange({
                                    ...rules,
                                    limited_cards: Object.fromEntries(
                                        limited.filter(([item]) => item !== code)
                                    )
                                })
                            }
                        >
                            Remover
                        </button>
                    </div>
                ))}
            </section>
            <section aria-label="Combinações restritas">
                <h4>Pair-bans e combinações ({groups.length})</h4>
                {!groups.length && <p className="muted">Nenhuma combinação restrita cadastrada.</p>}
                {groups.map((group, index) => (
                    <div className="format-banlist-row" key={index}>
                        <div className="format-banlist-group">
                            {group.map((code) => (
                                <span key={code}>{card(code)}</span>
                            ))}
                            <small>Use apenas uma das cartas desta combinação no deck.</small>
                        </div>
                        <button
                            type="button"
                            className="button secondary"
                            aria-label={`Remover combinação ${group.join(' e ')}`}
                            onClick={() =>
                                onChange({
                                    ...rules,
                                    choice_groups: groups.filter((_, item) => item !== index)
                                })
                            }
                        >
                            Remover
                        </button>
                    </div>
                ))}
            </section>
        </fieldset>
    );
}
