import { useEffect, useState } from 'react';
import type { SiteAuth } from '../contracts';

type Health = {
    severity: string;
    checked_at: string;
    missing_triggers: number;
    failed_integrations_24h: number;
    stalled_integrations: number;
    retention_job_active: boolean;
    last_retention_at: string | null;
    auth_log_source_available: boolean;
    api_log_ingestion_configured: boolean;
    external_alert_delivery_configured: boolean;
    provider_reviews: { source: string; reviewed_at: string }[];
    recent_checks: { checked_at: string; severity: string }[];
};
export function AuditHealth({ auth, onBusy }: { auth: SiteAuth; onBusy(value: boolean): void }) {
    const [health, setHealth] = useState<Health | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [source, setSource] = useState('auth');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let live = true;
        setError('');
        void auth
            .rpc<Health>('admin_site_audit_health')
            .then((value) => {
                if (live) setHealth(value);
            })
            .catch((error) => {
                if (live) setError(error.message);
            });
        return () => {
            live = false;
        };
    }, [auth, revision]);
    const date = (value: string | null) =>
        value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não registrada';
    return (
        <section>
            <h3>Saúde da auditoria</h3>
            {error && <p role="alert">Não foi possível verificar a coleta: {error}</p>}
            <button
                className="button secondary"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
            >
                Atualizar diagnóstico
            </button>
            {health && (
                <>
                    <p role={health.severity === 'ok' ? 'status' : 'alert'}>
                        Diagnóstico do banco:{' '}
                        {health.severity === 'ok'
                            ? 'sem falhas detectadas'
                            : health.severity === 'critical'
                              ? 'falha crítica detectada'
                              : 'requer atenção'}{' '}
                        · {date(health.checked_at)}
                    </p>
                    <dl>
                        <dt>Mecanismos de coleta ausentes</dt>
                        <dd>{health.missing_triggers}</dd>
                        <dt>Integrações com falha nas últimas 24 horas</dt>
                        <dd>{health.failed_integrations_24h}</dd>
                        <dt>Execuções sem conclusão há mais de 30 minutos</dt>
                        <dd>{health.stalled_integrations}</dd>
                        <dt>Agendamento de retenção</dt>
                        <dd>{health.retention_job_active ? 'Ativo' : 'Não detectado'}</dd>
                        <dt>Última aplicação de retenção</dt>
                        <dd>{date(health.last_retention_at)}</dd>
                    </dl>
                    <p>
                        Fonte de logs do Auth no banco:{' '}
                        {health.auth_log_source_available ? 'disponível' : 'não detectada'}. A
                        disponibilidade da tabela não comprova homologação dos fluxos de login.
                    </p>
                    {!health.api_log_ingestion_configured && (
                        <p>
                            Logs de recusas diretas da API: consulta no provedor; ingestão central
                            ainda não configurada.
                        </p>
                    )}
                    {!health.external_alert_delivery_configured && (
                        <p>
                            Notificações externas não configuradas. Os alertas deste painel não
                            detectam indisponibilidade do próprio banco; configure monitoramento
                            independente no provedor.
                        </p>
                    )}
                    <h4>Revisões manuais dos logs do provedor</h4>
                    {health.provider_reviews.length ? (
                        <ul>
                            {health.provider_reviews.map((review) => (
                                <li key={review.source}>
                                    {review.source.toUpperCase()}: {date(review.reviewed_at)}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Nenhuma revisão registrada.</p>
                    )}
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (busy) return;
                            setBusy(true);
                            onBusy(true);
                            setError('');
                            void auth
                                .rpc('admin_record_audit_provider_review', {
                                    p_source: source,
                                    p_note: note
                                })
                                .then(() => {
                                    setNote('');
                                    setRevision((value) => value + 1);
                                })
                                .catch((error) => setError(error.message))
                                .finally(() => {
                                    setBusy(false);
                                    onBusy(false);
                                });
                        }}
                    >
                        <label>
                            Fonte revisada
                            <select value={source} onChange={(e) => setSource(e.target.value)}>
                                <option value="auth">Autenticação</option>
                                <option value="api">API / gateway</option>
                            </select>
                        </label>
                        <label>
                            Referência da verificação realizada, sem segredos
                            <textarea
                                required
                                minLength={10}
                                maxLength={500}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </label>
                        <button className="button secondary" disabled={busy}>
                            Registrar revisão realizada
                        </button>
                    </form>
                    <details>
                        <summary>Verificações periódicas recentes</summary>
                        <ul>
                            {health.recent_checks.map((check) => (
                                <li key={check.checked_at}>
                                    {date(check.checked_at)} · {check.severity}
                                </li>
                            ))}
                        </ul>
                    </details>
                </>
            )}
        </section>
    );
}
