import { useEffect, useId, useRef, useState } from 'react';

export type DeckAction = { label: string; onSelect(): void; disabled?: boolean; danger?: boolean };
export function DeckActionsMenu({ name, actions }: { name: string; actions: DeckAction[] }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    return (
        <div
            className="deck-actions-menu"
            ref={root}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    trigger.current?.focus();
                } else if (event.key === 'Tab') {
                    setOpen(false);
                    trigger.current?.focus();
                } else if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const buttons = Array.from(
                        menu.current?.querySelectorAll<HTMLButtonElement>(
                            'button:not(:disabled)'
                        ) || []
                    );
                    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    const next =
                        event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? buttons.length - 1
                              : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                                buttons.length;
                    buttons[next]?.focus();
                }
            }}
        >
            <button
                type="button"
                className="button secondary deck-actions-trigger"
                ref={trigger}
                aria-label={`Mais ações de ${name}`}
                title="Mais ações"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                </svg>
            </button>
            {open && (
                <div
                    id={id}
                    role="menu"
                    aria-label={`Ações de ${name}`}
                    ref={menu}
                    className="deck-actions-popover"
                >
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            disabled={action.disabled}
                            className={action.danger ? 'is-danger' : undefined}
                            onClick={() => {
                                setOpen(false);
                                trigger.current?.focus();
                                action.onSelect();
                            }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
