import { useEffect, useId, useState } from 'react';

export interface PickedCommunityPlayer {
    id: string;
    name: string;
    bandai_id?: string | null;
}

export function CommunityPlayerPicker({
    selected,
    onChange,
    busy,
    limit,
    excluded = []
}: {
    selected: PickedCommunityPlayer[];
    onChange(players: PickedCommunityPlayer[]): void;
    busy: boolean;
    limit: number;
    excluded?: string[];
}) {
    const [query, setQuery] = useState('');
    const [players, setPlayers] = useState<PickedCommunityPlayer[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const id = useId();
    const term = query
        .trim()
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .trim()
        .slice(0, 60);
    useEffect(() => {
        setPlayers([]);
        setError('');
        setActive(0);
        if (term.length < 2) {
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({
                    select: 'id,name,bandai_id',
                    order: 'name.asc',
                    limit: '8',
                    or: `(name.ilike.*${term}*,bandai_nick.ilike.*${term}*,bandai_id.ilike.*${term}*)`
                });
                const response = await fetch(
                    window.APP_CONFIG.SUPABASE_URL + '/rest/v1/players?' + params,
                    {
                        headers: window.createSupabaseHeaders(),
                        signal: controller.signal
                    }
                );
                if (!response.ok) throw new Error('Não foi possível buscar jogadores.');
                const rows = await response.json();
                if (!controller.signal.aborted) setPlayers(rows);
            } catch (error) {
                if (!controller.signal.aborted)
                    setError(error instanceof Error ? error.message : 'Falha na busca.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 200);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [term]);
    const hidden = new Set([...excluded, ...selected.map((p) => p.id)]);
    const suggestions = players.filter((p) => !hidden.has(p.id));
    const expanded = open && term.length >= 2 && selected.length < limit;
    function choose(player: PickedCommunityPlayer) {
        if (busy || selected.length >= limit) return;
        onChange([...selected, player]);
        setQuery('');
        setOpen(false);
        setPlayers([]);
    }
    return (
        <fieldset className="community-player-picker community-player-autocomplete" disabled={busy}>
            <label htmlFor={`${id}-input`}>Adicionar jogadores</label>
            <div className="community-player-search">
                <input
                    id={`${id}-input`}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    value={query}
                    placeholder="Digite o nome do jogador"
                    maxLength={100}
                    aria-expanded={expanded}
                    aria-controls={`${id}-suggestions`}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        expanded && suggestions[active] ? `${id}-option-${active}` : undefined
                    }
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            setOpen(false);
                        }
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            setOpen(true);
                            setActive((value) =>
                                Math.max(
                                    0,
                                    Math.min(
                                        suggestions.length - 1,
                                        value + (e.key === 'ArrowDown' ? 1 : -1)
                                    )
                                )
                            );
                        }
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (expanded && suggestions[active]) choose(suggestions[active]);
                        }
                    }}
                />
                {expanded && (
                    <div
                        className="community-player-suggestions"
                        id={`${id}-suggestions`}
                        role="listbox"
                        aria-label="Sugestões de jogadores"
                        aria-busy={loading}
                    >
                        {suggestions.map((player, index) => (
                            <button
                                key={player.id}
                                id={`${id}-option-${index}`}
                                role="option"
                                aria-selected={active === index}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => choose(player)}
                            >
                                <span>{player.name}</span>
                                {player.bandai_id && <small>#{player.bandai_id}</small>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {error && <p role="alert">{error}</p>}
            {expanded && (
                <p className="community-note" role="status">
                    {loading
                        ? 'Buscando jogadores…'
                        : !suggestions.length && !error
                          ? 'Nenhum jogador encontrado.'
                          : ''}
                </p>
            )}
            {selected.length > 0 && (
                <div className="community-selected-players">
                    {selected.map((player) => (
                        <button
                            type="button"
                            className="button secondary"
                            key={player.id}
                            onClick={() => onChange(selected.filter((p) => p.id !== player.id))}
                            aria-label={`Remover ${player.name} da seleção`}
                        >
                            {player.name} ×
                        </button>
                    ))}
                </div>
            )}
        </fieldset>
    );
}
