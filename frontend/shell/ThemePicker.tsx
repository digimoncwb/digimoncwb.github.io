import { useEffect, useRef, useState } from 'react';
const colors = [
    { id: 'red', label: 'Vermelho', color: '#ef646b' },
    { id: 'blue', label: 'Azul', color: '#66a7f5' },
    { id: 'green', label: 'Verde', color: '#4edb9b' },
    { id: 'yellow', label: 'Amarelo', color: '#f1cc5b' }
];
function applyAccent(value: string) {
    const color = colors.find((c) => c.id === value) || colors[0];
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
    const [saved, setSaved] = useState(() => document.documentElement.dataset.accent || 'red');
    const [draft, setDraft] = useState(saved),
        [open, setOpen] = useState(false),
        [error, setError] = useState('');
    const dialog = useRef<HTMLDialogElement>(null),
        trigger = useRef<HTMLButtonElement>(null);
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
                    setError('');
                    setOpen(true);
                }}
            >
                <span>Aparência</span>
                <span className="theme-current">
                    <i aria-hidden="true" />
                    {colors.find((c) => c.id === saved)?.label}
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
                    {colors.map((c) => (
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
                <div
                    className="theme-preview"
                    style={
                        {
                            '--accent': colors.find((c) => c.id === draft)?.color,
                            '--ds-accent': colors.find((c) => c.id === draft)?.color
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
                        onClick={() => {
                            try {
                                localStorage.setItem('digimon-cwb-accent', draft);
                                applyAccent(draft);
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
