import { useEffect, useMemo, useRef, useState } from 'react';
import type { MicroContext } from '../../contracts';
import { mountReact, useData } from '../../shared/runtime';
import {
    renderPost,
    POST_FORMAT,
    DEFAULT_DECK_NAME_LINE_LENGTH,
    postEventTitle,
    teamStandingsPages,
    weeklyPostPages
} from '../../../shared/posts/renderer.js';
import { PageHeading } from '../../shared/PageHeading';
import { Select } from '../../shared/Select';
import {
    buildPodiumCaption,
    buildTeamStandingsCaption,
    buildWeeklyCaption,
    loadStandingsUrl
} from './caption';
import './studio.css';
const defaultBackground = {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    opacity: undefined as number | undefined
};
const backgroundControls = [
    { key: 'offsetX', label: 'Horizontal', min: -540, max: 540, factor: 1, unit: ' px' },
    { key: 'offsetY', label: 'Vertical', min: -675, max: 675, factor: 1, unit: ' px' },
    { key: 'scale', label: 'Tamanho', min: 25, max: 175, factor: 100, unit: '%' },
    { key: 'opacity', label: 'Opacidade', min: 0, max: 100, factor: 100, unit: '%' }
] as const;
export const apiVersion = 1;
export const mount = (element: HTMLElement, context: MicroContext) =>
    mountReact(Studio, element, context);
function Studio({ context }: { context: MicroContext }) {
    const { data, loading } = useData(context.data);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [portraitVersion, setPortraitVersion] = useState(0);
    useEffect(() => {
        const update = () => setPortraitVersion((value) => value + 1);
        window.addEventListener('digistats:portraits-changed', update);
        return () => window.removeEventListener('digistats:portraits-changed', update);
    }, []);
    const [template, setTemplate] = useState('podium'),
        [tournament, setTournament] = useState(''),
        [accent, setAccent] = useState('#ef646b'),
        [deckNameLineLengthInput, setDeckNameLineLengthInput] = useState(
            String(DEFAULT_DECK_NAME_LINE_LENGTH)
        ),
        [showBackgroundIcon, setShowBackgroundIcon] = useState(true),
        [backgroundAdjustments, setBackground] = useState(defaultBackground),
        [week, setWeek] = useState(''),
        [page, setPage] = useState(0),
        [ready, setReady] = useState(false),
        [status, setStatus] = useState('');
    const deckNameLineLength = Math.max(
        1,
        Math.min(40, Math.floor(Number(deckNameLineLengthInput) || DEFAULT_DECK_NAME_LINE_LENGTH))
    );
    const events = data.events.filter((event) => event.winner);
    const weeks = [
        ...new Set(data.events.map((event) => window.liveData.weekStart(event.isoDate)))
    ];
    const currentEvent = events.find((event) => event.id === tournament) || events[0];
    useEffect(() => {
        if (template === 'teams' && !currentEvent?.team) {
            setTemplate('podium');
            setPage(0);
        }
    }, [template, currentEvent?.team]);
    const background = useMemo(
        () => ({
            ...backgroundAdjustments,
            opacity: backgroundAdjustments.opacity ?? (currentEvent?.team ? 0.08 : 0.16)
        }),
        [backgroundAdjustments, currentEvent?.team]
    );
    const [captionLink, setCaptionLink] = useState({ eventId: '', url: '', error: '' });
    const [copyStatus, setCopyStatus] = useState('');
    const captionField = useRef<HTMLTextAreaElement>(null);
    const currentWeek = week || weeks[0] || '';
    const captionLoaded =
        template === 'weekly' || currentEvent?.team || captionLink.eventId === currentEvent?.id;
    const caption =
        template === 'weekly'
            ? buildWeeklyCaption(data.events, currentWeek)
            : currentEvent
              ? template === 'teams'
                  ? buildTeamStandingsCaption(currentEvent)
                  : buildPodiumCaption(currentEvent, captionLoaded ? captionLink.url : '')
              : '';
    useEffect(() => setCopyStatus(''), [caption]);
    useEffect(() => {
        setCopyStatus('');
        if (template !== 'podium' || !currentEvent || !context.active) return;
        const controller = new AbortController();
        const eventId = currentEvent.id;
        if (currentEvent.team) {
            setCaptionLink({ eventId, url: '', error: '' });
            return;
        }
        loadStandingsUrl(eventId, controller.signal)
            .then((url) => {
                if (!controller.signal.aborted) setCaptionLink({ eventId, url, error: '' });
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setCaptionLink({
                        eventId,
                        url: '',
                        error: 'Não foi possível consultar o link do DigiLab. A legenda está sem o link.'
                    });
            });
        return () => controller.abort();
    }, [currentEvent?.id, currentEvent?.team, template, context.active]);
    async function copyCaption() {
        try {
            await navigator.clipboard.writeText(caption);
            setCopyStatus('Legenda copiada!');
        } catch {
            captionField.current?.focus();
            captionField.current?.select();
            setCopyStatus('Selecionei a legenda. Use Ctrl+C ou copie pelo menu do dispositivo.');
        }
    }
    const pageCount = Math.max(
        1,
        template === 'teams'
            ? teamStandingsPages(currentEvent).length
            : template === 'weekly'
              ? weeklyPostPages(data.events, currentWeek).length
              : 1
    );
    useEffect(() => {
        const selected = context.route.params.get('tournament');
        if (selected) {
            setTournament(selected);
            setTemplate('podium');
        }
    }, [context.route]);
    useEffect(() => {
        let current = true;
        setReady(false);
        if (!context.active || !canvas.current) return;
        if (!currentEvent || !currentWeek) {
            canvas.current.getContext('2d')?.clearRect(0, 0, POST_FORMAT.width, POST_FORMAT.height);
            setStatus('Nenhum resultado disponível para este modelo.');
            return;
        }
        setStatus('Gerando prévia…');
        renderPost(
            canvas.current,
            {
                template,
                tournament: currentEvent.id,
                title: postEventTitle(currentEvent),
                accent,
                deckNameLineLength,
                showBackgroundIcon,
                background,
                language: 'en',
                week: currentWeek,
                page: Math.min(page, pageCount - 1)
            },
            data.events,
            context.asset('icons/Symbol_of_Digital_Hazard.svg'),
            () => current
        )
            .then((result) => {
                if (current) {
                    setReady(result.ready);
                    setStatus(result.message);
                }
            })
            .catch(() => {
                if (current) setStatus('Não foi possível gerar a prévia. Tente novamente.');
            });
        return () => {
            current = false;
        };
    }, [
        data,
        context.active,
        template,
        tournament,
        accent,
        deckNameLineLength,
        showBackgroundIcon,
        background,
        currentWeek,
        page,
        pageCount,
        portraitVersion
    ]);
    async function download() {
        if (!canvas.current || !ready) return;
        setReady(false);
        try {
            if (
                canvas.current.width !== POST_FORMAT.width ||
                canvas.current.height !== POST_FORMAT.height
            ) {
                throw Error('A prévia precisa estar em 1080 × 1350 px antes de exportar.');
            }
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.current!.toBlob(resolve, POST_FORMAT.mime)
            );
            if (!blob) throw Error('Não foi possível exportar a imagem.');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const date = template === 'weekly' ? currentWeek : currentEvent?.isoDate || 'post';
            const pageSuffix =
                template === 'weekly' || template === 'teams'
                    ? `-${Math.min(page, pageCount - 1) + 1}`
                    : '';
            link.download = `digimon-cwb-${template}-${date}${pageSuffix}.png`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus('Post exportado em PNG.');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setReady(true);
        }
    }
    return (
        <section className="view studio-view">
            <PageHeading
                eyebrow="Compartilhe os resultados"
                title="Estúdio de posts"
                description=""
            />
            <div className="studio studio-with-caption">
                <div className="studio-controls">
                    <div className="studio-control-options">
                        <fieldset className="studio-group">
                            <legend>
                                <span>01</span> Conteúdo
                            </legend>
                            <Select
                                overlay
                                label="Modelo"
                                value={template}
                                onChange={(value) => {
                                    setTemplate(value);
                                    setPage(0);
                                }}
                                options={[
                                    { value: 'podium', label: 'Pódio — Top 3' },
                                    { value: 'weekly', label: 'Resumo da semana' },
                                    ...(currentEvent?.team
                                        ? [{ value: 'teams', label: 'Classificação — Duplas' }]
                                        : [])
                                ]}
                            />
                            {template !== 'weekly' ? (
                                <>
                                    <Select
                                        overlay
                                        label="Torneio"
                                        value={currentEvent?.id || ''}
                                        onChange={(value) => {
                                            setTournament(value);
                                            setPage(0);
                                            if (
                                                template === 'teams' &&
                                                !events.find((event) => event.id === value)?.team
                                            )
                                                setTemplate('podium');
                                        }}
                                        options={events.map((event) => ({
                                            value: event.id,
                                            label:
                                                event.store +
                                                ' · ' +
                                                event.date +
                                                ' · ' +
                                                event.title
                                        }))}
                                    />
                                </>
                            ) : (
                                <>
                                    <Select
                                        overlay
                                        label="Semana"
                                        value={currentWeek}
                                        onChange={(value) => {
                                            setWeek(value);
                                            setPage(0);
                                        }}
                                        options={weeks.map((week) => ({
                                            value: week,
                                            label:
                                                window.liveData.displayDate(week) +
                                                ' — ' +
                                                window.liveData.displayDate(
                                                    window.liveData.weekEnd(week)
                                                )
                                        }))}
                                    />
                                </>
                            )}
                            {(template === 'weekly' || template === 'teams') && pageCount > 1 && (
                                <Select
                                    overlay
                                    label="Página"
                                    value={String(Math.min(page, pageCount - 1))}
                                    onChange={(value) => setPage(Number(value))}
                                    options={Array.from({ length: pageCount }, (_, index) => ({
                                        value: String(index),
                                        label: index + 1 + ' de ' + pageCount
                                    }))}
                                />
                            )}
                            {template === 'podium' &&
                                !currentEvent?.team &&
                                !currentEvent?.deckless && (
                                    <label className="studio-deck-line-control">
                                        <span>Nome do deck: caracteres por linha</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={40}
                                            step={1}
                                            value={deckNameLineLengthInput}
                                            onChange={(event) =>
                                                setDeckNameLineLengthInput(event.target.value)
                                            }
                                            onBlur={() =>
                                                setDeckNameLineLengthInput(
                                                    String(deckNameLineLength)
                                                )
                                            }
                                            aria-describedby="studio-deck-line-hint"
                                        />
                                        <small id="studio-deck-line-hint">
                                            Padrão: 11. A quebra se aplica aos três decks do pódio.
                                        </small>
                                    </label>
                                )}
                        </fieldset>
                        <fieldset className="studio-group">
                            <legend>
                                <span>02</span> Aparência
                            </legend>
                            <Select
                                overlay
                                label="Cor de destaque"
                                value={accent}
                                onChange={setAccent}
                                options={[
                                    { value: '#ef646b', label: 'Vermelho' },
                                    { value: '#66a7f5', label: 'Azul' },
                                    { value: '#4edb9b', label: 'Verde' },
                                    { value: '#f1cc5b', label: 'Amarelo' }
                                ]}
                            />
                            <p className="studio-brand-note">
                                Assinatura da comunidade, Instagram e X incluídos no post.
                            </p>
                        </fieldset>
                    </div>
                    <section className="studio-export" aria-label="Exportação">
                        <h3>
                            <span>03</span> Exportação
                        </h3>
                        <div className="studio-export-specs">
                            <span>Instagram · Feed {POST_FORMAT.ratio}</span>
                            <strong>
                                {POST_FORMAT.width} × {POST_FORMAT.height} px · PNG
                            </strong>
                        </div>
                        <button
                            className="button primary"
                            disabled={!ready || loading}
                            onClick={() => void download()}
                        >
                            Baixar PNG ↓
                        </button>
                        <p className="muted" role="status">
                            {status}
                        </p>
                    </section>
                </div>
                <div className="post-preview">
                    <div className="preview-caption">
                        <span>PRÉVIA · FEED {POST_FORMAT.ratio}</span>
                        <span>
                            {template === 'weekly'
                                ? 'RESUMO SEMANAL'
                                : template === 'teams'
                                  ? 'CLASSIFICAÇÃO / DUPLAS'
                                  : 'PÓDIO / TOP 3'}
                        </span>
                    </div>
                    <canvas
                        ref={canvas}
                        width={POST_FORMAT.width}
                        height={POST_FORMAT.height}
                        aria-label="Prévia do post gerado"
                    />
                </div>
                <aside className="studio-side" aria-label="Ajustes e legenda do post">
                    {template === 'podium' && (
                        <section
                            className="studio-background-controls"
                            aria-labelledby="studio-background-title"
                        >
                            <h2 id="studio-background-title">Background do post</h2>
                            <label className="studio-checkbox">
                                <input
                                    type="checkbox"
                                    checked={showBackgroundIcon}
                                    onChange={(event) =>
                                        setShowBackgroundIcon(event.target.checked)
                                    }
                                />
                                Mostrar ícone no fundo
                            </label>
                            <fieldset
                                disabled={!showBackgroundIcon}
                                aria-label="Ajustar background do post"
                            >
                                {backgroundControls.map((control) => {
                                    const value = Math.round(
                                        background[control.key] * control.factor
                                    );
                                    const id = `studio-background-${control.key}`;
                                    return (
                                        <label
                                            key={control.key}
                                            className="studio-background-control"
                                        >
                                            <span>
                                                {control.label}
                                                <output htmlFor={id}>
                                                    {value}
                                                    {control.unit}
                                                </output>
                                            </span>
                                            <input
                                                id={id}
                                                type="range"
                                                min={control.min}
                                                max={control.max}
                                                step={1}
                                                value={value}
                                                onChange={(event) => {
                                                    const next =
                                                        Number(event.target.value) / control.factor;
                                                    setBackground((previous) => ({
                                                        ...previous,
                                                        [control.key]: next
                                                    }));
                                                }}
                                            />
                                        </label>
                                    );
                                })}
                            </fieldset>
                            <button
                                type="button"
                                className="button primary"
                                onClick={() => {
                                    setBackground(defaultBackground);
                                    setShowBackgroundIcon(true);
                                }}
                            >
                                Restaurar padrão
                            </button>
                        </section>
                    )}
                    <section className="studio-post-caption" aria-label="Legenda do post">
                        <header className="studio-caption-header">
                            <label htmlFor="studio-caption">Legenda para X / Instagram</label>
                            <p>Texto pronto para acompanhar a publicação.</p>
                        </header>
                        <div className="studio-caption-body">
                            <textarea
                                id="studio-caption"
                                ref={captionField}
                                value={caption}
                                readOnly
                                rows={16}
                            />
                            <button
                                className="button primary"
                                disabled={!caption || loading || !captionLoaded}
                                onClick={() => void copyCaption()}
                            >
                                Copiar legenda
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    aria-hidden="true"
                                >
                                    <rect x="9" y="9" width="12" height="12" rx="2" />
                                    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                                </svg>
                            </button>
                            <p className="muted studio-caption-status" role="status">
                                {copyStatus ||
                                    (template === 'weekly' || currentEvent?.team
                                        ? ''
                                        : captionLoaded
                                          ? captionLink.error ||
                                            (!captionLink.url
                                                ? 'Este torneio ainda não tem um link do DigiLab.'
                                                : '')
                                          : 'Consultando link do DigiLab…')}
                            </p>
                        </div>
                    </section>
                </aside>
            </div>
        </section>
    );
}
