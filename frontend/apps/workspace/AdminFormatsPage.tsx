import { useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import { Loader } from '../../shared/runtime';
import { useSiteAuth } from '../../shared/site-auth';
import { EmptyState } from '../../shared/ListPage';
import { textKey } from '../builder/editor-model';
import { DeckFormatForm } from './DeckFormatForm';
import { FormatPointsDialog } from './FormatPointsDialog';
import { setFormatPublication } from './format-status-service';
import { useAdminGameFormats } from './use-admin-game-formats';

export function AdminFormatsPage({ context }: { context: MicroContext }) {
    const auth = useSiteAuth();
    const {
        formats: allFormats,
        loading,
        error,
        refresh
    } = useAdminGameFormats(auth.isAdmin, auth.user?.id || '');
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState<Format | 'new' | null>(null);
    const [editingPoints, setEditingPoints] = useState<Format | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState('');
    const formats = (allFormats || []).filter((format) =>
        textKey(`${format.name} ${format.code}`).includes(textKey(query))
    );
    return (
        <section className="admin-game-formats" aria-label="Gerenciar formatos de jogo">
            <div className="admin-panel-header">
                <div>
                    <h2 className="admin-panel-title">Formatos de jogo</h2>
                    <p className="admin-panel-desc">
                        Cadastre formatos, configure as regras e gerencie a pontuação das cartas.
                    </p>
                </div>
                <button
                    className="button secondary"
                    disabled={saving !== null}
                    onClick={() => setEditing('new')}
                >
                    ＋ Novo formato de jogo
                </button>
            </div>
            <label className="admin-game-formats-search">
                Buscar formato
                <input
                    type="search"
                    placeholder="Buscar por nome ou código"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </label>
            {actionError && <p role="alert">{actionError}</p>}
            {notice && <p role="status">{notice}</p>}
            {loading ? (
                <Loader text="Carregando formatos…" />
            ) : error ? (
                <p role="alert">
                    {error}{' '}
                    <button className="button secondary" onClick={() => void refresh()}>
                        Tentar novamente
                    </button>
                </p>
            ) : (
                <div className="admin-game-formats-list">
                    {formats.map((format) => (
                        <article className="admin-game-format-row" key={format.id}>
                            <div>
                                <div className="admin-game-format-heading">
                                    <h3>{format.name}</h3>
                                    <span
                                        className={`admin-game-format-status ${format.rules_status === 'published' ? 'published' : 'draft'}`}
                                    >
                                        {format.rules_status === 'published'
                                            ? 'Publicado'
                                            : 'Rascunho'}
                                    </span>
                                </div>
                                <p className="muted">
                                    {format.code} ·{' '}
                                    {format.is_active === false ? 'Inativo' : 'Ativo'}
                                </p>
                            </div>
                            <div className="admin-game-format-actions">
                                <button
                                    className="button secondary"
                                    disabled={saving !== null}
                                    aria-label={
                                        format.rules_status === 'published'
                                            ? `Voltar ${format.name} para rascunho`
                                            : `Publicar formato ${format.name}`
                                    }
                                    onClick={async () => {
                                        setSaving(String(format.id));
                                        setActionError('');
                                        setNotice('');
                                        try {
                                            const status =
                                                format.rules_status === 'published'
                                                    ? 'draft'
                                                    : 'published';
                                            await setFormatPublication(format.id, status);
                                            await refresh();
                                            await context.data.refresh();
                                            setNotice(
                                                `${format.name} ${status === 'draft' ? 'voltou para rascunho' : 'foi publicado'}. Regras e pontuação foram preservadas.`
                                            );
                                        } catch (error) {
                                            setActionError((error as Error).message);
                                        } finally {
                                            setSaving(null);
                                        }
                                    }}
                                >
                                    {saving === String(format.id)
                                        ? 'Salvando…'
                                        : format.rules_status === 'published'
                                          ? 'Voltar para rascunho'
                                          : 'Publicar formato'}
                                </button>
                                {format.validation_rules?.points_limit != null && (
                                    <button
                                        className="button secondary"
                                        disabled={saving !== null}
                                        aria-label={`Editar pontuação ${format.name}`}
                                        onClick={() => setEditingPoints(format)}
                                    >
                                        Editar pontuação
                                    </button>
                                )}
                                <button
                                    className="button secondary"
                                    disabled={saving !== null}
                                    aria-label={`Editar formato ${format.name}`}
                                    onClick={() => setEditing(format)}
                                >
                                    Editar formato
                                </button>
                            </div>
                        </article>
                    ))}
                    {!formats.length && <EmptyState>Nenhum formato encontrado.</EmptyState>}
                </div>
            )}
            {editing && (
                <DeckFormatForm
                    context={context}
                    format={editing === 'new' ? null : editing}
                    onClose={() => {
                        setEditing(null);
                        void refresh();
                    }}
                />
            )}
            {editingPoints && (
                <FormatPointsDialog
                    context={context}
                    format={editingPoints}
                    onClose={() => {
                        setEditingPoints(null);
                        void refresh();
                    }}
                />
            )}
        </section>
    );
}
