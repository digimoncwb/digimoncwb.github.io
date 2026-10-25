import type { SiteAuthConfig, SiteLegalDeclarations } from '../contracts';
import { useState } from 'react';
import { LegalDocument } from './LegalDocument';

export const uncheckedDeclarations: SiteLegalDeclarations = {
    termsAccepted: false,
    privacyRead: false,
    adultDeclared: false
};
export function LegalChecks({
    config,
    value,
    onChange
}: {
    config: SiteAuthConfig | null;
    value: SiteLegalDeclarations;
    onChange(value: SiteLegalDeclarations): void;
}) {
    const [reading, setReading] = useState<'terms' | 'privacy' | null>(null);
    const safe = (url?: string | null) => (url && /^https:\/\//.test(url) ? url : undefined);
    if (!config?.legal_ready || !safe(config.terms_url) || !safe(config.privacy_url))
        return (
            <p>
                Os aceites serão liberados após a publicação dos termos e do aviso de privacidade.
            </p>
        );
    return (
        <fieldset className="site-legal-checks">
            <legend>Termos e privacidade</legend>
            <div className="site-legal-option">
                <details
                    className="site-legal-document"
                    open={reading === 'terms'}
                    onToggle={(event) => {
                        const open = event.currentTarget.open;
                        setReading((current) =>
                            open ? 'terms' : current === 'terms' ? null : current
                        );
                    }}
                >
                    <summary>Ler os Termos de Uso</summary>
                    {reading === 'terms' && (
                        <LegalDocument
                            kind="terms"
                            version={config.terms_version!}
                            url={config.terms_url!}
                        />
                    )}
                </details>
                <label className="site-account-check">
                    <input
                        type="checkbox"
                        required
                        checked={value.termsAccepted}
                        onChange={(e) => onChange({ ...value, termsAccepted: e.target.checked })}
                    />
                    <span>Li e aceito os Termos de Uso.</span>
                </label>
            </div>
            <div className="site-legal-option">
                <details
                    className="site-legal-document"
                    open={reading === 'privacy'}
                    onToggle={(event) => {
                        const open = event.currentTarget.open;
                        setReading((current) =>
                            open ? 'privacy' : current === 'privacy' ? null : current
                        );
                    }}
                >
                    <summary>Ler o Aviso de Privacidade</summary>
                    {reading === 'privacy' && (
                        <LegalDocument
                            kind="privacy"
                            version={config.privacy_version!}
                            url={config.privacy_url!}
                        />
                    )}
                </details>
                <label className="site-account-check">
                    <input
                        type="checkbox"
                        required
                        checked={value.privacyRead}
                        onChange={(e) => onChange({ ...value, privacyRead: e.target.checked })}
                    />
                    <span>Li e estou ciente do Aviso de Privacidade.</span>
                </label>
            </div>
            <label className="site-account-check">
                <input
                    type="checkbox"
                    required
                    checked={value.adultDeclared}
                    onChange={(e) => onChange({ ...value, adultDeclared: e.target.checked })}
                />
                <span>Declaro que tenho 18 anos ou mais.</span>
            </label>
            <small>
                Contas de menores não estão disponíveis nesta versão. A declaração não é uma
                comprovação independente de idade.
            </small>
        </fieldset>
    );
}
