import type { CommunityMatch } from '../../shared/community-service';

export function communityRecord(matches: CommunityMatch[], entry: string): string {
    const record = [0, 0, 0];
    for (const match of matches) {
        if (match.status !== 'confirmed' || (match.p1 !== entry && match.p2 !== entry)) continue;
        if (match.p2 === null) {
            record[0]++;
            continue;
        }
        const difference =
            ((match.wins ?? 0) - (match.losses ?? 0)) * (match.p1 === entry ? 1 : -1);
        record[difference > 0 ? 0 : difference < 0 ? 1 : 2]++;
    }
    return record.join(' - ');
}
