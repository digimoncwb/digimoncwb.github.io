import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function Select({
    label,
    options,
    value,
    onChange,
    disabled = false,
    overlay = false
}: {
    label: string;
    options: { value: string; label: string; disabled?: boolean }[];
    value: string;
    onChange(value: string): void;
    disabled?: boolean;
    overlay?: boolean;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    useLayoutEffect(() => {
        if (!open || !overlay) return;
        const position = () => {
            const bounds = trigger.current?.getBoundingClientRect();
            if (!bounds) return;
            const below = window.innerHeight - bounds.bottom - 16;
            const above = bounds.top - 16;
            const upward = below < 180 && above > below;
            setMenuStyle({
                position: 'fixed',
                left: bounds.left,
                right: 'auto',
                width: bounds.width,
                top: upward ? 'auto' : bounds.bottom + 6,
                bottom: upward ? window.innerHeight - bounds.top + 6 : 'auto',
                maxHeight: Math.max(44, Math.min(280, upward ? above : below))
            });
        };
        position();
        window.addEventListener('scroll', position, true);
        window.addEventListener('resize', position);
        return () => {
            window.removeEventListener('scroll', position, true);
            window.removeEventListener('resize', position);
        };
    }, [open, overlay]);
    const selected = Math.max(
        0,
        options.findIndex((option) => option.value === value)
    );
    useEffect(() => {
        if (!open) return;
        list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[selected]?.focus();
        const outside = (event: PointerEvent) => {
            if (
                !root.current?.contains(event.target as Node) &&
                !list.current?.contains(event.target as Node)
            )
                setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open, selected]);
    function close() {
        setOpen(false);
        trigger.current?.focus();
    }
    const menu = (
        <div
            ref={list}
            id={`${id}-options`}
            className={`format-select-options${overlay ? ' studio-select-options' : ''}`}
            style={overlay ? menuStyle : undefined}
            role="listbox"
            aria-labelledby={`${id}-label`}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                    return;
                }
                const items = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        '[role="option"]:not(:disabled)'
                    )
                ];
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                const target =
                    event.key === 'ArrowDown'
                        ? (index + 1) % items.length
                        : event.key === 'ArrowUp'
                          ? (index - 1 + items.length) % items.length
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? items.length - 1
                              : -1;
                if (target >= 0) {
                    event.preventDefault();
                    items[target]?.focus();
                }
            }}
        >
            {options.map((option) => (
                <button
                    type="button"
                    key={option.value}
                    disabled={option.disabled}
                    role="option"
                    aria-selected={option.value === value}
                    tabIndex={option.value === value ? 0 : -1}
                    onClick={() => {
                        onChange(option.value);
                        close();
                    }}
                >
                    <span>{option.label}</span>
                    <span className="format-select-check" aria-hidden="true">
                        {option.value === value ? '✓' : ''}
                    </span>
                </button>
            ))}
        </div>
    );
    return (
        <div
            className="format-select ds-select"
            ref={root}
            onBlur={(event) => {
                if (
                    !event.currentTarget.contains(event.relatedTarget) &&
                    !list.current?.contains(event.relatedTarget as Node)
                )
                    setOpen(false);
            }}
        >
            <span id={`${id}-label`} className="format-select-label">
                {label}
            </span>
            <button
                type="button"
                ref={trigger}
                className="format-select-trigger"
                aria-labelledby={`${id}-label ${id}-value`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={`${id}-options`}
                disabled={disabled || !options.length}
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span id={`${id}-value`}>{options[selected]?.label || 'Nenhuma opção'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            {open &&
                (overlay
                    ? createPortal(menu, root.current?.closest('dialog') || document.body)
                    : menu)}
        </div>
    );
}
