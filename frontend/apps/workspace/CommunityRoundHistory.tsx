import { useState } from 'react';
import type { CommunityEntry, CommunitySnapshot } from '../../shared/community-service';
import { CommunityPairings } from './CommunityPairings';

export function CommunityRoundHistory({
    snapshot,
    mine,
    admin,
    busy,
    onOpen
}: {
    snapshot: CommunitySnapshot;
    mine?: CommunityEntry;
    admin: boolean;
    busy: boolean;
    onOpen?: (match: CommunitySnapshot['matches'][number]) => void;
}) {
    const [selected, setSelected] = useState('');
    const round = snapshot.rounds.find((round) => round.id === selected) || snapshot.rounds[0];
    if (!round) return null;
    const rounds = snapshot.rounds.filter((item) => item.number <= round.number);
    const roundIds = new Set(rounds.map((item) => item.id));
    const historical = {
        ...snapshot,
        rounds,
        matches: snapshot.matches.filter((match) => roundIds.has(match.round_id))
    };
    const matches = historical.matches
        .filter((match) => match.round_id === round.id)
        .sort((a, b) => a.table_number - b.table_number);
    return (
        <section className="community-panel community-round-history">
            <h2>Histórico de rodadas</h2>
            <nav className="community-round-pagination" aria-label="Escolher rodada do histórico">
                <span>Rodada</span>
                {snapshot.rounds.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className="community-round-page"
                        aria-label={`Rodada ${item.number}`}
                        aria-pressed={item.id === round.id}
                        onClick={() => setSelected(item.id)}
                    >
                        {item.number}
                    </button>
                ))}
            </nav>
            <CommunityPairings
                snapshot={historical}
                matches={matches}
                mine={mine}
                admin={admin}
                busy={busy}
                onOpen={admin ? onOpen : undefined}
                allowClosed={admin}
            />
        </section>
    );
}
