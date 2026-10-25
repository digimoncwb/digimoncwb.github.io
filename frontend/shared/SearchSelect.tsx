import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './search-select.css';

type Option = { value: string; label: string };
const key = (text: string) =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase('pt-BR')
        .trim();

export function SearchSelect({
    label,
    name,
    id: suppliedId,
    options,
    value,
    onChange,
    required = false,
    commitOnly = false,
    placeholder = 'Digite para buscar',
    emptyMessage = 'Nenhum tipo de deck encontrado.'
}: {
    label: string;
    name?: string;
    id?: string;
    options: Option[];
    value?: string;
    onChange?(value: string): void;
    required?: boolean;
    commitOnly?: boolean;
    placeholder?: string;
    emptyMessage?: string;
}) {
    const generatedId = useId(),
        id = suppliedId || generatedId;
    const [ownValue, setOwnValue] = useState('');
    const selected = value ?? ownValue;
    const selectedLabel = options.find((option) => option.value === selected)?.label || '';
    const [query, setQuery] = useState(selectedLabel);
    const [editing, setEditing] = useState(false);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [position, setPosition] = useState<React.CSSProperties>({});
    const root = useRef<HTMLDivElement>(null),
        input = useRef<HTMLInputElement>(null),
        menu = useRef<HTMLDivElement>(null);
    const term = editing ? key(query) : '';
    const matches = options
        .filter((option) => key(option.label).includes(term))
        .sort(
            (a, b) => Number(key(b.label).startsWith(term)) - Number(key(a.label).startsWith(term))
        );
    useEffect(() => {
        if (selectedLabel) setQuery(selectedLabel);
    }, [selected, selectedLabel]);
    useEffect(() => {
        input.current?.setCustomValidity(
            required && !selected ? 'Selecione um tipo de deck nas sugestões.' : ''
        );
    }, [selected, required]);
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const bounds = input.current?.getBoundingClientRect();
            if (!bounds) return;
            const below = innerHeight - bounds.bottom - 16,
                above = bounds.top - 16;
            const upward = below < 180 && above > below;
            setPosition({
                position: 'fixed',
                left: bounds.left,
                right: 'auto',
                width: bounds.width,
                top: upward ? 'auto' : bounds.bottom + 6,
                bottom: upward ? innerHeight - bounds.top + 6 : 'auto',
                maxHeight: Math.max(80, Math.min(260, upward ? above : below))
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => {
            if (
                !root.current?.contains(event.target as Node) &&
                !menu.current?.contains(event.target as Node)
            )
                setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    useEffect(() => {
        const list = menu.current;
        const option = list?.querySelectorAll<HTMLElement>('[role=option]')[active];
        if (open && list && option) {
            if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
            else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
                list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
        }
    }, [active, open]);
    function choose(option: Option) {
        setOwnValue(option.value);
        onChange?.(option.value);
        setQuery(option.label);
        setEditing(false);
        setOpen(false);
    }
    return (
        <div className="searchable-select" ref={root}>
            <label htmlFor={id}>{label}</label>
            {name && <input type="hidden" name={name} value={selected} />}
            <input
                ref={input}
                id={id}
                type="search"
                role="combobox"
                autoComplete="off"
                spellCheck={false}
                placeholder={placeholder}
                required={required}
                value={query}
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={`${id}-options`}
                aria-activedescendant={
                    open && matches[active] ? `${id}-option-${active}` : undefined
                }
                onFocus={() => {
                    setOpen(true);
                    setActive(0);
                }}
                onClick={() => setOpen(true)}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setEditing(true);
                    setOpen(true);
                    setActive(0);
                    if (!commitOnly) {
                        setOwnValue('');
                        onChange?.('');
                    }
                }}
                onBlur={() => {
                    setOpen(false);
                    if (commitOnly) {
                        setQuery(selectedLabel);
                        setEditing(false);
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setOpen(true);
                        setActive((index) =>
                            !open
                                ? 0
                                : (index +
                                      (event.key === 'ArrowDown' ? 1 : -1) +
                                      Math.max(1, matches.length)) %
                                  Math.max(1, matches.length)
                        );
                    }
                    if (event.key === 'Enter' && open) {
                        event.preventDefault();
                        if (matches[active]) choose(matches[active]);
                    }
                    if (event.key === 'Escape' && open) {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                        if (commitOnly) {
                            setQuery(selectedLabel);
                            setEditing(false);
                        }
                    }
                }}
            />
            {open &&
                createPortal(
                    <div
                        ref={menu}
                        id={`${id}-options`}
                        className="format-select-options studio-select-options searchable-select-options"
                        role="listbox"
                        aria-label={label}
                        style={position}
                    >
                        {matches.map((option, index) => (
                            <button
                                type="button"
                                role="option"
                                id={`${id}-option-${index}`}
                                key={option.value}
                                tabIndex={-1}
                                aria-selected={option.value === selected}
                                className={active === index ? 'is-active' : ''}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => choose(option)}
                            >
                                <span>{option.label}</span>
                                <span className="format-select-check" aria-hidden="true">
                                    {option.value === selected ? '✓' : ''}
                                </span>
                            </button>
                        ))}
                        {!matches.length && <p role="status">{emptyMessage}</p>}
                    </div>,
                    root.current?.closest('dialog') || document.body
                )}
        </div>
    );
}
