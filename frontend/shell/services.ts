import type { DataService, Snapshot } from '../contracts';
import { navigate } from './routes';
import { createSiteAuth } from './auth-service';
export const projectRoot = new URL(
    document.querySelector<HTMLMetaElement>('meta[name="digistats-root"]')?.content || '../',
    location.href
);
export const asset = (path: string) => new URL(path, projectRoot).href;
const scripts = new Map<string, Promise<void>>();
// The build version allows repeat visits to reuse scripts without mixing releases.
declare const __CWB_ASSET_VERSION__: string;
export const scriptVersion = __CWB_ASSET_VERSION__;
export function loadScript(path: string) {
    const source = new URL(path.startsWith('https:') ? path : asset(path));
    if (!path.startsWith('https:')) source.searchParams.set('v', scriptVersion);
    const src = source.href;
    if (!scripts.has(src))
        scripts.set(
            src,
            new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve();
                script.onerror = () => {
                    scripts.delete(src);
                    script.remove();
                    reject(Error('Não foi possível carregar um componente. Tente novamente.'));
                };
                document.head.append(script);
            })
        );
    return scripts.get(src)!;
}
let snapshot: Snapshot = {
    data: { events: [], stores: [], formats: [], schedule: [] },
    loading: true,
    error: '',
    updatedAt: 0
};
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;
const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
};
export const dataService: DataService = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    refresh() {
        if (pending) return pending;
        publish({ ...snapshot, loading: true, error: '' });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        pending = window.liveData
            .load(
                (path, options) =>
                    fetch(window.APP_CONFIG.SUPABASE_URL + path, {
                        ...options,
                        headers: window.createSupabaseHeaders()
                    }),
                controller.signal
            )
            .then(async (data) => {
                await window.cardPortraits?.load().catch(() => {});
                publish({ data, loading: false, error: '', updatedAt: Date.now() });
            })
            .catch((error) =>
                publish({
                    ...snapshot,
                    loading: false,
                    error:
                        error.name === 'AbortError'
                            ? 'O carregamento demorou demais. Tente novamente.'
                            : error.message
                })
            )
            .finally(() => {
                clearTimeout(timeout);
                pending = null;
            });
        return pending;
    }
};
export async function bootstrap() {
    if (/\/demo-v2\/(?:index\.html)?$/.test(location.pathname)) {
        const canonical = new URL(projectRoot.href);
        canonical.search = location.search;
        canonical.hash = location.hash;
        canonical.searchParams.set('__cwb_release', '2026.10.05.6');
        location.replace(canonical.href);
        return new Promise<void>(() => {});
    }
    if (new URLSearchParams(location.search).has('__cwb_release')) {
        const canonical = new URL(location.href);
        canonical.searchParams.delete('__cwb_release');
        history.replaceState(history.state, '', canonical.href);
    }
    const base = document.createElement('base');
    base.href = projectRoot.href;
    document.head.prepend(base);
    window.DIGISTATS_MICRO_FRONTENDS = true;
    window.DIGISTATS_NATIVE_V2 = true;
    window.digiStatsComponentRoot = () => document.getElementById('v2Tools') || document.body;
    window.digistatsNavigate = navigate;
    await Promise.all(
        [
            'config/supabase.js',
            'config/app-version.js',
            'shared/data/tournaments.js',
            'shared/data/statistics.js',
            'shared/data/admin-session.js',
            'shared/data/card-portraits.js'
        ].map(loadScript)
    );
    window.addEventListener('digistats:tournaments-changed', () => void dataService.refresh());
    window.digistatsAuth ||= createSiteAuth();
    void window.digistatsAuth.initialize();
    void dataService.refresh();
}
