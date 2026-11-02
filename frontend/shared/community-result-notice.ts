import type { CommunityMatch } from './community-service';

export function communityResultNotice(match: CommunityMatch, entryId: string, round: number) {
    const wins = (match.p1 === entryId ? match.wins : match.losses) ?? 0;
    const losses = (match.p1 === entryId ? match.losses : match.wins) ?? 0;
    const score =
        wins === losses
            ? `DRAW ${wins}-${losses}-${match.draws ?? 0}`
            : `${wins > losses ? 'WIN' : 'LOSS'} ${wins}-${losses}`;
    return `Confirmar R${round}: ${score}`;
}
