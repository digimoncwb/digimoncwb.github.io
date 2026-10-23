(function setAppVersion() {
    window.APP_VERSION = '2026.10.23.34';
})();

(function initThemeToggle() {
    if (window.DIGISTATS_MICRO_FRONTENDS) return;
    const STORAGE_KEY = 'digistats-theme';
    const THEME_LIGHT = 'light';
    const THEME_DARK = 'dark';

    function normalizeTheme(theme) {
        return theme === THEME_LIGHT ? THEME_LIGHT : THEME_DARK;
    }

    function getStoredTheme() {
        try {
            return normalizeTheme(localStorage.getItem(STORAGE_KEY));
        } catch (_) {
            return THEME_DARK;
        }
    }

    function persistTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, normalizeTheme(theme));
        } catch (_) {
            // Ignore localStorage errors (private mode, blocked storage, etc.)
        }
    }

    function applyTheme(theme) {
        const resolvedTheme = normalizeTheme(theme);
        if (!document.body) return;

        document.body.setAttribute('data-theme', resolvedTheme);
        document.documentElement.setAttribute('data-theme', resolvedTheme);

        const toggle = document.getElementById('themeToggleBtn');
        if (toggle) {
            toggle.setAttribute('data-theme', resolvedTheme);
            toggle.setAttribute('aria-pressed', String(resolvedTheme === THEME_DARK));
            toggle.setAttribute(
                'title',
                resolvedTheme === THEME_DARK ? 'Ativar tema claro' : 'Ativar tema escuro'
            );
        }
    }

    function createToggleButton() {
        if (!document.body || document.getElementById('themeToggleBtn')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'themeToggleBtn';
        button.className = 'theme-toggle-btn';
        button.setAttribute('aria-label', 'Alternar tema');

        button.innerHTML = `
            <span class="theme-toggle-icon theme-toggle-icon-sun" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="4"></circle>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
                </svg>
            </span>
            <span class="theme-toggle-icon theme-toggle-icon-moon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
                </svg>
            </span>
        `;

        button.addEventListener('click', () => {
            const activeTheme = normalizeTheme(document.body?.getAttribute('data-theme'));
            const nextTheme = activeTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK;
            applyTheme(nextTheme);
            persistTheme(nextTheme);
        });

        document.body.appendChild(button);
    }

    function startThemeSystem() {
        const theme = getStoredTheme();
        applyTheme(theme);
        createToggleButton();
        applyTheme(theme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startThemeSystem);
    } else {
        startThemeSystem();
    }
})();
