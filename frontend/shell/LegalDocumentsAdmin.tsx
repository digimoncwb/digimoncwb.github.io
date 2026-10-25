import { useState } from 'react';
import type { SiteAuth } from '../contracts';

export function LegalDocumentsAdmin({
    auth,
    onSaved,
    onBusy
}: {
    auth: SiteAuth;
    onSaved(): void;
    onBusy(value: boolean): void;
}) {
    const [kind, setKind] = useState('terms');
    const [version, setVersion] = useState('');
    const [url, setUrl] = useState('');
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    return (
        <section>
            <h3>Versões dos documentos publicados</h3>
            <p>
                Publique e revise o documento em HTTPS antes de registrar seu texto. A versão e o
                conteúdo são imutáveis. O registro não ativa as contas.
            </p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    onBusy(true);
                    setMessage('');
                    void (async () => {
                        const hash = await auth.rpc<string>('admin_register_site_legal_document', {
                            p_kind: kind,
                            p_version: version.trim(),
                            p_url: url.trim(),
                            p_body: body
                        });
                        setMessage(`Versão registrada. SHA-256: ${hash}`);
                        if (kind === 'terms')
                            await auth.rpc('admin_configure_site_terms', {
                                p_url: url.trim(),
                                p_version: version.trim()
                            });
                        await auth.refresh();
                        onSaved();
                    })()
                        .catch((error) => setMessage(error.message))
                        .finally(() => {
                            setBusy(false);
                            onBusy(false);
                        });
                }}
            >
                <label>
                    Documento
                    <select value={kind} onChange={(e) => setKind(e.target.value)}>
                        <option value="terms">Termos de uso</option>
                        <option value="privacy">Aviso de privacidade</option>
                    </select>
                </label>
                <label>
                    Versão
                    <input
                        required
                        maxLength={50}
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                    />
                </label>
                <label>
                    URL do documento publicado
                    <input
                        required
                        type="url"
                        pattern="https://.*"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                    />
                </label>
                <label>
                    Texto integral da versão publicada
                    <textarea
                        required
                        minLength={30}
                        maxLength={200000}
                        rows={7}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                    />
                </label>
                <button className="button secondary" disabled={busy}>
                    Registrar versão publicada
                </button>
                {kind === 'terms' && (
                    <button
                        type="button"
                        className="button secondary"
                        disabled={busy || !url || !version}
                        onClick={() => {
                            setBusy(true);
                            onBusy(true);
                            setMessage('');
                            void auth
                                .rpc('admin_configure_site_terms', {
                                    p_url: url.trim(),
                                    p_version: version.trim()
                                })
                                .then(async () => {
                                    await auth.refresh();
                                    onSaved();
                                    setMessage('Versão registrada selecionada como vigente.');
                                })
                                .catch((error) => setMessage(error.message))
                                .finally(() => {
                                    setBusy(false);
                                    onBusy(false);
                                });
                        }}
                    >
                        Selecionar versão já registrada
                    </button>
                )}
            </form>
            {message && <p role="status">{message}</p>}
        </section>
    );
}
