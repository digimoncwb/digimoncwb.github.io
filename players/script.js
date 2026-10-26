{
    const SUPABASE_URL =
        window.APP_CONFIG?.SUPABASE_URL || 'https://vllqakohumoinpdwnsqa.supabase.co';
    const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
    const headers = window.createSupabaseHeaders
        ? window.createSupabaseHeaders({ Prefer: 'return=minimal' })
        : {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal'
          };
    const CARD_IMAGE_BASE_URL = 'https://deckbuilder.egmanevents.com/card_images/digimon/';
    let allPlayers = [];
    let filteredPlayers = [];
    let playerSearchTerm = '';
    let editingPlayerId = null;
    let currentPage = 1;
    const PAGE_SIZE_STORAGE_KEY = 'playersPageSize';
    const INCLUDE_INACTIVE_STORAGE_KEY = 'playersIncludeInactive';
    const PAGE_SIZE_OPTIONS = [5, 10, 15, 30, 50, 100];
    let itemsPerPage = getInitialPageSize();
    let includeInactivePlayers = localStorage.getItem(INCLUDE_INACTIVE_STORAGE_KEY) === 'true';
    let playersPageInitialized = false;
    let playerModalKeydownAttached = false;
    const playerAliasAutofill = {
        bandaiNick: true,
        digilabName: true
    };
    let expandedPlayerId = null;
    let expandedHistoryEntryKey = null;
    const playerHistoryCache = new Map();
    const storeLogoMap = new Map(); // normalized name → bucket URL

    async function loadStoreLogos() {
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/stores?select=name,logo_url&order=name.asc`,
                { headers }
            );
            if (!res.ok) return;
            const stores = await res.json();
            stores.forEach((s) => {
                if (s.logo_url) storeLogoMap.set(normalizeStoreName(s.name), s.logo_url);
            });
        } catch {
            /* silent — falls back to local icons */
        }
    }

    function initPlayersPage() {
        if (playersPageInitialized) return;
        if (!document.getElementById('playersList')) return;

        playersPageInitialized = true;
        loadStoreLogos();
        loadPlayers();
        setupEventListeners();
    }

    window.initPlayersPage = initPlayersPage;
    window.addEventListener('digistats:players-changed', () => {
        if (playersPageInitialized && document.getElementById('playersList')) void loadPlayers();
    });
    window.resetPlayersPage = function resetPlayersPage() {
        playersPageInitialized = false;
        playerSearchTerm = '';
        currentPage = 1;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlayersPage);
    } else {
        initPlayersPage();
    }

    function getInitialPageSize() {
        const saved = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
        return PAGE_SIZE_OPTIONS.includes(saved) ? saved : 10;
    }
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) {
            console[type === 'error' ? 'error' : 'info'](message);
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function openPlayerModal(title = 'Novo jogador') {
        const modal = document.getElementById('playerModal');
        const titleEl = document.getElementById('playerModalTitle');
        const isNewPlayer = !editingPlayerId;
        playerAliasAutofill.bandaiNick = isNewPlayer;
        playerAliasAutofill.digilabName = isNewPlayer;
        if (titleEl) titleEl.textContent = title;
        if (modal) modal.classList.remove('u-hidden');
        const input = document.getElementById('playerName');
        if (input) setTimeout(() => input.focus(), 50);
    }

    function closePlayerModal() {
        const modal = document.getElementById('playerModal');
        if (modal) modal.classList.add('u-hidden');
    }

    function setupEventListeners() {
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.value = String(itemsPerPage);
            pageSizeSelect.addEventListener('change', (e) => {
                const selected = Number(e.target.value);
                if (PAGE_SIZE_OPTIONS.includes(selected)) {
                    itemsPerPage = selected;
                    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(itemsPerPage));
                    currentPage = 1;
                    renderPaginatedList();
                }
            });
        }

        const btnAddPlayer = document.getElementById('btnAddPlayer');
        if (btnAddPlayer) {
            btnAddPlayer.addEventListener('click', () => openPlayerModal('Novo jogador'));
        }

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', handleSubmit);
        }

        document.getElementById('playerModalCancelBtn')?.addEventListener('click', cancelEdit);
        document.getElementById('playerModalCloseBtn')?.addEventListener('click', cancelEdit);

        if (!playerModalKeydownAttached) {
            playerModalKeydownAttached = true;
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const modal = document.getElementById('playerModal');
                    if (modal && !modal.classList.contains('u-hidden')) cancelEdit();
                }
            });
        }

        document.querySelectorAll('#playerModal .player-modal-input').forEach((input) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                }
            });
        });

        const playerNameInput = document.getElementById('playerName');
        const bandaiNickInput = document.getElementById('playerBandaiNick');
        const digilabNameInput = document.getElementById('playerDigilabName');
        playerNameInput?.addEventListener('input', () => {
            if (editingPlayerId) return;
            if (bandaiNickInput && playerAliasAutofill.bandaiNick) {
                bandaiNickInput.value = playerNameInput.value;
            }
            if (digilabNameInput && playerAliasAutofill.digilabName) {
                digilabNameInput.value = playerNameInput.value;
            }
        });
        bandaiNickInput?.addEventListener('input', () => {
            if (!editingPlayerId) playerAliasAutofill.bandaiNick = false;
        });
        digilabNameInput?.addEventListener('input', () => {
            if (!editingPlayerId) playerAliasAutofill.digilabName = false;
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            playerSearchTerm = e.target.value.toLowerCase().trim();
            currentPage = 1;
            applyPlayerFilters();
        });

        const includeInactiveInput = document.getElementById('includeInactivePlayers');
        if (includeInactiveInput) {
            includeInactiveInput.checked = includeInactivePlayers;
            includeInactiveInput.addEventListener('change', (e) => {
                includeInactivePlayers = e.target.checked;
                localStorage.setItem(INCLUDE_INACTIVE_STORAGE_KEY, String(includeInactivePlayers));
                currentPage = 1;
                applyPlayerFilters();
            });
        }

        const playersList = document.getElementById('playersList');
        if (playersList) {
            playersList.addEventListener('click', (event) => {
                const toggleButton = event.target.closest('[data-action="toggle-player-history"]');
                if (toggleButton) {
                    togglePlayerHistory(toggleButton.dataset.playerId);
                    return;
                }
                const toggleHistoryEntry = event.target.closest(
                    '[data-action="toggle-history-entry"]'
                );
                if (toggleHistoryEntry) {
                    togglePlayerHistoryEntry(toggleHistoryEntry.dataset.entryKey);
                    return;
                }
                const registerDecklistButton = event.target.closest(
                    '[data-action="register-history-decklist"]'
                );
                if (registerDecklistButton) {
                    openHistoryDecklistRegister(registerDecklistButton);
                    return;
                }

                const editButton = event.target.closest('[data-action="edit-player"]');
                if (editButton) {
                    editPlayer(editButton.dataset.playerId);
                    return;
                }

                const deactivateButton = event.target.closest('[data-action="deactivate-player"]');
                if (deactivateButton) {
                    deactivatePlayer(
                        deactivateButton.dataset.playerId,
                        deactivateButton.dataset.playerName || ''
                    );
                }
            });

            playersList.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const toggleButton = event.target.closest('[data-action="toggle-player-history"]');
                if (toggleButton) {
                    event.preventDefault();
                    togglePlayerHistory(toggleButton.dataset.playerId);
                    return;
                }
                const toggleHistoryEntry = event.target.closest(
                    '[data-action="toggle-history-entry"]'
                );
                if (toggleHistoryEntry) {
                    event.preventDefault();
                    togglePlayerHistoryEntry(toggleHistoryEntry.dataset.entryKey);
                    return;
                }
                const registerDecklistButton = event.target.closest(
                    '[data-action="register-history-decklist"]'
                );
                if (registerDecklistButton) {
                    event.preventDefault();
                    openHistoryDecklistRegister(registerDecklistButton);
                }
            });
        }
    }

    async function loadPlayers() {
        const list = document.getElementById('playersList');
        const loadingNode = list ? list.querySelector('.loading') : null;
        if (window.uiState) {
            window.uiState.setLoading(list, loadingNode, true);
        }

        try {
            const res = window.supabaseApi
                ? await window.supabaseApi.get('/rest/v1/players?select=*&order=name.asc')
                : await fetch(`${SUPABASE_URL}/rest/v1/players?select=*&order=name.asc`, {
                      headers
                  });

            if (!res.ok) {
                throw new Error(`Falha ao carregar jogadores (${res.status})`);
            }

            allPlayers = await res.json();
            if (!list?.isConnected) return;
            applyPlayerFilters();
        } catch (error) {
            console.error(error);
            showToast('Erro ao carregar jogadores', 'error');
        } finally {
            if (window.uiState) {
                window.uiState.setLoading(list, loadingNode, false);
            }
        }
    }

    function renderPaginatedList() {
        const list = document.getElementById('playersList');
        const start = (currentPage - 1) * itemsPerPage;
        const paginatedItems = filteredPlayers.slice(start, start + itemsPerPage);
        const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage) || 1;

        list.innerHTML = '';

        if (filteredPlayers.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
            renderPagination(0);
            return;
        }

        document.getElementById('emptyState').style.display = 'none';
        const rowsHtml = paginatedItems
            .map((p) => {
                const isExpanded = String(expandedPlayerId || '') === String(p.id);
                const isInactive = p.is_active === false;
                const historyRows = playerHistoryCache.get(String(p.id));
                return `
                <tr class="players-table-row ${isExpanded ? 'is-expanded' : ''} ${isInactive ? 'is-inactive' : ''}">
                    <td class="players-cell-name">
                        <button
                            class="player-main-toggle"
                            type="button"
                            data-action="toggle-player-history"
                            data-player-id="${p.id}"
                            aria-expanded="${isExpanded ? 'true' : 'false'}"
                        >
                            <span class="player-main-name"><strong>${escapeHtml(p.name)}</strong>${isInactive ? '<small class="player-status-badge">Inativo</small>' : ''}</span>
                            <span class="player-main-hint">${isExpanded ? 'Ocultar histórico' : 'Mostrar histórico'}</span>
                        </button>
                    </td>
                    <td class="players-cell-actions">
                        <div class="player-actions">
                            <button class="btn-action btn-icon-only" type="button" title="Editar jogador" aria-label="Editar jogador" data-action="edit-player" data-player-id="${p.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                    <path d="M12 20h9"/>
                                    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                                </svg>
                            </button>
                            ${
                                isInactive
                                    ? ''
                                    : `<button class="btn-action btn-danger btn-icon-only" type="button" title="Inativar jogador" aria-label="Inativar jogador" data-action="deactivate-player" data-player-id="${p.id}" data-player-name="${escapeHtmlAttribute(p.name)}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M8 6V4h8v2"/>
                                    <path d="M19 6l-1 14H6L5 6"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                </svg>
                            </button>`
                            }
                        </div>
                    </td>
                </tr>
                <tr class="players-details-row ${isExpanded ? '' : 'u-hidden'}" data-player-history-row="${p.id}">
                    <td colspan="2">
                        <div class="player-history" data-player-history="${p.id}">
                            ${isExpanded ? renderPlayerHistory(historyRows, p.id, p.name) : ''}
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');

        list.innerHTML = `
        <table class="players-table" aria-label="Tabela de jogadores">
            <thead>
                <tr>
                    <th>Jogador</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;

        if (window.DIGISTATS_NATIVE_V2) {
            const legacyRows = list.querySelectorAll('.players-table-row');
            list.innerHTML = paginatedItems
                .map((player, index) => {
                    const expanded = String(expandedPlayerId || '') === String(player.id);
                    const inactive = player.is_active === false;
                    const initials = String(player.name || '')
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('');
                    const aliases = [
                        ['Bandai', player.bandai_nick],
                        ['DigiLab', player.digilab_name]
                    ]
                        .filter(([, name]) => name)
                        .map(
                            ([label, name]) =>
                                `<span><small>${label}</small>${escapeHtml(name)}</span>`
                        )
                        .join('');
                    return `<article class="player-profile${inactive ? ' is-inactive' : ''}">
                <div class="player-profile-header">
                    <span class="player-initials" aria-hidden="true">${/^https:\/\//.test(player.avatar_url || '') ? `<img src="${escapeHtml(player.avatar_url)}" alt="" referrerpolicy="no-referrer" data-player-avatar data-initials="${escapeHtml(initials)}">` : escapeHtml(initials)}</span>
                    <div class="player-profile-identity"><h2>${escapeHtml(player.name)}</h2>${inactive ? '<span class="player-status-badge">Inativo</span>' : ''}<div class="player-aliases">${aliases || '<span class="muted">Apelidos ainda não cadastrados</span>'}</div></div>
                    ${legacyRows[index].querySelector('.player-actions').outerHTML}
                </div>
                <button class="player-history-toggle" type="button" data-action="toggle-player-history" data-player-id="${player.id}" aria-expanded="${expanded}" aria-controls="player-history-${player.id}">${expanded ? 'Ocultar histórico' : 'Ver histórico de torneios'}<span aria-hidden="true">${expanded ? '−' : '+'}</span></button>
                <div id="player-history-${player.id}" class="player-history" data-player-history="${player.id}" ${expanded ? '' : 'hidden'}>${expanded ? renderPlayerHistory(playerHistoryCache.get(String(player.id)), player.id, player.name) : ''}</div>
            </article>`;
                })
                .join('');
        }

        list.querySelectorAll('img[data-player-avatar]').forEach((image) => {
            image.addEventListener(
                'error',
                () => image.replaceWith(document.createTextNode(image.dataset.initials || '')),
                { once: true }
            );
        });
        bindDecklistImageFallbacks(list);
        renderPagination(totalPages);
    }

    function togglePlayerHistory(playerId) {
        const id = String(playerId || '').trim();
        if (!id) return;
        const nextExpandedPlayerId = expandedPlayerId === id ? null : id;
        if (nextExpandedPlayerId !== expandedPlayerId) {
            expandedHistoryEntryKey = null;
        }
        expandedPlayerId = nextExpandedPlayerId;
        renderPaginatedList();

        if (expandedPlayerId && !playerHistoryCache.has(expandedPlayerId)) {
            loadPlayerHistory(expandedPlayerId);
        }
    }

    function togglePlayerHistoryEntry(entryKey) {
        const key = String(entryKey || '').trim();
        if (!key) return;
        expandedHistoryEntryKey = expandedHistoryEntryKey === key ? null : key;
        renderPaginatedList();
    }

    async function loadPlayerHistory(playerId) {
        const id = String(playerId || '').trim();
        if (!id || playerHistoryCache.has(id)) return;

        try {
            const decklistColumn = await resolvePlayerHistoryDecklistColumn(id);
            const endpoint =
                `/rest/v1/tournament_results?player_id=eq.${encodeURIComponent(id)}` +
                `&select=id,placement,tournament_date,tournament_id,${decklistColumn},store:stores(name),deck:decks(name)&order=tournament_date.desc,placement.asc&limit=200`;
            const res = window.supabaseApi
                ? await window.supabaseApi.get(endpoint)
                : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
            if (!res.ok) throw new Error(`Falha ao carregar histórico do jogador (${res.status})`);

            const rows = await res.json();
            playerHistoryCache.set(
                id,
                (Array.isArray(rows) ? rows : []).map((row) => ({
                    id: String(row?.id || '').trim(),
                    placement: Number(row?.placement) || 0,
                    tournamentDate: String(row?.tournament_date || ''),
                    tournamentId: String(row?.tournament_id || '').trim(),
                    storeName: String(row?.store?.name || ''),
                    deckName: String(row?.deck?.name || '-'),
                    decklist: String(row?.[decklistColumn] || '').trim()
                }))
            );
        } catch (error) {
            console.error(error);
            playerHistoryCache.set(id, []);
            showToast('Erro ao carregar histórico do jogador', 'error');
        }

        if (expandedPlayerId === id) {
            renderPaginatedList();
        }
    }

    async function resolvePlayerHistoryDecklistColumn(playerId) {
        const id = String(playerId || '').trim();
        const candidates = ['decklist', 'decklist_link'];
        for (const columnName of candidates) {
            const probeEndpoint =
                `/rest/v1/tournament_results?player_id=eq.${encodeURIComponent(id)}` +
                `&select=id,${columnName}&limit=1`;
            try {
                const res = window.supabaseApi
                    ? await window.supabaseApi.get(probeEndpoint)
                    : await fetch(`${SUPABASE_URL}${probeEndpoint}`, { headers });
                if (res.ok) return columnName;
            } catch {
                continue;
            }
        }
        return 'decklist';
    }

    function renderPlayerHistory(historyRows, playerId, playerName = '') {
        if (!Array.isArray(historyRows)) {
            return '<div class="player-history-loading">Carregando histórico...</div>';
        }
        if (historyRows.length === 0) {
            return '<div class="player-history-empty">Nenhum histórico encontrado.</div>';
        }

        return historyRows
            .map((item, index) => {
                const placement = Number(item.placement) || 0;
                const placementClass =
                    placement === 1
                        ? 'first-place'
                        : placement === 2
                          ? 'second-place'
                          : placement === 3
                            ? 'third-place'
                            : placement === 4
                              ? 'fourth-place'
                              : 'other-place';

                const storeName = item.storeName || 'Loja';
                const entryKey = `${playerId || 'player'}:${item.id || index}`;
                const isEntryExpanded = expandedHistoryEntryKey === entryKey;
                const rawDecklist = String(item.decklist || '').trim();
                const parsedDecklistEntries = parseDecklistEntries(rawDecklist);
                const registerButtonHtml = `
                <button
                    type="button"
                    class="player-history-register-btn"
                    data-action="register-history-decklist"
                    data-result-id="${escapeHtmlAttribute(item.id || '')}"
                    data-tournament-id="${escapeHtmlAttribute(item.tournamentId || '')}"
                    data-deck="${escapeHtmlAttribute(item.deckName || '')}"
                    data-player="${escapeHtmlAttribute(playerName || '')}"
                    data-store="${escapeHtmlAttribute(storeName || '')}"
                    data-date="${escapeHtmlAttribute(item.tournamentDate || '')}"
                    title="Register decklist"
                    aria-label="Register decklist"
                >
                    <span class="nav-icon" aria-hidden="true">
                        <img src="${escapeHtmlAttribute(`${getAssetPrefix()}icons/digivice.svg`)}" alt="" class="nav-icon-digivice" />
                    </span>
                    <span>Register</span>
                </button>
            `;
                return `
                <div class="player-history-entry ${isEntryExpanded ? 'is-open' : ''}">
                    <div
                        class="player-history-item ${placementClass}"
                        role="button"
                        tabindex="0"
                        data-action="toggle-history-entry"
                        data-entry-key="${escapeHtmlAttribute(entryKey)}"
                        aria-expanded="${isEntryExpanded ? 'true' : 'false'}"
                    >
                        <img
                            src="${resolveStoreIcon(storeName)}"
                            alt="${escapeHtmlAttribute(storeName)}"
                            class="player-history-store-logo"
                            loading="lazy"
                        />
                        <span class="results-mini-rank">${formatOrdinal(placement)}</span>
                        <div class="player-history-main">
                            <strong>${escapeHtml(item.deckName || '-')}</strong>
                            <span>${escapeHtml(storeName)} - ${formatDate(item.tournamentDate)}</span>
                        </div>
                    </div>
                    ${
                        isEntryExpanded
                            ? `<div class="player-history-decklist-panel">
                                ${
                                    parsedDecklistEntries.length > 0
                                        ? `<div class="player-history-decklist-actions">
                                            <a
                                                href="${escapeHtmlAttribute(
                                                    `${getAssetPrefix()}torneios/decklist-builder/index.html?${new URLSearchParams(
                                                        Object.fromEntries(
                                                            [
                                                                ['resultId', item.id || ''],
                                                                ['deck', item.deckName || ''],
                                                                ['player', playerName || ''],
                                                                ['store', storeName || ''],
                                                                ['date', item.tournamentDate || '']
                                                            ].filter(([, v]) => v)
                                                        )
                                                    ).toString()}`
                                                )}"
                                                class="player-history-register-btn"
                                            >
                                                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                                    <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                                                </svg>
                                                <span>Editar no Builder</span>
                                            </a>
                                        </div>
                                        <div class="player-history-decklist-grid">
                                            ${renderDecklistCards(parsedDecklistEntries)}
                                        </div>`
                                        : `<div class="player-history-decklist-empty-row">
                                            <div class="player-history-decklist-empty">Nenhuma lista de Deck cadastrada</div>
                                            ${registerButtonHtml}
                                        </div>`
                                }
                            </div>`
                            : ''
                    }
                </div>
            `;
            })
            .join('');
    }

    function openHistoryDecklistRegister(button) {
        const resultId = String(button?.dataset?.resultId || '').trim();
        const tournamentId = String(button?.dataset?.tournamentId || '').trim();
        const deck = String(button?.dataset?.deck || '').trim();
        const player = String(button?.dataset?.player || '').trim();
        const store = String(button?.dataset?.store || '').trim();
        const date = String(button?.dataset?.date || '').trim();

        const params = new URLSearchParams();
        if (resultId) params.set('resultId', resultId);
        if (tournamentId) params.set('tournament', tournamentId);
        if (deck) params.set('deck', deck);
        if (player) params.set('player', player);
        if (store) params.set('store', store);
        if (date) params.set('date', date);

        if (window.DIGISTATS_MICRO_FRONTENDS) {
            params.set('returnView', 'players');
            window.digistatsNavigate('builder', Object.fromEntries(params));
        } else {
            window.location.href = `${getAssetPrefix()}${window.DIGISTATS_NATIVE_V2 ? 'demo-v2/deckbuilder.html' : 'torneios/decklist-builder/index.html'}?${params.toString()}`;
        }
    }

    function renderPagination(totalPages) {
        const pagination = document.getElementById('playersPagination');
        if (!pagination) return;
        pagination.innerHTML = '';

        if (totalPages <= 1) return;

        if (currentPage > totalPages) currentPage = totalPages;

        const makeBtn = (label, ariaLabel, disabled, onClick) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-pagination';
            btn.textContent = label;
            btn.setAttribute('aria-label', ariaLabel);
            btn.disabled = disabled;
            btn.addEventListener('click', onClick);
            return btn;
        };

        const isMobile = window.innerWidth <= 768;

        if (!isMobile) {
            pagination.appendChild(
                makeBtn('\u00AB', 'Primeira página', currentPage === 1, () => {
                    currentPage = 1;
                    renderPaginatedList();
                })
            );
        }
        pagination.appendChild(
            makeBtn('\u25C0', 'Página anterior', currentPage <= 1, () => {
                if (currentPage <= 1) return;
                currentPage -= 1;
                renderPaginatedList();
            })
        );

        const WINDOW = isMobile ? 3 : 5;
        const startPage = Math.max(
            1,
            Math.min(currentPage - Math.floor(WINDOW / 2), totalPages - WINDOW + 1)
        );
        const endPage = Math.min(totalPages, startPage + WINDOW - 1);

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-pagination-number';
            btn.textContent = String(i);
            if (i === currentPage) {
                btn.disabled = true;
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                currentPage = i;
                renderPaginatedList();
            });
            pagination.appendChild(btn);
        }

        pagination.appendChild(
            makeBtn('\u25B6', 'Próxima página', currentPage >= totalPages, () => {
                if (currentPage >= totalPages) return;
                currentPage += 1;
                renderPaginatedList();
            })
        );
        if (!isMobile) {
            pagination.appendChild(
                makeBtn('\u00BB', 'Última página', currentPage >= totalPages, () => {
                    currentPage = totalPages;
                    renderPaginatedList();
                })
            );
        }
    }

    async function handleSubmit() {
        const nameInput = document.getElementById('playerName');
        const bandaiIdInput = document.getElementById('playerBandaiId');
        const bandaiNickInput = document.getElementById('playerBandaiNick');
        const digilabNameInput = document.getElementById('playerDigilabName');
        const name = String(nameInput?.value || '').trim();
        const bandaiId = String(bandaiIdInput?.value || '').trim();
        const bandaiNick = String(bandaiNickInput?.value || '').trim();
        const digilabName = String(digilabNameInput?.value || '').trim();
        if (!name) return;

        const isValidName = window.validation
            ? window.validation.isNonEmptyText(name, 2)
            : name.length >= 2;
        if (!isValidName) {
            showToast('Name must have at least 2 characters.', 'error');
            return;
        }

        const isEditing = Boolean(editingPlayerId);
        const url = isEditing
            ? `${SUPABASE_URL}/rest/v1/players?id=eq.${editingPlayerId}`
            : `${SUPABASE_URL}/rest/v1/players`;
        const method = isEditing ? 'PATCH' : 'POST';
        const payload = {
            name,
            bandai_id: bandaiId || null,
            bandai_nick: bandaiNick || null,
            digilab_name: digilabName || null
        };

        const res = window.supabaseApi
            ? await window.supabaseApi.request(url.replace(SUPABASE_URL, ''), {
                  method,
                  headers,
                  body: JSON.stringify(payload)
              })
            : await fetch(url, { method, headers, body: JSON.stringify(payload) });

        if (res.ok) {
            showToast(isEditing ? 'Jogador atualizado!' : 'Jogador adicionado!');
            cancelEdit();
            loadPlayers();
            return;
        }

        showToast(isEditing ? 'Erro ao atualizar jogador' : 'Erro ao adicionar jogador', 'error');
    }

    function editPlayer(id) {
        const player = allPlayers.find((item) => String(item.id) === String(id));
        if (!player) {
            showToast('Jogador não encontrado', 'error');
            return;
        }

        editingPlayerId = id;
        const nameInput = document.getElementById('playerName');
        const bandaiIdInput = document.getElementById('playerBandaiId');
        const bandaiNickInput = document.getElementById('playerBandaiNick');
        const digilabNameInput = document.getElementById('playerDigilabName');
        if (nameInput) nameInput.value = String(player.name || '');
        if (bandaiIdInput) bandaiIdInput.value = String(player.bandai_id || '');
        if (bandaiNickInput) bandaiNickInput.value = String(player.bandai_nick || '');
        if (digilabNameInput) digilabNameInput.value = String(player.digilab_name || '');
        openPlayerModal('Editar jogador');
    }

    function applyPlayerFilters() {
        const activityFiltered = allPlayers.filter(
            (player) => includeInactivePlayers || player.is_active !== false
        );
        filteredPlayers = activityFiltered.filter((player) =>
            [player.name, player.bandai_nick, player.digilab_name, player.bandai_id]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(playerSearchTerm)
        );
        const totalPlayersCount = document.getElementById('totalPlayersCount');
        if (totalPlayersCount) totalPlayersCount.textContent = String(filteredPlayers.length);
        renderPaginatedList();
    }

    function cancelEdit() {
        editingPlayerId = null;
        ['playerName', 'playerBandaiId', 'playerBandaiNick', 'playerDigilabName'].forEach(
            (inputId) => {
                const input = document.getElementById(inputId);
                if (input) input.value = '';
            }
        );
        closePlayerModal();
    }

    async function deactivatePlayer(id, name) {
        if (!confirm(`Inativar "${name}"? O histórico do jogador será preservado.`)) return;
        const endpoint = `/rest/v1/players?id=eq.${encodeURIComponent(id)}`;
        const res = window.supabaseApi
            ? await window.supabaseApi.request(endpoint, {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({ is_active: false })
              })
            : await fetch(`${SUPABASE_URL}${endpoint}`, {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({ is_active: false })
              });
        if (res.ok) {
            showToast('Jogador inativado!');
            loadPlayers();
        } else {
            showToast('Erro ao inativar jogador', 'error');
        }
    }

    function escapeHtmlAttribute(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(dateString) {
        const text = String(dateString || '').trim();
        if (!text) return '-';
        const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
    }

    function formatOrdinal(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '-';
        const int = Math.trunc(n);
        const abs = Math.abs(int);
        const mod100 = abs % 100;
        if (mod100 >= 11 && mod100 <= 13) return `${int}th`;
        const mod10 = abs % 10;
        if (mod10 === 1) return `${int}st`;
        if (mod10 === 2) return `${int}nd`;
        if (mod10 === 3) return `${int}rd`;
        return `${int}th`;
    }

    function getAssetPrefix() {
        const path = String(window.location.pathname || '').toLowerCase();
        return path.includes('/players/') ? '../' : '';
    }

    function normalizeStoreName(name) {
        return String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function resolveStoreIcon(storeName) {
        const normalized = normalizeStoreName(storeName);
        for (const [key, url] of storeLogoMap) {
            if (normalized.includes(key) || key.includes(normalized)) return url;
        }
        return '';
    }

    function parseDecklistEntries(rawText) {
        const text = String(rawText || '').trim();
        if (!text) return [];

        const byLines = parseDecklistByLines(text);
        if (byLines.length > 0) return byLines;

        const repeated = parseDecklistRepeatedCodes(text);
        return repeated.length > 0 ? aggregateDecklistCodes(repeated) : [];
    }

    function parseDecklistByLines(text) {
        const lines = text.split(/\r?\n/);
        const temp = [];

        lines.forEach((line) => {
            const raw = String(line || '').trim();
            if (!raw) return;
            if (/^decklist$/i.test(raw)) return;
            if (/^\/\/\s*/.test(raw)) return;

            const withQty = raw.match(
                /^(\d{1,2})\s+.*?((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}(?:_[A-Z0-9]+)?)\s*$/i
            );
            if (withQty) {
                const qty = Number(withQty[1]);
                const code = normalizeDeckCode(withQty[2]);
                if (isValidDeckCode(code)) temp.push({ code, count: qty });
                return;
            }

            const qtyInParens = raw.match(
                /^(\d{1,2})\s*\(\s*((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}(?:_[A-Z0-9]+)?)\s*\)\s*$/i
            );
            if (qtyInParens) {
                const qty = Number(qtyInParens[1]);
                const code = normalizeDeckCode(qtyInParens[2]);
                if (isValidDeckCode(code)) temp.push({ code, count: qty });
                return;
            }

            const singleCode = raw.match(
                /^((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}(?:_[A-Z0-9]+)?)$/i
            );
            if (singleCode) {
                const code = normalizeDeckCode(singleCode[1]);
                if (isValidDeckCode(code)) temp.push({ code, count: 1 });
            }
        });

        return aggregateDecklistEntries(temp);
    }

    function parseDecklistRepeatedCodes(text) {
        const matches = text.matchAll(
            /((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}(?:_[A-Z0-9]+)?)/gi
        );
        return Array.from(matches)
            .map((match) => normalizeDeckCode(match[1]))
            .filter((code) => isValidDeckCode(code));
    }

    function aggregateDecklistCodes(codes) {
        return aggregateDecklistEntries(codes.map((code) => ({ code, count: 1 })));
    }

    function aggregateDecklistEntries(entries) {
        const map = new Map();
        entries.forEach((item) => {
            const code = normalizeDeckCode(item?.code || '');
            const count = Math.max(1, Number(item?.count) || 1);
            if (!isValidDeckCode(code)) return;
            if (!map.has(code)) map.set(code, { code, count: 0 });
            map.get(code).count += count;
        });
        return Array.from(map.values());
    }

    function normalizeDeckCode(value) {
        return String(value || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/_/g, '_');
    }

    function isValidDeckCode(code) {
        return /^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}(?:_[A-Z0-9]+)?$/i.test(
            String(code || '')
        );
    }

    function renderDecklistCards(entries) {
        return entries
            .map((entry) => {
                const imageCandidates = buildDeckCardImageCandidates(entry.code);
                const primarySrc = imageCandidates[0] || '';
                return `
                <article class="player-history-deck-card" data-code="${escapeHtmlAttribute(entry.code)}">
                    <span class="player-history-deck-card-count">${Number(entry.count) || 1}</span>
                    <img
                        src="${escapeHtmlAttribute(primarySrc)}"
                        alt="${escapeHtmlAttribute(entry.code)}"
                        loading="lazy"
                        data-image-candidates="${escapeHtmlAttribute(imageCandidates.join('|'))}"
                        data-image-candidate-index="0"
                    />
                </article>
            `;
            })
            .join('');
    }

    function buildDeckCardImageCandidates(code) {
        const normalized = normalizeDeckCode(code);
        const baseCode = normalized.split('_')[0];
        const encodedCode = encodeURIComponent(baseCode);
        const candidates = [
            `https://digimoncardgame.fandom.com/wiki/Special:FilePath/${encodedCode}-Sample.png`,
            `https://digimon.digilab.cards/api/card/${encodedCode}.jpg`,
            `https://aegis-digi.online/assets/card-images/${encodedCode}-Sample.webp`,
            `${CARD_IMAGE_BASE_URL}${encodedCode}.webp`,
            `${CARD_IMAGE_BASE_URL}${encodedCode}.png`,
            `https://card-list.prodigi.dev/images/cards/${encodedCode}.webp`,
            `https://card-list.prodigi.dev/images/cards/${encodedCode}.png`
        ];
        return Array.from(new Set(candidates));
    }

    function bindDecklistImageFallbacks(scopeRoot) {
        const root = scopeRoot || document;
        root.querySelectorAll('.player-history-deck-card img[data-image-candidates]').forEach(
            (img) => {
                if (img.dataset.fallbackBound === 'true') return;
                img.dataset.fallbackBound = 'true';
                img.addEventListener('error', () => {
                    const candidates = String(img.dataset.imageCandidates || '')
                        .split('|')
                        .map((item) => item.trim())
                        .filter(Boolean);
                    const currentIndex = Number(img.dataset.imageCandidateIndex || '0');
                    const nextIndex = currentIndex + 1;
                    if (nextIndex >= candidates.length) {
                        img.closest('.player-history-deck-card')?.classList.add('is-missing-image');
                        img.removeAttribute('src');
                        return;
                    }
                    img.dataset.imageCandidateIndex = String(nextIndex);
                    img.src = candidates[nextIndex];
                });
            }
        );
    }
}
