import { createClient, type Session } from '@supabase/supabase-js';
import type { SiteAuth, SiteAuthState, SiteAuthConfig, SiteProfile } from '../contracts';

export function createSiteAuth(): SiteAuth {
    const client = createClient(
        window.APP_CONFIG.SUPABASE_URL,
        window.APP_CONFIG.SUPABASE_ANON_KEY,
        {
            auth: {
                flowType: 'pkce',
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storageKey: 'digistats.site-account'
            }
        }
    );
    let session: Session | null = null;
    let generation = 0;
    let initialization: Promise<void> | null = null;
    const listeners = new Set<() => void>();
    let state: SiteAuthState = {
        initialized: false,
        available: false,
        loading: true,
        enabled: false,
        user: null,
        profile: null,
        isAdmin: false,
        isMember: false,
        config: null,
        error: '',
        recoveryRequired: false,
        legalCurrent: false
    };
    const publish = (changes: Partial<SiteAuthState>) => {
        state = { ...state, ...changes };
        if (state.available && state.enabled) {
            window.digistatsAdminAuthenticated = state.isAdmin;
            window.dispatchEvent(
                new CustomEvent('digistats:admin-auth-changed', {
                    detail: { authenticated: state.isAdmin }
                })
            );
        }
        listeners.forEach((listener) => listener());
        window.dispatchEvent(new CustomEvent('digistats:auth-changed'));
    };
    const redirect = () => {
        const url = new URL(
            document.querySelector<HTMLMetaElement>('meta[name="digistats-root"]')?.content || './',
            location.href
        );
        url.pathname = url.pathname.replace(/\/?$/, '/') + 'index.html';
        url.search = '';
        url.hash = '#overview';
        return url.href;
    };
    const message = (error: { message?: string; code?: string }) => {
        if (error.code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
        if (error.code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
        if (error.code === '23505') return 'Esse nome de usuário ou vínculo já está em uso.';
        if (error.code === '40001')
            return 'O registro foi alterado. Atualize os dados e tente novamente.';
        if (error.code === '42501') return 'Sua conta não tem permissão para esta ação.';
        if (error.code === 'PGRST202') return 'Esta função ainda não está disponível no banco.';
        return error.message || 'Não foi possível concluir a operação.';
    };
    const loadAccount = async () => {
        const revision = ++generation;
        const user = session?.user;
        publish({
            loading: true,
            user: user
                ? { id: user.id, email: user.email, confirmed: !!user.email_confirmed_at }
                : null,
            ...(user?.id !== state.user?.id
                ? { profile: null, isAdmin: false, isMember: false, legalCurrent: false }
                : {})
        });
        if (!user) {
            publish({
                profile: null,
                isAdmin: false,
                isMember: false,
                loading: false,
                legalCurrent: false
            });
            return;
        }
        const { data, error } = await client.rpc('my_site_account');
        if (revision !== generation || session?.user.id !== user.id) return;
        if (error) {
            publish({
                loading: false,
                profile: null,
                legalCurrent: false,
                isAdmin: false,
                isMember: false,
                error: message(error)
            });
            return;
        }
        publish({
            profile: data?.profile || null,
            isAdmin: data?.is_admin === true,
            isMember: data?.is_member === true,
            loading: false,
            error: '',
            legalCurrent: data?.legal_current === true
        });
    };
    client.auth.onAuthStateChange((event, next) => {
        session = next;
        if (event === 'PASSWORD_RECOVERY') publish({ recoveryRequired: true });
        // Auth callbacks must return before another SDK request takes the session lock.
        setTimeout(() => {
            if (state.available) void loadAccount();
        }, 0);
    });
    const api: SiteAuth = {
        getSnapshot: () => state,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getAccessToken: () => session?.access_token || null,
        initialize() {
            return (initialization ||= (async () => {
                try {
                    const response = await fetch(
                        `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/rpc/site_account_status`,
                        {
                            method: 'POST',
                            headers: {
                                apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
                                Authorization: `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: '{}',
                            signal: AbortSignal.timeout(10000)
                        }
                    );
                    if (!response.ok) {
                        if (response.status === 404) {
                            publish({ initialized: true, loading: false });
                            return;
                        }
                        throw new Error('Não foi possível verificar o serviço de contas.');
                    }
                    const config: SiteAuthConfig = await response.json();
                    publish({ config, enabled: config.enabled, available: true });
                    const { data, error } = await client.auth.getSession();
                    if (error) throw error;
                    session = data.session;
                    await loadAccount();
                    publish({ initialized: true });
                } catch (error) {
                    publish({ initialized: true, loading: false, error: message(error as Error) });
                }
            })());
        },
        async refresh() {
            const { data, error } = await client.auth.getSession();
            if (error) throw new Error(message(error));
            session = data.session;
            if (state.available) {
                const { data: config, error: configError } =
                    await client.rpc('site_account_status');
                if (configError) throw new Error(message(configError));
                publish({ config, enabled: config.enabled });
            }
            await loadAccount();
        },
        async login(email, password) {
            const { data, error } = await client.auth.signInWithPassword({
                email: email.trim(),
                password
            });
            if (error) throw new Error(message(error));
            session = data.session;
            await loadAccount();
        },
        async signup(email, password, displayName, declarations) {
            if (password.length < 12)
                throw new Error('Use uma senha com pelo menos 12 caracteres.');
            if (!state.config?.legal_ready || !state.config.terms_url || !state.config.privacy_url)
                throw new Error(
                    'O cadastro será liberado após a publicação dos termos e do aviso de privacidade.'
                );
            if (
                !declarations?.termsAccepted ||
                !declarations.privacyRead ||
                !declarations.adultDeclared
            )
                throw new Error('Aceite os termos, leia o aviso e declare ter 18 anos ou mais.');
            const { error } = await client.auth.signUp({
                email: email.trim(),
                password,
                options: { emailRedirectTo: redirect(), data: { display_name: displayName.trim() } }
            });
            if (error) throw new Error(message(error));
        },
        async logout() {
            const { error } = await client.auth.signOut();
            if (error) throw new Error(message(error));
            session = null;
            generation++;
            publish({
                user: null,
                profile: null,
                isAdmin: false,
                isMember: false,
                recoveryRequired: false,
                legalCurrent: false
            });
            // The legacy admin token must not survive the global logout.
            sessionStorage.removeItem('digistats.admin.session');
            window.dispatchEvent(new Event('digistats:private-data-cleared'));
        },
        async recover(email) {
            const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: redirect()
            });
            if (error) throw new Error(message(error));
        },
        async changePassword(password) {
            if (password.length < 12)
                throw new Error('Use uma senha com pelo menos 12 caracteres.');
            const { error } = await client.auth.updateUser({ password });
            if (error) throw new Error(message(error));
            publish({ recoveryRequired: false });
        },
        async changeEmail(email) {
            const { error } = await client.auth.updateUser(
                { email: email.trim() },
                { emailRedirectTo: redirect() }
            );
            if (error) throw new Error(message(error));
        },
        async saveProfile(username, displayName, declarations) {
            await api.rpc('save_my_site_profile_legal', {
                p_username: username,
                p_display_name: displayName,
                p_privacy_version: state.config?.privacy_version,
                p_terms_version: state.config?.terms_version,
                p_accept_terms: declarations.termsAccepted,
                p_ack_privacy: declarations.privacyRead,
                p_declare_adult: declarations.adultDeclared
            });
            await loadAccount();
        },
        async requireMember() {
            await api.refresh();
            if (!state.user) {
                api.open('login');
                throw new Error('Entre para continuar. Sua lista em edição foi preservada.');
            }
            if (!state.isMember) {
                api.open('profile');
                throw new Error('Confirme seu e-mail, verifique seu perfil e use uma conta ativa.');
            }
        },
        async requireAdmin() {
            await api.requireMember();
            if (!state.isAdmin) throw new Error('Esta ação exige uma conta administrativa.');
        },
        open(view = 'login') {
            window.dispatchEvent(new CustomEvent('digistats:account-open', { detail: { view } }));
        },
        async request(path, options = {}) {
            const { data, error } = await client.auth.getSession();
            if (error) throw new Error(message(error));
            session = data.session;
            const headers = new Headers(options.headers);
            headers.set('apikey', window.APP_CONFIG.SUPABASE_ANON_KEY);
            headers.set(
                'Authorization',
                `Bearer ${session?.access_token || window.APP_CONFIG.SUPABASE_ANON_KEY}`
            );
            if (options.body && !headers.has('Content-Type'))
                headers.set('Content-Type', 'application/json');
            return fetch(window.APP_CONFIG.SUPABASE_URL + path, { ...options, headers });
        },
        async rpc<T>(name: string, parameters: Record<string, unknown> = {}) {
            if (!/^[a-z_]+$/.test(name)) throw new Error('Operação inválida.');
            const response = await api.request(`/rest/v1/rpc/${name}`, {
                method: 'POST',
                body: JSON.stringify(parameters)
            });
            if (!response.ok) throw new Error(message(await response.json().catch(() => ({}))));
            return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
        }
    };
    return api;
}
