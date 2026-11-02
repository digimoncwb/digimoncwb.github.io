import type { RouteName, SiteAuthState } from '../contracts';

export function routeAccess(name: RouteName): 'admin' | 'account' | 'public' {
    if (['admin', 'players', 'posts', 'manage'].includes(name)) return 'admin';
    if (['decks', 'builder'].includes(name)) return 'account';
    return 'public';
}

export function canAccessRoute(name: RouteName, account: Pick<SiteAuthState, 'user' | 'isAdmin'>) {
    const access = routeAccess(name);
    return access === 'public' || (!!account.user && (access !== 'admin' || account.isAdmin));
}
