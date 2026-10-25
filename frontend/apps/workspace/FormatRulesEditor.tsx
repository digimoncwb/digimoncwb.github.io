import { useState } from 'react';
import { normalizeRarity, type FormatRules } from '../builder/editor-model';
import type { MicroContext } from '../../contracts';
import { FormatBanlistEditor } from './FormatBanlistEditor';
import { banlistError } from './format-banlist-model';

const baseKeys = [
    'main_count',
    'egg_max',
    'security_count',
    'copies',
    'use_official_banlist',
    'allowed_rarities',
    'points_limit',
    'card_points',
    'points_pending'
];
export function FormatRulesEditor({
    initial,
    context
}: {
    initial?: FormatRules | null;
    context: MicroContext;
}) {
    const [main, setMain] = useState(String(initial?.main_count ?? 50));
    const [eggs, setEggs] = useState(String(initial?.egg_max ?? 5));
    const [security, setSecurity] = useState(String(initial?.security_count ?? 5));
    const [copies, setCopies] = useState(String(initial?.copies ?? 4));
    const [officialBanlist, setOfficialBanlist] = useState(initial?.use_official_banlist ?? true);
    const [rarities, setRarities] = useState(
        (initial?.allowed_rarities || []).map(normalizeRarity)
    );
    const [scored, setScored] = useState(initial?.points_limit != null);
    const [limit, setLimit] = useState(String(initial?.points_limit ?? 100));
    const [advanced, setAdvanced] = useState(
        JSON.stringify(
            Object.fromEntries(
                Object.entries(initial || {}).filter(([key]) => !baseKeys.includes(key))
            ),
            null,
            2
        )
    );
    const errors: string[] = [];
    let validAdvanced = true;
    let extra: FormatRules = {};
    try {
        const parsed = JSON.parse(advanced || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        extra = parsed;
    } catch {
        validAdvanced = false;
        errors.push('As restrições adicionais precisam ser um objeto JSON válido.');
    }
    const restrictionError = banlistError(extra);
    if (restrictionError) errors.push(restrictionError);
    const rules: FormatRules = {
        ...extra,
        main_count: Number(main),
        egg_max: Number(eggs),
        security_count: Number(security),
        copies: Number(copies),
        use_official_banlist: officialBanlist,
        allowed_rarities: rarities,
        points_limit: scored ? Number(limit) : null,
        card_points: initial?.card_points || {},
        points_pending: initial?.points_pending || []
    };
    for (const [label, value, min] of [
        ['Deck principal', main, 1],
        ['Digi-Eggs', eggs, 0],
        ['Security', security, 0],
        ['Cópias', copies, 1]
    ] as const)
        if (
            !value ||
            !Number.isInteger(Number(value)) ||
            Number(value) < min ||
            Number(value) > 999
        )
            errors.push(`${label}: informe uma quantidade inteira válida.`);
    if (
        scored &&
        (!limit || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 1000000)
    )
        errors.push('Informe um limite de pontos inteiro entre 1 e 1000000.');
    return (
        <fieldset className="format-rules-editor">
            <legend>Regras de construção e validação</legend>
            <div className="format-rule-presets" role="group" aria-label="Aplicar regras base">
                {['Padrão', 'Pauper', 'DigiCrest'].map((name) => (
                    <button
                        type="button"
                        className="button secondary"
                        key={name}
                        onClick={() => {
                            setMain('50');
                            setEggs('5');
                            setSecurity('5');
                            setCopies('4');
                            setOfficialBanlist(name !== 'DigiCrest');
                            setRarities(name === 'Pauper' ? ['C', 'U'] : []);
                            setScored(name === 'DigiCrest');
                            setLimit('100');
                        }}
                    >
                        Base {name}
                    </button>
                ))}
            </div>
            <div className="format-construction-fields">
                <label>
                    Cartas no deck principal
                    <input
                        aria-label="Cartas no deck principal"
                        type="number"
                        min="1"
                        max="999"
                        step="1"
                        required
                        value={main}
                        onChange={(e) => setMain(e.target.value)}
                    />
                </label>
                <label>
                    Máximo de Digi-Eggs
                    <input
                        type="number"
                        min="0"
                        max="999"
                        step="1"
                        required
                        value={eggs}
                        onChange={(e) => setEggs(e.target.value)}
                    />
                </label>
                <label>
                    Cartas na security
                    <input
                        type="number"
                        min="0"
                        max="999"
                        step="1"
                        required
                        value={security}
                        onChange={(event) => setSecurity(event.target.value)}
                    />
                </label>
                <label>
                    Cópias por carta
                    <input
                        type="number"
                        min="1"
                        max="999"
                        step="1"
                        required
                        value={copies}
                        onChange={(e) => setCopies(e.target.value)}
                    />
                </label>
            </div>
            <label className="format-inline-check">
                <input
                    type="checkbox"
                    checked={officialBanlist}
                    onChange={(event) => setOfficialBanlist(event.target.checked)}
                />
                Usar banlist oficial da Bandai
            </label>
            <p className="muted">
                {officialBanlist
                    ? 'Aplica cartas proibidas, limites específicos e combinações restritas da banlist oficial, além das regras deste formato.'
                    : 'Aplica as regras deste formato, incluindo sua pontuação e restrições próprias. O limite geral de cópias e as exceções das cartas continuam valendo.'}
            </p>
            <fieldset>
                <legend>Raridades permitidas</legend>
                <p className="muted">
                    Nenhuma seleção permite todas as raridades. Para Pauper, marque somente Comum
                    (C) e Incomum (U).
                </p>
                <div className="format-rarity-options">
                    {[...new Set(['C', 'U', 'R', 'SR', 'SEC', 'P', 'UR', ...rarities])].map(
                        (rarity) => (
                            <label key={rarity}>
                                <input
                                    type="checkbox"
                                    checked={rarities.includes(rarity)}
                                    onChange={(e) =>
                                        setRarities(
                                            e.target.checked
                                                ? [...rarities, rarity]
                                                : rarities.filter((item) => item !== rarity)
                                        )
                                    }
                                />
                                {({ C: 'Comum (C)', U: 'Incomum (U)' } as Record<string, string>)[
                                    rarity
                                ] || rarity}
                            </label>
                        )
                    )}
                </div>
            </fieldset>
            <label className="format-inline-check">
                <input
                    type="checkbox"
                    checked={scored}
                    onChange={(e) => setScored(e.target.checked)}
                />
                Usar pontuação por carta
            </label>
            {scored && (
                <section className="format-points-editor" aria-label="Pontuação por carta">
                    <label>
                        Limite de pontos do deck
                        <input
                            aria-label="Limite de pontos do deck"
                            type="number"
                            min="1"
                            max="1000000"
                            step="1"
                            required
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                        />
                    </label>
                    <p className="muted">
                        Cada cópia soma os pontos cadastrados, incluindo Digi-Eggs. O limite é
                        inclusivo; cartas fora da lista valem 0.
                    </p>
                    <p className="muted">
                        A lista de cartas e pontos é editada separadamente no botão “Editar
                        pontuação”, na lista de formatos do admin.
                    </p>
                </section>
            )}
            {validAdvanced && !restrictionError && (
                <FormatBanlistEditor
                    context={context}
                    rules={extra}
                    onChange={(next) => setAdvanced(JSON.stringify(next, null, 2))}
                />
            )}
            <details>
                <summary>Configuração avançada (JSON)</summary>
                <p className="muted">
                    As restrições da banlist acima são sincronizadas com este JSON. Outras regras
                    avançadas também podem ser configuradas aqui.
                </p>
                <label>
                    Configuração avançada em JSON
                    <textarea
                        rows={7}
                        value={advanced}
                        onChange={(e) => setAdvanced(e.target.value)}
                    />
                </label>
            </details>
            {errors.map((error) => (
                <p role="alert" key={error}>
                    {error}
                </p>
            ))}
            <input type="hidden" name="validation" value={JSON.stringify(rules)} />
            <input type="hidden" name="validationErrors" value={errors.join(' ')} />
        </fieldset>
    );
}
