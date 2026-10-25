import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Manifest, MicroModule, MicroHandle, MicroContext, RouteName } from '../contracts';
import { Loader } from '../shared/runtime';
import { bootstrap, asset, dataService, loadScript, scriptVersion } from './services';
import { readRoute, subscribeRoute, href, navigate } from './routes';
import styles from './Shell.module.css';
import { SiteFooter } from './SiteFooter';
import { restoreAccent } from './ThemePicker';
import { useNativeSelects } from '../shared/NativeSelects';
import { loadStylesheet } from './styles';
import { useSiteAuth } from '../shared/site-auth';
import { AccountPanel } from './AccountPanel';
import '../../shared/theme.css';
import '../../demo-v2/styles.css';
import '../../shared/presentation.css';
import '../../shared/workspace/presentation.css';
import '../../shared/accent.css';
const sections: {
    key: string;
    label: string;
    links: [string, RouteName, Record<string, string>?][];
}[] = [
    { key: 'overview', label: 'Visão geral', links: [['Visão geral', 'overview']] },
    {
        key: 'tournaments',
        label: 'Torneios',
        links: [
            ['Lista e calendário', 'tournaments'],
            ['Cadastrar torneio', 'manage', { create: '1' }]
        ]
    },
    {
        key: 'meta',
        label: 'Metagame',
        links: [['Metagame', 'meta']]
    },
    {
        key: 'decks',
        label: 'Deckbuilder',
        links: [['Deckbuilder', 'decks']]
    },
    {
        key: 'players',
        label: 'Jogadores',
        links: [
            ['Lista de jogadores', 'players'],
            ['Cadastrar jogador', 'players', { action: 'create-player' }]
        ]
    },
    { key: 'admin', label: 'Admin', links: [['DigiLab e configurações', 'admin']] },
    { key: 'posts', label: 'Criação de conteúdo', links: [['Criação de conteúdo', 'posts']] }
];
const labels: Record<RouteName, string> = {
    overview: 'Visão geral',
    tournaments: 'Torneios',
    meta: 'Metagame',
    decks: 'Deckbuilder',
    players: 'Jogadores',
    admin: 'Admin / DigiLab',
    manage: 'Torneios',
    statistics: 'Estatísticas',
    posts: 'Estúdio de posts',
    builder: 'Deckbuilder'
};
const sectionsLabel: Record<RouteName, string> = {
    overview: 'Painel da comunidade',
    tournaments: 'Eventos da comunidade',
    manage: 'Gestão / Eventos',
    meta: 'Comunidade / Análises',
    statistics: 'Comunidade / Análises',
    decks: 'Biblioteca da comunidade',
    players: 'Comunidade / Cadastros',
    admin: 'Configurações da comunidade',
    posts: 'Criação de conteúdo',
    builder: 'Biblioteca / Decklists'
};
function Shell() {
    useNativeSelects();
    const account = useSiteAuth();
    const [accountView, setAccountView] = useState<
        'login' | 'profile' | 'admin' | 'password' | null
    >(null);
    useEffect(() => {
        const open = (event: Event) => {
            const view = (event as CustomEvent).detail?.view;
            setAccountView(
                ['login', 'profile', 'admin', 'password'].includes(view) ? view : 'login'
            );
        };
        window.addEventListener('digistats:account-open', open);
        return () => window.removeEventListener('digistats:account-open', open);
    }, []);
    useEffect(() => {
        if (account.recoveryRequired) setAccountView('password');
    }, [account.recoveryRequired]);
    const [route, setRoute] = useState(readRoute),
        [expanded, setExpanded] = useState(''),
        [mobileOpen, setMobileOpen] = useState(false),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(''),
        [retry, setRetry] = useState(0);
    const outlet = useRef<HTMLDivElement>(null);
    const handles = useRef(new Map<string, { element: HTMLElement; handle: MicroHandle }>());
    const manifest = useRef<Manifest | null>(null);
    const adminDenied = route.name === 'admin' && account.enabled && !account.isAdmin;
    useEffect(() => subscribeRoute(() => setRoute(readRoute())), []);
    const activeKey =
        (
            { manage: 'tournaments', builder: 'decks', statistics: 'meta' } as Partial<
                Record<RouteName, string>
            >
        )[route.name] || route.name;
    useEffect(() => {
        document.title = `DIGIMON CWB — ${labels[route.name]}`;
        setExpanded(window.matchMedia('(max-width:780px)').matches ? '' : activeKey);
        setMobileOpen(false);
    }, [route.name, activeKey]);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        if (adminDenied) {
            for (const item of handles.current.values()) item.element.hidden = true;
            setLoading(false);
            return;
        }
        const context: MicroContext = {
            route,
            active: true,
            data: dataService,
            asset,
            navigate,
            href,
            loadScript,
            auth: window.digistatsAuth
        };
        (async () => {
            manifest.current ||= await (
                await fetch(asset(`demo-v2/microfrontends.json?v=${scriptVersion}`), {
                    cache: 'no-cache'
                })
            ).json();
            if (cancelled) return;
            if (manifest.current?.apiVersion !== 1)
                throw Error('Versão de interface incompatível. Atualize a página.');
            const record = Object.entries(manifest.current.modules).find(([, config]) =>
                config.routes.includes(route.name)
            );
            if (!record) throw Error('Tela não encontrada.');
            const [name, config] = record;
            await Promise.all(
                (config.styles || []).map((path) =>
                    loadStylesheet(path, manifest.current!.version, asset)
                )
            );
            if (cancelled) return;
            for (const [id, item] of handles.current) {
                item.element.hidden = id !== name;
                item.element.id = id === name && name === 'builder' ? 'v2Tools' : '';
                item.handle.update({ ...context, active: id === name });
            }
            document.documentElement.classList.toggle(
                'v2-tools',
                name === 'workspace' || name === 'builder'
            );
            document.body.classList.toggle('native-v2', name === 'workspace' || name === 'builder');
            document.body.classList.toggle(
                'dashboard-home',
                name === 'workspace' || name === 'builder'
            );
            document.body.classList.toggle('decklist-builder-page', name === 'builder');
            if (!handles.current.has(name)) {
                const entry = new URL(asset(config.entry));
                if (retry) entry.searchParams.set('retry', String(retry));
                // Mount only after the styles for this build are ready.
                const moduleRequest = import(/* @vite-ignore */ entry.href) as Promise<MicroModule>;
                if (cancelled) return;
                const module = await moduleRequest;
                if (cancelled) return;
                if (module.apiVersion !== 1) throw Error('Componente incompatível.');
                const element = document.createElement('div');
                element.className = styles.module;
                element.dataset.microfrontend = name;
                if (name === 'builder') element.id = 'v2Tools';
                outlet.current!.append(element);
                try {
                    handles.current.set(name, { element, handle: module.mount(element, context) });
                } catch (e) {
                    element.remove();
                    throw e;
                }
            }
        })()
            .catch((e) => {
                if (!cancelled) setError(e.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [route, retry, adminDenied]);
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            const anchor = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]');
            if (
                !anchor ||
                anchor.target === '_blank' ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.button !== 0
            )
                return;
            const url = new URL(anchor.href);
            if (url.origin !== location.origin) return;
            if (
                url.pathname.endsWith('/demo-v2/tools.html') ||
                url.pathname.endsWith('/tools.html') ||
                url.pathname.endsWith('/demo-v2/deckbuilder.html') ||
                url.pathname.includes('/torneios/decklist-builder/')
            ) {
                event.preventDefault();
                const view =
                    url.searchParams.get('view') ||
                    url.searchParams.get('returnView') ||
                    'tournaments';
                const name =
                    url.pathname.includes('deckbuilder') ||
                    url.pathname.includes('decklist-builder')
                        ? 'builder'
                        : (
                              {
                                  tournaments: 'manage',
                                  decks: 'decks',
                                  players: 'players',
                                  admin: 'admin',
                                  statistics: 'statistics'
                              } as Record<string, RouteName>
                          )[view] || 'manage';
                navigate(name, Object.fromEntries(url.searchParams));
            }
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);
    return (
        <div className={styles.root}>
            <aside className="sidebar">
                <a
                    className="brand"
                    href={href('overview')}
                    onClick={(e) => {
                        e.preventDefault();
                        navigate('overview');
                    }}
                >
                    <span className="hazard brand-mark" />
                    <span>DIGIMON CWB</span>
                </a>
                <button
                    className={styles.mobileToggle}
                    aria-expanded={mobileOpen}
                    aria-controls="app-navigation"
                    onClick={() => setMobileOpen(!mobileOpen)}
                >
                    Menu {mobileOpen ? '−' : '+'}
                </button>
                <nav
                    id="app-navigation"
                    aria-label="Navegação principal"
                    className={styles.navigation}
                    hidden={!mobileOpen}
                >
                    {sections
                        .filter(
                            (section) =>
                                section.key !== 'admin' || !account.enabled || account.isAdmin
                        )
                        .map((section) => (
                            <div
                                key={section.key}
                                className={`nav-group${activeKey === section.key ? ' is-active' : ''}`}
                            >
                                {section.links.length > 1 ? (
                                    <>
                                        <button
                                            className="nav-expand"
                                            aria-expanded={expanded === section.key}
                                            aria-controls={`submenu-${section.key}`}
                                            onClick={() =>
                                                setExpanded(
                                                    expanded === section.key ? '' : section.key
                                                )
                                            }
                                        >
                                            <span>{section.label}</span>
                                            <span className="nav-chevron" aria-hidden="true">
                                                ⌄
                                            </span>
                                        </button>
                                        <div
                                            id={`submenu-${section.key}`}
                                            className="nav-submenu"
                                            hidden={expanded !== section.key}
                                        >
                                            {section.links.map(([label, name, params]) => (
                                                <a
                                                    key={label}
                                                    href={href(name, params)}
                                                    aria-current={
                                                        route.name === name &&
                                                        (!params ||
                                                            Object.entries(params).every(
                                                                ([key, value]) =>
                                                                    route.params.get(key) === value
                                                            ))
                                                            ? 'page'
                                                            : undefined
                                                    }
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        navigate(name, params);
                                                    }}
                                                >
                                                    {label}
                                                </a>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <a
                                        href={href(section.links[0][1])}
                                        aria-current={
                                            activeKey === section.key ? 'page' : undefined
                                        }
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigate(section.links[0][1]);
                                        }}
                                    >
                                        {section.label}
                                    </a>
                                )}
                            </div>
                        ))}
                </nav>
                {account.available && (
                    <div className="site-account-menu">
                        <button
                            className="button secondary"
                            onClick={() => setAccountView(account.user ? 'profile' : 'login')}
                        >
                            {account.user
                                ? account.profile?.display_name || 'Minha conta'
                                : 'Entrar'}
                        </button>
                        {account.isAdmin && (
                            <button
                                className="button secondary"
                                onClick={() => setAccountView('admin')}
                            >
                                Contas e auditoria
                            </button>
                        )}
                    </div>
                )}
                <div id="sidebar-support" className="sidebar-support" hidden={!mobileOpen} />
            </aside>
            <main className={styles.main}>
                {route.name !== 'builder' && (
                    <header className="topbar">
                        <div className="breadcrumb">
                            <strong>{sectionsLabel[route.name]}</strong>
                        </div>
                    </header>
                )}
                {loading && <Loader />}
                {adminDenied && (
                    <div className={styles.failure} role="alert">
                        <p>Esta área exige uma conta administrativa ativa.</p>
                        <button
                            className="button secondary"
                            onClick={() => setAccountView(account.user ? 'profile' : 'login')}
                        >
                            Acessar minha conta
                        </button>
                    </div>
                )}
                {error && (
                    <div className={styles.failure} role="alert">
                        <p>{error}</p>
                        <button className="button secondary" onClick={() => setRetry(retry + 1)}>
                            Tentar novamente
                        </button>
                    </div>
                )}
                <div ref={outlet} className={styles.content} />
                <SiteFooter />
            </main>
            {accountView && window.digistatsAuth && (
                <AccountPanel
                    auth={window.digistatsAuth}
                    view={accountView}
                    onClose={() => setAccountView(null)}
                />
            )}
        </div>
    );
}
restoreAccent();
bootstrap()
    .then(() => {
        createRoot(document.getElementById('app')!).render(<Shell />);
        if (import.meta.env.PROD) void loadScript('config/register-sw.js');
    })
    .catch((error) => {
        document.getElementById('app')!.textContent =
            `Não foi possível iniciar a aplicação: ${error.message}. Recarregue a página.`;
    });
