import { useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import { Dialog } from '../../shared/ListPage';
import { FormatRulesEditor } from './FormatRulesEditor';
import './format-admin.css';
export function DeckFormatForm({
    format,
    context,
    onClose
}: {
    format: Format | null;
    context: MicroContext;
    onClose(): void;
}) {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('');
    return (
        <Dialog
            title={format ? 'Editar formato de jogo' : 'Novo formato de jogo'}
            onClose={onClose}
            busy={busy}
            wide
        >
            <form
                className="deck-library-form deck-format-admin-form"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    const data = new FormData(e.currentTarget);
                    try {
                        const validation = String(data.get('validation') || '').trim();
                        const errors = String(data.get('validationErrors') || '');
                        if (errors) throw new Error(errors);
                        const rules = validation ? JSON.parse(validation) : null;
                        const payload = {
                            code: String(data.get('code') || format?.code || '')
                                .trim()
                                .toUpperCase(),
                            name: String(data.get('name') || '').trim(),
                            description: String(data.get('description') || '').trim() || null,
                            rules_text: String(data.get('rules') || '').trim() || null,
                            rules_url: String(data.get('url') || '').trim() || null,
                            validation_rules: rules,
                            is_community_highlight: data.has('highlight'),
                            is_active: data.has('active'),
                            rules_status: data.has('published') ? 'published' : 'draft',
                            change_note: String(data.get('changeNote') || '').trim() || null
                        };
                        if (!payload.name || !/^[A-Z0-9_-]{2,40}$/.test(payload.code))
                            throw new Error('Informe um nome e um código válido para o formato.');
                        const session = window.digistatsAdminSession;
                        if (!(await session.restore()))
                            throw new Error('Entre no Admin para gerenciar os formatos de jogo.');
                        await session.refresh();
                        await session.verify();
                        let revision: number | undefined;
                        if (format) {
                            const current = await session.request(
                                `/rest/v1/deck_formats?id=eq.${encodeURIComponent(format.id)}&select=validation_rules,rules_revision`,
                                { method: 'GET' }
                            );
                            if (!current.ok)
                                throw new Error(
                                    'Não foi possível conferir o formato antes de salvar.'
                                );
                            const [latest] = await current.json();
                            if (!latest)
                                throw new Error('Formato não encontrado. Reabra a edição.');
                            revision = latest.rules_revision;
                            // The independently managed registry always comes from the latest revision.
                            payload.validation_rules = {
                                ...rules,
                                card_points: latest.validation_rules?.card_points || {},
                                points_pending: latest.validation_rules?.points_pending || []
                            };
                        }
                        if (
                            payload.rules_status === 'published' &&
                            payload.validation_rules?.points_limit != null &&
                            payload.validation_rules?.points_pending?.length
                        )
                            throw new Error(
                                'Confira os códigos pendentes na lista de pontos antes de publicar.'
                            );
                        const response = await session.request(
                            `/rest/v1/deck_formats${format ? `?id=eq.${encodeURIComponent(format.id)}&rules_revision=eq.${revision}` : ''}`,
                            {
                                method: format ? 'PATCH' : 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Prefer: 'return=representation'
                                },
                                body: JSON.stringify(payload)
                            }
                        );
                        if (!response.ok) {
                            const body = await response.json().catch(() => ({}));
                            throw new Error(
                                response.status === 403
                                    ? 'Somente administradores podem alterar formatos.'
                                    : body.message || 'Não foi possível salvar o formato.'
                            );
                        }
                        const rows = await response.json();
                        if (!rows.length)
                            throw new Error(
                                'O formato não foi alterado. Reabra a edição para conferir mudanças recentes e suas permissões.'
                            );
                        await context.data.refresh();
                        onClose();
                    } catch (e) {
                        setError((e as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <p className="muted">
                    Formatos de jogo definem regras. Coleções de cartas, como BT e EX, continuam no
                    catálogo e no histórico dos torneios.
                </p>
                <label>
                    Nome
                    <input name="name" defaultValue={format?.name || ''} required maxLength={120} />
                </label>
                <label>
                    Código
                    <input
                        name="code"
                        defaultValue={format?.code || ''}
                        required
                        pattern="[A-Za-z0-9_-]{2,40}"
                        readOnly={!!format}
                    />
                </label>
                <label>
                    Descrição
                    <textarea
                        name="description"
                        defaultValue={format?.description || ''}
                        rows={2}
                    />
                </label>
                <label>
                    Regulamento
                    <textarea name="rules" defaultValue={format?.rules_text || ''} rows={7} />
                </label>
                <label>
                    Link do regulamento
                    <input
                        name="url"
                        type="url"
                        defaultValue={format?.rules_url || ''}
                        placeholder="https://"
                    />
                </label>
                <FormatRulesEditor initial={format?.validation_rules} context={context} />
                <label>
                    Descrição desta alteração
                    <input
                        name="changeNote"
                        placeholder="O que mudou no regulamento"
                        maxLength={1000}
                    />
                </label>
                <label className="format-inline-check">
                    <input
                        type="checkbox"
                        name="published"
                        defaultChecked={format?.rules_status === 'published'}
                    />{' '}
                    Regulamento publicado e validação ativa
                </label>
                <label className="format-inline-check">
                    <input
                        type="checkbox"
                        name="active"
                        defaultChecked={format?.is_active !== false}
                    />{' '}
                    Formato ativo
                </label>
                <label className="format-inline-check">
                    <input
                        type="checkbox"
                        name="highlight"
                        defaultChecked={format?.is_community_highlight || false}
                    />{' '}
                    Destacar como formato da comunidade
                </label>
                {error && <p role="alert">{error}</p>}
                <button className="button primary" disabled={busy}>
                    {busy ? 'Salvando…' : 'Salvar formato'}
                </button>
            </form>
        </Dialog>
    );
}
