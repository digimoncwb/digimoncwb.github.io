(function decklistBuilderPage() {

    // ─── Constants ────────────────────────────────────────────────────────────

    const IMAGE_BASE_URL = 'https://digimon.digilab.cards/api/card/';
    const LEGACY_IMAGE_BASE_URL = 'https://deckbuilder.egmanevents.com/card_images/digimon/';
    const DIGIMON_CARD_API_URL = 'https://digimoncard.io/api-public/search';
    const DIGIMON_ALL_CARDS_API = 'https://digimoncard.io/api-public/getAllCards';
    const DIGISTATS_LOGO_URL = window.DIGISTATS_MICRO_FRONTENDS ? 'icons/logo.png' : '../../icons/logo.png';
    const BLANK_MIDDLE_FALLBACK_BG = window.APP_CONFIG?.SUPABASE_URL
        ? `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/post-backgrounds/AD01.png`
        : window.DIGISTATS_MICRO_FRONTENDS ? 'icons/AD01.png' : '../../icons/AD01.png';
    const TEMPLATE_EDITOR_STATE_KEY = 'digistats.template-editor.state.v1';

    const CATALOG_BUCKET_URL = window.APP_CONFIG?.SUPABASE_URL
        ? `${window.APP_CONFIG.SUPABASE_URL}/storage/v1/object/public/card-catalog/card-catalog.json`
        : '';
    const CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

    const DECK_CODE_PATTERN = /^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/;
    const RAW_DECK_CODE_WITH_SUFFIX_PATTERN =
        /((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3})(?:_[A-Z0-9]+)?/i;

    // Deck size rules
    const MAX_COPIES_PER_CARD = 4;
    const MAX_MAIN_DECK_CARDS = 50;
    const MAX_DIGI_EGG_CARDS = 5;
    const MAX_TOTAL_IMPORT = MAX_MAIN_DECK_CARDS + MAX_DIGI_EGG_CARDS; // 55

    // Card search pagination
    const CARD_SEARCH_LIMIT = 40;
    const CARD_SEARCH_PAGE_SIZE = 12;
    const CARD_SEARCH_MAX_RESULTS = 240;
    const CARD_SEARCH_FIXED_COLS = 4;
    const CARD_SEARCH_FIXED_ROWS = 3;
    const CARD_IMAGE_RATIO = 88 / 63;

    // Cache TTLs
    const CARD_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

    // Legacy image overrides
    const LEGACY_IMAGE_CODES = new Set(['BT6-084', 'BT23-077', 'BT7-083', 'ST12-13']);

    // Banned cards (cannot be added at all)
    const BANNED_CODES = new Set(['BT2-090', 'BT5-109', 'EX5-065']);

    // Restricted cards (max 1 copy)
    const RESTRICTED_CODES = new Set([
        'BT1-090', 'BT10-009', 'BT11-033', 'BT11-064', 'BT13-012',
        'BT13-110', 'BT14-002', 'BT14-084', 'BT15-057', 'BT15-102',
        'BT16-011', 'BT17-069', 'BT19-040', 'BT2-047', 'BT3-054',
        'BT3-103', 'BT4-104', 'BT4-111', 'BT6-100', 'BT6-104',
        'BT7-038', 'BT7-064', 'BT7-069', 'BT7-072', 'BT7-107',
        'BT9-098', 'BT9-099', 'EX1-021', 'EX1-068', 'EX2-039',
        'EX2-070', 'EX3-057', 'EX4-006', 'EX4-019', 'EX4-030',
        'EX5-015', 'EX5-018', 'EX5-062', 'P-008', 'P-025',
        'P-029', 'P-030', 'P-123', 'P-130', 'ST2-13',
        'ST9-09',
    ]);

    // Choice restrictions: cannot use both cards in the same deck
    const CHOICE_RESTRICTION_GROUPS = [
        ['BT20-037', 'EX8-037'],
        ['BT20-037', 'BT17-035'],
        ['EX7-064', 'EX2-007'],
    ];

    // Up to 50 copies cards
    const UNLIMITED_CODES = new Set(['BT22-079', 'BT11-061', 'BT6-085', 'EX22-046', 'EX9-048', 'EX11-027']);

    // Supabase table names
    const DECKLISTS_TABLE = 'decklists';
    const DECKLIST_CARDS_TABLE = 'decklist_cards';
    const DECKLIST_CARD_META_TABLE = 'decklist_card_metadata';

    // ─── Runtime config ───────────────────────────────────────────────────────

    const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || '';
    const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
    const headers = window.createSupabaseHeaders
        ? window.createSupabaseHeaders()
        : {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
          };

    // ─── State ────────────────────────────────────────────────────────────────

    let entries = [];
    let context = { resultId: '', decklistId: '', deck: '', player: '', store: '', date: '', format: '' };
    let dragSrcIndex = -1;

    let cardSearchResults = [];
    let cardSearchPage = 1;
    let cardSearchStatusAutoHideTimer = null;

    let catalogCache = null;
    let catalogCacheAt = 0;
    let formatBackgroundCache = null;
    const cardImageUploadCache = new Map();

    const cardDetailsByCode = new Map();
    let cardHydrationToken = 0;
    let deckErrorAutoHideTimer = null;
    let cardSearchLayoutTimer = null;
    let cardSearchLayoutRaf = null;

    function getCardSearchGridConfig() {
        const isMobile = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : false;
        if (isMobile) {
            return { cols: 4, rows: 1, pageSize: 4 };
        }
        return {
            cols: CARD_SEARCH_FIXED_COLS,
            rows: CARD_SEARCH_FIXED_ROWS,
            pageSize: CARD_SEARCH_PAGE_SIZE,
        };
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────

    async function initializeDeckbuilder() {
        bindActions();
        render([]);
        renderCardSearchResults();
        scheduleCardSearchResultsLayout();
        window.addEventListener('resize', () => {
            renderCardSearchResults();
            scheduleCardSearchResultsLayout();
        }, { passive: true });
        await Promise.all([loadBanListFromDb(), loadCatalog()]);
        await applyContextFromQuery();
        populateSetFilterDropdown();
    }
    window.initializeDeckbuilder = initializeDeckbuilder;
    window.refreshDeckbuilderContext = applyContextFromQuery;
    // React owns the editor UI; keep the existing catalog/image pipeline reusable.
    window.digistatsBuilderAssets = {
        loadCatalog,
        details: ensureCardDetailsForZoom,
        systemRules: () => ({ main_count: MAX_MAIN_DECK_CARDS, egg_max: MAX_DIGI_EGG_CARDS,
            copies: MAX_COPIES_PER_CARD, banned_codes: [...BANNED_CODES],
            limited_cards: Object.fromEntries([...RESTRICTED_CODES].map((code) => [code, 1])),
            unlimited_codes: [...UNLIMITED_CODES], choice_groups: CHOICE_RESTRICTION_GROUPS }),
        async exportImage(cards, metadata) {
            entries = cards.map((card) => ({ code: card.code, count: card.qty }));
            context = { ...context, ...metadata };
            await hydrateCardMetadata(entries, { allowRerender: false });
            const canvas = await buildDeckImageCanvas(entries);
            const blob = await canvasToBlob(canvas);
            if (!blob) throw new Error('Não foi possível gerar a imagem.');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = buildDeckImageFilename(); link.click();
            URL.revokeObjectURL(url);
        }
    };
    if (!window.DIGISTATS_MICRO_FRONTENDS)
        document.addEventListener('DOMContentLoaded', initializeDeckbuilder);

    function scheduleCardSearchResultsLayout() {
        if (cardSearchLayoutTimer) { clearTimeout(cardSearchLayoutTimer); cardSearchLayoutTimer = null; }
        cardSearchLayoutTimer = setTimeout(() => {
            cardSearchLayoutTimer = null;
            if (cardSearchLayoutRaf) { cancelAnimationFrame(cardSearchLayoutRaf); }
            cardSearchLayoutRaf = requestAnimationFrame(() => {
                cardSearchLayoutRaf = null;
                applyCardSearchResultsFixedGridLayout();
            });
        }, 60);
    }

    function applyCardSearchResultsFixedGridLayout() {
        const root = document.getElementById('cardSearchResults');
        if (!root) return;
        const scroll = root.querySelector('.decklist-search-results-scroll');
        const grid = root.querySelector('.decklist-search-results-grid');
        if (!scroll || !grid) return;

        const getPx = (v) => {
            const n = Number.parseFloat(String(v || '').replace('px', ''));
            return Number.isFinite(n) ? n : 0;
        };

        const scrollStyles = getComputedStyle(scroll);
        const padX = getPx(scrollStyles.paddingLeft) + getPx(scrollStyles.paddingRight);
        const padY = getPx(scrollStyles.paddingTop) + getPx(scrollStyles.paddingBottom);
        const width = Math.max(0, scroll.clientWidth - padX);

        const gridStyles = getComputedStyle(grid);
        const gapX = getPx(gridStyles.columnGap || gridStyles.gap);
        const gapY = getPx(gridStyles.rowGap || gridStyles.gap);

        const { cols, rows } = getCardSearchGridConfig();
        const cardW = (width - gapX * (cols - 1)) / cols;
        const cardH = cardW * CARD_IMAGE_RATIO;
        if (!Number.isFinite(cardH) || cardH <= 0) return;

        const totalH = rows * cardH + gapY * (rows - 1) + padY + 2;
        scroll.style.height = `${Math.ceil(totalH)}px`;
        grid.style.gridAutoRows = `${Math.ceil(cardH)}px`;
    }

    // ─── Card catalog (fetched once from Storage bucket, cached in memory) ──────

    async function loadCatalog() {
        const now = Date.now();
        if (Array.isArray(catalogCache) && catalogCache.length && now - catalogCacheAt < CATALOG_CACHE_TTL_MS) {
            return catalogCache;
        }
        if (!CATALOG_BUCKET_URL) return [];
        try {
            const res = await fetch(CATALOG_BUCKET_URL, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) return [];
            const data = await res.json();
            catalogCache = Array.isArray(data) ? data : [];
            catalogCacheAt = now;
            return catalogCache;
        } catch (_) {
            return [];
        }
    }

    // ─── Set filter dropdown (derived from catalog) ───────────────────────────

    async function populateSetFilterDropdown() {
        const datalist = document.getElementById('cardSearchCodeList');
        if (!datalist) return;
        try {
            const catalog = await loadCatalog();
            if (!catalog.length) return;

            // Extract set prefix: everything before the trailing -digits
            const prefixSet = new Set();
            catalog.forEach(r => {
                const m = String(r?.card_code || '').match(/^(.+)-\d+$/);
                if (m) prefixSet.add(m[1]);
            });

            // Sort: group by series letter(s), then numerically within each group
            const numSuffix = s => parseInt(s.replace(/\D/g, '') || '0', 10);
            const sorted = Array.from(prefixSet).sort((a, b) => {
                const sa = a.match(/^[A-Z]+/)?.[0] || '';
                const sb = b.match(/^[A-Z]+/)?.[0] || '';
                if (sa !== sb) return sa.localeCompare(sb);
                return numSuffix(a) - numSuffix(b);
            });

            sorted.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                datalist.appendChild(opt);
            });
        } catch (_) {}
    }

    // ─── Ban list from DB ─────────────────────────────────────────────────────

    async function loadBanListFromDb() {
        if (!window.APP_CONFIG?.SUPABASE_URL) return;
        try {
            const headers = window.createSupabaseHeaders
                ? window.createSupabaseHeaders()
                : { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/ban_list?select=card_code,restriction`,
                { headers }
            );
            if (!res.ok) return; // table may not exist yet — silently skip
            const rows = await res.json();
            if (!Array.isArray(rows)) return;
            for (const row of rows) {
                const code = String(row.card_code || '').trim().toUpperCase();
                if (!code) continue;
                if (row.restriction === 'banned') {
                    BANNED_CODES.add(code);
                } else if (row.restriction === 'limited') {
                    RESTRICTED_CODES.add(code);
                }
            }
        } catch {
            // Non-critical — builder works with hardcoded lists as fallback
        }
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    function bindActions() {
        const backLink = document.querySelector('.decklist-builder-back-nav');
        if (backLink) {
            const params = new URLSearchParams(window.location.search);
            const returnView = params.get('returnView');
            const dashboardUrl = window.DIGISTATS_MICRO_FRONTENDS ? new URL('demo-v2/tools.html', document.baseURI) : new URL('../../index.html', window.location.href);
            if (returnView === 'tournaments' || returnView === 'decks' || returnView === 'players' || returnView === 'statistics') {
                dashboardUrl.searchParams.set('view', returnView);
            }
            if (returnView === 'tournaments') {
                const tournamentId = String(params.get('returnTournamentId') || '').trim();
                const returnMode = params.get('returnMode');
                if (tournamentId) dashboardUrl.searchParams.set('returnTournamentId', tournamentId);
                if (returnMode === 'list' || returnMode === 'calendar') dashboardUrl.searchParams.set('returnMode', returnMode);
            }
            backLink.href = dashboardUrl.href;
        }
        on('btnDecklistBuilderImport', 'click', () => openImportModal());
        on('btnDecklistBuilderExport', 'click', () => exportDecklist());
        on('btnDecklistBuilderExportImage', 'click', () => exportDeckAsImage());
        on('btnDecklistBuilderAdd', 'click', () => addManualCode());
        on('btnDecklistBuilderSave', 'click', () => saveDecklist());
        on('btnDecklistBuilderSortCards', 'click', () => sortDeckCards());
        on('btnDecklistBuilderClear', 'click', () => openClearModal());
        on('btnDecklistClearCancel', 'click', () => closeClearModal());
        on('btnDecklistClearClose', 'click', () => closeClearModal());
        on('btnDecklistClearConfirm', 'click', () => { closeClearModal(); clearDecklist(); });
        on('btnDecklistImportCancel', 'click', () => closeImportModal());
        on('btnDecklistImportClose', 'click', () => closeImportModal());
        on('btnDecklistImportConfirm', 'click', () => importDecklistFromModal());
        on('btnDecklistSaveWarningClose', 'click', () => closeSaveWarningModal());
        on('btnDecklistSaveWarningCancel', 'click', () => closeSaveWarningModal());
        on('btnDecklistSaveWarningConfirm', 'click', () => { closeSaveWarningModal(); performSave(); });
        on('btnCardSearch', 'click', () => performCardSearch());
        on('btnCardSearchReset', 'click', () => resetCardSearch());

        // Chip / dot groups: single-select toggle + auto-search
        ['cardSearchTypeGroup', 'cardSearchColorGroup', 'cardSearchColor2Group', 'cardSearchLevelGroup'].forEach(groupId => {
            const group = document.getElementById(groupId);
            if (!group) return;
            group.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-value]');
                if (!btn) return;
                group.querySelectorAll('[data-value]').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                if (hasAnySearchFilter(getCardSearchFilters())) performCardSearch();
            });
        });

        // Inject "Dual" chip into the type group if not already present
        const typeGroup = document.getElementById('cardSearchTypeGroup');
        if (typeGroup && !typeGroup.querySelector('[data-value="dual"]')) {
            const reference = typeGroup.querySelector('[data-value="option"]') || typeGroup.lastElementChild;
            const template  = typeGroup.querySelector('[data-value="option"]') || typeGroup.querySelector('[data-value]');
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.dataset.value = 'dual';
            chip.textContent = 'Dual';
            if (template) chip.className = template.className.replace(/\bis-active\b/g, '').trim();
            if (reference && reference.nextSibling) {
                typeGroup.insertBefore(chip, reference.nextSibling);
            } else {
                typeGroup.appendChild(chip);
            }
        }

        // Dynamic datalist: only show suggestions when the user has typed something
        const setInput = document.getElementById('cardSearchCode');
        const setDatalist = document.getElementById('cardSearchCodeList');
        if (setInput && setDatalist) {
            let allSetPrefixes = [];
            // Grab prefixes once after catalog loads (populated by populateSetFilterDropdown)
            setInput.addEventListener('focus', () => {
                if (!allSetPrefixes.length) {
                    allSetPrefixes = Array.from(setDatalist.querySelectorAll('option')).map(o => o.value);
                }
            });
            setInput.addEventListener('input', () => {
                const val = setInput.value.trim().toUpperCase();
                // Snapshot full list once
                if (!allSetPrefixes.length) {
                    allSetPrefixes = Array.from(setDatalist.querySelectorAll('option')).map(o => o.value);
                }
                // Repopulate with only matching options (browser hides datalist when empty)
                setDatalist.innerHTML = '';
                if (val.length >= 1) {
                    allSetPrefixes
                        .filter(p => p.startsWith(val))
                        .forEach(p => {
                            const opt = document.createElement('option');
                            opt.value = p;
                            setDatalist.appendChild(opt);
                        });
                }
            });
        }

        onModal('decklistImportModal', closeImportModal);
        onModal('decklistClearModal', closeClearModal);
        onModal('decklistSaveWarningModal', closeSaveWarningModal);
        onModal('deckCardZoomModal', closeCardZoomModal);

        on('btnDeckCardZoomClose', 'click', () => closeCardZoomModal());
        on('deckCardZoomImage', 'contextmenu', (e) => { e.preventDefault(); closeCardZoomModal(); });

        on('cardSearchText', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); performCardSearch(); } });
        on('cardSearchCode', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); performCardSearch(); } });

        on('cardSearchPlayCost', 'input', () => {
            const input = document.getElementById('cardSearchPlayCost');
            if (!input) return;
            const raw = String(input.value || '').replace(/\D+/g, '').slice(0, 2);
            input.value = raw ? String(Math.max(0, Math.min(20, Number(raw)))) : '';
        });

        const manualInput = document.getElementById('decklistBuilderManualCode');
        if (manualInput) {
            manualInput.addEventListener('input', () => { manualInput.value = manualInput.value.toUpperCase(); });
            manualInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addManualCode(); } });
        }

        document.addEventListener('keydown', (e) => {
            if (window.DIGISTATS_MICRO_FRONTENDS && !document.getElementById('v2Tools')?.querySelector('[data-builder-root]')) return;
            if (e.key === 'Escape') { closeImportModal(); closeClearModal(); closeCardZoomModal(); }
        });

        const searchResultsRoot = document.getElementById('cardSearchResults');
        if (searchResultsRoot) {
            searchResultsRoot.addEventListener('click', handleSearchResultClick);
        }
    }

    /** Attach a listener to an element by id (no-op if element missing). */
    function on(id, event, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    }

    /** Close a modal when the backdrop (the modal element itself) is clicked. */
    function onModal(id, closeFn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { if (e.target === el) closeFn(); });
    }

    function handleSearchResultClick(event) {
        const pageControl = event.target.closest('[data-search-page]');
        if (pageControl) {
            const dir = String(pageControl.getAttribute('data-search-page') || '');
            const total = cardSearchResults.length;
            const { pageSize } = getCardSearchGridConfig();
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            if (dir === 'prev') cardSearchPage = Math.max(1, cardSearchPage - 1);
            if (dir === 'next') cardSearchPage = Math.min(totalPages, cardSearchPage + 1);
            renderCardSearchResults();
            return;
        }

        const card = event.target.closest('.decklist-search-card[data-code]');
        if (!card) return;

        const code = normalizeDeckCode(card.getAttribute('data-code') || '');
        if (!isValidDeckCode(code)) {
            setCardSearchStatus('Invalid card code returned by search.', 'warn');
            return;
        }

        const cardData = cardSearchResults.find(
            (item) => normalizeDeckCode(item?.card_code || item?.id || '') === code
        );
        const changed = tryUpsertEntry(code, 1, buildEntryMetaFromCard(cardData));
        if (changed.error) { render([changed.error]); return; }

        setSaveStatus('');
        render([]);
        setCardSearchStatus(`${code} added to decklist.`, 'ok');
    }

    // ─── Context / URL params ─────────────────────────────────────────────────

    async function applyContextFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const resultId = String(params.get('resultId') || params.get('result_id') || '').trim();

        context = {
            resultId,
            decklistId: resultId ? '' : String(params.get('decklistId') || '').trim(),
            deck: params.get('deck') || '',
            player: params.get('player') || '',
            store: params.get('store') || '',
            date: params.get('date') || '',
            format: params.get('format') || '',
        };

        entries = [];
        cardHydrationToken++;
        closeImportModal();
        closeSaveWarningModal();
        render([]);
        setSaveStatus('');
        if (!context.resultId && !context.decklistId) {
            setSaveStatus('Select a result in Full Results to save this decklist.', 'warn');
        }

        renderContextMeta(context);
        await loadExistingDecklist();
        renderContextMeta(context);
        if (params.get('openImport') === '1') {
            openImportModal();
            const url = new URL(window.location.href);
            url.searchParams.delete('openImport');
            window.history.replaceState(window.history.state, '', url.href);
        }
    }

    function renderContextMeta(meta) {
        const root = document.getElementById('decklistBuilderMeta');
        if (!root) return;

        const PILL_ICONS = {
            Deck: `<svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="10" height="8" rx="1.5"/><path d="M4 4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1"/></svg>`,
            Player: `<svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 13.5c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5"/></svg>`,
            Store: `<svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5 3.5 2h9L14 6.5"/><path d="M2 6.5h12v7.5H2z"/><path d="M6 14v-4h4v4"/></svg>`,
            Date: `<svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 7h12"/><path d="M5 1v3M11 1v3"/></svg>`,
            Format: `<svg class="pill-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h8M2 8h6M2 12h4"/><circle cx="12" cy="10" r="2.5"/><path d="M14 12.5 15.5 14"/></svg>`,
        };

        const items = [
            { label: 'Deck', value: meta.deck || '-' },
            { label: 'Player', value: meta.player || '-' },
            { label: 'Store', value: meta.store || '-' },
            { label: 'Date', value: formatContextDate(meta.date) || '-' },
            { label: 'Format', value: meta.format || '-' },
        ];

        root.innerHTML = items
            .map((i) => `<div class="decklist-builder-meta-pill">${PILL_ICONS[i.label] || ''}<span class="pill-label">${escapeHtml(i.label)}</span><span class="pill-value">${escapeHtml(i.value)}</span></div>`)
            .join('');
    }

    function formatContextDate(rawDate) {
        const value = String(rawDate || '').trim();
        if (!value) return '';
        const parsed = new Date(`${value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return value;
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(parsed);
    }

    // ─── Import modal ─────────────────────────────────────────────────────────

    function openImportModal() {
        const modal = document.getElementById('decklistImportModal');
        const textarea = document.getElementById('decklistImportTextarea');
        if (!modal || !textarea) return;
        textarea.value = '';
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => textarea.focus(), 0);
    }

    function closeImportModal() {
        const modal = document.getElementById('decklistImportModal');
        if (!modal?.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function openClearModal() {
        if (entries.length === 0) { setSaveStatus('Decklist is already empty.', 'warn'); return; }
        const modal = document.getElementById('decklistClearModal');
        if (!modal) return;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('btnDecklistClearCancel')?.focus(), 0);
    }

    function closeClearModal() {
        const modal = document.getElementById('decklistClearModal');
        if (!modal?.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    function openSaveWarningModal(msg) {
        const modal = document.getElementById('decklistSaveWarningModal');
        if (!modal) return;
        const msgEl = document.getElementById('decklistSaveWarningMsg');
        if (msgEl) msgEl.innerHTML = msg.split('\n').map(l => `<span>${l}</span>`).join('<br>');
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('btnDecklistSaveWarningCancel')?.focus(), 0);
    }

    function closeSaveWarningModal() {
        const modal = document.getElementById('decklistSaveWarningModal');
        if (!modal?.classList.contains('is-open')) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    async function importDecklistFromModal() {
        const textarea = document.getElementById('decklistImportTextarea');
        if (!textarea) return;

        const pasted = String(textarea.value || '').trim();
        if (!pasted) {
            render(['Paste a decklist before importing.']);
            closeImportModal();
            return;
        }

        // Parse without enforcing per-bucket limits — we cap by raw total (55).
        const result = parseDecklistText(pasted);

        if (result.entries.length === 0) {
            render(result.errors.length > 0
                ? result.errors
                : ['No valid deck codes found. Check the format and try again.']);
            return;
        }

        // Enforce the hard cap of MAX_TOTAL_IMPORT (55) cards total.
        const cappedEntries = capImportEntries(result.entries, MAX_TOTAL_IMPORT);
        const wasCapped = getTotalCards(cappedEntries) < getTotalCards(result.entries);

        const errors = [...result.errors];
        if (wasCapped) {
            errors.push(`Decklist trimmed to ${MAX_TOTAL_IMPORT} cards (${MAX_MAIN_DECK_CARDS} main + ${MAX_DIGI_EGG_CARDS} egg max).`);
        }

        entries = cappedEntries;
        setSaveStatus('');

        // Show "Importing..." feedback while fetching card data from the API.
        // Do NOT call render() here — it triggers a competing hydrateCardMetadata()
        // inside render() that increments cardHydrationToken and cancels our own
        // hydration via the token guard, leaving cardDetailsByCode empty for the sort.
        const confirmBtn = document.getElementById('btnDecklistImportConfirm');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Importing...'; }
        setSaveStatus('Importing cards...', 'info');

        try {
            // Always fetch all unique codes so newly-imported entries always have
            // type + level data even if a stale cache entry exists without them.
            const uniqueCodes = [...new Set(
                entries.map((i) => normalizeDeckCode(i.code)).filter(isValidDeckCode)
            )];

            if (uniqueCodes.length) {
                const nowIso = new Date().toISOString();
                const metaRows = await fetchDecklistCardMetadataFromDb(uniqueCodes);
                metaRows.forEach((row) => {
                    const code = normalizeDeckCode(row?.card_code || '');
                    if (!code) return;
                    const existing = cardDetailsByCode.get(code) || {};
                    cardDetailsByCode.set(code, {
                        ...existing,
                        card_code: code,
                        type: row?.card_type || existing?.type || '',
                        level: normalizeCardLevel(row?.card_level ?? existing?.level),
                        is_digi_egg: normalizeBoolean(row?.is_digi_egg ?? existing?.is_digi_egg),
                        updated_at: nowIso,
                    });
                });

                const missingCodes = uniqueCodes.filter((code) => {
                    const meta = cardDetailsByCode.get(code) || {};
                    return shouldFetchApiMetadata(meta);
                });

                if (missingCodes.length) {
                    // Fetch each code individually in parallel — the batch API endpoint
                    // does not reliably return all cards when multiple codes are passed,
                    // so individual requests are the only guaranteed approach.
                    const settled = await Promise.allSettled(
                        missingCodes.map(async (code) => {
                            const query = new URLSearchParams({ card: code, limit: '1' });
                            const res = await fetch(`${DIGIMON_CARD_API_URL}?${query}`);
                            if (!res.ok) return null;
                            const rows = await res.json();
                            if (!Array.isArray(rows) || !rows.length) return null;
                            return { code, row: rows[0] };
                        })
                    );
                    settled.forEach((outcome) => {
                        if (outcome.status !== 'fulfilled' || !outcome.value) return;
                        const { code, row } = outcome.value;
                        const level = normalizeCardLevel(row?.level ?? row?.card_payload?.level);
                        cardDetailsByCode.set(code, {
                            card_code: code,
                            id: row?.id || code,
                            name: row?.name || code,
                            pack: row?.pack || code.split('-')[0] || '',
                            color: row?.color || '',
                            type: row?.type || '',
                            level: Number.isFinite(level) ? level : (row?.level ?? ''),
                            card_payload: row || {},
                            updated_at: nowIso,
                        });
                    });
                }
            }

            // Write API data back into each entry's meta so the sort comparator
            // has type + level available without needing another async lookup.
            entries.forEach((entry) => {
                const details = cardDetailsByCode.get(normalizeDeckCode(entry.code));
                if (!details) return;
                const type = normalizeCardType(details.type || details.card_payload?.type);
                const level = normalizeCardLevel(details.level ?? details.card_payload?.level);
                if (type || Number.isFinite(level)) {
                    entry.meta = {
                        cardType: mapTypeToDbLabel(type) || null,
                        cardLevel: Number.isFinite(level) ? level : null,
                        isDigiEgg: type === 'digi-egg',
                    };
                }
            });

            // Sort exactly like btnDecklistBuilderSortCards does
            if (entries.length > 1) {
                const sorted = [...entries].sort(compareDeckEntries);
                entries = sorted;
            }

            render(errors);
            setSaveStatus('Cards imported and sorted successfully.', 'ok');
        } catch (error) {
            render(errors);
            setSaveStatus(error?.message || 'Import completed with errors.', 'warn');
        } finally {
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Import'; }
            closeImportModal();
        }
    }

    function capImportEntries(sourceEntries, maxTotal) {
        const result = [];
        let running = 0;

        for (const item of sourceEntries) {
            if (running >= maxTotal) break;
            const maxForThisCard = getMaxCopies(item.code);
            const qty = Math.max(0, Math.min(maxForThisCard, Number(item.count) || 0));
            const allowed = Math.min(qty, maxTotal - running);
            if (allowed <= 0) continue;
            result.push({ ...item, count: allowed });
            running += allowed;
        }

        return result;
    }

    // ─── Card zoom modal ──────────────────────────────────────────────────────

    async function openCardZoomModal(code) {
        const modal = document.getElementById('deckCardZoomModal');
        const image = document.getElementById('deckCardZoomImage');
        const metaTitle = document.getElementById('deckCardZoomMetaTitle');
        const metaBody = document.getElementById('deckCardZoomMetaBody');
        if (!modal || !image) return;

        const normalized = normalizeDeckCode(code || '');
        if (!isValidDeckCode(normalized)) return;

        const [primaryImageUrl, fallbackImageUrl] = getCardZoomImageUrls(normalized);

        let triedFallback = false;
        image.onerror = () => {
            if (!triedFallback && fallbackImageUrl && image.src !== fallbackImageUrl) {
                triedFallback = true;
                image.src = fallbackImageUrl;
                return;
            }
        };

        image.src = primaryImageUrl;
        image.alt = `Card preview ${normalized}`;
        if (metaTitle) metaTitle.textContent = normalized;
        if (metaBody) metaBody.innerHTML = '<div class="deck-card-zoom-meta-loading">Loading metadata...</div>';
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');

        const details = await ensureCardDetailsForZoom(normalized);
        if (metaTitle) {
            metaTitle.textContent = `${String(details?.name || normalized).trim()} (${normalized})`;
        }
        if (metaBody) {
            metaBody.innerHTML = buildCardZoomMetadataHtml(normalized, details);
        }
    }

    function closeCardZoomModal() {
        const modal = document.getElementById('deckCardZoomModal');
        const image = document.getElementById('deckCardZoomImage');
        const metaTitle = document.getElementById('deckCardZoomMetaTitle');
        const metaBody = document.getElementById('deckCardZoomMetaBody');
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        if (image) {
            image.onerror = null;
            image.src = '';
        }
        if (metaTitle) metaTitle.textContent = '';
        if (metaBody) metaBody.innerHTML = '';
    }

    async function ensureCardDetailsForZoom(code) {
        const normalized = normalizeDeckCode(code || '');
        let cached = cardDetailsByCode.get(normalized);
        if (!cached) {
            const dbRow = await fetchCardCacheRowFromDb(normalized);
            if (dbRow) {
                cached = {
                    ...dbRow,
                    id: dbRow?.id || normalized,
                    card_code: normalized,
                    // decklist_card_metadata uses card_type; map to type for compatibility
                    type: dbRow?.type || dbRow?.card_type || '',
                    level: normalizeCardLevel(dbRow?.card_level ?? dbRow?.level),
                    updated_at: new Date().toISOString(),
                };
                cardDetailsByCode.set(normalized, cached);
            }
        }
        const cachedPayload = cached?.card_payload && typeof cached.card_payload === 'object' ? cached.card_payload : null;

        if (cached && hasRichApiPayload(cachedPayload)) return cached;

        const rows = await fetchCardsFromDigimonApi([normalized]);
        if (!Array.isArray(rows) || rows.length === 0) {
            return cached || { card_code: normalized, name: normalized, card_payload: {} };
        }

        const merged = { ...(cached || {}), ...rows[0], card_code: normalized, updated_at: new Date().toISOString() };
        cardDetailsByCode.set(normalized, merged);
        return merged;
    }

    function hasRichApiPayload(payload) {
        if (!payload || typeof payload !== 'object') return false;
        const effectKeys = ['main_effect', 'source_effect', 'security_effect', 'alt_effect', 'effect'];
        const metaKeys = ['play_cost', 'evolution_cost', 'dp', 'rarity', 'set_name', 'artist', 'color', 'type'];
        const hasAny = (keys) => keys.some((key) => {
            const v = payload[key];
            if (v === null || v === undefined) return false;
            if (Array.isArray(v)) return v.length > 0;
            return String(v).trim() !== '';
        });
        const hasEffects = hasAny(effectKeys);
        const hasMeta = hasAny(metaKeys);
        return (hasEffects && hasMeta) || hasEffects;
    }

    // ─── Card zoom metadata HTML ──────────────────────────────────────────────

    function buildCardZoomMetadataHtml(_code, details) {
        const payload = details?.card_payload && typeof details.card_payload === 'object' ? details.card_payload : {};

        const firstPresent = (...values) =>
            values.find((v) => v !== null && v !== undefined && String(v).trim() !== '');

        const joinUniqueSlash = (...values) => {
            const seen = new Set();
            const parts = [];
            values.forEach((v) => {
                const text = String(v ?? '').trim();
                if (!text || seen.has(text.toLowerCase())) return;
                seen.add(text.toLowerCase());
                parts.push(text);
            });
            return parts.join(' / ');
        };

        const normalizeEffectText = (v) =>
            String(v || '').replace(/Security Effect\s*\[Security\]/gi, '[Security]').trim();

        const normalizedType = normalizeCardType(firstPresent(details?.type, payload?.type));
        const showLevel = normalizedType !== 'tamer' && normalizedType !== 'option';
        const playCostLabel = normalizedType === 'option' ? 'Use Cost' : 'Play Cost';
        const mergedColor = joinUniqueSlash(firstPresent(details?.color, payload?.color), payload?.color2);
        const mergedTrait = joinUniqueSlash(
            firstPresent(payload?.digi_type, payload?.digitype),
            payload?.digi_type2, payload?.digi_type3, payload?.digi_type4,
        );

        const metaFields = [
            { label: 'Card Type', value: firstPresent(details?.type, payload?.type) },
            { label: 'Color', value: mergedColor },
            { label: 'Digivolve Color', value: firstPresent(payload?.evo_color, payload?.digivolve_color, payload?.evocolor, payload?.evolution_color) },
            { label: 'Digivolve Level', value: firstPresent(payload?.evolution_level) },
            { label: 'Digivolve From', value: firstPresent(payload?.digivolve_from, payload?.evolution_from) },
            { label: playCostLabel, value: firstPresent(details?.play_cost, payload?.play_cost, payload?.playcost) },
            { label: 'Digivolve Cost', value: firstPresent(payload?.evo_cost, payload?.evolution_cost, payload?.evocost) },
            { label: 'Level', value: showLevel ? firstPresent(details?.level, payload?.level) : null },
            { label: 'Power', value: firstPresent(payload?.dp, payload?.power) },
            { label: 'Trait', value: mergedTrait },
            { label: 'Form', value: firstPresent(payload?.form) },
            { label: 'Attribute', value: firstPresent(payload?.attribute) },
            { label: 'Stage Level', value: firstPresent(payload?.stage) },
            { label: 'Rarity', value: firstPresent(details?.rarity, payload?.rarity) },
            { label: 'Artist', value: firstPresent(payload?.artist) },
            { label: 'Pack', value: firstPresent(details?.pack, payload?.pack) },
        ].filter((f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== '');

        const textBlocks = [
            { label: 'Effect', value: normalizeEffectText(firstPresent(payload?.main_effect, payload?.effect)) },
            { label: 'Inherited Effect', value: normalizeEffectText(firstPresent(payload?.source_effect, payload?.inherited_effect)) },
            { label: 'Security Effect', value: normalizeEffectText(firstPresent(payload?.security_effect)) },
            { label: 'Alt Effect', value: normalizeEffectText(firstPresent(payload?.alt_effect)) },
            { label: 'Source', value: firstPresent(payload?.pack, details?.pack) },
            { label: 'Notes', value: firstPresent(payload?.notes) },
        ].filter((f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== '');

        if (metaFields.length === 0 && textBlocks.length === 0) {
            return '<div class="deck-card-zoom-meta-loading">No metadata found.</div>';
        }

        const gridHtml = `
            <div class="deck-card-zoom-meta-grid">
                ${metaFields.map((f) => `
                    <div class="deck-card-zoom-meta-cell">
                        <span class="deck-card-zoom-meta-label">${escapeHtml(f.label)}</span>
                        <strong class="deck-card-zoom-meta-value">${escapeHtml(f.value)}</strong>
                    </div>
                `).join('')}
            </div>
        `;

        const textHtml = textBlocks.map((f) => `
            <div class="deck-card-zoom-meta-block">
                <div class="deck-card-zoom-meta-block-title">${escapeHtml(f.label)}</div>
                <div class="deck-card-zoom-meta-block-text">${escapeHtml(f.value)}</div>
            </div>
        `).join('');

        return `${gridHtml}${textHtml}`;
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    async function exportDecklist() {
        const validation = validateAggregatedEntries(entries);
        if (validation.errors.length > 0) { render(validation.errors); return; }
        if (entries.length === 0) { render(['No cards to export.']); return; }

        const text = serializeDecklist(entries);
        try {
            await navigator.clipboard.writeText(text);
            setSaveStatus('');
            showToast('Decklist copied to clipboard.', 'ok');
        } catch {
            setSaveStatus('');
            showToast('Could not copy automatically.', 'warn');
            window.prompt('Copy this decklist manually:', text);
        }
    }

    async function exportDeckAsImage() {
        if (entries.length === 0) { render(['No cards to export as an image.']); return; }

        const btn = document.getElementById('btnDecklistBuilderExportImage');
        if (btn) btn.disabled = true;
        setSaveStatus('');
        showToast('Generating image...', 'info', 5000);

        try {
            await hydrateCardMetadata(entries, { allowRerender: false });
            const canvas = await buildDeckImageCanvas(entries);
            const filename = buildDeckImageFilename();
            const blob = await canvasToBlob(canvas);
            if (!blob) throw new Error('Failed to generate image blob.');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = filename;
            (window.digiStatsComponentRoot ? window.digiStatsComponentRoot() : document.body).appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setSaveStatus('');
            showToast('Image exported successfully.', 'ok');
        } catch (error) {
            setSaveStatus('Failed to export image.', 'error');
            render([error?.message || 'Failed to export decklist image.']);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─── Deck image canvas ────────────────────────────────────────────────────

    async function buildDeckImageCanvas(sourceEntries) {
        const width = 1080;
        const height = 1080;
        const frameX = 22;
        const frameY = 16;
        const frameWidth = width - 44;
        const frameHeight = height - 32;
        const safePaddingX = 28;
        const safePaddingY = 18;
        const headerHeight = 170;
        const footerHeight = 220;
        const cardRatio = 88 / 63;
        const availableW = frameWidth - safePaddingX * 2;
        const availableH = frameHeight - headerHeight - footerHeight - safePaddingY * 2;

        const layout = chooseBestDeckImageGrid({
            count: sourceEntries.length, minCols: 4, maxCols: 8,
            availableWidth: availableW, availableHeight: availableH, cardRatio,
        });

        const { cardsPerRow, cardWidth, cardHeight, gapX, gapY, boardWidth, boardHeight } = layout;
        const boardX = frameX + safePaddingX + Math.max(0, Math.round((availableW - boardWidth) / 2));
        const boardY = frameY + headerHeight + safePaddingY + 6 + Math.max(0, Math.round((availableH - boardHeight) / 2));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas.');

        await drawDeckImageBackground(ctx, width, height);
        drawDeckImageHeader(ctx, width, frameY);

        const [images, brandLogo] = await Promise.all([
            Promise.all(sourceEntries.map((e) => loadCardImage(e.code))),
            loadBrandLogoImage(),
        ]);

        sourceEntries.forEach((entry, index) => {
            const col = index % cardsPerRow;
            const row = Math.floor(index / cardsPerRow);
            const x = boardX + col * (cardWidth + gapX);
            const y = boardY + row * (cardHeight + gapY);
            drawCardOnCanvas(ctx, entry, images[index], x, y, cardWidth, cardHeight);
        });

        drawDeckImageFooter(ctx, frameX, frameY, frameWidth, frameHeight, footerHeight, brandLogo);
        return canvas;
    }

    function drawDeckImageHeader(ctx, width, frameY) {
        const deckTitle = context.deck || 'Deck Builder';
        const titleSize = Math.max(38, Math.min(56, Math.round(700 / Math.max(9, deckTitle.length))));
        const titleY = frameY + 10 + 42;
        const playerY = titleY + 60;
        const storeY = playerY + 48;

        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        ctx.fillStyle = '#0f172a';
        ctx.font = `800 ${titleSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(deckTitle, width / 2, titleY);

        ctx.fillStyle = '#253248';
        ctx.font = '700 28px "Segoe UI", Arial, sans-serif';
        ctx.fillText(context.player || '-', width / 2, playerY);

        ctx.fillStyle = '#445470';
        ctx.fillText(buildDeckImageStoreDateLine(), width / 2, storeY);
    }

    function drawCardOnCanvas(ctx, entry, image, x, y, cardWidth, cardHeight) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#c9d2ff';
        ctx.lineWidth = 2;
        roundRect(ctx, x - 2, y - 2, cardWidth + 4, cardHeight + 4, 8);
        ctx.fill();
        ctx.stroke();

        if (image) {
            ctx.drawImage(image, x, y, cardWidth, cardHeight);
        } else {
            ctx.fillStyle = '#e6ebff';
            ctx.fillRect(x, y, cardWidth, cardHeight);
            ctx.fillStyle = '#31437f';
            ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(entry.code, x + cardWidth / 2, y + cardHeight / 2);
        }

        const badgeSize = Math.max(26, Math.min(40, Math.round(cardWidth * 0.28)));
        const centerX = x + cardWidth - Math.round(cardWidth * 0.04) - badgeSize + badgeSize / 2;
        const centerY = y + Math.round(cardHeight * 0.12) + badgeSize / 2;

        ctx.fillStyle = 'rgba(26, 31, 58, 0.9)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.max(16, Math.round(badgeSize * 0.58))}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(entry.count), centerX, centerY + 1);
        ctx.textBaseline = 'alphabetic';
    }

    function drawDeckImageFooter(ctx, frameX, frameY, frameWidth, frameHeight, footerHeight, brandLogo) {
        const footerY = frameY + frameHeight - footerHeight + 8;
        const footerX = frameX + 18;
        const footerW = frameWidth - 36;
        const logoSize = brandLogo ? 192 : 0;
        const logoX = footerX + footerW - logoSize - 4;
        const logoY = footerY + Math.round((footerHeight - logoSize) / 2) - 10;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#1f2f59';
        ctx.font = '700 24px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Created with DigiStats', footerX + 8, footerY + footerHeight - 26);

        if (brandLogo) ctx.drawImage(brandLogo, logoX, logoY, logoSize, logoSize);
    }

    function chooseBestDeckImageGrid({ count, minCols, maxCols, availableWidth, availableHeight, cardRatio }) {
        count = Math.max(1, Number(count) || 1);
        minCols = Math.max(1, Number(minCols) || 4);
        maxCols = Math.max(minCols, Number(maxCols) || 8);
        availableWidth = Math.max(1, Number(availableWidth) || 1);
        availableHeight = Math.max(1, Number(availableHeight) || 1);
        cardRatio = Math.max(1, Number(cardRatio) || 1.39);
        let best = null;

        for (let cols = minCols; cols <= maxCols; cols++) {
            const rows = Math.max(1, Math.ceil(count / cols));
            const gapX = Math.max(10, Math.min(20, Math.round(availableWidth * 0.016)));
            const gapY = Math.max(12, Math.min(22, Math.round(gapX * 1.12)));
            const byWidth = (availableWidth - (cols - 1) * gapX) / cols;
            const byHeight = ((availableHeight - (rows - 1) * gapY) / rows) / cardRatio;
            const cardWidth = Math.floor(Math.min(byWidth, byHeight));
            if (cardWidth < 60) continue;

            const cardHeight = Math.round(cardWidth * cardRatio);
            const boardWidth = cols * cardWidth + (cols - 1) * gapX;
            const boardHeight = rows * cardHeight + (rows - 1) * gapY;
            const areaScore = boardWidth * boardHeight;
            const candidate = { cardsPerRow: cols, rows, cardWidth, cardHeight, gapX, gapY, boardWidth, boardHeight, areaScore };

            if (!best || areaScore > best.areaScore || (areaScore === best.areaScore && cardWidth > best.cardWidth)) {
                best = candidate;
            }
        }

        if (best) return best;

        // Fallback if no valid grid was found
        const cardWidth = 120;
        const cardHeight = Math.round(cardWidth * cardRatio);
        const cols = Math.min(maxCols, Math.max(minCols, 7));
        const rows = Math.max(1, Math.ceil(count / cols));
        const gapX = 16, gapY = 18;
        return {
            cardsPerRow: cols, rows, cardWidth, cardHeight, gapX, gapY,
            boardWidth: cols * cardWidth + (cols - 1) * gapX,
            boardHeight: rows * cardHeight + (rows - 1) * gapY,
            areaScore: 0,
        };
    }

    async function drawDeckImageBackground(ctx, width, height) {
        const bg = await loadBackgroundImage(await resolveDeckImageBackgroundPath());
        if (bg) {
            drawImageCover(ctx, bg, 0, 0, width, height);
        } else {
            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#667eea');
            grad.addColorStop(1, '#764ba2');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        roundRect(ctx, 22, 16, width - 44, height - 32, 22);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160, 170, 205, 0.32)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function buildDeckImageStoreDateLine() {
        const date = context.date ? formatContextDateForImage(context.date) : '';
        const store = String(context.store || '').trim();
        const format = String(context.format || '').trim();
        if (store && date && format) return `${store}, ${date} - ${format}`;
        if (store && date) return `${store}, ${date}`;
        if (store && format) return `${store} - ${format}`;
        if (date && format) return `${date} - ${format}`;
        return store || date || format || '-';
    }

    function formatContextDateForImage(rawDate) {
        const value = String(rawDate || '').trim();
        if (!value) return '';
        const parsed = new Date(`${value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return value;
        return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(parsed);
    }

    // ─── Image loading ────────────────────────────────────────────────────────

    async function loadCardImage(code) {
        const normalized = normalizeDeckCode(code || '');
        if (!normalized) return null;

        for (const url of getExportCardImageUrls(normalized)) {
            const img = await loadImageWithCors(url);
            if (img) return img;
        }

        const uploadedUrl = await uploadCardImageForExport(normalized);
        if (uploadedUrl) {
            const uploadedImg = await loadImageWithCors(uploadedUrl);
            if (uploadedImg) return uploadedImg;
        }

        for (const url of getExternalExportCardImageUrls(normalized)) {
            const img = await loadImageWithCors(url);
            if (img) return img;
        }

        return null;
    }

    function getExportCardImageUrls(code) {
        if (!code) return [];
        const encodedCode = encodeURIComponent(code);
        const storageUrl = SUPABASE_URL
            ? `${SUPABASE_URL}/storage/v1/object/public/deck-images/${encodedCode}.webp`
            : '';
        const metadataUrls = getCardMetadataImageUrls(code);
        return Array.from(new Set([storageUrl, ...metadataUrls].filter(Boolean)));
    }

    function getExternalExportCardImageUrls(code) {
        if (!code) return [];
        const encodedCode = encodeURIComponent(code);
        const guessedUrls = [
            `${IMAGE_BASE_URL}${encodedCode}.jpg`,
            `https://aegis-digi.online/assets/card-images/${encodedCode}-Sample.webp`,
            `${LEGACY_IMAGE_BASE_URL}${encodedCode}.webp`,
            `${LEGACY_IMAGE_BASE_URL}${encodedCode}.png`,
            `https://card-list.prodigi.dev/images/cards/${encodedCode}.webp`,
            `https://card-list.prodigi.dev/images/cards/${encodedCode}.png`,
            `https://digimoncardgame.fandom.com/wiki/Special:FilePath/${encodedCode}-Sample.png`,
        ];
        return Array.from(new Set(guessedUrls.filter(Boolean)));
    }

    async function uploadCardImageForExport(code) {
        const normalized = normalizeDeckCode(code || '');
        if (!normalized || !SUPABASE_URL) return '';
        if (cardImageUploadCache.has(normalized)) return cardImageUploadCache.get(normalized);

        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-card-image`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: normalized }),
            });
            if (!res.ok) {
                cardImageUploadCache.set(normalized, '');
                return '';
            }
            const payload = await res.json();
            const url = String(payload?.url || '').trim();
            cardImageUploadCache.set(normalized, url);
            return url;
        } catch {
            cardImageUploadCache.set(normalized, '');
            return '';
        }
    }

    function getCardMetadataImageUrls(code, sourceDetails = null) {
        const normalized = normalizeDeckCode(code || '');
        const details = sourceDetails || cardDetailsByCode.get(normalized) || {};
        const payload = details?.card_payload && typeof details.card_payload === 'object' ? details.card_payload : {};
        const candidates = [
            details.image_url,
            details.imageUrl,
            details.card_image,
            details.cardImage,
            details.img_url,
            details.img,
            payload.image_url,
            payload.imageUrl,
            payload.card_image,
            payload.cardImage,
            payload.img_url,
            payload.img,
            payload.image,
            payload.card_img,
            payload.cardImageUrl,
            payload.card_image_url,
            Array.isArray(payload.images) ? payload.images[0] : '',
            Array.isArray(payload.card_images) ? payload.card_images[0] : '',
        ];

        return candidates.flatMap((value) => normalizeImageUrlCandidate(value));
    }

    function normalizeImageUrlCandidate(value) {
        if (!value) return [];
        if (typeof value === 'string') return [value.trim()].filter(Boolean);
        if (typeof value !== 'object') return [];

        return [
            value.url,
            value.src,
            value.image_url,
            value.imageUrl,
            value.card_image,
            value.cardImage,
            value.small,
            value.large,
            value.full,
        ]
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    function getCardImageUrl(rawCode) {
        const code = normalizeDeckCode(rawCode || '');
        return `${IMAGE_BASE_URL}${code}.jpg`;
    }

    function getCardZoomImageUrls(rawCode) {
        const code = normalizeDeckCode(rawCode || '');
        if (!code) return ['', ''];
        return [`${IMAGE_BASE_URL}${code}.jpg`, `https://aegis-digi.online/assets/card-images/${code}-Sample.webp`, `${LEGACY_IMAGE_BASE_URL}${code}.webp`];
    }

    function loadImageWithCors(url) {
        const safeUrl = String(url || '').trim();
        if (!safeUrl) return Promise.resolve(null);
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = safeUrl;
        });
    }

    function loadBrandLogoImage() { return loadImageWithCors(DIGISTATS_LOGO_URL); }
    function loadBackgroundImage(path) { return loadImageWithCors(String(path || '').trim() || BLANK_MIDDLE_FALLBACK_BG); }

    function drawImageCover(ctx, image, dx, dy, dw, dh) {
        if (!ctx || !image) return;
        const sw = image.width || 1, sh = image.height || 1;
        const srcRatio = sw / sh, dstRatio = dw / dh;
        let sx = 0, sy = 0, sWidth = sw, sHeight = sh;
        if (srcRatio > dstRatio) { sWidth = sh * dstRatio; sx = (sw - sWidth) / 2; }
        else { sHeight = sw / dstRatio; sy = (sh - sHeight) / 2; }
        ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
    }

    function getBlankMiddleTemplateBackgroundPath() {
        try {
            const state = JSON.parse(localStorage.getItem(TEMPLATE_EDITOR_STATE_KEY) || 'null');
            const path = String(state?.selectedBackgroundPath || '').trim();
            if (String(state?.selectedPostType || '') === 'blank_middle' && path) return path;
        } catch { /* ignore */ }
        return BLANK_MIDDLE_FALLBACK_BG;
    }

    async function resolveDeckImageBackgroundPath() {
        const formatBackground = await getFormatBackgroundUrl(context.format);
        return formatBackground || getBlankMiddleTemplateBackgroundPath();
    }

    async function getFormatBackgroundUrl(formatCode) {
        const normalizedCode = normalizeFormatCode(formatCode);
        if (!normalizedCode || !SUPABASE_URL) return '';

        if (!formatBackgroundCache) {
            formatBackgroundCache = await fetchFormatBackgroundMap();
        }

        return formatBackgroundCache.get(normalizedCode) || '';
    }

    async function fetchFormatBackgroundMap() {
        const map = new Map();
        try {
            const select = 'code,background_path,background_url,is_active';
            const res = await fetch(`${SUPABASE_URL}/rest/v1/formats?select=${encodeURIComponent(select)}`, {
                headers,
            });
            if (!res.ok) return map;

            const rows = await res.json();
            if (!Array.isArray(rows)) return map;

            rows.forEach((row) => {
                if (!row?.code || row?.is_active === false) return;
                const code = normalizeFormatCode(row.code);
                const url = resolveFormatBackgroundUrl(row);
                if (code && url) map.set(code, url);
            });
        } catch {
            // Background is cosmetic; fall back to the local/default template.
        }
        return map;
    }

    function resolveFormatBackgroundUrl(row) {
        const backgroundUrl = String(row?.background_url || '')
            .trim()
            .replace(/(\/storage\/v1\/object\/public\/[^/]+\/)formats\//, '$1');
        if (backgroundUrl) return backgroundUrl;

        const backgroundPath = String(row?.background_path || '').trim().replace(/^formats\//, '');
        if (!backgroundPath || !SUPABASE_URL) return '';

        return `${SUPABASE_URL}/storage/v1/object/public/post-backgrounds/${encodeURI(backgroundPath)}`;
    }

    function normalizeFormatCode(value) {
        return String(value || '').trim().toUpperCase();
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
    }

    function buildDeckImageFilename() {
        const base = String(context.deck || 'decklist')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        return `${base || 'decklist'}-${new Date().toISOString().slice(0, 10)}.png`;
    }

    // ─── Card search ──────────────────────────────────────────────────────────

    function getActiveChipValue(groupId) {
        return String(document.querySelector(`#${groupId} [data-value].is-active`)?.dataset.value || '').trim();
    }

    function getCardSearchFilters() {
        const rawPlayCost = String(document.getElementById('cardSearchPlayCost')?.value || '').trim();
        let playcost = '';
        if (rawPlayCost) {
            const n = Number(rawPlayCost);
            if (Number.isFinite(n)) {
                playcost = String(Math.max(0, Math.min(20, Math.trunc(n))));
                const input = document.getElementById('cardSearchPlayCost');
                if (input && rawPlayCost !== playcost) input.value = playcost;
            }
        }
        return {
            text:   String(document.getElementById('cardSearchText')?.value || '').trim(),
            color:  getActiveChipValue('cardSearchColorGroup'),
            color2: getActiveChipValue('cardSearchColor2Group'),
            type:   getActiveChipValue('cardSearchTypeGroup'),
            level:  getActiveChipValue('cardSearchLevelGroup'),
            playcost,
            card:  String(document.getElementById('cardSearchCode')?.value || '').trim().toUpperCase(),
        };
    }

    function hasAnySearchFilter(filters) {
        return Boolean(filters && (filters.text || filters.color || filters.color2 || filters.type || filters.level || filters.playcost || filters.card));
    }

    async function performCardSearch() {
        const filters = getCardSearchFilters();
        if (!hasAnySearchFilter(filters)) {
            cardSearchResults = [];
            renderCardSearchResults();
            return;
        }

        const btn = document.getElementById('btnCardSearch');
        if (btn) btn.disabled = true;
        try {
            // DB is the primary source — full catalog is downloaded via Admin > Download Cards.
            // API is only a fallback for cards not yet in the DB.
            let rows = await fetchCardSearchRowsFromDb(filters);

            if (!rows.length) {
                const onlySetFilter = filters.card &&
                    !filters.text && !filters.color && !filters.color2 &&
                    !filters.type && !filters.level && !filters.playcost;
                let apiRows;
                if (onlySetFilter) {
                    // getAllCards gives the complete code list for the set; batch-fetch details.
                    apiRows = await fetchAllCardsBySetFromApi(filters.card);
                } else {
                    apiRows = await fetchCardSearchRowsMerged(filters);
                }
                rows = applyLocalCardSearchFilters(apiRows, filters);
            }

            const nowIso = new Date().toISOString();
            const usedCodes = new Set();
            const normalized = [];

            rows.forEach((row) => {
                const code = normalizeDeckCode(row?.card_code || row?.id || row?.card || '');
                if (!isValidDeckCode(code) || usedCodes.has(code)) return;
                usedCodes.add(code);
                const mapped = {
                    card_code: code, id: row?.id || code, name: row?.name || code,
                    pack: row?.pack || code.split('-')[0] || '',
                    color: row?.color || '',
                    type: row?.card_type || row?.type || '',
                    level: row?.card_level ?? row?.level ?? '',
                    play_cost: row?.play_cost ?? null,
                    rarity: row?.rarity || '',
                    card_payload: row?.card_payload || row || {},
                };
                normalized.push(mapped);
                cardDetailsByCode.set(code, { ...mapped, updated_at: nowIso });
            });

            cardSearchResults = normalized;
            cardSearchPage = 1;
            renderCardSearchResults();
        } catch (error) {
            cardSearchResults = [];
            cardSearchPage = 1;
            renderCardSearchResults();
            const msg = String(error?.message || '').trim();
            setCardSearchStatus(
                /failed to fetch/i.test(msg) ? 'No results found for this filter.' : (msg || 'Error while searching cards.'),
                /failed to fetch/i.test(msg) ? 'warn' : 'error',
                /failed to fetch/i.test(msg) ? { autoClearMs: 3000 } : {},
            );
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function resetChipGroup(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.querySelectorAll('[data-value]').forEach(btn => btn.classList.remove('is-active'));
        const first = group.querySelector('[data-value=""]');
        if (first) first.classList.add('is-active');
    }

    function resetCardSearch() {
        ['cardSearchText', 'cardSearchPlayCost', 'cardSearchCode']
            .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['cardSearchTypeGroup', 'cardSearchColorGroup', 'cardSearchColor2Group', 'cardSearchLevelGroup']
            .forEach(resetChipGroup);
        cardSearchResults = [];
        cardSearchPage = 1;
        renderCardSearchResults();
        setCardSearchStatus('');
    }

    async function fetchCardSearchRowsMerged(filters) {
        if (!filters.color2) return fetchCardSearchRows(filters);
        // Run both color directions in parallel and merge
        const invertedFilters = { ...filters, color: filters.color2, color2: filters.color };
        const [rows1, rows2] = await Promise.all([
            fetchCardSearchRows(filters),
            fetchCardSearchRows(invertedFilters),
        ]);
        const seen = new Set();
        const merged = [];
        [...rows1, ...rows2].forEach((r) => {
            const code = normalizeDeckCode(r?.id || r?.card || '');
            if (code && !seen.has(code)) { seen.add(code); merged.push(r); }
        });
        return merged.slice(0, CARD_SEARCH_MAX_RESULTS);
    }

    async function fetchCardSearchRows(filters) {
        // filters.card is a set prefix (e.g. "BT25") — the public API doesn't support prefix search,
        // so it's excluded here. Set filtering is applied locally via applyLocalCardSearchFilters.
        // Text filter uses the API 'n' param (name search only); trait/effect matching is done locally.
        const hasApiFilter = filters.text || filters.color || filters.type || filters.level || filters.playcost;
        if (!hasApiFilter && !filters.card) return [];

        // When the set filter is active, sort descending so the newest sets come first.
        // The catalog handles older sets; the API fallback is only needed for sets not yet synced.
        const sortDirection = filters.card ? 'desc' : 'asc';

        const allRows = [];
        let offset = 0, previousSignature = '';

        while (allRows.length < CARD_SEARCH_MAX_RESULTS) {
            const params = new URLSearchParams({ sort: 'card_number', sortdirection: sortDirection, limit: String(CARD_SEARCH_LIMIT), offset: String(offset), series: 'Digimon Card Game' });
            if (filters.text) params.set('n', filters.text);
            if (filters.color) params.set('color', filters.color);
            if (filters.type) params.set('type', filters.type);
            if (filters.level) params.set('level', filters.level);
            if (filters.playcost) params.set('playcost', filters.playcost);
            // Note: digitype omitted intentionally — API does exact match on primary field only,
            // missing digi_type2/3/4. Local filter in applyLocalCardSearchFilters covers all 4 fields.
            // filters.card (set prefix) intentionally not sent to API — no prefix search support.
            // Applied locally in applyLocalCardSearchFilters.

            const res = await fetch(`${DIGIMON_CARD_API_URL}?${params}`);
            let payload = null;
            try { payload = await res.json(); } catch { payload = null; }
            if (!res.ok) throw new Error(String(payload?.error || `Search failed (${res.status}).`));

            const rows = Array.isArray(payload) ? payload : [];
            if (!rows.length) break;
            allRows.push(...rows);

            const sig = rows.slice(0, 5).map((r) => normalizeDeckCode(r?.id || r?.card || '')).join('|');
            if (sig && sig === previousSignature) break;
            previousSignature = sig;
            if (rows.length < CARD_SEARCH_LIMIT) break;
            offset += rows.length;
        }

        return allRows.slice(0, CARD_SEARCH_MAX_RESULTS);
    }

    // Fetches all cards from a set by: (1) listing all card codes via getAllCards,
    // (2) filtering by set prefix, (3) batch-fetching details via search?card=...
    // Used when only the set filter is active and the catalog doesn't have the set yet.
    async function fetchAllCardsBySetFromApi(setPrefix) {
        const allRes = await fetch(
            `${DIGIMON_ALL_CARDS_API}?series=${encodeURIComponent('Digimon Card Game')}&sort=card_number&sortdirection=asc`
        );
        if (!allRes.ok) return [];
        let allCards;
        try { allCards = await allRes.json(); } catch { return []; }
        if (!Array.isArray(allCards)) return [];

        const prefix = setPrefix.toUpperCase() + '-';
        const setCodes = allCards
            .filter(c => String(c.cardnumber || '').toUpperCase().startsWith(prefix))
            .map(c => String(c.cardnumber));

        if (!setCodes.length) return [];

        const CHUNK_SIZE = 20;
        const details = [];
        for (let i = 0; i < setCodes.length; i += CHUNK_SIZE) {
            const chunk = setCodes.slice(i, i + CHUNK_SIZE);
            const params = new URLSearchParams({
                card: chunk.join(','),
                series: 'Digimon Card Game',
                limit: String(chunk.length),
                sort: 'card_number',
                sortdirection: 'asc',
            });
            const res = await fetch(`${DIGIMON_CARD_API_URL}?${params}`);
            if (!res.ok) continue;
            let data;
            try { data = await res.json(); } catch { continue; }
            if (Array.isArray(data)) details.push(...data);
            if (i + CHUNK_SIZE < setCodes.length) {
                await new Promise(r => setTimeout(r, 800));
            }
        }

        return details;
    }

    async function fetchCardSearchRowsFromDb(filters) {
        // Primary source: in-memory catalog loaded from Storage bucket.
        // Falls back to API (fetchCardSearchRowsMerged) if catalog is unavailable.
        const catalog = await loadCatalog();
        if (!catalog.length) return [];

        let rows = catalog;
        if (filters.card) {
            const prefix = filters.card.toUpperCase() + '-';
            rows = rows.filter(r => String(r.card_code || '').toUpperCase().startsWith(prefix));
        }

        return applyLocalCardSearchFilters(rows, filters).slice(0, CARD_SEARCH_MAX_RESULTS);
    }

    function applyLocalCardSearchFilters(rows, filters) {
        const text = String(filters?.text || '').trim().toLowerCase();
        const color = String(filters?.color || '').trim().toLowerCase();
        const color2 = String(filters?.color2 || '').trim().toLowerCase();
        const type = String(filters?.type || '').trim().toLowerCase();
        const level = String(filters?.level || '').trim();
        const playcost = String(filters?.playcost || '').trim();
        const cardPrefix = String(filters?.card || '').trim().toUpperCase();

        return (Array.isArray(rows) ? rows : []).filter((row) => {
            if (cardPrefix) {
                const rowCode = String(row?.card_code || row?.id || row?.card || '').toUpperCase();
                if (!rowCode.startsWith(cardPrefix + '-')) return false;
            }

            if (text) {
                const p = row?.card_payload || row;
                const haystack = [row?.name, p?.main_effect, p?.source_effect, p?.alt_effect, p?.digi_type, p?.digitype, p?.digi_type2, p?.digi_type3, p?.digi_type4]
                    .map(v => String(v || '').toLowerCase()).join(' ');
                if (!haystack.includes(text)) return false;
            }

            if (color2) {
                // Both colors must be present in either order (DB: color column; API: color/color2 fields)
                const rc  = String(row?.color || row?.card_payload?.color || '').toLowerCase();
                const rc2 = String(row?.card_payload?.color2 || row?.color2 || '').toLowerCase();
                const fwd = rc.includes(color) && rc2.includes(color2);
                const inv = rc.includes(color2) && rc2.includes(color);
                if (!fwd && !inv) return false;
            } else if (color) {
                if (!String(row?.color || row?.card_payload?.color || '').trim().toLowerCase().includes(color)) return false;
            }

            if (type) {
                // DB rows: card_type column. API rows: type field (may be 'digitama' for digi-egg)
                const rowType = String(row?.card_type || row?.type || '').trim().toLowerCase();
                const normalized = rowType === 'digitama' ? 'digi-egg' : rowType;
                if (normalized !== type) return false;
            }

            if (level) {
                // DB rows: card_level (integer). API rows: level field
                const rowLevel = row?.card_level != null ? String(row.card_level) : String(row?.level ?? row?.card_payload?.level ?? '').trim();
                if (rowLevel !== level) return false;
            }

            if (playcost) {
                const p = row?.card_payload || row;
                const rowCost = String(p?.play_cost ?? p?.playcost ?? row?.play_cost ?? '').trim();
                if (rowCost !== playcost) return false;
            }

            return true;
        });
    }

    function setCardSearchStatus(message, type = '', options = {}) {
        const node = document.getElementById('cardSearchStatus');
        if (!node) return;
        if (cardSearchStatusAutoHideTimer) { clearTimeout(cardSearchStatusAutoHideTimer); cardSearchStatusAutoHideTimer = null; }
        node.textContent = message;
        node.className = 'decklist-search-status';
        if (type) node.classList.add(`is-${type}`);
        const delay = Math.max(0, Number(options?.autoClearMs) || 0);
        if (delay > 0 && message) {
            cardSearchStatusAutoHideTimer = setTimeout(() => {
                node.textContent = ''; node.className = 'decklist-search-status'; cardSearchStatusAutoHideTimer = null;
            }, delay);
        }
    }

    // ─── Deck manipulation ────────────────────────────────────────────────────

    function addManualCode() {
        const input = document.getElementById('decklistBuilderManualCode');
        if (!input) return;
        const code = normalizeDeckCode(input.value);
        if (!isValidDeckCode(code)) { render([`Invalid code: ${input.value || '(empty)'}`]); return; }
        const upsert = tryUpsertEntry(code, 1);
        if (upsert.error) { render([upsert.error]); return; }
        input.value = '';
        setSaveStatus('');
        render([]);
    }

    function changeCardQuantity(code, delta) {
        const normalized = normalizeDeckCode(code);
        if (!isValidDeckCode(normalized)) return { error: 'Invalid card code.' };
        const existing = entries.find((i) => i.code === normalized);
        if (!existing) return { error: `Card ${normalized} not found.` };
        if (delta > 0) return tryUpsertEntry(normalized, 1);
        if (existing.count <= 1) { entries = entries.filter((i) => i.code !== normalized); return { error: '' }; }
        existing.count -= 1;
        return { error: '' };
    }

    function tryUpsertEntry(code, qty, meta = null) {
        if (BANNED_CODES.has(code)) return { error: `${code} is banned and cannot be added.` };

        const existing = entries.find((i) => i.code === code);
        const currentQty = Number(existing?.count) || 0;
        const maxAllowed = getMaxCopies(code);
        if (currentQty + qty > maxAllowed) return { error: `Max ${maxAllowed} copies for ${code}.` };
        if (RESTRICTED_CODES.has(code) && currentQty + qty > 1) return { error: `${code} is restricted to 1 copy.` };

        // Simulate the new state to check deck limits
        const next = entries.map((i) => ({ ...i }));
        const nextIndex = next.findIndex((i) => i.code === code);
        if (nextIndex >= 0) next[nextIndex].count += qty;
        else next.push(meta ? { code, count: qty, meta } : { code, count: qty });

        const counts = getDeckCounts(next);
        const bucket = getEntryDeckBucket({ code, count: 1 });
        if (bucket === 'egg' && counts.digiEgg > MAX_DIGI_EGG_CARDS) return { error: `Digi-Egg limit reached (${MAX_DIGI_EGG_CARDS}).` };
        if (bucket !== 'egg' && counts.mainDeck > MAX_MAIN_DECK_CARDS) return { error: `Main deck limit reached (${MAX_MAIN_DECK_CARDS}).` };

        const restrictionErrors = validateRestrictionRules(next);
        if (restrictionErrors.length) return { error: restrictionErrors[0] };

        // Commit
        if (existing) {
            existing.count += qty;
            if (meta && (!existing.meta || typeof existing.meta !== 'object')) existing.meta = meta;
        } else {
            entries.push(meta ? { code, count: qty, meta } : { code, count: qty });
        }
        return { error: '' };
    }

    async function sortDeckCards() {
        if (!Array.isArray(entries) || entries.length <= 1) { setSaveStatus('Not enough cards to sort.', 'warn'); return; }
        const btn = document.getElementById('btnDecklistBuilderSortCards');
        if (btn) btn.disabled = true;
        setSaveStatus('Sorting cards...', 'info');
        try {
            await hydrateCardMetadata(entries, { allowRerender: false });
            const prevOrder = entries.map((e) => e.code).join('|');
            const sorted = [...entries].sort(compareDeckEntries);
            if (sorted.map((e) => e.code).join('|') === prevOrder) {
                setSaveStatus('');
                showToast('Decklist is already sorted.');
                return;
            }
            entries = sorted;
            render([]);
            setSaveStatus('');
            showToast('Cards sorted successfully.', 'ok');
        } catch (error) {
            setSaveStatus(error?.message || 'Failed to sort cards.', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function clearDecklist() {
        entries = [];
        setSaveStatus('');
        render([]);
        showToast('Decklist cleared.', 'ok');
    }

    function buildEntryMetaFromCard(card) {
        if (!card || typeof card !== 'object') return null;
        const type = normalizeCardType(card?.type || card?.card_payload?.type);
        const level = Number(card?.level ?? card?.card_payload?.level);
        return {
            cardType: mapTypeToDbLabel(type),
            cardLevel: Number.isFinite(level) ? Math.trunc(level) : null,
            isDigiEgg: type === 'digi-egg',
        };
    }

    // ─── Deck parsing ─────────────────────────────────────────────────────────

    function parseDecklistText(rawText) {
        const text = String(rawText || '').trim();
        if (!text) return { entries: [], errors: [] };

        const jsonParsed = tryParseJsonArray(text);
        if (jsonParsed.length) return withValidation(aggregateCodes(jsonParsed));

        const lineParsed = parseByLines(text);
        if (lineParsed.entries.length) return withValidation(lineParsed.entries, lineParsed.errors);

        const repeated = parseRepeatedCodes(text);
        if (repeated.length) return withValidation(aggregateCodes(repeated));

        return { entries: [], errors: ['No valid deck codes found in the provided text.'] };
    }

    function withValidation(sourceEntries, baseErrors = []) {
        const validated = validateAggregatedEntries(sourceEntries, baseErrors);
        return { entries: validated.entries, errors: validated.errors };
    }

    function tryParseJsonArray(text) {
        try {
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) return [];
            return parsed.map(normalizeDeckCode).filter(isValidDeckCode);
        } catch { return []; }
    }

    function parseByLines(text) {
        const lines = text.split(/\r?\n/);
        const temp = [];
        const errors = [];

        // Suffix group: handles _AA, -AA, C, SR, etc. appended to the card number
        const SUFFIX = '(?:[_-][A-Z][A-Z0-9]*|[A-Z]+)?';
        // Matches: "4 CardName BT1-001" or "4 BT1-001"
        const PATTERN_QTY_NAME_CODE = new RegExp(`^(\\d{1,2})\\s+.*?((?:BT\\d{1,2}|EX\\d{1,2}|ST\\d{1,2}|RB\\d{1,2}|AD\\d{1,2}|LM|P)-\\d{1,3}${SUFFIX})\\s*$`, 'i');
        // Matches: "4 (BT1-001)"
        const PATTERN_QTY_PAREN = new RegExp(`^(\\d{1,2})\\s*\\(\\s*((?:BT\\d{1,2}|EX\\d{1,2}|ST\\d{1,2}|RB\\d{1,2}|AD\\d{1,2}|LM|P)-\\d{1,3}${SUFFIX})\\s*\\)\\s*$`, 'i');
        // Matches: "BT1-001" (single bare code)
        const PATTERN_SINGLE_CODE = new RegExp(`^((?:BT\\d{1,2}|EX\\d{1,2}|ST\\d{1,2}|RB\\d{1,2}|AD\\d{1,2}|LM|P)-\\d{1,3}${SUFFIX})$`, 'i');

        lines.forEach((line, index) => {
            const raw = String(line || '').trim();
            if (!raw || /^decklist$/i.test(raw) || /^\/\/\s*/.test(raw)) return;

            for (const [pattern, getQty, getCode] of [
                [PATTERN_QTY_NAME_CODE, (m) => Number(m[1]), (m) => m[2]],
                [PATTERN_QTY_PAREN, (m) => Number(m[1]), (m) => m[2]],
                [PATTERN_SINGLE_CODE, () => 1, (m) => m[1]],
            ]) {
                const match = raw.match(pattern);
                if (!match) continue;
                const code = normalizeDeckCode(getCode(match));
                if (isValidDeckCode(code)) temp.push({ code, count: getQty(match) });
                else errors.push(`Line ${index + 1}: invalid code "${getCode(match)}"`);
                return;
            }
        });

        return { entries: aggregateEntries(temp), errors };
    }

    function parseRepeatedCodes(text) {
        return [...text.matchAll(new RegExp(RAW_DECK_CODE_WITH_SUFFIX_PATTERN.source, 'gi'))]
            .map((m) => normalizeDeckCode(m[1]))
            .filter(isValidDeckCode);
    }

    function aggregateCodes(codes) {
        return aggregateEntries(codes.map((code) => ({ code, count: 1 })));
    }

    function aggregateEntries(source) {
        const map = new Map();
        source.forEach(({ code: rawCode, count }) => {
            const code = normalizeDeckCode(rawCode);
            if (!isValidDeckCode(code)) return;
            if (!map.has(code)) map.set(code, { code, count: 0 });
            map.get(code).count += Number(count) || 1;
        });
        return Array.from(map.values());
    }

    // ─── Validation ───────────────────────────────────────────────────────────

    function validateAggregatedEntries(sourceEntries, baseErrors = []) {
        return {
            entries: sourceEntries,
            errors: [...(baseErrors || []), ...validateRestrictionRules(sourceEntries)],
        };
    }

    function validateRestrictionRules(sourceEntries) {
        const errors = [];
        const countsByCode = new Map();

        (Array.isArray(sourceEntries) ? sourceEntries : []).forEach((item) => {
            const code = normalizeDeckCode(item?.code || '');
            if (!isValidDeckCode(code)) return;
            countsByCode.set(code, (countsByCode.get(code) || 0) + Math.max(0, Number(item?.count) || 0));
        });

        countsByCode.forEach((qty, code) => {
            if (qty <= 0) return;
            if (BANNED_CODES.has(code)) errors.push(`${code} is banned and invalidates the deck.`);
            if (RESTRICTED_CODES.has(code) && qty > 1) errors.push(`${code} is restricted to 1 copy (current: ${qty}).`);
        });

        CHOICE_RESTRICTION_GROUPS.forEach((group) => {
            if (!Array.isArray(group) || group.length < 2) return;
            const present = group.filter((code) => (countsByCode.get(code) || 0) > 0);
            if (present.length >= 2) {
                errors.push(`Choice restriction violated: ${group.join(' / ')} cannot be used together.`);
            }
        });

        return errors;
    }

    function getCardRestrictionBadge(code) {
        const normalized = normalizeDeckCode(code || '');
        if (!isValidDeckCode(normalized)) return null;
        if (BANNED_CODES.has(normalized)) return { label: 'X', type: 'banned', title: 'Banned card' };
        if (RESTRICTED_CODES.has(normalized)) return { label: '1', type: 'restricted', title: 'Restricted to 1 copy' };
        const inChoice = CHOICE_RESTRICTION_GROUPS.some((g) => g.includes(normalized));
        if (inChoice) return { label: 'C', type: 'choice', title: 'Choice Restriction' };
        return null;
    }

    // ─── Deck counts / buckets ────────────────────────────────────────────────

    function getTotalCards(sourceEntries) {
        return (Array.isArray(sourceEntries) ? sourceEntries : [])
            .reduce((acc, item) => acc + (Number(item.count) || 0), 0);
    }

    function getDeckCounts(sourceEntries) {
        let digiEgg = 0, mainDeck = 0;
        (Array.isArray(sourceEntries) ? sourceEntries : []).forEach((item) => {
            const qty = Number(item?.count) || 0;
            if (qty <= 0) return;
            if (getEntryDeckBucket(item) === 'egg') digiEgg += qty;
            else mainDeck += qty;
        });
        return { digiEgg, mainDeck, total: digiEgg + mainDeck };
    }

    function getEntryDeckBucket(entry) {
        return getEntryGroupInfo(entry).key === 'digi-egg' ? 'egg' : 'main';
    }

    function getEntryGroupInfo(entry) {
        const { type, level } = resolveEntryTypeAndLevel(entry);
        if (type === 'digi-egg') return { key: 'digi-egg', label: 'Digi-Egg' };
        if (type === 'digimon') return Number.isFinite(level) && level >= 0
            ? { key: `digimon-lv-${level}`, label: `Digimon Lv${level}` }
            : { key: 'digimon', label: 'Digimon' };
        if (type === 'tamer') return { key: 'tamer', label: 'Tamers' };
        if (type === 'option') return { key: 'option', label: 'Options' };
        if (type === 'dual') return { key: 'dual', label: 'Dual' };
        return { key: 'other', label: 'Other' };
    }

    // ─── Supabase persistence ─────────────────────────────────────────────────

    async function loadExistingDecklist() {
        if ((!context.resultId && !context.decklistId) || !SUPABASE_URL) return false;

        const structured = await fetchDecklistFromStructured(context.resultId);
        if (structured) {
            entries = structured.entries;
            seedEntriesMetadataInMemory(entries);
            await hydrateCardMetadata(entries, { allowRerender: false });
            render([]);
            await autoSortAndSaveIfNeeded();
            return true;
        }

        if (context.decklistId) throw new Error('Não foi possível carregar o deck livre. Volte à biblioteca e tente novamente.');

        const legacy = await fetchDecklistFromLegacyColumn(context.resultId);
        if (!legacy?.decklistText) return false;

        const parsed = parseDecklistText(legacy.decklistText);
        entries = parsed.entries;
        await hydrateCardMetadata(entries, { allowRerender: false });
        render(parsed.errors);
        return true;
    }

    async function autoSortAndSaveIfNeeded() {
        if ((!context.resultId && !context.decklistId) || !SUPABASE_URL) return;
        if (!Array.isArray(entries) || entries.length <= 1) return;

        const prevOrder = entries.map((e) => e.code).join('|');
        const sorted = [...entries].sort(compareDeckEntries);
        const nextOrder = sorted.map((e) => e.code).join('|');
        if (prevOrder === nextOrder) return;

        entries = sorted;
        render([]);

        try {
            const text = serializeDecklist(entries);
            const saved = await saveDecklistStructured(context.resultId, entries);
            if (!saved) throw new Error('Auto-sort save failed.');
            await patchDecklistLegacy(context.resultId, text);
            setSaveStatus('');
            showToast('Decklist auto-sorted and saved.', 'ok');
        } catch (error) {
            console.error('Auto-sort save failed:', error);
            setSaveStatus('');
            showToast('Auto-sort applied, but failed to save.', 'warn');
        }
    }

    async function fetchDecklistFromStructured(resultId) {
        try {
            const lookup = context.decklistId
                ? `id=eq.${encodeURIComponent(context.decklistId)}&tournament_result_id=is.null&select=id,name,format:formats(code)`
                : `tournament_result_id=eq.${encodeURIComponent(resultId)}&select=id`;
            const decklistRes = await fetch(
                `${SUPABASE_URL}/rest/v1/${DECKLISTS_TABLE}?${lookup}&limit=1`,
                { headers },
            );
            if (!decklistRes.ok) return null;
            const record = (await decklistRes.json())?.[0];
            const decklistId = Number(record?.id);
            if (!Number.isFinite(decklistId) || decklistId <= 0) return null;
            if (context.decklistId) {
                context.deck = record.name || '';
                context.format = record.format?.code || '';
            }

            const cardsRes = await fetch(
                `${SUPABASE_URL}/rest/v1/${DECKLIST_CARDS_TABLE}?decklist_id=eq.${decklistId}&select=position,card_code,qty,card_meta:${DECKLIST_CARD_META_TABLE}(card_type,card_level,is_digi_egg,is_staple)&order=position.asc`,
                { headers },
            );
            if (!cardsRes.ok) return null;
            const rows = await cardsRes.json();
            const nowIso = new Date().toISOString();

            (Array.isArray(rows) ? rows : []).forEach((row) => {
                const code = normalizeDeckCode(row?.card_code || '');
                const meta = row?.card_meta || {};
                if (!isValidDeckCode(code)) return;
                cardDetailsByCode.set(code, {
                    ...(cardDetailsByCode.get(code) || {}),
                    card_code: code, id: code, name: row?.name || code,
                    pack: row?.pack || code.split('-')[0] || '', color: row?.color || '',
                    type: meta?.card_type || '', level: normalizeCardLevel(meta?.card_level),
                    card_payload: row?.card_payload || {},
                    is_digi_egg: normalizeBoolean(meta?.is_digi_egg),
                    updated_at: nowIso,
                });
            });

            return {
                entries: (Array.isArray(rows) ? rows : [])
                    .map((row) => ({
                        code: normalizeDeckCode(row?.card_code || ''),
                        count: Math.max(1, Number(row?.qty) || 1),
                        meta: {
                            cardType: String(row?.card_meta?.card_type || '').trim(),
                            cardLevel: normalizeCardLevel(row?.card_meta?.card_level),
                            isDigiEgg: normalizeBoolean(row?.card_meta?.is_digi_egg),
                        },
                    }))
                    .filter((item) => isValidDeckCode(item.code)),
            };
        } catch { return null; }
    }

    async function fetchDecklistFromLegacyColumn(resultId) {
        for (const col of ['decklist', 'decklist_link']) {
            try {
                const res = await fetch(
                    `${SUPABASE_URL}/rest/v1/tournament_results?id=eq.${encodeURIComponent(resultId)}&select=id,${col}`,
                    { headers },
                );
                if (!res.ok) continue;
                const rows = await res.json();
                const text = String(rows?.[0]?.[col] || '').trim();
                return { columnName: col, decklistText: text };
            } catch { continue; }
        }
        return null;
    }

    async function saveDecklist() {
        if (!context.resultId && !context.decklistId) { render(['Selecione uma participação ou crie um deck livre para salvar.']); return; }
        if (!SUPABASE_URL) { render(['Supabase is not configured for decklist saving.']); return; }

        const validation = validateAggregatedEntries(entries);
        if (validation.errors.length) { render(validation.errors); return; }

        const counts = getDeckCounts(entries);
        if (counts.total < 54) {
            openSaveWarningModal(`Your deck only has ${counts.total} card${counts.total !== 1 ? 's' : ''} (${counts.mainDeck} main + ${counts.digiEgg} egg).\nA full deck is 50 main + at least 4 eggs. Save anyway?`);
            return;
        }

        await performSave();
    }

    async function performSave() {
        const btn = document.getElementById('btnDecklistBuilderSave');
        if (btn) btn.disabled = true;
        setSaveStatus('');
        showToast('Saving decklist...', 'info', 6000);

        // Ensure card metadata (type/level) is hydrated before persisting
        await hydrateCardMetadata(entries, { allowRerender: false });

        try {
            const text = serializeDecklist(entries);
            const saved = await saveDecklistStructured(context.resultId, entries);
            if (!saved) throw new Error('Failed to save normalized decklist.');
            await patchDecklistLegacy(context.resultId, text);
            render([]);
            setSaveStatus('Decklist saved successfully.', 'ok');
            showToast('Decklist saved successfully.', 'ok', 3500);
        } catch (error) {
            setSaveStatus('');
            showToast('Failed to save decklist.', 'error', 4000);
            render([error?.message || 'Failed to save decklist.']);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function saveDecklistStructured(resultId, sourceEntries) {
        const decklistId = await ensureDecklistRow(resultId);
        if (!decklistId) return false;

        await upsertDecklistCardMetadata(sourceEntries);

        const rows = (Array.isArray(sourceEntries) ? sourceEntries : []).map((entry, i) => {
            return {
                position: i + 1,
                card_code: normalizeDeckCode(entry.code),
                qty: Math.max(1, Math.min(getMaxCopies(entry.code), Number(entry.count) || 1)),
            };
        });
        const insRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/replace_decklist_cards`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_decklist_id: decklistId, p_cards: rows }),
        });
        if (!insRes.ok) {
            const detail = await readSupabaseError(insRes);
            throw new Error(`Failed to insert decklist cards (HTTP ${insRes.status}). ${detail}`);
        }
        return true;
    }

    async function upsertDecklistCardMetadata(sourceEntries) {
        // Fetch API data for any codes not yet in the local cache with a rich payload,
        // so card_payload is always populated (the column is NOT NULL in the DB).
        const allCodes = (Array.isArray(sourceEntries) ? sourceEntries : [])
            .map((e) => normalizeDeckCode(e?.code || '')).filter(isValidDeckCode);
        const missingCodes = [...new Set(allCodes)].filter((code) => {
            const p = cardDetailsByCode.get(code)?.card_payload;
            return !hasRichApiPayload(p);
        });
        if (missingCodes.length) {
            const fetched = await fetchCardsFromDigimonApi(missingCodes);
            const nowIso = new Date().toISOString();
            fetched.forEach((row) => {
                const code = normalizeDeckCode(row?.card_code || row?.id || '');
                if (!code) return;
                cardDetailsByCode.set(code, { ...(cardDetailsByCode.get(code) || {}), ...row, card_code: code, updated_at: nowIso });
            });
        }

        const rowsByCode = new Map();
        (Array.isArray(sourceEntries) ? sourceEntries : []).forEach((entry) => {
            const code = normalizeDeckCode(entry?.code || '');
            if (!isValidDeckCode(code)) return;
            const meta = getDecklistCardMetadata(entry);
            const details = cardDetailsByCode.get(code) || {};
            const current = rowsByCode.get(code) || {
                card_code: code, id: null, name: null, pack: null, color: null,
                card_type: null, card_level: null, is_digi_egg: false, card_payload: {},
            };
            if (meta.cardType) current.card_type = meta.cardType;
            if (Number.isFinite(meta.cardLevel)) current.card_level = meta.cardLevel;
            if (meta.isDigiEgg) current.is_digi_egg = true;
            // Enrich with full card details when available
            if (details.id) current.id = details.id;
            if (details.name) current.name = details.name;
            if (details.pack) current.pack = details.pack;
            if (details.color) current.color = details.color;
            if (details.card_payload && typeof details.card_payload === 'object') current.card_payload = details.card_payload;
            rowsByCode.set(code, current);
        });

        const rows = Array.from(rowsByCode.values());
        if (!rows.length) return true;

        const res = await fetch(`${SUPABASE_URL}/rest/v1/${DECKLIST_CARD_META_TABLE}?on_conflict=card_code`, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(rows),
        });
        if (!res.ok) {
            const detail = await readSupabaseError(res);
            throw new Error(`Failed to upsert decklist card metadata (HTTP ${res.status}). ${detail}`);
        }
        return true;
    }

    async function readSupabaseError(res) {
        try {
            const data = await res.clone().json();
            if (data?.message) return data.message;
            if (data?.details) return data.details;
            if (data?.hint) return data.hint;
            return JSON.stringify(data);
        } catch {
            try { return await res.text(); } catch { return ''; }
        }
    }

    async function ensureDecklistRow(resultId) {
        if (!resultId && context.decklistId) return context.decklistId;
        const existRes = await fetch(
            `${SUPABASE_URL}/rest/v1/${DECKLISTS_TABLE}?tournament_result_id=eq.${encodeURIComponent(resultId)}&select=id&limit=1`,
            { headers },
        );
        if (!existRes.ok) return null;
        const existId = Number((await existRes.json())?.[0]?.id);
        if (Number.isFinite(existId) && existId > 0) return existId;

        const createRes = await fetch(`${SUPABASE_URL}/rest/v1/${DECKLISTS_TABLE}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({ tournament_result_id: resultId, source: 'builder' }),
        });
        if (!createRes.ok) return null;
        const createdId = Number((await createRes.json())?.[0]?.id);
        return Number.isFinite(createdId) && createdId > 0 ? createdId : null;
    }

    async function patchDecklistLegacy(resultId, decklistText) {
        if (!resultId) return true;
        for (const col of ['decklist', 'decklist_link']) {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament_results?id=eq.${encodeURIComponent(resultId)}`,
                { method: 'PATCH', headers, body: JSON.stringify({ [col]: decklistText }) },
            );
            if (res.ok) return true;
        }
        return false;
    }

    function serializeDecklist(sourceEntries) {
        return sourceEntries.map((i) => `${i.count} ${i.code}`).join('\n');
    }

    // ─── Metadata resolution ──────────────────────────────────────────────────

    function resolveEntryTypeAndLevel(entry) {
        const code = normalizeDeckCode(entry?.code || '');
        const entryMeta = entry?.meta && typeof entry.meta === 'object' ? entry.meta : {};
        const details = cardDetailsByCode.get(code) || {};
        const payload = details?.card_payload || {};

        const isDigiEgg =
            normalizeBoolean(entryMeta?.isDigiEgg) ||
            normalizeBoolean(details?.is_digi_egg) ||
            normalizeBoolean(payload?.is_digi_egg);

        const type = isDigiEgg
            ? 'digi-egg'
            : normalizeCardType(entryMeta?.cardType || details?.type || payload?.type);
        const level = normalizeCardLevel(entryMeta?.cardLevel ?? details?.level ?? payload?.level);

        return { type, level, isDigiEgg };
    }

    function getDecklistCardMetadata(entry) {
        const { type, level } = resolveEntryTypeAndLevel(entry);
        return {
            cardType: mapTypeToDbLabel(type),
            cardLevel: Number.isFinite(level) ? level : null,
            isDigiEgg: type === 'digi-egg',
        };
    }

    function seedEntriesMetadataInMemory(sourceEntries) {
        (Array.isArray(sourceEntries) ? sourceEntries : []).forEach((entry) => {
            const code = normalizeDeckCode(entry?.code || '');
            if (!isValidDeckCode(code)) return;
            const resolved = resolveEntryTypeAndLevel(entry);
            if (!resolved.type && !Number.isFinite(resolved.level)) return;

            const current = cardDetailsByCode.get(code) || {};
            const currentPayload = current?.card_payload && typeof current.card_payload === 'object' ? current.card_payload : {};
            const nextPayload = { ...currentPayload };
            if (resolved.type) nextPayload.type = mapTypeToDbLabel(resolved.type) || resolved.type;
            if (Number.isFinite(resolved.level)) nextPayload.level = resolved.level;
            if (resolved.type === 'digi-egg') nextPayload.is_digi_egg = true;

            cardDetailsByCode.set(code, {
                ...current, card_code: code, id: current?.id || code, name: current?.name || code,
                type: mapTypeToDbLabel(resolved.type) || current?.type || '',
                level: Number.isFinite(resolved.level) ? resolved.level : current?.level ?? '',
                card_payload: nextPayload, updated_at: new Date().toISOString(),
            });
        });
    }

    // ─── Type / level helpers ─────────────────────────────────────────────────

    function normalizeCardType(value) {
        const v = String(value || '').trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
        if (v === 'digi-egg' || v === 'digitama') return 'digi-egg';
        if (v === 'digimon') return 'digimon';
        if (v === 'tamer') return 'tamer';
        if (v === 'option') return 'option';
        if (v === 'dual') return 'dual';
        return '';
    }

    function mapTypeToDbLabel(type) {
        if (type === 'digi-egg') return 'Digi-Egg';
        if (type === 'digimon') return 'Digimon';
        if (type === 'tamer') return 'Tamer';
        if (type === 'option') return 'Option';
        return null;
    }

    function normalizeCardLevel(value) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
        const match = String(value || '').match(/(\d+)/);
        if (!match) return null;
        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeBoolean(value) {
        if (value === true || value === false) return value;
        const v = String(value || '').trim().toLowerCase();
        return v === 'true' || v === 't' || v === '1' || v === 'yes';
    }

    // ─── Deck code helpers ────────────────────────────────────────────────────

    function isValidDeckCode(code) {
        return DECK_CODE_PATTERN.test(String(code || ''));
    }

    function normalizeDeckCode(value) {
        return String(value || '')
            .trim().toUpperCase()
            .replace(/^["'\[()]+/, '')
            .replace(/["'\](),;:.]+$/, '')
            .replace(/_.+$/, '')              // strip _AA, _P, etc.
            .replace(/-[A-Z][A-Z0-9]*$/, '') // strip -AA, -P, etc.
            .replace(/(-\d+)[A-Z]+$/, '$1'); // strip BT4-104C → BT4-104
    }

    // ─── Sorting ──────────────────────────────────────────────────────────────

    function compareDeckEntries(a, b) {
        const left = getEntrySortDescriptor(a);
        const right = getEntrySortDescriptor(b);
        if (left.group !== right.group) return left.group - right.group;
        if (left.level !== right.level) return left.level - right.level;
        const setCompare = compareSetSort(left.setSort, right.setSort);
        if (setCompare !== 0) return setCompare;
        if (left.serial !== right.serial) return left.serial - right.serial;
        if ((left.group === 1 || left.group === 2 || left.group === 3) && left.name !== right.name) return left.name.localeCompare(right.name);
        if (left.name !== right.name) return left.name.localeCompare(right.name);
        return left.code.localeCompare(right.code);
    }

    function getEntrySortDescriptor(entry) {
        const code = normalizeDeckCode(entry?.code || '');
        const details = cardDetailsByCode.get(code) || null;
        const resolved = resolveEntryTypeAndLevel(entry);
        const groupMap = { 'digi-egg': 0, digimon: 1, tamer: 2, option: 3 };
        const group = groupMap[resolved.type] ?? 4;
        return {
            group,
            level: group === 1 ? getDigimonLevelSort(resolved.level) : 0,
            setSort: parseCardSetSort(code),
            serial: parseCardSerialNumber(code),
            name: String(details?.name || '').trim().toLowerCase(),
            code,
        };
    }

    function getDigimonLevelSort(rawLevel) {
        const level = Number(rawLevel);
        if (!Number.isFinite(level)) return 99;
        const order = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
        return Object.prototype.hasOwnProperty.call(order, level) ? order[level] : 50 + Math.max(0, Math.trunc(level));
    }

    function parseCardSetSort(code) {
        const prefix = String(code || '').trim().toUpperCase().split('-')[0] || '';
        const match = prefix.match(/^([A-Z]+)(\d+)?$/);
        if (!match) return { raw: prefix, family: prefix, familyRank: -1, setNumber: -1 };
        const family = match[1] || prefix;
        const familyRankMap = { BT: 5, EX: 4, ST: 3, P: 2, LM: 1 };
        return { raw: prefix, family, familyRank: familyRankMap[family] ?? 0, setNumber: Number.isFinite(Number(match[2])) ? Number(match[2]) : -1 };
    }

    function compareSetSort(l, r) {
        if ((l?.familyRank ?? 0) !== (r?.familyRank ?? 0)) return (r?.familyRank ?? 0) - (l?.familyRank ?? 0);
        if ((l?.family || '') !== (r?.family || '')) return String(l?.family || '').localeCompare(String(r?.family || ''));
        if ((l?.setNumber ?? -1) !== (r?.setNumber ?? -1)) return (l?.setNumber ?? -1) - (r?.setNumber ?? -1);
        return String(l?.raw || '').localeCompare(String(r?.raw || ''));
    }

    function parseCardSerialNumber(code) {
        const match = String(code || '').trim().toUpperCase().match(/-(\d{1,4})$/);
        if (!match) return 9999;
        const n = Number(match[1]);
        return Number.isFinite(n) ? n : 9999;
    }

    // ─── API ──────────────────────────────────────────────────────────────────

    async function fetchCardsFromDigimonApi(codes) {
        const result = [];
        const usedCodes = new Set();

        const pushRow = (row) => {
            const code = normalizeDeckCode(row?.id || row?.card || '');
            if (!code || usedCodes.has(code)) return;
            usedCodes.add(code);
            result.push({
                card_code: code, id: row?.id || code, name: row?.name || code,
                pack: row?.pack || code.split('-')[0] || '', color: row?.color || '', type: row?.type || '',
                card_payload: row || {},
            });
        };

        for (const chunk of chunkArray(codes, 20)) {
            try {
                // Use limit higher than chunk size — the API may return fewer results
                // when multiple card codes are passed as a comma-separated list.
                const query = new URLSearchParams({ card: chunk.join(','), limit: String(chunk.length * 2) });
                const res = await fetch(`${DIGIMON_CARD_API_URL}?${query}`, { signal: AbortSignal.timeout(15000) });
                if (!res.ok) continue;
                const rows = await res.json();
                if (!Array.isArray(rows)) continue;
                rows.forEach(pushRow);
            } catch { continue; }

            // For any codes the batch missed, fetch individually.
            const missed = chunk.filter((c) => !usedCodes.has(c));
            for (const code of missed) {
                try {
                    const query = new URLSearchParams({ card: code, limit: '1' });
                    const res = await fetch(`${DIGIMON_CARD_API_URL}?${query}`, { signal: AbortSignal.timeout(15000) });
                    if (!res.ok) continue;
                    const rows = await res.json();
                    if (Array.isArray(rows)) rows.forEach(pushRow);
                } catch { continue; }
            }
        }
        return result;
    }

    async function fetchDecklistCardMetadataFromDb(codes) {
        if (!SUPABASE_URL) return [];
        const uniqueCodes = [...new Set((Array.isArray(codes) ? codes : [])
            .map((code) => normalizeDeckCode(code))
            .filter(isValidDeckCode))];
        if (!uniqueCodes.length) return [];

        const rows = [];
        for (const chunk of chunkArray(uniqueCodes, 50)) {
            const inList = chunk.join(',');
            const endpoint =
                `/rest/v1/${DECKLIST_CARD_META_TABLE}` +
                `?select=card_code,card_type,card_level,is_digi_egg,is_staple,card_payload&card_code=in.(${encodeURIComponent(inList)})`;
            const response = window.supabaseApi
                ? await window.supabaseApi.get(endpoint)
                : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
            if (!response.ok) continue;
            const payload = await response.json();
            if (Array.isArray(payload) && payload.length) rows.push(...payload);
        }
        return rows;
    }

    async function fetchCardCacheRowFromDb(code) {
        if (!SUPABASE_URL) return null;
        const normalized = normalizeDeckCode(code || '');
        if (!isValidDeckCode(normalized)) return null;
        const endpoint =
            `/rest/v1/decklist_card_metadata` +
            `?select=card_code,id,name,pack,color,card_type,card_level,card_payload&card_code=eq.${encodeURIComponent(normalized)}&limit=1`;
        const response = window.supabaseApi
            ? await window.supabaseApi.get(endpoint)
            : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
        if (!response.ok) return null;
        const rows = await response.json();
        return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    function chunkArray(items, size) {
        const source = Array.isArray(items) ? items : [];
        const result = [];
        for (let i = 0; i < source.length; i += size) result.push(source.slice(i, i + size));
        return result;
    }

    // ─── Hydration ────────────────────────────────────────────────────────────

    function isCacheFresh(item) {
        if (!item) return false;
        const ts = Date.parse(String(item.updated_at || ''));
        return !Number.isNaN(ts) && Date.now() - ts <= CARD_CACHE_TTL_MS;
    }

    function shouldFetchApiMetadata(details) {
        const meta = details || {};
        const type = normalizeCardType(meta?.type || '');
        const level = normalizeCardLevel(meta?.level);
        const isEgg = normalizeBoolean(meta?.is_digi_egg);

        if (!getCardMetadataImageUrls(meta?.card_code || meta?.id || 'unknown', meta).length) return true;
        if (!type && !isEgg) return true;
        if (type === 'digimon' && !Number.isFinite(level)) return true;
        return false;
    }

    async function hydrateCardMetadataFromCatalog(codes) {
        const uniqueCodes = [...new Set((Array.isArray(codes) ? codes : [])
            .map((code) => normalizeDeckCode(code))
            .filter(isValidDeckCode))];
        if (!uniqueCodes.length) return;

        const catalog = await loadCatalog();
        if (!catalog.length) return;

        const wanted = new Set(uniqueCodes);
        const nowIso = new Date().toISOString();
        catalog.forEach((row) => {
            const code = normalizeDeckCode(row?.card_code || row?.id || row?.card || row?.cardnumber || '');
            if (!wanted.has(code)) return;

            const existing = cardDetailsByCode.get(code) || {};
            const payload = row?.card_payload && typeof row.card_payload === 'object' ? row.card_payload : row || {};
            const level = normalizeCardLevel(row?.card_level ?? row?.level ?? payload?.level ?? existing?.level);
            cardDetailsByCode.set(code, {
                ...existing,
                card_code: code,
                id: row?.id || existing?.id || code,
                name: row?.name || payload?.name || existing?.name || code,
                pack: row?.pack || payload?.pack || existing?.pack || code.split('-')[0] || '',
                color: row?.color || payload?.color || existing?.color || '',
                type: row?.card_type || row?.type || payload?.type || existing?.type || '',
                level: Number.isFinite(level) ? level : existing?.level ?? '',
                image_url: row?.image_url || payload?.image_url || existing?.image_url || '',
                card_payload: {
                    ...(existing?.card_payload && typeof existing.card_payload === 'object' ? existing.card_payload : {}),
                    ...payload,
                },
                updated_at: nowIso,
            });
        });
    }

    async function hydrateCardMetadata(sourceEntries, options = {}) {
        const allowRerender = options?.allowRerender !== false;
        const token = ++cardHydrationToken;
        const initialSig = buildDeckGroupBreakdownHtml(entries);

        const uniqueCodes = [...new Set(
            sourceEntries.map((i) => normalizeDeckCode(i.code)).filter(isValidDeckCode)
        )];
        if (!uniqueCodes.length) return;

        refreshRenderedCardTitles();

        const stale = uniqueCodes.filter((code) => {
            const current = cardDetailsByCode.get(code);
            return !isCacheFresh(current) || shouldFetchApiMetadata(current);
        });
        if (!stale.length) return;

        const dbRows = await fetchDecklistCardMetadataFromDb(stale);
        if (token !== cardHydrationToken) return;

        if (dbRows.length) {
            const nowIso = new Date().toISOString();
            dbRows.forEach((row) => {
                const code = normalizeDeckCode(row?.card_code || '');
                if (!code) return;
                const existing = cardDetailsByCode.get(code) || {};
                const existingPayload =
                    existing?.card_payload && typeof existing.card_payload === 'object' ? existing.card_payload : {};
                const rowPayload =
                    row?.card_payload && typeof row.card_payload === 'object' ? row.card_payload : {};
                cardDetailsByCode.set(code, {
                    ...existing,
                    card_code: code,
                    type: row?.card_type || existing?.type || '',
                    level: normalizeCardLevel(row?.card_level ?? existing?.level),
                    is_digi_egg: normalizeBoolean(row?.is_digi_egg ?? existing?.is_digi_egg),
                    card_payload: { ...existingPayload, ...rowPayload },
                    updated_at: nowIso,
                });
            });
            refreshRenderedCardTitles();
        }

        await hydrateCardMetadataFromCatalog(stale);
        if (token !== cardHydrationToken) return;

        const remaining = stale.filter((code) => shouldFetchApiMetadata(cardDetailsByCode.get(code)));
        if (!remaining.length) return;

        const apiRows = await fetchCardsFromDigimonApi(remaining);
        if (token !== cardHydrationToken) return;

        if (apiRows.length) {
            const nowIso = new Date().toISOString();
            apiRows.forEach((row) => {
                const lvl = normalizeCardLevel(row.card_payload?.level);
                cardDetailsByCode.set(row.card_code, { ...row, level: lvl, updated_at: nowIso });
            });
            refreshRenderedCardTitles();
            if (allowRerender && buildDeckGroupBreakdownHtml(entries) !== initialSig) {
                render([]);
            }
        }
    }

    function refreshRenderedCardTitles() {
        const board = document.getElementById('decklistBuilderBoard');
        if (!board) return;
        board.querySelectorAll('.decklist-builder-card[data-code] img').forEach((img) => {
            const code = String(img.closest('.decklist-builder-card')?.getAttribute('data-code') || '').toUpperCase();
            const title = getCardTitle(code);
            if (title && title !== 'Loading card data...') img.alt = `${title} (${code})`;
        });
    }

    function getCardTitle(code) {
        const cached = cardDetailsByCode.get(String(code || '').toUpperCase());
        return cached?.name || String(code || '').toUpperCase() || 'Loading card data...';
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    function render(errors) {
        const board = document.getElementById('decklistBuilderBoard');
        const breakdown = document.getElementById('decklistBuilderBreakdown');
        const errorBox = document.getElementById('decklistBuilderErrors');
        if (!board || !errorBox) return;

        const counts = getDeckCounts(entries);
        const statsLabel = `Card count: ${counts.total} (${counts.mainDeck}+${counts.digiEgg}) cards`;
        if (breakdown) breakdown.innerHTML = buildDeckGroupBreakdownHtml(entries, statsLabel);

        if (errors.length) renderDeckErrors(errorBox, errors);
        else clearDeckErrors(errorBox);

        // Refresh count badges on search results whenever deck changes
        if (cardSearchResults.length) renderCardSearchResults();

        if (!entries.length) {
            board.innerHTML = '<div class="decklist-builder-empty">Nenhuma carta adicionada.</div>';
            return;
        }

        board.innerHTML = entries.map((entry, i) => buildDeckCardHtml(entry, i)).join('');

        board.querySelectorAll('.decklist-builder-card img').forEach((img) => {
            img.addEventListener('error', () => {
                const code = img.closest('.decklist-builder-card')?.dataset.code || 'CODE';
                img.src = `https://via.placeholder.com/220x308/667eea/ffffff?text=${encodeURIComponent(code)}`;
            }, { once: true });
        });

        board.querySelectorAll('.decklist-builder-stepper-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-code') || '';
                const delta = btn.getAttribute('data-action') === 'decrease' ? -1 : 1;
                const changed = changeCardQuantity(code, delta);
                if (changed.error) { render([changed.error]); return; }
                setSaveStatus('');
                render([]);
            });
        });

        board.querySelectorAll('.decklist-builder-card[data-code]').forEach((card) => {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openCardZoomModal(String(card.getAttribute('data-code') || ''));
            });
        });

        // ─── Drag-and-drop reordering ─────────────────────────────────────────
        board.querySelectorAll('.decklist-builder-card[data-index]').forEach((card) => {
            const idx = Number(card.dataset.index);

            card.addEventListener('dragstart', (e) => {
                dragSrcIndex = idx;
                card.classList.add('is-dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', () => {
                dragSrcIndex = -1;
                board.querySelectorAll('.decklist-builder-card').forEach((c) => {
                    c.classList.remove('is-dragging', 'is-drag-over');
                });
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (idx !== dragSrcIndex) card.classList.add('is-drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('is-drag-over');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('is-drag-over');
                const src = dragSrcIndex;
                if (src < 0 || src === idx) return;
                const [moved] = entries.splice(src, 1);
                entries.splice(idx, 0, moved);
                setSaveStatus('');
                render([]);
            });
        });

        hydrateCardMetadata(entries);
    }

    function buildDeckCardHtml(entry, index) {
        const badge = getCardRestrictionBadge(entry.code);
        const hideCount = badge?.type === 'restricted' && Number(entry.count) === 1;
        const badgeClass = hideCount ? 'is-in-deck is-in-count-slot' : 'is-in-deck';
        const badgeHtml = badge
            ? `<div class="decklist-card-restriction-badge ${badgeClass} is-${escapeHtml(badge.type)}" title="${escapeHtml(badge.title)}">${escapeHtml(badge.label)}</div>`
            : '';
        const countHtml = hideCount
            ? ''
            : `<div class="decklist-builder-count">${entry.count}</div>`;

        return `
            <article class="decklist-builder-card" data-code="${escapeHtml(entry.code)}" data-index="${index}" draggable="true">
                <div class="decklist-builder-drag-handle" title="Drag to reorder">⠿</div>
                ${countHtml}
                <img src="${getCardImageUrl(entry.code)}" alt="${escapeHtml(entry.code)}" />
                ${badgeHtml}
                <div class="decklist-builder-hover-controls">
                    <button type="button" class="decklist-builder-stepper-btn is-increase" data-action="increase" data-code="${escapeHtml(entry.code)}" aria-label="Increase ${escapeHtml(entry.code)}">+</button>
                    <button type="button" class="decklist-builder-stepper-btn is-decrease" data-action="decrease" data-code="${escapeHtml(entry.code)}" aria-label="Decrease ${escapeHtml(entry.code)}">-</button>
                </div>
            </article>
        `;
    }

    function renderCardSearchResults() {
        const root = document.getElementById('cardSearchResults');
        if (!root) return;

        if (!cardSearchResults.length) {
            root.innerHTML = '';
            return;
        }

        const { pageSize } = getCardSearchGridConfig();
        const totalPages = Math.max(1, Math.ceil(cardSearchResults.length / pageSize));
        cardSearchPage = Math.max(1, Math.min(totalPages, cardSearchPage));
        const start = (cardSearchPage - 1) * pageSize;
        const pageItems = cardSearchResults.slice(start, start + pageSize);

        const pagerHtml = totalPages > 1 ? `
            <div class="decklist-search-results-pager">
                <div class="decklist-search-pagination" aria-label="Search results pagination">
                    <button type="button" class="decklist-search-page-btn" data-search-page="prev" ${cardSearchPage <= 1 ? 'disabled' : ''} aria-label="Previous page">&lt;</button>
                    <span class="decklist-search-page-indicator">${cardSearchPage}/${totalPages}</span>
                    <button type="button" class="decklist-search-page-btn" data-search-page="next" ${cardSearchPage >= totalPages ? 'disabled' : ''} aria-label="Next page">&gt;</button>
                </div>
            </div>
        ` : '';

        root.innerHTML = `
            <div class="decklist-search-results-scroll">
                <div class="decklist-search-results-grid">
                    ${pageItems.map((card) => buildSearchCardHtml(card)).join('')}
                </div>
            </div>
            ${pagerHtml}
        `;
        scheduleCardSearchResultsLayout();

        root.querySelectorAll('.decklist-search-card img').forEach((img) => {
            img.addEventListener('error', () => {
                const code = img.closest('.decklist-search-card')?.dataset.code || 'CODE';
                img.src = `https://via.placeholder.com/220x308/667eea/ffffff?text=${encodeURIComponent(code)}`;
            }, { once: true });
        });

        root.querySelectorAll('.decklist-search-card[data-code]').forEach((card) => {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openCardZoomModal(String(card.getAttribute('data-code') || ''));
            });
        });
    }

    function buildSearchCardHtml(card) {
        const code = normalizeDeckCode(card.card_code || card.id || '');
        const badge = getCardRestrictionBadge(code);
        const badgeSlotClass = badge?.type === 'restricted' ? 'is-in-count-slot' : '';
        const badgeHtml = badge
            ? `<div class="decklist-card-restriction-badge is-in-search ${badgeSlotClass} is-${escapeHtml(badge.type)}" title="${escapeHtml(badge.title)}">${escapeHtml(badge.label)}</div>`
            : '';
        const deckEntry = entries.find(e => normalizeDeckCode(e.code) === code);
        const countHtml = deckEntry
            ? `<div class="decklist-search-card-deck-count">&times;${deckEntry.count}</div>`
            : '';
        return `
            <article class="decklist-search-card" data-code="${escapeHtml(code)}">
                <img src="${getCardImageUrl(code)}" alt="${escapeHtml(card.name || code)}" />
                ${badgeHtml}
                ${countHtml}
                <div class="decklist-search-card-code">${escapeHtml(code)}</div>
            </article>
        `;
    }

    function renderDeckErrors(errorBox, errors) {
        if (!errorBox) return;
        if (deckErrorAutoHideTimer) { clearTimeout(deckErrorAutoHideTimer); deckErrorAutoHideTimer = null; }

        const message = (Array.isArray(errors) ? errors : [])
            .map((i) => String(i || '').trim()).filter(Boolean).join(' | ');
        if (!message) { clearDeckErrors(errorBox); return; }

        errorBox.style.display = 'flex';
        errorBox.innerHTML = `
            <span class="decklist-builder-errors-text">${escapeHtml(message)}</span>
            <button type="button" class="decklist-builder-errors-close cancel-close" aria-label="Cancelar">Cancelar</button>
        `;
        errorBox.querySelector('.decklist-builder-errors-close')
            ?.addEventListener('click', () => clearDeckErrors(errorBox));

        deckErrorAutoHideTimer = setTimeout(() => clearDeckErrors(errorBox), 6000);
    }

    function clearDeckErrors(errorBox) {
        const target = errorBox || document.getElementById('decklistBuilderErrors');
        if (!target) return;
        if (deckErrorAutoHideTimer) { clearTimeout(deckErrorAutoHideTimer); deckErrorAutoHideTimer = null; }
        target.style.display = 'none';
        target.textContent = '';
    }

    function setSaveStatus(message, type = '') {
        const el = document.getElementById('decklistBuilderSaveStatus');
        if (!el) return;
        el.textContent = message;
        el.className = 'decklist-builder-save-status';
        if (type) el.classList.add(`is-${type}`);
    }

    let decklistToastTimer = null;
    function showToast(message, type = 'info', durationMs = 2200) {
        const el = document.getElementById('decklistToast');
        if (!el) return;
        if (decklistToastTimer) { clearTimeout(decklistToastTimer); decklistToastTimer = null; }
        el.textContent = String(message || '').trim();
        el.className = 'decklist-toast';
        if (type) el.classList.add(`is-${type}`);
        if (!el.textContent) return;
        el.classList.add('is-open');
        decklistToastTimer = setTimeout(() => {
            el.classList.remove('is-open');
            decklistToastTimer = null;
        }, Math.max(900, Number(durationMs) || 2200));
    }

    // ─── Breakdown chart ──────────────────────────────────────────────────────

    function buildDeckGroupBreakdownHtml(sourceEntries, statsLabel = '') {
        const m = getDeckBreakdownMetrics(sourceEntries);
        const typeItems = [
            { key: 'digi-egg', label: 'DigiEgg', value: m.digiEgg },
            { key: 'digimon', label: 'Digimon', value: m.digimon },
            { key: 'tamer', label: 'Tamer', value: m.tamer },
            { key: 'option', label: 'Option', value: m.option },
        ];
        const levelItems = [
            { key: 'lv2', label: 'Lv2', value: m.lv2 },
            { key: 'lv3', label: 'Lv3', value: m.lv3 },
            { key: 'lv4', label: 'Lv4', value: m.lv4 },
            { key: 'lv5', label: 'Lv5', value: m.lv5 },
            { key: 'lv6', label: 'Lv6', value: m.lv6 },
            { key: 'lv7p', label: 'Lv7', value: m.lv7p },
        ];
        const maxValue = Math.max(1, ...[...typeItems, ...levelItems].map((i) => i.value));

        return `
            <div class="decklist-builder-breakdown-chart">
                ${statsLabel ? `<div class="decklist-builder-stats decklist-builder-breakdown-stats">${escapeHtml(statsLabel)}</div>` : ''}
                <div class="decklist-builder-breakdown-group">
                    ${typeItems.map((i) => buildBreakdownBarItem(i, maxValue)).join('')}
                </div>
                <div class="decklist-builder-breakdown-divider" aria-hidden="true"></div>
                <div class="decklist-builder-breakdown-group">
                    ${levelItems.map((i) => buildBreakdownBarItem(i, maxValue)).join('')}
                </div>
            </div>
        `;
    }

    function getDeckBreakdownMetrics(sourceEntries) {
        const m = { digiEgg: 0, digimon: 0, tamer: 0, option: 0, lv2: 0, lv3: 0, lv4: 0, lv5: 0, lv6: 0, lv7p: 0 };

        (Array.isArray(sourceEntries) ? sourceEntries : []).forEach((entry) => {
            const qty = Number(entry?.count) || 0;
            if (qty <= 0) return;
            const info = getEntryGroupInfo(entry);

            if (info.key === 'digi-egg') { m.digiEgg += qty; }
            else if (info.key === 'tamer') { m.tamer += qty; }
            else if (info.key === 'option') { m.option += qty; }
            else if (info.key.startsWith('digimon')) {
                m.digimon += qty;
                const level = extractLevelFromGroupKey(info.key);
                if (level === 3) m.lv3 += qty;
                else if (level === 4) m.lv4 += qty;
                else if (level === 5) m.lv5 += qty;
                else if (level === 6) m.lv6 += qty;
                else if (Number.isFinite(level) && level >= 7) m.lv7p += qty;
            }
        });

        m.lv2 = m.digiEgg; // Digi-Eggs are level 2 equivalents in the chart
        return m;
    }

    function buildBreakdownBarItem(item, maxValue) {
        const value = Number(item?.value) || 0;
        const height = Math.max(8, Math.round(8 + (maxValue > 0 ? value / maxValue : 0) * 30));
        return `
            <div class="decklist-builder-breakdown-bar" data-key="${escapeHtmlAttribute(item.key)}" title="${escapeHtml(item.label)}: ${value}">
                <div class="decklist-builder-breakdown-bar-fill" style="height:${height}px"></div>
                <div class="decklist-builder-breakdown-bar-value">${value}</div>
                <div class="decklist-builder-breakdown-bar-label">${escapeHtml(item.label)}</div>
            </div>
        `;
    }

    function extractLevelFromGroupKey(groupKey) {
        const match = String(groupKey || '').match(/^digimon-lv-(\d+)$/);
        if (!match) return null;
        const level = Number(match[1]);
        return Number.isFinite(level) ? level : null;
    }

    function getMaxCopies(code) {
        const normalized = normalizeDeckCode(code);
        if (UNLIMITED_CODES.has(normalized)) return 50;
        if (RESTRICTED_CODES.has(normalized)) return 1;
        if (BANNED_CODES.has(normalized)) return 0;
        return MAX_COPIES_PER_CARD; // Padrão: 4
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
        );
    }

    function escapeHtmlAttribute(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

})();
