import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Present the existing import/save workflow in steps without moving its inputs. */
export function TournamentSteps({ mode, token }: { mode: 'create' | 'edit'; token: number }) {
    const [hosts, setHosts] = useState<{
        form: HTMLFormElement;
        top: HTMLDivElement;
        bottom: HTMLDivElement;
    } | null>(null);
    const [step, setStep] = useState(0),
        [error, setError] = useState(''),
        [revision, setRevision] = useState(0);
    useEffect(() => {
        setStep(0);
        setError('');
        let attached: typeof hosts = null;
        function attach() {
            const form = document.getElementById(`${mode}TournamentForm`) as HTMLFormElement | null;
            if (!form?.querySelector('.tournament-general-section') || attached) return;
            const top = document.createElement('div'),
                bottom = document.createElement('div');
            top.className = 'react-tournament-steps';
            bottom.className = 'react-tournament-step-actions';
            form.prepend(top);
            form.querySelector(':scope > .modal-actions')?.prepend(bottom);
            form.dataset.step = '0';
            attached = { form, top, bottom };
            setHosts(attached);
        }
        const observer = new MutationObserver(attach);
        const root = document.getElementById('v2Tools');
        if (root) observer.observe(root, { subtree: true, childList: true });
        attach();
        return () => {
            observer.disconnect();
            if (attached) {
                delete attached.form.dataset.step;
                attached.top.remove();
                attached.bottom.remove();
            }
        };
    }, [mode, token]);
    useEffect(() => {
        if (!hosts) return;
        hosts.form.dataset.step = String(step);
        hosts.form.scrollTop = 0;
        const update = () => setRevision((value) => value + 1);
        const submit = (event: Event) => {
            if (step === 2) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            advance(step + 1);
        };
        hosts.form.addEventListener('change', update);
        hosts.form.addEventListener('submit', submit, true);
        return () => {
            hosts.form.removeEventListener('change', update);
            hosts.form.removeEventListener('submit', submit, true);
        };
    }, [hosts, step]);
    if (!hosts) return null;
    function advance(target: number) {
        if (target > step) {
            const scope = hosts!.form.querySelector(
                step === 0 ? '.tournament-general-section' : '.tournament-results-section'
            );
            const inputs =
                scope?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select') ||
                [];
            for (const input of inputs)
                if (!input.checkValidity()) {
                    input.reportValidity();
                    return;
                }
            if (step === 1 && !hosts!.form.querySelector('.result-row')) {
                setError('Adicione pelo menos um jogador à classificação.');
                return;
            }
        }
        setError('');
        setStep(target);
    }
    const value = (id: string) => {
        const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        return input instanceof HTMLSelectElement
            ? input.selectedOptions[0]?.text || '—'
            : input?.value || '—';
    };
    const rows = hosts.form.querySelectorAll('.result-row');
    return (
        <>
            {createPortal(
                <>
                    <nav aria-label="Etapas do torneio">
                        {['Evento', 'Participantes e resultados', 'Revisão'].map((label, index) => (
                            <button
                                type="button"
                                key={label}
                                disabled={index > step + 1}
                                className={step === index ? 'is-active' : ''}
                                aria-current={step === index ? 'step' : undefined}
                                onClick={() => advance(index)}
                            >
                                <span>{index + 1}</span>
                                {label}
                            </button>
                        ))}
                    </nav>
                    {step === 2 && (
                        <div className="react-tournament-review" data-revision={revision}>
                            <h3>Confira antes de salvar</h3>
                            <dl>
                                {[
                                    ['Loja', value(`${mode}StoreSelect`)],
                                    ['Data', value(`${mode}TournamentDate`)],
                                    ['Tipo', value(`${mode}TournamentName`)],
                                    ['Formato', value(`${mode}TournamentFormat`)],
                                    [
                                        'Resultados',
                                        value(`${mode}TournamentName`).startsWith('2v2')
                                            ? `${rows.length / 2} duplas · ${rows.length} jogadores`
                                            : `${rows.length} jogadores`
                                    ]
                                ].map(([label, text]) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>{text}</dd>
                                    </div>
                                ))}
                            </dl>
                            <ol>
                                {Array.from(rows).map((row, index) => (
                                    <li
                                        key={index}
                                        value={
                                            hosts.form.dataset.team === 'true'
                                                ? Math.floor(index / 2) + 1
                                                : index + 1
                                        }
                                    >
                                        {row.querySelector<HTMLInputElement>('.player-input')
                                            ?.value || `Jogador ${index + 1}`}
                                        <span>
                                            {row.querySelector<HTMLInputElement>('.deck-input')
                                                ?.value || 'Deck não informado'}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                    {error && <p role="alert">{error}</p>}
                </>,
                hosts.top
            )}
            {createPortal(
                <>
                    {step > 0 && (
                        <button
                            type="button"
                            className="button secondary"
                            onClick={() => advance(step - 1)}
                        >
                            ← Anterior
                        </button>
                    )}
                    {step < 2 && (
                        <button
                            type="button"
                            className="button primary"
                            onClick={() => advance(step + 1)}
                        >
                            {step === 0 ? 'Participantes e resultados →' : 'Revisar →'}
                        </button>
                    )}
                </>,
                hosts.bottom
            )}
        </>
    );
}
