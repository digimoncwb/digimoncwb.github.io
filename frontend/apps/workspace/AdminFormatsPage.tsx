import { useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import { useData, Loader } from '../../shared/runtime';
import { EmptyState } from '../../shared/ListPage';
import { textKey } from '../builder/editor-model';
import { DeckFormatForm } from './DeckFormatForm';

export function AdminFormatsPage({ context }: { context: MicroContext }) {
    const { data, loading, error } = useData(context.data);
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState<Format | 'new' | null>(null);
    const formats = (data.deckFormats || []).filter((format) =>
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
                <button className="button secondary" onClick={() => setEditing('new')}>
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
            {loading ? (
                <Loader text="Carregando formatos…" />
            ) : error ? (
                <p role="alert">{error}</p>
            ) : (
                <div className="admin-game-formats-list">
                    {formats.map((format) => (
                        <article className="admin-game-format-row" key={format.id}>
                            <div>
                                <h3>{format.name}</h3>
                                <p className="muted">
                                    {format.code} ·{' '}
                                    {format.is_active === false ? 'Inativo' : 'Ativo'} ·{' '}
                                    {format.rules_status === 'published' ? 'Publicado' : 'Rascunho'}
                                </p>
                            </div>
                            <button
                                className="button secondary"
                                aria-label={`Editar formato ${format.name}`}
                                onClick={() => setEditing(format)}
                            >
                                Editar formato
                            </button>
                        </article>
                    ))}
                    {!formats.length && <EmptyState>Nenhum formato encontrado.</EmptyState>}
                </div>
            )}
            {editing && (
                <DeckFormatForm
                    context={context}
                    format={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                />
            )}
        </section>
    );
}
