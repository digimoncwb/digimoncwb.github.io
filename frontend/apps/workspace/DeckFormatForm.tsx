import { useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import { Dialog } from '../../shared/ListPage';
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
                className="deck-library-form"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    const data = new FormData(e.currentTarget);
                    try {
                        const validation = String(data.get('validation') || '').trim();
                        const payload = {
                            code: String(data.get('code') || format?.code || '')
                                .trim()
                                .toUpperCase(),
                            name: String(data.get('name') || '').trim(),
                            description: String(data.get('description') || '').trim() || null,
                            rules_text: String(data.get('rules') || '').trim() || null,
                            rules_url: String(data.get('url') || '').trim() || null,
                            validation_rules: validation ? JSON.parse(validation) : null,
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
                        const response = await session.request(
                            `/rest/v1/deck_formats${format ? `?id=eq.${encodeURIComponent(format.id)}` : ''}`,
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
                                'O formato não foi alterado. Verifique suas permissões.'
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
                <details>
                    <summary>Regras de validação específicas</summary>
                    <p className="muted">
                        Preencha as quantidades para publicar. Use JSON para definir main_count,
                        egg_max, copies, banned_codes, limited_cards, unlimited_codes,
                        allowed_colors, allowed_sets ou choice_groups.
                    </p>
                    <label>
                        Configuração de validação
                        <textarea
                            name="validation"
                            defaultValue={
                                format?.validation_rules
                                    ? JSON.stringify(format.validation_rules, null, 2)
                                    : ''
                            }
                            rows={9}
                        />
                    </label>
                </details>
                <label>
                    Descrição desta alteração
                    <input
                        name="changeNote"
                        placeholder="O que mudou no regulamento"
                        maxLength={1000}
                    />
                </label>
                <label>
                    <input
                        type="checkbox"
                        name="published"
                        defaultChecked={format?.rules_status === 'published'}
                    />{' '}
                    Regulamento publicado e validação ativa
                </label>
                <label>
                    <input
                        type="checkbox"
                        name="active"
                        defaultChecked={format?.is_active !== false}
                    />{' '}
                    Formato ativo
                </label>
                <label>
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
