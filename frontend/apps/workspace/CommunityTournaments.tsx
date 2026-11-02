import { buildPairings } from '../../../supabase/functions/_shared/community-engine.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MicroContext } from '../../contracts';
import { useData } from '../../shared/runtime';
import { useSiteAuth } from '../../shared/site-auth';
import { PageHeading } from '../../shared/PageHeading';
import { communityAuditDescription } from './community-audit';
import { communityRecord } from './community-record';
import { CommunityTabIcon } from './CommunityTabIcon';
import { CommunityRoundHistory } from './CommunityRoundHistory';
import { CommunityPairings } from './CommunityPairings';
import { CommunityEventForm } from './CommunityEventForm';
import { CommunityDeleteEvent } from './CommunityDeleteEvent';
import { CommunityPlayerPicker, type PickedCommunityPlayer } from './CommunityPlayerPicker';
import { CommunityNotices } from '../../shared/CommunityNotices';
import { ActionMenu, Dialog } from '../../shared/ListPage';
import {
    communityDate,
    communityEventDate,
    communityRpc,
    pendingEnrollmentKey,
    useCommunityList,
    type CommunityEntry,
    type CommunityMatch,
    type CommunitySnapshot
} from '../../shared/community-service';
import '../../shared/community.css';

const statusLabels: Record<string, string> = {
    draft: 'Rascunho',
    published: 'Publicado',
    running: 'Em andamento',
    finished: 'Finalizado',
    cancelled: 'Cancelado'
};

export function CommunityTournaments({ context }: { context: MicroContext }) {
    const auth = useSiteAuth(),
        { data } = useData(context.data);
    const eventId = context.route.params.get('event') || '';
    const {
        events,
        error: listError,
        refresh: listRefresh
    } = useCommunityList(true, context.active && auth.isAdmin && !eventId, auth.user?.id || '');
    const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false),
        [score, setScore] = useState<CommunityMatch | null>(null);
    const [notice, setNotice] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [starting, setStarting] = useState(false);
    const [tab, setTab] = useState('pairings');
    const [historicalScore, setHistoricalScore] = useState(false);
    const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1000px)').matches);
    useEffect(() => {
        const media = window.matchMedia('(min-width: 1000px)');
        const update = () => setDesktop(media.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    const [editingDeck, setEditingDeck] = useState<CommunityEntry | null>(null);
    const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
    const requestVersion = useRef(0),
        mutating = useRef(false);
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            if (!eventId) return;
            const version = ++requestVersion.current;
            try {
                const next = await communityRpc<CommunitySnapshot>(
                    'community_snapshot',
                    { p_event: eventId },
                    signal
                );
                if (!signal?.aborted && version === requestVersion.current && !mutating.current) {
                    setSnapshot({ ...next, received_at: Date.now() });
                    setError('');
                }
            } catch (error) {
                if (!signal?.aborted)
                    setError(
                        error instanceof Error ? error.message : 'Não foi possível abrir o torneio.'
                    );
            }
        },
        [eventId, auth.user?.id, auth.isAdmin]
    );
    useEffect(() => {
        setSnapshot(null);
        setError('');
        setNotice('');
        setDeleting(false);
        setTab('pairings');
        setScore(null);
        if (!context.active || !eventId) return;
        const controller = new AbortController();
        void refresh(controller.signal);
        const interval = setInterval(() => {
            if (!document.hidden && !mutating.current) void refresh(controller.signal);
        }, 10000);
        const resume = () => {
            if (!document.hidden && !mutating.current) void refresh(controller.signal);
        };
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('focus', resume);
        return () => {
            document.removeEventListener('visibilitychange', resume);
            window.removeEventListener('focus', resume);
            controller.abort();
            clearInterval(interval);
        };
    }, [refresh, context.active]);
    useEffect(() => {
        if (
            auth.user &&
            auth.profile?.player_id &&
            auth.isMember &&
            sessionStorage.getItem(pendingEnrollmentKey) === eventId
        )
            sessionStorage.removeItem(pendingEnrollmentKey);
    }, [eventId, auth.user?.id, auth.profile?.player_id, auth.isMember]);
    async function command(action: string, payload: Record<string, unknown> = {}) {
        if (!snapshot || mutating.current) return;
        if (payload.match_id && payload.match_revision === undefined)
            payload = {
                ...payload,
                match_revision:
                    snapshot.matches.find((m) => m.id === payload.match_id)?.revision ?? 0
            };
        mutating.current = true;
        ++requestVersion.current;
        setBusy(true);
        setError('');
        setNotice('');
        let failed = false;
        try {
            let restartData: Record<string, unknown> = {};
            if (action === 'restart_round' || action === 'auto_pair') {
                const seed = crypto.randomUUID();
                restartData = {
                    seed,
                    pairs: buildPairings(snapshot.standings, snapshot.matches, seed)
                };
            }
            const next =
                action === 'pause_round' || action === 'resume_round'
                    ? await communityRpc<CommunitySnapshot>(
                          action === 'pause_round'
                              ? 'community_pause_round'
                              : 'community_resume_round',
                          {
                              p_event: eventId,
                              p_revision: snapshot.event.revision
                          }
                      )
                    : action === 'restart_round'
                      ? await communityRpc<CommunitySnapshot>('community_restart_round', {
                            p_event: eventId,
                            p_data: restartData,
                            p_revision: snapshot.event.revision
                        })
                      : action === 'configure'
                        ? await communityRpc<CommunitySnapshot>('community_configure_event', {
                              p_event: eventId,
                              p_data: payload,
                              p_revision: snapshot.event.revision
                          })
                        : action === 'start'
                          ? await communityRpc<CommunitySnapshot>('community_start_event', {
                                p_event: eventId,
                                p_revision: snapshot.event.revision
                            })
                          : action === 'correct_result'
                            ? await communityRpc<CommunitySnapshot>('community_correct_result', {
                                  p_event: eventId,
                                  p_data: payload,
                                  p_revision: snapshot.event.revision
                              })
                            : action === 'auto_pair'
                              ? await communityRpc<CommunitySnapshot>(
                                    'community_start_next_round',
                                    {
                                        p_event: eventId,
                                        p_revision: snapshot.event.revision,
                                        p_data: restartData
                                    }
                                )
                              : action === 'add_players'
                                ? await communityRpc<CommunitySnapshot>('community_add_players', {
                                      p_event: eventId,
                                      p_players: payload.player_ids,
                                      p_revision: snapshot.event.revision
                                  })
                                : await communityRpc<CommunitySnapshot>('community_command', {
                                      p_event: eventId,
                                      p_action: action,
                                      p_data: payload,
                                      p_revision: snapshot.event.revision
                                  });
            setSnapshot({ ...next, received_at: Date.now() });
            window.dispatchEvent(new Event('digistats:community-changed'));
            setScore(null);
            setEditingDeck(null);
            return next;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Não foi possível concluir a ação.';
            setError(message);
            failed = /placar mudou|torneio mudou/i.test(message);
            if (failed) {
                setScore(null);
                setNotice(message);
            }
        } finally {
            mutating.current = false;
            setBusy(false);
            if (failed) void refresh();
        }
    }
    const open = (id: string) => context.navigate('tournaments', { community: '1', event: id });
    async function deleteEvent(name: string) {
        if (!snapshot || mutating.current) return;
        mutating.current = true;
        ++requestVersion.current;
        setBusy(true);
        setError('');
        try {
            await communityRpc('community_delete_event', {
                p_event: snapshot.event.id,
                p_revision: snapshot.event.revision,
                p_name: name
            });
            setDeleting(false);
            setSnapshot(null);
            context.navigate('tournaments', { community: '1' });
            void listRefresh();
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Não foi possível excluir o torneio.'
            );
            void refresh();
        } finally {
            mutating.current = false;
            setBusy(false);
        }
    }
    const event = snapshot?.event,
        mine = snapshot?.entries.find((e) => e.player_id === auth.profile?.player_id);
    const preparing = !!event && ['draft', 'published'].includes(event.status);
    const scoreAsAdmin =
        auth.isAdmin &&
        (historicalScore ||
            !mine ||
            (!!score && score.p1 !== mine.id && score.p2 !== mine.id) ||
            score?.status === 'confirmed');
    const SummaryPanel = desktop || preparing ? 'section' : 'details';
    const tournamentTabs = [
        ...(event?.status === 'running' ? [['pairings', 'Pairings']] : []),
        ['ranking', 'Ranking'],
        ['history', 'Histórico'],
        ...(auth.isAdmin ? [['admin', 'Admin']] : [])
    ];
    const activeTab = tournamentTabs.some(([key]) => key === tab)
        ? tab
        : event?.status === 'running'
          ? 'pairings'
          : 'ranking';
    const AuditPanel = preparing ? 'details' : 'section';
    const activePlayers = snapshot?.entries.filter((e) => !e.dropped).length || 0;
    const current = snapshot?.rounds[snapshot.rounds.length - 1];
    const currentMatches = snapshot?.matches.filter((m) => m.round_id === current?.id) || [];
    const visibleMatches = currentMatches.sort((a, b) => a.table_number - b.table_number);
    const eligible = !!auth.user && !!auth.profile?.player_id && auth.isMember;
    useEffect(() => {
        if (!mine && !auth.isAdmin) return;
        const controller = new AbortController();
        void fetch(
            window.APP_CONFIG.SUPABASE_URL +
                '/rest/v1/decks?select=id,name&is_active=eq.true&order=name.asc',
            { headers: window.createSupabaseHeaders(), signal: controller.signal }
        )
            .then(async (response) => {
                if (response.ok) {
                    const rows = await response.json();
                    if (!controller.signal.aborted) setDecks(rows);
                }
            })
            .catch(() => {});
        return () => controller.abort();
    }, [mine?.id, auth.isAdmin]);
    const askLogin = () => {
        sessionStorage.setItem(pendingEnrollmentKey, eventId);
        window.digistatsAuth?.open(auth.user ? 'profile' : 'login');
    };
    const auditPanel =
        auth.isAdmin && snapshot ? (
            <AuditPanel className="community-panel community-event-audit">
                {preparing ? (
                    <summary>Atividade do torneio</summary>
                ) : (
                    <h2>Atividade do torneio</h2>
                )}
                <ol className="community-audit-timeline">
                    {snapshot.audit.map((record) => {
                        const description = communityAuditDescription(record);
                        return description ? (
                            <li key={record.id}>
                                <p>{description}</p>
                                <time dateTime={record.created_at}>
                                    {communityDate(record.created_at)}
                                </time>
                            </li>
                        ) : null;
                    })}
                </ol>
                {!snapshot.audit.length && (
                    <p className="community-note">Nenhuma atividade registrada.</p>
                )}
            </AuditPanel>
        ) : null;
    async function copyResults() {
        const exported = await command('export');
        if (!exported) return;
        try {
            await context.loadScript('config/digilab-export.js');
            const formatter = (
                window as unknown as {
                    digilabExport: {
                        buildDigilabClipboardText: (
                            rows: unknown[],
                            options: { hashPrefix: boolean }
                        ) => string;
                    };
                }
            ).digilabExport;
            const rows = (exported.event.final_order || []).map((id, index) => {
                const row = exported.standings.find((s) => s.id === id)!;
                return {
                    placement: index + 1,
                    playerName: row.digilab_name?.trim() || row.name,
                    memberNumber: row.bandai_id,
                    points: row.points
                };
            });
            const text = formatter.buildDigilabClipboardText(rows, { hashPrefix: true });
            if (text !== exported.exports[0].body)
                throw new Error('A cópia difere da versão registrada. Avise a organização.');
            await navigator.clipboard.writeText(text);
            setNotice('Resultados copiados para o clipboard com sucesso.');
        } catch (error) {
            setError(
                error instanceof Error && error.message.includes('difere')
                    ? error.message
                    : 'Não foi possível copiar os resultados. Permita o acesso ao clipboard e tente novamente.'
            );
        }
    }
    const titleBlock = (
        <div className="community-title-row">
            <PageHeading title={event?.name || 'Organizar Torneio'} />
        </div>
    );
    const roundActions =
        event && snapshot && auth.isAdmin && current?.status !== 'paused' ? (
            <>
                {current?.status === 'closed' && (
                    <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => {
                            if (confirm('Reabrir a rodada para corrigir resultados?'))
                                void command('reopen_round');
                        }}
                    >
                        Reabrir última rodada
                    </button>
                )}
                {(!current || current.status === 'closed') &&
                    snapshot.rounds.length < (event.rounds || 0) && (
                        <>
                            <button
                                className="button primary"
                                disabled={busy}
                                onClick={() => void command('auto_pair')}
                            >
                                Iniciar próxima rodada
                            </button>
                        </>
                    )}
                {current?.status === 'paired' && (
                    <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void command('start_round')}
                    >
                        Iniciar relógio da rodada
                    </button>
                )}
                {current?.status === 'running' && (
                    <>
                        <button
                            className="button primary"
                            disabled={busy || currentMatches.some((m) => m.status !== 'confirmed')}
                            onClick={() => void command('close_round')}
                        >
                            Encerrar rodada
                        </button>
                        <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => {
                                const minutes = prompt(
                                    'Ajuste em minutos (negativo reduz o tempo):',
                                    '5'
                                );
                                if (minutes === null) return;
                                if (minutes.trim() && Number.isFinite(Number(minutes)))
                                    void command('adjust_clock', {
                                        seconds: Math.round(Number(minutes) * 60)
                                    });
                            }}
                        >
                            Ajustar relógio
                        </button>
                    </>
                )}
                {snapshot.rounds.length === event.rounds && current?.status === 'closed' && (
                    <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => void command('finish', { reviewed: true })}
                    >
                        Finalizar Torneio
                    </button>
                )}
                {current && current.status !== 'closed' && (
                    <button
                        className="button secondary community-cancel-button"
                        disabled={busy}
                        onClick={() => {
                            if (
                                confirm(
                                    'Parar esta rodada? O tempo e os placares serão salvos. Você poderá continuar de onde parou ou refazer os pareamentos e reiniciar.'
                                )
                            )
                                void command('pause_round');
                        }}
                    >
                        Parar rodada
                    </button>
                )}
            </>
        ) : null;
    return (
        <section
            className={`view catalog-app community-manager ${event?.status === 'running' ? 'community-live-view' : ''}`}
            aria-busy={busy}
        >
            {event?.status !== 'running' && (
                <div className="catalog-heading">
                    {titleBlock}
                    <div className="community-actions">
                        {!eventId && auth.isAdmin && (
                            <button className="button primary" onClick={() => setCreating(true)}>
                                + Criar torneio
                            </button>
                        )}
                    </div>
                </div>
            )}
            {(error || (!eventId && listError)) && (
                <div className="community-error" role="alert">
                    <p>{error || listError}</p>
                    <button
                        className="button secondary"
                        onClick={() => void (eventId ? refresh() : listRefresh())}
                    >
                        Atualizar
                    </button>
                </div>
            )}
            {notice && <p role="status">{notice}</p>}
            {!eventId && !auth.isAdmin && <CommunityNotices context={context} />}
            {!eventId && auth.isAdmin && (
                <div className="community-event-list">
                    {!events.length && !listError && (
                        <p>Nenhum torneio operacional. Crie o primeiro evento da comunidade.</p>
                    )}
                    {events.map((e) => (
                        <article className="community-panel" key={e.id}>
                            <span className="community-badge">{statusLabels[e.status]}</span>
                            <h2>{e.name}</h2>
                            <p>
                                {communityEventDate(e.starts_at)} · {e.format_code} · {e.registered}{' '}
                                inscritos
                            </p>
                            <button className="button primary" onClick={() => open(e.id)}>
                                Abrir torneio
                            </button>
                        </article>
                    ))}
                </div>
            )}
            {eventId && !snapshot && !error && <p role="status">Carregando torneio…</p>}
            {event && snapshot && (
                <>
                    {['running', 'finished'].includes(event.status) && (
                        <nav
                            className="community-play-nav"
                            aria-label="Torneio"
                            role="tablist"
                            onKeyDown={(event) => {
                                const index = tournamentTabs.findIndex(
                                    ([key]) => key === activeTab
                                );
                                const next =
                                    event.key === 'ArrowRight'
                                        ? (index + 1) % tournamentTabs.length
                                        : event.key === 'ArrowLeft'
                                          ? (index + tournamentTabs.length - 1) %
                                            tournamentTabs.length
                                          : event.key === 'Home'
                                            ? 0
                                            : event.key === 'End'
                                              ? tournamentTabs.length - 1
                                              : -1;
                                if (next >= 0) {
                                    event.preventDefault();
                                    setTab(tournamentTabs[next][0]);
                                    document
                                        .getElementById(`community-tab-${tournamentTabs[next][0]}`)
                                        ?.focus();
                                }
                            }}
                        >
                            {tournamentTabs.map(([key, label]) => (
                                <button
                                    key={key}
                                    id={`community-tab-${key}`}
                                    className="community-tournament-tab"
                                    role="tab"
                                    aria-selected={activeTab === key}
                                    tabIndex={activeTab === key ? 0 : -1}
                                    onClick={() => setTab(key)}
                                >
                                    <CommunityTabIcon tab={key} />
                                    {label}
                                </button>
                            ))}
                        </nav>
                    )}
                    <div
                        className={`community-event-layout ${auth.isAdmin && preparing ? 'community-setup-layout' : ''}`}
                    >
                        {auth.isAdmin && !preparing && activeTab === 'admin' && (
                            <section className="community-panel community-manage-event">
                                <h2>Gerenciar torneio</h2>
                                <dl className="community-event-facts">
                                    <div>
                                        <dt>Previsão de início</dt>
                                        <dd>{communityEventDate(event.starts_at)}</dd>
                                    </div>
                                    <div>
                                        <dt>Formato</dt>
                                        <dd>{event.format_code}</dd>
                                    </div>
                                </dl>
                                <div className="community-actions">
                                    <button
                                        className="button primary"
                                        disabled={busy || event.status === 'cancelled'}
                                        onClick={() => {
                                            setError('');
                                            setCreating(true);
                                        }}
                                    >
                                        Editar configurações
                                    </button>
                                    {event.status === 'running' && (
                                        <button
                                            className="button secondary community-cancel-button"
                                            disabled={busy}
                                            onClick={() => {
                                                if (confirm('Cancelar o torneio?'))
                                                    void command('cancel');
                                            }}
                                        >
                                            Cancelar torneio
                                        </button>
                                    )}
                                    {event.status === 'finished' && (
                                        <button
                                            className="button secondary community-delete-button"
                                            disabled={busy}
                                            onClick={() => {
                                                setError('');
                                                setDeleting(true);
                                            }}
                                        >
                                            Excluir torneio
                                        </button>
                                    )}
                                </div>
                            </section>
                        )}
                        {(preparing || (event.status !== 'running' && activeTab !== 'admin')) && (
                            <div className="community-summary-column">
                                <SummaryPanel
                                    open={!desktop}
                                    className="community-panel community-event-summary"
                                >
                                    {desktop || preparing ? (
                                        <h2>Resumo do torneio</h2>
                                    ) : (
                                        <summary>Resumo do torneio</summary>
                                    )}
                                    <div className="community-event-status">
                                        <span className="community-badge">
                                            {event.registration_open
                                                ? 'Inscrições abertas'
                                                : event.status === 'draft'
                                                  ? 'Em preparação'
                                                  : statusLabels[event.status]}
                                        </span>
                                        <span>{snapshot.entries.length} jogadores</span>
                                    </div>
                                    <dl className="community-event-facts">
                                        <div>
                                            <dt>Previsão de início</dt>
                                            <dd>{communityEventDate(event.starts_at)}</dd>
                                        </div>
                                        <div>
                                            <dt>Local</dt>
                                            <dd>
                                                {event.modality === 'online'
                                                    ? 'Online'
                                                    : event.location || 'Presencial'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Organização</dt>
                                            <dd>{event.store_name || event.organizer}</dd>
                                        </div>
                                        <div>
                                            <dt>Formato</dt>
                                            <dd>
                                                {event.format_code}
                                                {event.rounds ? ` · ${event.rounds} rodadas` : ''}
                                            </dd>
                                        </div>
                                    </dl>
                                    <div className="community-rules-details">
                                        <p className="community-note">
                                            Individual suíço · BO3 · {event.round_minutes ?? 45}{' '}
                                            minutos
                                            {(event.overtime_minutes ?? 5) > 0
                                                ? ` + ${event.overtime_minutes ?? 5} de overtime. `
                                                : ' · Sem overtime. '}
                                            {event.rounds
                                                ? `${event.rounds} rodadas.`
                                                : 'Rodadas definidas pelo número de jogadores ao iniciar.'}
                                        </p>
                                    </div>
                                    {event.status === 'published' && !mine && (
                                        <>
                                            {event.registration_open ? (
                                                <button
                                                    className="button primary"
                                                    disabled={
                                                        busy ||
                                                        auth.loading ||
                                                        snapshot.entries.length >= event.capacity
                                                    }
                                                    onClick={() =>
                                                        eligible
                                                            ? void command('register')
                                                            : askLogin()
                                                    }
                                                >
                                                    {snapshot.entries.length >= event.capacity
                                                        ? 'Vagas esgotadas'
                                                        : !auth.user
                                                          ? 'Entrar para se inscrever'
                                                          : !auth.profile?.player_id
                                                            ? 'Vincular jogador para se inscrever'
                                                            : !auth.isMember
                                                              ? 'Concluir cadastro para se inscrever'
                                                              : 'Confirmar inscrição'}
                                                </button>
                                            ) : (
                                                <p>Inscrições encerradas.</p>
                                            )}
                                            <p className="community-note">
                                                A inscrição exige uma conta ativa vinculada a um
                                                jogador.
                                            </p>
                                        </>
                                    )}
                                    {mine && !(auth.isAdmin && preparing) && (
                                        <div>
                                            <h3>Minha inscrição</h3>
                                            <p>
                                                {mine.name} ·{' '}
                                                {mine.dropped ? 'Desistente' : 'Inscrito'}
                                            </p>
                                            <div className="community-actions">
                                                {!mine.dropped &&
                                                    ['published', 'running'].includes(
                                                        event.status
                                                    ) && (
                                                        <button
                                                            className="button secondary"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                if (
                                                                    confirm(
                                                                        'Desistir deste torneio? Os resultados anteriores serão preservados.'
                                                                    )
                                                                )
                                                                    void command('drop');
                                                            }}
                                                        >
                                                            Desistir do torneio
                                                        </button>
                                                    )}
                                            </div>
                                            {['draft', 'published'].includes(event.status) && (
                                                <details>
                                                    <summary>Deck e lista (opcionais)</summary>
                                                    <form
                                                        className="community-form"
                                                        onSubmit={(e) => {
                                                            e.preventDefault();
                                                            const f = new FormData(e.currentTarget);
                                                            void command('deck', {
                                                                deck_id: f.get('deck_id'),
                                                                decklist: f.get('decklist')
                                                            });
                                                        }}
                                                    >
                                                        <label>
                                                            Arquétipo
                                                            <select
                                                                name="deck_id"
                                                                defaultValue={mine.deck_id || ''}
                                                            >
                                                                <option value="">
                                                                    Não informado
                                                                </option>
                                                                {decks.map((deck) => (
                                                                    <option
                                                                        key={deck.id}
                                                                        value={deck.id}
                                                                    >
                                                                        {deck.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>
                                                        <label>
                                                            Lista ou link
                                                            <textarea
                                                                name="decklist"
                                                                defaultValue={mine.decklist || ''}
                                                                maxLength={20000}
                                                            />
                                                        </label>
                                                        <p className="community-note">
                                                            A lista fica visível somente para você e
                                                            a organização durante o evento.
                                                        </p>
                                                        <button
                                                            className="button secondary"
                                                            disabled={busy}
                                                        >
                                                            Salvar deck
                                                        </button>
                                                    </form>
                                                </details>
                                            )}
                                        </div>
                                    )}
                                    {auth.isAdmin && event.status === 'finished' && (
                                        <div className="community-actions">
                                            <button
                                                className="button primary"
                                                disabled={busy}
                                                onClick={() => void copyResults()}
                                            >
                                                Copiar resultados
                                            </button>
                                            <a
                                                className="button secondary"
                                                href="https://digimon.digilab.cards/submit"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Abrir submissão no DigiLab
                                            </a>
                                        </div>
                                    )}
                                    {auth.isAdmin && (
                                        <div className="community-setup-controls">
                                            {preparing && (
                                                <section
                                                    className="community-next-step"
                                                    aria-labelledby="community-next-title"
                                                >
                                                    <h2 id="community-next-title">
                                                        Preparar o início
                                                    </h2>
                                                    <p
                                                        id="community-start-hint"
                                                        className="community-note"
                                                    >
                                                        {activePlayers < 4
                                                            ? `Inclua mais ${4 - activePlayers} ${4 - activePlayers === 1 ? 'jogador' : 'jogadores'} para iniciar. Mínimo de 4 participantes.`
                                                            : `${activePlayers} jogadores prontos. As inscrições serão encerradas ao iniciar.`}
                                                    </p>
                                                    <button
                                                        className="button primary community-start-button"
                                                        disabled={
                                                            busy ||
                                                            activePlayers < 4 ||
                                                            activePlayers > 128
                                                        }
                                                        aria-describedby="community-start-hint"
                                                        onClick={() => setStarting(true)}
                                                    >
                                                        Iniciar torneio
                                                    </button>
                                                    <button
                                                        className="button secondary"
                                                        disabled={busy}
                                                        onClick={() => setCreating(true)}
                                                    >
                                                        Editar configuração
                                                    </button>
                                                </section>
                                            )}
                                            <details className="community-settings-details">
                                                <summary>Mais opções</summary>
                                                <div className="community-settings-actions">
                                                    {!['finished', 'cancelled'].includes(
                                                        event.status
                                                    ) && (
                                                        <button
                                                            className="button secondary"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                if (confirm('Cancelar o evento?'))
                                                                    void command('cancel');
                                                            }}
                                                        >
                                                            Cancelar evento
                                                        </button>
                                                    )}
                                                    <button
                                                        className="button secondary community-delete-button"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            setError('');
                                                            setDeleting(true);
                                                        }}
                                                    >
                                                        Excluir torneio
                                                    </button>
                                                </div>
                                            </details>
                                        </div>
                                    )}
                                </SummaryPanel>
                                {preparing && auditPanel}
                            </div>
                        )}
                        {auth.isAdmin &&
                            event.status !== 'finished' &&
                            (event.status !== 'running' || activeTab === 'admin') && (
                                <section
                                    className="community-panel community-participants-panel"
                                    aria-labelledby="community-participants-title"
                                >
                                    <h2 id="community-participants-title">
                                        {preparing ? 'Participantes' : 'Gerenciar Jogadores'} (
                                        {snapshot.entries.length})
                                    </h2>
                                    {preparing && (
                                        <AddParticipant
                                            busy={busy}
                                            entries={snapshot.entries}
                                            capacity={event.capacity}
                                            onAdd={(ids) =>
                                                command('add_players', { player_ids: ids })
                                            }
                                        />
                                    )}
                                    {!snapshot.entries.length && (
                                        <p className="community-note">
                                            As inscrições estão abertas na Visão Geral. Você também
                                            pode incluir jogadores pelo nome acima.
                                        </p>
                                    )}
                                    {snapshot.entries.map((entry) => (
                                        <div className="community-entry" key={entry.id}>
                                            <span>
                                                <strong>{entry.name}</strong>
                                                {(entry.bandai_id || entry.dropped) && (
                                                    <small>
                                                        {entry.bandai_id
                                                            ? `#${entry.bandai_id}`
                                                            : ''}
                                                        {entry.dropped ? ' · Desistente' : ''}
                                                    </small>
                                                )}
                                            </span>
                                            {entry.decklist && (
                                                <details>
                                                    <summary>Lista de {entry.name}</summary>
                                                    <pre>{entry.decklist}</pre>
                                                </details>
                                            )}
                                            {!entry.dropped &&
                                                !['finished', 'cancelled'].includes(
                                                    event.status
                                                ) && (
                                                    <ActionMenu label={`Gerenciar ${entry.name}`}>
                                                        <button
                                                            className="button secondary"
                                                            disabled={busy}
                                                            onClick={() => setEditingDeck(entry)}
                                                        >
                                                            Editar deck
                                                        </button>
                                                        <button
                                                            className="button secondary"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                if (
                                                                    confirm(
                                                                        `${event.status === 'running' ? 'Marcar desistência de' : 'Remover inscrição de'} ${entry.name}?`
                                                                    )
                                                                )
                                                                    void command('drop', {
                                                                        entry_id: entry.id
                                                                    });
                                                            }}
                                                        >
                                                            {event.status === 'running'
                                                                ? 'Marcar desistência'
                                                                : 'Remover inscrição'}
                                                        </button>
                                                    </ActionMenu>
                                                )}
                                        </div>
                                    ))}
                                </section>
                            )}
                    </div>
                    {event.status === 'running' && activeTab === 'pairings' && (
                        <section className="community-panel community-round-panel">
                            <div className="community-round-heading">
                                <div className="community-match-title">
                                    {titleBlock}
                                    <h2>
                                        {current
                                            ? `Rodada ${current.number} de ${event.rounds}`
                                            : 'Preparar primeira rodada'}
                                    </h2>
                                </div>
                                {current?.status === 'paused' && auth.isAdmin && (
                                    <div className="community-actions">
                                        <button
                                            className="button primary"
                                            disabled={busy}
                                            onClick={() => void command('resume_round')}
                                        >
                                            Continuar a rodada de onde parou
                                        </button>
                                        <button
                                            className="button secondary"
                                            disabled={busy}
                                            onClick={() => {
                                                if (
                                                    confirm(
                                                        'Refazer os pareamentos e reiniciar o relógio? Os placares salvos desta rodada serão substituídos.'
                                                    )
                                                )
                                                    void command('restart_round');
                                            }}
                                        >
                                            Refazer pareamentos e reiniciar
                                        </button>
                                    </div>
                                )}
                                {roundActions && desktop && (
                                    <div className="community-actions">{roundActions}</div>
                                )}
                            </div>

                            {current?.status === 'paused' && (
                                <div className="community-paused-round" role="status">
                                    <h3>Rodada pausada</h3>
                                    <p>
                                        {auth.isAdmin
                                            ? 'O tempo, as mesas e os placares estão salvos. Continue de onde parou ou revise resultados e drops antes de refazer os pareamentos.'
                                            : 'A rodada está pausada pela organização. Aguarde para continuar.'}
                                    </p>
                                    {auth.isAdmin && (
                                        <div className="community-actions">
                                            <button
                                                className="button secondary"
                                                onClick={() => setTab('history')}
                                            >
                                                Revisar histórico
                                            </button>
                                            <button
                                                className="button secondary"
                                                onClick={() => setTab('admin')}
                                            >
                                                Gerenciar jogadores
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {current?.status === 'closed' && (
                                <p role="status">Rodada concluída. Aguardando a próxima rodada.</p>
                            )}
                            {current?.status === 'running' && (
                                <RoundClock
                                    eventId={event.id}
                                    eventName={event.name}
                                    roundId={current.id}
                                    roundNumber={current.number}
                                    viewerId={auth.user?.id}
                                    serverNow={snapshot.server_now}
                                    receivedAt={snapshot.received_at}
                                    endsAt={current.ends_at!}
                                    overtimeAt={current.overtime_ends_at!}
                                />
                            )}
                            {!visibleMatches.length && current && current.status !== 'paused' && (
                                <p>Nenhuma mesa nesta rodada.</p>
                            )}
                            {current?.status !== 'paused' && (
                                <CommunityPairings
                                    snapshot={snapshot}
                                    matches={visibleMatches}
                                    mine={mine}
                                    admin={auth.isAdmin}
                                    busy={busy}
                                    onOpen={(match) => {
                                        setHistoricalScore(false);
                                        setScore(match);
                                    }}
                                />
                            )}
                            {roundActions && !desktop && (
                                <div className="community-round-mobile-actions">{roundActions}</div>
                            )}
                        </section>
                    )}
                    {(snapshot.rounds.length > 0 || event.status === 'running') &&
                        activeTab === 'ranking' && (
                            <section className="community-panel">
                                <h2>
                                    Classificação{' '}
                                    {event.status === 'finished' ? 'final revisada' : 'provisória'}
                                </h2>
                                <div className="community-table-scroll">
                                    <table className="community-ranking-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Jogador</th>
                                                <th>Pontos</th>
                                                {event.status !== 'finished' && (
                                                    <>
                                                        <th title="Vitórias, derrotas e empates">
                                                            Record
                                                        </th>
                                                        <th title="Percentual de vitórias de partida dos oponentes">
                                                            OMW%
                                                        </th>
                                                        <th title="Percentual de vitórias de jogo">
                                                            GW%
                                                        </th>
                                                        <th title="Percentual de vitórias de jogo dos oponentes">
                                                            OGW%
                                                        </th>
                                                        <th>Byes</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(event.final_order
                                                ? event.final_order.map(
                                                      (id) =>
                                                          snapshot.standings.find(
                                                              (s) => s.id === id
                                                          )!
                                                  )
                                                : snapshot.standings
                                            ).map((s, index) => (
                                                <tr key={s.id}>
                                                    <td>{index + 1}</td>
                                                    <td
                                                        className={
                                                            s.id === mine?.id
                                                                ? 'community-ranking-self'
                                                                : ''
                                                        }
                                                    >
                                                        {s.name}
                                                        {s.dropped ? ' (DROP)' : ''}
                                                    </td>
                                                    <td>{s.points}</td>
                                                    {event.status !== 'finished' && (
                                                        <>
                                                            <td>
                                                                {communityRecord(
                                                                    snapshot.matches,
                                                                    s.id
                                                                )}
                                                            </td>
                                                            <td>
                                                                {(Number(s.omw) * 100).toFixed(2)}%
                                                            </td>
                                                            <td>
                                                                {(Number(s.gw) * 100).toFixed(2)}%
                                                            </td>
                                                            <td>
                                                                {(Number(s.ogw) * 100).toFixed(2)}%
                                                            </td>
                                                            <td>{s.byes}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    {snapshot.rounds.length > 0 && activeTab === 'history' && (
                        <CommunityRoundHistory
                            snapshot={snapshot}
                            mine={mine}
                            admin={auth.isAdmin}
                            busy={busy}
                            onOpen={(match) => {
                                setHistoricalScore(true);
                                setScore(match);
                            }}
                        />
                    )}
                    {!preparing && activeTab === 'admin' && auditPanel}
                </>
            )}
            {starting && event && snapshot && auth.isAdmin && (
                <Dialog title="Iniciar torneio" busy={busy} onClose={() => setStarting(false)}>
                    <p>
                        O torneio será iniciado com {activePlayers} jogadores. Os pairings serão
                        sorteados e o tempo de {event.round_minutes ?? 45} minutos +{' '}
                        {event.overtime_minutes ?? 5} minutos de overtime será iniciado. Confirma o
                        início do torneio?
                    </p>
                    {error && (
                        <p className="community-error" role="alert">
                            {error}
                        </p>
                    )}
                    <div className="community-actions">
                        <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => setStarting(false)}
                        >
                            Não
                        </button>
                        <button
                            className="button primary"
                            disabled={busy || activePlayers < 4 || !preparing}
                            onClick={async () => {
                                if (await command('start')) setStarting(false);
                            }}
                        >
                            Sim
                        </button>
                    </div>
                </Dialog>
            )}
            {deleting && event && auth.isAdmin && (
                <CommunityDeleteEvent
                    event={event}
                    busy={busy}
                    error={error}
                    onClose={() => setDeleting(false)}
                    onDelete={deleteEvent}
                />
            )}
            {creating && (
                <CommunityEventForm
                    event={event}
                    formats={data.formats}
                    stores={data.stores}
                    schedule={data.schedule}
                    busy={busy}
                    error={error}
                    onClose={() => setCreating(false)}
                    onSave={async (payload) => {
                        setBusy(true);
                        setError('');
                        try {
                            if (event) {
                                if (await command('configure', payload)) setCreating(false);
                            } else {
                                const id = await communityRpc<string>('community_create', {
                                    p_data: payload
                                });
                                setCreating(false);
                                open(id);
                            }
                        } catch (error) {
                            setError(
                                error instanceof Error ? error.message : 'Falha ao salvar evento.'
                            );
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
            )}
            {score && snapshot && (
                <ScoreDialog
                    error={error}
                    match={score}
                    entries={snapshot.entries}
                    mine={mine}
                    admin={scoreAsAdmin}
                    busy={busy}
                    requiresFinalReview={historicalScore && event?.status === 'finished'}
                    onClose={() => setScore(null)}
                    onConfirm={() =>
                        command('confirm', {
                            match_id: score.id,
                            match_revision: score.revision ?? 0
                        })
                    }
                    onSave={(payload) =>
                        command(
                            scoreAsAdmin
                                ? historicalScore
                                    ? 'correct_result'
                                    : 'resolve'
                                : score?.status === 'proposed'
                                  ? 'contest'
                                  : 'propose',
                            { ...payload, match_revision: score?.revision ?? 0 }
                        )
                    }
                />
            )}
            {editingDeck && (
                <Dialog
                    title={`Deck de ${editingDeck.name}`}
                    busy={busy}
                    onClose={() => setEditingDeck(null)}
                >
                    {error && (
                        <p className="community-error" role="alert">
                            {error}
                        </p>
                    )}
                    <form
                        className="community-form"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void command('deck', {
                                entry_id: editingDeck.id,
                                deck_id: f.get('deck_id'),
                                decklist: f.get('decklist')
                            });
                        }}
                    >
                        <label>
                            Arquétipo
                            <select name="deck_id" defaultValue={editingDeck.deck_id || ''}>
                                <option value="">Não informado</option>
                                {decks.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Lista ou link
                            <textarea
                                name="decklist"
                                defaultValue={editingDeck.decklist || ''}
                                maxLength={20000}
                            />
                        </label>
                        <button className="button primary" disabled={busy}>
                            Salvar deck
                        </button>
                    </form>
                </Dialog>
            )}
        </section>
    );
}

function RoundClock({
    eventId,
    eventName,
    roundId,
    roundNumber,
    viewerId,
    endsAt,
    overtimeAt,
    serverNow,
    receivedAt
}: {
    eventId: string;
    eventName: string;
    roundId: string;
    roundNumber: number;
    viewerId?: string;
    endsAt: string;
    overtimeAt: string;
    serverNow?: string;
    receivedAt?: number;
}) {
    const initialOffset = serverNow ? Date.parse(serverNow) - (receivedAt ?? Date.now()) : 0;
    const [now, setNow] = useState(() => Date.now() + initialOffset);
    const [offset, setOffset] = useState(initialOffset);
    const announcedRound = useRef('');
    useEffect(() => {
        const delta = serverNow ? new Date(serverNow).getTime() - (receivedAt ?? Date.now()) : 0;
        setOffset(delta);
        setNow(Date.now() + delta);
    }, [serverNow, receivedAt]);
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now() + offset), 1000);
        return () => clearInterval(id);
    }, [offset]);
    const regular = new Date(endsAt).getTime(),
        end = new Date(overtimeAt).getTime(),
        remaining =
            now < regular
                ? Math.max(0, Math.ceil((regular - now) / 1000))
                : Math.max(0, Math.floor((Math.min(now, end) - regular) / 1000));
    useEffect(() => {
        if (end <= regular || now < regular) return;
        const phase = now >= end ? 'overtime_end' : 'overtime';
        const announcement = `${roundId}:${phase}`;
        if (announcedRound.current === announcement) return;
        announcedRound.current = announcement;
        const key = `community-alert:${viewerId}:${announcement}`;
        try {
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, '1');
        } catch {
            /* The visible alert remains available without local storage. */
        }
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        void (async () => {
            try {
                const title =
                    phase === 'overtime_end'
                        ? 'fim do overtime, passem os resultados'
                        : `Inicio do overtime: ${(end - regular) / 60000} minutos ou 3 turnos`;
                const options = {
                    body: `${eventName} · R${roundNumber}`,
                    tag: key,
                    data: { url: window.location.href }
                };
                const registration = await navigator.serviceWorker?.getRegistration();
                if (registration) await registration.showNotification(title, options);
                else {
                    const notification = new Notification(title, options);
                    notification.onclick = () => {
                        window.focus();
                        notification.close();
                    };
                }
            } catch {
                /* The timer and OVERTIME alert stay visible if the OS rejects delivery. */
            }
        })();
    }, [now, regular, end, roundId, roundNumber, eventId, eventName, viewerId]);
    return (
        <div
            className={`community-round-clock ${end > regular && now >= regular ? 'is-overtime' : ''} ${now >= end ? 'is-expired' : ''}`}
        >
            {end > regular && now >= regular && (
                <p role="alert">{now < end ? 'OVERTIME' : 'FIM DO OVERTIME'}</p>
            )}
            <div
                className="community-clock"
                role="timer"
                aria-label={
                    now < regular
                        ? 'Tempo restante da rodada'
                        : now < end
                          ? 'Tempo decorrido de overtime'
                          : end > regular
                            ? 'Overtime encerrado'
                            : 'Tempo da rodada encerrado'
                }
            >
                <span>{String(Math.floor(remaining / 60)).padStart(2, '0')}</span>
                <span>:</span>
                <span>{String(remaining % 60).padStart(2, '0')}</span>
            </div>
        </div>
    );
}
function AddParticipant({
    busy,
    entries,
    capacity,
    onAdd
}: {
    busy: boolean;
    entries: CommunityEntry[];
    capacity: number;
    onAdd: (ids: string[]) => Promise<unknown>;
}) {
    const [selected, setSelected] = useState<PickedCommunityPlayer[]>([]);
    return (
        <div className="community-form community-add-player-form">
            <CommunityPlayerPicker
                busy={busy}
                selected={selected}
                onChange={setSelected}
                limit={Math.max(0, capacity - entries.length)}
                excluded={entries.map((e) => e.player_id)}
            />
            <button
                type="button"
                className="button primary"
                disabled={busy || !selected.length}
                hidden={!selected.length}
                onClick={async () => {
                    if (await onAdd(selected.map((p) => p.id))) setSelected([]);
                }}
            >
                Incluir {selected.length ? selected.length : ''} jogador
                {selected.length === 1 ? '' : 'es'}
            </button>
        </div>
    );
}
function ScoreDialog({
    error,
    match,
    entries,
    mine,
    admin,
    busy,
    requiresFinalReview,
    onClose,
    onConfirm,
    onSave
}: {
    error: string;
    match: CommunityMatch;
    entries: CommunityEntry[];
    mine?: CommunityEntry;
    admin: boolean;
    busy: boolean;
    requiresFinalReview?: boolean;
    onClose: () => void;
    onConfirm: () => Promise<unknown>;
    onSave: (data: Record<string, unknown>) => Promise<unknown>;
}) {
    const reverse = !admin && match.p2 === mine?.id;
    const [values, setValues] = useState<(number | null)[]>([null, null, null]);
    const [refuting, setRefuting] = useState(false);
    const reviewing = !admin && match.status === 'proposed' && match.proposed_by !== mine?.id;
    const waiting =
        !admin &&
        (match.status === 'confirmed' ||
            (match.status === 'proposed' && match.proposed_by === mine?.id));
    const complete = values.every((v) => v !== null);
    const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
    const valid = complete && total >= 1 && total <= 3;
    return (
        <Dialog
            title={
                reviewing && !refuting
                    ? 'Confira o placar'
                    : admin
                      ? 'Lançar resultado pela organização'
                      : 'Informar resultado'
            }
            busy={busy}
            onClose={onClose}
        >
            {error && (
                <p className="community-error" role="alert">
                    {error}
                </p>
            )}
            {requiresFinalReview && (
                <p className="community-note">
                    Ao salvar esta correção, será necessário finalizar novamente o torneio.
                </p>
            )}
            {(reviewing && !refuting) || waiting ? (
                <div className="community-result-review">
                    <p>
                        {entries.find((entry) => entry.id === match.p1)?.name}{' '}
                        <strong>
                            {match.wins}–{match.losses}–{match.draws}
                        </strong>{' '}
                        {entries.find((entry) => entry.id === match.p2)?.name}
                    </p>
                    {reviewing ? (
                        <div className="community-actions">
                            <button
                                className="button primary"
                                disabled={busy}
                                onClick={() => void onConfirm()}
                            >
                                Confirmar o resultado
                            </button>
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => setRefuting(true)}
                            >
                                Refutar resultado
                            </button>
                        </div>
                    ) : (
                        <p className="community-note">
                            {match.status === 'confirmed'
                                ? 'Resultado confirmado.'
                                : 'Aguardando o adversário aceitar ou refutar o placar.'}
                        </p>
                    )}
                </div>
            ) : (
                <form
                    className="community-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void onSave({
                            match_id: match.id,
                            wins: Number(f.get('wins')),
                            losses: Number(f.get('losses')),
                            draws: Number(f.get('draws')),
                            reason: f.get('reason') || ''
                        });
                    }}
                >
                    <div className="community-score-options">
                        {[
                            {
                                name: 'wins',
                                label:
                                    entries.find((e) => e.id === (reverse ? match.p2 : match.p1))
                                        ?.name || 'Player 1',
                                options: [2, 1, 0]
                            },
                            {
                                name: 'losses',
                                label:
                                    entries.find((e) => e.id === (reverse ? match.p1 : match.p2))
                                        ?.name || 'Player 2',
                                options: [2, 1, 0]
                            },
                            { name: 'draws', label: 'Draw', options: [1, 0] }
                        ].map((row, index) => (
                            <fieldset key={row.name} disabled={busy}>
                                <legend>
                                    {row.label}
                                    {index === 0 && !admin ? ' (você)' : ''}
                                </legend>
                                <div>
                                    {row.options.map((value) => (
                                        <label key={value}>
                                            <input
                                                type="radio"
                                                name={row.name}
                                                value={value}
                                                required
                                                disabled={
                                                    values.reduce<number>(
                                                        (sum, v, i) =>
                                                            sum + (i === index ? 0 : (v ?? 0)),
                                                        0
                                                    ) +
                                                        value >
                                                    3
                                                }
                                                checked={values[index] === value}
                                                onChange={() =>
                                                    setValues((current) =>
                                                        current.map((v, i) =>
                                                            i === index ? value : v
                                                        )
                                                    )
                                                }
                                            />
                                            <span>{value}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        ))}
                    </div>
                    <p className="community-note" role="status">
                        {complete && !valid
                            ? 'O placar deve somar de 1 a 3 jogos.'
                            : 'Selecione uma opção em cada linha. Máximo de 3 jogos no total.'}
                    </p>
                    <button className="button primary" disabled={busy || !valid}>
                        {admin ? 'Confirmar decisão' : 'Enviar ao adversário'}
                    </button>
                </form>
            )}
        </Dialog>
    );
}
