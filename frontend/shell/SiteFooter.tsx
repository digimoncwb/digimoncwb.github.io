import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sendFeedback } from './feedback-service';
import { ThemePicker } from './ThemePicker';

type Panel = 'bug' | 'suggestion' | 'privacy' | null;
export function SiteFooter() {
    const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setSidebarTarget(document.getElementById('sidebar-support'));
    }, []);
    const [panel, setPanel] = useState<Panel>(null),
        [message, setMessage] = useState(''),
        [email, setEmail] = useState(''),
        [website, setWebsite] = useState(''),
        [sending, setSending] = useState(false),
        [status, setStatus] = useState(''),
        [sent, setSent] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null),
        request = useRef({ id: '', openedAt: 0 }),
        pending = useRef(false);
    useEffect(() => {
        if (panel) dialog.current?.showModal();
        else dialog.current?.close();
    }, [panel]);
    function open(next: Panel) {
        if (pending.current) return;
        request.current = { id: crypto.randomUUID(), openedAt: Date.now() };
        setStatus('');
        setSent(false);
        setMessage('');
        setEmail('');
        setWebsite('');
        setPanel(next);
    }
    function close() {
        if (!pending.current) setPanel(null);
    }
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (pending.current || panel === 'privacy' || !panel) return;
        if (message.trim().length < 10) {
            setStatus('Escreva pelo menos 10 caracteres.');
            return;
        }
        pending.current = true;
        setSending(true);
        setStatus('');
        try {
            await sendFeedback({ type: panel, message, email, website, ...request.current });
            setSent(true);
            setStatus('Sua mensagem foi enviada. Obrigado pela contribuição.');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            pending.current = false;
            setSending(false);
        }
    }
    return (
        <>
            <footer className="site-footer">
                <div className="site-footer-brand">
                    <span className="hazard" aria-hidden="true" />
                    <span>© {new Date().getFullYear()} DIGIMON CWB</span>
                </div>
            </footer>
            {sidebarTarget &&
                createPortal(
                    <>
                        <ThemePicker />
                        <nav aria-label="Suporte e informações">
                            <span className="sidebar-support-label">Suporte</span>
                            <button
                                className="sidebar-support-action"
                                aria-label="Enviar sugestão"
                                onClick={() => open('suggestion')}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.4Z" />
                                    <path d="M8 10h8M8 14h5" />
                                </svg>
                                <span>Sugestão</span>
                            </button>
                            <button
                                className="sidebar-support-action"
                                aria-label="Reportar bug"
                                onClick={() => open('bug')}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <rect x="8" y="7" width="8" height="13" rx="4" />
                                    <path d="M9 3l2 4M15 3l-2 4M4 9l4 2M20 9l-4 2M3 15h5M16 15h5M5 21l4-3M19 21l-4-3M12 11v5" />
                                </svg>
                                <span>Reportar bug</span>
                            </button>
                            <button
                                className="sidebar-support-action sidebar-support-privacy"
                                onClick={() => open('privacy')}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
                                    <path d="m9 12 2 2 4-4" />
                                </svg>
                                <span>Privacidade</span>
                            </button>
                            <div className="sidebar-social-links">
                                <a
                                    href="https://www.instagram.com/digimoncwb/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <span
                                        className="sidebar-social-icon instagram"
                                        aria-hidden="true"
                                    />
                                    Instagram
                                </a>
                                <a
                                    href="https://x.com/digimon_cwb"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <span className="sidebar-social-icon x" aria-hidden="true" />
                                    x.com
                                </a>
                            </div>
                        </nav>
                        <span className="site-version">Versão {window.APP_VERSION || '2.0'}</span>
                    </>,
                    sidebarTarget
                )}
            <dialog
                ref={dialog}
                className="site-support-dialog"
                aria-labelledby="support-dialog-title"
                onCancel={(event) => {
                    if (pending.current) event.preventDefault();
                    else close();
                }}
                onClose={close}
            >
                <div className="dialog-heading">
                    <h2 id="support-dialog-title">
                        {panel === 'privacy'
                            ? 'Política de privacidade'
                            : panel === 'bug'
                              ? 'Reportar bug'
                              : 'Enviar sugestão'}
                    </h2>
                    <button
                        className="button secondary cancel-close"
                        disabled={sending}
                        onClick={close}
                    >
                        Cancelar
                    </button>
                </div>
                {panel === 'privacy' ? (
                    <div className="privacy-content">
                        <p className="muted">Atualizada em 25 de outubro de 2026</p>
                        <p>
                            Esta política explica como o DIGIMON CWB trata dados ao apresentar
                            resultados de torneios, gerenciar cadastros e receber mensagens de
                            suporte.
                        </p>
                        <p>
                            O site é organizado pela Comunidade Digimon CWB. Eduardo Lopes é o
                            responsável técnico e o contato de contas e privacidade é{' '}
                            <a href="mailto:dulopes1997@gmail.com">dulopes1997@gmail.com</a>.
                        </p>
                        <h3>Dados e finalidade</h3>
                        <p>
                            O histórico reúne nomes e apelidos de jogadores, identificadores Bandai
                            / DigiLab, decks, classificações e participações. Esses dados são usados
                            para organizar torneios e apresentar estatísticas; nomes e resultados
                            aparecem nas consultas públicas.
                        </p>
                        <p>
                            Ao enviar uma sugestão ou reportar um bug, são enviados sua mensagem,
                            e-mail de contato opcional e informações básicas sobre a página e o
                            navegador para ajudar a entender o problema. Dados de conexão também são
                            usados para prevenir spam. Não envie senhas ou outros dados sensíveis.
                        </p>
                        <h3>Armazenamento e compartilhamento</h3>
                        <p>
                            Utilizamos serviços de apoio para armazenar os dados, permitir o acesso
                            administrativo e encaminhar mensagens de suporte à equipe por e-mail.
                            Imagens de cartas e logos podem ser fornecidas por outros sites, que
                            recebem informações básicas de conexão ao exibi-las.
                        </p>
                        <p>
                            O navegador guarda suas preferências, informações de acesso
                            administrativo e cópias de arquivos para agilizar o carregamento. Você
                            pode apagar esses dados nas configurações do navegador. Sair do Admin
                            encerra o acesso administrativo naquele navegador.
                        </p>
                        <h3>Conservação dos dados</h3>
                        <p>
                            A auditoria da aplicação tem retenção de 90 dias, com rotina diária de
                            limpeza. Esse prazo não se aplica automaticamente aos logs dos
                            fornecedores, aos backups ou ao histórico público de torneios. As
                            solicitações concluídas e mensagens de suporte resolvidas têm prazo de
                            180 dias após conclusão, com revisão e limpeza manual pela equipe.
                            Pedidos de correção, anonimização ou exclusão são avaliados conforme as
                            condições aplicáveis.
                        </p>
                        <h3>Seus dados e contato</h3>
                        <p>
                            Você pode solicitar informações, acesso, correção ou exclusão dos seus
                            dados, conforme as condições aplicáveis. Escreva para o contato de
                            privacidade; não é necessário ter uma conta ou enviar sua senha.
                        </p>
                        <a
                            className="button secondary"
                            href="mailto:dulopes1997@gmail.com?subject=Solicita%C3%A7%C3%A3o%20sobre%20meus%20dados%20-%20DIGIMON%20CWB"
                        >
                            Entrar em contato sobre meus dados
                        </a>
                        <p>
                            <a
                                href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Saiba mais sobre seus direitos na ANPD ↗
                            </a>
                        </p>
                    </div>
                ) : sent ? (
                    <div className="feedback-complete">
                        <p role="status">{status}</p>
                        <button className="button primary" onClick={close}>
                            Concluir
                        </button>
                    </div>
                ) : (
                    <form onSubmit={(event) => void submit(event)}>
                        <p className="muted">
                            {panel === 'bug'
                                ? 'Conte o que aconteceu e como reproduzir o problema.'
                                : 'Compartilhe uma ideia para melhorar o site.'}
                        </p>
                        <label htmlFor="site-feedback-message">
                            Mensagem
                            <textarea
                                id="site-feedback-message"
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                required
                                minLength={10}
                                maxLength={5000}
                                rows={6}
                                disabled={sending}
                                autoFocus
                            />
                        </label>
                        <label htmlFor="site-feedback-email">
                            E-mail para retorno <span className="muted">(opcional)</span>
                            <input
                                id="site-feedback-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                maxLength={254}
                                autoComplete="email"
                                disabled={sending}
                            />
                        </label>
                        <div className="feedback-honeypot" aria-hidden="true">
                            <label>
                                Website
                                <input
                                    value={website}
                                    onChange={(event) => setWebsite(event.target.value)}
                                    tabIndex={-1}
                                    autoComplete="off"
                                />
                            </label>
                        </div>
                        <p className="feedback-privacy-note">
                            A mensagem e informações técnicas da página serão enviadas à equipe.{' '}
                            <button
                                type="button"
                                disabled={sending}
                                onClick={() => setPanel('privacy')}
                            >
                                Ver política de privacidade
                            </button>
                        </p>
                        {status && (
                            <p role="alert" className="feedback-error">
                                {status}
                            </p>
                        )}
                        <div className="support-form-actions">
                            <button
                                type="button"
                                className="button secondary"
                                disabled={sending}
                                onClick={close}
                            >
                                Cancelar
                            </button>
                            <button className="button primary" disabled={sending}>
                                {sending ? 'Enviando…' : 'Enviar'}
                            </button>
                        </div>
                    </form>
                )}
            </dialog>
        </>
    );
}
