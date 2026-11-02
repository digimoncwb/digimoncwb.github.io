import type { Data, Format, Store } from '../../contracts';

export function communityFormStore(
    stores: Store[],
    schedule: Data['schedule'],
    localStart: string
) {
    const date = localStart.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const active = new Set(
        stores.filter((store) => store.is_active !== false).map((store) => String(store.id))
    );
    const entry = schedule.find(
        (slot) =>
            slot.weekday === weekday &&
            slot.is_active !== false &&
            active.has(String(slot.store_id))
    );
    return entry ? String(entry.store_id) : '';
}

export function communityFormDate(instant: Date | string = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date(instant));
    const value = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function communityFormDateTime(instant: Date | string = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date(instant));
    const value = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${communityFormDate(instant)}T${value('hour')}:${value('minute')}`;
}

export function communityFormFormat(formats: Format[]) {
    const active = formats.filter(
        (format) => format.is_active !== false && format.code !== 'UNSPECIFIED'
    );
    const current =
        active.find((format) => format.is_default) ||
        [...active].sort(
            (a, b) =>
                (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0) ||
                Number(b.id) - Number(a.id)
        )[0];
    return current ? String(current.id) : '';
}
