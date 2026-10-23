import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MicroContext } from '../../contracts';
import { mountReact, Loader } from '../../shared/runtime';
import { DomainForms } from './DomainForms';
import { PageHeading } from '../../shared/PageHeading';
import { DecksPage, PlayersPage } from './CatalogPages';
import { TournamentsPage, type TournamentCommand } from './TournamentsPage';
import { TournamentSteps } from './TournamentSteps';
import './catalog.css';
import { PortraitEditor } from './PortraitEditor';
import { AdminFormatsPage } from './AdminFormatsPage';
const Forms = memo(DomainForms);
let initialized: Promise<void> | null = null;
const view = (name: string) => (name === 'manage' ? 'tournaments' : name);
const titles: Record<string, [string, string]> = {
    manage: [
        'Gerenciar torneios',
        'Cadastre torneios, importe resultados e acompanhe as classificações.'
    ],
    decks: ['Deckbuilder', 'Escolha um torneio para cadastrar listas.'],
    players: ['Jogadores', 'Cadastros, apelidos Bandai / DigiLab e histórico de resultados.'],
    admin: ['Administração', ''],
    statistics: ['Estatísticas', 'Cartas, rankings, campeões por loja e análises detalhadas.']
};
export const apiVersion = 1;
export const mount = (element: HTMLElement, context: MicroContext) =>
    mountReact(Workspace, element, context);
function Workspace({ context }: { context: MicroContext }) {
    const [command, setCommand] = useState<TournamentCommand | null>(null);
    const native = ['decks', 'players', 'tournaments', 'manage'].includes(context.route.name);
    useEffect(() => {
        if (!context.active) setCommand(null);
    }, [context.active]);
    return (
        <>
            {context.route.name === 'decks' && <DecksPage context={context} />}
            {context.route.name === 'players' && <PlayersPage context={context} />}
            {['tournaments', 'manage'].includes(context.route.name) && (
                <TournamentsPage context={context} onEditor={setCommand} />
            )}
            <LegacyWorkspace
                context={{ ...context, active: context.active && (!native || !!command) }}
                command={command}
                native={native}
                onEditorClosed={() => {
                    setCommand(null);
                    void context.data.refresh();
                }}
            />
        </>
    );
}
function LegacyWorkspace({
    context,
    command,
    native,
    onEditorClosed
}: {
    context: MicroContext;
    command: TournamentCommand | null;
    native: boolean;
    onEditorClosed(): void;
}) {
    const toolsHost = useRef<HTMLDivElement>(null);
    const [adminAuthenticated, setAdminAuthenticated] = useState(
        () => window.digistatsAdminAuthenticated === true
    );
    useEffect(() => {
        const update = () => setAdminAuthenticated(window.digistatsAdminAuthenticated === true);
        window.addEventListener('digistats:admin-auth-changed', update);
        update();
        return () => window.removeEventListener('digistats:admin-auth-changed', update);
    }, []);
    const [busy, setBusy] = useState(true),
        [error, setError] = useState('');
    const latest = useRef(context);
    const done = useRef(onEditorClosed);
    done.current = onEditorClosed;
    latest.current = context;
    useEffect(() => {
        if (!context.active) return;
        let current = true;
        setBusy(true);
        setError('');
        initialized ||= (async () => {
            window.DIGISTATS_WORKSPACE_VIEW = 'tournaments';
            for (const script of [
                'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
                'config/api-client.js',
                'config/ui-state.js',
                'config/app-version.js',
                'torneios/list-tournaments/calendar-view/calendar.js',
                'config/tournament-utils.js',
                'config/digilab-export.js',
                'torneios/tournament-ocr-files.js',
                'feedback/feedback.js',
                'torneios/list-tournaments/script.js',
                'torneios/edit-tournament/modal.js'
            ])
                await context.loadScript(script);
            await window.initializeTournamentTools();
        })().catch((error) => {
            initialized = null;
            throw error;
        });
        initialized
            .then(async () => {
                if (!current) return;
                window.DIGISTATS_WORKSPACE_VIEW = native
                    ? 'tournaments'
                    : view(latest.current.route.name);
                await window.switchDashboardView(window.DIGISTATS_WORKSPACE_VIEW);
                if (!current) return;
                if (command) {
                    if (command.kind === 'create')
                        await window.openCreateTournamentModal(command.date);
                    else window.editTournament(command.id!);
                    if (!document.querySelector('#createModal.active, #editModal.active')) {
                        setError('Não foi possível abrir o formulário. Tente novamente.');
                        done.current();
                    }
                }
            })
            .catch((error) => {
                if (current) setError(error.message);
            })
            .finally(() => {
                if (current) setBusy(false);
            });
        return () => {
            current = false;
        };
    }, [context.route, context.active, command?.token]);
    useEffect(() => {
        if (!command) return;
        let opened = false;
        const observer = new MutationObserver(() => {
            const active = !!document.querySelector('#createModal.active, #editModal.active');
            if (active) opened = true;
            else if (opened) {
                opened = false;
                done.current();
            }
        });
        for (const id of ['createModal', 'editModal']) {
            const modal = document.getElementById(id);
            if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
        return () => observer.disconnect();
    }, [command?.token]);
    const labels = titles[context.route.name] || titles.manage;
    return (
        <div
            id={context.active ? 'v2Tools' : undefined}
            className={native ? 'tournament-editor-bridge' : ''}
            hidden={!context.active}
        >
            {!native && (
                <div className="workspace-page-header">
                    <PageHeading
                        eyebrow={
                            context.route.name === 'statistics'
                                ? 'Análises do cenário'
                                : context.route.name === 'admin'
                                  ? ''
                                  : 'Gestão da comunidade'
                        }
                        title={labels[0]}
                        description={labels[1]}
                    />
                    {context.route.name !== 'admin' && (
                        <a
                            className="button secondary native-back-link"
                            href={context.href(
                                context.route.name === 'manage'
                                    ? 'tournaments'
                                    : context.route.name === 'statistics'
                                      ? 'meta'
                                      : 'overview'
                            )}
                            onClick={(e) => {
                                e.preventDefault();
                                context.navigate(
                                    context.route.name === 'manage'
                                        ? 'tournaments'
                                        : context.route.name === 'statistics'
                                          ? 'meta'
                                          : 'overview'
                                );
                            }}
                        >
                            ← Voltar
                        </a>
                    )}
                </div>
            )}
            {busy && <Loader text="Carregando ferramentas…" />}
            {error && <p role="alert">{error}</p>}
            <div data-workspace-root="true" ref={toolsHost}>
                <Forms />
            </div>
            {context.route.name === 'admin' &&
                !busy &&
                adminAuthenticated &&
                document.getElementById('adminGameFormatsPanel') &&
                createPortal(
                    <AdminFormatsPage context={context} />,
                    document.getElementById('adminGameFormatsPanel')!
                )}
            {context.route.name === 'admin' &&
                !busy &&
                adminAuthenticated &&
                document.getElementById('adminPortraitPanel') &&
                createPortal(
                    <PortraitEditor context={context} />,
                    document.getElementById('adminPortraitPanel')!
                )}
            {native && command && (
                <TournamentSteps
                    mode={command.kind === 'create' ? 'create' : 'edit'}
                    token={command.token}
                />
            )}
        </div>
    );
}
