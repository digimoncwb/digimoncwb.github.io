export function paginateTournamentWeeks<T extends { isoDate: string }>(
    events: T[],
    requestedPage: number,
    pageSize: number
) {
    const groups = new Map<string, { start: string; end: string; events: T[] }>();
    for (const event of events) {
        const date = new Date(`${event.isoDate}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        const start = date.toISOString().slice(0, 10);
        date.setUTCDate(date.getUTCDate() + 6);
        const group = groups.get(start) || {
            start,
            end: date.toISOString().slice(0, 10),
            events: []
        };
        group.events.push(event);
        groups.set(start, group);
    }
    const weeks = [...groups.values()].sort((a, b) => b.start.localeCompare(a.start));
    const pages: (typeof weeks)[] = [];
    let current: typeof weeks = [];
    let count = 0;
    for (const week of weeks) {
        if (current.length && count + week.events.length > Math.max(1, pageSize)) {
            pages.push(current);
            current = [];
            count = 0;
        }
        current.push(week);
        count += week.events.length;
    }
    if (current.length) pages.push(current);
    const totalPages = Math.max(1, pages.length);
    const page = Math.min(Math.max(1, requestedPage), totalPages);
    const shown = pages[page - 1] || [];
    const before = pages
        .slice(0, page - 1)
        .flat()
        .reduce((sum, week) => sum + week.events.length, 0);
    return {
        weeks: shown,
        page,
        totalPages,
        start: events.length ? before + 1 : 0,
        end: before + shown.reduce((sum, week) => sum + week.events.length, 0)
    };
}
