import { useEffect, useState } from 'react';
import { communityRpc, useCommunityList, type CommunitySnapshot } from './community-service';
import { useSiteAuth } from './site-auth';

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
    useEffect(() => {
        if (!target) return;
        const event = events.find((event) => event.id === target);
        if (!event || (event.status === 'running' && !event.active_participant)) {
            setMessage('');
            setTarget('');
        }
    }, [events, target]);
    const [permission, setPermission] = useState(() =>
        'Notification' in window ? Notification.permission : 'unavailable'
    );
    useEffect(() => {
        if (!active || !auth.profile?.player_id) return;
        const controller = new AbortController();
        let fetching = false;
        const announce = async (key: string, title: string, body: string, event: string) => {
            const storageKey = `community-alert:${auth.user?.id}:${key}`;
            try {
                if (localStorage.getItem(storageKey)) return;
            } catch {
                /* In-app alerts still work. */
            }
            setMessage(`${title} · ${body}`);
            setTarget(event);
            try {
                localStorage.setItem(storageKey, '1');
            } catch {
                /* Storage can be unavailable. */
            }
            if (!('Notification' in window) || Notification.permission !== 'granted') return;
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
                        (e.status === 'finished' ||
                            (e.status === 'running' && e.active_participant))
                )) {
                    try {
                        if (
                            event.status === 'finished' &&
                            localStorage.getItem(
                                `community-alert:${auth.user?.id}:${event.id}:finish`
                            )
                        )
                            continue;
                    } catch {
                        /* Continue without local storage. */
                    }
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
                        const rank = snapshot.event.final_order?.indexOf(mine.id) ?? -1;
                        if (rank >= 0)
                            await announce(
                                `${event.id}:finish`,
                                `Fim do torneio: ${rank + 1}º lugar`,
                                event.name,
                                event.id
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
                    if (round.status === 'running') {
                        await announce(
                            `${round.id}:start`,
                            `R${round.number}: ${opponent ? `vs ${opponent.name}` : 'BYE'}`,
                            `${event.name} · Mesa ${match.table_number}`,
                            event.id
                        );
                        const now = Date.parse(snapshot.server_now || new Date().toISOString());
                        if (
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
                            'Confira o resultado',
                            `${opponent?.name || 'Seu adversário'} enviou um placar. Aceite ou refute na mesa.`,
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
                    {message}
                    <button className="button primary" onClick={() => onOpen(target)}>
                        Ver torneio
                    </button>
                    <button
                        className="button secondary"
                        onClick={() => setMessage('')}
                        aria-label="Dispensar aviso"
                    >
                        ×
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
