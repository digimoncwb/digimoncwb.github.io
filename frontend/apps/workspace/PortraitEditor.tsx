import { tryCardImageFallback } from '../../shared/card-image-fallback';
import { useEffect, useRef, useState } from 'react';
import type { MicroContext, PortraitSetting } from '../../contracts';
import './portrait-editor.css';
import { loadDecks } from './catalog-service';
import { Loader } from '../../shared/runtime';

interface PortraitDeck {
    id: string;
    name: string;
    code: string;
    image: string;
}

const standard = { center_x: 0.5, offset_y: 0, zoom: 2.3 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function PortraitEditor({ context }: { context: MicroContext }) {
    const [open, setOpen] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [code, setCode] = useState('');
    const [decks, setDecks] = useState<PortraitDeck[]>([]);
    const [deckId, setDeckId] = useState('');
    const [savedCodes, setSavedCodes] = useState<string[]>([]);
    useEffect(() => {
        const panel = document.getElementById('adminPortraitPanel');
        if (!panel) return;
        let started = false;
        const activate = () => {
            if (started || panel.classList.contains('is-hidden')) return;
            started = true;
            void start();
        };
        const observer = new MutationObserver(activate);
        observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        activate();
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const update = () => setSavedCodes(window.cardPortraits.codes());
        update();
        window.addEventListener('digistats:portraits-changed', update);
        return () => window.removeEventListener('digistats:portraits-changed', update);
    }, []);
    const [setting, setSetting] = useState<PortraitSetting>(standard);
    const [dimensions, setDimensions] = useState({ width: 430, height: 601 });
    const [imageReady, setImageReady] = useState(false);
    const drag = useRef<{ x: number; y: number; setting: PortraitSetting } | null>(null);
    const src =
        decks.find((deck) => deck.id === deckId)?.image ||
        `https://digimon.digilab.cards/api/card/${encodeURIComponent(code)}.jpg?s=m&v=2`;
    async function start(next = code) {
        setOpen(true);
        setBusy(true);
        setLoading(true);
        setMessage('');
        try {
            if (!(await window.digistatsAdminSession.restore()))
                throw Error('Entre no Admin novamente para carregar os enquadramentos.');
            await window.cardPortraits.load();
            const available = (await loadDecks(context))
                .map((deck) => ({ ...deck, id: String(deck.id) }))
                .filter((deck) => deck.code);
            const formats = [...context.data.getSnapshot().data.formats].sort(
                (a, b) =>
                    Number(!!b.is_default) - Number(!!a.is_default) ||
                    (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
            );
            const setOrder = new Map(formats.map((format, index) => [format.code, index]));
            const setRank = (deck: PortraitDeck) =>
                setOrder.get(deck.code.split('-')[0]) ?? Infinity;
            available.sort(
                (a, b) => setRank(a) - setRank(b) || a.name.localeCompare(b.name, 'pt-BR')
            );
            if (!available.length)
                throw Error(
                    'Nenhum deck cadastrado possui uma carta de exibição identificável. Defina a imagem no cadastro do deck.'
                );
            setDecks(available);
            const selected =
                available.find((deck) => deck.id === deckId && deck.code === next) ||
                available.find((deck) => deck.code === next) ||
                available[0];
            selectDeck(selected);
            setAuthorized(true);
        } catch (error) {
            setAuthorized(false);
            setMessage((error as Error).message);
        } finally {
            setLoading(false);
            setBusy(false);
        }
    }
    function selectCard(next: string) {
        setCode(next);
        if (next !== code) setImageReady(false);
        setSetting({ ...window.cardPortraits.get(next + '.jpg') });
        setMessage('');
    }
    function selectDeck(deck: PortraitDeck) {
        if (deck.image !== src) setImageReady(false);
        setDeckId(deck.id);
        selectCard(deck.code);
    }
    async function save() {
        setBusy(true);
        setMessage('');
        try {
            await window.digistatsAdminSession.refresh();
            await window.digistatsAdminSession.verify();
            const response = await window.digistatsAdminSession.request(
                '/rest/v1/card_portrait_settings?on_conflict=card_code',
                {
                    method: 'POST',
                    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
                    body: JSON.stringify({
                        card_code: code,
                        center_x: setting.center_x,
                        offset_y: setting.offset_y,
                        zoom: setting.zoom
                    })
                }
            );
            if (!response.ok)
                throw Error(
                    'Não foi possível salvar o enquadramento. Confira sua sessão administrativa.'
                );
            await window.cardPortraits.load();
            setMessage('Enquadramento salvo. Telas e posts atualizados.');
        } catch (error) {
            setMessage((error as Error).message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="portrait-editor" aria-busy={busy}>
            <h2>Enquadramento das cartas</h2>
            <p>Recorte usado nos decks e nos posts.</p>
            {open && !loading && !authorized && (
                <button className="button" onClick={() => void start()} disabled={busy}>
                    Tentar novamente
                </button>
            )}
            {loading && <Loader text="Carregando decks e enquadramentos…" />}
            {decks.some((deck) => savedCodes.includes(deck.code)) && (
                <label>
                    Enquadramentos salvos
                    <select
                        value=""
                        disabled={busy}
                        onChange={(event) => {
                            if (!event.target.value) return;
                            const deck = decks.find((deck) => deck.id === event.target.value);
                            if (deck) selectDeck(deck);
                        }}
                    >
                        <option value="">Selecionar deck…</option>
                        {decks
                            .filter((deck) => savedCodes.includes(deck.code))
                            .map((deck) => (
                                <option key={deck.id} value={deck.id}>
                                    {deck.name} · {deck.code}
                                </option>
                            ))}
                    </select>
                </label>
            )}
            {open && (
                <>
                    {authorized && (
                        <div className="portrait-editor-body">
                            <div>
                                <label className="portrait-deck-selector">
                                    Buscar deck cadastrado
                                    <select
                                        value={deckId}
                                        disabled={busy}
                                        onChange={(event) => {
                                            const deck = decks.find(
                                                (deck) => deck.id === event.target.value
                                            );
                                            if (deck) selectDeck(deck);
                                        }}
                                    >
                                        {decks.map((deck) => (
                                            <option key={deck.id} value={deck.id}>
                                                {deck.name} · {deck.code}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Centro horizontal ({(setting.center_x * 100).toFixed(2)}%)
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.001"
                                        value={setting.center_x}
                                        disabled={busy}
                                        onChange={(e) =>
                                            setSetting({
                                                ...setting,
                                                center_x: Number(e.target.value)
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Centro horizontal em pixels da imagem
                                    <input
                                        type="number"
                                        min="0"
                                        max={dimensions.width}
                                        step="1"
                                        value={
                                            Math.round(setting.center_x * dimensions.width * 100) /
                                            100
                                        }
                                        disabled={busy || !imageReady}
                                        onChange={(e) =>
                                            setSetting({
                                                ...setting,
                                                center_x: clamp(
                                                    Number(e.target.value) / dimensions.width,
                                                    0,
                                                    1
                                                )
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Posição vertical
                                    <input
                                        type="range"
                                        min="-1"
                                        max="1"
                                        step="0.001"
                                        value={setting.offset_y}
                                        disabled={busy}
                                        onChange={(e) =>
                                            setSetting({
                                                ...setting,
                                                offset_y: Number(e.target.value)
                                            })
                                        }
                                    />
                                </label>
                                <label>
                                    Zoom ({setting.zoom.toFixed(2)}×)
                                    <input
                                        type="range"
                                        min="1"
                                        max="5"
                                        step="0.01"
                                        value={setting.zoom}
                                        disabled={busy}
                                        onChange={(e) =>
                                            setSetting({ ...setting, zoom: Number(e.target.value) })
                                        }
                                    />
                                </label>
                                <div className="portrait-editor-actions">
                                    <button
                                        className="button primary"
                                        disabled={
                                            busy ||
                                            !imageReady ||
                                            !/^(BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/.test(
                                                code
                                            )
                                        }
                                        onClick={() => void save()}
                                    >
                                        Salvar enquadramento
                                    </button>
                                    <button
                                        className="button"
                                        disabled={busy}
                                        onClick={() => {
                                            setSetting({ ...standard });
                                            setMessage(
                                                'Padrão restaurado na prévia. Clique em salvar para aplicar.'
                                            );
                                        }}
                                    >
                                        Restaurar padrão
                                    </button>
                                </div>
                            </div>
                            <div>
                                <div
                                    className="portrait-editor-preview"
                                    onPointerDown={(event) => {
                                        if (busy || !imageReady) return;
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        drag.current = {
                                            x: event.clientX,
                                            y: event.clientY,
                                            setting: { ...setting }
                                        };
                                    }}
                                    onPointerMove={(event) => {
                                        if (!drag.current) return;
                                        const width = event.currentTarget.clientWidth;
                                        const { x, y, setting: initial } = drag.current;
                                        setSetting({
                                            ...initial,
                                            center_x: clamp(
                                                initial.center_x -
                                                    (event.clientX - x) / (width * initial.zoom),
                                                0,
                                                1
                                            ),
                                            offset_y: clamp(
                                                initial.offset_y -
                                                    (event.clientY - y) /
                                                        (((width * dimensions.height) /
                                                            dimensions.width) *
                                                            initial.zoom),
                                                -1,
                                                1
                                            )
                                        });
                                    }}
                                    onPointerUp={() => {
                                        drag.current = null;
                                    }}
                                    onPointerCancel={() => {
                                        drag.current = null;
                                    }}
                                >
                                    <img
                                        key={src}
                                        src={src}
                                        alt={`Prévia circular de ${code}`}
                                        draggable={false}
                                        style={window.cardPortraits.style(setting)}
                                        onLoad={(event) => {
                                            setDimensions({
                                                width: event.currentTarget.naturalWidth,
                                                height: event.currentTarget.naturalHeight
                                            });
                                            setImageReady(true);
                                        }}
                                        onError={(event) => {
                                            if (tryCardImageFallback(event.currentTarget, code))
                                                return;
                                            setImageReady(false);
                                            setMessage(
                                                'Imagem não encontrada. Confira o código da carta.'
                                            );
                                        }}
                                    />
                                    <span className="portrait-editor-guide" aria-hidden="true" />
                                </div>
                                <p>
                                    Arraste a imagem para centralizar o personagem ou use os
                                    controles.
                                </p>
                            </div>
                        </div>
                    )}
                    <p role="status">{message}</p>
                </>
            )}
        </section>
    );
}
