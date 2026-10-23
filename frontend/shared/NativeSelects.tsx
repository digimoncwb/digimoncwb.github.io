import { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Select } from './Select';
import './native-selects.css';

/** Preserve native values, validation and legacy/React event handlers behind one menu. */
export function useNativeSelects() {
    useEffect(() => {
        const controls = new Map<
            HTMLSelectElement,
            {
                root: Root;
                mount: HTMLDivElement;
                signature: string;
                update(): void;
                invalid(event: Event): void;
            }
        >();
        function reconcile() {
            for (const [native, control] of controls) {
                if (!native.isConnected || !control.mount.isConnected) {
                    native.removeEventListener('change', control.update);
                    native.removeEventListener('invalid', control.invalid);
                    control.root.unmount();
                    control.mount.remove();
                    native.classList.remove('site-select-native');
                    controls.delete(native);
                }
            }
            for (const native of document.querySelectorAll<HTMLSelectElement>(
                'select:not([multiple])'
            )) {
                if (native.size > 1 || controls.has(native)) continue;
                const mount = document.createElement('div');
                mount.className = 'site-select-control';
                native.after(mount);
                native.classList.add('site-select-native');
                const root = createRoot(mount);
                const control = {
                    root,
                    mount,
                    signature: '',
                    invalid(event: Event) {
                        event.preventDefault();
                        mount.querySelector<HTMLButtonElement>('.format-select-trigger')?.focus();
                        mount
                            .querySelector<HTMLButtonElement>('.format-select-trigger')
                            ?.setAttribute('aria-invalid', 'true');
                    },
                    update() {
                        const labelElement = native.labels?.[0] || native.closest('label');
                        const labelCopy = labelElement?.cloneNode(true) as HTMLElement | undefined;
                        labelCopy
                            ?.querySelectorAll('select, .site-select-control')
                            .forEach((node) => node.remove());
                        const label =
                            native.getAttribute('aria-label') ||
                            labelCopy?.textContent?.trim() ||
                            native.title ||
                            'Selecionar opção';
                        const options = Array.from(native.options).map((option) => ({
                            value: option.value,
                            label: option.text,
                            disabled:
                                option.disabled ||
                                (option.parentElement instanceof HTMLOptGroupElement &&
                                    option.parentElement.disabled)
                        }));
                        const signature = JSON.stringify([
                            native.value,
                            native.disabled,
                            label,
                            options
                        ]);
                        if (signature === control.signature) return;
                        control.signature = signature;
                        root.render(
                            <Select
                                label={label}
                                options={options}
                                value={native.value}
                                disabled={native.disabled}
                                overlay
                                onChange={(value) => {
                                    native.value = value;
                                    native.dispatchEvent(new Event('input', { bubbles: true }));
                                    native.dispatchEvent(new Event('change', { bubbles: true }));
                                    mount
                                        .querySelector('.format-select-trigger')
                                        ?.removeAttribute('aria-invalid');
                                    control.update();
                                }}
                            />
                        );
                    }
                };
                controls.set(native, control);
                native.addEventListener('change', control.update);
                native.addEventListener('invalid', control.invalid);
                control.update();
            }
            for (const control of controls.values()) control.update();
        }
        const observer = new MutationObserver(reconcile);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'selected', 'label', 'value'],
            characterData: true
        });
        // Legacy integrations can assign .value without a DOM mutation or change event.
        const timer = window.setInterval(reconcile, 400);
        reconcile();
        return () => {
            observer.disconnect();
            window.clearInterval(timer);
            for (const [native, control] of controls) {
                native.removeEventListener('change', control.update);
                native.removeEventListener('invalid', control.invalid);
                control.root.unmount();
                control.mount.remove();
                native.classList.remove('site-select-native');
            }
        };
    }, []);
}
