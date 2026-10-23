import { useMemo } from 'react';

export function PointsBadge({
    points,
    className = 'ed-card-points'
}: {
    points: number;
    className?: string;
}) {
    const center = useMemo(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return { x: 12, y: 12 };
        ctx.font = '900 16px Arial';
        const metrics = ctx.measureText(String(points));
        return {
            x: 12 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2,
            y: 12 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
        };
    }, [points]);
    return (
        <span
            className={className}
            title={`${points} pontos por cópia`}
            aria-label={`${points} pontos por cópia`}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <text
                    x={center.x}
                    y={center.y}
                    style={{
                        textAnchor: 'start',
                        dominantBaseline: 'alphabetic',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '16px',
                        fontWeight: 900
                    }}
                >
                    {points}
                </text>
            </svg>
        </span>
    );
}
