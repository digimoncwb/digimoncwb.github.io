import type { SiteAuthConfig, SiteLegalDeclarations } from '../contracts';

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
    const safe = (url?: string | null) => (url && /^https:\/\//.test(url) ? url : undefined);
    if (!config?.legal_ready || !safe(config.terms_url) || !safe(config.privacy_url))
        return (
            <p>
                Os aceites serão liberados após a publicação dos termos e do aviso de privacidade.
            </p>
        );
    return (
        <fieldset className="site-legal-checks">
            <legend>Documentos e condição de cadastro</legend>
            <label className="site-account-check">
                <input
                    type="checkbox"
                    required
                    checked={value.termsAccepted}
                    onChange={(e) => onChange({ ...value, termsAccepted: e.target.checked })}
                />
                <span>
                    Li e aceito os{' '}
                    <a href={safe(config.terms_url)} target="_blank" rel="noopener noreferrer">
                        Termos de Uso
                    </a>{' '}
                    (versão {config.terms_version}).
                </span>
            </label>
            <label className="site-account-check">
                <input
                    type="checkbox"
                    required
                    checked={value.privacyRead}
                    onChange={(e) => onChange({ ...value, privacyRead: e.target.checked })}
                />
                <span>
                    Li o{' '}
                    <a href={safe(config.privacy_url)} target="_blank" rel="noopener noreferrer">
                        Aviso de Privacidade
                    </a>{' '}
                    (versão {config.privacy_version}).
                </span>
            </label>
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
