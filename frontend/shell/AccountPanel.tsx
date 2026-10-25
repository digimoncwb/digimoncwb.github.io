import { LegalChecks, uncheckedDeclarations } from './LegalChecks';
import { useEffect, useState } from 'react';
import type { SiteAuth } from '../contracts';
import { Dialog } from '../shared/ListPage';
import { SearchSelect } from '../shared/SearchSelect';
import { useSiteAuth } from '../shared/site-auth';
import { downloadAccountJson } from '../shared/account-download';
import { AccountsAdmin } from './AccountsAdmin';
import './accounts.css';

type View = 'login' | 'signup' | 'recover' | 'profile' | 'admin' | 'password';
type RequestRow = {
    id: string;
    request_type: string;
    status: string;
    created_at: string;
    review_note?: string;
};
const requestLabels: Record<string, string> = {
    player_link: 'Vincular jogador',
    deck_claim: 'Propriedade de deck',
    data_access: 'Acesso aos meus dados',
    correction: 'Correção de dados',
    erasure: 'Eliminação de dados',
    account_closure: 'Encerramento de conta'
};
const statusLabels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovada',
    rejected: 'Recusada',
    completed: 'Concluída'
};

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
    const [email, setEmail] = useState('');
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
    const [requests, setRequests] = useState<RequestRow[]>([]);
    const [requestsOwner, setRequestsOwner] = useState<string | null>(null);
    const [requestType, setRequestType] = useState('player_link');
    const [playerId, setPlayerId] = useState('');
    const [note, setNote] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [reload, setReload] = useState(0);
    useEffect(() => {
        setView(initialView);
    }, [initialView]);
    useEffect(() => {
        setDisplayName(state.profile?.display_name || '');
        setUsername(state.profile?.username || '');
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
        setRequests([]);
        setPlayersError('');
        (async () => {
            const result: { id: string; name: string }[] = [];
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
        auth.request(
            `/rest/v1/account_requests?user_id=eq.${state.user.id}&select=id,request_type,status,created_at,review_note&order=created_at.desc&limit=50`,
            { signal: controller.signal }
        )
            .then(async (response) => {
                if (!response.ok) throw new Error('Não foi possível carregar suas solicitações.');
                const rows = await response.json();
                if (!controller.signal.aborted) {
                    setRequests(rows);
                    setRequestsOwner(state.user?.id || null);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, [state.user?.id, view, reload, auth]);
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
    const privacyUrl = state.config?.privacy_url;
    const safePrivacy = privacyUrl && /^https:\/\//.test(privacyUrl) ? privacyUrl : undefined;
    const contact = state.config?.support_email || 'dulopes1997@gmail.com';
    const loggedView = state.user && !['password', 'admin'].includes(view);
    const title =
        view === 'admin'
            ? 'Contas e auditoria'
            : view === 'password'
              ? 'Definir nova senha'
              : loggedView
                ? 'Minha conta'
                : view === 'signup'
                  ? 'Criar conta'
                  : view === 'recover'
                    ? 'Recuperar acesso'
                    : 'Entrar';
    return (
        <Dialog
            title={title}
            onClose={onClose}
            busy={busy}
            wide={view === 'admin'}
            closeLabel="Fechar"
        >
            <div className="site-account">
                {!state.available && (
                    <p role="alert">O serviço de contas ainda não está disponível. {state.error}</p>
                )}
                {error && <p role="alert">{error}</p>}
                {notice && <p role="status">{notice}</p>}
                {view === 'admin' ? (
                    <AccountsAdmin auth={auth} onBusy={setBusy} />
                ) : view === 'password' ? (
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
                        <p>
                            Conectado como <strong>{state.user?.email}</strong>
                        </p>
                        {!state.user?.confirmed && (
                            <p role="status">
                                Confirme seu e-mail para cadastrar e alterar informações.
                            </p>
                        )}
                        {state.profile?.status !== 'active' && (
                            <p role="alert">
                                Conta{' '}
                                {state.profile?.status === 'closed' ? 'encerrada' : 'bloqueada'}.
                                Entre em contato pelo e-mail {contact}.
                            </p>
                        )}
                        {state.error && <p role="alert">{state.error}</p>}
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run(
                                    () => auth.saveProfile(username, displayName, declarations),
                                    'Perfil atualizado.'
                                );
                            }}
                        >
                            <label>
                                Nome de usuário
                                <input
                                    required
                                    minLength={3}
                                    maxLength={40}
                                    pattern="[a-z0-9_-]{3,40}"
                                    autoComplete="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                                />
                            </label>
                            <label>
                                Nome de exibição
                                <input
                                    required
                                    maxLength={100}
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                />
                            </label>
                            <LegalChecks
                                config={state.config}
                                value={declarations}
                                onChange={setDeclarations}
                            />
                            <button
                                className="button primary"
                                disabled={
                                    busy ||
                                    !state.config?.legal_ready ||
                                    state.profile?.status !== 'active' ||
                                    !state.user?.confirmed
                                }
                            >
                                Salvar perfil
                            </button>
                        </form>
                        <div className="site-account-actions">
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        downloadAccountJson(
                                            'meus-dados.json',
                                            await auth.rpc('my_site_data')
                                        );
                                    }, 'Arquivo preparado para download.')
                                }
                            >
                                Baixar meus dados
                            </button>
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() =>
                                    void run(
                                        () => auth.recover(state.user?.email || ''),
                                        'Se o endereço estiver cadastrado, você receberá as instruções para trocar a senha.'
                                    )
                                }
                            >
                                Enviar link para trocar senha
                            </button>
                            {state.isAdmin && (
                                <button
                                    className="button secondary"
                                    onClick={() => setView('admin')}
                                >
                                    Contas e auditoria
                                </button>
                            )}
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        await auth.logout();
                                        setView('login');
                                    }, 'Sessão encerrada.')
                                }
                            >
                                Sair
                            </button>
                        </div>
                        <details>
                            <summary>Alterar e-mail de acesso</summary>
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void run(
                                        () => auth.changeEmail(newEmail),
                                        'Confira as mensagens de confirmação enviadas pelo serviço de autenticação.'
                                    );
                                }}
                            >
                                <label>
                                    Novo e-mail
                                    <input
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                    />
                                </label>
                                <button className="button secondary" disabled={busy}>
                                    Solicitar alteração
                                </button>
                            </form>
                        </details>
                        <section>
                            <h3>Solicitações de conta e privacidade</h3>
                            <p>
                                Vínculos e alterações em cadastros antigos são analisados pela
                                administração. Contato: <a href={`mailto:${contact}`}>{contact}</a>.
                            </p>
                            {state.profile?.player_id && (
                                <p>
                                    Jogador vinculado:{' '}
                                    {players.find(
                                        (player) => player.id === state.profile?.player_id
                                    )?.name || state.profile.player_id}
                                </p>
                            )}
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void run(async () => {
                                        await auth.rpc('submit_account_request', {
                                            p_type: requestType,
                                            p_player_id:
                                                requestType === 'player_link' ? playerId : null,
                                            p_note: note
                                        });
                                        setNote('');
                                        setReload((value) => value + 1);
                                    }, 'Solicitação enviada para análise.');
                                }}
                            >
                                <label>
                                    Solicitação
                                    <select
                                        value={requestType}
                                        onChange={(e) => setRequestType(e.target.value)}
                                    >
                                        {Object.entries(requestLabels)
                                            .filter(([key]) => key !== 'deck_claim')
                                            .map(([key, label]) => (
                                                <option key={key} value={key}>
                                                    {label}
                                                </option>
                                            ))}
                                    </select>
                                </label>
                                {requestType === 'player_link' && (
                                    <>
                                        <SearchSelect
                                            label="Jogador cadastrado"
                                            value={playerId}
                                            onChange={setPlayerId}
                                            required
                                            emptyMessage="Nenhum jogador encontrado."
                                            options={players.map((player) => ({
                                                value: player.id,
                                                label: player.name
                                            }))}
                                        />
                                        {playersError && (
                                            <p role="alert">
                                                {playersError}{' '}
                                                <button
                                                    type="button"
                                                    className="button secondary"
                                                    onClick={() => setReload((value) => value + 1)}
                                                >
                                                    Tentar novamente
                                                </button>
                                            </p>
                                        )}
                                    </>
                                )}
                                <label>
                                    Observação
                                    <textarea
                                        maxLength={1000}
                                        rows={3}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                </label>
                                <button
                                    className="button secondary"
                                    disabled={busy || (requestType === 'player_link' && !playerId)}
                                >
                                    Enviar solicitação
                                </button>
                            </form>
                            <ul>
                                {(requestsOwner === state.user?.id ? requests : []).map(
                                    (request) => (
                                        <li key={request.id}>
                                            {requestLabels[request.request_type] ||
                                                request.request_type}{' '}
                                            · {statusLabels[request.status] || request.status}
                                            {request.review_note && <p>{request.review_note}</p>}
                                        </li>
                                    )
                                )}
                            </ul>
                        </section>
                    </>
                ) : (
                    <>
                        <div className="site-account-actions">
                            {(['login', 'signup', 'recover'] as const).map((tab) => (
                                <button
                                    className="button secondary"
                                    aria-pressed={view === tab}
                                    key={tab}
                                    disabled={busy}
                                    onClick={() => {
                                        setView(tab);
                                        setError('');
                                        setNotice('');
                                    }}
                                >
                                    {tab === 'login'
                                        ? 'Entrar'
                                        : tab === 'signup'
                                          ? 'Criar conta'
                                          : 'Esqueci a senha'}
                                </button>
                            ))}
                        </div>
                        <form
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
                                        await auth.login(email, password);
                                        setView('profile');
                                    }
                                });
                            }}
                        >
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
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </label>
                            {view !== 'recover' && (
                                <label>
                                    Senha
                                    <input
                                        type="password"
                                        autoComplete={
                                            view === 'signup' ? 'new-password' : 'current-password'
                                        }
                                        required
                                        minLength={view === 'signup' ? 12 : undefined}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </label>
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
                                        : 'Entrar'}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </Dialog>
    );
}
