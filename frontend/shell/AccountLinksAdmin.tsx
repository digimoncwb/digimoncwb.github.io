import { useEffect, useRef, useState } from 'react';
import type { SiteAuth } from '../contracts';
import { Dialog } from '../shared/ListPage';

type Link = {
    user_id: string;
    username: string;
    display_name: string;
    status: string;
    player_id: string | null;
    player_name: string | null;
    bandai_nick: string | null;
    bandai_id: string | null;
};
type Player = { id: string; name: string; bandai_nick: string | null; bandai_id: string | null };

export function AccountLinksAdmin({
    auth,
    onBusy
}: {
    auth: SiteAuth;
    onBusy(value: boolean): void;
}) {
    const [rows, setRows] = useState<Link[]>([]),
        [page, setPage] = useState(0),
        [search, setSearch] = useState(''),
        [term, setTerm] = useState('');
    const [error, setError] = useState(''),
        [notice, setNotice] = useState(''),
        [loading, setLoading] = useState(false),
        [busy, setBusy] = useState(false),
        [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState<Link | null>(null),
        [query, setQuery] = useState(''),
        [options, setOptions] = useState<Player[]>([]),
        [selected, setSelected] = useState<Player | null>(null),
        [searching, setSearching] = useState(false);
    const mutating = useRef(false);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setRows([]);
        auth.rpc<Link[]>('admin_list_account_links', { p_search: term, p_offset: page * 50 })
            .then((data) => {
                if (active) setRows(data);
            })
            .catch((error) => {
                if (active) setError(error.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [auth, page, term, revision]);
    useEffect(() => {
        let active = true;
        setOptions([]);
        setSearching(false);
        if (!editing || query.trim().length < 2) return;
        const timer = setTimeout(() => {
            setSearching(true);
            auth.rpc<Player[]>('admin_search_link_players', {
                p_search: query.trim(),
                p_user_id: editing.user_id
            })
                .then((data) => {
                    if (active) setOptions(data);
                })
                .catch((error) => {
                    if (active) setError(error.message);
                })
                .finally(() => {
                    if (active) setSearching(false);
                });
        }, 250);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [auth, editing, query]);
    async function save(row: Link, player: Player | null) {
        if (mutating.current) return;
        mutating.current = true;
        setBusy(true);
        onBusy(true);
        setError('');
        setNotice('');
        try {
            await auth.rpc('admin_set_account_player', {
                p_user_id: row.user_id,
                p_player_id: player?.id ?? null,
                p_expected_player_id: row.player_id
            });
            setNotice(
                player
                    ? 'Vínculo atualizado.'
                    : 'Vínculo removido. A conta e o jogador foram preservados.'
            );
            setEditing(null);
            setRevision((value) => value + 1);
            await auth.refresh();
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Não foi possível atualizar o vínculo.'
            );
            setRevision((value) => value + 1);
        } finally {
            mutating.current = false;
            setBusy(false);
            onBusy(false);
        }
    }
    return (
        <section className="site-account-links">
            <p className="muted">
                Gerencie qual jogador pertence a cada conta. Cada jogador pode estar vinculado a uma
                única conta.
            </p>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setError('');
                    setTerm(search);
                    setPage(0);
                }}
            >
                <label>
                    Buscar conta ou jogador
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Nome, usuário ou jogador"
                    />
                </label>
                <button className="text-action" disabled={busy || loading}>
                    Buscar
                </button>
            </form>
            {loading && <p role="status">Carregando vínculos…</p>}
            <div className="site-account-link-list">
                {rows.map((row) => (
                    <article className="site-account-link-row" key={row.user_id}>
                        <div>
                            <strong>{row.display_name}</strong>
                            <small>@{row.username}</small>
                        </div>
                        <div>
                            {row.player_id ? (
                                <>
                                    <span className="muted">Jogador vinculado</span>
                                    <strong>{row.player_name || 'Jogador sem nome'}</strong>
                                </>
                            ) : (
                                <strong className="muted">Sem jogador vinculado</strong>
                            )}
                            {row.bandai_nick && <small>{row.bandai_nick}</small>}
                        </div>
                        <div className="site-account-actions">
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => {
                                    setEditing(row);
                                    setQuery('');
                                    setSelected(null);
                                    setError('');
                                }}
                            >
                                {row.player_id ? 'Alterar vínculo' : 'Vincular jogador'}
                            </button>
                            {row.player_id && (
                                <button
                                    className="button secondary site-account-unlink"
                                    disabled={busy}
                                    onClick={() => {
                                        if (
                                            confirm(
                                                `Remover o vínculo de @${row.username} com ${row.player_name}? A conta e o jogador serão mantidos.`
                                            )
                                        )
                                            void save(row, null);
                                    }}
                                >
                                    Desvincular
                                </button>
                            )}
                        </div>
                    </article>
                ))}
                {!loading && !rows.length && <p>Nenhuma conta encontrada.</p>}
            </div>
            {(page > 0 || rows.length === 50) && (
                <div className="site-account-actions site-admin-pagination">
                    <button
                        className="button secondary"
                        disabled={busy || loading || page === 0}
                        onClick={() => setPage(page - 1)}
                    >
                        Anterior
                    </button>
                    <span>Página {page + 1}</span>
                    <button
                        className="button secondary"
                        disabled={busy || loading || rows.length < 50}
                        onClick={() => setPage(page + 1)}
                    >
                        Próxima
                    </button>
                </div>
            )}
            {editing && (
                <Dialog
                    title={`Vínculo de @${editing.username}`}
                    busy={busy}
                    onClose={() => setEditing(null)}
                >
                    <div className="site-account">
                        {error && <p role="alert">{error}</p>}
                        <p>
                            Atual: <strong>{editing.player_name || 'Sem vínculo'}</strong>
                        </p>
                        <label>
                            Buscar jogador
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setSelected(null);
                                }}
                                placeholder="Nome ou identificação Bandai"
                                disabled={busy}
                            />
                        </label>
                        {searching && <p role="status">Buscando jogadores…</p>}
                        {!selected && (
                            <ul className="site-account-link-options">
                                {options.map((player) => (
                                    <li key={player.id}>
                                        <button
                                            className="button secondary"
                                            disabled={busy}
                                            onClick={() => setSelected(player)}
                                        >
                                            {player.name}
                                            {player.bandai_nick ? ` · ${player.bandai_nick}` : ''}
                                            {player.bandai_id ? ` · #${player.bandai_id}` : ''}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {!searching && query.trim().length >= 2 && !options.length && (
                            <p>Nenhum jogador disponível.</p>
                        )}
                        {selected && (
                            <p>
                                Selecionado: <strong>{selected.name}</strong>
                            </p>
                        )}
                        <button
                            className="button primary"
                            disabled={busy || !selected || selected.id === editing.player_id}
                            onClick={() => {
                                if (selected) void save(editing, selected);
                            }}
                        >
                            Salvar vínculo
                        </button>
                    </div>
                </Dialog>
            )}
        </section>
    );
}
