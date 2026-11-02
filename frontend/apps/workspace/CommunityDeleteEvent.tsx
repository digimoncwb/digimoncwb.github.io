import { useState } from 'react';
import type { CommunityEvent } from '../../shared/community-service';
import { Dialog } from '../../shared/ListPage';

export function CommunityDeleteEvent({
    event,
    busy,
    error,
    onClose,
    onDelete
}: {
    event: CommunityEvent;
    busy: boolean;
    error: string;
    onClose(): void;
    onDelete(name: string): Promise<void>;
}) {
    const [name, setName] = useState('');
    return (
        <Dialog
            title="Excluir torneio definitivamente"
            busy={busy}
            onClose={onClose}
            closeOnBackdrop={false}
        >
            <form
                className="community-form"
                onSubmit={(submission) => {
                    submission.preventDefault();
                    if (!busy && name.trim() === event.name) void onDelete(name.trim());
                }}
            >
                <p>
                    A exclusão de <strong>{event.name}</strong> é permanente. Inscrições, rodadas,
                    partidas, auditoria e exportações deste evento serão removidas.
                </p>
                {event.canonical_tournament_id && (
                    <p>
                        O resultado oficial já importado do DigiLab continuará no histórico de
                        torneios.
                    </p>
                )}
                <label>
                    Digite o nome do torneio para confirmar
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="off"
                        required
                        disabled={busy}
                    />
                </label>
                {error && (
                    <p className="community-error" role="alert">
                        {error}
                    </p>
                )}
                <button
                    className="button secondary community-delete-button"
                    disabled={busy || name.trim() !== event.name}
                >
                    Excluir definitivamente
                </button>
            </form>
        </Dialog>
    );
}
