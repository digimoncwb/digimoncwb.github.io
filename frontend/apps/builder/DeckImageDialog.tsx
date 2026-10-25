import { useEffect, useRef, useState } from 'react';
import type { MicroContext } from '../../contracts';
import { Dialog } from '../../shared/ListPage';
import { Loader } from '../../shared/runtime';
import { POST_FORMAT } from '../../../shared/posts/renderer.js';
import { deckImagePages, renderDeckPost } from '../../../shared/posts/deck-renderer.js';
import type { Card, Entry } from './editor-model';

export function DeckImageDialog({
    context,
    entries,
    cards,
    scoring,
    metadata,
    onClose
}: {
    context: MicroContext;
    entries: Entry[];
    cards: Map<string, Card>;
    scoring?: { limit: number; points: Record<string, number> };
    metadata: {
        name: string;
        player: string;
        store: string;
        date: string;
        format: string;
        collection?: string;
        tournament: string;
    };
    onClose(): void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [accent, setAccent] = useState(
        () =>
            getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
            '#ef646b'
    );
    const [page, setPage] = useState(0);
    const [showCodes, setShowCodes] = useState(true);
    const [showLevelDistribution, setShowLevelDistribution] = useState(true);
    const [showBackgroundIcon, setShowBackgroundIcon] = useState(true);
    const [opacity, setOpacity] = useState(0.08);
    const [ready, setReady] = useState(false);
    const [rendering, setRendering] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [status, setStatus] = useState('Gerando prévia…');
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const exportCards = entries.map((entry) => ({
        ...entry,
        level: cards.get(entry.code)?.level ?? null,
        type: cards.get(entry.code)?.type || 'unknown',
        colors: cards.get(entry.code)?.colors || [],
        points: scoring?.points[entry.code],
        image:
            cards.get(entry.code)?.image ||
            `https://digimon.digilab.cards/api/card/${entry.code}.jpg`
    }));
    const pages = deckImagePages(exportCards).length;
    useEffect(() => {
        let current = true;
        setReady(false);
        setRendering(true);
        setError('');
        setStatus('Gerando prévia…');
        renderDeckPost(
            canvas.current,
            exportCards,
            metadata,
            {
                accent,
                page,
                showCodes,
                showBackgroundIcon,
                showLevelDistribution,
                opacity,
                pointsLimit: scoring?.limit,
                onProgress: (completed: number, total: number) => {
                    if (current) setStatus(`Carregando cartas… ${completed} de ${total}`);
                }
            },
            context.asset('icons/Symbol_of_Digital_Hazard.svg'),
            () => current
        )
            .then((result) => {
                if (current) {
                    setReady(result.ready);
                    setRendering(false);
                    setStatus(result.message);
                }
            })
            .catch(() => {
                if (current) {
                    setRendering(false);
                    setStatus('');
                    setError('Não foi possível gerar a prévia.');
                }
            });
        return () => {
            current = false;
        };
    }, [accent, page, showCodes, showBackgroundIcon, showLevelDistribution, opacity, retry]);
    async function download() {
        if (!canvas.current || !ready) return;
        setDownloading(true);
        setError('');
        try {
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.current!.toBlob(resolve, POST_FORMAT.mime)
            );
            if (!blob) throw new Error('PNG indisponível');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${metadata.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'deck'}${pages > 1 ? `-${page + 1}` : ''}.png`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus('Imagem exportada em PNG.');
        } catch {
            setError('Não foi possível baixar o PNG. Tente novamente.');
        } finally {
            setDownloading(false);
        }
    }
    return (
        <Dialog title="Gerar imagem do deck" wide onClose={onClose} busy={downloading}>
            <div className="ed-image-studio ed-dialog-body">
                <aside className="ed-image-controls" aria-label="Configurar imagem">
                    <fieldset>
                        <legend>Aparência</legend>
                        <label className="ed-checkbox">
                            <input
                                type="checkbox"
                                checked={showLevelDistribution}
                                onChange={(event) => setShowLevelDistribution(event.target.checked)}
                            />
                            Distribuição por nível
                        </label>
                        <label>
                            Cor de destaque
                            <select value={accent} onChange={(e) => setAccent(e.target.value)}>
                                {!['#ef646b', '#66a7f5', '#4edb9b', '#f1cc5b'].includes(accent) && (
                                    <option value={accent}>Aparência atual</option>
                                )}
                                <option value="#ef646b">Vermelho</option>
                                <option value="#66a7f5">Azul</option>
                                <option value="#4edb9b">Verde</option>
                                <option value="#f1cc5b">Amarelo</option>
                            </select>
                        </label>
                        <label className="ed-checkbox">
                            <input
                                type="checkbox"
                                checked={showCodes}
                                onChange={(e) => setShowCodes(e.target.checked)}
                            />
                            Mostrar códigos
                        </label>
                        <label className="ed-checkbox">
                            <input
                                type="checkbox"
                                checked={showBackgroundIcon}
                                onChange={(e) => setShowBackgroundIcon(e.target.checked)}
                            />
                            Símbolo de fundo
                        </label>
                        {showBackgroundIcon && (
                            <label>
                                Opacidade do fundo · {Math.round(opacity * 100)}%
                                <input
                                    type="range"
                                    min="0"
                                    max="30"
                                    value={opacity * 100}
                                    onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                                />
                            </label>
                        )}
                    </fieldset>
                    {pages > 1 && (
                        <label>
                            Página
                            <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
                                {Array.from({ length: pages }, (_, index) => (
                                    <option key={index} value={index}>
                                        {index + 1} de {pages}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <section className="ed-image-export" aria-label="Exportação">
                        <h3>Exportação</h3>
                        <p>
                            Feed {POST_FORMAT.ratio}
                            <br />
                            <strong>
                                {POST_FORMAT.width} × {POST_FORMAT.height} px · PNG
                            </strong>
                        </p>
                        <button
                            className="ed-button ed-primary"
                            disabled={!ready || downloading}
                            onClick={() => void download()}
                        >
                            {downloading ? 'Exportando…' : 'Baixar PNG ↓'}
                        </button>
                        <p role="status" className="ed-muted">
                            {status}
                        </p>
                        {error && (
                            <div role="alert">
                                <p>{error}</p>
                                <button
                                    className="ed-button"
                                    onClick={() => setRetry((n) => n + 1)}
                                >
                                    Tentar novamente
                                </button>
                            </div>
                        )}
                    </section>
                </aside>
                <section className="ed-image-preview" aria-label="Prévia da imagem">
                    <div className="ed-image-preview-caption">
                        <span>PRÉVIA · FEED {POST_FORMAT.ratio}</span>
                        <span>DECKLIST</span>
                    </div>
                    <div className="ed-image-preview-body" aria-busy={rendering}>
                        <canvas
                            ref={canvas}
                            width={POST_FORMAT.width}
                            height={POST_FORMAT.height}
                            aria-label={`Prévia da imagem de ${metadata.name}`}
                        />
                        {rendering && (
                            <div className="ed-image-preview-loading">
                                <Loader text={status} />
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </Dialog>
    );
}
