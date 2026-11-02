import { useState } from 'react';
import type { CommunityEntry, CommunitySnapshot } from '../../shared/community-service';
import { CommunityPairings } from './CommunityPairings';

export function CommunityRoundHistory({
    snapshot,
    mine,
    admin,
    busy,
    onOpen,
    onRefresh
}: {
    snapshot: CommunitySnapshot;
    mine?: CommunityEntry;
    admin: boolean;
    busy: boolean;
    onOpen?: (match: CommunitySnapshot['matches'][number]) => void;
    onRefresh?: () => void;
}) {
    const [selected, setSelected] = useState('');
    const orderedRounds = [...snapshot.rounds].sort((a, b) => a.number - b.number);
    const latest = orderedRounds[orderedRounds.length - 1];
    const round = orderedRounds.find((round) => round.id === selected) || latest;
    if (!round) return null;
    const rounds = orderedRounds.slice(0, orderedRounds.indexOf(round) + 1);
    const roundIds = new Set(rounds.map((item) => item.id));
    const historical = {
        ...snapshot,
        rounds,
        matches: snapshot.matches.filter((match) => roundIds.has(match.round_id))
    };
    const matches = snapshot.matches
        .filter((match) => match.round_id === round.id)
        .sort((a, b) => a.table_number - b.table_number);
    return (
        <section className="community-panel community-round-history">
            <h2>Histórico de rodadas</h2>
            <nav className="community-round-pagination" aria-label="Escolher rodada do histórico">
                <span>Rodada</span>
                {orderedRounds.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className="community-round-page"
                        aria-label={`Rodada ${item.number}`}
                        aria-pressed={item.id === round.id}
                        onClick={() => {
                            setSelected(item.id === latest.id ? '' : item.id);
                            onRefresh?.();
                        }}
                    >
                        {item.number}
                    </button>
                ))}
            </nav>
            {!matches.length && (
                <div className="community-note" role="status">
                    <p>
                        {round.status === 'paused'
                            ? 'Esta rodada está pausada. As mesas reaparecem quando a organização continuar ou refizer a rodada.'
                            : 'Os pareamentos desta rodada ainda não estão disponíveis. A tabela será atualizada automaticamente.'}
                    </p>
                    {onRefresh && (
                        <button className="button secondary" disabled={busy} onClick={onRefresh}>
                            Atualizar
                        </button>
                    )}
                </div>
            )}
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
