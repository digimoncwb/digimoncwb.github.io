import { useEffect, useRef, useState } from 'react';
import type { Format, MicroContext } from '../../contracts';
import type { FormatRules } from '../builder/editor-model';
import { Dialog } from '../../shared/ListPage';
import { Loader } from '../../shared/runtime';
import { FormatPointsEditor } from './FormatPointsEditor';
import { savePointChanges, type PointAddition } from './format-points-service';
import './format-admin.css';

export function FormatPointsDialog({
    format,
    context,
    onClose
}: {
    format: Format;
    context: MicroContext;
    onClose(): void;
}) {
    const [rules, setRules] = useState<FormatRules | null>(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        setRules(null);
        (async () => {
            const session = window.digistatsAdminSession;
            if (!(await session.restore()))
                throw new Error('Entre no Admin para editar a pontuação.');
            await session.refresh();
            await session.verify();
            const response = await session.request(
                `/rest/v1/deck_formats?id=eq.${encodeURIComponent(format.id)}&select=validation_rules`,
                { method: 'GET', signal: controller.signal }
            );
            if (!response.ok) throw new Error('Não foi possível carregar a lista de pontos.');
            const [latest] = await response.json();
            if (latest?.validation_rules?.points_limit == null)
                throw new Error(
                    'Ative e salve a pontuação nas regras do formato antes de editar a lista.'
                );
            if (!controller.signal.aborted) setRules(latest.validation_rules);
        })().catch((error) => {
            if (!controller.signal.aborted) setError(error.message);
        });
        return () => controller.abort();
    }, [format.id, retry]);
    async function save(additions: PointAddition[], removedCodes: string[] = []) {
        saving.current = true;
        setBusy(true);
        try {
            await savePointChanges(format.id, additions, removedCodes);
            void context.data.refresh().catch(() => {});
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }
    return (
        <Dialog
            title={`Editar pontuação — ${format.name}`}
            closeLabel="Fechar"
            wide
            busy={busy}
            onClose={() => {
                if (!saving.current) onClose();
            }}
        >
            <div className="deck-library-form deck-format-admin-form format-points-dialog">
                <p className="muted">
                    Adicione cartas, importe uma lista ou altere os pontos por cópia. As alterações
                    são salvas automaticamente; ao editar um valor, pressione Enter ou saia do
                    campo.
                </p>
                {error ? (
                    <p role="alert">
                        {error}{' '}
                        <button
                            type="button"
                            className="button secondary"
                            onClick={() => setRetry((value) => value + 1)}
                        >
                            Tentar novamente
                        </button>
                    </p>
                ) : !rules ? (
                    <Loader text="Carregando lista de pontos…" />
                ) : (
                    <FormatPointsEditor
                        context={context}
                        initial={rules}
                        onAutoSavePoints={(additions) => save(additions)}
                        onRemovePoint={(code) => save([], [code])}
                    />
                )}
            </div>
        </Dialog>
    );
}
