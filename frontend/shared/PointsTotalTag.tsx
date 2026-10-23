import './points-total-tag.css';

export function PointsTotalTag({
    points,
    limit,
    className = ''
}: {
    points: number | null;
    limit: number;
    className?: string;
}) {
    const tone =
        points == null || points < limit
            ? 'under'
            : points === limit
              ? 'full'
              : points < limit * 1.3
                ? 'warning'
                : 'danger';
    return (
        <span className={`points-total-tag ${className}`} data-tone={tone}>
            {points ?? '—'} / {limit} pontos
        </span>
    );
}
