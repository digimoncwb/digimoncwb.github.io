import type { Store, Tournament } from '../../contracts';

export function centeredTournamentOrder(events: Tournament[], selected: number) {
    if (events.length < 3) return events;
    const middle = Math.floor(events.length / 2);
    return events.map(
        (_, index) => events[(selected - middle + index + events.length) % events.length]
    );
}

export function tournamentCarouselSlides(events: Tournament[], selected: number) {
    // Only a pair repeats, so it can travel smoothly through both sides of Coverflow.
    return events.length === 2
        ? Array.from({ length: 6 }, () => events).flat()
        : centeredTournamentOrder(events, selected);
}

// Each recorded participation has equal weight; this is not a win-rate ranking.
export function featuredDecks(events: Tournament[]) {
    const decks = new Map<
        string,
        { deck: string; image: string; count: number; players: Map<string, number> }
    >();
    for (const event of events) {
        if (event.deckless) continue;
        for (const result of event.results) {
            const row = decks.get(result.deck) || {
                deck: result.deck,
                image: result.image,
                count: 0,
                players: new Map<string, number>()
            };
            row.count++;
            if (!row.image) row.image = result.image;
            if (
                result.name &&
                result.name !== 'Não informado' &&
                result.name !== 'Jogador não informado'
            )
                row.players.set(result.name, (row.players.get(result.name) || 0) + 1);
            decks.set(result.deck, row);
        }
    }
    return [...decks.values()]
        .map(({ players, ...row }) => {
            const ordered = [...players.entries()].sort(
                (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')
            );
            const highest = ordered[0]?.[1] || 0;
            return {
                ...row,
                contributors: ordered
                    .filter(([, count]) => count === highest)
                    .map(([name]) => name),
                contributions: highest
            };
        })
        .sort((a, b) => b.count - a.count || a.deck.localeCompare(b.deck));
}

export function overviewWeekEvents(events: Tournament[]) {
    const ordered = [...events].sort(
        (a, b) => b.isoDate.localeCompare(a.isoDate) || Number(b.id) - Number(a.id)
    );
    if (!ordered.length) return [];
    const date = new Date(`${ordered[0].isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const monday = date.toISOString().slice(0, 10);
    return ordered.filter((event) => event.isoDate >= monday);
}

export function latestWeekTournaments(events: Tournament[]) {
    return overviewWeekEvents(events).slice(0, 5);
}

export function latestStoreTournaments(events: Tournament[], registeredStores?: Store[]) {
    const activeStores = registeredStores
        ? new Set(
              registeredStores
                  .filter((store) => store.is_active !== false)
                  .map((store) => String(store.id))
          )
        : null;
    const ordered = [...events].sort(
        (a, b) =>
            b.isoDate.localeCompare(a.isoDate) ||
            Number(b.id) - Number(a.id) ||
            b.id.localeCompare(a.id)
    );
    const stores = new Set<string>();
    const names = new Map(registeredStores?.map((store) => [String(store.id), store.name]));
    const weeklyOrder = ['taverna', 'gladiators', 'meruru', 'elkubo', 'reidascartinhas'];
    const storeOrder = (event: Tournament) => {
        const name = (names.get(String(event.storeId)) || event.store || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        const index = weeklyOrder.findIndex((store) => name.startsWith(store));
        return index < 0 ? weeklyOrder.length : index;
    };
    return ordered
        .filter((event) => {
            if (
                activeStores &&
                !activeStores.has(String(event.storeId)) &&
                !(event.organizer && !event.storeId)
            )
                return false;
            const key = event.storeId || event.store;
            if (stores.has(key)) return false;
            stores.add(key);
            return true;
        })
        .sort((a, b) => storeOrder(a) - storeOrder(b));
}
