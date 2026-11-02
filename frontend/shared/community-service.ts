import { useCallback, useEffect, useState } from 'react';

export interface CommunityEvent {
    id: string;
    name: string;
    organizer: string;
    store_id: string | null;
    store_name?: string;
    location: string;
    modality: 'presencial' | 'online';
    starts_at: string;
    event_type: string;
    format_id: number;
    format_code: string;
    capacity: number;
    round_minutes?: number;
    overtime_minutes?: number;
    registered: number;
    enrolled?: boolean;
    active_participant?: boolean;
    status: 'draft' | 'published' | 'running' | 'finished' | 'cancelled';
    registration_open: boolean;
    checkin_open: boolean;
    revision: number;
    rounds: number | null;
    initial_players: number | null;
    final_order: string[] | null;
    digilab_id: number | null;
    reconciliation: string;
    canonical_tournament_id: number | null;
    reconcile_error?: string | null;
}
export interface CommunityEntry {
    id: string;
    player_id: string;
    name: string;
    bandai_id?: string | null;
    checked_in: boolean;
    dropped: boolean;
    deck_id: string | null;
    decklist: string | null;
}
export interface Standing extends CommunityEntry {
    digilab_name: string | null;
    points: number;
    byes: number;
    played: number;
    omw: number;
    gw: number;
    ogw: number;
}
export interface CommunityRound {
    id: string;
    number: number;
    status: 'paired' | 'running' | 'closed' | 'paused';
    started_at: string | null;
    ends_at: string | null;
    overtime_ends_at: string | null;
}
export interface CommunityMatch {
    revision?: number;
    id: string;
    round_id: string;
    table_number: number;
    p1: string;
    p2: string | null;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    status: 'pending' | 'proposed' | 'contested' | 'confirmed';
    proposed_by: string | null;
    reason: string;
}
export interface CommunitySnapshot {
    received_at?: number;
    server_now?: string;
    event: CommunityEvent;
    entries: CommunityEntry[];
    standings: Standing[];
    rounds: CommunityRound[];
    matches: CommunityMatch[];
    exports: { id: string; header: Record<string, unknown>; body: string; created_at: string }[];
    audit: {
        id: number;
        actor?: string | null;
        action: string;
        created_at: string;
        details: Record<string, unknown>;
    }[];
}
export async function communityRequest<T>(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
): Promise<T> {
    const response = await fetch(window.APP_CONFIG.SUPABASE_URL + path, {
        method: 'POST',
        headers: window.createSupabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(
            result?.message ||
                result?.error ||
                'Não foi possível consultar os torneios da comunidade.'
        );
    return result;
}
export const communityRpc = <T>(
    name: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal
) => communityRequest<T>('/rest/v1/rpc/' + name, body, signal);

export function useCommunityList(admin: boolean, active: boolean, identity = '') {
    const [events, setEvents] = useState<CommunityEvent[]>([]),
        [error, setError] = useState('');
    const refresh = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const events = await communityRpc<CommunityEvent[]>(
                    'community_list',
                    { p_admin: admin },
                    signal
                );
                if (!signal?.aborted) {
                    setEvents(events);
                    setError('');
                }
            } catch (error) {
                if (!signal?.aborted)
                    setError(
                        error instanceof Error ? error.message : 'Falha ao consultar eventos.'
                    );
            }
        },
        [admin, identity]
    );
    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        void refresh(controller.signal);
        const interval = window.setInterval(() => {
            if (!document.hidden) void refresh(controller.signal);
        }, 15000);
        const focus = () => {
            if (!document.hidden) void refresh(controller.signal);
        };
        window.addEventListener('focus', focus);
        window.addEventListener('digistats:community-changed', focus);
        return () => {
            controller.abort();
            clearInterval(interval);
            window.removeEventListener('focus', focus);
            window.removeEventListener('digistats:community-changed', focus);
        };
    }, [active, refresh]);
    return { events, error, refresh };
}
export const communityDate = (date: string) =>
    new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(date));
export const pendingEnrollmentKey = 'digistats:community-enrollment';
export const communityEventDate = (date: string) =>
    new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(date));
export const communityDigilabType = (type: string) => (type === 'For Fun' ? 'Casuals' : type);
