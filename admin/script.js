'use strict';

// ============================================================
// STATE
// ============================================================
let adminFormats = [];
let adminBanList = [];
let adminStores = [];
let adminWeeklySchedule = [];
let adminBanNameMap = {}; // card_code -> name, from ban_list.card_name
let adminBanListLoaded = false;
let adminFormatsLoaded = false;
let adminStoresLoaded = false;
let adminWeeklyScheduleLoaded = false;
let adminActiveTab = 'digilab';
const adminTabGroups = {
    digilab: 'import',
    formats: 'community',
    stores: 'community',
    banlist: 'cards',
    portraits: 'cards',
    datarepair: 'maintenance'
};
const adminListPages = {};

function labelAdminList(host) {
    const table = host.closest('table');
    if (!table) return;
    const labels = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent.trim());
    table.classList.add('admin-responsive-list');
    [...host.rows].forEach((row) => {
        if (row.cells.length !== labels.length) return;
        [...row.cells].forEach((cell, index) => {
            cell.dataset.label = labels[index];
        });
    });
}

function adminListPage(key, rows, render) {
    const host = document.getElementById(`admin${key}Body`);
    if (!host) return rows;
    let controls = document.getElementById(`admin${key}Controls`);
    if (!controls) {
        controls = document.createElement('div');
        controls.id = `admin${key}Controls`;
        controls.className = 'admin-list-controls';
        const hasSearch = key === 'BanList';
        const noun =
            key === 'Formats' ? 'coleção' : key === 'Digilab' ? 'torneio, loja ou formato' : 'loja';
        controls.innerHTML = `${hasSearch ? '' : `<input type="search" aria-label="Buscar ${noun}" placeholder="Buscar ${noun}…" />`}
            ${hasSearch || key === 'Digilab' ? '' : '<select aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>'}
            <span class="admin-list-count" role="status"></span><button type="button" class="btn-secondary" data-page="prev" aria-label="Página anterior">‹</button><button type="button" class="btn-secondary" data-page="next" aria-label="Próxima página">›</button>`;
        host.closest('.admin-table-wrapper').before(controls);
        controls.addEventListener('input', () => {
            adminListPages[key] = 1;
            render();
        });
        controls.addEventListener('click', (event) => {
            const direction = event.target.closest('[data-page]')?.dataset.page;
            if (!direction) return;
            adminListPages[key] = (adminListPages[key] || 1) + (direction === 'next' ? 1 : -1);
            render();
        });
    }
    const query = (controls.querySelector('input')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const status = controls.querySelector('select')?.value || 'all';
    const filtered = rows.filter(
        (row) =>
            (!query ||
                `${row.code || ''} ${row.name || ''} ${row.bandai_nick || ''} ${row.digilab_tournament_id || ''} ${row.store_name || ''} ${row.format || ''}`
                    .toLocaleLowerCase('pt-BR')
                    .includes(query)) &&
            (status === 'all' || (row.is_active !== false) === (status === 'active'))
    );
    const pages = Math.max(1, Math.ceil(filtered.length / 10));
    const page = Math.min(pages, Math.max(1, adminListPages[key] || 1));
    adminListPages[key] = page;
    controls.querySelector('.admin-list-count').textContent =
        `${filtered.length} registros · ${page}/${pages}`;
    controls.querySelector('[data-page="prev"]').disabled = page === 1;
    controls.querySelector('[data-page="next"]').disabled = page === pages;
    return filtered.slice((page - 1) * 10, page * 10);
}
const adminModalReturnFocus = new WeakMap();

function adminModalFocusable(modal) {
    return [
        ...modal.querySelectorAll(
            'button, input:not([type="hidden"]), select, textarea, a[href], [tabindex="0"]'
        )
    ].filter((element) => !element.disabled && element.getClientRects().length > 0);
}

function showAdminModal(modal, fieldId) {
    adminModalReturnFocus.set(modal, document.activeElement);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    (modal.querySelector(`#${fieldId}`) || adminModalFocusable(modal)[0])?.focus();
}

function hideAdminModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    const trigger = adminModalReturnFocus.get(modal);
    if (trigger?.isConnected) trigger.focus();
    adminModalReturnFocus.delete(modal);
}
let _banPreviewDebounceTimer = null;
let adminAuthSession = null;
let adminAuthProfile = null;
let adminDigilabInventory = [];
let adminDigilabPage = 1;
let adminDigilabLastPage = 1;
let adminDigilabLoaded = false;
let adminDigilabRequestInFlight = false;
let adminDigilabAutoLinkRunning = false;
let adminDigilabBulkSyncRunning = false;
let adminDigilabBulkSyncCancelRequested = false;
let adminDigilabDeckCatalogLoaded = false;
let adminDigilabDeckCatalog = null;
let adminDigilabDeckFilters = { query: '', status: 'all', family: 'all' };
const adminDigilabAutoLinkResults = new Map();
const adminDigilabPreviewCache = new Map();
const DIGILAB_AUTO_LINK_DELAY_MS = 1300;
const ADMIN_AUTH_STORAGE_KEY = 'digistats.admin.session';
const ADMIN_AUTH_DOMAIN = 'admin.digistats.local';

function notifyTournamentListChanged(tournamentId, source = 'digilab') {
    window.dispatchEvent(
        new CustomEvent('digistats:tournaments-changed', {
            detail: { tournamentId: Number(tournamentId) || null, source }
        })
    );
}

// ============================================================
// INIT / RESET (called by list-tournaments/script.js)
// ============================================================
window.initAdminPage = function () {
    adminFormats = [];
    adminBanList = [];
    adminStores = [];
    adminWeeklySchedule = [];
    adminBanListLoaded = false;
    adminFormatsLoaded = false;
    adminStoresLoaded = false;
    adminWeeklyScheduleLoaded = false;
    adminActiveTab = 'digilab';
    setupAdminActions();
    initializeAdminAuth();
};

window.resetAdminPage = function () {
    adminFormats = [];
    adminBanList = [];
    adminStores = [];
    adminWeeklySchedule = [];
    adminBanNameMap = {};
    adminBanListLoaded = false;
    adminFormatsLoaded = false;
    adminStoresLoaded = false;
    adminWeeklyScheduleLoaded = false;
    adminDigilabInventory = [];
    adminDigilabLoaded = false;
    adminDigilabBulkSyncCancelRequested = true;
    adminDigilabAutoLinkResults.clear();
    adminDigilabDeckCatalogLoaded = false;
    adminDigilabDeckCatalog = null;
    adminDigilabDeckFilters = { query: '', status: 'all', family: 'all' };
};

// ============================================================
// SETUP
// ============================================================
function setupAdminActions() {
    const container = document.getElementById('adminContainer');
    if (!container) return;

    // Tab switching
    const tabList = container.querySelector('.admin-tabs');
    tabList?.setAttribute('role', 'tablist');
    tabList?.setAttribute('aria-label', 'Ferramentas administrativas');
    container.querySelectorAll('[data-admin-tab]').forEach((btn) => {
        const tab = btn.dataset.adminTab;
        const panel = container.querySelector(`[data-admin-panel="${tab}"]`);
        btn.id = `admin-tab-${tab}`;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(tab === adminActiveTab));
        btn.tabIndex = tab === adminActiveTab ? 0 : -1;
        if (panel) {
            panel.id ||= `admin-panel-${tab}`;
            btn.setAttribute('aria-controls', panel.id);
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', btn.id);
        }
        btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
    });
    tabList?.addEventListener('keydown', (event) => {
        const tabs = [...tabList.querySelectorAll('[data-admin-tab]')].filter(
            (button) => !button.hidden
        );
        const index = tabs.indexOf(event.target);
        if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        switchAdminTab(tabs[next].dataset.adminTab);
        tabs[next].focus();
    });

    // Delegated clicks for all admin actions
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-admin-action]');
        if (!btn) return;
        const action = btn.dataset.adminAction;
        const id = btn.dataset.id ? Number(btn.dataset.id) : null;

        if (
            adminDigilabBulkSyncRunning &&
            action.startsWith('digilab-') &&
            action !== 'digilab-sync-linked'
        ) {
            setDigilabStatus(
                'Aguarde o lote terminar ou solicite a interrupção antes de executar outra ação.',
                true
            );
            return;
        }

        if (action === 'admin-group') {
            switchAdminTab(
                {
                    import: 'digilab',
                    community: 'stores',
                    cards: 'portraits',
                    maintenance: 'datarepair'
                }[btn.dataset.adminGroup]
            );
        }
        if (action === 'create-format') openFormatModal(null);
        if (action === 'edit-format') openFormatModal(id);
        if (action === 'set-default-format') setDefaultFormat(id);
        if (action === 'toggle-format-active') toggleFormatActive(id);
        if (action === 'delete-format') deleteFormat(id, btn.dataset.name);
        if (action === 'add-ban') openBanModal(null);
        if (action === 'edit-ban') openBanModal(btn.dataset.code);
        if (action === 'remove-ban') removeBanEntry(btn.dataset.code);
        if (action === 'close-format-modal') closeFormatModal();
        if (action === 'close-ban-modal') closeBanModal();
        if (action === 'browse-bucket-images') toggleBucketBrowser();
        if (action === 'select-bucket-image') selectBucketImage(btn.dataset.url, btn.dataset.path);
        if (action === 'clear-format-bg') clearFormatBackground();
        if (action === 'repair-check') runRepairCheck();
        if (action === 'repair-run') runRepairRun();
        if (action === 'download-cards') runDownloadCards();
        if (action === 'export-catalog') runExportCatalog();
        if (action === 'sync-cards-full') runSyncCardsFull();
        if (action === 'create-store') openStoreModal(null);
        if (action === 'edit-store') openStoreModal(btn.dataset.id);
        if (action === 'delete-store') deleteStore(btn.dataset.id, btn.dataset.name);
        if (action === 'close-store-modal') closeStoreModal();
        if (action === 'clear-store-logo') clearStoreLogo();
        if (action === 'browse-store-logos') toggleStoreBucketBrowser();
        if (action === 'select-store-logo') selectStoreLogo(btn.dataset.url);
        if (action === 'save-weekly-schedule') saveAdminWeeklySchedule();
        if (action === 'toggle-password') toggleAdminPassword(btn);
        if (action === 'change-password-open') openAdminPasswordModal();
        if (action === 'change-password-close') closeAdminPasswordModal();
        if (action === 'logout') logoutAdmin();
        if (action === 'digilab-health') testDigilabHealth();
        if (action === 'digilab-refresh') {
            adminDigilabAutoLinkResults.clear();
            adminDigilabPreviewCache.clear();
            loadDigilabInventory(adminDigilabPage, { runAutomation: true });
        }
        if (action === 'digilab-sync-linked') syncAllPendingDigilabTournaments(btn);
        if (action === 'digilab-run-background') runDigilabBackgroundAutomation(btn);
        if (action === 'digilab-history') loadDigilabSyncHistory();
        if (action === 'digilab-retry') runDigilabBackgroundAutomation(btn, Number(btn.dataset.id));
        if (action === 'digilab-preview-id') previewDigilabFromInput();
        if (action === 'digilab-preview') {
            previewDigilabTournament(Number(btn.dataset.id), btn.closest('tr'));
        }
        if (action === 'digilab-create-missing-players') {
            createMissingDigilabPlayers(Number(btn.dataset.id), btn);
        }
        if (action === 'digilab-import') {
            importDigilabTournament(Number(btn.dataset.id), btn);
        }
        if (action === 'digilab-verify') {
            verifyDigilabTournament(Number(btn.dataset.localId), Number(btn.dataset.id));
        }
        if (action === 'digilab-force-verify') {
            const confirmed = window.confirm(
                'Confirma o vínculo após revisar as divergências? O motivo será mantido no histórico da sincronização.'
            );
            if (confirmed) {
                verifyDigilabTournament(Number(btn.dataset.localId), Number(btn.dataset.id), {
                    forceMatch: true,
                    button: btn
                });
            }
        }
        if (action === 'digilab-decks-open') loadDigilabDeckCatalog(false);
        if (action === 'digilab-decks-sync') loadDigilabDeckCatalog(true);
        if (action === 'digilab-edit-local') editLocalDigilabCandidate(Number(btn.dataset.id));
        if (action === 'digilab-prev' && adminDigilabPage > 1) {
            loadDigilabInventory(adminDigilabPage - 1);
        }
        if (action === 'digilab-next' && adminDigilabPage < adminDigilabLastPage) {
            loadDigilabInventory(adminDigilabPage + 1);
        }
    });

    container.addEventListener('input', (e) => {
        if (e.target.matches('[data-digilab-deck-filter="query"]')) {
            adminDigilabDeckFilters.query = e.target.value;
            renderDigilabDeckCatalog();
        }
    });
    container.addEventListener('change', (e) => {
        const filter = e.target.dataset.digilabDeckFilter;
        if (filter === 'status' || filter === 'family') {
            adminDigilabDeckFilters[filter] = e.target.value;
            renderDigilabDeckCatalog();
        }
    });

    injectSyncCardsSection();

    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) loginForm.addEventListener('submit', loginAdmin);
    const passwordForm = document.getElementById('adminChangePasswordForm');
    if (passwordForm) passwordForm.addEventListener('submit', changeAdminPassword);
    container.addEventListener('keydown', (event) => {
        const modal = container.querySelector('.modal-overlay.active');
        if (!modal) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            const close = {
                adminChangePasswordModal: closeAdminPasswordModal,
                adminFormatModal: closeFormatModal,
                adminBanModal: closeBanModal,
                adminStoreModal: closeStoreModal
            }[modal.id];
            close?.();
        } else if (event.key === 'Tab') {
            const fields = adminModalFocusable(modal);
            const first = fields[0],
                last = fields[fields.length - 1];
            if (
                fields.length &&
                (event.shiftKey
                    ? document.activeElement === first
                    : document.activeElement === last)
            ) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        }
    });

    // Format form submit
    const formatForm = document.getElementById('adminFormatForm');
    if (formatForm) formatForm.addEventListener('submit', saveFormat);

    // Ban form submit
    const banForm = document.getElementById('adminBanForm');
    if (banForm) banForm.addEventListener('submit', saveBanEntry);

    // Store form submit
    const storeForm = document.getElementById('adminStoreForm');
    if (storeForm) storeForm.addEventListener('submit', saveStore);

    // Store logo file input
    const storeLogoFile = document.getElementById('adminStoreLogoFile');
    if (storeLogoFile) {
        storeLogoFile.addEventListener('change', async () => {
            const file = storeLogoFile.files[0];
            if (!file) return;
            const statusEl = document.getElementById('adminStoreLogoUploadStatus');
            if (statusEl) statusEl.textContent = 'Uploading…';
            try {
                const storeName = (
                    document.getElementById('adminStoreName')?.value.trim() || 'store'
                )
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '');
                const { url } = await uploadStoreLogo(file, storeName);
                setStoreLogoPreview(url);
                if (statusEl) statusEl.textContent = '';
            } catch (err) {
                if (statusEl) statusEl.textContent = `Upload error: ${err.message}`;
            }
        });
    }

    // Card code preview in ban modal
    const banCodeInput = document.getElementById('adminBanCardCode');
    if (banCodeInput) {
        banCodeInput.addEventListener('input', () => {
            updateBanCardPreview(banCodeInput.value.trim().toUpperCase());
        });
    }

    // Ban list search filter
    const banSearch = document.getElementById('adminBanListSearch');
    if (banSearch) {
        banSearch.addEventListener('input', () => {
            adminListPages.BanList = 1;
            renderAdminBanList();
        });
    }
}

function toggleAdminPassword(button) {
    const input = document.getElementById(button.dataset.passwordTarget || 'adminLoginPassword');
    if (!input) return;
    const shouldShow = input.type === 'password';
    input.type = shouldShow ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(shouldShow));
    button.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
    button.title = shouldShow ? 'Ocultar senha' : 'Mostrar senha';
    input.focus();
}

function switchAdminTab(tab) {
    if (!adminAuthSession || !adminAuthProfile) return;
    adminActiveTab = tab;
    const container = document.getElementById('adminContainer');
    if (!container) return;
    const group = adminTabGroups[tab];
    container.querySelectorAll('[data-admin-group]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.adminGroup === group));
    });
    const tabList = container.querySelector('.admin-tabs');
    if (tabList) tabList.hidden = group === 'import' || group === 'maintenance';
    container.querySelectorAll('[data-admin-tab]').forEach((btn) => {
        btn.hidden = adminTabGroups[btn.dataset.adminTab] !== group;
        btn.classList.toggle('is-active', btn.dataset.adminTab === tab);
        btn.setAttribute('aria-selected', String(btn.dataset.adminTab === tab));
        btn.tabIndex = btn.dataset.adminTab === tab ? 0 : -1;
    });
    container.querySelectorAll('[data-admin-panel]').forEach((panel) => {
        panel.classList.toggle('is-hidden', panel.dataset.adminPanel !== tab);
    });
    if (tab === 'stores' && !adminStoresLoaded) loadAdminStores();
    if (tab === 'digilab' && !adminDigilabLoaded) loadDigilabInventory(1);
}

// ============================================================
// ADMIN AUTH / DIGILAB
// ============================================================
async function initializeAdminAuth() {
    setAdminAuthView(false);
    const stored = sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (!stored) return;

    try {
        adminAuthSession = JSON.parse(stored);
        await refreshAdminSessionIfNeeded();
        adminAuthProfile = await loadAdminProfile();
        setAdminAuthView(true);
    } catch {
        clearAdminSession();
        setAdminAuthStatus('Sua sessão expirou. Entre novamente.', true);
    }
}

async function loginAdmin(event) {
    event.preventDefault();
    const passwordInput = document.getElementById('adminLoginPassword');
    const button = document.getElementById('adminLoginButton');
    const password = String(passwordInput?.value || '');
    if (!password) {
        setAdminAuthStatus('Senha de acesso inválida.', true);
        return;
    }

    if (button) button.disabled = true;
    setAdminAuthStatus('Entrando…');
    try {
        const config = getAdminConfig();
        const candidates = [await deriveAdminCredentialEmail(password)];
        const legacyUsername = password.trim().toLowerCase();
        if (/^[a-z0-9_-]{3,40}$/.test(legacyUsername)) {
            candidates.push(`${legacyUsername}@${ADMIN_AUTH_DOMAIN}`);
        }
        let payload = null;
        for (const email of [...new Set(candidates)]) {
            const response = await fetch(
                `${config.SUPABASE_URL}/auth/v1/token?grant_type=password`,
                {
                    method: 'POST',
                    headers: {
                        apikey: config.SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                }
            );
            const attempt = await response.json().catch(() => ({}));
            if (response.ok && attempt.access_token) {
                payload = attempt;
                break;
            }
        }
        if (!payload) throw new Error('Usuário ou senha inválidos.');

        adminAuthSession = payload;
        adminAuthProfile = await loadAdminProfile();
        persistAdminSession();
        if (passwordInput) passwordInput.value = '';
        setAdminAuthView(true);
    } catch (error) {
        clearAdminSession();
        setAdminAuthStatus(error.message || 'Não foi possível entrar.', true);
    } finally {
        if (button) button.disabled = false;
    }
}

async function deriveAdminCredentialEmail(password) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(password || ''))
    );
    const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    return `p-${hash.slice(0, 40)}@${ADMIN_AUTH_DOMAIN}`;
}

async function logoutAdmin() {
    try {
        if (adminAuthSession?.access_token) {
            const config = getAdminConfig();
            await fetch(`${config.SUPABASE_URL}/auth/v1/logout`, {
                method: 'POST',
                headers: {
                    apikey: config.SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${adminAuthSession.access_token}`
                }
            });
        }
    } finally {
        clearAdminSession();
        setAdminAuthView(false);
    }
}

function openAdminPasswordModal() {
    const modal = document.getElementById('adminChangePasswordModal');
    if (!modal || !adminAuthSession) return;
    showAdminModal(modal, 'adminCurrentPassword');
}

function closeAdminPasswordModal() {
    const modal = document.getElementById('adminChangePasswordModal');
    hideAdminModal(modal);
    ['adminCurrentPassword', 'adminNewPassword', 'adminConfirmPassword'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            input.type = 'password';
        }
    });
    document
        .querySelectorAll('#adminChangePasswordModal [data-admin-action="toggle-password"]')
        .forEach((button) => {
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', 'Mostrar senha');
            button.title = 'Mostrar senha';
        });
    setAdminPasswordStatus('');
}

async function changeAdminPassword(event) {
    event.preventDefault();
    const currentPassword = String(document.getElementById('adminCurrentPassword')?.value || '');
    const newPassword = String(document.getElementById('adminNewPassword')?.value || '');
    const confirmation = String(document.getElementById('adminConfirmPassword')?.value || '');
    if (!currentPassword) {
        setAdminPasswordStatus('Informe a senha atual.', true);
        return;
    }
    if (newPassword.length < 3 || newPassword.length > 72) {
        setAdminPasswordStatus('A nova senha deve ter entre 3 e 72 caracteres.', true);
        return;
    }
    if (newPassword !== confirmation) {
        setAdminPasswordStatus('A confirmação não corresponde à nova senha.', true);
        return;
    }

    const button = document.getElementById('adminChangePasswordButton');
    if (button) button.disabled = true;
    setAdminPasswordStatus('Alterando senha…');
    try {
        await refreshAdminSessionIfNeeded();
        const config = getAdminConfig();
        const response = await fetch(`${config.SUPABASE_URL}/functions/v1/change-admin-password`, {
            method: 'POST',
            headers: createAuthenticatedAdminHeaders(),
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível alterar a senha.');

        closeAdminPasswordModal();
        clearAdminSession();
        setAdminAuthView(false);
        setAdminAuthStatus('Senha alterada. Entre novamente usando a nova senha.');
    } catch (error) {
        setAdminPasswordStatus(error.message || 'Não foi possível alterar a senha.', true);
    } finally {
        if (button) button.disabled = false;
    }
}

function setAdminPasswordStatus(message, isError = false) {
    const host = document.getElementById('adminChangePasswordStatus');
    if (!host) return;
    host.textContent = message;
    host.classList.toggle('is-error', isError);
}

async function loadAdminProfile() {
    const config = getAdminConfig();
    const userId = adminAuthSession?.user?.id;
    if (!userId || !adminAuthSession?.access_token) throw new Error('Sessão inválida.');
    const query = new URLSearchParams({
        select: 'user_id,username,display_name',
        user_id: `eq.${userId}`
    });
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/admin_users?${query}`, {
        headers: {
            apikey: config.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${adminAuthSession.access_token}`
        }
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows) || rows.length !== 1 || rows[0].user_id !== userId) {
        throw new Error('Este usuário não está autorizado como administrador.');
    }
    return rows[0];
}

async function refreshAdminSessionIfNeeded() {
    if (!adminAuthSession?.refresh_token) throw new Error('Sessão inválida.');
    const expiresAt = Number(adminAuthSession.expires_at || 0) * 1000;
    if (expiresAt && expiresAt - Date.now() > 60_000) return;

    const config = getAdminConfig();
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: adminAuthSession.refresh_token })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new Error('Sessão expirada.');
    adminAuthSession = payload;
    persistAdminSession();
}

function setAdminAuthView(authenticated) {
    authenticated = Boolean(
        authenticated &&
        adminAuthSession?.access_token &&
        adminAuthProfile?.user_id === adminAuthSession?.user?.id
    );
    window.digistatsAdminAuthenticated = authenticated;
    window.dispatchEvent(
        new CustomEvent('digistats:admin-auth-changed', {
            detail: { authenticated }
        })
    );
    const container = document.getElementById('adminContainer');
    if (!container) return;
    document.getElementById('adminAuthGate')?.classList.toggle('is-hidden', authenticated);
    document.getElementById('adminSessionBar')?.classList.toggle('is-hidden', !authenticated);
    container.querySelector('.admin-tabs')?.classList.toggle('is-hidden', !authenticated);
    container.querySelector('.admin-groups')?.classList.toggle('is-hidden', !authenticated);
    container.querySelectorAll('[data-admin-panel]').forEach((panel) => {
        panel.classList.toggle(
            'is-hidden',
            !authenticated || panel.dataset.adminPanel !== adminActiveTab
        );
    });
    if (!authenticated) {
        const passwordInput = document.getElementById('adminLoginPassword');
        const toggle = container.querySelector('[data-admin-action="toggle-password"]');
        if (passwordInput) passwordInput.type = 'password';
        if (toggle) {
            toggle.setAttribute('aria-pressed', 'false');
            toggle.setAttribute('aria-label', 'Mostrar senha');
            toggle.title = 'Mostrar senha';
        }
        return;
    }

    const name = document.getElementById('adminSessionName');
    if (name) name.textContent = adminAuthProfile?.display_name || adminAuthProfile?.username || '';
    setAdminAuthStatus('');
    if (!adminFormatsLoaded) loadAdminFormats();
    if (!adminBanListLoaded) loadAdminBanList();
    switchAdminTab(adminActiveTab);
}

function clearAdminSession() {
    adminAuthSession = null;
    adminAuthProfile = null;
    adminDigilabLoaded = false;
    adminDigilabRequestInFlight = false;
    adminDigilabAutoLinkRunning = false;
    adminDigilabBulkSyncCancelRequested = true;
    adminDigilabAutoLinkResults.clear();
    adminDigilabDeckCatalogLoaded = false;
    adminDigilabDeckCatalog = null;
    sessionStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
    setAdminAuthView(false);
}

function persistAdminSession() {
    sessionStorage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(adminAuthSession));
}

function getAdminConfig() {
    const config = window.APP_CONFIG || {};
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        throw new Error('Configuração do Supabase indisponível.');
    }
    return config;
}

function createAuthenticatedAdminHeaders(extraHeaders = {}) {
    const config = getAdminConfig();
    if (!adminAuthSession?.access_token || adminAuthProfile?.user_id !== adminAuthSession?.user?.id)
        throw new Error('Sessão administrativa ausente.');
    return {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${adminAuthSession.access_token}`,
        'Content-Type': 'application/json',
        ...extraHeaders
    };
}

function setAdminAuthStatus(message, isError = false) {
    const host = document.getElementById('adminLoginStatus');
    if (!host) return;
    host.textContent = message;
    host.classList.toggle('is-error', isError);
}

async function callDigilabFunction(functionName, body = {}) {
    if (adminDigilabRequestInFlight) {
        throw new Error('Aguarde a consulta atual terminar.');
    }
    adminDigilabRequestInFlight = true;
    try {
        await refreshAdminSessionIfNeeded();
    } catch (error) {
        clearAdminSession();
        setAdminAuthView(false);
        adminDigilabRequestInFlight = false;
        throw error;
    }
    try {
        const config = getAdminConfig();
        let response;
        try {
            response = await fetch(`${config.SUPABASE_URL}/functions/v1/${functionName}`, {
                method: 'POST',
                headers: {
                    apikey: config.SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${adminAuthSession.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
        } catch {
            const networkError = new Error(
                `Não foi possível acessar a função ${functionName}. Confirme se ela está publicada com esse nome.`
            );
            networkError.code = 'function_unreachable';
            throw networkError;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401) {
                clearAdminSession();
                setAdminAuthView(false);
            }
            const requestError = new Error(payload.error || `Falha na função ${functionName}.`);
            requestError.status = response.status;
            requestError.retryAfter = response.headers.get('retry-after');
            requestError.payload = payload;
            throw requestError;
        }
        return payload;
    } finally {
        adminDigilabRequestInFlight = false;
    }
}

async function testDigilabHealth() {
    setDigilabStatus('Testando conexão…');
    try {
        const result = await callDigilabFunction('digilab-health');
        setDigilabStatus(`Conexão ativa (HTTP ${result.digilab_status}).`);
    } catch (error) {
        setDigilabStatus(error.message, true);
    }
}

async function runDigilabBackgroundAutomation(button, retryId = null) {
    if (!button || button.disabled) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML =
        '<span class="admin-digilab-button-spinner" aria-hidden="true"></span>Executando…';
    setDigilabStatus('Executando a mesma rotina agendada do DigiLab…');

    try {
        const result = await callDigilabFunction('sync-new-digilab-tournaments', {
            action: retryId ? 'retry' : 'run',
            digilab_tournament_id: retryId,
            retry_review_now: true
        });
        if (result.busy) {
            setDigilabStatus('Uma sincronização já está em andamento. Acompanhe pelo histórico.');
            await loadDigilabSyncHistory();
            return;
        }
        const updated = Number(result.updated) || 0;
        const decksCreated = Number(result.decks_created) || 0;
        const discovered = Number(result.discovered) || 0;
        const attempted = Number(result.attempted) || 0;
        const imported = Number(result.imported) || 0;
        const playersCreated = Number(result.players_created) || 0;
        const needsReview = Number(result.needs_review) || 0;
        const failed = Number(result.failed) || 0;
        const skipped = Number(result.skipped) || 0;
        setDigilabStatus(
            `Automação concluída: ${discovered} incluído(s) na fila, ${attempted} processado(s), ${playersCreated} jogador(es) e ${decksCreated} deck(s) cadastrado(s), ${imported} importado(s), ${updated} atualizado(s), ${needsReview} para revisão, ${skipped} sem alterações e ${failed} falha(s).`,
            failed > 0
        );
        if (imported > 0 || updated > 0) notifyTournamentListChanged(null, 'digilab-background');
        adminDigilabAutoLinkResults.clear();
        adminDigilabPreviewCache.clear();
        await loadDigilabInventory(adminDigilabPage, {
            skipAutoLink: true,
            skipAutoImport: true
        });
    } catch (error) {
        setDigilabStatus(error.message || 'Não foi possível executar a automação.', true);
    } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalText;
    }
}

async function loadDigilabSyncHistory() {
    const host = document.getElementById('adminDigilabHistory');
    if (!host) return;
    try {
        const history = await callDigilabFunction('sync-new-digilab-tournaments', {
            action: 'history'
        });
        renderDigilabSyncHistory(host, history);
    } catch (error) {
        host.innerHTML = `<p class="admin-error">${escapeAdminHtml(error.message)}</p>`;
        const overview = document.getElementById('adminImportOverview');
        if (overview) overview.textContent = 'Não foi possível consultar a última execução.';
    }
}

function renderDigilabSyncHistory(host, history) {
    const duration = (run) => {
        const start = Date.parse(run.started_at);
        const end = run.finished_at
            ? Date.parse(run.finished_at)
            : run.status === 'running'
              ? Date.now()
              : NaN;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
        const seconds = Math.round((end - start) / 1000);
        return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
    };
    const date = (value) =>
        value ? escapeAdminHtml(new Date(value).toLocaleString('pt-BR')) : '—';
    const labels = {
        running: 'Em andamento',
        completed: 'Concluída',
        failed: 'Falhou',
        interrupted: 'Interrompida',
        imported: 'Importado',
        updated: 'Atualizado',
        unchanged: 'Sem alterações',
        needs_review: 'Revisão necessária',
        retry: 'Nova tentativa agendada',
        processing: 'Processando'
    };
    const pending = history.pending || [];
    const events = history.events || [];
    const runs = history.runs || [];
    const overview = document.getElementById('adminImportOverview');
    if (overview) {
        const latest = runs[0];
        overview.innerHTML = `<div><span>Última execução</span><strong>${latest ? date(latest.started_at) : 'Sem registro'}</strong></div><div><span>Status</span><strong>${latest ? escapeAdminHtml(labels[latest.status] || latest.status) : '—'}</strong></div><div><span>Pendências</span><strong>${pending.length}</strong></div>`;
    }
    host.innerHTML = `
        <h4>Execuções recentes</h4>
        <div class="admin-table-wrapper"><table class="admin-table">
            <thead><tr><th>Início / fim</th><th>Duração</th><th>Origem</th><th>Status</th><th>Importados / atualizados</th><th>Jogadores / decks criados</th><th>Pendências / falhas</th></tr></thead>
            <tbody>${
                runs.length
                    ? runs
                          .map((run) => {
                              const counts = run.summary || {};
                              return `<tr><td>${date(run.started_at)}<br>${date(run.finished_at)}</td><td>${duration(run)}${run.status === 'running' ? ' (em andamento)' : ''}</td><td>${run.source === 'admin' ? 'Admin' : 'Agendada'}</td>
                    <td>${escapeAdminHtml(labels[run.status] || run.status)}${run.error ? `<br>${escapeAdminHtml(run.error)}` : ''}</td>
                    <td>${Number(counts.imported) || 0} / ${Number(counts.updated) || 0}</td>
                    <td>${Number(counts.players_created) || 0} / ${Number(counts.decks_created) || 0}</td>
                    <td>${Number(counts.needs_review) || 0} / ${Number(counts.failed) || 0}</td></tr>`;
                          })
                          .join('')
                    : '<tr><td colspan="7">Nenhuma execução registrada.</td></tr>'
            }</tbody>
        </table></div>
        <h4>Pendências</h4>
        <div class="admin-table-wrapper"><table class="admin-table">
            <thead><tr><th>DigiLab</th><th>Status / motivo</th><th>Próxima tentativa</th><th>Ação</th></tr></thead>
            <tbody>${
                pending.length
                    ? pending
                          .map(
                              (row) => `<tr><td>#${Number(row.digilab_tournament_id)}</td>
                <td>${escapeAdminHtml(labels[row.status] || row.status)}<br>${escapeAdminHtml(row.last_error || '')}</td>
                <td>${date(row.next_attempt_at)}</td><td><button type="button" class="admin-digilab-action is-secondary is-small" data-admin-action="digilab-retry" data-id="${Number(row.digilab_tournament_id)}" ${row.status === 'processing' ? 'disabled' : ''}>Tentar novamente</button></td></tr>`
                          )
                          .join('')
                    : '<tr><td colspan="4">Nenhuma pendência.</td></tr>'
            }</tbody>
        </table></div>
        <h4>Resultados por torneio</h4>
        <div class="admin-table-wrapper"><table class="admin-table">
            <thead><tr><th>Data</th><th>DigiLab</th><th>Resultado</th><th>Detalhes</th></tr></thead>
            <tbody>${
                events.length
                    ? events
                          .map(
                              (
                                  event
                              ) => `<tr><td>${date(event.created_at)}</td><td>#${Number(event.digilab_tournament_id)}</td>
                <td>${escapeAdminHtml(labels[event.outcome] || event.outcome)}</td><td>${event.details?.error ? escapeAdminHtml(event.details.error) : `${Number(event.details?.players_created) || 0} jogador(es), ${Number(event.details?.decks_created) || 0} deck(s) criado(s); ${Number(event.details?.results_updated) || 0} resultado(s) alterado(s).`}</td></tr>`
                          )
                          .join('')
                    : '<tr><td colspan="4">Nenhum resultado registrado.</td></tr>'
            }</tbody>
        </table></div>`;
}

async function loadDigilabInventory(page = 1, options = {}) {
    const body = document.getElementById('adminDigilabBody');
    if (body)
        body.innerHTML =
            '<tr><td colspan="8" class="admin-loading"><div class="spinner"></div></td></tr>';
    setDigilabStatus('Consultando o DigiLab…');
    try {
        const result = await callDigilabFunction('preview-digilab-import', {
            page,
            per_page: 100
        });
        adminDigilabInventory = Array.isArray(result.data) ? result.data : [];
        adminListPages.Digilab = 1;
        adminDigilabPage = Number(
            result.pagination?.current_page || result.pagination?.page || page
        );
        adminDigilabLastPage = Number(
            result.pagination?.last_page || result.pagination?.total_pages || adminDigilabPage
        );
        adminDigilabLoaded = true;
        renderDigilabInventory();
        setDigilabStatus(
            `${adminDigilabInventory.length} torneios carregados; 1 requisição ao DigiLab.`
        );
        const linkingCanContinue = options.runAutomation
            ? await autoLinkExactDigilabCandidates()
            : true;
        if (options.runAutomation && linkingCanContinue) {
            await autoImportNewDigilabTournaments();
        }
        await loadDigilabSyncHistory();
    } catch (error) {
        if (body)
            body.innerHTML = '<tr><td colspan="8" class="admin-empty">Falha ao carregar.</td></tr>';
        setDigilabStatus(error.message, true);
    }
}

async function autoLinkExactDigilabCandidates() {
    if (adminDigilabAutoLinkRunning) return false;
    const candidates = adminDigilabInventory.filter((row) => {
        const externalId = Number(row.digilab_tournament_id);
        const exactCandidates = row.local_candidates?.filter((item) => item.exact) || [];
        const previousResult = adminDigilabAutoLinkResults.get(externalId);
        const cooldownExpired =
            previousResult?.status === 'cooldown' &&
            (!previousResult.retry_at || Date.now() >= previousResult.retry_at);
        if (cooldownExpired) adminDigilabAutoLinkResults.delete(externalId);
        return (
            Number.isSafeInteger(externalId) &&
            externalId > 0 &&
            row.mapping_status === 'exact_local_candidate' &&
            exactCandidates.length === 1 &&
            (!previousResult || cooldownExpired)
        );
    });
    if (!candidates.length) return true;

    adminDigilabAutoLinkRunning = true;
    let linked = 0;
    let needsReview = 0;
    let waitingCooldown = 0;
    let stoppedError = null;
    try {
        for (let index = 0; index < candidates.length; index += 1) {
            if (!adminAuthSession) break;
            const row = candidates[index];
            const externalId = Number(row.digilab_tournament_id);
            const localId = Number(row.local_candidates.find((item) => item.exact).tournament_id);
            setDigilabStatus(
                `Vinculando candidatos exatos automaticamente: ${index + 1} de ${candidates.length}…`
            );
            try {
                const result = await callDigilabFunction('verify-digilab-tournaments', {
                    tournament_id: localId,
                    digilab_tournament_id: externalId
                });
                if (result.status === 'matched' || result.sync?.status === 'matched') {
                    row.mapping_status = 'linked_needs_review';
                    row.linked_tournament_id = localId;
                    adminDigilabAutoLinkResults.set(externalId, { status: 'linked' });
                    linked += 1;
                } else {
                    adminDigilabAutoLinkResults.set(externalId, {
                        status: 'verification_mismatch',
                        result
                    });
                    needsReview += 1;
                }
            } catch (error) {
                const isLocalCooldown =
                    error.status === 429 &&
                    String(error.message || '')
                        .toLocaleLowerCase('pt-BR')
                        .startsWith('aguarde antes de verificar');
                const retryAfter = Math.max(0, Number(error.retryAfter) || 0);
                adminDigilabAutoLinkResults.set(externalId, {
                    status: isLocalCooldown
                        ? 'cooldown'
                        : error.status === 429
                          ? 'rate_limited'
                          : 'verification_error',
                    error: error.message,
                    http_status: error.status || null,
                    payload: error.payload || null,
                    retry_at: isLocalCooldown ? Date.now() + retryAfter * 1000 : null
                });
                if (isLocalCooldown) {
                    waitingCooldown += 1;
                } else {
                    needsReview += 1;
                    stoppedError = error;
                }
                renderDigilabInventory();
                if (stoppedError) break;
            }
            renderDigilabInventory();
            if (index < candidates.length - 1) await waitFor(DIGILAB_AUTO_LINK_DELAY_MS);
        }
        if (stoppedError) {
            const http = stoppedError.status ? `HTTP ${stoppedError.status}: ` : '';
            const retry =
                stoppedError.status === 429 && stoppedError.retryAfter
                    ? ` Tente novamente após ${stoppedError.retryAfter}s.`
                    : '';
            setDigilabStatus(
                `Vínculo automático interrompido. ${http}${stoppedError.message}.${retry}`,
                true
            );
        } else {
            const cooldownMessage = waitingCooldown
                ? `; ${waitingCooldown} aguardando o intervalo de nova verificação`
                : '';
            setDigilabStatus(
                `${linked} vínculos automáticos confirmados${needsReview ? `; ${needsReview} enviados para revisão` : ''}${cooldownMessage}.`
            );
        }
    } finally {
        adminDigilabAutoLinkRunning = false;
        renderDigilabInventory();
    }
    return !stoppedError;
}

function waitFor(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function autoImportNewDigilabTournaments() {
    const rows = adminDigilabInventory.filter((row) => {
        const externalId = Number(row.digilab_tournament_id);
        return (
            Number.isSafeInteger(externalId) &&
            externalId > 0 &&
            row.mapping_status === 'new_import' &&
            !adminDigilabAutoLinkResults.has(externalId)
        );
    });
    if (!rows.length) return;
    let stoppedError = null;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const externalId = Number(row.digilab_tournament_id);
        setDigilabStatus(`Preparando novos torneios: ${index + 1} de ${rows.length}…`);
        try {
            const preview = await callDigilabFunction('preview-digilab-import', {
                digilab_tournament_id: externalId
            });
            adminDigilabPreviewCache.set(externalId, preview);
            await waitFor(DIGILAB_AUTO_LINK_DELAY_MS);
            if (!preview.can_auto_import) {
                adminDigilabAutoLinkResults.set(externalId, {
                    status: 'import_needs_mapping'
                });
                continue;
            }
            const imported = await callDigilabFunction('import-digilab-tournament', {
                digilab_tournament_id: externalId
            });
            notifyTournamentListChanged(imported.tournament_id, 'digilab-auto-import');
            row.mapping_status = 'linked_data_ok';
            row.linked_tournament_id = imported.tournament_id;
            adminDigilabAutoLinkResults.set(externalId, { status: 'linked' });
        } catch (error) {
            adminDigilabAutoLinkResults.set(externalId, {
                status: error.status === 429 ? 'rate_limited' : 'import_error',
                error: error.message
            });
            if (
                error.status === 429 ||
                error.status === 404 ||
                error.status >= 500 ||
                error.code === 'function_unreachable'
            ) {
                stoppedError = error;
                break;
            }
        }
        renderDigilabInventory();
        if (index < rows.length - 1) await waitFor(DIGILAB_AUTO_LINK_DELAY_MS);
    }
    renderDigilabInventory();
    if (stoppedError) {
        setDigilabStatus(`Importação automática interrompida: ${stoppedError.message}`, true);
    } else {
        setDigilabStatus('Vínculos e importações automáticas concluídos.');
    }
}

function updateDigilabBulkProgress({ current, total, title, message }) {
    const host = document.getElementById('adminDigilabBulkProgress');
    if (!host) return;
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
    const percentage = safeTotal ? Math.round((safeCurrent / safeTotal) * 100) : 0;
    host.hidden = false;
    const titleHost = document.getElementById('adminDigilabBulkProgressTitle');
    const countHost = document.getElementById('adminDigilabBulkProgressCount');
    const bar = document.getElementById('adminDigilabBulkProgressBar');
    const messageHost = document.getElementById('adminDigilabBulkProgressMessage');
    if (titleHost) titleHost.textContent = title || 'Sincronizando torneios vinculados';
    if (countHost) countHost.textContent = `${safeCurrent} de ${safeTotal}`;
    if (bar) bar.style.width = `${percentage}%`;
    if (messageHost) messageHost.textContent = message || '';
}

function setDigilabBulkSyncButtonState(button, running) {
    if (!button) return;
    button.classList.toggle('is-review', running);
    button.setAttribute('aria-pressed', String(running));
    button.textContent = running ? 'Interromper após o atual' : 'Sincronizar dados pendentes';
    const refreshButton = document.querySelector('[data-admin-action="digilab-refresh"]');
    if (refreshButton) refreshButton.disabled = running;
}

async function syncAllPendingDigilabTournaments(button) {
    if (adminDigilabBulkSyncRunning) {
        adminDigilabBulkSyncCancelRequested = true;
        setDigilabStatus('A sincronização será interrompida após o torneio atual.');
        return;
    }
    if (adminDigilabRequestInFlight || adminDigilabAutoLinkRunning) {
        setDigilabStatus('Aguarde a operação atual terminar antes de iniciar o lote.', true);
        return;
    }

    const pendingStatuses = new Set([
        'linked_needs_review',
        'linked_data_ok',
        'linked_data_mismatch',
        'linked_needs_mapping',
        'linked_sync_error',
        'new_import',
        'import_needs_mapping',
        'import_error'
    ]);
    const rows = adminDigilabInventory.filter((row) =>
        pendingStatuses.has(String(row.mapping_status || ''))
    );
    if (!rows.length) {
        setDigilabStatus('Nenhum torneio possui dados pendentes ou aguarda criação.');
        return;
    }

    const newCount = rows.filter((row) =>
        ['new_import', 'import_needs_mapping', 'import_error'].includes(
            String(row.mapping_status || '')
        )
    ).length;
    const confirmed = window.confirm(
        `Processar ${rows.length} torneio(s) pendente(s)${newCount ? `, incluindo ${newCount} novo(s) no DigiStats` : ''}? Decks divergentes ou vazios e a pontuação de cada jogador serão atualizados com os dados do DigiLab. Torneios sem de-para completo ficarão para revisão.`
    );
    if (!confirmed) return;

    adminDigilabBulkSyncRunning = true;
    adminDigilabBulkSyncCancelRequested = false;
    setDigilabBulkSyncButtonState(button, true);
    let processed = 0;
    let synced = 0;
    let created = 0;
    let needsReview = 0;
    let failed = 0;
    let stoppedError = null;

    updateDigilabBulkProgress({
        current: 0,
        total: rows.length,
        title: 'Processando torneios pendentes',
        message: 'Preparando a conferência de decks e pontuações…'
    });

    try {
        for (const row of rows) {
            if (adminDigilabBulkSyncCancelRequested || !adminAuthSession) break;
            const externalId = Number(row.digilab_tournament_id);
            let createsNewTournament = [
                'new_import',
                'import_needs_mapping',
                'import_error'
            ].includes(String(row.mapping_status || ''));
            updateDigilabBulkProgress({
                current: processed,
                total: rows.length,
                title: `Conferindo DigiLab #${externalId}`,
                message: `${synced} atualizado(s) · ${created} criado(s) · ${needsReview} para revisão · ${failed} erro(s)`
            });
            setDigilabStatus(`Conferindo decks e pontuações: ${processed + 1} de ${rows.length}…`);

            try {
                const preview =
                    adminDigilabPreviewCache.get(externalId) ||
                    (await callDigilabFunction('preview-digilab-import', {
                        digilab_tournament_id: externalId
                    }));
                adminDigilabPreviewCache.set(externalId, preview);
                updateDigilabRowFromDeckComparison(externalId, preview.deck_comparison);
                createsNewTournament = !preview.already_linked;

                const unresolvedPlayers = (
                    preview.import_resolution?.unresolved_players || []
                ).filter(
                    (row) =>
                        row.status !== 'unmatched' ||
                        !normalizeDigilabPlayerName(row.digilab_player_name)
                );
                const unresolvedDecks = (preview.import_resolution?.unresolved_decks || []).filter(
                    (row) =>
                        row.status !== 'unmatched' ||
                        !normalizeDigilabPlayerName(row.digilab_deck_name)
                );
                const warnings = Array.isArray(preview.warnings) ? preview.warnings : [];
                const storeResolved = Boolean(preview.import_resolution?.store?.store_id);
                const formatResolved = Boolean(
                    preview.import_resolution?.format?.format_id ||
                    preview.import_resolution?.format?.status === 'auto_create'
                );
                const hasLocalCandidate = (preview.local_candidates || []).some(
                    (candidate) => Number(candidate.score) > 0
                );
                const newImportBlocked = createsNewTournament && !preview.can_auto_import;
                if (
                    unresolvedPlayers.length ||
                    unresolvedDecks.length ||
                    warnings.length ||
                    newImportBlocked
                ) {
                    const reasons = [
                        unresolvedPlayers.length
                            ? `${unresolvedPlayers.length} jogador(es) sem de-para`
                            : '',
                        unresolvedDecks.length
                            ? `${unresolvedDecks.length} deck(s) sem de-para`
                            : '',
                        !storeResolved ? 'loja sem de-para' : '',
                        !formatResolved ? 'formato sem de-para' : '',
                        hasLocalCandidate ? 'possível torneio local na mesma data' : '',
                        warnings.length ? `${warnings.length} aviso(s) estrutural(is)` : '',
                        newImportBlocked &&
                        !unresolvedPlayers.length &&
                        !unresolvedDecks.length &&
                        storeResolved &&
                        formatResolved &&
                        !hasLocalCandidate &&
                        !warnings.length
                            ? 'revisão manual necessária'
                            : ''
                    ].filter(Boolean);
                    const reviewStatus = createsNewTournament
                        ? 'import_needs_mapping'
                        : 'linked_needs_mapping';
                    row.mapping_status = reviewStatus;
                    adminDigilabAutoLinkResults.set(externalId, {
                        status: reviewStatus,
                        error: reasons.join(' · ')
                    });
                    needsReview += 1;
                } else {
                    await waitFor(DIGILAB_AUTO_LINK_DELAY_MS);
                    const imported = await callDigilabFunction('import-digilab-tournament', {
                        digilab_tournament_id: externalId
                    });
                    notifyTournamentListChanged(
                        imported.tournament_id,
                        createsNewTournament ? 'digilab-bulk-import' : 'digilab-bulk-sync'
                    );
                    row.mapping_status = 'linked_synced';
                    adminDigilabPreviewCache.delete(externalId);
                    adminDigilabAutoLinkResults.set(externalId, {
                        status: 'linked_synced'
                    });
                    if (createsNewTournament) created += 1;
                    else synced += 1;
                }
            } catch (error) {
                failed += 1;
                const errorStatus = createsNewTournament ? 'import_error' : 'linked_sync_error';
                row.mapping_status = errorStatus;
                adminDigilabAutoLinkResults.set(externalId, {
                    status: errorStatus,
                    error: error.message,
                    http_status: error.status || null
                });
                if (
                    error.status === 401 ||
                    error.status === 429 ||
                    error.status >= 500 ||
                    error.code === 'function_unreachable'
                ) {
                    stoppedError = error;
                }
            }

            processed += 1;
            renderDigilabInventory();
            updateDigilabBulkProgress({
                current: processed,
                total: rows.length,
                title: `Processados ${processed} de ${rows.length}`,
                message: `${synced} atualizado(s) · ${created} criado(s) · ${needsReview} para revisão · ${failed} erro(s)`
            });
            if (stoppedError) break;
            if (processed < rows.length) await waitFor(DIGILAB_AUTO_LINK_DELAY_MS);
        }

        const cancelled = adminDigilabBulkSyncCancelRequested;
        if (!stoppedError && adminAuthSession) {
            await waitFor(DIGILAB_AUTO_LINK_DELAY_MS);
            await loadDigilabInventory(adminDigilabPage);
        }
        const summary = `${synced} atualizado(s), ${created} criado(s), ${needsReview} para revisão e ${failed} erro(s).`;
        updateDigilabBulkProgress({
            current: processed,
            total: rows.length,
            title: stoppedError
                ? 'Sincronização interrompida'
                : cancelled
                  ? 'Sincronização pausada'
                  : 'Sincronização concluída',
            message: summary
        });
        if (stoppedError) {
            const retry = stoppedError.retryAfter
                ? ` Aguarde ${stoppedError.retryAfter}s antes de tentar novamente.`
                : '';
            setDigilabStatus(`Lote interrompido: ${stoppedError.message}.${retry}`, true);
        } else {
            setDigilabStatus(
                `${cancelled ? 'Sincronização pausada' : 'Sincronização concluída'}: ${summary}`
            );
        }
    } finally {
        adminDigilabBulkSyncRunning = false;
        adminDigilabBulkSyncCancelRequested = false;
        setDigilabBulkSyncButtonState(button, false);
        renderDigilabInventory();
    }
}

function renderDigilabInventory() {
    const body = document.getElementById('adminDigilabBody');
    if (!body) return;
    const counts = {};
    adminDigilabInventory.forEach((row) => {
        counts[row.mapping_status] = (counts[row.mapping_status] || 0) + 1;
    });
    const summary = document.getElementById('adminDigilabSummary');
    if (summary) {
        const linkedCount = Object.entries(counts).reduce(
            (total, [status, count]) =>
                status === 'linked' || status.startsWith('linked_') ? total + count : total,
            0
        );
        summary.innerHTML = [
            ['Vinculados', linkedCount, 'linked', 'Confirmados no DigiStats'],
            [
                'Candidatos exatos',
                counts.exact_local_candidate || 0,
                'exact',
                'Prontos para revisar'
            ],
            [
                'Possíveis',
                (counts.possible_local_candidate || 0) + (counts.ambiguous || 0),
                'possible',
                'Precisam de conferência'
            ],
            ['Novos', counts.new_import || 0, 'new', 'Sem torneio local']
        ]
            .map(
                ([label, value, tone, caption]) => `<div class="tone-${tone}">
                    <span class="admin-digilab-summary-label">${label}</span>
                    <strong>${value}</strong>
                    <small>${caption}</small>
                </div>`
            )
            .join('');
    }
    if (!adminDigilabInventory.length) {
        body.innerHTML =
            '<tr><td colspan="8" class="admin-empty">Nenhum torneio encontrado.</td></tr>';
    } else {
        body.innerHTML =
            adminListPage('Digilab', adminDigilabInventory, renderDigilabInventory)
                .map(renderDigilabRow)
                .join('') ||
            '<tr><td colspan="8" class="admin-empty">Nenhum torneio encontrado nesta página do DigiLab.</td></tr>';
    }
    const pageLabel = document.getElementById('adminDigilabPage');
    if (pageLabel) pageLabel.textContent = `Página ${adminDigilabPage} de ${adminDigilabLastPage}`;
}

function renderDigilabRow(row) {
    const externalId = Number(row.digilab_tournament_id);
    const automaticResult = adminDigilabAutoLinkResults.get(externalId);
    const candidate = row.local_candidates?.[0] || null;
    const displayStatus = automaticResult?.status || row.mapping_status;
    const canVerify =
        displayStatus === 'exact_local_candidate' &&
        row.local_candidates?.filter((item) => item.exact).length === 1;
    const linkedId = row.linked_tournament_id;
    const candidateText = linkedId
        ? `#${linkedId}`
        : candidate
          ? `<div class="admin-digilab-candidate-cell">
                <strong>#${candidate.tournament_id} · ${escapeAdminHtml(candidate.tournament_name || '')}</strong>
                ${renderDigilabDifferences(row, candidate)}
            </div>`
          : '—';
    const automaticError = automaticResult?.error
        ? `<span class="admin-digilab-row-error">${automaticResult.http_status ? `HTTP ${Number(automaticResult.http_status)} · ` : ''}${escapeAdminHtml(automaticResult.error)}</span>`
        : '';
    return `<tr data-digilab-id="${externalId}">
        <td><a href="https://digilab.cards/tournament/${externalId}" target="_blank" rel="noopener">#${externalId}</a></td>
        <td>${escapeAdminHtml(formatAdminDate(row.event_date))}</td>
        <td>${escapeAdminHtml(row.store_name || '—')}</td>
        <td>${Number(row.player_count) || 0}</td>
        <td>${escapeAdminHtml(row.format || '—')}</td>
        <td><span class="admin-digilab-badge status-${escapeAdminHtml(displayStatus)}">${escapeAdminHtml(digilabStatusLabel(displayStatus))}</span>${automaticError}</td>
        <td>${candidateText}</td>
        <td class="admin-row-actions">
            <button type="button" class="admin-digilab-action is-secondary is-small" data-admin-action="digilab-preview" data-id="${externalId}">Detalhes</button>
            ${canVerify && adminDigilabAutoLinkRunning ? '<span class="admin-digilab-auto-label">Automático</span>' : ''}
        </td>
    </tr>`;
}

function renderDigilabDifferences(external, candidate) {
    const differences = [];
    if (candidate.matches?.player_count === false) {
        differences.push(
            `<span><b>Jogadores</b> DigiLab ${Number(external.player_count) || 0} × DigiStats ${Number(candidate.player_count) || 0}</span>`
        );
    }
    if (candidate.matches?.store === false) {
        differences.push(
            `<span><b>Loja</b> ${escapeAdminHtml(external.store_name || '—')} × ${escapeAdminHtml(candidate.store_name || '—')}</span>`
        );
    }
    if (candidate.matches?.format === false) {
        differences.push(
            `<span class="is-info"><b>Formato</b> ${escapeAdminHtml(external.format || '—')} × ${escapeAdminHtml(candidate.format || '—')} (informativo)</span>`
        );
    }
    if (!differences.length && candidate.exact) {
        return '<span class="admin-digilab-compatible">Dados principais compatíveis</span>';
    }
    return differences.length
        ? `<div class="admin-digilab-differences">${differences.join('')}</div>`
        : '';
}

function previewDigilabFromInput() {
    const id = Number(document.getElementById('adminDigilabId')?.value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        setDigilabStatus('Informe um ID DigiLab válido.', true);
        return;
    }
    previewDigilabTournament(id);
}

async function previewDigilabTournament(id, sourceRow = null, options = {}) {
    const currentRow = document.getElementById('adminDigilabDetailRow');
    const isCurrentTournament = Number(currentRow?.dataset.digilabId) === Number(id);
    if (isCurrentTournament && !options.keepOpen) {
        currentRow.remove();
        setDigilabDetailButtonState(id, false);
        setDigilabStatus(`Detalhes do torneio #${id} fechados.`);
        return;
    }

    const detail = isCurrentTournament
        ? currentRow.querySelector('#adminDigilabDetail')
        : mountDigilabDetailRow(id, sourceRow);
    if (!detail) return;
    detail.innerHTML = '<div class="admin-loading"><div class="spinner"></div></div>';
    setDigilabStatus(`Consultando o torneio #${id}…`);
    try {
        const cachedResult = options.forceRefresh ? null : adminDigilabPreviewCache.get(id);
        const result =
            cachedResult ||
            (await callDigilabFunction('preview-digilab-import', {
                digilab_tournament_id: id
            }));
        adminDigilabPreviewCache.set(id, result);
        renderDigilabDetail(result);
        setDigilabStatus(
            cachedResult
                ? 'Detalhes carregados do inventário local.'
                : 'Detalhes carregados; 1 requisição ao DigiLab.'
        );
    } catch (error) {
        if (detail)
            detail.innerHTML = `<p class="admin-error">${escapeAdminHtml(error.message)}</p>`;
        setDigilabStatus(error.message, true);
    }
}

function mountDigilabDetailRow(id, sourceRow) {
    const previousRow = document.getElementById('adminDigilabDetailRow');
    if (previousRow) {
        setDigilabDetailButtonState(Number(previousRow.dataset.digilabId), false);
        previousRow.remove();
    }
    const body = document.getElementById('adminDigilabBody');
    const matchingRow =
        sourceRow || body?.querySelector(`tr[data-digilab-id="${Number(id)}"]`) || null;
    const row = document.createElement('tr');
    row.id = 'adminDigilabDetailRow';
    row.className = 'admin-digilab-detail-row';
    row.dataset.digilabId = String(Number(id));
    row.innerHTML =
        '<td colspan="8"><section id="adminDigilabDetail" class="admin-digilab-detail" aria-live="polite"></section></td>';
    if (matchingRow) matchingRow.insertAdjacentElement('afterend', row);
    else if (body) body.prepend(row);
    setDigilabDetailButtonState(id, true);
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return row.querySelector('#adminDigilabDetail');
}

function setDigilabDetailButtonState(id, expanded) {
    const button = document.querySelector(
        `[data-admin-action="digilab-preview"][data-id="${Number(id)}"]`
    );
    if (!button) return;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Fechar' : 'Detalhes';
}

function renderDigilabDetail(result) {
    const detail = document.getElementById('adminDigilabDetail');
    if (!detail) return;
    const tournament = result.tournament || {};
    const candidates = Array.isArray(result.local_candidates) ? result.local_candidates : [];
    const standings = Array.isArray(result.standings) ? result.standings : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const playerOptions = result.import_resolution?.player_options || [];
    const deckOptions = result.import_resolution?.deck_options || [];
    const deckComparison = result.deck_comparison || null;
    const externalId = Number(tournament.digilab_tournament_id);
    const linkedTournamentId = Number(result.already_linked?.tournament_id) || null;
    const creatablePlayerCount = getCreatableDigilabPlayers(result).length;
    const isNewImport =
        !result.already_linked && candidates.every((candidate) => Number(candidate.score) === 0);
    updateDigilabRowFromDeckComparison(externalId, deckComparison);
    detail.innerHTML = `
        <div class="admin-panel-header">
            <div><h3>Torneio DigiLab #${Number(tournament.digilab_tournament_id)}</h3>
            <p class="admin-panel-desc">${escapeAdminHtml(formatAdminDate(tournament.date))} · ${escapeAdminHtml(tournament.store?.name || 'Loja não informada')} · ${Number(tournament.player_count) || 0} jogadores · ${escapeAdminHtml(tournament.format || 'Formato não informado')}</p></div>
            <div class="admin-digilab-detail-actions">
                ${linkedTournamentId ? `<button type="button" class="admin-digilab-action is-secondary" data-admin-action="digilab-edit-local" data-id="${linkedTournamentId}">Editar no DigiStats</button>` : ''}
                <a class="admin-digilab-action is-ghost" href="https://digilab.cards/tournament/${Number(tournament.digilab_tournament_id)}" target="_blank" rel="noopener">Abrir no DigiLab</a>
            </div>
        </div>
        ${warnings.length ? `<p class="admin-warning">Avisos: ${warnings.map(escapeAdminHtml).join(', ')}</p>` : ''}
        <h4>Candidatos locais</h4>
        <div class="admin-digilab-candidates">${candidates.length ? candidates.map((item) => renderDigilabCandidateCard(item, externalId, Number(tournament.player_count) || 0)).join('') : '<p>Nenhum candidato na mesma data.</p>'}</div>
        ${renderDigilabConflictPanel(externalId, candidates)}
        ${renderMissingDigilabPlayersCallout(result, externalId)}
        ${renderDigilabDeckComparisonSummary(deckComparison)}
        ${isNewImport ? `<div class="admin-digilab-import-callout"><div class="admin-digilab-import-copy"><strong>Novo torneio no DigiStats</strong><span>${creatablePlayerCount ? `${creatablePlayerCount} jogador(es) listado(s) acima será(ão) cadastrado(s) automaticamente antes do torneio.` : 'Revise o de-para abaixo. Mapeamentos confirmados serão reutilizados nas próximas importações.'}</span><div class="admin-digilab-import-progress" role="status" aria-live="polite"><div class="admin-digilab-progress-track"><span></span></div><small>Validando dados e criando o torneio…</small></div></div><button type="button" class="admin-digilab-action is-primary" data-admin-action="digilab-import" data-id="${Number(tournament.digilab_tournament_id)}">Criar no DigiStats</button></div>` : ''}
        ${result.already_linked ? `<div class="admin-digilab-import-callout is-sync"><div class="admin-digilab-import-copy"><strong>Atualizar dados do torneio vinculado</strong><span>Use esta ação para preencher decks ou pontuações que não estavam disponíveis na primeira importação.</span><div class="admin-digilab-import-progress" role="status" aria-live="polite"><div class="admin-digilab-progress-track"><span></span></div><small>Sincronizando os resultados…</small></div></div><button type="button" class="admin-digilab-action is-secondary" data-admin-action="digilab-import" data-mode="sync" data-id="${externalId}">Sincronizar dados</button></div>` : ''}
        <h4>Classificação e pontos derivados</h4>
        <div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Pos.</th><th>Jogador</th><th>De-para jogador</th><th>Deck DigiLab</th><th>De-para deck</th><th>W-L-D</th><th>Pontos</th></tr></thead><tbody>${standings.map((item) => `<tr><td>${Number(item.placement) || '—'}</td><td>${escapeAdminHtml(item.player?.name || 'Anônimo')}<small class="admin-digilab-player-slug">${escapeAdminHtml(item.player?.slug || '—')}</small></td><td>${renderDigilabPlayerMatch(item, playerOptions)}</td><td>${escapeAdminHtml(item.deck?.name || 'Não informado')}<small class="admin-digilab-player-slug">${escapeAdminHtml(item.deck?.slug || '—')}</small></td><td>${renderDigilabDeckMatch(item, deckOptions)}${renderDigilabDeckDifference(item, deckComparison)}</td><td>${Number(item.record?.wins) || 0}-${Number(item.record?.losses) || 0}-${Number(item.record?.ties) || 0}</td><td>${item.match_points ?? '—'}</td></tr>`).join('')}</tbody></table></div>`;
}

function getCreatableDigilabPlayers(result) {
    const unresolved = Array.isArray(result?.import_resolution?.unresolved_players)
        ? result.import_resolution.unresolved_players
        : [];
    const uniqueBySlug = new Map();
    unresolved.forEach((player) => {
        const slug = String(player.digilab_player_slug || '').trim();
        const name = String(player.digilab_player_name || '').trim();
        if (player.status === 'unmatched' && slug && name && !uniqueBySlug.has(slug)) {
            uniqueBySlug.set(slug, { slug, name });
        }
    });
    const rows = [...uniqueBySlug.values()];
    const nameCounts = new Map();
    rows.forEach((player) => {
        const normalized = normalizeDigilabPlayerName(player.name);
        nameCounts.set(normalized, (nameCounts.get(normalized) || 0) + 1);
    });
    return rows.filter((player) => nameCounts.get(normalizeDigilabPlayerName(player.name)) === 1);
}

function normalizeDigilabPlayerName(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function renderMissingDigilabPlayersCallout(result, externalId) {
    const players = getCreatableDigilabPlayers(result);
    if (!players.length) return '';
    return `<section class="admin-digilab-missing-players">
        <div class="admin-digilab-missing-players-copy">
            <strong>${players.length} jogador${players.length === 1 ? '' : 'es'} ainda não cadastrado${players.length === 1 ? '' : 's'}</strong>
            <span>Confira quem será criado no DigiStats. Nome, Bandai Nick e nome DigiLab serão preenchidos igualmente; o Bandai ID ficará vazio.</span>
            <ul>${players.map((player) => `<li><b>${escapeAdminHtml(player.name)}</b><small>${escapeAdminHtml(player.slug)}</small></li>`).join('')}</ul>
        </div>
        <button type="button" class="admin-digilab-action is-review" data-admin-action="digilab-create-missing-players" data-id="${Number(externalId)}">Cadastrar jogadores</button>
    </section>`;
}

async function insertMissingDigilabPlayers(players) {
    const config = getAdminConfig();
    await refreshAdminSessionIfNeeded();
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/players`, {
        method: 'POST',
        headers: createAuthenticatedAdminHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(
            players.map((player) => ({
                name: player.name,
                bandai_id: null,
                bandai_nick: player.name,
                digilab_name: player.name,
                is_active: true
            }))
        )
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const duplicate = response.status === 409;
        throw new Error(
            duplicate
                ? 'Um dos jogadores já foi cadastrado. Atualize os detalhes e revise o de-para.'
                : payload?.message || payload?.error || 'Não foi possível cadastrar os jogadores.'
        );
    }
    return Array.isArray(payload) ? payload : [];
}

async function createMissingDigilabPlayers(externalId, button) {
    const preview = adminDigilabPreviewCache.get(Number(externalId));
    const players = getCreatableDigilabPlayers(preview);
    if (!players.length) {
        setDigilabStatus('Nenhum jogador novo disponível para cadastro.', true);
        return;
    }
    const list = players.map((player) => `• ${player.name} (${player.slug})`).join('\n');
    const confirmed = window.confirm(
        `Os seguintes jogadores serão cadastrados no DigiStats:\n\n${list}\n\nO Bandai ID ficará vazio e poderá ser preenchido depois. Confirmar cadastro?`
    );
    if (!confirmed) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Cadastrando…';
    setDigilabStatus(`Cadastrando ${players.length} jogador(es)…`);
    try {
        await insertMissingDigilabPlayers(players);

        adminDigilabPreviewCache.delete(Number(externalId));
        adminDigilabAutoLinkResults.delete(Number(externalId));
        setDigilabStatus(`${players.length} jogador(es) cadastrado(s). Atualizando o de-para…`);
        await previewDigilabTournament(Number(externalId), null, {
            keepOpen: true,
            forceRefresh: true
        });
    } catch (error) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Tentar novamente';
        setDigilabStatus(error.message, true);
    }
}

function renderDigilabDeckComparisonSummary(comparison) {
    if (!comparison?.counts) return '';
    const counts = comparison.counts;
    const missing = Number(counts.local_missing) || 0;
    const divergent = Number(counts.divergent) || 0;
    const resultMissing = Number(counts.result_missing) || 0;
    const unresolved = Number(counts.external_unresolved) || 0;
    const hasIssue = missing + divergent + resultMissing + unresolved > 0;
    const details = [
        missing
            ? `${missing} deck${missing === 1 ? '' : 's'} ausente${missing === 1 ? '' : 's'}`
            : '',
        divergent
            ? `${divergent} deck${divergent === 1 ? '' : 's'} divergente${divergent === 1 ? '' : 's'}`
            : '',
        resultMissing
            ? `${resultMissing} resultado${resultMissing === 1 ? '' : 's'} local${resultMissing === 1 ? '' : 'is'} ausente${resultMissing === 1 ? '' : 's'}`
            : '',
        unresolved ? `${unresolved} deck${unresolved === 1 ? '' : 's'} sem de-para` : ''
    ].filter(Boolean);
    return `<section class="admin-digilab-deck-audit ${hasIssue ? 'has-issues' : 'is-ok'}">
        <strong>${hasIssue ? 'Atenção aos dados dos decks' : 'Decks conferidos'}</strong>
        <span>${hasIssue ? details.join(' · ') : `${Number(counts.matched) || 0} decks iguais entre DigiStats e DigiLab.`}</span>
        ${hasIssue ? '<small>Revise o de-para abaixo. “Sincronizar dados” preencherá ausentes e substituirá divergentes.</small>' : ''}
    </section>`;
}

function renderDigilabDeckDifference(standing, comparison) {
    const slug = String(standing.player?.slug || '');
    const row = comparison?.rows?.find((item) => String(item.digilab_player_slug || '') === slug);
    if (!row || row.status === 'matched') return '';
    const labels = {
        local_missing: 'DigiStats: não informado',
        divergent: `DigiStats: ${row.local_deck_name || 'outro deck'}`,
        result_missing: 'Resultado ausente no DigiStats',
        external_unresolved: 'Deck DigiLab sem de-para'
    };
    return `<small class="admin-digilab-deck-difference status-${escapeAdminHtml(row.status)}">${escapeAdminHtml(labels[row.status] || 'Revisar deck')}</small>`;
}

function updateDigilabRowFromDeckComparison(externalId, comparison) {
    if (!comparison?.counts) return;
    const counts = comparison.counts;
    const hasMismatch =
        (Number(counts.local_missing) || 0) +
            (Number(counts.divergent) || 0) +
            (Number(counts.result_missing) || 0) >
        0;
    const hasUnresolved = (Number(counts.external_unresolved) || 0) > 0;
    const status = hasMismatch
        ? 'linked_data_mismatch'
        : hasUnresolved
          ? 'linked_needs_review'
          : 'linked_data_ok';
    const inventoryRow = adminDigilabInventory.find(
        (item) => Number(item.digilab_tournament_id) === Number(externalId)
    );
    if (inventoryRow) inventoryRow.mapping_status = status;
    const badge = document.querySelector(
        `tr[data-digilab-id="${Number(externalId)}"] .admin-digilab-badge`
    );
    if (badge) {
        badge.className = `admin-digilab-badge status-${status}`;
        badge.textContent = digilabStatusLabel(status);
    }
}

function renderDigilabCandidateCard(candidate, externalId, externalPlayerCount) {
    const localId = Number(candidate.tournament_id);
    const localPlayerCount = Number(candidate.player_count) || 0;
    const missingPlayers = Math.max(0, externalPlayerCount - localPlayerCount);
    const reconcileButton = missingPlayers
        ? `<button type="button" class="admin-digilab-action is-review is-small" data-admin-action="digilab-import" data-mode="reconcile" data-target-id="${localId}" data-id="${Number(externalId)}">Adicionar ${missingPlayers} ausente${missingPlayers === 1 ? '' : 's'}</button>`
        : '';
    return `<div>
        <strong>#${localId} ${escapeAdminHtml(candidate.tournament_name || '')}</strong>
        <span>Loja: ${escapeAdminHtml(candidate.store_name || '—')} · Jogadores: ${localPlayerCount} · score ${Number(candidate.score) || 0}</span>
        <div class="admin-digilab-candidate-actions">
            ${reconcileButton}
            <button type="button" class="admin-digilab-action is-ghost is-small" data-admin-action="digilab-edit-local" data-id="${localId}">Editar no DigiStats</button>
        </div>
    </div>`;
}

function editLocalDigilabCandidate(tournamentId) {
    if (!Number.isSafeInteger(tournamentId) || tournamentId <= 0) {
        setDigilabStatus('ID do torneio DigiStats inválido.', true);
        return;
    }
    if (typeof window.editTournament !== 'function') {
        setDigilabStatus('O editor de torneios ainda não está disponível nesta página.', true);
        return;
    }
    window.editTournament(tournamentId);
}

function renderDigilabConflictPanel(externalId, candidates) {
    const conflict = getDigilabVerificationConflict(externalId);
    if (!conflict?.mismatches?.length) return '';
    const localCandidate = candidates.find((candidate) => candidate.exact) || candidates[0] || null;
    if (!localCandidate?.tournament_id) return '';
    const reasons = conflict.mismatches
        .map((reason) => `<li>${escapeAdminHtml(digilabMismatchLabel(reason))}</li>`)
        .join('');
    const warnings = conflict.warnings?.length
        ? `<p><strong>Avisos:</strong> ${conflict.warnings.map((warning) => escapeAdminHtml(digilabWarningLabel(warning))).join('; ')}.</p>`
        : '';
    return `<section class="admin-digilab-conflict" aria-label="Divergências da validação">
        <div class="admin-digilab-conflict-copy">
            <strong>Por que este vínculo precisa de revisão?</strong>
            <ul>${reasons}</ul>
            ${warnings}
            <small>Confirme somente após conferir o candidato local. As divergências aceitas ficarão registradas no histórico.</small>
        </div>
        <button type="button" class="admin-digilab-action is-review" data-admin-action="digilab-force-verify" data-local-id="${Number(localCandidate.tournament_id)}" data-id="${Number(externalId)}">Confirmar vínculo após revisão</button>
    </section>`;
}

function getDigilabVerificationConflict(externalId) {
    const automaticResult = adminDigilabAutoLinkResults.get(Number(externalId));
    const summary =
        automaticResult?.result || automaticResult?.payload?.sync?.comparison_summary || null;
    const comparisons = Array.isArray(summary?.candidates) ? summary.candidates : [];
    return (
        comparisons.find(
            (candidate) => Number(candidate.digilab_tournament_id) === Number(externalId)
        ) ||
        comparisons[0] ||
        null
    );
}

function digilabMismatchLabel(reason) {
    const labels = {
        date: 'A data do torneio está diferente.',
        player_count: 'A quantidade de jogadores está diferente.',
        store: 'A loja está diferente.',
        scene: 'A scene do torneio não é Curitiba.',
        dnfs: 'O DigiLab possui um ou mais jogadores marcados como DNF.',
        standings_count: 'A quantidade de jogadores na classificação está diferente.',
        standings_players: 'A lista de jogadores da classificação está diferente.'
    };
    const placement = String(reason || '').match(/^standing_(\d+)$/);
    if (placement) return `O jogador da posição ${placement[1]} está diferente.`;
    return labels[reason] || `Divergência técnica: ${reason}.`;
}

function digilabWarningLabel(warning) {
    return (
        {
            format: 'o formato informado está diferente',
            tied_placements: 'o DigiLab retornou colocações empatadas'
        }[warning] || warning
    );
}

function renderDigilabPlayerMatch(standing, playerOptions) {
    const match = standing.player_match || {};
    if (match.player_id) {
        return `<span class="admin-digilab-player-match is-resolved">${escapeAdminHtml(match.player_name)} · ${match.status === 'mapped' ? 'mapeado' : 'nome exato'}</span>`;
    }
    const options = playerOptions
        .map(
            (player) =>
                `<option value="${escapeAdminHtml(player.player_id)}">${escapeAdminHtml(player.player_name)}</option>`
        )
        .join('');
    return `<select class="admin-digilab-player-select" data-digilab-player-slug="${escapeAdminHtml(standing.player?.slug || '')}" data-digilab-player-name="${escapeAdminHtml(standing.player?.name || '')}"><option value="">${match.status === 'unmatched' ? 'Cadastrar automaticamente' : 'Selecionar jogador…'}</option>${options}</select>`;
}

function renderDigilabDeckMatch(standing, deckOptions) {
    const match = standing.deck_match || {};
    if (!standing.deck?.slug && !standing.deck?.name) {
        return '<span class="admin-digilab-player-match">Não informado</span>';
    }
    if (match.deck_id) {
        return `<span class="admin-digilab-player-match is-resolved">${escapeAdminHtml(match.deck_name)} · ${match.status === 'mapped' ? 'mapeado' : 'nome exato'}</span>`;
    }
    const options = deckOptions
        .map(
            (deck) =>
                `<option value="${escapeAdminHtml(deck.deck_id)}">${escapeAdminHtml(deck.deck_name)}</option>`
        )
        .join('');
    return `<select class="admin-digilab-player-select admin-digilab-deck-select" data-digilab-deck-slug="${escapeAdminHtml(standing.deck?.slug || '')}" data-digilab-deck-name="${escapeAdminHtml(standing.deck?.name || '')}"><option value="">${match.status === 'unmatched' ? 'Cadastrar automaticamente (sem Deck Code)' : 'Selecionar deck…'}</option>${options}</select>`;
}

async function importDigilabTournament(externalId, triggerButton = null) {
    const detail = document.getElementById('adminDigilabDetail');
    const mappings = [...(detail?.querySelectorAll('[data-digilab-player-slug]') || [])].map(
        (select) => ({
            digilab_player_slug: select.dataset.digilabPlayerSlug,
            digilab_player_name: select.dataset.digilabPlayerName,
            player_id: select.value
        })
    );

    const deckMappings = [...(detail?.querySelectorAll('[data-digilab-deck-slug]') || [])].map(
        (select) => ({
            digilab_deck_slug: select.dataset.digilabDeckSlug,
            digilab_deck_name: select.dataset.digilabDeckName,
            deck_id: select.value
        })
    );

    const button =
        detail?.querySelector(
            `[data-admin-action="digilab-import"][data-id="${Number(externalId)}"]`
        ) || triggerButton;
    const callout = button?.closest('.admin-digilab-import-callout');
    const inlineProgress = callout?.querySelector('.admin-digilab-import-progress');
    const isSync = button?.dataset.mode === 'sync';
    const isReconcile = button?.dataset.mode === 'reconcile';
    const targetTournamentId = isReconcile ? Number(button?.dataset.targetId) : null;
    if (isReconcile) {
        const confirmed = window.confirm(
            `Completar o torneio DigiStats #${targetTournamentId} com a classificação do DigiLab? Participantes ausentes serão adicionados e posições, decks e pontos existentes serão atualizados.`
        );
        if (!confirmed) return;
    }
    if (button?.disabled) return;
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.innerHTML = `<span class="admin-digilab-button-spinner" aria-hidden="true"></span>${isReconcile ? 'Completando…' : isSync ? 'Sincronizando…' : 'Criando…'}`;
    }
    callout?.classList.add('is-importing');
    inlineProgress?.classList.remove('is-error');
    const inlineMessage = inlineProgress?.querySelector('small');
    if (inlineMessage) {
        inlineMessage.textContent = isReconcile
            ? 'Adicionando ausentes e corrigindo os resultados…'
            : isSync
              ? 'Validando e atualizando os resultados…'
              : 'Validando dados e criando o torneio…';
    }

    setDigilabStatus(
        `${isReconcile ? 'Completando' : isSync ? 'Sincronizando' : 'Criando'} o torneio DigiLab #${externalId} no DigiStats…`
    );
    try {
        const result = await callDigilabFunction('import-digilab-tournament', {
            digilab_tournament_id: externalId,
            target_tournament_id: targetTournamentId,
            player_mappings: mappings.filter((mapping) => mapping.player_id),
            deck_mappings: deckMappings.filter((mapping) => mapping.deck_id)
        });
        notifyTournamentListChanged(
            result.tournament_id,
            isReconcile ? 'digilab-reconcile' : isSync ? 'digilab-sync' : 'digilab-import'
        );
        adminDigilabPreviewCache.delete(externalId);
        adminDigilabAutoLinkResults.set(externalId, { status: 'linked' });
        callout?.classList.add('is-complete');
        if (inlineMessage) {
            inlineMessage.textContent = `${isReconcile ? `${Number(result.results_added) || 0} participante(s) adicionado(s)` : isSync ? 'Dados atualizados' : 'Torneio criado'} com sucesso: DigiStats #${result.tournament_id}.`;
        }
        setDigilabStatus(
            `${isReconcile ? `Torneio completado: ${Number(result.results_added) || 0} participante(s) adicionado(s) e ${Number(result.results_updated) || 0} atualizado(s)` : isSync ? 'Torneio atualizado' : 'Torneio criado'} no DigiStats com ID #${result.tournament_id}.`
        );
        await loadDigilabInventory(adminDigilabPage, {
            skipAutoLink: true,
            skipAutoImport: true
        });
    } catch (error) {
        callout?.classList.remove('is-importing');
        inlineProgress?.classList.add('is-error');
        if (inlineMessage)
            inlineMessage.textContent = `Falha ao ${isReconcile ? 'completar' : isSync ? 'sincronizar' : 'criar'}: ${error.message}`;
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = 'Tentar novamente';
        }
        setDigilabStatus(error.message, true);
    }
}

async function verifyDigilabTournament(localId, digilabId, options = {}) {
    if (!Number.isSafeInteger(localId) || !Number.isSafeInteger(digilabId)) return;
    const forceMatch = options.forceMatch === true;
    const button = options.button || null;
    if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.innerHTML =
            '<span class="admin-digilab-button-spinner" aria-hidden="true"></span>Confirmando…';
    }
    setDigilabStatus(
        `${forceMatch ? 'Confirmando' : 'Validando'} DigiStats #${localId} com DigiLab #${digilabId}…`
    );
    try {
        const result = await callDigilabFunction('verify-digilab-tournaments', {
            tournament_id: localId,
            digilab_tournament_id: digilabId,
            force_match: forceMatch
        });
        if (result.status !== 'matched' && result.sync?.status !== 'matched') {
            throw new Error(`A verificação retornou: ${result.status || 'sem correspondência'}.`);
        }
        adminDigilabAutoLinkResults.set(digilabId, { status: 'linked' });
        adminDigilabPreviewCache.delete(digilabId);
        setDigilabStatus(`Vínculo confirmado: DigiStats #${localId} ↔ DigiLab #${digilabId}.`);
        await loadDigilabInventory(adminDigilabPage, {
            skipAutoLink: true,
            skipAutoImport: true
        });
    } catch (error) {
        if (button) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = 'Tentar confirmar novamente';
        }
        setDigilabStatus(error.message, true);
    }
}

function setDigilabStatus(message, isError = false) {
    const host = document.getElementById('adminDigilabStatus');
    if (!host) return;
    host.textContent = message;
    host.classList.toggle('is-error', isError);
}

function digilabStatusLabel(status) {
    return (
        {
            linked: 'Vinculado',
            linked_needs_review: 'Vinculado · revisar dados',
            linked_synced: 'Vinculado · já sincronizado',
            linked_data_ok: 'Decks conferidos',
            linked_data_mismatch: 'Revisar decks',
            exact_local_candidate: 'Candidato exato',
            possible_local_candidate: 'Possível candidato',
            ambiguous: 'Ambíguo',
            new_import: 'Novo no DigiStats',
            verification_mismatch: 'Revisar validação',
            verification_error: 'Erro ao validar',
            cooldown: 'Aguardando nova tentativa',
            rate_limited: 'Aguardando limite',
            import_needs_mapping: 'Mapear jogadores',
            import_error: 'Erro ao importar',
            linked_needs_mapping: 'Revisar de-para',
            linked_sync_error: 'Erro ao sincronizar'
        }[status] ||
        status ||
        '—'
    );
}

async function loadDigilabDeckCatalog(syncFromDigilab) {
    const host = document.getElementById('adminDigilabDeckCatalog');
    if (!host) return;
    host.classList.remove('is-hidden');
    if (!syncFromDigilab && adminDigilabDeckCatalogLoaded && adminDigilabDeckCatalog) {
        renderDigilabDeckCatalog();
        const usedCount = (adminDigilabDeckCatalog.data || []).filter(
            (row) => row.is_active
        ).length;
        setDigilabDeckStatus(`${usedCount} arquétipos ativos sincronizados carregados.`);
        return;
    }
    host.innerHTML = '<div class="admin-loading"><div class="spinner"></div></div>';
    setDigilabDeckStatus(
        syncFromDigilab ? 'Sincronizando decks, famílias e formatos…' : 'Carregando catálogo salvo…'
    );
    try {
        const result = await callDigilabFunction('digilab-deck-catalog', {
            action: syncFromDigilab ? 'sync' : 'list'
        });
        adminDigilabDeckCatalog = result;
        adminDigilabDeckCatalogLoaded = true;
        renderDigilabDeckCatalog();
        const requestText = syncFromDigilab
            ? ` ${Number(result.request_count) || 0} requisição(ões) ao DigiLab.`
            : '';
        const usedCount = (result.data || []).filter((row) => row.is_active).length;
        setDigilabDeckStatus(
            `${usedCount} arquétipos ativos sincronizados; ${result.family_options?.length || 0} famílias.${requestText}`
        );
    } catch (error) {
        host.innerHTML = `<p class="admin-error">${escapeAdminHtml(error.message)}</p>`;
        setDigilabDeckStatus(error.message, true);
    }
}

function renderDigilabDeckCatalog() {
    const host = document.getElementById('adminDigilabDeckCatalog');
    if (!host || !adminDigilabDeckCatalog) return;
    const allRows = Array.isArray(adminDigilabDeckCatalog.data) ? adminDigilabDeckCatalog.data : [];
    const rows = allRows.filter((row) => row.is_active);
    const familyOptions = Array.isArray(adminDigilabDeckCatalog.family_options)
        ? adminDigilabDeckCatalog.family_options
        : [];
    const visibleCounts = rows.reduce(
        (summary, row) => {
            summary[row.status] = (summary[row.status] || 0) + 1;
            return summary;
        },
        { mapped: 0, exact_name: 0, unmapped: 0 }
    );
    const query = normalizeDigilabCatalogText(adminDigilabDeckFilters.query);
    const filteredRows = rows.filter((row) => {
        const matchesQuery =
            !query ||
            normalizeDigilabCatalogText(
                `${row.name} ${row.slug} ${row.family_name || ''}`
            ).includes(query);
        const matchesStatus =
            adminDigilabDeckFilters.status === 'all' ||
            row.status === adminDigilabDeckFilters.status;
        const rowFamily = row.local_family?.family_id || row.family_slug || 'none';
        const matchesFamily =
            adminDigilabDeckFilters.family === 'all' ||
            rowFamily === adminDigilabDeckFilters.family;
        return matchesQuery && matchesStatus && matchesFamily;
    });
    host.innerHTML = `
        <div class="admin-digilab-catalog-summary">
            <span><strong>${Number(visibleCounts.mapped) || 0}</strong> mapeados</span>
            <span><strong>${Number(visibleCounts.exact_name) || 0}</strong> nomes iguais</span>
            <span><strong>${Number(visibleCounts.unmapped) || 0}</strong> sem correspondente</span>
            <span>Atualização automática a cada 6 horas</span>
        </div>
        <div class="admin-digilab-catalog-toolbar">
            <label class="admin-digilab-catalog-search">
                <span>Buscar</span>
                <input type="search" placeholder="Nome, slug ou família" value="${escapeAdminHtml(adminDigilabDeckFilters.query)}" data-digilab-deck-filter="query">
            </label>
            <label>
                <span>Situação</span>
                <select data-digilab-deck-filter="status">
                    <option value="all" ${adminDigilabDeckFilters.status === 'all' ? 'selected' : ''}>Todas</option>
                    <option value="mapped" ${adminDigilabDeckFilters.status === 'mapped' ? 'selected' : ''}>Mapeados</option>
                    <option value="exact_name" ${adminDigilabDeckFilters.status === 'exact_name' ? 'selected' : ''}>Nomes iguais</option>
                    <option value="unmapped" ${adminDigilabDeckFilters.status === 'unmapped' ? 'selected' : ''}>Sem correspondente</option>
                </select>
            </label>
            <label>
                <span>Categoria / família</span>
                <select data-digilab-deck-filter="family">
                    <option value="all" ${adminDigilabDeckFilters.family === 'all' ? 'selected' : ''}>Todas</option>
                    <option value="none" ${adminDigilabDeckFilters.family === 'none' ? 'selected' : ''}>Sem família</option>
                    ${familyOptions.map((family) => `<option value="${escapeAdminHtml(family.family_id)}" ${adminDigilabDeckFilters.family === family.family_id ? 'selected' : ''}>${escapeAdminHtml(family.family_name)}</option>`).join('')}
                    ${[...new Map(rows.filter((row) => row.family_slug && !row.local_family).map((row) => [row.family_slug, row.family_name || row.family_slug])).entries()].map(([slug, name]) => `<option value="${escapeAdminHtml(slug)}" ${adminDigilabDeckFilters.family === slug ? 'selected' : ''}>${escapeAdminHtml(name)}</option>`).join('')}
                </select>
            </label>

        </div>
        <p class="admin-digilab-catalog-result-count">Exibindo ${filteredRows.length} de ${rows.length} arquétipos ativos sincronizados.</p>
        <div class="admin-table-wrapper admin-digilab-catalog-table-shell">
            <table class="admin-table admin-digilab-catalog-table">
                <thead><tr><th>Arquétipo DigiLab</th><th>Família</th><th>Cores</th><th>Deck DigiStats</th><th>Família local</th><th>Situação</th></tr></thead>
                <tbody>${filteredRows.length ? filteredRows.map(renderDigilabDeckCatalogRow).join('') : `<tr><td colspan="6" class="admin-empty">${rows.length ? 'Nenhum arquétipo corresponde aos filtros.' : 'Nenhum arquétipo ativo foi encontrado no catálogo.'}</td></tr>`}</tbody>
            </table>
        </div>`;
}

function normalizeDigilabCatalogText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLocaleLowerCase('pt-BR');
}

function renderDigilabDeckCatalogRow(row) {
    return `<tr>
        <td><strong>${escapeAdminHtml(row.name)}</strong><small class="admin-digilab-player-slug">${escapeAdminHtml(row.slug)}</small></td>
        <td>${escapeAdminHtml(row.family_name || '—')}</td>
        <td>${escapeAdminHtml([row.primary_color, row.secondary_color].filter(Boolean).join(' / ') || '—')}</td>
        <td>${escapeAdminHtml(row.local_deck?.deck_name || '—')}</td>
        <td>${escapeAdminHtml(row.local_family?.family_name || '—')}</td>
        <td><span class="admin-digilab-badge status-${escapeAdminHtml(row.status)}">${row.status === 'mapped' ? 'Sincronizado' : 'Pendente'}</span></td>
    </tr>`;
}

function captureDigilabCatalogViewport(row) {
    const shell = row?.closest('.admin-digilab-catalog-table-shell');
    if (!shell) return null;
    return {
        archetypeId: row?.dataset.catalogArchetypeId || null,
        scrollTop: shell.scrollTop,
        rowOffset: row ? row.offsetTop - shell.scrollTop : null
    };
}

function restoreDigilabCatalogViewport(viewport) {
    if (!viewport) return;
    window.requestAnimationFrame(() => {
        const shell = document.querySelector('.admin-digilab-catalog-table-shell');
        if (!shell) return;
        const row = viewport.archetypeId
            ? shell.querySelector(
                  `[data-catalog-archetype-id="${CSS.escape(String(viewport.archetypeId))}"]`
              )
            : null;
        shell.scrollTop =
            row && Number.isFinite(viewport.rowOffset)
                ? Math.max(0, row.offsetTop - viewport.rowOffset)
                : viewport.scrollTop;
    });
}

function setDigilabDeckStatus(message, isError = false) {
    const host = document.getElementById('adminDigilabDeckStatus');
    if (!host) return;
    host.textContent = message;
    host.classList.toggle('is-error', isError);
}

function formatAdminDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : String(value);
}

// ============================================================
// FORMATS / META
// ============================================================
async function loadAdminFormats() {
    const host = document.getElementById('adminFormatsBody');
    if (!host) return;
    host.innerHTML =
        '<tr><td colspan="6" class="admin-loading"><div class="spinner"></div></td></tr>';

    try {
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?select=*&order=created_at.desc,id.desc`,
            { headers: window.createSupabaseHeaders() }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        adminFormats = await res.json();
        adminFormatsLoaded = true;
        renderAdminFormats();
    } catch (err) {
        host.innerHTML = `<tr><td colspan="6" class="admin-error">${escapeAdminHtml(err.message)}</td></tr>`;
    }
}

function renderAdminFormats() {
    const host = document.getElementById('adminFormatsBody');
    if (!host) return;

    if (!adminFormats.length) {
        host.innerHTML =
            '<tr><td colspan="5" class="admin-empty">Nenhuma coleção cadastrada.</td></tr>';
        return;
    }

    const rows = adminListPage(
        'Formats',
        [...adminFormats].sort(
            (a, b) =>
                Number(b.is_default) - Number(a.is_default) ||
                Number(b.is_active) - Number(a.is_active)
        ),
        renderAdminFormats
    );
    host.innerHTML =
        rows
            .map(
                (f) => `
        <tr>
            <td><code>${escapeAdminHtml(f.code || '')}</code></td>
            <td>${escapeAdminHtml(f.name || '—')}</td>
            <td>${f.is_default ? '<span class="admin-badge admin-badge--default">Padrão</span>' : ''}</td>
            <td>${f.is_active ? '<span class="admin-badge admin-badge--active">Ativo</span>' : '<span class="admin-badge admin-badge--inactive">Inativo</span>'}</td>
            <td class="admin-actions-cell">
                ${!f.is_default ? `<button class="player-history-register-btn" data-admin-action="set-default-format" data-id="${f.id}">Definir padrão</button>` : ''}
                <button class="player-history-register-btn" data-admin-action="edit-format" data-id="${f.id}">Editar</button>
                <button class="player-history-register-btn${f.is_active ? ' admin-btn-warn' : ''}" data-admin-action="toggle-format-active" data-id="${f.id}">${f.is_active ? 'Desativar' : 'Ativar'}</button>
                ${!f.is_default ? `<button class="player-history-register-btn admin-btn-danger" data-admin-action="delete-format" data-id="${f.id}" data-name="${escapeAdminHtml(f.name || f.code)}">Excluir</button>` : ''}
            </td>
        </tr>
    `
            )
            .join('') ||
        '<tr><td colspan="5" class="admin-empty">Nenhuma coleção encontrada.</td></tr>';
    labelAdminList(host);
}

function openFormatModal(id) {
    const format = id ? adminFormats.find((f) => f.id === id) : null;
    const modal = document.getElementById('adminFormatModal');
    if (!modal) return;

    modal.querySelector('#adminFormatId').value = id || '';
    modal.querySelector('#adminFormatCode').value = format?.code || '';
    modal.querySelector('#adminFormatName').value = format?.name || '';
    modal.querySelector('#adminFormatIsActive').checked = format ? format.is_active : true;
    modal.querySelector('#adminFormatIsDefault').checked = format?.is_default || false;
    modal.querySelector('#adminFormatStatus').textContent = '';

    modal.querySelector('.admin-modal-title').textContent = format
        ? 'Editar coleção'
        : 'Nova coleção';
    showAdminModal(modal, 'adminFormatCode');
}

function closeFormatModal() {
    const modal = document.getElementById('adminFormatModal');
    hideAdminModal(modal);
}

function beginAdminFormSave(formId) {
    const form = document.getElementById(formId);
    if (!form || form.dataset.saving === 'true') return null;
    form.dataset.saving = 'true';
    const previousBusy = form.getAttribute('aria-busy');
    form.setAttribute('aria-busy', 'true');
    const buttons = [...form.querySelectorAll('[type="submit"]')].map((button) => ({
        button,
        disabled: button.disabled,
        text: button.textContent
    }));
    buttons.forEach(({ button }) => {
        button.disabled = true;
        button.textContent = 'Salvando…';
    });
    return () => {
        delete form.dataset.saving;
        if (previousBusy === null) form.removeAttribute('aria-busy');
        else form.setAttribute('aria-busy', previousBusy);
        buttons.forEach(({ button, disabled, text }) => {
            button.disabled = disabled;
            button.textContent = text;
        });
    };
}

async function saveFormat(e) {
    e.preventDefault();
    const modal = document.getElementById('adminFormatModal');
    const statusEl = modal.querySelector('#adminFormatStatus');
    const id = modal.querySelector('#adminFormatId').value;
    const code = modal.querySelector('#adminFormatCode').value.trim().toUpperCase();
    const name = modal.querySelector('#adminFormatName').value.trim();
    const isActive = modal.querySelector('#adminFormatIsActive').checked;
    const isDefault = modal.querySelector('#adminFormatIsDefault').checked;

    if (!code) {
        statusEl.textContent = 'Code is required.';
        return;
    }

    const finishSave = beginAdminFormSave('adminFormatForm');
    if (!finishSave) return;
    statusEl.textContent = 'Salvando…';

    try {
        await refreshAdminSessionIfNeeded();
        const payload = { code, name: name || null, is_active: isActive, is_default: isDefault };

        const headers = createAuthenticatedAdminHeaders({ Prefer: 'return=representation' });

        if (isDefault) await clearOtherDefaults(id || null);

        const url = id
            ? `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?id=eq.${id}`
            : `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats`;

        const res = await fetch(url, {
            method: id ? 'PATCH' : 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || err.details || `HTTP ${res.status}`);
        }

        closeFormatModal();
        await loadAdminFormats();
    } catch (err) {
        statusEl.textContent = `Erro: ${err.message}`;
    } finally {
        finishSave();
    }
}

async function clearOtherDefaults(excludeId) {
    const filter = excludeId ? `is_default=eq.true&id=neq.${excludeId}` : 'is_default=eq.true';
    await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?${filter}`, {
        method: 'PATCH',
        headers: {
            ...window.createSupabaseHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        },
        body: JSON.stringify({ is_default: false })
    });
}

async function setDefaultFormat(id) {
    if (!id) return;
    const headers = {
        ...window.createSupabaseHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
    };
    await clearOtherDefaults(id);
    const res = await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_default: true })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to set default: ${err.message || res.status}`);
        return;
    }
    await loadAdminFormats();
}

async function toggleFormatActive(id) {
    if (!id) return;
    const format = adminFormats.find((f) => f.id === id);
    if (!format) return;
    const newActive = !format.is_active;
    const res = await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
            ...window.createSupabaseHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        },
        body: JSON.stringify({ is_active: newActive })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to update: ${err.message || res.status}`);
        return;
    }
    await loadAdminFormats();
}

async function deleteFormat(id, name) {
    if (!id) return;
    const wasDefault = adminFormats.find((f) => f.id === id)?.is_default === true;
    if (
        !confirm(
            `Delete format "${name}"? This cannot be undone.\n\nIf this format is linked to tournaments, use "Deactivate" instead.`
        )
    )
        return;
    const res = await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?id=eq.${id}`, {
        method: 'DELETE',
        headers: { ...window.createSupabaseHeaders(), Prefer: 'count=exact' }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.message || err.details || `HTTP ${res.status}`;
        const isFk =
            msg.toLowerCase().includes('foreign key') || msg.toLowerCase().includes('violates');
        alert(
            `Failed to delete: ${msg}${isFk ? '\n\nThis format is referenced by tournaments. Use "Deactivate" instead.' : ''}`
        );
        return;
    }
    // count=exact: Content-Range header is "*/N" where N = rows affected
    const contentRange = res.headers.get('Content-Range') || '';
    const deleted = parseInt(contentRange.replace('*/', ''), 10);
    if (!isNaN(deleted) && deleted === 0) {
        alert(
            'Nothing was deleted. This is likely blocked by a RLS policy on the formats table.\n\nPlease delete directly via the Supabase dashboard, or use "Deactivate" instead.'
        );
        return;
    }
    // If the deleted format was the default, promote the most recently created remaining format
    if (wasDefault) {
        const remaining = adminFormats.filter((f) => f.id !== id);
        const newest = remaining.reduce((a, b) => ((a?.id || 0) > (b?.id || 0) ? a : b), null);
        if (newest?.id) {
            await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/formats?id=eq.${newest.id}`, {
                method: 'PATCH',
                headers: {
                    ...window.createSupabaseHeaders(),
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify({ is_default: true })
            });
        }
    }
    await loadAdminFormats();
}

async function uploadFormatBackground(file, code) {
    const ext = file.name.split('.').pop().toLowerCase() || 'png';
    const path = `${code}.${ext}`;
    const bucket = 'post-backgrounds';
    const uploadUrl = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`,
            'Content-Type': file.type || 'application/octet-stream',
            'x-upsert': 'true'
        },
        body: file
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Upload failed: HTTP ${res.status}`);
    }

    const publicUrl = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    return { path, url: publicUrl };
}

// ============================================================
// BAN LIST
// ============================================================
async function loadAdminBanList() {
    const host = document.getElementById('adminBanListBody');
    if (!host) return;
    host.innerHTML =
        '<tr><td colspan="5" class="admin-loading"><div class="spinner"></div></td></tr>';

    try {
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/ban_list?select=*&order=restriction.asc,card_code.asc`,
            { headers: window.createSupabaseHeaders() }
        );

        if (!res.ok) {
            if (res.status === 404 || res.status === 400) {
                host.innerHTML =
                    '<tr><td colspan="5" class="admin-empty">Ban list table not found. Run the migration <code>20260320_create_ban_list.sql</code> first.</td></tr>';
                return;
            }
            throw new Error(`HTTP ${res.status}`);
        }

        adminBanList = await res.json();
        adminBanListLoaded = true;

        // Build name map from ban_list.card_name
        adminBanNameMap = {};
        adminBanList.forEach((e) => {
            if (e.card_name) adminBanNameMap[e.card_code] = e.card_name;
        });

        renderAdminBanList();
    } catch (err) {
        host.innerHTML = `<tr><td colspan="5" class="admin-error">${escapeAdminHtml(err.message)}</td></tr>`;
    }
}

function renderAdminBanList() {
    const host = document.getElementById('adminBanListBody');
    const countEl = document.getElementById('adminBanListCount');
    if (!host) return;

    if (!adminBanList.length) {
        host.innerHTML =
            '<tr><td colspan="5" class="admin-empty">Nenhuma restrição cadastrada.</td></tr>';
        if (countEl) countEl.textContent = '';
        return;
    }

    const query = (document.getElementById('adminBanListSearch')?.value || '').trim().toUpperCase();
    const filtered = query
        ? adminBanList.filter((e) => {
              const name = adminBanNameMap[e.card_code] || '';
              return (
                  e.card_code.toUpperCase().includes(query) || name.toUpperCase().includes(query)
              );
          })
        : adminBanList;

    if (countEl) {
        countEl.textContent = query
            ? `${filtered.length} de ${adminBanList.length}`
            : `${adminBanList.length} restrições`;
    }

    if (!filtered.length) {
        host.innerHTML = `<tr><td colspan="5" class="admin-empty">Nenhum resultado para "${escapeAdminHtml(query)}".</td></tr>`;
        return;
    }

    const LABELS = {
        banned: 'Proibida',
        limited: 'Limitada (1 cópia)',
        'choice-restricted': 'Restrição de combinação'
    };
    const BADGE_CLASS = {
        banned: 'admin-badge--banned',
        limited: 'admin-badge--limited',
        'choice-restricted': 'admin-badge--choice'
    };

    host.innerHTML = adminListPage('BanList', filtered, renderAdminBanList)
        .map((entry) => {
            const name = adminBanNameMap[entry.card_code];
            const previewAttr = `data-card-preview-code="${encodeURIComponent(entry.card_code)}"`;
            return `
        <tr>
            <td><code class="stats-card-hover" ${previewAttr}>${escapeAdminHtml(entry.card_code)}</code></td>
            <td class="admin-dim">${name ? `<span class="stats-card-hover" ${previewAttr}>${escapeAdminHtml(name)}</span>` : '<span style="opacity:.45">—</span>'}</td>
            <td><span class="admin-badge ${BADGE_CLASS[entry.restriction] || ''}">${LABELS[entry.restriction] || escapeAdminHtml(entry.restriction)}</span></td>
            <td class="admin-dim">${escapeAdminHtml(entry.notes || '—')}</td>
            <td class="admin-actions-cell">
                <button class="player-history-register-btn" data-admin-action="edit-ban" data-code="${escapeAdminHtml(entry.card_code)}">Editar</button>
                <button class="player-history-register-btn admin-btn-danger" data-admin-action="remove-ban" data-code="${escapeAdminHtml(entry.card_code)}">Remover</button>
            </td>
        </tr>`;
        })
        .join('');

    labelAdminList(host);
    if (typeof bindStatisticsCardPreview === 'function') {
        bindStatisticsCardPreview(host);
    }
}

function openBanModal(cardCode) {
    const entry = cardCode ? adminBanList.find((b) => b.card_code === cardCode) : null;
    const modal = document.getElementById('adminBanModal');
    if (!modal) return;

    const codeInput = modal.querySelector('#adminBanCardCode');
    codeInput.value = entry?.card_code || '';
    modal.querySelector('#adminBanOriginalCode').value = entry?.card_code || '';

    modal.querySelector('#adminBanRestriction').value = entry?.restriction || 'limited';
    modal.querySelector('#adminBanNotes').value = entry?.notes || '';
    modal.querySelector('#adminBanStatus').textContent = '';
    modal.querySelector('.admin-modal-title').textContent = entry
        ? 'Editar restrição'
        : 'Adicionar restrição';
    updateBanCardPreview(entry?.card_code || '');
    showAdminModal(modal, 'adminBanCardCode');
}

function closeBanModal() {
    const modal = document.getElementById('adminBanModal');
    hideAdminModal(modal);
}

async function saveBanEntry(e) {
    e.preventDefault();
    const modal = document.getElementById('adminBanModal');
    const statusEl = modal.querySelector('#adminBanStatus');
    const cardCode = modal.querySelector('#adminBanCardCode').value.trim().toUpperCase();
    const originalCode = modal.querySelector('#adminBanOriginalCode').value.trim().toUpperCase();
    const restriction = modal.querySelector('#adminBanRestriction').value;
    const notes = modal.querySelector('#adminBanNotes').value.trim();

    if (!cardCode) {
        statusEl.textContent = 'Informe o código da carta.';
        return;
    }

    const finishSave = beginAdminFormSave('adminBanForm');
    if (!finishSave) return;
    statusEl.textContent = 'Salvando…';

    try {
        const headers = {
            ...window.createSupabaseHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
        };

        const isEdit = !!originalCode;
        let res;

        if (isEdit) {
            // PATCH by original code — allows changing the code itself
            res = await fetch(
                `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/ban_list?card_code=eq.${encodeURIComponent(originalCode)}`,
                {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        card_code: cardCode,
                        restriction,
                        notes: notes || null,
                        card_name: adminBanNameMap[cardCode] || null
                    })
                }
            );
        } else {
            res = await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/ban_list`, {
                method: 'POST',
                headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify({
                    card_code: cardCode,
                    restriction,
                    notes: notes || null,
                    card_name: adminBanNameMap[cardCode] || null
                })
            });
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || err.details || `HTTP ${res.status}`);
        }

        closeBanModal();
        await loadAdminBanList();
    } catch (err) {
        statusEl.textContent = `Erro: ${err.message}`;
    } finally {
        finishSave();
    }
}

async function removeBanEntry(cardCode) {
    if (!cardCode) return;
    if (!confirm(`Remove restriction for "${cardCode}"?`)) return;

    const res = await fetch(
        `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/ban_list?card_code=eq.${encodeURIComponent(cardCode)}`,
        { method: 'DELETE', headers: window.createSupabaseHeaders() }
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to remove: ${err.message || res.status}`);
        return;
    }
    await loadAdminBanList();
}

// ============================================================
// BAN CARD PREVIEW
// ============================================================
const CARD_IMAGE_CDNS = [
    (code) => `https://digimon.digilab.cards/api/card/${code}.jpg`,
    (code) => `https://deckbuilder.egmanevents.com//card_images/digimon/${code}.webp`
];

function updateBanCardPreview(code) {
    const container = document.getElementById('adminBanCardPreview');
    if (!container) return;

    // Cancel any pending debounced API fetch
    if (_banPreviewDebounceTimer) {
        clearTimeout(_banPreviewDebounceTimer);
        _banPreviewDebounceTimer = null;
    }

    // Simple validation: must look like a card code
    if (!code || !/^[A-Z]{1,3}\d{1,2}-\d{1,3}$/.test(code)) {
        container.innerHTML = '';
        return;
    }

    const candidates = CARD_IMAGE_CDNS.map((fn) => fn(code));

    // Show image + placeholder name immediately
    container.innerHTML = `
        <img
            class="admin-ban-card-img"
            src="${escapeAdminHtml(candidates[0])}"
            alt="${escapeAdminHtml(code)}"
            data-candidates='${JSON.stringify(candidates)}'
            data-candidate-index="0"
        />
        <p class="admin-ban-card-name" id="adminBanCardName" style="margin:6px 0 0;font-size:.85rem;text-align:center;opacity:.6;">…</p>
    `;

    const img = container.querySelector('img');
    img.addEventListener('error', () => {
        const list = JSON.parse(img.dataset.candidates || '[]');
        const next = Number(img.dataset.candidateIndex || 0) + 1;
        if (next < list.length) {
            img.dataset.candidateIndex = next;
            img.src = list[next];
        } else {
            img.remove();
        }
    });

    // Check local cache first
    if (adminBanNameMap[code]) {
        const nameEl = document.getElementById('adminBanCardName');
        if (nameEl) nameEl.textContent = adminBanNameMap[code];
        return;
    }

    // Debounce API fetch (400 ms)
    _banPreviewDebounceTimer = setTimeout(() => fetchAndCacheBanCardName(code), 400);
}

async function fetchAndCacheBanCardName(code) {
    const nameEl = document.getElementById('adminBanCardName');
    try {
        const apiUrl = `https://digimoncard.io/api-public/search?card=${encodeURIComponent(code)}&limit=1`;
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const card = Array.isArray(data) ? data[0] : data;
        const name = card?.name || null;

        if (name) {
            adminBanNameMap[code] = name;
            if (nameEl) nameEl.textContent = name;

            // Save name into ban_list.card_name (only if card is in ban_list)
            if (adminBanList.some((e) => e.card_code === code)) {
                try {
                    await fetch(
                        `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/ban_list?card_code=eq.${encodeURIComponent(code)}`,
                        {
                            method: 'PATCH',
                            headers: {
                                ...window.createSupabaseHeaders(),
                                'Content-Type': 'application/json',
                                Prefer: 'return=minimal'
                            },
                            body: JSON.stringify({ card_name: name })
                        }
                    );
                } catch (_) {
                    /* best-effort */
                }
            }
        } else {
            if (nameEl) nameEl.textContent = '';
        }
    } catch (_) {
        if (nameEl) nameEl.textContent = '';
    }
}

// ============================================================
// BUCKET IMAGE BROWSER
// ============================================================
async function toggleBucketBrowser() {
    const browser = document.getElementById('adminBucketBrowser');
    if (!browser) return;

    if (!browser.classList.contains('is-hidden')) {
        browser.classList.add('is-hidden');
        return;
    }

    browser.classList.remove('is-hidden');
    const grid = document.getElementById('adminBucketImages');
    if (!grid) return;

    grid.innerHTML = '<p style="padding:12px;opacity:.6;">Carregando…</p>';

    try {
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/list/post-backgrounds`,
            {
                method: 'POST',
                headers: {
                    apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prefix: '',
                    limit: 200,
                    offset: 0,
                    sortBy: { column: 'name', order: 'asc' }
                })
            }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const files = await res.json();

        if (!Array.isArray(files) || files.length === 0) {
            grid.innerHTML = '<p style="padding:12px;opacity:.6;">Nenhuma imagem encontrada.</p>';
            return;
        }

        const base = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/post-backgrounds/`;

        grid.innerHTML = files
            .filter((f) => f.name && !f.name.endsWith('/'))
            .map((f) => {
                const url = base + encodeURIComponent(f.name);
                const displayName = f.name;
                const fullPath = f.name;
                const safeName = escapeAdminHtml(displayName);
                const safeUrl = escapeAdminHtml(url);
                const safePath = escapeAdminHtml(fullPath);
                return `
                <button type="button" class="admin-bucket-thumb" data-admin-action="select-bucket-image"
                    data-url="${safeUrl}" data-path="${safePath}" title="${safeName}">
                    <img src="${safeUrl}" alt="${safeName}" loading="lazy" />
                    <span class="admin-bucket-thumb-name">${safeName}</span>
                </button>`;
            })
            .join('');
    } catch (err) {
        grid.innerHTML = `<p style="padding:12px;color:var(--color-danger,#e74c3c);">${escapeAdminHtml(err.message)}</p>`;
    }
}

function autoDetectFormatBackground(code) {
    if (!code || !window.APP_CONFIG?.SUPABASE_URL) return;
    const extensions = ['png', 'jpg', 'jpeg', 'webp'];
    const bucketBase = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/post-backgrounds/`;

    let found = false;
    for (const ext of extensions) {
        if (found) break;
        const url = `${bucketBase}${encodeURIComponent(code)}.${ext}`;
        const path = `${code}.${ext}`;
        const img = new Image();
        img.onload = () => {
            if (found) return;
            found = true;
            const urlInput = document.getElementById('adminFormatBgUrl');
            if (!urlInput || urlInput.value) return;
            setFormatBgPreview(url, url, path);
        };
        img.src = url;
    }
}

function selectBucketImage(url, path) {
    setFormatBgPreview(url, url, path);
    const browser = document.getElementById('adminBucketBrowser');
    if (browser) browser.classList.add('is-hidden');
}

// ============================================================
// STORE BUCKET BROWSER
// ============================================================
async function toggleStoreBucketBrowser() {
    const browser = document.getElementById('adminStoreBucketBrowser');
    if (!browser) return;

    if (!browser.classList.contains('is-hidden')) {
        browser.classList.add('is-hidden');
        return;
    }

    browser.classList.remove('is-hidden');
    const grid = document.getElementById('adminStoreBucketImages');
    if (!grid) return;

    grid.innerHTML = '<p style="padding:12px;opacity:.6;">Carregando…</p>';

    const bucketBase = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/store-logos/`;
    const listHeaders = {
        apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
    };

    async function listPrefix(prefix) {
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/list/store-logos`,
            {
                method: 'POST',
                headers: listHeaders,
                body: JSON.stringify({
                    prefix,
                    limit: 200,
                    offset: 0,
                    sortBy: { column: 'name', order: 'asc' }
                })
            }
        );
        if (!res.ok) return [];
        const items = await res.json();
        return Array.isArray(items) ? items : [];
    }

    try {
        // Collect files from root AND stores/ subfolder (covers pre-loaded + admin-uploaded)
        const [rootFiles, subFiles] = await Promise.all([listPrefix(''), listPrefix('stores/')]);

        const entries = [
            ...rootFiles
                .filter((f) => f.name && !f.name.endsWith('/') && f.id) // exclude directory entries
                .map((f) => ({ name: f.name, url: bucketBase + encodeURIComponent(f.name) })),
            ...subFiles
                .filter((f) => f.name && !f.name.endsWith('/') && f.id)
                .map((f) => ({
                    name: f.name,
                    url: bucketBase + 'stores/' + encodeURIComponent(f.name)
                }))
        ];

        if (entries.length === 0) {
            grid.innerHTML =
                '<p style="padding:12px;opacity:.6;">No logos found in store-logos bucket.</p>';
            return;
        }

        grid.innerHTML = entries
            .map(({ name, url }) => {
                const safeName = escapeAdminHtml(name);
                const safeUrl = escapeAdminHtml(url);
                return `
                <button type="button" class="admin-bucket-thumb" data-admin-action="select-store-logo"
                    data-url="${safeUrl}" title="${safeName}">
                    <img src="${safeUrl}" alt="${safeName}" loading="lazy" />
                    <span class="admin-bucket-thumb-name">${safeName}</span>
                </button>`;
            })
            .join('');
    } catch (err) {
        grid.innerHTML = `<p style="padding:12px;color:var(--color-danger,#e74c3c);">${escapeAdminHtml(err.message)}</p>`;
    }
}

function selectStoreLogo(url) {
    setStoreLogoPreview(url);
    const browser = document.getElementById('adminStoreBucketBrowser');
    if (browser) browser.classList.add('is-hidden');
}

function setFormatBgPreview(src, url, path) {
    const wrap = document.getElementById('adminFormatBgSelectedWrap');
    const img = document.getElementById('adminFormatBgPreview');
    const urlInput = document.getElementById('adminFormatBgUrl');
    const pathInput = document.getElementById('adminFormatBgPath');

    // Always remove leftover fallback label from a previous error
    if (wrap) {
        wrap.querySelectorAll('.admin-bg-fallback-label').forEach((el) => el.remove());
        wrap.style.display = src ? 'flex' : 'none';
    }
    if (img) {
        img.style.display = src ? '' : 'none';
        img.alt = 'Selected background';
        img.onerror = () => {
            console.warn('[adminBgPreview] failed to load:', src);
            img.style.display = 'none';
            if (wrap) {
                const fl = document.createElement('span');
                fl.className = 'admin-bg-fallback-label';
                fl.textContent = path || (src ? src.split('/').pop() : '');
                wrap.insertBefore(fl, wrap.firstChild);
            }
        };
        img.src = src || '';
    }
    if (urlInput) urlInput.value = url || '';
    if (pathInput) pathInput.value = path || '';
}

function clearFormatBackground() {
    setFormatBgPreview(null, null, null);
    const fileInput = document.getElementById('adminFormatFile');
    if (fileInput) fileInput.value = '';
}

// ============================================================
// DATA REPAIR
// ============================================================
const REPAIR_DIGIMON_API = 'https://digimoncard.io/api-public/search';
let _repairIncompleteCodesCache = null;

function deriveCardMeta(row) {
    const typeRaw = String(row?.type || '')
        .trim()
        .toLowerCase();
    let card_level =
        Number.isFinite(Number(row?.level)) && row?.level !== '' && row?.level !== null
            ? Math.trunc(Number(row.level))
            : null;
    let card_type = null;
    if (typeRaw === 'digi-egg' || typeRaw === 'digitama') card_type = 'Digi-Egg';
    else if (typeRaw === 'digimon') card_type = 'Digimon';
    else if (typeRaw === 'tamer') card_type = 'Tamer';
    else if (typeRaw === 'option') card_type = 'Option';
    else if (typeRaw === 'dual') card_type = 'Dual';
    // Option, Tamer, Dual have no meaningful level — normalize null to 0 for consistency
    if (
        (card_type === 'Option' || card_type === 'Tamer' || card_type === 'Dual') &&
        card_level === null
    )
        card_level = 0;
    const is_digi_egg = card_type === 'Digi-Egg';
    return { card_type, card_level, is_digi_egg };
}

function repairLog(msg, type = 'info') {
    const log = document.getElementById('adminRepairLog');
    if (!log) return;
    log.classList.remove('is-hidden');
    const line = document.createElement('div');
    line.className = `admin-repair-log-line admin-repair-log-${type}`;
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function repairLogClear() {
    const log = document.getElementById('adminRepairLog');
    if (log) {
        log.innerHTML = '';
        log.classList.add('is-hidden');
    }
}

async function fetchRepairIncompleteCodes() {
    const base = window.APP_CONFIG.SUPABASE_URL;
    const hdrs = window.createSupabaseHeaders();
    const out = [];
    const limit = 1000;
    let offset = 0;
    // Fetch card_code + name for all records so we can detect stubs where name === card_code
    while (true) {
        const params = new URLSearchParams({
            select: 'card_code,name',
            order: 'card_code.asc',
            limit: String(limit),
            offset: String(offset)
        });
        const res = await fetch(`${base}/rest/v1/decklist_card_metadata?${params}`, {
            headers: hdrs
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (!Array.isArray(rows) || !rows.length) break;
        rows.forEach((r) => {
            const code = String(r.card_code || '')
                .trim()
                .toUpperCase();
            const name = String(r.name || '').trim();
            // Incomplete if name is missing OR name was set to the card code (stub record)
            if (!name || name === code) out.push(code);
        });
        if (rows.length < limit) break;
        offset += limit;
    }
    return out;
}

// --- progress helpers ---
function repairProgressShow(label, pct, detail) {
    const wrap = document.getElementById('adminRepairProgress');
    const labelEl = document.getElementById('adminRepairProgressLabel');
    const pctEl = document.getElementById('adminRepairProgressPct');
    const bar = document.getElementById('adminRepairProgressBar');
    const detailEl = document.getElementById('adminRepairProgressDetail');
    if (!wrap) return;
    wrap.classList.remove('is-hidden');
    if (labelEl) labelEl.textContent = label;
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (bar) bar.style.width = `${Math.min(100, pct)}%`;
    if (detailEl && detail !== undefined) detailEl.textContent = detail;
}

function repairProgressHide() {
    const wrap = document.getElementById('adminRepairProgress');
    if (wrap) wrap.classList.add('is-hidden');
}

async function fetchCardsFromDigimonApiAdmin(codes, onProgress) {
    const CHUNK = 20;
    const SLEEP_MS = 800; // ~10 req/10s — safely under the 15/10s limit
    const SLEEP_MISSED_MS = 400; // individual retries are smaller; 400ms keeps them safe too
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const result = [];
    const usedCodes = new Set();
    const pushRow = (row) => {
        const code = String(row?.id || row?.card || '')
            .trim()
            .toUpperCase();
        if (!code || usedCodes.has(code)) return;
        usedCodes.add(code);
        const { card_type, card_level, is_digi_egg } = deriveCardMeta(row);
        result.push({
            card_code: code,
            id: row?.id || code,
            name: row?.name || null,
            pack: row?.pack || code.split('-')[0] || null,
            color: row?.color || null,
            card_type,
            card_level,
            is_digi_egg,
            card_payload: row || {}
        });
    };

    const chunks = [];
    for (let i = 0; i < codes.length; i += CHUNK) chunks.push(codes.slice(i, i + CHUNK));

    let processed = 0;
    let ci = 0;
    while (ci < chunks.length) {
        const chunk = chunks[ci];
        try {
            const q = new URLSearchParams({
                card: chunk.join(','),
                limit: String(chunk.length * 2),
                series: 'Digimon Card Game'
            });
            const res = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
            if (res.status === 429) {
                repairLog(`Rate limited no chunk ${ci + 1} — aguardando 10s…`, 'warn');
                await sleep(10000);
                continue; // retry same chunk
            }
            if (res.ok) {
                const rows = await res.json();
                if (Array.isArray(rows)) rows.forEach(pushRow);
            }
        } catch (_) {}

        await sleep(SLEEP_MS);

        // Individual retry for cards not found in the batch
        const missed = chunk.filter((c) => !usedCodes.has(c));
        for (const code of missed) {
            try {
                const q = new URLSearchParams({
                    card: code,
                    limit: '1',
                    series: 'Digimon Card Game'
                });
                const res = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
                if (res.status === 429) {
                    repairLog(`Rate limited (individual retry ${code}) — aguardando 10s…`, 'warn');
                    await sleep(10000);
                    // retry this code once more
                    const res2 = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
                    if (res2.ok) {
                        const rows = await res2.json();
                        if (Array.isArray(rows)) rows.forEach(pushRow);
                    }
                } else if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) rows.forEach(pushRow);
                }
            } catch (_) {}
            await sleep(SLEEP_MISSED_MS);
        }

        processed += chunk.length;
        ci++;
        if (onProgress) onProgress(processed, codes.length, result.length);
    }
    return result;
}

async function upsertRepairRows(rows, onProgress) {
    const base = window.APP_CONFIG.SUPABASE_URL;
    const hdrs = window.createSupabaseHeaders();
    const CHUNK = 200;
    let done = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const res = await fetch(`${base}/rest/v1/decklist_card_metadata?on_conflict=card_code`, {
            method: 'POST',
            headers: {
                ...hdrs,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(chunk)
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Upsert failed (HTTP ${res.status}): ${detail}`);
        }
        done += chunk.length;
        if (onProgress) onProgress(done, rows.length);
    }
}

async function runRepairCheck() {
    repairLogClear();
    repairProgressHide();
    _repairIncompleteCodesCache = null;
    const countEl = document.getElementById('adminRepairMissingCount');
    const runBtn = document.getElementById('adminRepairRunBtn');
    if (countEl) countEl.textContent = 'Verificando cartas…';
    if (runBtn) runBtn.disabled = true;

    try {
        const codes = await fetchRepairIncompleteCodes();
        _repairIncompleteCodesCache = codes;
        if (countEl) {
            countEl.textContent = codes.length
                ? `${codes.length} carta(s) com informações incompletas.`
                : 'Todas as cartas estão completas. Nenhuma correção necessária.';
        }
        if (runBtn) runBtn.disabled = codes.length === 0;
        if (codes.length)
            repairLog(
                `${codes.length} carta(s) incompletas. Clique em “Corrigir dados” para continuar.`,
                'info'
            );
    } catch (err) {
        if (countEl) countEl.textContent = 'Não foi possível verificar as cartas.';
        repairLog(`Erro: ${err.message}`, 'error');
    }
}

async function runRepairRun() {
    const codes = _repairIncompleteCodesCache;
    if (!codes || !codes.length) {
        repairLog('Clique em “Verificar” primeiro.', 'warn');
        return;
    }

    const runBtn = document.getElementById('adminRepairRunBtn');
    const checkBtn = document.querySelector('[data-admin-action="repair-check"]');
    if (runBtn) runBtn.disabled = true;
    if (checkBtn) checkBtn.disabled = true;
    repairLogClear();

    repairProgressShow('Buscando dados na API…', 0, `0 / ${codes.length} cartas processadas`);
    repairLog(`Iniciando repair de ${codes.length} carta(s)…`, 'info');

    try {
        const fetched = await fetchCardsFromDigimonApiAdmin(codes, (done, total, found) => {
            const pct = (done / total) * 70; // API fetch = 0-70%
            repairProgressShow(
                'Buscando dados na API…',
                pct,
                `${done} / ${total} processadas · ${found} encontradas`
            );
        });

        repairLog(
            `API retornou dados para ${fetched.length} / ${codes.length} carta(s).`,
            fetched.length ? 'info' : 'warn'
        );

        // For codes the API couldn't find, save a stub so they stop appearing as incomplete
        const fetchedCodes = new Set(fetched.map((r) => r.card_code));
        const stubs = codes
            .filter((c) => !fetchedCodes.has(c))
            .map((c) => ({
                card_code: c,
                id: c,
                name: c, // use card_code as name so name IS NOT NULL
                pack: c.split('-')[0] || null,
                color: null,
                card_type: null, // genuinely unknown
                card_level: null,
                is_digi_egg: false,
                card_payload: {}
            }));

        const allToUpsert = [...fetched, ...stubs];
        repairProgressShow('Salvando no banco…', 70, `0 / ${allToUpsert.length} salvas`);

        await upsertRepairRows(allToUpsert, (done, total) => {
            const pct = 70 + (done / total) * 30;
            repairProgressShow('Salvando no banco…', pct, `${done} / ${total} salvas`);
        });

        repairProgressShow('Concluído!', 100, `${allToUpsert.length} registro(s) atualizados`);

        const missed = stubs.length;
        repairLog(
            `Pronto. ${fetched.length} registro(s) atualizados pela API.${missed ? ` ${missed} não encontrado(s) na API — salvo(s) com registro mínimo.` : ''}`,
            'success'
        );

        _repairIncompleteCodesCache = null;
        const countEl = document.getElementById('adminRepairMissingCount');
        if (countEl)
            countEl.textContent =
                'Correção concluída. Clique em “Verificar” para conferir novamente.';
    } catch (err) {
        repairProgressHide();
        repairLog(`Erro: ${err.message}`, 'error');
        if (runBtn) runBtn.disabled = false;
    }
    if (checkBtn) checkBtn.disabled = false;
}

// ============================================================
// DOWNLOAD CARDS
// ============================================================
const DIGIMON_ALL_CARDS_API = 'https://digimoncard.io/api-public/getAllCards';
const DL_CHUNK_SIZE = 20;
const DL_SLEEP_MS = 800;

function downloadLog(msg, type = 'info') {
    const log = document.getElementById('adminDownloadLog');
    if (!log) return;
    log.classList.remove('is-hidden');
    const line = document.createElement('div');
    line.className = `admin-repair-log-line admin-repair-log-${type}`;
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function downloadLogClear() {
    const log = document.getElementById('adminDownloadLog');
    if (log) {
        log.innerHTML = '';
        log.classList.add('is-hidden');
    }
}

function downloadProgressShow(label, pct, detail) {
    const wrap = document.getElementById('adminDownloadProgress');
    const labelEl = document.getElementById('adminDownloadProgressLabel');
    const pctEl = document.getElementById('adminDownloadProgressPct');
    const bar = document.getElementById('adminDownloadProgressBar');
    const detailEl = document.getElementById('adminDownloadProgressDetail');
    if (!wrap) return;
    wrap.classList.remove('is-hidden');
    if (labelEl) labelEl.textContent = label;
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (bar) bar.style.width = `${Math.min(100, pct)}%`;
    if (detailEl && detail != null) detailEl.textContent = detail;
}

function downloadProgressHide() {
    const wrap = document.getElementById('adminDownloadProgress');
    if (wrap) wrap.classList.add('is-hidden');
}

async function runDownloadCards() {
    const runBtn = document.getElementById('adminDownloadRunBtn');
    const statusEl = document.getElementById('adminDownloadStatus');
    if (runBtn) runBtn.disabled = true;
    downloadLogClear();
    downloadProgressShow('Buscando lista de cartas…', 0, '');

    try {
        // Step 1: fetch all card numbers from getAllCards
        const params = new URLSearchParams({
            series: 'Digimon Card Game',
            sort: 'card_number',
            sortdirection: 'asc'
        });
        const allRes = await fetch(`${DIGIMON_ALL_CARDS_API}?${params}`);
        if (!allRes.ok) throw new Error(`getAllCards falhou: HTTP ${allRes.status}`);
        const allRows = await allRes.json();
        if (!Array.isArray(allRows)) throw new Error('Resposta inesperada do getAllCards');
        const allCodes = allRows
            .map((r) =>
                String(r?.cardnumber || '')
                    .trim()
                    .toUpperCase()
            )
            .filter(Boolean);
        downloadLog(`${allCodes.length} cartas encontradas na API.`, 'info');

        if (!allCodes.length) {
            downloadProgressHide();
            if (runBtn) runBtn.disabled = false;
            return;
        }

        // Step 2: fetch existing card_codes from DB and skip them
        downloadProgressShow('Verificando banco de dados…', 5, '');
        const base = window.APP_CONFIG.SUPABASE_URL;
        const hdrs = window.createSupabaseHeaders();
        const existingCodes = new Set();
        let offset = 0;
        const PAGE = 1000;
        while (true) {
            const q = new URLSearchParams({
                select: 'card_code,name',
                order: 'card_code.asc',
                limit: String(PAGE),
                offset: String(offset)
            });
            const res = await fetch(`${base}/rest/v1/decklist_card_metadata?${q}`, {
                headers: hdrs
            });
            if (!res.ok) throw new Error(`Erro ao ler banco: HTTP ${res.status}`);
            const batch = await res.json();
            if (!Array.isArray(batch) || !batch.length) break;
            batch.forEach((r) => {
                const c = String(r?.card_code || '')
                    .trim()
                    .toUpperCase();
                const n = String(r?.name || '').trim();
                // Only skip if the record has a real name (not null and not equal to card code = not a stub)
                if (c && n && n !== c) existingCodes.add(c);
            });
            if (batch.length < PAGE) break;
            offset += PAGE;
        }
        const codes = allCodes.filter((c) => !existingCodes.has(c));
        downloadLog(
            `${existingCodes.size} já no banco com nome real — ${codes.length} a baixar (novas + stubs sem nome).`,
            'info'
        );

        if (!codes.length) {
            downloadProgressShow('Concluído!', 100, 'Nenhuma carta nova.');
            downloadLog('Catálogo já está atualizado. Nenhuma carta nova para baixar.', 'success');
            if (statusEl)
                statusEl.textContent = `Catálogo atualizado — ${existingCodes.size} cartas no banco.`;
            if (runBtn) runBtn.disabled = false;
            return;
        }

        // Build a name lookup from getAllCards so we can save minimal records as fallback
        const codeToName = new Map();
        allRows.forEach((r) => {
            const c = String(r?.cardnumber || '')
                .trim()
                .toUpperCase();
            if (c) codeToName.set(c, String(r?.name || '').trim() || null);
        });

        // Step 4: chunk and fetch metadata for new codes only
        const chunks = [];
        for (let i = 0; i < codes.length; i += DL_CHUNK_SIZE)
            chunks.push(codes.slice(i, i + DL_CHUNK_SIZE));

        const fetched = [];
        const usedCodes = new Set();
        let failedChunks = 0;
        let i = 0;

        while (i < chunks.length) {
            const chunk = chunks[i];
            const pct = (i / chunks.length) * 70;
            downloadProgressShow(
                'Buscando metadados na API…',
                pct,
                `chunk ${i + 1}/${chunks.length} · ${fetched.length} cartas`
            );

            try {
                const q = new URLSearchParams({
                    card: chunk.join(','),
                    limit: String(chunk.length * 2),
                    series: 'Digimon Card Game'
                });
                const res = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
                if (res.status === 429) {
                    downloadLog(`Rate limited no chunk ${i + 1} — aguardando 10s…`, 'warn');
                    await new Promise((r) => setTimeout(r, 10000));
                    continue; // retry same chunk without incrementing i
                }
                if (res.ok) {
                    const rows = await res.json();
                    if (Array.isArray(rows)) {
                        rows.forEach((row) => {
                            const code = String(row?.id || row?.card || '')
                                .trim()
                                .toUpperCase();
                            if (!code || usedCodes.has(code)) return;
                            usedCodes.add(code);
                            const { card_type, card_level, is_digi_egg } = deriveCardMeta(row);
                            fetched.push({
                                card_code: code,
                                id: row?.id || code,
                                name: row?.name || null,
                                pack: row?.pack || code.split('-')[0] || null,
                                color: row?.color || null,
                                card_type,
                                card_level,
                                is_digi_egg,
                                card_payload: row || {}
                            });
                        });
                    }
                } else {
                    failedChunks++;
                }
            } catch (_) {
                failedChunks++;
            }

            if ((i + 1) % 10 === 0 || i + 1 === chunks.length) {
                downloadLog(
                    `Progresso: ${i + 1}/${chunks.length} chunks · ${fetched.length} cartas`,
                    'info'
                );
            }

            await new Promise((r) => setTimeout(r, DL_SLEEP_MS));
            i++;
        }

        downloadLog(
            `API retornou metadados para ${fetched.length} carta(s).${failedChunks ? ` ${failedChunks} chunk(s) falharam.` : ''}`,
            failedChunks ? 'warn' : 'info'
        );

        // Fallback: for codes not returned by the search API, save a minimal record
        // using the name from getAllCards so they at least exist in the DB.
        const fallback = [];
        codes.forEach((code) => {
            if (usedCodes.has(code)) return;
            const name = codeToName.get(code) || null;
            fallback.push({
                card_code: code,
                id: code,
                name,
                pack: code.split('-')[0] || null,
                color: null,
                card_type: null,
                card_level: null,
                is_digi_egg: false,
                card_payload: name ? { id: code, name } : {}
            });
        });
        if (fallback.length) {
            downloadLog(
                `${fallback.length} carta(s) sem metadados na API — salvas com registro mínimo (nome + código).`,
                'warn'
            );
            fetched.push(...fallback);
        }

        if (!fetched.length) {
            downloadProgressHide();
            downloadLog('Nenhum dado retornado pela API.', 'warn');
            if (statusEl) statusEl.textContent = 'Nenhuma carta baixada. Tente novamente.';
            if (runBtn) runBtn.disabled = false;
            return;
        }

        // Step 5: upsert to DB
        downloadProgressShow('Salvando no banco…', 70, `0 / ${fetched.length} salvas`);
        await upsertRepairRows(fetched, (done, total) => {
            const pct = 70 + (done / total) * 30;
            downloadProgressShow('Salvando no banco…', pct, `${done} / ${total} salvas`);
        });

        downloadProgressShow('Concluído!', 100, `${fetched.length} carta(s) salvas`);
        downloadLog(
            `Pronto. ${fetched.length} carta(s) salvas em decklist_card_metadata.`,
            'success'
        );
        if (statusEl)
            statusEl.textContent = `Última sincronização: ${fetched.length} cartas salvas. Busca no Deck Builder atualizada.`;
    } catch (err) {
        downloadProgressHide();
        downloadLog(`Erro: ${err.message}`, 'error');
        if (statusEl) statusEl.textContent = 'Erro durante o download. Veja o log abaixo.';
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// ============================================================
// EXPORT CATALOG
// ============================================================
const CATALOG_BUCKET = 'card-catalog';
const CATALOG_FILE = 'card-catalog.json';

function exportLog(msg, type = 'info') {
    const log = document.getElementById('adminExportLog');
    if (!log) return;
    log.classList.remove('is-hidden');
    const line = document.createElement('div');
    line.className = `admin-repair-log-line admin-repair-log-${type}`;
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function exportLogClear() {
    const log = document.getElementById('adminExportLog');
    if (log) {
        log.innerHTML = '';
        log.classList.add('is-hidden');
    }
}

function exportProgressShow(label, pct, detail) {
    const wrap = document.getElementById('adminExportProgress');
    const labelEl = document.getElementById('adminExportProgressLabel');
    const pctEl = document.getElementById('adminExportProgressPct');
    const bar = document.getElementById('adminExportProgressBar');
    const detailEl = document.getElementById('adminExportProgressDetail');
    if (!wrap) return;
    wrap.classList.remove('is-hidden');
    if (labelEl) labelEl.textContent = label;
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (bar) bar.style.width = `${Math.min(100, pct)}%`;
    if (detailEl && detail != null) detailEl.textContent = detail;
}

function exportProgressHide() {
    const wrap = document.getElementById('adminExportProgress');
    if (wrap) wrap.classList.add('is-hidden');
}

async function runExportCatalog() {
    const runBtn = document.getElementById('adminExportRunBtn');
    const statusEl = document.getElementById('adminExportStatus');
    if (runBtn) runBtn.disabled = true;
    exportLogClear();
    exportProgressShow('Lendo banco de dados…', 0, '');

    const base = window.APP_CONFIG.SUPABASE_URL;
    const hdrs = window.createSupabaseHeaders();

    try {
        // Step 1: fetch all cards (lightweight — only fields needed for search/display)
        const allCards = [];
        const PAGE = 1000;
        let offset = 0;
        while (true) {
            const q = new URLSearchParams({
                select: 'card_code,name,pack,color,card_type,card_level,card_payload',
                order: 'card_code.asc',
                limit: String(PAGE),
                offset: String(offset)
            });
            const res = await fetch(`${base}/rest/v1/decklist_card_metadata?${q}`, {
                headers: hdrs
            });
            if (!res.ok) throw new Error(`Erro ao ler banco: HTTP ${res.status}`);
            const batch = await res.json();
            if (!Array.isArray(batch) || !batch.length) break;
            allCards.push(...batch);
            exportProgressShow(
                'Lendo banco de dados…',
                Math.min(45, (allCards.length / 5000) * 45),
                `${allCards.length} cartas lidas…`
            );
            if (batch.length < PAGE) break;
            offset += PAGE;
        }
        exportLog(`${allCards.length} cartas lidas do banco.`, 'info');

        // Step 2: build lightweight catalog (extract only needed fields from payload)
        exportProgressShow('Gerando catálogo…', 50, '');
        const catalog = allCards.map((r) => {
            const p = r.card_payload || {};
            return {
                card_code: r.card_code,
                name: r.name || null,
                pack: r.pack || null,
                color: r.color || null,
                color2: p.color2 || null,
                card_type: r.card_type || null,
                card_level: r.card_level ?? null,
                digi_type: p.digi_type || p.digitype || null,
                digi_type2: p.digi_type2 || null,
                digi_type3: p.digi_type3 || null,
                digi_type4: p.digi_type4 || null,
                play_cost: p.play_cost ?? p.playcost ?? null,
                main_effect: p.main_effect || null,
                source_effect: p.source_effect || null,
                alt_effect: p.alt_effect || null,
                img: p.img || null
            };
        });

        const json = JSON.stringify(catalog);
        const sizeKb = (new TextEncoder().encode(json).byteLength / 1024).toFixed(1);
        exportLog(`Catálogo gerado: ${catalog.length} cartas, ${sizeKb} KB.`, 'info');

        // Step 3: upload to Supabase Storage
        exportProgressShow('Fazendo upload para o bucket…', 70, '');
        const uploadRes = await fetch(
            `${base}/storage/v1/object/${CATALOG_BUCKET}/${CATALOG_FILE}`,
            {
                method: 'POST',
                headers: {
                    ...hdrs,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=86400',
                    'x-upsert': 'true'
                },
                body: json
            }
        );

        if (!uploadRes.ok) {
            const detail = await uploadRes.text().catch(() => '');
            throw new Error(`Upload falhou: HTTP ${uploadRes.status} — ${detail}`);
        }

        exportProgressShow('Concluído!', 100, `${catalog.length} cartas exportadas`);
        exportLog(
            `Pronto. Arquivo disponível em: ${base}/storage/v1/object/public/${CATALOG_BUCKET}/${CATALOG_FILE}`,
            'success'
        );
        if (statusEl)
            statusEl.textContent = `Última exportação: ${catalog.length} cartas · ${sizeKb} KB.`;
    } catch (err) {
        exportProgressHide();
        exportLog(`Erro: ${err.message}`, 'error');
        if (statusEl) statusEl.textContent = 'Erro durante o export. Veja o log abaixo.';
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// ============================================================
// SYNC CARDS (CATÁLOGO COMPLETO)
// ============================================================

// Only codes matching this pattern are valid DCG cards (excludes BO-, MO-, etc.)
const SYNC_VALID_CODE_RE = /^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/;

function injectSyncCardsSection() {
    if (document.getElementById('adminSyncCardsSection')) return;

    // Hide the individual legacy sections — Sync & Export replaces all three
    const legacyIds = [
        'adminRepairRunBtn',
        'adminRepairMissingCount',
        'adminDownloadRunBtn',
        'adminDownloadStatus',
        'adminExportRunBtn',
        'adminExportStatus'
    ];
    const hiddenSections = new Set();
    legacyIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const section =
            el.closest('[class*="admin-section"]') ||
            el.closest('[class*="section"]') ||
            el.closest('[class*="w-layout"]') ||
            el.parentElement?.parentElement;
        if (section && !hiddenSections.has(section)) {
            section.style.display = 'none';
            hiddenSections.add(section);
        }
    });

    // Inject unified section after the last hidden one (or at end of container)
    const lastHidden = [...hiddenSections].at(-1);
    const container = document.getElementById('adminContainer');

    const section = document.createElement('div');
    section.id = 'adminSyncCardsSection';
    section.style.cssText =
        'padding:20px;border:1px solid #1e293b;border-radius:8px;background:#0f172a;color:#f1f5f9';
    section.innerHTML = `
        <h3 style="margin:0 0 4px;font-size:1rem;font-weight:600;color:#f1f5f9">Catálogo de cartas</h3>
        <p style="margin:0 0 14px;font-size:.85rem;color:#94a3b8">
            Busca novas cartas, completa dados ausentes e publica o catálogo.
        </p>
        <button id="adminSyncRunBtn" class="player-history-register-btn" data-admin-action="sync-cards-full">
            Atualizar catálogo de cartas
        </button>
        <div id="adminSyncStatus" style="margin-top:10px;font-size:.85rem;color:#94a3b8"></div>
        <div id="adminSyncProgress" style="margin-top:12px;display:none">
            <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:4px;color:#cbd5e1">
                <span id="adminSyncProgressLabel"></span>
                <span id="adminSyncProgressPct"></span>
            </div>
            <div style="height:8px;background:#1e293b;border-radius:4px;overflow:hidden">
                <div id="adminSyncProgressBar" style="height:100%;width:0%;background:#6366f1;transition:width .3s"></div>
            </div>
            <div id="adminSyncProgressDetail" style="margin-top:4px;font-size:.75rem;color:#64748b"></div>
        </div>
        <div id="adminSyncLog" style="margin-top:12px;max-height:180px;overflow-y:auto;font-size:.78rem;font-family:monospace;background:#020617;color:#e2e8f0;border-radius:6px;padding:10px;display:none"></div>
    `;

    if (lastHidden && lastHidden.parentElement) {
        lastHidden.parentElement.insertBefore(section, lastHidden.nextSibling);
    } else if (container) {
        container.appendChild(section);
    }
}

function syncLog(msg, type = 'info') {
    const log = document.getElementById('adminSyncLog');
    if (!log) return;
    log.style.display = 'block';
    const colors = { info: '#94a3b8', warn: '#fbbf24', error: '#f87171', success: '#4ade80' };
    const line = document.createElement('div');
    line.style.color = colors[type] || colors.info;
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function syncLogClear() {
    const log = document.getElementById('adminSyncLog');
    if (log) {
        log.innerHTML = '';
        log.style.display = 'none';
    }
}

function syncProgressShow(label, pct, detail) {
    const wrap = document.getElementById('adminSyncProgress');
    if (wrap) wrap.style.display = 'block';
    const el = (id) => document.getElementById(id);
    if (el('adminSyncProgressLabel')) el('adminSyncProgressLabel').textContent = label;
    if (el('adminSyncProgressPct')) el('adminSyncProgressPct').textContent = `${Math.round(pct)}%`;
    if (el('adminSyncProgressBar'))
        el('adminSyncProgressBar').style.width = `${Math.min(100, pct)}%`;
    if (detail != null && el('adminSyncProgressDetail'))
        el('adminSyncProgressDetail').textContent = detail;
}

function syncProgressHide() {
    const wrap = document.getElementById('adminSyncProgress');
    if (wrap) wrap.style.display = 'none';
}

async function fixCardTypesFromPayload() {
    const base = window.APP_CONFIG.SUPABASE_URL;
    const hdrs = window.createSupabaseHeaders();
    const toUpdate = [];
    let offset = 0;
    const PAGE = 1000;

    while (true) {
        const q = new URLSearchParams({
            select: 'card_code,card_payload',
            card_type: 'is.null',
            order: 'card_code.asc',
            limit: String(PAGE),
            offset: String(offset)
        });
        const res = await fetch(`${base}/rest/v1/decklist_card_metadata?${q}`, { headers: hdrs });
        if (!res.ok) break;
        const batch = await res.json();
        if (!Array.isArray(batch) || !batch.length) break;
        batch.forEach((r) => {
            const { card_type, is_digi_egg } = deriveCardMeta(r.card_payload || {});
            if (card_type) toUpdate.push({ card_code: r.card_code, card_type, is_digi_egg });
        });
        if (batch.length < PAGE) break;
        offset += PAGE;
    }

    if (!toUpdate.length) return 0;

    const CHUNK = 500;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const res = await fetch(`${base}/rest/v1/decklist_card_metadata?on_conflict=card_code`, {
            method: 'POST',
            headers: {
                ...hdrs,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(toUpdate.slice(i, i + CHUNK))
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Patch card_type falhou: HTTP ${res.status} — ${detail}`);
        }
    }
    return toUpdate.length;
}

async function runSyncCardsFull() {
    const runBtn = document.getElementById('adminSyncRunBtn');
    const statusEl = document.getElementById('adminSyncStatus');
    if (runBtn) runBtn.disabled = true;
    syncLogClear();
    syncProgressShow('Buscando lista de cartas da API…', 0, '');

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    try {
        // Step 1: getAllCards → complete code list
        const allRes = await fetch(
            `${DIGIMON_ALL_CARDS_API}?series=${encodeURIComponent('Digimon Card Game')}&sort=card_number&sortdirection=asc`
        );
        if (!allRes.ok) throw new Error(`getAllCards falhou: HTTP ${allRes.status}`);
        const allRows = await allRes.json();
        if (!Array.isArray(allRows)) throw new Error('Resposta inesperada do getAllCards');

        // Filter to valid DCG card codes only (excludes BO-, MO-, etc.)
        const allCodes = allRows
            .map((r) =>
                String(r?.cardnumber || '')
                    .trim()
                    .toUpperCase()
            )
            .filter((c) => c && SYNC_VALID_CODE_RE.test(c));
        syncLog(`${allCodes.length} códigos válidos encontrados no getAllCards.`, 'info');

        // Step 2: load current catalog JSON (bypass cache)
        syncProgressShow('Carregando catálogo atual…', 8, '');
        const catalogUrl = window.APP_CONFIG?.SUPABASE_URL
            ? `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/card-catalog/card-catalog.json`
            : '';
        const catalogMap = new Map();
        if (catalogUrl) {
            try {
                const catRes = await fetch(`${catalogUrl}?_=${Date.now()}`);
                if (catRes.ok) {
                    const catData = await catRes.json();
                    if (Array.isArray(catData)) {
                        catData.forEach((r) => {
                            const code = String(r?.card_code || '').toUpperCase();
                            if (code) catalogMap.set(code, r);
                        });
                    }
                }
            } catch (_) {}
        }
        syncLog(`${catalogMap.size} cartas no catálogo atual.`, 'info');

        // Step 3: fix card_type derivable from existing card_payload (no API call)
        syncProgressShow('Verificando card_type no banco…', 12, '');
        const fixedCount = await fixCardTypesFromPayload();
        if (fixedCount)
            syncLog(
                `${fixedCount} registro(s) com card_type corrigido a partir do payload.`,
                'info'
            );

        // Step 4: find which codes still need fetching from API
        // Incomplete = not in catalog OR name is missing/equals card_code (stub)
        const toFetch = allCodes.filter((code) => {
            const entry = catalogMap.get(code);
            if (!entry) return true;
            const name = String(entry?.name || '').trim();
            return !name || name === code;
        });

        syncLog(
            `${toFetch.length} cartas faltantes ou incompletas no catálogo.`,
            toFetch.length ? 'warn' : 'info'
        );

        if (!toFetch.length && !fixedCount) {
            syncLog('Nenhuma carta precisa ser atualizada.', 'info');
        }

        // Step 4: batch-fetch metadata (20 per request)
        const CHUNK = 20;
        const fetched = [];
        const usedCodes = new Set();

        const pushRow = (row) => {
            const code = String(row?.id || row?.card || '')
                .trim()
                .toUpperCase();
            if (!code || usedCodes.has(code)) return;
            usedCodes.add(code);
            const { card_type, card_level, is_digi_egg } = deriveCardMeta(row);
            fetched.push({
                card_code: code,
                id: row?.id || code,
                name: row?.name || null,
                pack: row?.pack || code.split('-')[0] || null,
                color: row?.color || null,
                card_type,
                card_level,
                is_digi_egg,
                card_payload: row || {}
            });
        };

        for (let i = 0; i < toFetch.length; i += CHUNK) {
            const chunk = toFetch.slice(i, i + CHUNK);
            const pct = 10 + (i / toFetch.length) * 65;
            syncProgressShow(
                'Buscando metadados na API…',
                pct,
                `${i} / ${toFetch.length} · ${fetched.length} encontradas`
            );

            let retries = 0;
            while (retries < 3) {
                try {
                    const q = new URLSearchParams({
                        card: chunk.join(','),
                        limit: String(chunk.length * 2),
                        series: 'Digimon Card Game'
                    });
                    const res = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
                    if (res.status === 429) {
                        syncLog(
                            `Rate limited (chunk ${Math.floor(i / CHUNK) + 1}) — aguardando 10s…`,
                            'warn'
                        );
                        await sleep(10000);
                        retries++;
                        continue;
                    }
                    if (res.ok) {
                        const rows = await res.json();
                        if (Array.isArray(rows)) rows.forEach(pushRow);
                    }
                    break;
                } catch (_) {
                    retries++;
                }
            }
            await sleep(800);
        }

        // Step 5: retry missed codes 1-by-1
        const missed = toFetch.filter((c) => !usedCodes.has(c));
        if (missed.length) {
            syncLog(`${missed.length} cartas não encontradas no batch — buscando 1 a 1…`, 'warn');
            for (let i = 0; i < missed.length; i++) {
                const code = missed[i];
                const pct = 75 + (i / missed.length) * 15;
                syncProgressShow('Buscando 1 a 1…', pct, `${i + 1} / ${missed.length} · ${code}`);
                try {
                    const q = new URLSearchParams({
                        card: code,
                        limit: '2',
                        series: 'Digimon Card Game'
                    });
                    const res = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
                    if (res.status === 429) {
                        await sleep(10000);
                        const res2 = await fetch(`${REPAIR_DIGIMON_API}?${q}`);
                        if (res2.ok) {
                            const rows = await res2.json();
                            if (Array.isArray(rows)) rows.forEach(pushRow);
                        }
                    } else if (res.ok) {
                        const rows = await res.json();
                        if (Array.isArray(rows)) rows.forEach(pushRow);
                    }
                } catch (_) {}
                await sleep(400);
            }
        }

        if (toFetch.length)
            syncLog(
                `API retornou dados para ${fetched.length} / ${toFetch.length} carta(s).`,
                'info'
            );

        // Step 6: upsert to DB
        if (fetched.length) {
            syncProgressShow('Salvando no banco…', 90, `0 / ${fetched.length}`);
            await upsertRepairRows(fetched, (done, total) => {
                const pct = 90 + (done / total) * 5;
                syncProgressShow('Salvando no banco…', pct, `${done} / ${total}`);
            });
            syncLog(`${fetched.length} registro(s) salvos em decklist_card_metadata.`, 'success');
        }

        // Step 7: auto Export Catalog
        syncProgressShow('Exportando catálogo…', 95, '');
        syncLog('Exportando catálogo atualizado…', 'info');
        await runExportCatalog();

        // Step 8: sync deck images to Storage
        syncProgressShow('Sincronizando imagens de decks…', 97, '');
        syncLog('Migrando imagens de decks para o Storage…', 'info');
        const { done: imgDone, failed: imgFailed } = await syncDeckImages((i, total) => {
            syncProgressShow(
                'Sincronizando imagens de decks…',
                97 + (i / total) * 2,
                `${i} / ${total}`
            );
        });
        syncLog(
            `${imgDone} imagem(ns) de deck migrada(s) para o Storage.${imgFailed ? ` ${imgFailed} falhou.` : ''}`,
            imgFailed ? 'warn' : 'info'
        );

        syncProgressShow('Concluído!', 100, `${fetched.length} cartas · ${imgDone} imagens`);
        syncLog(
            `Sync completo. ${fetched.length} cartas atualizadas, catálogo exportado, ${imgDone} imagens migradas.`,
            'success'
        );
        if (statusEl)
            statusEl.textContent = `Última sync: ${fetched.length} carta(s) · ${imgDone} imagem(ns) · catálogo exportado.`;
    } catch (err) {
        syncProgressHide();
        syncLog(`Erro: ${err.message}`, 'error');
        if (statusEl) statusEl.textContent = 'Erro durante o sync. Veja o log.';
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

async function fetchCardImageBlob(src) {
    let blob;
    try {
        const res = await fetch(src);
        if (!res.ok) return null;
        blob = await res.blob();
    } catch {
        return null;
    }

    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            try {
                // Blank check
                const check = document.createElement('canvas');
                check.width = 8;
                check.height = 8;
                check.getContext('2d').drawImage(img, 0, 0, 8, 8);
                const { data } = check.getContext('2d').getImageData(0, 0, 8, 8);
                let r = 0,
                    g = 0,
                    b = 0;
                const px = data.length / 4;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                }
                if (r / px > 245 && g / px > 245 && b / px > 245) {
                    resolve(null);
                    return;
                }
                // Convert to WebP
                const cv = document.createElement('canvas');
                cv.width = img.naturalWidth;
                cv.height = img.naturalHeight;
                cv.getContext('2d').drawImage(img, 0, 0);
                cv.toBlob((webpBlob) => resolve(webpBlob || blob), 'image/webp', 0.92);
            } catch {
                resolve(blob);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

async function syncDeckImages(onProgress) {
    const base = window.APP_CONFIG.SUPABASE_URL;
    const hdrs = window.createSupabaseHeaders();
    const storagePrefix = `${base}/storage/v1/object/public/deck-images/`;

    const res = await fetch(`${base}/rest/v1/deck_images?select=id,image_url&limit=1000`, {
        headers: hdrs
    });
    if (!res.ok) {
        syncLog(`syncDeckImages: erro ao ler deck_images (HTTP ${res.status})`, 'warn');
        return { done: 0, failed: 0 };
    }
    const rows = await res.json();
    const toMigrate = (Array.isArray(rows) ? rows : []).filter(
        (r) => r.image_url && !String(r.image_url).startsWith(storagePrefix)
    );

    syncLog(`${toMigrate.length} deck(s) para migrar imagem para o Storage.`, 'info');
    if (!toMigrate.length) return { done: 0, failed: 0 };

    let done = 0,
        failed = 0;

    for (let i = 0; i < toMigrate.length; i++) {
        const row = toMigrate[i];
        if (onProgress) onProgress(i, toMigrate.length);

        const codeMatch = String(row.image_url || '').match(
            /([A-Z]{1,3}\d{0,2}-\d{1,3})\.(?:webp|jpg|png)/i
        );
        if (!codeMatch) {
            syncLog(`  sem código válido em: ${row.image_url}`, 'warn');
            failed++;
            continue;
        }
        const code = codeMatch[1].toUpperCase();

        // Try Edge Function first (server-side, sem CORS, funciona para todos os sets)
        let newUrl = null;
        try {
            const efRes = await fetch(`${base}/functions/v1/upload-card-image`, {
                method: 'POST',
                headers: { ...hdrs, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            if (efRes.ok) {
                const { url } = await efRes.json();
                newUrl = url || null;
            }
        } catch (_) {}

        // Fallback browser-side (egmanevents com CORS)
        if (!newUrl) {
            const blob = await fetchCardImageBlob(
                `https://deckbuilder.egmanevents.com/card_images/digimon/${code}.webp`
            );
            if (blob) {
                const uploadRes = await fetch(
                    `${base}/storage/v1/object/deck-images/${encodeURIComponent(code)}.webp`,
                    {
                        method: 'POST',
                        headers: {
                            apikey: hdrs.apikey,
                            Authorization: hdrs.Authorization,
                            'Content-Type': 'image/webp',
                            'x-upsert': 'true'
                        },
                        body: blob
                    }
                );
                if (uploadRes.ok) newUrl = `${storagePrefix}${encodeURIComponent(code)}.webp`;
            }
        }

        if (!newUrl) {
            syncLog(`  ${code}: nenhuma fonte funcionou`, 'warn');
            failed++;
            continue;
        }

        await fetch(`${base}/rest/v1/deck_images?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: { ...hdrs, 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: newUrl })
        });

        syncLog(`  ${code}: ✓`, 'info');
        done++;
        await new Promise((r) => setTimeout(r, 100));
    }

    if (onProgress) onProgress(toMigrate.length, toMigrate.length);
    return { done, failed };
}

// ============================================================
// STORES
// ============================================================
async function loadAdminStores() {
    const host = document.getElementById('adminStoresBody');
    if (!host) return;
    host.innerHTML =
        '<tr><td colspan="5" class="admin-loading"><div class="spinner"></div></td></tr>';

    try {
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/stores?select=id,name,bandai_nick,logo_url,is_active&order=name.asc`,
            { headers: window.createSupabaseHeaders() }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        adminStores = await res.json();
        adminStoresLoaded = true;
        renderAdminStores();
        await loadAdminWeeklySchedule();
    } catch (err) {
        // Fallback: try without optional columns
        try {
            const res2 = await fetch(
                `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/stores?select=id,name,bandai_nick&order=name.asc`,
                { headers: window.createSupabaseHeaders() }
            );
            if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
            adminStores = await res2.json();
            adminStoresLoaded = true;
            renderAdminStores();
            await loadAdminWeeklySchedule();
        } catch (err2) {
            host.innerHTML = `<tr><td colspan="5" class="admin-error">${escapeAdminHtml(err2.message)}</td></tr>`;
        }
    }
}

const ADMIN_WEEKDAYS = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
];

async function loadAdminWeeklySchedule() {
    const host = document.getElementById('adminWeeklyScheduleGrid');
    if (!host) return;
    host.innerHTML = '<span class="admin-dim">Carregando agenda...</span>';
    try {
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/tournament_weekly_schedule?select=weekday,store_id,is_active&order=weekday.asc`,
            { headers: window.createSupabaseHeaders() }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        adminWeeklySchedule = await res.json();
        adminWeeklyScheduleLoaded = true;
        renderAdminWeeklySchedule();
    } catch (err) {
        adminWeeklyScheduleLoaded = false;
        host.innerHTML =
            '<span class="admin-error">Agenda indisponível. Execute a migration da agenda semanal.</span>';
    }
}

function renderAdminWeeklySchedule() {
    const host = document.getElementById('adminWeeklyScheduleGrid');
    if (!host) return;
    const options = adminStores
        .filter((store) => store.is_active !== false)
        .map(
            (store) =>
                `<option value="${escapeAdminHtml(store.id)}">${escapeAdminHtml(store.name)}</option>`
        )
        .join('');
    host.innerHTML = ADMIN_WEEKDAYS.map((day, weekday) => {
        return `<label class="admin-weekly-schedule-item">
            <span>${day}</span>
            <select data-admin-schedule-weekday="${weekday}">
                <option value="">Sem sugestão</option>
                ${options}
            </select>
        </label>`;
    }).join('');
    host.querySelectorAll('[data-admin-schedule-weekday]').forEach((select) => {
        const selected = adminWeeklySchedule.find(
            (entry) =>
                Number(entry.weekday) === Number(select.dataset.adminScheduleWeekday) &&
                entry.is_active !== false
        );
        select.value = selected?.store_id || '';
    });
}

async function saveAdminWeeklySchedule() {
    if (!adminWeeklyScheduleLoaded) return;
    const status = document.getElementById('adminWeeklyScheduleStatus');
    const button = document.querySelector('[data-admin-action="save-weekly-schedule"]');
    const selections = [...document.querySelectorAll('[data-admin-schedule-weekday]')];
    if (button) button.disabled = true;
    if (status) status.textContent = 'Salvando agenda...';
    try {
        for (const select of selections) {
            const weekday = Number(select.dataset.adminScheduleWeekday);
            const storeId = select.value;
            const url = `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/tournament_weekly_schedule`;
            const res = storeId
                ? await fetch(`${url}?on_conflict=weekday`, {
                      method: 'POST',
                      headers: {
                          ...window.createSupabaseHeaders(),
                          'Content-Type': 'application/json',
                          Prefer: 'resolution=merge-duplicates,return=minimal'
                      },
                      body: JSON.stringify({
                          weekday,
                          store_id: storeId,
                          is_active: true,
                          updated_at: new Date().toISOString()
                      })
                  })
                : await fetch(`${url}?weekday=eq.${weekday}`, {
                      method: 'DELETE',
                      headers: window.createSupabaseHeaders()
                  });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        if (status) status.textContent = 'Agenda salva. Novos torneios já usarão essas sugestões.';
        await loadAdminWeeklySchedule();
    } catch (err) {
        if (status) status.textContent = `Falha ao salvar agenda: ${err.message}`;
    } finally {
        if (button) button.disabled = false;
    }
}

function renderAdminStores() {
    const host = document.getElementById('adminStoresBody');
    if (!host) return;

    if (!adminStores.length) {
        host.innerHTML =
            '<tr><td colspan="5" class="admin-empty">Nenhuma loja cadastrada.</td></tr>';
        return;
    }

    host.innerHTML =
        adminListPage(
            'Stores',
            [...adminStores].sort(
                (a, b) =>
                    Number(b.is_active !== false) - Number(a.is_active !== false) ||
                    a.name.localeCompare(b.name, 'pt-BR')
            ),
            renderAdminStores
        )
            .map(
                (s) => `
        <tr>
            <td>${s.logo_url ? `<img src="${escapeAdminHtml(s.logo_url)}" alt="${escapeAdminHtml(s.name)}" style="height:36px;object-fit:contain;border-radius:6px;display:block;" />` : '<span class="admin-dim">—</span>'}</td>
            <td>${escapeAdminHtml(s.name || '—')}</td>
            <td>${s.bandai_nick ? `<code>${escapeAdminHtml(s.bandai_nick)}</code>` : '<span class="admin-dim">—</span>'}</td>
            <td>${s.is_active === false ? '<span class="admin-badge admin-badge--inactive">Inativa</span>' : '<span class="admin-badge admin-badge--active">Ativa</span>'}</td>
            <td class="admin-actions-cell">
                <button class="player-history-register-btn" data-admin-action="edit-store" data-id="${s.id}">Editar</button>
                <button class="player-history-register-btn admin-btn-danger" data-admin-action="delete-store" data-id="${s.id}" data-name="${escapeAdminHtml(s.name)}">Excluir</button>
            </td>
        </tr>
    `
            )
            .join('') ||
        '<tr><td colspan="5" class="admin-empty">Nenhuma loja encontrada.</td></tr>';
    labelAdminList(host);
}

function setStoreLogoPreview(url) {
    const wrap = document.getElementById('adminStoreLogoPreviewWrap');
    const img = document.getElementById('adminStoreLogoPreview');
    const urlInput = document.getElementById('adminStoreLogoUrl');
    if (!wrap || !img || !urlInput) return;
    if (url) {
        img.src = url;
        wrap.style.display = 'flex';
        urlInput.value = url;
    } else {
        img.src = '';
        wrap.style.display = 'none';
        urlInput.value = '';
    }
}

function clearStoreLogo() {
    setStoreLogoPreview('');
    const fileInput = document.getElementById('adminStoreLogoFile');
    if (fileInput) fileInput.value = '';
}

async function uploadStoreLogo(file, slug) {
    await refreshAdminSessionIfNeeded();

    const ext = file.name.split('.').pop().toLowerCase() || 'png';
    const path = `stores/${slug}-${Date.now()}.${ext}`;
    const bucket = 'store-logos';
    const uploadUrl = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: createAuthenticatedAdminHeaders({
            'Content-Type': file.type || 'application/octet-stream',
            'x-upsert': 'true'
        }),
        body: file
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Upload failed: HTTP ${res.status}`);
    }

    const publicUrl = `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    return { path, url: publicUrl };
}

function openStoreModal(id) {
    const store = id ? adminStores.find((s) => s.id === id) : null;
    const modal = document.getElementById('adminStoreModal');
    if (!modal) return;

    modal.querySelector('#adminStoreId').value = id || '';
    modal.querySelector('#adminStoreName').value = store?.name || '';
    modal.querySelector('#adminStoreBandaiNick').value = store?.bandai_nick || '';
    modal.querySelector('#adminStoreIsActive').checked = store ? store.is_active !== false : true;
    modal.querySelector('#adminStoreStatus').textContent = '';
    modal.querySelector('#adminStoreLogoUploadStatus').textContent = '';
    modal.querySelector('.admin-modal-title').textContent = id ? 'Editar loja' : 'Nova loja';

    const fileInput = modal.querySelector('#adminStoreLogoFile');
    if (fileInput) fileInput.value = '';
    setStoreLogoPreview(store?.logo_url || '');

    showAdminModal(modal, 'adminStoreName');
}

function closeStoreModal() {
    const modal = document.getElementById('adminStoreModal');
    hideAdminModal(modal);
}

async function saveStore(e) {
    e.preventDefault();
    const statusEl = document.getElementById('adminStoreStatus');
    if (statusEl) statusEl.textContent = '';

    const id = document.getElementById('adminStoreId')?.value;
    const name = document.getElementById('adminStoreName')?.value.trim();
    const bandai_nick = document.getElementById('adminStoreBandaiNick')?.value.trim() || null;
    const logo_url = document.getElementById('adminStoreLogoUrl')?.value.trim() || null;
    const is_active = document.getElementById('adminStoreIsActive')?.checked ?? true;

    if (!name) {
        if (statusEl) statusEl.textContent = 'Informe o nome da loja.';
        return;
    }

    const payload = { name, bandai_nick, logo_url, is_active };
    const finishSave = beginAdminFormSave('adminStoreForm');
    if (!finishSave) return;
    if (statusEl) statusEl.textContent = 'Salvando…';

    try {
        await refreshAdminSessionIfNeeded();
        let res;
        if (id) {
            res = await fetch(
                `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/stores?id=eq.${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',
                    headers: {
                        ...createAuthenticatedAdminHeaders(),
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify(payload)
                }
            );
        } else {
            res = await fetch(`${window.APP_CONFIG.SUPABASE_URL}/rest/v1/stores`, {
                method: 'POST',
                headers: {
                    ...createAuthenticatedAdminHeaders(),
                    Prefer: 'return=representation'
                },
                body: JSON.stringify(payload)
            });
        }
        if (!res.ok) {
            const body = await res.text();
            throw new Error(body || `HTTP ${res.status}`);
        }
        const savedRows = await res.json().catch(() => []);
        if (!Array.isArray(savedRows) || savedRows.length !== 1) {
            throw new Error('Nenhuma loja foi alterada. Verifique a permissão administrativa.');
        }
        closeStoreModal();
        adminStoresLoaded = false;
        await loadAdminStores();
    } catch (err) {
        if (statusEl) statusEl.textContent = `Erro: ${err.message}`;
    } finally {
        finishSave();
    }
}

async function deleteStore(id, name) {
    if (!confirm(`Delete store "${name}"? This cannot be undone.`)) return;
    try {
        await refreshAdminSessionIfNeeded();
        const res = await fetch(
            `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/stores?id=eq.${encodeURIComponent(id)}`,
            {
                method: 'DELETE',
                headers: createAuthenticatedAdminHeaders({ Prefer: 'return=representation' })
            }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const deletedRows = await res.json().catch(() => []);
        if (!Array.isArray(deletedRows) || deletedRows.length !== 1) {
            throw new Error('Nenhuma loja foi excluída. Verifique a permissão administrativa.');
        }
        adminStoresLoaded = false;
        await loadAdminStores();
    } catch (err) {
        alert(`Error deleting store: ${err.message}`);
    }
}

// ============================================================
// UTILS
// ============================================================
function escapeAdminHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
