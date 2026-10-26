import { LegalChecks, uncheckedDeclarations } from './LegalChecks';
import { useEffect, useRef, useState } from 'react';
import type { SiteAuth } from '../contracts';
import { Dialog } from '../shared/ListPage';
import { useSiteAuth } from '../shared/site-auth';
import './accounts.css';

type View = 'login' | 'signup' | 'recover' | 'profile' | 'password';
export function AccountPanel({
    auth,
    view: initialView,
    onClose
}: {
    auth: SiteAuth;
    view: View;
    onClose(): void;
}) {
    const state = useSiteAuth();
    const [view, setView] = useState<View>(initialView);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(() => auth.getRememberMe());
    const [email, setEmail] = useState(() => auth.getRememberedEmail());
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [declarations, setDeclarations] = useState(uncheckedDeclarations);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
    const [playersError, setPlayersError] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const loginEdited = useRef(false);
    const profileEdited = useRef(false);
    useEffect(() => {
        profileEdited.current = false;
    }, [state.user?.id]);
    useEffect(() => {
        if (state.user || view !== 'login' || busy) return;
        let live = true;
        if (!loginEdited.current) setEmail(auth.getRememberedEmail());
        void auth.recallLogin().then((saved) => {
            if (live && saved && !loginEdited.current) {
                setEmail(saved.email);
                setPassword(saved.password);
            }
        });
        return () => {
            live = false;
        };
    }, [state.user?.id, view, busy, auth]);
    useEffect(() => {
        setView(initialView);
    }, [initialView]);
    useEffect(() => {
        if (!profileEdited.current) {
            setDisplayName(state.profile?.display_name || '');
            setUsername(state.profile?.username || '');
        }
        setDeclarations(
            state.legalCurrent
                ? { termsAccepted: true, privacyRead: true, adultDeclared: true }
                : uncheckedDeclarations
        );
    }, [
        state.profile?.user_id,
        state.profile?.display_name,
        state.profile?.username,
        state.profile?.privacy_version,
        state.config?.privacy_version,
        state.config?.terms_version,
        state.legalCurrent
    ]);
    useEffect(() => {
        if (!state.user || view !== 'profile') return;
        const controller = new AbortController();
        setPlayers([]);
        setPlayersError('');
        (async () => {
            const result: { id: string; name: string }[] = [];
            if (state.profile?.player_id) {
                const response = await auth.request(
                    `/rest/v1/players?id=eq.${encodeURIComponent(state.profile.player_id)}&select=id,name`,
                    { signal: controller.signal }
                );
                if (!response.ok) throw new Error('Não foi possível carregar o jogador vinculado.');
                const rows = await response.json();
                if (!controller.signal.aborted) setPlayers(rows);
                return;
            }
            for (let offset = 0; ; offset += 1000) {
                const response = await auth.request(
                    `/rest/v1/players?select=id,name&order=name&limit=1000&offset=${offset}`,
                    { signal: controller.signal }
                );
                if (!response.ok) throw new Error('Não foi possível carregar os jogadores.');
                const rows = await response.json();
                result.push(...rows);
                if (rows.length < 1000) break;
            }
            if (!controller.signal.aborted) setPlayers(result);
        })().catch((error) => {
            if (!controller.signal.aborted) setPlayersError(error.message);
        });
        return () => controller.abort();
    }, [state.user?.id, state.profile?.player_id, view, auth]);
    async function run(task: () => Promise<void>, success = '') {
        if (busy) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await task();
            if (success) setNotice(success);
        } catch (error) {
            setError((error as Error).message);
        } finally {
            setBusy(false);
            setPassword('');
            setConfirmPassword('');
        }
    }
    const contact = state.config?.support_email || 'dulopes1997@gmail.com';
    const loggedView = state.user && view !== 'password';
    const title =
        view === 'password'
            ? 'Definir nova senha'
            : loggedView
              ? 'Minha conta'
              : view === 'signup'
                ? 'Criar conta'
                : view === 'recover'
                  ? 'Recuperar acesso'
                  : 'Login';
    return (
        <Dialog title={title} onClose={onClose} busy={busy} closeLabel="Fechar">
            <div className="site-account">
                {!state.available && (
                    <p role="alert">O serviço de contas ainda não está disponível. {state.error}</p>
                )}
                {error && <p role="alert">{error}</p>}
                {state.available && state.error && <p role="alert">{state.error}</p>}
                {notice && <p role="status">{notice}</p>}
                {view === 'password' ? (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (password !== confirmPassword) {
                                setError('As senhas não conferem.');
                                return;
                            }
                            void run(async () => {
                                await auth.changePassword(password);
                                setView('profile');
                            }, 'Senha atualizada.');
                        }}
                    >
                        <label>
                            Nova senha
                            <input
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </label>
                        <label>
                            Confirme a nova senha
                            <input
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </label>
                        <button className="button primary" disabled={busy}>
                            Salvar senha
                        </button>
                    </form>
                ) : loggedView ? (
                    <>
                        {state.profileRequired && (
                            <p>Conclua os aceites abaixo para liberar os recursos da sua conta.</p>
                        )}
                        <div className="site-account-identity">
                            <strong>{state.profile?.display_name || 'Minha conta'}</strong>
                            <span className="muted">{state.user?.email}</span>
                        </div>
                        {state.profile?.player_id && (
                            <p className="site-account-linked">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    aria-hidden="true"
                                >
                                    <circle cx="12" cy="12" r="9" />
                                    <path d="m7 12 3 3 7-7" />
                                </svg>
                                <span>
                                    Vinculado a{' '}
                                    <strong>
                                        {players.find(
                                            (player) => player.id === state.profile?.player_id
                                        )?.name || 'seu jogador'}
                                    </strong>
                                </span>
                            </p>
                        )}
                        {!state.user?.confirmed && (
                            <div className="site-account-actions">
                                <p role="status">Confirme seu e-mail para editar o perfil.</p>
                                <button
                                    type="button"
                                    className="button secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        void run(
                                            () => auth.resendConfirmation(state.user?.email || ''),
                                            'Confira sua caixa de entrada e o spam.'
                                        )
                                    }
                                >
                                    Reenviar confirmação
                                </button>
                            </div>
                        )}
                        {state.profile && state.profile.status !== 'active' && (
                            <p role="alert">
                                Conta{' '}
                                {state.profile.status === 'closed' ? 'encerrada' : 'bloqueada'}.{' '}
                                <a href={`mailto:${contact}`}>Falar com suporte</a>
                            </p>
                        )}
                        {state.error && <p role="alert">{state.error}</p>}
                        <form
                            className="site-profile-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(async () => {
                                    await auth.saveProfile(username, displayName, declarations);
                                    profileEdited.current = false;
                                    setUsername(auth.getSnapshot().profile?.username || username);
                                    setDisplayName(
                                        auth.getSnapshot().profile?.display_name || displayName
                                    );
                                }, 'Perfil salvo.');
                            }}
                        >
                            <div className="site-profile-fields">
                                <label>
                                    Nome de usuário
                                    <input
                                        name="profile_username"
                                        required
                                        minLength={3}
                                        maxLength={40}
                                        pattern={'[a-z0-9_\\-]{3,40}'}
                                        disabled={busy || state.loading}
                                        autoComplete="off"
                                        value={username}
                                        aria-describedby="profile-username-help"
                                        onInvalid={() =>
                                            setError(
                                                'Use de 3 a 40 letras, números, _ ou - no nome de usuário.'
                                            )
                                        }
                                        onChange={(event) => {
                                            profileEdited.current = true;
                                            setUsername(event.target.value.toLowerCase());
                                        }}
                                    />
                                    <small className="muted" id="profile-username-help">
                                        3 a 40 letras, números, _ ou -.
                                    </small>
                                </label>
                                <label>
                                    Nome de exibição
                                    <input
                                        name="profile_display_name"
                                        required
                                        maxLength={100}
                                        disabled={busy || state.loading}
                                        autoComplete="nickname"
                                        value={displayName}
                                        onChange={(event) => {
                                            profileEdited.current = true;
                                            setDisplayName(event.target.value);
                                        }}
                                    />
                                </label>
                            </div>
                            {state.config?.legal_ready && !state.legalCurrent && (
                                <LegalChecks
                                    config={state.config}
                                    value={declarations}
                                    onChange={setDeclarations}
                                />
                            )}
                            <div className="site-profile-save-row">
                                <button
                                    type="submit"
                                    className="button primary site-profile-save"
                                    disabled={
                                        busy ||
                                        state.loading ||
                                        state.profile?.status !== 'active' ||
                                        !state.user?.confirmed
                                    }
                                >
                                    {busy ? 'Salvando…' : 'Salvar perfil'}
                                </button>
                            </div>
                        </form>
                        <details className="site-account-disclosure">
                            <summary>Segurança e acesso</summary>
                            <div className="site-account-actions">
                                <button
                                    type="button"
                                    className="button secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        void run(
                                            () => auth.recover(state.user?.email || ''),
                                            'Confira seu e-mail para trocar a senha.'
                                        )
                                    }
                                >
                                    Trocar senha
                                </button>
                                <button
                                    type="button"
                                    className="button secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        void run(async () => {
                                            await auth.logout();
                                            loginEdited.current = false;
                                            setEmail(auth.getRememberedEmail());
                                            setView('login');
                                        }, 'Sessão encerrada.')
                                    }
                                >
                                    Sair da conta
                                </button>
                            </div>
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void run(
                                        () => auth.changeEmail(newEmail),
                                        'Confira os e-mails de confirmação.'
                                    );
                                }}
                            >
                                <label>
                                    Novo e-mail
                                    <input
                                        type="email"
                                        name="new_email"
                                        required
                                        autoComplete="email"
                                        value={newEmail}
                                        onChange={(event) => setNewEmail(event.target.value)}
                                    />
                                </label>
                                <div className="site-account-actions">
                                    <button className="button secondary" disabled={busy}>
                                        Alterar e-mail
                                    </button>
                                </div>
                            </form>
                        </details>
                    </>
                ) : (
                    <>
                        {view !== 'login' && (
                            <button
                                type="button"
                                className="site-account-link site-account-back"
                                disabled={busy}
                                onClick={() => {
                                    setView('login');
                                    setError('');
                                    setNotice('');
                                }}
                            >
                                ← Voltar para login
                            </button>
                        )}
                        <form
                            id="site-login-form"
                            autoComplete="on"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(async () => {
                                    if (view === 'recover') {
                                        await auth.recover(email);
                                        setNotice(
                                            'Se o endereço estiver cadastrado, você receberá as instruções de recuperação.'
                                        );
                                    } else if (view === 'signup') {
                                        await auth.signup(
                                            email,
                                            password,
                                            displayName,
                                            declarations
                                        );
                                        setView('login');
                                        setNotice('Confira seu e-mail para confirmar o cadastro.');
                                    } else {
                                        await auth.login(email, password, rememberMe);
                                        onClose();
                                    }
                                });
                            }}
                        >
                            {view === 'login' && (
                                <>
                                    <button
                                        type="button"
                                        className="button secondary site-google-login"
                                        disabled={busy || !state.available}
                                        onClick={() =>
                                            void run(() => auth.loginWithGoogle(rememberMe))
                                        }
                                    >
                                        <svg viewBox="0 0 24 24" aria-hidden="true">
                                            <path
                                                fill="#4285F4"
                                                d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
                                            />
                                            <path
                                                fill="#34A853"
                                                d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.1H3v2.6A10 10 0 0 0 12 22Z"
                                            />
                                            <path
                                                fill="#FBBC05"
                                                d="M6.3 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9l3.3-2.6Z"
                                            />
                                            <path
                                                fill="#EA4335"
                                                d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.5 9.5 0 0 0 12 2a10 10 0 0 0-9 5.5l3.3 2.6C7.1 7.8 9.4 6 12 6Z"
                                            />
                                        </svg>
                                        Continuar com Google
                                    </button>
                                    <div className="site-login-divider">
                                        <span>ou use seu e-mail</span>
                                    </div>
                                </>
                            )}
                            {view === 'signup' && (
                                <label>
                                    Nome de exibição
                                    <input
                                        required
                                        maxLength={100}
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                    />
                                </label>
                            )}
                            <label>
                                E-mail
                                <input
                                    type="email"
                                    name="username"
                                    id="site-login-email"
                                    autoComplete="username"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        loginEdited.current = true;
                                        setEmail(e.target.value);
                                    }}
                                />
                            </label>
                            {view !== 'recover' && (
                                <div className="site-account-password-field">
                                    <div className="site-account-password-heading">
                                        <label htmlFor="site-account-password">Senha</label>
                                        {view === 'login' && (
                                            <button
                                                type="button"
                                                className="site-account-link"
                                                disabled={busy}
                                                onClick={() => {
                                                    setView('recover');
                                                    setError('');
                                                    setNotice('');
                                                }}
                                            >
                                                Esqueci a senha
                                            </button>
                                        )}
                                    </div>
                                    <div className="site-account-password">
                                        <input
                                            id="site-account-password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete={
                                                view === 'signup'
                                                    ? 'new-password'
                                                    : 'current-password'
                                            }
                                            required
                                            minLength={view === 'signup' ? 12 : undefined}
                                            value={password}
                                            onChange={(e) => {
                                                loginEdited.current = true;
                                                setPassword(e.target.value);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="site-password-toggle"
                                            aria-label={
                                                showPassword ? 'Ocultar senha' : 'Mostrar senha'
                                            }
                                            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                            aria-pressed={showPassword}
                                            aria-controls="site-account-password"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                                <circle cx="12" cy="12" r="3" />
                                                {showPassword && <path d="m3 3 18 18" />}
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                            <p className="muted">
                                {view === 'recover'
                                    ? 'Enviaremos um link para redefinir sua senha. Confira também a pasta de spam.'
                                    : view === 'signup'
                                      ? 'Use uma senha com pelo menos 12 caracteres. Confirme o e-mail para ativar sua conta.'
                                      : 'Use o e-mail e a senha da sua conta.'}
                            </p>
                            {view === 'login' && (
                                <div className="site-account-remember">
                                    <label className="site-account-check">
                                        <input
                                            type="checkbox"
                                            checked={rememberMe}
                                            disabled={busy}
                                            onChange={(event) =>
                                                setRememberMe(event.target.checked)
                                            }
                                            aria-describedby="remember-account-help"
                                        />
                                        Lembrar de mim
                                    </label>
                                    <small id="remember-account-help" className="muted">
                                        Manter a sessão neste dispositivo, inclusive com Google. A
                                        senha pode ser preenchida pelo navegador.
                                    </small>
                                </div>
                            )}
                            {view === 'signup' && (
                                <LegalChecks
                                    config={state.config}
                                    value={declarations}
                                    onChange={setDeclarations}
                                />
                            )}
                            <button
                                className="button primary"
                                disabled={
                                    busy ||
                                    !state.available ||
                                    (view === 'signup' && !state.config?.legal_ready)
                                }
                            >
                                {busy
                                    ? 'Aguarde…'
                                    : view === 'recover'
                                      ? 'Enviar instruções'
                                      : view === 'signup'
                                        ? 'Criar conta'
                                        : 'Login'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </Dialog>
    );
}
