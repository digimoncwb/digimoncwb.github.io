import { useEffect, useState } from 'react';
import type { SiteAuth } from '../contracts';

type Job = { id: string; stage: string; public_data_action: string; error_code: string | null };
export function AccountErasure({
    auth,
    requestId,
    onBusy,
    onCompleted
}: {
    auth: SiteAuth;
    requestId: string;
    onBusy(value: boolean): void;
    onCompleted(): void;
}) {
    const [job, setJob] = useState<Job | null>(null);
    const [action, setAction] = useState('anonymize_linked_player');
    const [reason, setReason] = useState('');
    const [reviewed, setReviewed] = useState(false);
    const [external, setExternal] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let live = true;
        void auth
            .request(
                `/rest/v1/site_account_erasure_jobs?request_id=eq.${encodeURIComponent(requestId)}&select=id,stage,public_data_action,error_code`
            )
            .then(async (response) => {
                if (!response.ok) throw Error('Não foi possível carregar o procedimento.');
                const rows = await response.json();
                if (live) setJob(rows[0] || null);
            })
            .catch((error) => {
                if (live) setError(error.message);
            });
        return () => {
            live = false;
        };
    }, [auth, requestId, revision]);
    async function run(task: () => Promise<void>) {
        setBusy(true);
        onBusy(true);
        setError('');
        try {
            await task();
            setRevision((value) => value + 1);
        } catch (error) {
            setError((error as Error).message);
        } finally {
            setBusy(false);
            onBusy(false);
        }
    }
    return (
        <section>
            <h4>Procedimento de eliminação</h4>
            <p>
                Primeiro valide a identidade e os registros envolvidos. A preparação encerra a
                conta, remove a administração e desidentifica o perfil. Os decks ficam sob gestão
                administrativa; resultados e IDs históricos são preservados. A auditoria continua
                sujeita à retenção aprovada.
            </p>
            {error && <p role="alert">{error}</p>}
            {!job ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (
                            !window.confirm(
                                'Preparar a eliminação desta conta? O perfil será desidentificado e a conta encerrada. Esta ação não pode ser desfeita pelo painel.'
                            )
                        )
                            return;
                        void run(async () => {
                            await auth.rpc('admin_prepare_account_erasure', {
                                p_request_id: requestId,
                                p_public_data_action: action,
                                p_reason: reason,
                                p_reviewed: reviewed
                            });
                        });
                    }}
                >
                    <label>
                        Histórico público
                        <select value={action} onChange={(e) => setAction(e.target.value)}>
                            <option value="anonymize_linked_player">
                                Desidentificar também o jogador vinculado
                            </option>
                            <option value="preserve_reviewed_history">
                                Preservar identificação no histórico com justificativa específica
                            </option>
                        </select>
                    </label>
                    <label>
                        Justificativa da decisão
                        <textarea
                            required
                            minLength={10}
                            maxLength={500}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </label>
                    <label className="site-account-check">
                        <input
                            type="checkbox"
                            required
                            checked={reviewed}
                            onChange={(e) => setReviewed(e.target.checked)}
                        />
                        Validei a titularidade, os registros e a decisão sobre o histórico público.
                    </label>
                    <button className="button secondary" disabled={busy || !reviewed}>
                        Preparar eliminação
                    </button>
                </form>
            ) : (
                <>
                    <p>
                        Etapa:{' '}
                        {
                            (
                                {
                                    prepared: 'perfil desidentificado; credenciais pendentes',
                                    failed: 'remoção de credenciais não confirmada',
                                    auth_deleted: 'credenciais removidas; revisão externa pendente',
                                    completed: 'atendimento concluído'
                                } as Record<string, string>
                            )[job.stage]
                        }
                    </p>
                    {['prepared', 'failed'].includes(job.stage) && (
                        <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => {
                                if (
                                    !window.confirm(
                                        'Remover definitivamente as credenciais desta conta no Supabase Auth? Revise antes os arquivos de Storage pertencentes à conta.'
                                    )
                                )
                                    return;
                                void run(async () => {
                                    const response = await auth.request(
                                        '/functions/v1/erase-site-account',
                                        {
                                            method: 'POST',
                                            body: JSON.stringify({
                                                job_id: job.id,
                                                confirm_delete_credentials: true
                                            })
                                        }
                                    );
                                    const result = await response.json();
                                    if (!response.ok)
                                        throw Error(result.error || 'Remoção não confirmada.');
                                });
                            }}
                        >
                            Remover credenciais no provedor
                        </button>
                    )}
                    {job.stage === 'auth_deleted' && (
                        <>
                            <label className="site-account-check">
                                <input
                                    type="checkbox"
                                    checked={external}
                                    onChange={(e) => setExternal(e.target.checked)}
                                />
                                Revisei mensagens de suporte, arquivos, fontes de importação e
                                cópias externas; documentei eventual conservação e como reaplicar o
                                pedido após restauração.
                            </label>
                            <button
                                className="button secondary"
                                disabled={busy || !external}
                                onClick={() =>
                                    void run(async () => {
                                        await auth.rpc('admin_complete_account_erasure', {
                                            p_job_id: job.id,
                                            p_external_reviewed: external
                                        });
                                        onCompleted();
                                    })
                                }
                            >
                                Concluir atendimento
                            </button>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
