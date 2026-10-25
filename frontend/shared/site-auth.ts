import { useSyncExternalStore } from 'react';
import type { SiteAuthState } from '../contracts';

export const emptyAuthState: SiteAuthState = {
    initialized: false,
    available: false,
    loading: false,
    enabled: false,
    user: null,
    profile: null,
    isAdmin: false,
    isMember: false,
    config: null,
    error: '',
    recoveryRequired: false
};
const noopSubscribe = () => () => {};
const emptySnapshot = () => emptyAuthState;
export function useSiteAuth() {
    return useSyncExternalStore(
        window.digistatsAuth?.subscribe || noopSubscribe,
        window.digistatsAuth?.getSnapshot || emptySnapshot,
        emptySnapshot
    );
}
export function canEditCommunityDeck(auth: SiteAuthState, owner?: string | null) {
    return (
        !auth.enabled || (auth.isMember && (auth.isAdmin || (!!owner && owner === auth.user?.id)))
    );
}
export function canDeleteCommunityDeck(auth: SiteAuthState, owner?: string | null) {
    return !!auth.user && auth.isMember && (owner ? owner === auth.user.id : auth.isAdmin);
}
