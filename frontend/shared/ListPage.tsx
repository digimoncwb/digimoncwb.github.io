import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Select } from './Select';
export function ListToolbar({
    query,
    onQuery,
    placeholder,
    children,
    filters,
    count,
    trailing
}: {
    query: string;
    onQuery(value: string): void;
    placeholder: string;
    children?: ReactNode;
    filters?: ReactNode;
    count?: number;
    trailing?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="list-toolbar">
            <div className="list-toolbar-main">
                <label className="list-search">
                    <span className="sr-only">{placeholder}</span>
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => onQuery(event.target.value)}
                        placeholder={placeholder}
                    />
                </label>
                {children}
                {filters && (
                    <button
                        type="button"
                        className={`button secondary${open ? ' is-active' : ''}`}
                        aria-expanded={open}
                        onClick={() => setOpen(!open)}
                    >
                        Filtros{count ? ` (${count})` : ''}
                    </button>
                )}
                {trailing}
            </div>
            {open && filters && <div className="list-toolbar-filters">{filters}</div>}
        </div>
    );
}
export function Pagination({
    page,
    pages,
    size,
    total,
    onPage,
    onSize
}: {
    page: number;
    pages: number;
    size: number;
    total: number;
    onPage(page: number): void;
    onSize(size: number): void;
}) {
    return (
        <div className="list-pagination">
            <p role="status">
                {total
                    ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} de ${total}`
                    : 'Nenhum resultado'}
            </p>
            <Select
                label="Por página"
                value={String(size)}
                onChange={(value) => onSize(Number(value))}
                options={[10, 20, 40, 80].map((value) => ({
                    value: String(value),
                    label: String(value)
                }))}
            />
            <nav aria-label="Paginação" className="list-pages">
                <button
                    className="button secondary"
                    disabled={page <= 1}
                    onClick={() => onPage(page - 1)}
                    aria-label="Página anterior"
                >
                    ‹
                </button>
                <span>
                    {page} / {pages}
                </span>
                <button
                    className="button secondary"
                    disabled={page >= pages}
                    onClick={() => onPage(page + 1)}
                    aria-label="Próxima página"
                >
                    ›
                </button>
            </nav>
        </div>
    );
}
export function Dialog({
    title,
    onClose,
    children,
    headerContent,
    busy = false,
    wide = false
}: {
    title: string;
    onClose(): void;
    children: ReactNode;
    headerContent?: ReactNode;
    busy?: boolean;
    wide?: boolean;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const element = dialog.current!;
        const focused = document.activeElement as HTMLElement | null;
        element.showModal();
        return () => {
            element.close();
            focused?.isConnected && focused.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            className={`list-dialog${wide ? ' is-wide' : ''}`}
            aria-label={title}
            aria-busy={busy}
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) close.current();
            }}
            onClick={(event) => {
                if (!busy && event.target === event.currentTarget) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    if (
                        event.clientX < rect.left ||
                        event.clientX > rect.right ||
                        event.clientY < rect.top ||
                        event.clientY > rect.bottom
                    )
                        close.current();
                }
            }}
        >
            <header>
                {headerContent || <h2>{title}</h2>}
                <button
                    type="button"
                    className="button secondary cancel-close"
                    disabled={busy}
                    onClick={onClose}
                    aria-label="Cancelar"
                >
                    Cancelar
                </button>
            </header>
            <div className="list-dialog-body">{children}</div>
        </dialog>
    );
}
export function EmptyState({ children }: { children: ReactNode }) {
    return <div className="list-empty">{children}</div>;
}
export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        function outside(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    return (
        <div
            className="list-action-menu"
            ref={root}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setOpen(false);
                    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
                }
            }}
        >
            <button
                type="button"
                className="button secondary"
                aria-label={`Ações: ${label}`}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
            >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                </svg>
            </button>
            {open && (
                <div className="list-action-options" onClick={() => setOpen(false)}>
                    {children}
                </div>
            )}
        </div>
    );
}
