import { createClient, type Session } from '@supabase/supabase-js';
import type { SiteAuth, SiteAuthState, SiteAuthConfig, SiteProfile } from '../contracts';

export function createSiteSessionStorage(persistent: Storage, temporary: Storage) {
    const preferenceKey = 'digistats.remember-account';
    const remember = () => persistent.getItem(preferenceKey) !== 'false';
    return {
        remember,
        setRemember(value: boolean) {
            persistent.setItem(preferenceKey, String(value));
        },
        getItem(key: string) {
            return (remember() ? persistent : temporary).getItem(key);
        },
        setItem(key: string, value: string) {
            (remember() ? persistent : temporary).setItem(key, value);
            (remember() ? temporary : persistent).removeItem(key);
        },
        removeItem(key: string) {
            persistent.removeItem(key);
            temporary.removeItem(key);
        }
    };
}

export function createSiteAuth(): SiteAuth {
    const storage = createSiteSessionStorage(window.localStorage, window.sessionStorage);
    const rememberedEmailKey = 'digistats.remembered-email';
    const passwordManager = () =>
        window as unknown as {
            PasswordCredential?: new (data: { id: string; password: string }) => Credential;
            navigator?: Navigator;
        };
    const callbackHash = new URL(location.href).hash;
    const implicitEmailCallback =
        /(?:^#|&)access_token=[^&]+/.test(callbackHash) &&
        /(?:^#|&)refresh_token=[^&]+/.test(callbackHash) &&
        /(?:^#|&)type=(?:recovery|invite|signup|email_change|magiclink)(?:&|$)/.test(callbackHash);
    const callbackNeedsPassword =
        implicitEmailCallback && /(?:^#|&)type=(?:recovery|invite)(?:&|$)/.test(callbackHash);
    const client = createClient(
        window.APP_CONFIG.SUPABASE_URL,
        window.APP_CONFIG.SUPABASE_ANON_KEY,
        {
            auth: {
                // Provider-issued invites and recovery links can use token
                // fragments. The SDK validates them and removes the fragment.
                flowType: implicitEmailCallback ? 'implicit' : 'pkce',
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage,
                storageKey: 'digistats.site-account'
            }
        }
    );
    let session: Session | null = null;
    let generation = 0;
    let initialization: Promise<void> | null = null;
    let applyingSignupDeclarations: Promise<void> | null = null;
    const pendingLegalKey = (id: string) => `digistats.pending-signup-declarations.${id}`;
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
        if (state.available) {
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
        if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')
            return 'Muitas solicitações de e-mail. Aguarde alguns minutos antes de tentar novamente.';
        if (
            error.code === 'email_address_not_authorized' ||
            (error.code === 'unexpected_failure' && /email|smtp/i.test(error.message || ''))
        )
            return 'O serviço de e-mail não conseguiu enviar a mensagem. Tente novamente mais tarde ou entre em contato com o suporte.';
        if (error.code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
        if (error.code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
        if (error.code === 'user_already_exists' || error.code === 'email_exists')
            return 'Já existe uma conta com este e-mail. Faça Login ou recupere sua senha.';
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
        let { data, error } = await client.rpc('my_site_account');
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
        // Bind the declarations checked at signup to the verified identity only
        // after confirmation. Signup metadata never grants membership or consent.
        if (
            user.email_confirmed_at &&
            data?.profile &&
            !data.legal_current &&
            state.config?.legal_ready
        ) {
            let pending: { terms: string; privacy: string } | null = null;
            try {
                pending = JSON.parse(
                    window.localStorage.getItem(pendingLegalKey(user.id)) || 'null'
                );
            } catch {
                /* Re-read the documents if stored data is invalid. */
            }
            if (
                pending?.terms === state.config.terms_version &&
                pending?.privacy === state.config.privacy_version
            ) {
                if (!applyingSignupDeclarations) {
                    const profile = data.profile;
                    applyingSignupDeclarations = (async () => {
                        const result = await client.rpc('save_my_site_profile_legal', {
                            p_username: profile.username,
                            p_display_name: profile.display_name,
                            p_terms_version: pending!.terms,
                            p_privacy_version: pending!.privacy,
                            p_accept_terms: true,
                            p_ack_privacy: true,
                            p_declare_adult: true
                        });
                        if (result.error) throw new Error(message(result.error));
                        window.localStorage.removeItem(pendingLegalKey(user.id));
                    })().finally(() => {
                        applyingSignupDeclarations = null;
                    });
                }
                try {
                    await applyingSignupDeclarations;
                    const refreshed = await client.rpc('my_site_account');
                    if (refreshed.error) throw new Error(message(refreshed.error));
                    data = refreshed.data;
                } catch (failure) {
                    if (revision === generation && session?.user.id === user.id)
                        publish({
                            loading: false,
                            profile: data.profile,
                            isAdmin: false,
                            isMember: false,
                            legalCurrent: false,
                            error: (failure as Error).message
                        });
                    return;
                }
            } else if (pending) window.localStorage.removeItem(pendingLegalKey(user.id));
        }
        if (revision !== generation || session?.user.id !== user.id) return;
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
        getRememberMe: () => storage.remember(),
        getRememberedEmail: () =>
            storage.remember() ? window.localStorage.getItem(rememberedEmailKey) || '' : '',
        async recallLogin() {
            const email = api.getRememberedEmail();
            const manager = passwordManager();
            if (!email || !manager.PasswordCredential || !manager.navigator?.credentials)
                return null;
            try {
                const credential = (await manager.navigator.credentials.get({
                    password: true,
                    mediation: 'silent'
                } as CredentialRequestOptions)) as (Credential & { password?: string }) | null;
                return credential?.type === 'password' &&
                    credential.id.toLowerCase() === email.toLowerCase() &&
                    credential.password
                    ? { email, password: credential.password }
                    : null;
            } catch {
                return null;
            }
        },
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
                    if (session && callbackNeedsPassword) publish({ recoveryRequired: true });
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
        async login(email, password, rememberMe = true) {
            const previousPreference = storage.remember();
            storage.setRemember(rememberMe);
            const { data, error } = await client.auth.signInWithPassword({
                email: email.trim(),
                password
            });
            if (error) {
                storage.setRemember(previousPreference);
                throw new Error(message(error));
            }
            session = data.session;
            await loadAccount();
            if (rememberMe) {
                window.localStorage.setItem(rememberedEmailKey, email.trim());
                const manager = passwordManager();
                if (manager.PasswordCredential && manager.navigator?.credentials) {
                    try {
                        await manager.navigator.credentials.store(
                            new manager.PasswordCredential({ id: email.trim(), password })
                        );
                    } catch {
                        /* Browser password saving is optional; authentication already succeeded. */
                    }
                }
            } else {
                window.localStorage.removeItem(rememberedEmailKey);
            }
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
            const { data, error } = await client.auth.signUp({
                email: email.trim(),
                password,
                options: { emailRedirectTo: redirect(), data: { display_name: displayName.trim() } }
            });
            if (error) throw new Error(message(error));
            // With email confirmation enabled, Auth can obfuscate a duplicate
            // signup as a successful response with no linked identities.
            if (data?.user?.identities?.length === 0)
                throw new Error(
                    'Já existe uma conta com este e-mail. Faça Login ou recupere sua senha.'
                );
            if (data?.user?.id)
                window.localStorage.setItem(
                    pendingLegalKey(data.user.id),
                    JSON.stringify({
                        terms: state.config.terms_version,
                        privacy: state.config.privacy_version
                    })
                );
        },
        async logout() {
            const email = session?.user.email || state.user?.email;
            const { error } = await client.auth.signOut();
            if (error) throw new Error(message(error));
            if (storage.remember() && email) window.localStorage.setItem(rememberedEmailKey, email);
            else window.localStorage.removeItem(rememberedEmailKey);
            session = null;
            generation++;
            publish({
                user: null,
                profile: null,
                isAdmin: false,
                isMember: false,
                loading: false,
                error: '',
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
        async resendConfirmation(email) {
            const { error } = await client.auth.resend({
                type: 'signup',
                email: email.trim(),
                options: { emailRedirectTo: redirect() }
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
            const owner = session?.user.id;
            const parameters = {
                p_username: username.trim().toLowerCase(),
                p_display_name: displayName.trim()
            };
            const saved =
                state.config?.legal_ready && !state.legalCurrent
                    ? await api.rpc<SiteProfile>('save_my_site_profile_legal', {
                          ...parameters,
                          p_privacy_version: state.config?.privacy_version,
                          p_terms_version: state.config?.terms_version,
                          p_accept_terms: declarations.termsAccepted,
                          p_ack_privacy: declarations.privacyRead,
                          p_declare_adult: declarations.adultDeclared
                      })
                    : await api.rpc<SiteProfile>('update_my_site_profile', parameters);
            if (!owner || session?.user.id !== owner)
                throw new Error('Sua sessão mudou. Entre novamente.');
            if (
                saved?.user_id !== owner ||
                saved.username !== username.trim().toLowerCase() ||
                saved.display_name !== displayName.trim()
            )
                throw new Error(
                    'Não foi possível confirmar o perfil salvo. Atualize e tente novamente.'
                );
            // Invalidate account reads started before the write completed.
            generation++;
            publish({ profile: saved, error: '' });
            await loadAccount();
            if (state.error) throw new Error(state.error);
            if (
                state.profile?.username !== saved.username ||
                state.profile?.display_name !== saved.display_name
            )
                throw new Error(
                    'Não foi possível confirmar o perfil salvo. Atualize e tente novamente.'
                );
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
