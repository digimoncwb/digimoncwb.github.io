import { useEffect, useState } from 'react';
import type { MicroContext } from '../contracts';
import { useSiteAuth } from './site-auth';
import {
    communityEventDate,
    communityRpc,
    pendingEnrollmentKey,
    useCommunityList
} from './community-service';
import './community.css';

export function CommunityNotices({ context }: { context: MicroContext }) {
    const auth = useSiteAuth();
    const { events, refresh } = useCommunityList(false, context.active, auth.user?.id || '');
    const [joining, setJoining] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!context.active || !auth.user || !auth.profile?.player_id || !auth.isMember) return;
        const target = sessionStorage.getItem(pendingEnrollmentKey);
        if (target) {
            sessionStorage.removeItem(pendingEnrollmentKey);
            context.navigate('tournaments', { community: '1', event: target });
        }
    }, [auth.user?.id, auth.profile?.player_id, auth.isMember, context.active]);
    const visibleEvents = events.filter(
        (event) =>
            event.status !== 'finished' && (event.status !== 'running' || event.active_participant)
    );
    if (!visibleEvents.length) return null;
    return (
        <section className="community-notices" aria-label="Torneios da comunidade">
            {error && (
                <p role="alert" className="community-error">
                    {error}
                </p>
            )}
            {visibleEvents
                .sort(
                    (a, b) =>
                        Number(b.status === 'running' && b.enrolled) -
                        Number(a.status === 'running' && a.enrolled)
                )
                .map((event) => {
                    const full = event.registered >= event.capacity;
                    const label =
                        event.status === 'running'
                            ? event.enrolled
                                ? 'Ver rodada atual'
                                : 'Acompanhar torneio'
                            : event.enrolled
                              ? 'Ver minha inscrição'
                              : full
                                ? 'Vagas esgotadas'
                                : !auth.user
                                  ? 'Entrar para se inscrever'
                                  : !auth.profile?.player_id
                                    ? 'Vincular jogador para se inscrever'
                                    : 'Inscrever-se';
                    return (
                        <article className="community-notice" key={event.id}>
                            <div>
                                <span className="community-badge">
                                    {event.status === 'running'
                                        ? event.enrolled
                                            ? 'Você está jogando · Em andamento'
                                            : 'Torneio em andamento'
                                        : 'Inscrições abertas'}
                                </span>
                                <h2>{event.name}</h2>
                                <p>
                                    {communityEventDate(event.starts_at)} ·{' '}
                                    {event.modality === 'online' ? 'Online' : 'Presencial'}
                                </p>
                                <p>
                                    {event.store_name || event.organizer}
                                    {event.location ? ` · ${event.location}` : ''} ·{' '}
                                    {event.registered} inscritos
                                </p>
                            </div>
                            <button
                                className="button primary"
                                disabled={
                                    auth.loading ||
                                    !!joining ||
                                    (event.status !== 'running' && full && !event.enrolled)
                                }
                                onClick={async () => {
                                    if (
                                        event.status === 'published' &&
                                        !event.enrolled &&
                                        auth.user &&
                                        auth.profile?.player_id &&
                                        auth.isMember
                                    ) {
                                        setJoining(event.id);
                                        setError('');
                                        try {
                                            await communityRpc('community_command', {
                                                p_event: event.id,
                                                p_action: 'register',
                                                p_data: {},
                                                p_revision: event.revision
                                            });
                                            context.navigate('tournaments', {
                                                community: '1',
                                                event: event.id
                                            });
                                        } catch (error) {
                                            setError(
                                                error instanceof Error
                                                    ? error.message
                                                    : 'Não foi possível se inscrever.'
                                            );
                                            void refresh();
                                        } finally {
                                            setJoining('');
                                        }
                                        return;
                                    }
                                    if (
                                        event.status === 'running' ||
                                        event.enrolled ||
                                        (auth.user && auth.profile?.player_id && auth.isMember)
                                    ) {
                                        sessionStorage.removeItem(pendingEnrollmentKey);
                                        context.navigate('tournaments', {
                                            community: '1',
                                            event: event.id
                                        });
                                    } else {
                                        sessionStorage.setItem(pendingEnrollmentKey, event.id);
                                        window.digistatsAuth?.open(auth.user ? 'profile' : 'login');
                                    }
                                }}
                            >
                                {joining === event.id ? 'Inscrevendo…' : label}
                            </button>
                        </article>
                    );
                })}
        </section>
    );
}
