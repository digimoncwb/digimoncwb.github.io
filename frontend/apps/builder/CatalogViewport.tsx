import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card } from './editor-model';

/** One continuous catalog: keep only nearby rows mounted, retaining natural card heights. */
export function CatalogViewport({
    cards,
    children
}: {
    cards: Card[];
    children(card: Card, index: number): ReactNode;
}) {
    const root = useRef<HTMLDivElement>(null);
    const geometry = useRef('');
    const [viewport, setViewport] = useState({
        top: 0,
        height: 690,
        width: 600,
        columns: 4,
        gap: 12
    });
    const [heights, setHeights] = useState<Map<number, number>>(new Map());
    const rows = Math.ceil(cards.length / viewport.columns);
    const estimatedHeight =
        (((viewport.width - (viewport.columns - 1) * viewport.gap) / viewport.columns) * 88) / 63 +
        80;
    const offsets = useMemo(() => {
        const result = [0];
        for (let row = 0; row < rows; row++)
            result.push(result[row] + (heights.get(row) ?? estimatedHeight) + 14);
        return result;
    }, [rows, heights, estimatedHeight]);
    const totalHeight = Math.max(0, offsets[rows] - 14);
    let first = 0;
    while (first + 1 < rows && offsets[first + 1] < viewport.top) first++;
    first = Math.max(0, first - 2);
    let last = first;
    while (last < rows && offsets[last] < viewport.top + viewport.height) last++;
    last = Math.min(rows, last + 2);

    useLayoutEffect(() => {
        const element = root.current,
            scroll = element?.parentElement;
        if (!element || !scroll) return;
        const measure = () => {
            if (!element.clientWidth || !scroll.clientHeight) return;
            const row = element.querySelector<HTMLElement>('[data-catalog-row]');
            const style = row ? getComputedStyle(row) : null;
            const columns = style?.gridTemplateColumns.split(' ').length || 4;
            const width = element.clientWidth;
            const size = `${width}-${columns}`;
            if (geometry.current !== size) {
                geometry.current = size;
                setHeights(new Map());
            }
            setViewport((old) => {
                const next = {
                    top: scroll.scrollTop,
                    height: scroll.clientHeight,
                    width,
                    columns,
                    gap: parseFloat(style?.columnGap || '12')
                };
                return JSON.stringify(old) === JSON.stringify(next) ? old : next;
            });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(scroll);
        scroll.addEventListener('scroll', measure, { passive: true });
        return () => {
            observer.disconnect();
            scroll.removeEventListener('scroll', measure);
        };
    }, []);

    useLayoutEffect(() => {
        const element = root.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const measured = entries.map(
                (entry) =>
                    [
                        Number((entry.target as HTMLElement).dataset.catalogRow),
                        entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
                    ] as const
            );
            setHeights((old) => {
                if (
                    !measured.some(
                        ([index, height]) => Math.abs((old.get(index) ?? -1) - height) > 0.5
                    )
                )
                    return old;
                const next = new Map(old);
                for (const [index, height] of measured) next.set(index, height);
                return next;
            });
        });
        element.querySelectorAll('[data-catalog-row]').forEach((row) => observer.observe(row));
        return () => observer.disconnect();
    }, [first, last, cards, viewport.columns, viewport.width]);

    return (
        <div
            ref={root}
            className="ed-virtual-catalog"
            role="list"
            aria-label="Cartas do catálogo"
            data-total-cards={cards.length}
            style={{ height: totalHeight }}
        >
            {Array.from({ length: last - first }, (_, index) => first + index).map((row) => (
                <div
                    className="ed-card-grid ed-catalog-virtual-row"
                    key={`${viewport.columns}-${row}`}
                    data-catalog-row={row}
                    style={{ top: offsets[row] }}
                >
                    {cards
                        .slice(row * viewport.columns, (row + 1) * viewport.columns)
                        .map((card, column) => children(card, row * viewport.columns + column))}
                </div>
            ))}
        </div>
    );
}
