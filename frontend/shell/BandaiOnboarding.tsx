import { useEffect, useState } from 'react';
import type { SiteAuth } from '../contracts';
import { Dialog } from '../shared/ListPage';
import { useSiteAuth } from '../shared/site-auth';
import { LegalChecks, uncheckedDeclarations } from './LegalChecks';

type Player = { id: string; name: string; bandai_nick: string | null; available: boolean };

export function BandaiOnboarding({ auth, onComplete }: { auth: SiteAuth; onComplete(): void }) {
    const state = useSiteAuth();
    const [name, setName] = useState('');
    const [players, setPlayers] = useState<Player[]>([]);
    const [selected, setSelected] = useState('');
    const [searched, setSearched] = useState('');
    const [searchError, setSearchError] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [declarations, setDeclarations] = useState(uncheckedDeclarations);
    const query = name.trim();
    useEffect(() => {
        let live = true;
        setPlayers([]);
        setSearched('');
        setSearchError('');
        if (query.length < 2) return;
        const timer = setTimeout(() => {
            void auth
                .rpc<Player[]>('search_bandai_players', { p_name: query })
                .then((rows) => {
                    if (live) {
                        setPlayers(rows);
                        setSearched(query);
                    }
                })
                .catch((failure) => {
                    if (live) setSearchError(failure.message);
                });
        }, 300);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [query, auth]);
    const needsLegal = state.config?.legal_ready && !state.legalCurrent;
    const normalize = (value: string) =>
        value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    const canCreate = !players.some(
        (player) =>
            normalize(player.name) === normalize(query) ||
            normalize(player.bandai_nick || '') === normalize(query)
    );
    const ready =
        query.length >= 2 &&
        searched === query &&
        !searchError &&
        (players.length === 0 || !!selected) &&
        (!needsLegal ||
            (declarations.termsAccepted && declarations.privacyRead && declarations.adultDeclared));
    return (
        <Dialog title="Vincule seu jogador" onClose={() => {}} dismissible={false} busy={busy}>
            <div className="site-account site-bandai-onboarding">
                <p>
                    Qual é seu nome no Bandai TCG+? Vamos conectar sua conta ao seu jogador e ao
                    histórico de torneios.
                </p>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!ready || busy || !state.profile) return;
                        setBusy(true);
                        setError('');
                        void (async () => {
                            if (needsLegal)
                                await auth.saveProfile(
                                    state.profile!.username,
                                    state.profile!.display_name,
                                    declarations
                                );
                            const player = players.find((row) => row.id === selected);
                            await auth.rpc('complete_my_player_link', {
                                p_bandai_name: player?.bandai_nick || player?.name || query,
                                p_player_id: player?.id || null
                            });
                            await auth.refresh();
                            if (!auth.getSnapshot().profile?.player_id)
                                throw Error(
                                    'Não foi possível confirmar o vínculo. Tente novamente.'
                                );
                            window.dispatchEvent(new Event('digistats:players-changed'));
                            onComplete();
                        })()
                            .catch((failure) => setError(failure.message))
                            .finally(() => setBusy(false));
                    }}
                >
                    <label>
                        Nome no Bandai TCG+
                        <input
                            autoComplete="nickname"
                            minLength={2}
                            maxLength={100}
                            required
                            value={name}
                            disabled={busy}
                            onChange={(event) => {
                                setName(event.target.value);
                                setSelected('');
                            }}
                        />
                    </label>
                    {query.length >= 2 && searched !== query && !searchError && (
                        <p role="status">Buscando seu jogador…</p>
                    )}
                    {searchError && <p role="alert">{searchError}</p>}
                    {searched === query && players.length > 0 && (
                        <fieldset className="site-bandai-results" disabled={busy}>
                            <legend>Selecione seu jogador</legend>
                            {players.map((player) => (
                                <label key={player.id} className="site-bandai-option">
                                    <input
                                        type="radio"
                                        name="bandai_player"
                                        value={player.id}
                                        checked={selected === player.id}
                                        disabled={!player.available}
                                        onChange={() => setSelected(player.id)}
                                    />
                                    <span>
                                        <strong>{player.bandai_nick || player.name}</strong>
                                        {player.bandai_nick &&
                                            player.bandai_nick !== player.name && (
                                                <small>{player.name}</small>
                                            )}
                                        {!player.available && (
                                            <small>Já vinculado a outra conta</small>
                                        )}
                                    </span>
                                </label>
                            ))}
                            {canCreate && (
                                <label className="site-bandai-option">
                                    <input
                                        type="radio"
                                        name="bandai_player"
                                        value="new"
                                        checked={selected === 'new'}
                                        onChange={() => setSelected('new')}
                                    />
                                    <span>
                                        Cadastrar novo jogador: <strong>{query}</strong>
                                    </span>
                                </label>
                            )}
                        </fieldset>
                    )}
                    {searched === query && players.length === 0 && (
                        <p className="muted">
                            Nenhum jogador encontrado. Vamos cadastrar “{query}” e vinculá-lo à sua
                            conta.
                        </p>
                    )}
                    {needsLegal && (
                        <LegalChecks
                            config={state.config}
                            value={declarations}
                            onChange={setDeclarations}
                        />
                    )}
                    {error && <p role="alert">{error}</p>}
                    <button className="button primary" disabled={busy || !ready || state.loading}>
                        {busy
                            ? 'Vinculando…'
                            : players.length === 0 || selected === 'new'
                              ? 'Cadastrar e continuar'
                              : 'Vincular e continuar'}
                    </button>
                </form>
                <button
                    type="button"
                    className="site-account-link"
                    disabled={busy}
                    onClick={() => {
                        setBusy(true);
                        void auth
                            .logout()
                            .then(onComplete)
                            .catch((failure) => setError(failure.message))
                            .finally(() => setBusy(false));
                    }}
                >
                    Sair da conta
                </button>
            </div>
        </Dialog>
    );
}
