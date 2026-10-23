import { useEffect, useState } from 'react';
import type { MicroContext } from '../../contracts';
import { Dialog } from '../../shared/ListPage';
import { loadCatalog } from '../builder/editor-service';
import {
    cardCode,
    normalizeRarity,
    orderCatalog,
    textKey,
    type Card,
    type FormatRules
} from '../builder/editor-model';

type PointRow = { code: string; name: string; points: string; key: number };
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
    context,
    initial
}: {
    context: MicroContext;
    initial?: FormatRules | null;
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
    const [rows, setRows] = useState<PointRow[]>(() =>
        [
            ...Object.entries(initial?.card_points || {}).map(([code, value]) => ({
                code,
                name: value.name,
                points: String(value.points)
            })),
            ...(initial?.points_pending || []).map((row) => ({
                ...row,
                points: String(row.points)
            }))
        ].map((row, key) => ({ ...row, key }))
    );
    const [advanced, setAdvanced] = useState(
        JSON.stringify(
            Object.fromEntries(
                Object.entries(initial || {}).filter(([key]) => !baseKeys.includes(key))
            ),
            null,
            2
        )
    );
    const [catalog, setCatalog] = useState<Card[]>([]);
    const [catalogBusy, setCatalogBusy] = useState(false);
    const [catalogReady, setCatalogReady] = useState(false);
    const [catalogError, setCatalogError] = useState('');
    const [retry, setRetry] = useState(0);
    const [query, setQuery] = useState('');
    const [bulk, setBulk] = useState('');
    const [notice, setNotice] = useState('');
    const [selectedCode, setSelectedCode] = useState('');
    const [pointsPrompt, setPointsPrompt] = useState<Card | null>(null);
    const [newPoints, setNewPoints] = useState('');
    useEffect(() => {
        if (!scored) return;
        const controller = new AbortController();
        setCatalogBusy(true);
        setCatalogReady(false);
        setCatalogError('');
        loadCatalog(context, controller.signal)
            .then(({ cards }) => {
                if (!controller.signal.aborted) {
                    setCatalog(cards);
                    setCatalogReady(true);
                }
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setCatalogError(
                        'Não foi possível conferir os códigos no catálogo. Tente novamente antes de publicar.'
                    );
            })
            .finally(() => {
                if (!controller.signal.aborted) setCatalogBusy(false);
            });
        return () => controller.abort();
    }, [scored, retry]);
    const cards = new Map(catalog.map((card) => [card.code, card]));
    const candidate = cards.get(selectedCode || query.trim().toUpperCase());
    const suggestions = query.trim()
        ? orderCatalog(
              catalog.filter((card) =>
                  textKey(`${card.name} ${card.code}`).includes(textKey(query))
              ),
              context.data.getSnapshot().data.formats
          ).slice(0, 8)
        : [];
    const validNewPoints =
        newPoints.trim() !== '' &&
        Number.isInteger(Number(newPoints)) &&
        Number(newPoints) >= 0 &&
        Number(newPoints) <= 1000000;
    const errors: string[] = [];
    let extra: FormatRules = {};
    try {
        const parsed = JSON.parse(advanced || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        extra = parsed;
    } catch {
        errors.push('As restrições adicionais precisam ser um objeto JSON válido.');
    }
    const rules: FormatRules = {
        ...extra,
        main_count: Number(main),
        egg_max: Number(eggs),
        security_count: Number(security),
        copies: Number(copies),
        use_official_banlist: officialBanlist,
        allowed_rarities: rarities,
        points_limit: scored ? Number(limit) : null,
        card_points: {},
        points_pending: []
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
    const seen = new Set<string>();
    if (scored)
        for (const row of rows) {
            if (!row.code.trim() && !row.name.trim()) continue;
            const code = row.code.trim().toUpperCase();
            const points = Number(row.points);
            if (!row.points.trim() || !Number.isInteger(points) || points < 0 || points > 1000000) {
                errors.push(`Pontuação inválida de ${code || row.name}.`);
                continue;
            }
            if (seen.has(code)) {
                errors.push(`Código repetido na pontuação: ${code}.`);
                continue;
            }
            seen.add(code);
            const card = cards.get(code);
            const name = row.name.trim() || card?.name || code;
            if (card && cardCode(code) === code) rules.card_points![code] = { name, points };
            else rules.points_pending!.push({ code: code || row.name.trim(), name, points });
        }
    const update = (key: number, field: 'code' | 'name' | 'points', value: string) =>
        setRows((old) =>
            old.map((row) =>
                row.key !== key
                    ? row
                    : {
                          ...row,
                          [field]: value,
                          ...(field === 'code'
                              ? { name: cards.get(value.trim().toUpperCase())?.name || '' }
                              : {})
                      }
            )
        );
    const append = (incoming: Omit<PointRow, 'key'>[]) =>
        setRows((old) => {
            const result = [...old];
            let key = Math.max(-1, ...old.map((row) => row.key)) + 1;
            for (const row of incoming) {
                const index = result.findIndex(
                    (item) =>
                        item.code.trim().toUpperCase() === row.code.trim().toUpperCase() &&
                        row.code.trim()
                );
                if (index >= 0) result[index] = { ...row, key: result[index].key };
                else result.push({ ...row, key: key++ });
            }
            return result;
        });
    const registerPoints = () => {
        if (!pointsPrompt || !validNewPoints) return;
        append([
            { code: pointsPrompt.code, name: pointsPrompt.name, points: String(Number(newPoints)) }
        ]);
        setQuery(pointsPrompt.code);
        setSelectedCode(pointsPrompt.code);
        setNotice(
            `${pointsPrompt.name} · ${pointsPrompt.code}: ${Number(newPoints)} pontos por cópia.`
        );
        setPointsPrompt(null);
    };
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
                    {catalogBusy && <p role="status">Conferindo cartas no catálogo…</p>}
                    {catalogError && (
                        <p role="alert">
                            {catalogError}{' '}
                            <button
                                type="button"
                                className="button secondary"
                                onClick={() => setRetry((value) => value + 1)}
                            >
                                Tentar novamente
                            </button>
                        </p>
                    )}
                    <details>
                        <summary>Importar lista de pontos</summary>
                        <label>
                            Nome, código e pontos
                            <textarea
                                rows={6}
                                value={bulk}
                                onChange={(e) => setBulk(e.target.value)}
                                placeholder={'Analog Youth | EX1-066 | 20\nBT9-098\t15'}
                            />
                        </label>
                        <p className="muted">
                            Aceita código e pontos separados por tabulação, ponto e vírgula ou
                            barra. O nome é opcional. Códigos existentes serão atualizados.
                        </p>
                        <button
                            type="button"
                            className="button secondary"
                            disabled={!bulk.trim()}
                            onClick={() => {
                                const imported = bulk
                                    .split(/\r?\n/)
                                    .map((line) => line.trim())
                                    .filter((line) => line && !/^[| :\-]+$/.test(line))
                                    .map((line) => {
                                        const values = line
                                            .replace(/^\||\|$/g, '')
                                            .split(/\t|\||;/)
                                            .map((value) => value.trim());
                                        if (values.length < 2) {
                                            const match = line.match(
                                                /^(.*?)\s*([A-Za-z]{1,4}\d{0,3}-\d{1,4}|EX\d+)\s+(\d+)$/
                                            );
                                            return match
                                                ? {
                                                      name: match[1].trim(),
                                                      code: match[2].toUpperCase(),
                                                      points: match[3]
                                                  }
                                                : { name: '', code: line, points: '' };
                                        }
                                        const code = values[values.length - 2].toUpperCase();
                                        return {
                                            code,
                                            name:
                                                values.slice(0, -2).join(' ') ||
                                                cards.get(code)?.name ||
                                                '',
                                            points: values[values.length - 1]
                                        };
                                    });
                                append(imported);
                                setNotice(
                                    `${imported.length} linhas importadas. Confira os códigos sinalizados antes de publicar.`
                                );
                                setBulk('');
                                setQuery('');
                                setSelectedCode('');
                            }}
                        >
                            Adicionar à lista
                        </button>
                    </details>
                    <div className="format-points-toolbar">
                        <label>
                            Buscar carta por nome ou código
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setSelectedCode('');
                                }}
                                placeholder="Nome ou código"
                            />
                        </label>
                        <button
                            type="button"
                            className="button secondary"
                            disabled={!candidate || !catalogReady || catalogBusy}
                            onClick={() => {
                                if (!candidate) return;
                                setNewPoints(
                                    rows.find((row) => row.code === candidate.code)?.points || ''
                                );
                                setPointsPrompt(candidate);
                            }}
                        >
                            Adicionar carta
                        </button>
                    </div>
                    {suggestions.length > 0 && (
                        <div
                            className="format-card-suggestions"
                            role="group"
                            aria-label="Cartas encontradas"
                        >
                            {suggestions.map((card) => (
                                <button
                                    type="button"
                                    key={card.code}
                                    className="format-card-suggestion"
                                    aria-pressed={candidate?.code === card.code}
                                    onClick={() => {
                                        setSelectedCode(card.code);
                                        setQuery(card.code);
                                    }}
                                >
                                    <img
                                        src={card.image}
                                        alt=""
                                        loading="lazy"
                                        width="36"
                                        height="50"
                                    />
                                    <span>
                                        <strong>{card.name}</strong>
                                        <small>{card.code}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                    {query.trim() && catalogReady && !suggestions.length && !candidate && (
                        <p className="muted">Nenhuma carta encontrada no catálogo.</p>
                    )}
                    {pointsPrompt && (
                        <Dialog title="Pontuação da carta" onClose={() => setPointsPrompt(null)}>
                            <div className="format-point-prompt">
                                <strong>
                                    {pointsPrompt.name} — {pointsPrompt.code}
                                </strong>
                                <label>
                                    Quantos pontos por cópia?
                                    <input
                                        aria-label="Pontos por cópia"
                                        type="number"
                                        min="0"
                                        max="1000000"
                                        step="1"
                                        autoFocus
                                        value={newPoints}
                                        onChange={(event) => setNewPoints(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                registerPoints();
                                            }
                                        }}
                                    />
                                </label>
                                <button
                                    type="button"
                                    className="button primary"
                                    disabled={!validNewPoints}
                                    onClick={registerPoints}
                                >
                                    {rows.some((row) => row.code === pointsPrompt.code)
                                        ? 'Atualizar pontuação'
                                        : 'Adicionar à pontuação'}
                                </button>
                            </div>
                        </Dialog>
                    )}
                    <p role="status">{notice || `${rows.length} cartas na lista`}</p>
                    <div className="format-points-table-wrap">
                        <table className="format-points-table">
                            <thead>
                                <tr>
                                    <th>Carta</th>
                                    <th>Pontos por cópia</th>
                                    <th>Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows
                                    .filter((row) =>
                                        textKey(`${row.name} ${row.code}`).includes(textKey(query))
                                    )
                                    .map((row) => (
                                        <tr
                                            key={row.key}
                                            data-card-code={row.code}
                                            className={
                                                row.code &&
                                                !cards.has(row.code.trim().toUpperCase()) &&
                                                catalogReady
                                                    ? 'is-pending'
                                                    : ''
                                            }
                                        >
                                            <td>
                                                <div className="format-registry-card">
                                                    {cards.get(row.code.trim().toUpperCase())
                                                        ?.image && (
                                                        <img
                                                            src={
                                                                cards.get(
                                                                    row.code.trim().toUpperCase()
                                                                )!.image
                                                            }
                                                            alt=""
                                                            width="36"
                                                            height="50"
                                                            loading="lazy"
                                                        />
                                                    )}
                                                    <span>
                                                        <strong>
                                                            {cards.get(
                                                                row.code.trim().toUpperCase()
                                                            )?.name ||
                                                                row.name ||
                                                                'Carta não encontrada'}
                                                        </strong>
                                                        <span className="format-registry-card-code">
                                                            {row.code}
                                                        </span>
                                                    </span>
                                                </div>
                                                {row.code &&
                                                    !cards.has(row.code.trim().toUpperCase()) &&
                                                    catalogReady && (
                                                        <small>
                                                            Código não encontrado. Remova e adicione
                                                            a carta correta antes de publicar.
                                                        </small>
                                                    )}
                                            </td>
                                            <td>
                                                <input
                                                    aria-label={`Pontos de ${row.code || 'nova carta'}`}
                                                    type="number"
                                                    min="0"
                                                    max="1000000"
                                                    step="1"
                                                    required
                                                    value={row.points}
                                                    onChange={(e) =>
                                                        update(row.key, 'points', e.target.value)
                                                    }
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="button secondary"
                                                    aria-label={`Remover ${row.code || 'nova carta'}`}
                                                    onClick={() =>
                                                        setRows((old) =>
                                                            old.filter(
                                                                (item) => item.key !== row.key
                                                            )
                                                        )
                                                    }
                                                >
                                                    Remover
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    {catalogReady && !!rules.points_pending?.length && (
                        <p className="format-pending" role="status">
                            {rules.points_pending.length} códigos aguardam correção. É possível
                            salvar como rascunho; a publicação depende da conferência de todos os
                            códigos.
                        </p>
                    )}
                </section>
            )}
            <details>
                <summary>Restrições adicionais</summary>
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
            <input
                type="hidden"
                name="pointsCatalogPending"
                value={scored && (!catalogReady || catalogBusy || !!catalogError) ? '1' : ''}
            />
        </fieldset>
    );
}
