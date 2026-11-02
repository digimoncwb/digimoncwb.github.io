import type {
    CommunityEntry,
    CommunityMatch,
    CommunitySnapshot
} from '../../shared/community-service';
import { communityRecord } from './community-record';

export function CommunityPairings({
    snapshot,
    matches,
    mine,
    admin,
    busy,
    onOpen,
    allowClosed = false
}: {
    snapshot: CommunitySnapshot;
    matches: CommunityMatch[];
    mine?: CommunityEntry;
    admin: boolean;
    busy: boolean;
    onOpen?(match: CommunityMatch): void;
    allowClosed?: boolean;
}) {
    const names = new Map(snapshot.entries.map((entry) => [entry.id, entry.name]));
    const round = snapshot.rounds[snapshot.rounds.length - 1];
    return (
        <div className="community-pairings-scroll">
            <table className="community-pairings-table" role="table">
                <caption className="sr-only">
                    Pareamentos da rodada {round?.number}.
                    {onOpen
                        ? ' Clique na sua mesa para informar ou conferir o resultado.'
                        : ' Histórico de resultados.'}
                </caption>
                <thead>
                    <tr>
                        <th scope="col">Mesa</th>
                        <th scope="col">Player 1</th>
                        <th scope="col">Resultado</th>
                        <th scope="col">Player 2</th>
                    </tr>
                </thead>
                <tbody>
                    {matches.map((match) => {
                        const own = !!mine && (match.p1 === mine.id || match.p2 === mine.id);
                        const editable =
                            !!onOpen &&
                            !busy &&
                            (round?.status === 'running' ||
                                (allowClosed && admin && round?.status === 'closed')) &&
                            !!match.p2 &&
                            (admin || own);
                        const confirmed = match.status === 'confirmed';
                        const firstWins = confirmed && (match.wins ?? 0) > (match.losses ?? 0);
                        const secondWins = confirmed && (match.losses ?? 0) > (match.wins ?? 0);
                        const drawn = confirmed && !!match.p2 && match.wins === match.losses;
                        const status =
                            match.status === 'proposed'
                                ? match.proposed_by === mine?.id
                                    ? 'Aguardando adversário'
                                    : own
                                      ? 'Confira o placar'
                                      : 'Aguardando confirmação'
                                : match.status === 'contested'
                                  ? 'Resultado contestado'
                                  : match.status === 'pending'
                                    ? 'Pendente'
                                    : (match.draws ?? 0) > 0
                                      ? `${match.draws} draw`
                                      : '';
                        return (
                            <tr
                                key={match.id}
                                aria-current={own ? 'true' : undefined}
                                className={`${editable ? 'community-pairing-clickable' : ''} ${own ? 'community-pairing-mine' : ''} ${drawn ? 'community-pairing-draw' : ''}`}
                                onClick={() => {
                                    if (editable) onOpen?.(match);
                                }}
                            >
                                <td>
                                    <button
                                        className="community-table-number"
                                        type="button"
                                        disabled={!editable}
                                        aria-label={`Mesa ${match.table_number}: ${names.get(match.p1)} versus ${match.p2 ? names.get(match.p2) : 'BYE'}. ${admin ? 'Editar resultado' : 'Conferir ou enviar resultado'}`}
                                    >
                                        {match.table_number}
                                    </button>
                                </td>
                                <td
                                    className={`${firstWins ? 'community-pairing-winner' : ''} ${match.p1 === mine?.id ? 'community-pairing-self' : ''}`}
                                >
                                    <span className="community-pairing-name">
                                        {names.get(match.p1)}
                                        {match.p1 === mine?.id ? ' (você)' : ''}
                                    </span>
                                    <small>{communityRecord(snapshot.matches, match.p1)}</small>
                                </td>
                                <td className="community-pairing-result">
                                    <span className="community-pairing-score">
                                        <strong className={firstWins ? 'is-winner' : ''}>
                                            {match.wins ?? '–'}
                                        </strong>
                                        <span aria-hidden="true">:</span>
                                        <strong className={secondWins ? 'is-winner' : ''}>
                                            {match.losses ?? '–'}
                                        </strong>
                                    </span>
                                    {status && <small>{status}</small>}
                                </td>
                                <td
                                    className={`${secondWins ? 'community-pairing-winner' : ''} ${match.p2 && match.p2 === mine?.id ? 'community-pairing-self' : ''}`}
                                >
                                    <span className="community-pairing-name">
                                        {match.p2 ? names.get(match.p2) : 'BYE'}
                                        {match.p2 && match.p2 === mine?.id ? ' (você)' : ''}
                                    </span>
                                    {match.p2 && (
                                        <small>{communityRecord(snapshot.matches, match.p2)}</small>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
