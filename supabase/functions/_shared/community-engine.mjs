// Deterministic Swiss matching. Standings are authoritative database input.
export function swissRounds(players) {
    if (!Number.isInteger(players) || players < 2 || players > 128)
        throw new Error('São necessários de 2 a 128 jogadores.');
    return players === 2
        ? 1
        : players <= 8
          ? 3
          : players <= 16
            ? 4
            : players <= 32
              ? 5
              : players <= 64
                ? 6
                : 7;
}

export function buildPairings(standings, matches, seed) {
    let state = 2166136261;
    for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
    const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 4294967296;
    };
    const previous = new Set(),
        byes = new Map();
    const key = (a, b) => [a, b].sort().join(':');
    for (const match of matches) {
        if (match.p2) previous.add(key(match.p1, match.p2));
        else byes.set(match.p1, (byes.get(match.p1) || 0) + 1);
    }
    const players = standings
        .filter((p) => p.checked_in && !p.dropped)
        .map((p) => ({ ...p, tie: random() }));
    if (players.length < 2) throw new Error('São necessários pelo menos dois jogadores ativos.');
    const first = matches.length === 0;
    players.sort((a, b) => (first ? a.tie - b.tie : b.points - a.points || a.tie - b.tie));
    const byeCandidates =
        players.length % 2
            ? [...players].sort(
                  (a, b) =>
                      (byes.get(a.id) || 0) - (byes.get(b.id) || 0) ||
                      a.points - b.points ||
                      a.tie - b.tie
              )
            : [null];
    let steps = 0;
    function solve(remaining) {
        if (!remaining.length) return [];
        if (++steps > 200000)
            throw new Error('Pareamento complexo: revise as mesas com a organização.');
        // Choose the most constrained player first, then minimize point distance.
        const counts = remaining.map((p) => [
            p,
            remaining.filter((q) => q.id !== p.id && !previous.has(key(p.id, q.id))).length
        ]);
        counts.sort((a, b) => a[1] - b[1]);
        const player = counts[0][0];
        if (!counts[0][1]) return null;
        const candidates = remaining
            .filter((q) => q.id !== player.id && !previous.has(key(player.id, q.id)))
            .sort(
                (a, b) =>
                    Math.abs(player.points - a.points) - Math.abs(player.points - b.points) ||
                    a.tie - b.tie
            );
        for (const opponent of candidates) {
            const rest = solve(remaining.filter((p) => p.id !== player.id && p.id !== opponent.id));
            if (rest) return [{ p1: player.id, p2: opponent.id }, ...rest];
        }
        return null;
    }
    for (const bye of byeCandidates) {
        // Do not award a second bye while an active player has not received one.
        if (bye && (byes.get(bye.id) || 0) > (byes.get(byeCandidates[0].id) || 0)) break;
        const pairs = solve(players.filter((p) => p.id !== bye?.id));
        if (pairs) return [...pairs, ...(bye ? [{ p1: bye.id, p2: null }] : [])];
    }
    throw new Error('Não foi possível gerar pareamentos sem reencontros para os jogadores ativos.');
}
