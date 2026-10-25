import { useEffect, useState } from 'react';

export function LegalDocument({
    kind,
    version,
    url
}: {
    kind: 'terms' | 'privacy';
    version: string;
    url: string;
}) {
    const [body, setBody] = useState('');
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setBody('');
        setError('');
        void (async () => {
            const response = await window.digistatsAuth!.request(
                `/rest/v1/site_legal_documents?kind=eq.${kind}&version=eq.${encodeURIComponent(version)}&select=body,url&limit=1`,
                { signal: controller.signal }
            );
            if (!response.ok) throw Error('Não foi possível carregar o documento.');
            const rows = await response.json();
            if (rows.length !== 1 || rows[0].url !== url || typeof rows[0].body !== 'string')
                throw Error('Esta versão do documento não está disponível.');
            if (!controller.signal.aborted) setBody(rows[0].body);
        })().catch((error) => {
            if (!controller.signal.aborted) setError(error.message);
        });
        return () => controller.abort();
    }, [kind, version, url, retry]);
    return (
        <div className="site-legal-reader">
            {!body && !error && <p role="status">Carregando documento…</p>}
            {error && (
                <p role="alert">
                    {error}{' '}
                    <button
                        type="button"
                        className="text-action"
                        onClick={() => setRetry((value) => value + 1)}
                    >
                        Tentar novamente
                    </button>
                </p>
            )}
            {body && (
                <div
                    className="site-legal-body"
                    tabIndex={0}
                    aria-label={
                        kind === 'terms'
                            ? 'Texto dos Termos de Uso'
                            : 'Texto do Aviso de Privacidade'
                    }
                >
                    {body}
                </div>
            )}
            <a href={url} target="_blank" rel="noopener noreferrer">
                Abrir em outra aba
            </a>
        </div>
    );
}
