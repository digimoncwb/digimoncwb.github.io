import { useEffect, useRef, useState } from 'react';
const colors = [
    { id: 'red', label: 'Vermelho', color: '#ef646b' },
    { id: 'blue', label: 'Azul', color: '#66a7f5' },
    { id: 'green', label: 'Verde', color: '#4edb9b' },
    { id: 'yellow', label: 'Amarelo', color: '#f1cc5b' },
    { id: 'custom', label: 'Personalizada', color: '#bb86fc' }
];
function readPalette() {
    try {
        const saved = JSON.parse(localStorage.getItem('digimon-cwb-accent-palette') || 'null');
        return colors.map((color) => {
            const entry = Array.isArray(saved) ? saved.find((item) => item?.id === color.id) : null;
            return {
                ...color,
                color: /^#[0-9a-f]{6}$/i.test(entry?.color) ? entry.color : color.color,
                label:
                    typeof entry?.label === 'string' && entry.label.trim()
                        ? entry.label.trim().slice(0, 30)
                        : color.label
            };
        });
    } catch {
        return colors;
    }
}
function applyAccent(value: string, palette = readPalette()) {
    const color = palette.find((c) => c.id === value) || palette[0];
    const root = document.documentElement;
    root.dataset.accent = color.id;
    root.style.setProperty('--ds-accent', color.color);
    root.style.setProperty('--ds-red', 'var(--ds-accent)');
    root.style.setProperty('--accent', 'var(--ds-accent)');
    root.style.setProperty('--ds-red-soft', 'color-mix(in srgb,var(--ds-accent) 15%,#0b0e0f)');
}
export function restoreAccent() {
    let value = 'red';
    try {
        value = localStorage.getItem('digimon-cwb-accent') || 'red';
    } catch {}
    applyAccent(value);
}
export function ThemePicker() {
    const [palette, setPalette] = useState(readPalette);
    const [draftPalette, setDraftPalette] = useState(palette);
    const [saved, setSaved] = useState(() => document.documentElement.dataset.accent || 'red');
    const [draft, setDraft] = useState(saved),
        [open, setOpen] = useState(false),
        [error, setError] = useState('');
    const dialog = useRef<HTMLDialogElement>(null),
        trigger = useRef<HTMLButtonElement>(null);
    const current = draftPalette.find((color) => color.id === draft) || draftPalette[0];
    function editCurrent(change: Partial<{ color: string; label: string }>) {
        setDraftPalette((items) =>
            items.map((item) => (item.id === draft ? { ...item, ...change } : item))
        );
    }
    useEffect(() => {
        if (open) dialog.current?.showModal();
        else dialog.current?.close();
    }, [open]);
    function cancel() {
        setOpen(false);
        trigger.current?.focus();
    }
    return (
        <div className="site-theme-picker">
            <button
                ref={trigger}
                className="site-theme-opener"
                onClick={() => {
                    setDraft(saved);
                    setDraftPalette(palette);
                    setError('');
                    setOpen(true);
                }}
            >
                <span>Aparência</span>
                <span className="theme-current">
                    <i aria-hidden="true" />
                    {palette.find((c) => c.id === saved)?.label}
                </span>
            </button>
            <dialog
                ref={dialog}
                className="site-support-dialog theme-dialog"
                aria-labelledby="theme-dialog-title"
                onCancel={(e) => {
                    e.preventDefault();
                    cancel();
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        const r = e.currentTarget.getBoundingClientRect();
                        if (
                            e.clientX < r.left ||
                            e.clientX > r.right ||
                            e.clientY < r.top ||
                            e.clientY > r.bottom
                        )
                            cancel();
                    }
                }}
            >
                <div className="dialog-heading">
                    <h2 id="theme-dialog-title">Aparência</h2>
                    <button
                        type="button"
                        className="button secondary cancel-close"
                        onClick={cancel}
                    >
                        Cancelar
                    </button>
                </div>
                <p className="muted">
                    Confira a prévia. O tema só muda quando você clicar em Aplicar.
                </p>
                <div className="theme-color-options" role="group" aria-label="Cor do tema">
                    {draftPalette.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            aria-label={`Tema ${c.label.toLowerCase()}`}
                            aria-pressed={draft === c.id}
                            style={{ '--swatch': c.color } as React.CSSProperties}
                            onClick={() => {
                                setDraft(c.id);
                            }}
                        >
                            <i aria-hidden="true" />
                            {c.label}
                        </button>
                    ))}
                </div>
                <div className="theme-custom-fields">
                    <label>
                        Cor do tema
                        <input
                            type="color"
                            value={current.color}
                            onChange={(event) => editCurrent({ color: event.target.value })}
                        />
                    </label>
                    <label>
                        Nome da cor
                        <input
                            type="text"
                            maxLength={30}
                            value={current.label}
                            onChange={(event) => editCurrent({ label: event.target.value })}
                        />
                    </label>
                    <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                            const original = colors.find((color) => color.id === draft)!;
                            editCurrent({ color: original.color, label: original.label });
                        }}
                    >
                        Restaurar cor e nome
                    </button>
                </div>
                <div
                    className="theme-preview"
                    style={
                        {
                            '--accent': current.color,
                            '--ds-accent': current.color
                        } as React.CSSProperties
                    }
                >
                    <div className="theme-preview-brand">
                        <span className="hazard" aria-hidden="true" />
                        <strong>DIGIMON CWB</strong>
                    </div>
                    <span className="theme-preview-label">Prévia do tema</span>
                    <div className="theme-preview-card">
                        <strong>Eventos da comunidade</strong>
                        <span>Resultados e decks em destaque</span>
                        <span className="theme-preview-action">Ver todos ↗</span>
                    </div>
                </div>
                {error && <p role="alert">{error}</p>}
                <div className="theme-dialog-actions">
                    <button type="button" className="button secondary" onClick={cancel}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="button primary"
                        disabled={!current.label.trim()}
                        onClick={() => {
                            try {
                                const nextPalette = draftPalette.map((item) => ({
                                    ...item,
                                    label:
                                        item.label.trim() ||
                                        colors.find((color) => color.id === item.id)!.label
                                }));
                                localStorage.setItem(
                                    'digimon-cwb-accent-palette',
                                    JSON.stringify(nextPalette)
                                );
                                localStorage.setItem('digimon-cwb-accent', draft);
                                applyAccent(draft, nextPalette);
                                setPalette(nextPalette);
                                setSaved(draft);
                                setOpen(false);
                                trigger.current?.focus();
                            } catch {
                                setError('Não foi possível salvar a preferência neste navegador.');
                            }
                        }}
                    >
                        Aplicar
                    </button>
                </div>
            </dialog>
        </div>
    );
}
