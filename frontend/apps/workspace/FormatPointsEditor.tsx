import { useEffect, useRef, useState } from 'react';
import type { PointAddition } from './format-points-service';
import type { MicroContext } from '../../contracts';
import { Dialog } from '../../shared/ListPage';
import { loadCatalog } from '../builder/editor-service';
import { orderCatalog, textKey, type Card, type FormatRules } from '../builder/editor-model';

type PointRow = { code: string; name: string; points: string; key: number };
export function FormatPointsEditor({
    context,
    initial,
    onAutoSavePoints,
    onRemovePoint
}: {
    context: MicroContext;
    initial: FormatRules;
    onAutoSavePoints(additions: PointAddition[]): Promise<void>;
    onRemovePoint(code: string): Promise<void>;
}) {
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
    const [autoSaving, setAutoSaving] = useState(false);
    const [autoError, setAutoError] = useState('');
    const [pendingRemoval, setPendingRemoval] = useState('');
    const [pendingSave, setPendingSave] = useState<PointAddition[]>([]);
    const savingPoints = useRef(false);
    const savedPoints = useRef(new Map(rows.map((row) => [row.code, row.points])));
    useEffect(() => {
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
    }, [retry]);
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
    const pendingCount = catalogReady ? rows.filter((row) => !cards.has(row.code)).length : 0;
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
    async function saveAdditions(incoming: Omit<PointRow, 'key'>[]) {
        if (savingPoints.current) return false;
        if (
            !catalogReady ||
            incoming.some(
                (row) =>
                    !cards.has(row.code) ||
                    !row.points.trim() ||
                    !Number.isInteger(Number(row.points)) ||
                    Number(row.points) < 0 ||
                    Number(row.points) > 1000000
            )
        ) {
            setAutoError(
                'As alterações ainda não foram salvas. Confira os códigos e os pontos da lista antes de tentar novamente.'
            );
            return false;
        }
        const additions = [
            ...new Map(
                [
                    ...pendingSave,
                    ...incoming.map((row) => ({
                        code: row.code,
                        name: cards.get(row.code)!.name,
                        points: Number(row.points)
                    }))
                ].map((row) => [row.code, row])
            ).values()
        ];
        setPendingSave(additions);
        savingPoints.current = true;
        setAutoSaving(true);
        setAutoError('');
        setPendingRemoval('');
        try {
            await onAutoSavePoints(additions);
            for (const row of additions) savedPoints.current.set(row.code, String(row.points));
            setPendingSave([]);
            setNotice('Pontuação salva automaticamente.');
            return true;
        } catch (error) {
            setAutoError(
                `${(error as Error).message} As alterações continuam na tela e ainda não foram salvas.`
            );
            return false;
        } finally {
            savingPoints.current = false;
            setAutoSaving(false);
        }
    }
    const append = async (incoming: Omit<PointRow, 'key'>[]) => {
        if (savingPoints.current) return false;
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
        return saveAdditions(incoming);
    };
    const registerPoints = async () => {
        if (!pointsPrompt || !validNewPoints || savingPoints.current) return;
        const saved = await append([
            { code: pointsPrompt.code, name: pointsPrompt.name, points: String(Number(newPoints)) }
        ]);
        if (!saved) return;
        setQuery(pointsPrompt.code);
        setSelectedCode(pointsPrompt.code);
        setNotice(
            `${pointsPrompt.name} · ${pointsPrompt.code}: ${Number(newPoints)} pontos por cópia. Salvo automaticamente.`
        );
        setPointsPrompt(null);
    };
    async function removePoint(code: string) {
        if (savingPoints.current) return;
        savingPoints.current = true;
        setAutoSaving(true);
        setAutoError('');
        setPendingRemoval(code);
        try {
            await onRemovePoint(code);
            setRows((old) => old.filter((row) => row.code !== code));
            setPendingSave((old) => old.filter((row) => row.code !== code));
            savedPoints.current.delete(code);
            setPendingRemoval('');
            setNotice(`${code} removida da pontuação. Salvo automaticamente.`);
        } catch (error) {
            setAutoError(
                `${(error as Error).message} A carta continua na lista; a remoção não foi salva.`
            );
        } finally {
            savingPoints.current = false;
            setAutoSaving(false);
        }
    }
    return (
        <section className="format-points-editor" aria-label="Lista de pontos">
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
                    Aceita código e pontos separados por tabulação, ponto e vírgula ou barra. O nome
                    é opcional. Códigos existentes serão atualizados.
                </p>
                <button
                    type="button"
                    className="button secondary"
                    disabled={!bulk.trim() || autoSaving || catalogBusy}
                    onClick={async () => {
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
                        if (!(await append(imported))) return;
                        setNotice(`${imported.length} linhas importadas. Salvas automaticamente.`);
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
                    disabled={!candidate || !catalogReady || catalogBusy || autoSaving}
                    onClick={() => {
                        if (!candidate) return;
                        setNewPoints(rows.find((row) => row.code === candidate.code)?.points || '');
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
                            <img src={card.image} alt="" loading="lazy" width="36" height="50" />
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
                <Dialog
                    title="Pontuação da carta"
                    busy={autoSaving}
                    onClose={() => setPointsPrompt(null)}
                >
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
                                disabled={autoSaving}
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
                            disabled={!validNewPoints || autoSaving}
                            onClick={registerPoints}
                        >
                            {autoSaving
                                ? 'Salvando…'
                                : rows.some((row) => row.code === pointsPrompt.code)
                                  ? 'Atualizar pontuação'
                                  : 'Adicionar à pontuação'}
                        </button>
                        {autoError && <p role="alert">{autoError}</p>}
                    </div>
                </Dialog>
            )}
            {autoSaving && <p role="status">Salvando pontuação…</p>}
            {autoError && (
                <div role="alert">
                    <p>{autoError}</p>
                    {pendingRemoval && (
                        <button
                            type="button"
                            className="button secondary"
                            disabled={autoSaving}
                            onClick={() => void removePoint(pendingRemoval)}
                        >
                            Tentar remover carta
                        </button>
                    )}
                    {pendingSave.length > 0 && (
                        <button
                            type="button"
                            className="button secondary"
                            disabled={autoSaving}
                            onClick={() =>
                                void saveAdditions(
                                    pendingSave.map((row) => ({
                                        ...row,
                                        points: String(row.points)
                                    }))
                                )
                            }
                        >
                            Tentar salvar alterações
                        </button>
                    )}
                </div>
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
                                            {cards.get(row.code.trim().toUpperCase())?.image && (
                                                <img
                                                    src={
                                                        cards.get(row.code.trim().toUpperCase())!
                                                            .image
                                                    }
                                                    alt=""
                                                    width="36"
                                                    height="50"
                                                    loading="lazy"
                                                />
                                            )}
                                            <span>
                                                <strong>
                                                    {cards.get(row.code.trim().toUpperCase())
                                                        ?.name ||
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
                                                    Código não encontrado. Remova e adicione a carta
                                                    correta antes de publicar.
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
                                            disabled={autoSaving || catalogBusy}
                                            value={row.points}
                                            onChange={(e) =>
                                                update(row.key, 'points', e.target.value)
                                            }
                                            onBlur={() => {
                                                if (
                                                    row.points !== savedPoints.current.get(row.code)
                                                )
                                                    void saveAdditions([row]);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    event.currentTarget.blur();
                                                }
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="button secondary"
                                            aria-label={`Remover ${row.code || 'nova carta'}`}
                                            disabled={autoSaving}
                                            onPointerDown={(event) => event.preventDefault()}
                                            onClick={() => void removePoint(row.code)}
                                        >
                                            Remover
                                        </button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            {catalogReady && !!pendingCount && (
                <p className="format-pending" role="status">
                    {pendingCount} códigos aguardam correção. Remova os registros incorretos e
                    adicione as cartas pelo catálogo para corrigir a lista.
                </p>
            )}
        </section>
    );
}
