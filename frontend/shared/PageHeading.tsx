export function PageHeading({
    eyebrow,
    title,
    description
}: {
    eyebrow?: string;
    title: string;
    description?: string;
}) {
    return (
        <div className="page-heading">
            {eyebrow && <span className="overview-eyebrow">{eyebrow}</span>}
            <h1>{title}</h1>
            {description && <p>{description}</p>}
        </div>
    );
}
