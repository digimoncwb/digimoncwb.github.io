import { useEffect, useState } from 'react';
import { communityRpc, useCommunityList, type CommunitySnapshot } from './community-service';
import { useSiteAuth } from './site-auth';
import { communityResultNotice } from './community-result-notice';

// Server timestamps and persisted results remain authoritative when a device resumes.
export function CommunityAlerts({
    active,
    onOpen,
    eventHref
}: {
    active: boolean;
    onOpen: (event: string) => void;
    eventHref: (event: string) => string;
}) {
    const auth = useSiteAuth();
    const { events } = useCommunityList(false, active && !!auth.user, auth.user?.id || '');
    const [message, setMessage] = useState('');
    const [target, setTarget] = useState('');
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const finishNoticeDuration = 10 * 60 * 1000;
    useEffect(() => {
        if (expiresAt === null) return;
        const expire = () => {
            if (Date.now() < expiresAt) return;
            setMessage('');
            setTarget('');
            setExpiresAt(null);
        };
        const timer = window.setTimeout(expire, Math.max(0, expiresAt - Date.now()));
        document.addEventListener('visibilitychange', expire);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', expire);
        };
    }, [expiresAt]);
    useEffect(() => {
        if (!target) return;
        const event = events.find((event) => event.id === target);
        if (
            !event ||
            (event.status === 'running' && !event.active_participant) ||
            (event.status === 'finished' &&
                !(Date.parse(event.finished_at || '') + finishNoticeDuration > Date.now()))
        ) {
            setMessage('');
            setTarget('');
            setExpiresAt(null);
        }
    }, [events, target]);
    const [permission, setPermission] = useState(() =>
        'Notification' in window ? Notification.permission : 'unavailable'
    );
    useEffect(() => {
        if (!active || !auth.profile?.player_id) return;
        const controller = new AbortController();
        let fetching = false;
        const announce = async (
            key: string,
            title: string,
            body: string,
            event: string,
            notify = true,
            expires: number | null = null
        ) => {
            const storageKey = `community-alert:${auth.user?.id}:${key}`;
            // Keep current round navigation visible after reloads; only OS delivery is deduplicated.
            setMessage(`${title} · ${body}`);
            setTarget(event);
            setExpiresAt(expires);
            try {
                if (localStorage.getItem(storageKey)) return;
            } catch {
                /* In-app alerts still work. */
            }
            try {
                localStorage.setItem(storageKey, '1');
            } catch {
                /* Storage can be unavailable. */
            }
            if (!notify || !('Notification' in window) || Notification.permission !== 'granted')
                return;
            try {
                const registration = await navigator.serviceWorker?.getRegistration();
                if (registration)
                    await registration.showNotification(title, {
                        body,
                        tag: storageKey,
                        data: { url: eventHref(event) }
                    });
                else {
                    const notification = new Notification(title, { body, tag: storageKey });
                    notification.onclick = () => {
                        window.focus();
                        onOpen(event);
                        notification.close();
                    };
                }
            } catch {
                /* The in-app alert remains visible if the OS rejects a notification. */
            }
        };
        const poll = async () => {
            if (fetching || controller.signal.aborted) return;
            fetching = true;
            try {
                for (const event of events.filter(
                    (e) =>
                        e.enrolled &&
                        ((e.status === 'finished' &&
                            Date.parse(e.finished_at || '') + finishNoticeDuration > Date.now()) ||
                            (e.status === 'running' && e.active_participant))
                )) {
                    const snapshot = await communityRpc<CommunitySnapshot>(
                        'community_snapshot',
                        { p_event: event.id },
                        controller.signal
                    );
                    if (controller.signal.aborted) return;
                    const mine = snapshot.entries.find(
                        (e) => e.player_id === auth.profile?.player_id
                    );
                    if (!mine) continue;
                    if (mine.dropped && snapshot.event.status === 'running') continue;
                    if (snapshot.event.status === 'finished') {
                        const expires =
                            Date.parse(snapshot.event.finished_at || '') + finishNoticeDuration;
                        const rank = snapshot.event.final_order?.indexOf(mine.id) ?? -1;
                        if (rank >= 0 && expires > Date.now())
                            await announce(
                                `${event.id}:finish`,
                                `Fim do torneio: ${rank + 1}º lugar`,
                                event.name,
                                event.id,
                                true,
                                expires
                            );
                        continue;
                    }
                    const round = snapshot.rounds[snapshot.rounds.length - 1];
                    if (!round?.started_at) continue;
                    const match = snapshot.matches.find(
                        (m) => m.round_id === round.id && (m.p1 === mine.id || m.p2 === mine.id)
                    );
                    if (!match) continue;
                    const opponent = snapshot.entries.find(
                        (e) => e.id === (match.p1 === mine.id ? match.p2 : match.p1)
                    );
                    if (round.status === 'running' || round.status === 'closed') {
                        await announce(
                            `${round.id}:start`,
                            round.status === 'closed'
                                ? `R${round.number}: Rodada concluída`
                                : `R${round.number}: ${opponent ? `vs ${opponent.name}` : 'BYE'}`,
                            `${event.name} · Mesa ${match.table_number}`,
                            event.id,
                            round.status === 'running'
                        );
                        const now = Date.parse(snapshot.server_now || new Date().toISOString());
                        if (
                            round.status === 'running' &&
                            round.ends_at &&
                            now >= Date.parse(round.ends_at) &&
                            round.overtime_ends_at &&
                            Date.parse(round.overtime_ends_at) > Date.parse(round.ends_at)
                        ) {
                            const ended = now >= Date.parse(round.overtime_ends_at);
                            const minutes =
                                (Date.parse(round.overtime_ends_at) - Date.parse(round.ends_at)) /
                                60000;
                            await announce(
                                `${round.id}:${ended ? 'overtime_end' : 'overtime'}`,
                                ended
                                    ? 'fim do overtime, passem os resultados'
                                    : `Inicio do overtime: ${minutes} minutos ou 3 turnos`,
                                `${event.name} · R${round.number}`,
                                event.id
                            );
                        }
                    }
                    if (match.status === 'proposed' && match.proposed_by !== mine.id)
                        await announce(
                            `${match.id}:proposal:${match.revision}`,
                            communityResultNotice(match, mine.id, round.number),
                            `${opponent?.name || 'Seu adversário'} enviou um placar. Confirme ou refute na mesa.`,
                            event.id
                        );
                }
            } catch {
                /* Retry after connectivity returns. */
            } finally {
                fetching = false;
            }
        };
        void poll();
        const timer = window.setInterval(() => void poll(), 10000);
        const resume = () => {
            if (!document.hidden) void poll();
        };
        document.addEventListener('visibilitychange', resume);
        return () => {
            controller.abort();
            clearInterval(timer);
            document.removeEventListener('visibilitychange', resume);
        };
    }, [active, events, auth.profile?.player_id, auth.user?.id, onOpen, eventHref]);
    if (!auth.user) return null;
    return (
        <div className="community-alerts">
            {message && (
                <p role="status" className="community-notice">
                    <span>{message}</span>
                    <button className="button primary" onClick={() => onOpen(target)}>
                        Ver torneio
                    </button>
                </p>
            )}
            {permission === 'default' &&
                events.some((e) => e.active_participant && e.status === 'running') && (
                    <button
                        className="button secondary"
                        onClick={async () => {
                            setPermission(await Notification.requestPermission());
                        }}
                    >
                        Ativar notificações do torneio
                    </button>
                )}
        </div>
    );
}
