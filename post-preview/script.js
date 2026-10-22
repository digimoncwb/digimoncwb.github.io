const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || 'https://vllqakohumoinpdwnsqa.supabase.co';
const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
const headers = window.createSupabaseHeaders
    ? window.createSupabaseHeaders()
    : {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
      };

let currentStore = '';
let currentDate = '';
let tournamentDataForCanvas = null;
let firstPlaceDecklistAvailable = null;
let selectedBackgroundPath = '';
const BLANK_MIDDLE_DECKLIST_CACHE = new Map();

const TOP_LEFT_LOGO_CANDIDATES = ['../icons/digimon-card-game.png', '../icons/logo.png'];
const TROPHY_ICON_CANDIDATES = [
    '../icons/Postagem.svg'
];
const TROPHY_SVG_BASE_COLOR = '#50c89f';
const PLACEMENT_STYLES = {
    1: { border: '#c99a2e', medal: '#f1c451', dark: '#8f6100' },
    2: { border: '#9497a1', medal: '#c2c4ca', dark: '#616a79' },
    3: { border: '#a85d2f', medal: '#d88b44', dark: '#6f3417' },
    4: { border: '#4dbf9f', medal: '#59d1af', dark: '#1f6f62' }
};
const trophySvgTemplateCache = new Map();
const trophyTintedIconCache = new Map();
const POST_LAYOUT_STORAGE_KEY = 'digistats.post-layout.v1';
const TEMPLATE_EDITOR_STATE_KEY = 'digistats.template-editor.state.v1';
const TEMPLATE_EDITOR_UPDATED_KEY = 'digistats.template-editor.updated.v1';
const POST_PREVIEW_STATE_KEY = 'digistats.post-preview.state.v1';
const POST_PRESETS_STORAGE_KEY = 'digistats.post-layout-presets.v1';
const CUSTOM_BACKGROUNDS_STORAGE_KEY = 'digistats.custom-backgrounds.v1';
const POST_TYPE_STORAGE_KEY = 'digistats.post-type.v1';
const POST_PREVIEW_ZOOM_STORAGE_KEY = 'digistats.post-preview.zoom.v1';
const POST_TYPE_OPTIONS = ['top4', 'distribution_results', 'blank_middle'];
const FORMAT_BG_BUCKET = 'post-backgrounds';
let formatBackgroundMapPromise = null;
let formatBackgroundMapLoadedAt = 0;
const FORMAT_BACKGROUND_CACHE_TTL_MS = 60 * 1000;
const storeLogoMap = new Map(); // normalized name → bucket URL
let selectedPostType = loadSelectedPostType();
let postPreviewZoom = loadPostPreviewZoom();

function loadSelectedPostType() {
    try {
        const raw = localStorage.getItem(POST_TYPE_STORAGE_KEY);
        return POST_TYPE_OPTIONS.includes(raw) ? raw : 'top4';
    } catch (_) {
        return 'top4';
    }
}

function saveSelectedPostType() {
    try {
        localStorage.setItem(POST_TYPE_STORAGE_KEY, selectedPostType);
    } catch (_) {
        // Ignore storage failures.
    }
}

function loadPostPreviewZoom() {
    try {
        const raw = Number(localStorage.getItem(POST_PREVIEW_ZOOM_STORAGE_KEY));
        if (Number.isFinite(raw) && raw >= 0.6 && raw <= 1.1) {
            return raw;
        }
    } catch (_) {
        // Ignore storage failures.
    }
    return 0.9;
}

function savePostPreviewZoom() {
    try {
        localStorage.setItem(POST_PREVIEW_ZOOM_STORAGE_KEY, String(postPreviewZoom));
    } catch (_) {
        // Ignore storage failures.
    }
}

function buildPublicBucketObjectUrl(bucketName, objectPath) {
    const cleanPath = String(objectPath || '').trim().replace(/^\/+/, '');
    if (!cleanPath) return '';
    return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${cleanPath}`;
}

const DEFAULT_BACKGROUND_OPTIONS = [{ label: 'None', value: '' }];
const INSTAGRAM_DEFAULT_LAYOUT = {
    logo: { x: 80, y: 74, w: 540, h: 198 },
    title: { x: 634, y: 82, w: 338, h: 182, titleOffsetY: 82, dateOffsetY: 136, dateMaxWidth: 302 },
    rows: { x: 92, startY: 280, w: 896, rowHeight: 178, rowGap: 24 },
    rowBorder: { x: 92, startY: 280, w: 896, rowHeight: 178, rowGap: 24 },
    rowElements: {
        trophy: { x: 74, y: 91, w: 156, h: 156, gap: 24 },
        podiumNumber: { offsetX: 0, offsetY: -8, size: 52 },
        avatar: {
            xFromRight: 88,
            yOffset: 0,
            outerRadius: 86,
            imageRadius: 78,
            whiteRingWidth: 0,
            borderRingWidth: 4,
            gap: 24
        },
        text: { leftPadding: 190, rightPadding: 96, playerY: 62, deckY: 116, gap: 24 }
    },
    store: { x: 96, y: 1162, w: 330, h: 122 },
    handle: { x: 988, y: 1234 },
    typography: { titleSize: 72, dateSize: 72, playerSize: 54, deckSize: 62, handleSize: 46 },
    distribution: {
        panel: { inset: 16 },
        cards: { leftRatio: 0.54, gutter: 14 },
        deckCard: { x: 0, y: 0 },
        resultsCard: { x: 0, y: 0 },
        pie: { x: 0, y: 0, radius: 0 },
        results: { x: 0, y: 0, width: 0, columnSize: 12 }
    },
    blankMiddle: {
        decklist: { x: 0, y: 0, w: 0, h: 0, padding: 10 }
    }
};
const DEFAULT_POST_LAYOUT = INSTAGRAM_DEFAULT_LAYOUT;
const BUILT_IN_PRESETS = {
    Instagram: {
        layout: INSTAGRAM_DEFAULT_LAYOUT,
        builtIn: true
    }
};
let postLayout = loadPostLayout();
let isPostTemplateEditorActive = false;
let postEditorDragState = null;
let postEditorGuides = [];
const EDITOR_SNAP_DISTANCE = 12;
let activeTemplateHandleKey = 'logo';
let distributionPieStateOverride = {};
let activeDistributionPieDeck = '';
let distributionPieDragState = null;
let lastDistributionPieRenderState = null;
let isPieEditorActive = false;

function formatPlacementLabel(value) {
    const n = Number(value);
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    if (n === 4) return '4th';
    return `${n}th`;
}

document.addEventListener('DOMContentLoaded', async () => {
    clearDisplay();
    await loadStores();
    setupEventListeners();
    setupModalActionButtons();
    setupTypographyControls();
    setupPodiumGapControl();
    setupTemplateObjectControls();
    setupTemplateKeyboardControls();
    setupTemplateSyncListeners();
    setupPresetControls();
    setupPostTypeControls();
    setupPostPreviewZoomControl();
    setupCollapsibleSidebarSections();
    setupDistributionPieControls();

    await bootTemplateEditorPageIfNeeded();
    await bootPostPreviewPageIfNeeded();
});

function setupEventListeners() {
    const storeFilter = document.getElementById('storeFilter');
    const dateFilter = document.getElementById('dateFilter');
    const backgroundSelects = ['postBackgroundSelect', 'templateBackgroundSelect']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    const backgroundUploads = ['postBackgroundUpload', 'templateBackgroundUpload']
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    initializeBackgroundSelector();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') initializeBackgroundSelector();
    });

    storeFilter.addEventListener('change', async (e) => {
        currentStore = e.target.value;
        if (currentStore) {
            await loadDatesForStore(currentStore);
            dateFilter.disabled = false;
        } else {
            dateFilter.disabled = true;
            dateFilter.innerHTML = '<option value="">Select a date...</option>';
            clearDisplay();
        }
    });

    dateFilter.addEventListener('change', async (e) => {
        currentDate = e.target.value;
        if (currentDate) {
            await displayTournament();
        } else {
            clearDisplay();
        }
    });

    backgroundSelects.forEach((select) => {
        select.addEventListener('change', (event) => {
            selectedBackgroundPath = event.target.value || '';
            syncBackgroundSelectors();
            updatePostPreviewMeta();
            if (tournamentDataForCanvas) drawPostCanvas();
        });
    });

    backgroundUploads.forEach((input) => {
        input.addEventListener('change', onCustomBackgroundUpload);
    });
}

function isTopFourPostType() {
    return selectedPostType === 'top4';
}

function getPostTypeLabel(typeValue) {
    if (typeValue === 'distribution_results') return 'Deck Distribution';
    if (typeValue === 'blank_middle') return 'Decklist';
    return 'Top 4';
}

function updatePostPreviewMeta() {
    const meta = document.getElementById('postPreviewMeta');
    if (!meta) return;
    const formatCode = String(tournamentDataForCanvas?.format || '-').trim() || '-';
    meta.textContent = `Type: ${getPostTypeLabel(selectedPostType)} | Format: ${formatCode}`;
}

function updateTemplateControlsVisibility() {
    document.querySelectorAll('[data-template-control]').forEach((element) => {
        element.classList.remove('u-hidden');
    });
    const pieControls = ['templatePieSlicePicker', 'templatePieAdjustRow', 'btnPieEditorToggle']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    const showPieControls = selectedPostType === 'distribution_results';
    pieControls.forEach((el) => {
        el.classList.toggle('u-hidden', !showPieControls);
    });
    if (!showPieControls) {
        setPieEditorActive(false);
    }

    refreshDistributionPieControls();
}

function syncPostTypeSelector() {
    const select = document.getElementById('postTypeSelect');
    if (!select) return;
    const decklistOption = select.querySelector('option[value="blank_middle"]');
    if (decklistOption) {
        decklistOption.hidden = firstPlaceDecklistAvailable !== true;
        decklistOption.disabled = firstPlaceDecklistAvailable !== true;
    }
    if (POST_TYPE_OPTIONS.includes(selectedPostType)) {
        select.value = selectedPostType;
    } else {
        select.value = 'top4';
    }
}

function setupPostTypeControls() {
    const select = document.getElementById('postTypeSelect');
    if (!select) return;
    syncPostTypeSelector();
    updateTemplateControlsVisibility();
    updatePostPreviewMeta();
    select.addEventListener('change', () => {
        selectedPostType = POST_TYPE_OPTIONS.includes(select.value) ? select.value : 'top4';
        if (selectedPostType === 'blank_middle' && firstPlaceDecklistAvailable !== true) selectedPostType = 'top4';
        syncPostTypeSelector();
        saveSelectedPostType();
        updateTemplateControlsVisibility();
        updatePostPreviewMeta();
        updateTemplateEditorButtons();
        syncTemplateObjectSelect();
        if (tournamentDataForCanvas) {
            void drawPostCanvas();
        }
    });
}

function applyPostPreviewZoom() {
    const wrap = document.getElementById('postCanvasWrap');
    if (!wrap) return;
    wrap.style.setProperty('--post-preview-zoom', String(postPreviewZoom));
    if (isPostTemplateEditorActive) {
        renderTemplateEditorOverlay();
    }
}

function syncPostPreviewZoomSelector() {
    const select = document.getElementById('postPreviewZoomSelect');
    if (!select) return;
    select.value = String(postPreviewZoom);
}

function setupPostPreviewZoomControl() {
    const select = document.getElementById('postPreviewZoomSelect');
    applyPostPreviewZoom();
    if (!select) return;
    syncPostPreviewZoomSelector();
    select.addEventListener('change', () => {
        const parsed = Number(select.value);
        postPreviewZoom = Number.isFinite(parsed) && parsed >= 0.6 && parsed <= 1.1 ? parsed : 0.9;
        savePostPreviewZoom();
        applyPostPreviewZoom();
    });
}

function setupCollapsibleSidebarSections() {
    const sections = document.querySelectorAll('#postPreviewModal .sidebar-section');
    sections.forEach((section) => {
        const toggle = section.querySelector('.sidebar-section-toggle');
        const content = section.querySelector('.sidebar-section-content');
        if (!toggle || !content) return;
        toggle.addEventListener('click', () => {
            const isCollapsed = section.classList.toggle('is-collapsed');
            toggle.setAttribute('aria-expanded', String(!isCollapsed));
        });
    });
}

function getDistributionDeckEntries() {
    const results = Array.isArray(tournamentDataForCanvas?.allResults)
        ? tournamentDataForCanvas.allResults
        : [];
    const grouped = new Map();
    results.forEach((item) => {
        const deck = String(item?.deck || 'Unknown Deck').trim() || 'Unknown Deck';
        const placement = Number(item?.placement) || Number.MAX_SAFE_INTEGER;
        if (!grouped.has(deck)) grouped.set(deck, { count: 0, firstPlacement: placement });
        const current = grouped.get(deck);
        current.count += 1;
        current.firstPlacement = Math.min(current.firstPlacement, placement);
    });
    return Array.from(grouped.entries())
        .map(([deck, info]) => ({ deck, count: info.count, firstPlacement: info.firstPlacement }))
        .sort((a, b) => a.firstPlacement - b.firstPlacement || a.deck.localeCompare(b.deck));
}

function getCombinedDistributionPieState(data) {
    return {
        ...loadSavedPieStateForPost(data),
        ...(distributionPieStateOverride || {})
    };
}

function saveDistributionPieStateForPost(data) {
    const keys = getPieStateKeysForPostData(data);
    if (!keys.length) return;
    try {
        const merged = getCombinedDistributionPieState(data);
        const payload = JSON.stringify(merged);
        keys.forEach((key) => {
            localStorage.setItem(getPostPieStorageKey(key), payload);
        });
    } catch (_) {
        // Ignore storage failures.
    }
}

function refreshDistributionPieControls() {
    const select = document.getElementById('templatePieSliceSelect');
    const xInput = document.getElementById('templatePieXInput');
    const yInput = document.getElementById('templatePieYInput');
    const zoomInput = document.getElementById('templatePieZoomInput');
    if (!select || !xInput || !yInput || !zoomInput) return;

    const deckEntries = getDistributionDeckEntries();
    const prevDeck = activeDistributionPieDeck;
    select.innerHTML = '<option value="">Select deck...</option>';
    deckEntries.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.deck;
        option.textContent = `${entry.deck} (${entry.count})`;
        select.appendChild(option);
    });

    const availableDecks = new Set(deckEntries.map((entry) => entry.deck));
    if (!availableDecks.has(activeDistributionPieDeck)) {
        activeDistributionPieDeck = deckEntries[0]?.deck || '';
    }
    if (prevDeck && availableDecks.has(prevDeck)) {
        activeDistributionPieDeck = prevDeck;
    }
    select.value = activeDistributionPieDeck;

    const combinedState = getCombinedDistributionPieState(tournamentDataForCanvas);
    const state = combinedState[activeDistributionPieDeck] || {};
    const x = Number(state.x);
    const y = Number(state.y);
    const zoom = Number(state.zoom);
    xInput.value = String(Number.isFinite(x) ? Math.round(x) : 50);
    yInput.value = String(Number.isFinite(y) ? Math.round(y) : 32);
    zoomInput.value = String(Number.isFinite(zoom) ? Math.round(zoom) : 160);

    const disabled = !activeDistributionPieDeck || selectedPostType !== 'distribution_results';
    xInput.disabled = disabled;
    yInput.disabled = disabled;
    zoomInput.disabled = disabled;
    select.disabled = selectedPostType !== 'distribution_results';
}

function updateActivePieSliceStateFromInputs() {
    const xInput = document.getElementById('templatePieXInput');
    const yInput = document.getElementById('templatePieYInput');
    const zoomInput = document.getElementById('templatePieZoomInput');
    if (!xInput || !yInput || !zoomInput || !activeDistributionPieDeck) return;

    const nextX = Math.max(-300, Math.min(300, Number(xInput.value)));
    const nextY = Math.max(-300, Math.min(300, Number(yInput.value)));
    const nextZoom = Math.max(120, Math.min(420, Number(zoomInput.value)));
    distributionPieStateOverride[activeDistributionPieDeck] = {
        x: Number.isFinite(nextX) ? nextX : 50,
        y: Number.isFinite(nextY) ? nextY : 13,
        zoom: Number.isFinite(nextZoom) ? nextZoom : 120
    };
    saveDistributionPieStateForPost(tournamentDataForCanvas);
    drawPostCanvas();
}

function setupDistributionPieControls() {
    const select = document.getElementById('templatePieSliceSelect');
    const xInput = document.getElementById('templatePieXInput');
    const yInput = document.getElementById('templatePieYInput');
    const zoomInput = document.getElementById('templatePieZoomInput');
    if (!select || !xInput || !yInput || !zoomInput) return;

    select.addEventListener('change', () => {
        activeDistributionPieDeck = select.value || '';
        refreshDistributionPieControls();
    });
    [xInput, yInput, zoomInput].forEach((input) => {
        input.addEventListener('input', updateActivePieSliceStateFromInputs);
    });
    window.addEventListener('keydown', (event) => {
        if (!isPieEditorActive || selectedPostType !== 'distribution_results') return;
        if (!activeDistributionPieDeck) return;
        if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

        const step = event.shiftKey ? 5 : 1;
        const key = String(event.key || '').toLowerCase();
        let dx = 0;
        let dy = 0;
        if (key === 'arrowleft' || key === 'a') dx = -step;
        else if (key === 'arrowright' || key === 'd') dx = step;
        else if (key === 'arrowup' || key === 'w') dy = -step;
        else if (key === 'arrowdown' || key === 's') dy = step;
        else return;

        event.preventDefault();
        nudgeActiveDistributionPieSlice(dx, dy);
    });

    refreshDistributionPieControls();
}

function nudgeActiveDistributionPieSlice(dx, dy) {
    if (!activeDistributionPieDeck) return;
    const currentState = getCombinedDistributionPieState(tournamentDataForCanvas)[activeDistributionPieDeck] || {
        x: 50,
        y: 32,
        zoom: 160
    };
    const nextX = Math.max(-300, Math.min(300, (Number(currentState.x) || 0) + dx));
    const nextY = Math.max(-300, Math.min(300, (Number(currentState.y) || 0) + dy));
    distributionPieStateOverride[activeDistributionPieDeck] = {
        x: nextX,
        y: nextY,
        zoom: Number(currentState.zoom) || 120
    };
    saveDistributionPieStateForPost(tournamentDataForCanvas);
    refreshDistributionPieControls();
    drawPostCanvas();
}

function setPieEditorActive(active) {
    isPieEditorActive = Boolean(active) && selectedPostType === 'distribution_results';
    const button = document.getElementById('btnPieEditorToggle');
    const hint = document.getElementById('templatePieEditorHint');
    const canvas = document.getElementById('postCanvas');
    if (button) {
        button.textContent = isPieEditorActive ? 'Close Pie Editor' : 'Open Pie Editor';
        button.classList.toggle('is-active', isPieEditorActive);
    }
    if (hint) {
        hint.classList.toggle('u-hidden', !isPieEditorActive);
    }
    if (canvas) {
        canvas.style.cursor = isPieEditorActive ? 'grab' : '';
    }
}

function getCanvasCoordinatesFromPointer(event) {
    const canvas = document.getElementById('postCanvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

function getDeckAtPiePoint(x, y) {
    const state = lastDistributionPieRenderState;
    if (!state) return '';
    const dx = x - state.centerX;
    const dy = y - state.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > state.radius) return '';
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    const found = state.slices.find((slice) => {
            let start = slice.start;
            let end = slice.end;
            if (start > end) end += Math.PI * 2;
            const normalizedAngle = angle < start ? angle + Math.PI * 2 : angle;
            return normalizedAngle >= start - 1e-6 && normalizedAngle <= end + 1e-6;
        })?.deck;
    return found || state.slices[state.slices.length - 1]?.deck || '';
}

function onDistributionPiePointerDown(event) {
    if (selectedPostType !== 'distribution_results') return;
    if (!isPieEditorActive && !isPostTemplateEditorActive) return;
    const point = getCanvasCoordinatesFromPointer(event);
    if (!point) return;
    const deck = getDeckAtPiePoint(point.x, point.y);
    if (!deck) return;

    activeDistributionPieDeck = deck;
    refreshDistributionPieControls();
    const base = getCombinedDistributionPieState(tournamentDataForCanvas)[deck] || {
        x: 50,
        y: 32,
        zoom: 160
    };
    distributionPieDragState = {
        deck,
        startClientX: event.clientX,
        startClientY: event.clientY,
        baseX: Number(base.x) || 50,
        baseY: Number(base.y) || 32
    };
    const canvas = document.getElementById('postCanvas');
    if (canvas) canvas.style.cursor = 'grabbing';

    window.addEventListener('pointermove', onDistributionPiePointerMove);
    window.addEventListener('pointerup', stopDistributionPiePointerDrag);
}

function onDistributionPiePointerMove(event) {
    if (!distributionPieDragState) return;
    const deltaX = (event.clientX - distributionPieDragState.startClientX) * 0.2;
    const deltaY = (event.clientY - distributionPieDragState.startClientY) * 0.2;
    const nextX = Math.max(-300, Math.min(300, distributionPieDragState.baseX + deltaX));
    const nextY = Math.max(-300, Math.min(300, distributionPieDragState.baseY + deltaY));
    distributionPieStateOverride[distributionPieDragState.deck] = {
        ...(distributionPieStateOverride[distributionPieDragState.deck] || {}),
        x: nextX,
        y: nextY,
        zoom:
            Number(distributionPieStateOverride[distributionPieDragState.deck]?.zoom) ||
            Number(getCombinedDistributionPieState(tournamentDataForCanvas)[distributionPieDragState.deck]?.zoom) ||
            120
    };
    saveDistributionPieStateForPost(tournamentDataForCanvas);
    refreshDistributionPieControls();
    drawPostCanvas();
}

function stopDistributionPiePointerDrag() {
    if (!distributionPieDragState) return;
    distributionPieDragState = null;
    const canvas = document.getElementById('postCanvas');
    if (canvas) canvas.style.cursor = isPieEditorActive ? 'grab' : '';
    window.removeEventListener('pointermove', onDistributionPiePointerMove);
    window.removeEventListener('pointerup', stopDistributionPiePointerDrag);
}

function onDistributionPieWheel(event) {
    if (selectedPostType !== 'distribution_results') return;
    if (!isPieEditorActive && !isPostTemplateEditorActive) return;
    const point = getCanvasCoordinatesFromPointer(event);
    if (!point) return;
    const deck = getDeckAtPiePoint(point.x, point.y);
    if (!deck) return;
    event.preventDefault();
    activeDistributionPieDeck = deck;
    const currentState = getCombinedDistributionPieState(tournamentDataForCanvas)[deck] || {
        x: 50,
        y: 32,
        zoom: 160
    };
    let zoom = Number(currentState.zoom) || 120;
    zoom += event.deltaY < 0 ? 8 : -8;
    zoom = Math.max(120, Math.min(420, zoom));
    distributionPieStateOverride[deck] = {
        x: Number(currentState.x) || 50,
        y: Number(currentState.y) || 32,
        zoom
    };
    saveDistributionPieStateForPost(tournamentDataForCanvas);
    refreshDistributionPieControls();
    drawPostCanvas();
}

function getCustomBackgrounds() {
    try {
        const raw = localStorage.getItem(CUSTOM_BACKGROUNDS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function saveCustomBackgrounds(list) {
    try {
        localStorage.setItem(CUSTOM_BACKGROUNDS_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {
        // Ignore storage failures.
    }
}

async function initializeBackgroundSelector(selectedValue) {
    const selects = ['postBackgroundSelect', 'templateBackgroundSelect']
        .map((id) => document.getElementById(id))
        .filter(Boolean);
    selects.forEach((select) => {
        select.disabled = true;
        select.setAttribute('aria-busy', 'true');
        if (!formatBackgroundMapPromise) {
            select.innerHTML = '<option value="">Loading backgrounds...</option>';
        }
    });
    const custom = getCustomBackgrounds();
    const formatMap = await loadFormatBackgroundMap();
    const options = [...DEFAULT_BACKGROUND_OPTIONS, ...(formatMap.options || []), ...custom];

    selects.forEach((select) => {
        select.innerHTML = '';
        options.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });
        select.disabled = false;
        select.removeAttribute('aria-busy');
    });

    const nextValue =
        selectedValue !== undefined
            ? selectedValue
            : options.some((o) => o.value === selectedBackgroundPath)
              ? selectedBackgroundPath
              : (formatMap.options?.[0]?.value ?? '');
    selectedBackgroundPath = nextValue;
    syncBackgroundSelectors();
}

function syncBackgroundSelectors() {
    ['postBackgroundSelect', 'templateBackgroundSelect'].forEach((id) => {
        const select = document.getElementById(id);
        if (!select) return;
        if ([...select.options].some((opt) => opt.value === selectedBackgroundPath)) {
            select.value = selectedBackgroundPath;
        }
    });
}

async function uploadBackgroundAsFormat(file) {
    const defaultCode = normalizeFormatCode(file.name.replace(/\.[^.]+$/, ''));
    const rawCode = window.prompt('Format code (ex: EX12):', defaultCode || '');
    if (!rawCode) return null;

    const formatCode = normalizeFormatCode(rawCode);
    if (!formatCode) {
        alert('Invalid format code.');
        return null;
    }

    const rawName = window.prompt('Format name (optional):', formatCode);
    if (rawName === null) return null;
    const formatName = String(rawName || '').trim() || formatCode;

    const extMatch = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = extMatch?.[1] || 'png';
    const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
    const objectPath = `${formatCode}.${safeExt}`;

    const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${FORMAT_BG_BUCKET}/${encodeURIComponent(objectPath)}`,
        {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': file.type || `image/${safeExt}`,
                'x-upsert': 'true'
            },
            body: file
        }
    );

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Storage upload failed (${uploadRes.status}): ${errorText}`);
    }

    const formatPayload = [
        {
            code: formatCode,
            name: formatName,
            background_path: objectPath,
            is_active: true
        }
    ];
    const formatRes = await fetch(`${SUPABASE_URL}/rest/v1/formats?on_conflict=code`, {
        method: 'POST',
        headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(formatPayload)
    });

    if (!formatRes.ok) {
        const errorText = await formatRes.text();
        throw new Error(`Formats upsert failed (${formatRes.status}): ${errorText}`);
    }

    return {
        code: formatCode,
        name: formatName,
        backgroundUrl: buildPublicBucketObjectUrl(FORMAT_BG_BUCKET, objectPath)
    };
}

async function onCustomBackgroundUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const createdFormat = await uploadBackgroundAsFormat(file);
        if (!createdFormat) return;

        formatBackgroundMapPromise = null;
        selectedBackgroundPath = createdFormat.backgroundUrl;

        const custom = getCustomBackgrounds();
        const deduped = custom.filter(
            (item) =>
                String(item?.value || '') !== createdFormat.backgroundUrl &&
                String(item?.label || '').toUpperCase() !== createdFormat.code
        );
        deduped.push({ label: createdFormat.code, value: createdFormat.backgroundUrl });
        saveCustomBackgrounds(deduped.slice(-20));

        await initializeBackgroundSelector(createdFormat.backgroundUrl);
        if (tournamentDataForCanvas) {
            tournamentDataForCanvas.format = createdFormat.code;
            updatePostPreviewMeta();
            await drawPostCanvas();
        }
        showPostToast(`Format "${createdFormat.code}" created.`);
    } catch (error) {
        console.error(error);
        alert('Failed to upload background to Supabase or create format.');
    }

    event.target.value = '';
}

function normalizeFormatCode(value) {
    const raw = String(value || '')
        .trim()
        .toUpperCase();
    if (!raw) return '';

    const explicitCode = raw.match(/[A-Z]{1,4}\d{1,3}/);
    if (explicitCode?.[0]) return explicitCode[0];

    return raw
        .split(/[\/|,-]/)[0]
        .trim()
        .replace(/[^A-Z0-9]/g, '');
}

function normalizeFormatMapKey(value) {
    return normalizeFormatCode(value).replace(/[^A-Z0-9]/g, '');
}

function getFormatFallbackBackgroundUrl(formatCode) {
    if (!formatCode) return '';
    return buildPublicBucketObjectUrl(FORMAT_BG_BUCKET, `${formatCode}.png`);
}

function resolveFormatBackgroundUrl(formatCode, formatBackgroundState) {
    const normalizedCode = normalizeFormatCode(formatCode);
    if (!normalizedCode) {
        return String(formatBackgroundState?.defaultUrl || '');
    }

    const normalizedMapKey = normalizeFormatMapKey(normalizedCode);
    const map = formatBackgroundState?.byCode || {};
    const mapped =
        map[normalizedCode] ||
        map[normalizedMapKey] ||
        map[normalizeFormatCode(normalizedCode.replace(/\s+/g, ''))] ||
        null;
    if (mapped) return mapped;

    return getFormatFallbackBackgroundUrl(normalizedCode);
}

async function loadFormatBackgroundMap() {
    if (formatBackgroundMapPromise && Date.now() - formatBackgroundMapLoadedAt >= FORMAT_BACKGROUND_CACHE_TTL_MS) {
        formatBackgroundMapPromise = null;
    }
    if (formatBackgroundMapPromise) return formatBackgroundMapPromise;

    formatBackgroundMapLoadedAt = Date.now();
    formatBackgroundMapPromise = (async () => {
        try {
            const query =
                '/rest/v1/formats?select=code,background_path,background_url,is_active,is_default';
            const res = window.supabaseApi
                ? await window.supabaseApi.get(query)
                : await fetch(`${SUPABASE_URL}${query}`, { headers });

            if (!res.ok) throw new Error(`Failed to load backgrounds (${res.status})`);

            const rows = await res.json();
            if (!Array.isArray(rows)) throw new Error('Invalid background response');

            const byCode = {};
            const options = [];
            let defaultUrl = '';
            rows.forEach((row) => {
                if (!row?.code || row?.is_active === false) return;
                // Strip legacy /formats/ sub-folder prefix from DB records that predate bucket restructure
                const backgroundUrl = String(row.background_url || '').trim()
                    .replace(/(\/storage\/v1\/object\/public\/[^/]+\/)formats\//, '$1');
                const backgroundPath = String(row.background_path || '').trim().replace(/^formats\//, '');
                const resolvedUrl =
                    backgroundUrl || buildPublicBucketObjectUrl(FORMAT_BG_BUCKET, backgroundPath);
                if (!resolvedUrl) return;

                const code = normalizeFormatCode(row.code);
                byCode[code] = resolvedUrl;
                byCode[normalizeFormatMapKey(code)] = resolvedUrl;
                options.push({ label: row.code, value: resolvedUrl });
                if (row?.is_default === true) {
                    defaultUrl = resolvedUrl;
                }
            });

            options.sort((a, b) => a.label.localeCompare(b.label));
            return { byCode, defaultUrl, options };
        } catch (_) {
            formatBackgroundMapPromise = null;
            return { byCode: {}, defaultUrl: '', options: [] };
        }
    })();

    return formatBackgroundMapPromise;
}

async function syncBackgroundWithTournamentFormat(data) {
    const formatCode = normalizeFormatCode(data?.format);
    if (!formatCode) return;

    const formatBackgroundState = await loadFormatBackgroundMap();
    const backgroundUrl = resolveFormatBackgroundUrl(formatCode, formatBackgroundState);
    if (!backgroundUrl) return;

    selectedBackgroundPath = backgroundUrl;
    await initializeBackgroundSelector(backgroundUrl);
    updatePostPreviewMeta();
    if (tournamentDataForCanvas) {
        await drawPostCanvas();
    }
}

async function loadStores() {
    try {
        showLoading(true);
        const res = window.supabaseApi
            ? await window.supabaseApi.get('/rest/v1/stores?select=*')
            : await fetch(`${SUPABASE_URL}/rest/v1/stores?select=*`, {
                  headers,
                  method: 'GET'
              });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const stores = await res.json();
        stores.forEach((s) => {
            if (s.logo_url) storeLogoMap.set(normalizeStoreName(s.name), s.logo_url);
        });
        const select = document.getElementById('storeFilter');

        select.innerHTML = '<option value="">Select store...</option>';
        stores
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((s) => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.name;
                select.appendChild(option);
            });
        showLoading(false);
    } catch (err) {
        console.error('Error loading stores:', err);
        showError();
        showLoading(false);
    }
}

async function loadDatesForStore(storeId) {
    try {
        showLoading(true);
        const res = window.supabaseApi
            ? await window.supabaseApi.get(
                  `/rest/v1/tournament_results?store_id=eq.${storeId}&select=tournament_date,total_players&order=tournament_date.desc`
              )
            : await fetch(
                  `${SUPABASE_URL}/rest/v1/tournament_results?store_id=eq.${storeId}&select=tournament_date,total_players&order=tournament_date.desc`,
                  { headers }
              );

        if (!res.ok) throw new Error('Error loading dates');

        const data = await res.json();
        const dates = [...new Set(data.map((item) => item.tournament_date))];

        const select = document.getElementById('dateFilter');
        select.innerHTML = '<option value="">Select a date...</option>';

        dates.forEach((dateStr) => {
            const option = document.createElement('option');
            option.value = dateStr;

            const [year, month, day] = dateStr.split('-');
            const formattedDate = `${day}/${month}/${year}`;

            option.textContent = formattedDate;
            select.appendChild(option);
        });
        showLoading(false);
    } catch (err) {
        console.error('Error loading dates:', err);
        showError();
        showLoading(false);
    }
}

async function displayTournament() {
    try {
        showLoading(true);

        const resultsPromise = window.supabaseApi
            ? window.supabaseApi.get(
                  `/rest/v1/v_podium_full?store_id=eq.${currentStore}&tournament_date=eq.${currentDate}&order=placement.asc`
              )
            : fetch(
                  `${SUPABASE_URL}/rest/v1/v_podium_full?store_id=eq.${currentStore}&tournament_date=eq.${currentDate}&order=placement.asc`,
                  { headers }
              );

        const tournamentPromise = window.supabaseApi
            ? window.supabaseApi.get(
                  `/rest/v1/tournament?store_id=eq.${currentStore}&tournament_date=eq.${currentDate}&select=id,store_id,tournament_date,tournament_name,format_id,format_ref:formats!tournament_format_id_fkey(code)&order=created_at.desc&limit=1`
              )
            : fetch(
                  `${SUPABASE_URL}/rest/v1/tournament?store_id=eq.${currentStore}&tournament_date=eq.${currentDate}&select=id,store_id,tournament_date,tournament_name,format_id,format_ref:formats!tournament_format_id_fkey(code)&order=created_at.desc&limit=1`,
                  { headers }
              );

        const [resultsRes, tournamentRes] = await Promise.all([resultsPromise, tournamentPromise]);

        if (!resultsRes.ok) throw new Error('Error loading results');
        if (!tournamentRes.ok) throw new Error('Error loading tournament metadata');

        const results = await resultsRes.json();
        const tournamentRows = await tournamentRes.json();
        const tournamentName = tournamentRows?.[0]?.tournament_name || 'SEMANAL';
        const tournamentFormat = tournamentRows?.[0]?.format_ref?.code || '';
        const tournamentId = String(tournamentRows?.[0]?.id || '');

        if (!results || results.length === 0) {
            clearDisplay();
            showLoading(false);
            return;
        }

        const totalPlayers = results[0].total_players;
        document.getElementById('totalPlayers').textContent = totalPlayers;

        const storeSelect = document.getElementById('storeFilter');
        const storeName = storeSelect.options[storeSelect.selectedIndex].text;

        const [year, month, day] = currentDate.split('-');
        const dateStr = `${day}/${month}/${year}`;

        if (typeof setTournamentDataForCanvas === 'function') {
            setTournamentDataForCanvas({
                topFour: results.slice(0, 4),
                storeName: storeName,
                tournamentName: tournamentName,
                format: tournamentFormat,
                tournamentId,
                storeId: String(currentStore || ''),
                tournamentDate: String(currentDate || ''),
                pieStateKey: tournamentId || `${String(currentStore || '')}-${String(currentDate || '')}`,
                dateStr: dateStr,
                totalPlayers: totalPlayers,
                allResults: results
            });
        }

        displayPodium(results.slice(0, 4));
        displayPositions(results);

        // Mostrar seÃ§Ã£o de resultados completos quando hÃ¡ dados
        const positionsSection = document.querySelector('.positions-section');
        if (positionsSection) {
            positionsSection.style.display = 'block';
        }

        showLoading(false);
    } catch (err) {
        console.error('Error displaying tournament:', err);
        showError();
        showLoading(false);
    }
}

function displayPodium(topFour) {
    const positions = [
        { id: 'firstPlace', placement: 1 },
        { id: 'secondPlace', placement: 2 },
        { id: 'thirdPlace', placement: 3 },
        { id: 'fourthPlace', placement: 4 }
    ];

    positions.forEach((pos) => {
        const card = document.getElementById(pos.id);
        const entry = topFour.find((e) => e.placement === pos.placement);

        if (entry) {
            const img = card.querySelector('.deck-card-image');
            const deckNameEl = card.querySelector('.deck-name');
            const playerNameEl = card.querySelector('.player-name');

            let imageUrl = entry.image_url;

            if (!imageUrl) {
                imageUrl = `https://via.placeholder.com/200x200/667eea/ffffff?text=${encodeURIComponent(entry.deck.substring(0, 10))}`;
            }

            img.src = imageUrl;
            img.alt = entry.deck;

            img.onerror = () => {
                img.src = `https://via.placeholder.com/200x200/667eea/ffffff?text=${encodeURIComponent(entry.deck.substring(0, 10))}`;
            };

            deckNameEl.textContent = entry.deck;

            if (entry.player) {
                playerNameEl.textContent = entry.player;
                playerNameEl.style.display = 'block';
            } else {
                playerNameEl.style.display = 'none';
            }

            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function displayPositions(results) {
    const container = document.getElementById('positionsList');
    container.innerHTML = '';

    results.forEach((entry) => {
        const div = document.createElement('div');
        div.className = 'position-item';

        if (entry.placement <= 4) {
            div.classList.add(`top-${entry.placement}`);
        }

        div.innerHTML = `
            <div class="position-rank">${entry.placement}º</div>
            <div class="position-content">
                <div class="position-deck">${entry.deck}</div>
                ${entry.player ? `<div class="position-player">${entry.player}</div>` : ''}
            </div>
        `;

        container.appendChild(div);
    });
}

function clearDisplay() {
    document.getElementById('totalPlayers').textContent = '-';

    ['firstPlace', 'secondPlace', 'thirdPlace', 'fourthPlace'].forEach((id) => {
        const card = document.getElementById(id);
        if (card) {
            const img = card.querySelector('.deck-card-image');
            const deckName = card.querySelector('.deck-name');
            const playerName = card.querySelector('.player-name');

            img.src = '';
            img.alt = '';
            deckName.textContent = '-';
            if (playerName) playerName.textContent = '';
            card.style.display = 'none';
        }
    });

    document.getElementById('positionsList').innerHTML = '';

    // Ocultar secao de resultados completos quando nÃ£o hÃ¡ dados
    const positionsSection = document.querySelector('.positions-section');
    if (positionsSection) {
        positionsSection.style.display = 'none';
    }

    const generateSection = document.getElementById('generatePostSection');
    if (generateSection) {
        generateSection.style.display = 'block';
    }
    const generatePostBtn = document.getElementById('generatePostBtn');
    if (generatePostBtn) {
        generatePostBtn.disabled = true;
    }
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.querySelector('.container').style.opacity = show ? '0.5' : '1';
}

function showError() {
    document.getElementById('errorMessage').style.display = 'block';
}

let toastTimeoutId = null;
function showPostToast(message) {
    const toast = document.getElementById('postToast');
    if (!toast || !message) return;
    toast.textContent = String(message);
    toast.classList.remove('u-hidden');
    if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
    }
    toastTimeoutId = setTimeout(() => {
        toast.classList.add('u-hidden');
    }, 2200);
}

function setupModalActionButtons() {
    const generatePostBtn = document.getElementById('generatePostBtn');
    const btnPostModalCloseTop = document.getElementById('btnPostModalCloseTop');
    const btnPostDownload = document.getElementById('btnPostDownload');
    const btnPostModalCloseBottom = document.getElementById('btnPostModalCloseBottom');
    const btnPostTemplateEdit = document.getElementById('btnPostTemplateEdit');
    const btnPostTemplateReset = document.getElementById('btnPostTemplateReset');
    const btnSavePreset = document.getElementById('btnSavePreset');
    const btnLoadPreset = document.getElementById('btnLoadPreset');
    const btnDeletePreset = document.getElementById('btnDeletePreset');
    const btnPieEditorToggle = document.getElementById('btnPieEditorToggle');
    const postCanvas = document.getElementById('postCanvas');

    if (generatePostBtn) {
        generatePostBtn.addEventListener('click', onGeneratePostAction);
    }
    if (btnPostModalCloseTop) {
        btnPostModalCloseTop.addEventListener('click', closePostPreview);
    }
    if (btnPostDownload) {
        btnPostDownload.title = 'Download (Ctrl/Cmd+S)';
        btnPostDownload.addEventListener('click', downloadPost);
    }
    if (btnPostModalCloseBottom) {
        btnPostModalCloseBottom.addEventListener('click', closePostPreview);
    }
    if (btnPostTemplateEdit) {
        btnPostTemplateEdit.addEventListener('click', onPostTemplateEditAction);
    }
    if (btnPostTemplateReset) {
        btnPostTemplateReset.addEventListener('click', resetPostTemplateLayout);
    }
    if (btnSavePreset) {
        btnSavePreset.addEventListener('click', saveLayoutPreset);
    }
    if (btnLoadPreset) {
        btnLoadPreset.addEventListener('click', loadSelectedLayoutPreset);
    }
    if (btnDeletePreset) {
        btnDeletePreset.addEventListener('click', deleteSelectedLayoutPreset);
    }
    if (btnPieEditorToggle) {
        btnPieEditorToggle.addEventListener('click', () => {
            setPieEditorActive(!isPieEditorActive);
        });
    }
    if (postCanvas) {
        postCanvas.addEventListener('pointerdown', onDistributionPiePointerDown);
        postCanvas.addEventListener('wheel', onDistributionPieWheel, { passive: false });
    }
    window.addEventListener('resize', () => {
        if (isPostTemplateEditorActive) {
            renderTemplateEditorOverlay();
        }
    });
    window.addEventListener('keydown', (event) => {
        const isSave = (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's';
        if (!isSave) return;
        const modal = document.getElementById('postPreviewModal');
        const modalVisible = modal && !modal.classList.contains('u-hidden');
        if (!modalVisible && !isPostPreviewPage() && !isTemplateEditorPage()) return;
        event.preventDefault();
        downloadPost();
    });
}

function setupPresetControls() {
    const select = document.getElementById('templatePresetSelect');
    if (!select) return;
    select.addEventListener('dblclick', loadSelectedLayoutPreset);
    refreshPresetOptions('Instagram');
}

function getUserLayoutPresetsMap() {
    try {
        const raw = localStorage.getItem(POST_PRESETS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch (_) {
        return {};
    }
}

function getLayoutPresetsMap() {
    return {
        ...BUILT_IN_PRESETS,
        ...getUserLayoutPresetsMap()
    };
}

function saveLayoutPresetsMap(map) {
    try {
        const userOnly = {};
        Object.entries(map || {}).forEach(([name, preset]) => {
            if (preset?.builtIn) return;
            userOnly[name] = preset;
        });
        localStorage.setItem(POST_PRESETS_STORAGE_KEY, JSON.stringify(userOnly));
    } catch (_) {
        // Ignore storage failures.
    }
}

function refreshPresetOptions(selectedName = '') {
    const select = document.getElementById('templatePresetSelect');
    if (!select) return;

    const presets = getLayoutPresetsMap();
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="">Select preset...</option>';
    names.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    if (selectedName && names.includes(selectedName)) {
        select.value = selectedName;
    }
}

function saveLayoutPreset() {
    const name = window.prompt('Preset name (checkpoint):');
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    const presets = getLayoutPresetsMap();
    presets[cleanName] = {
        layout: JSON.parse(JSON.stringify(postLayout)),
        pieStateSnapshot: JSON.parse(
            JSON.stringify(getCombinedDistributionPieState(tournamentDataForCanvas))
        ),
        updatedAt: new Date().toISOString()
    };
    saveLayoutPresetsMap(presets);
    refreshPresetOptions(cleanName);
    showPostToast(`Preset "${cleanName}" saved.`);
}

function loadSelectedLayoutPreset() {
    const select = document.getElementById('templatePresetSelect');
    if (!select || !select.value) return;
    const presets = getLayoutPresetsMap();
    const preset = presets[select.value];
    if (!preset?.layout) return;

    postLayout = mergePostLayout(getDefaultPostLayout(), preset.layout);
    if (preset?.pieStateSnapshot && typeof preset.pieStateSnapshot === 'object') {
        distributionPieStateOverride = JSON.parse(JSON.stringify(preset.pieStateSnapshot));
        saveDistributionPieStateForPost(tournamentDataForCanvas);
    }
    savePostLayout();
    syncTypographyControls();
    syncPodiumGapControl();
    syncTemplateObjectSelect();
    refreshDistributionPieControls();
    drawPostCanvas();
    showPostToast(`Preset "${select.value}" loaded.`);
}

function deleteSelectedLayoutPreset() {
    const select = document.getElementById('templatePresetSelect');
    if (!select || !select.value) return;
    const name = select.value;
    const presets = getLayoutPresetsMap();
    if (presets[name]?.builtIn) {
        alert('Built-in preset cannot be deleted.');
        return;
    }
    const confirmed = window.confirm(`Delete preset "${name}"?`);
    if (!confirmed) return;

    delete presets[name];
    saveLayoutPresetsMap(presets);
    refreshPresetOptions('Instagram');
    showPostToast(`Preset "${name}" deleted.`);
}

function onGeneratePostAction() {
    if (isTemplateEditorPage() || isPostPreviewPage()) {
        openPostPreview();
        return;
    }
    openPostPreviewTab();
}

function setupTypographyControls() {
    const controls = [
        { id: 'fontSizeTournamentTitle', key: 'titleSize' },
        { id: 'fontSizeTournamentDate', key: 'dateSize' },
        { id: 'fontSizePlayerName', key: 'playerSize' },
        { id: 'fontSizeDeckName', key: 'deckSize' },
        { id: 'fontSizeHandle', key: 'handleSize' }
    ];

    controls.forEach((control) => {
        const input = document.getElementById(control.id);
        if (!input) return;
        input.addEventListener('input', () => {
            const value = Number(input.value);
            if (!Number.isFinite(value) || value <= 0) return;
            postLayout.typography[control.key] = value;
            savePostLayout();
            drawPostCanvas();
        });
    });

    syncTypographyControls();
}

function setupPodiumGapControl() {
    const input = document.getElementById('podiumGapInput');
    if (!input) return;
    input.addEventListener('input', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0) return;
        setActiveObjectGap(value);
        savePostLayout();
        drawPostCanvas();
    });
    syncPodiumGapControl();
}

function syncPodiumGapControl() {
    const input = document.getElementById('podiumGapInput');
    if (!input) return;
    const value = getActiveObjectGap();
    if (value === null) {
        input.value = '';
        input.disabled = true;
        return;
    }
    input.disabled = false;
    input.value = String(value);
}

function setupTemplateObjectControls() {
    const select = document.getElementById('templateObjectSelect');
    if (!select) return;
    select.addEventListener('change', () => {
        const nextValue = select.value;
        if (nextValue === activeTemplateHandleKey) return;
        activeTemplateHandleKey = nextValue;
        syncPodiumGapControl();
        renderTemplateEditorOverlay();
    });
    syncTemplateObjectSelect();
}

function syncTemplateObjectSelect() {
    const select = document.getElementById('templateObjectSelect');
    if (!select) return;
    const allowedKeys = getAvailableTemplateObjectKeys();
    [...select.options].forEach((option) => {
        option.hidden = !allowedKeys.includes(option.value);
    });
    if (!allowedKeys.includes(activeTemplateHandleKey)) {
        activeTemplateHandleKey = allowedKeys[0] || 'title';
    }
    select.value = activeTemplateHandleKey;
    syncPodiumGapControl();
}

function getAvailableTemplateObjectKeys() {
    const shared = ['logo', 'title', 'store', 'handle'];
    if (selectedPostType === 'distribution_results') {
        return [...shared, 'distDeckCard', 'distPie'];
    }
    if (selectedPostType === 'blank_middle') {
        return shared;
    }
    return [...shared, 'rows', 'trophy', 'podiumNumber', 'avatar', 'rowText'];
}

function setupTemplateKeyboardControls() {
    window.addEventListener('keydown', (event) => {
        if (!isPostTemplateEditorActive) return;
        if (!document.getElementById('postPreviewModal') || document.getElementById('postPreviewModal').classList.contains('u-hidden')) return;
        if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

        const moveStep = event.shiftKey ? 10 : 2;
        const resizeStep = event.shiftKey ? 10 : 4;
        const gapStep = event.shiftKey ? 8 : 2;
        let handled = true;

        const key = String(event.key || '').toLowerCase();
        if (key === 'a') nudgeTemplateHandle(activeTemplateHandleKey, -moveStep, 0);
        else if (key === 'd') nudgeTemplateHandle(activeTemplateHandleKey, moveStep, 0);
        else if (key === 'w') nudgeTemplateHandle(activeTemplateHandleKey, 0, -moveStep);
        else if (key === 's') nudgeTemplateHandle(activeTemplateHandleKey, 0, moveStep);
        else if (key === 'q') adjustPodiumGap(-gapStep);
        else if (key === 'e') adjustPodiumGap(gapStep);
        else if (event.key === '>' || event.key === '.') resizeTemplateHandle(activeTemplateHandleKey, resizeStep);
        else if (event.key === '<' || event.key === ',') resizeTemplateHandle(activeTemplateHandleKey, -resizeStep);
        else handled = false;

        if (handled) {
            event.preventDefault();
            savePostLayout();
            drawPostCanvas();
        }
    });
}

function onPostTemplateEditAction() {
    if (isTemplateEditorPage()) {
        togglePostTemplateEditor();
        return;
    }
    openTemplateEditorTab();
}

function isTemplateEditorPage() {
    return new URLSearchParams(window.location.search).get('templateEditor') === '1';
}

function isPostPreviewPage() {
    return new URLSearchParams(window.location.search).get('postPreview') === '1';
}

function openTemplateEditorTab() {
    if (!tournamentDataForCanvas) {
        alert('Load a tournament first.');
        return;
    }
    try {
        localStorage.setItem(
            TEMPLATE_EDITOR_STATE_KEY,
            JSON.stringify({
                tournamentDataForCanvas,
                selectedBackgroundPath,
                selectedPostType
            })
        );
    } catch (_) {
        // Ignore storage write failures.
    }
    window.open('./index.html?templateEditor=1', '_blank');
}

function openPostPreviewTab() {
    if (!tournamentDataForCanvas) {
        alert('Load a tournament first.');
        return;
    }
    try {
        localStorage.setItem(
            POST_PREVIEW_STATE_KEY,
            JSON.stringify({
                tournamentDataForCanvas,
                selectedBackgroundPath,
                selectedPostType
            })
        );
    } catch (_) {
        // Ignore storage write failures.
    }
    window.open('./index.html?postPreview=1', '_blank');
}

function notifyTemplateEditorUpdated() {
    try {
        localStorage.setItem(TEMPLATE_EDITOR_UPDATED_KEY, String(Date.now()));
    } catch (_) {
        // Ignore storage failures.
    }

    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'template-editor-updated' }, window.location.origin);
        }
    } catch (_) {
        // Ignore opener failures.
    }
}

function setupTemplateSyncListeners() {
    const refreshPreviewFromStorage = () => {
        postLayout = loadPostLayout();
        syncTypographyControls();
        syncPodiumGapControl();
        syncTemplateObjectSelect();

        const modal = document.getElementById('postPreviewModal');
        const isPreviewOpen = modal && !modal.classList.contains('u-hidden');
        if (isPreviewOpen && tournamentDataForCanvas) {
            drawPostCanvas();
        }
    };

    window.addEventListener('storage', (event) => {
        if (event.key === POST_LAYOUT_STORAGE_KEY || event.key === TEMPLATE_EDITOR_UPDATED_KEY) {
            refreshPreviewFromStorage();
        }
    });

    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'template-editor-updated') {
            refreshPreviewFromStorage();
        }
    });

    window.addEventListener('focus', () => {
        refreshPreviewFromStorage();
    });
}

async function bootTemplateEditorPageIfNeeded() {
    if (!isTemplateEditorPage()) return;
    enableDedicatedTemplateEditorLayout();
    try {
        const raw = localStorage.getItem(TEMPLATE_EDITOR_STATE_KEY);
        if (!raw) {
            alert('No template session found. Load a tournament first.');
            window.location.href = './index.html';
            return;
        }
        const state = JSON.parse(raw);
        const hasSavedBg = Boolean(state?.selectedBackgroundPath);
        if (hasSavedBg) {
            selectedBackgroundPath = state.selectedBackgroundPath;
            await initializeBackgroundSelector(selectedBackgroundPath);
        }
        if (POST_TYPE_OPTIONS.includes(state?.selectedPostType)) {
            selectedPostType = state.selectedPostType;
            syncPostTypeSelector();
            saveSelectedPostType();
        }
        if (state?.tournamentDataForCanvas) {
            setTournamentDataForCanvas(state.tournamentDataForCanvas);
            openPostPreview().then(async () => {
                setPostTemplateEditorActive(true);
                syncTemplateObjectSelect();
                renderTemplateEditorOverlay();
                const closeBottom = document.getElementById('btnPostModalCloseBottom');
                if (closeBottom) closeBottom.textContent = 'Close Editor';
                if (!hasSavedBg) {
                    await syncBackgroundWithTournamentFormat(state.tournamentDataForCanvas);
                }
            });
        } else {
            alert('No tournament loaded for template editor.');
            window.location.href = './index.html';
        }
    } catch (_) {
        alert('Invalid template session.');
        window.location.href = './index.html';
    }
}

async function bootPostPreviewPageIfNeeded() {
    if (isTemplateEditorPage() || !isPostPreviewPage()) return;
    enableDedicatedPostPreviewLayout();
    try {
        const stateFromUrl = getPostPreviewStateFromUrl();
        const raw = localStorage.getItem(POST_PREVIEW_STATE_KEY);
        const state = stateFromUrl || (raw ? JSON.parse(raw) : null);
        if (!state) {
            alert('No preview session found. Load a tournament first.');
            window.location.href = './index.html';
            return;
        }
        const hasSavedBg = Boolean(state?.selectedBackgroundPath);
        if (hasSavedBg) {
            selectedBackgroundPath = state.selectedBackgroundPath;
            await initializeBackgroundSelector(selectedBackgroundPath);
        }
        if (POST_TYPE_OPTIONS.includes(state?.selectedPostType)) {
            selectedPostType = state.selectedPostType;
            syncPostTypeSelector();
            saveSelectedPostType();
        }
        if (state?.tournamentDataForCanvas) {
            setTournamentDataForCanvas(state.tournamentDataForCanvas);
            openPostPreview().then(async () => {
                setPostTemplateEditorActive(false);
                const closeBottom = document.getElementById('btnPostModalCloseBottom');
                if (closeBottom) closeBottom.textContent = 'Close Preview';
                if (!hasSavedBg) {
                    await syncBackgroundWithTournamentFormat(state.tournamentDataForCanvas);
                }
            });
        } else {
            alert('No tournament loaded for preview.');
            window.location.href = './index.html';
        }
    } catch (_) {
        alert('Invalid preview session.');
        window.location.href = './index.html';
    }
}

function getPostPreviewStateFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('previewData');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function enableDedicatedTemplateEditorLayout() {
    document.body.classList.add('template-editor-page');
    const title = document.querySelector('#postPreviewModal .modal-header h2');
    if (title) {
        title.textContent = 'Post Preview';
    }
    const subtitle = document.querySelector('#postPreviewModal .preview-title-wrap small');
    if (subtitle) {
        subtitle.textContent = 'Preview and export';
    }
}

function enableDedicatedPostPreviewLayout() {
    document.body.classList.add('template-preview-page');
    const title = document.querySelector('#postPreviewModal .modal-header h2');
    if (title) {
        title.textContent = 'Post Preview';
    }
}

function syncTypographyControls() {
    const map = {
        fontSizeTournamentTitle: postLayout.typography.titleSize,
        fontSizeTournamentDate: postLayout.typography.dateSize,
        fontSizePlayerName: postLayout.typography.playerSize,
        fontSizeDeckName: postLayout.typography.deckSize,
        fontSizeHandle: postLayout.typography.handleSize
    };

    Object.entries(map).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = String(value);
    });
}

function getActiveObjectGap() {
    switch (activeTemplateHandleKey) {
        case 'rows':
            return postLayout.rowBorder.rowGap;
        case 'trophy':
        case 'podiumNumber':
            return postLayout.rowElements.trophy.gap;
        case 'avatar':
            return postLayout.rowElements.avatar.gap;
        case 'rowText':
            return postLayout.rowElements.text.gap;
        default:
            return null;
    }
}

function setActiveObjectGap(value) {
    const gap = Math.max(0, Math.round(value));
    switch (activeTemplateHandleKey) {
        case 'rows':
            postLayout.rowBorder.rowGap = gap;
            break;
        case 'trophy':
        case 'podiumNumber':
            postLayout.rowElements.trophy.gap = gap;
            break;
        case 'avatar':
            postLayout.rowElements.avatar.gap = gap;
            break;
        case 'rowText':
            postLayout.rowElements.text.gap = gap;
            break;
        default:
            return;
    }
    syncPodiumGapControl();
}

function adjustPodiumGap(delta) {
    const current = getActiveObjectGap();
    if (current === null) return;
    setActiveObjectGap(current + delta);
}

function setTournamentDataForCanvas(data) {
    tournamentDataForCanvas = data || null;
    firstPlaceDecklistAvailable = null;
    void refreshDecklistPostAvailability(tournamentDataForCanvas);
    distributionPieStateOverride = {};
    activeDistributionPieDeck = '';
    setPieEditorActive(false);
    syncPostTypeSelector();
    updateTemplateControlsVisibility();
    refreshDistributionPieControls();
    updatePostPreviewMeta();
    const generatePostBtn = document.getElementById('generatePostBtn');
    if (generatePostBtn) {
        generatePostBtn.disabled = !tournamentDataForCanvas;
    }
    updateTemplateEditorButtons();
    if (tournamentDataForCanvas) {
        void syncBackgroundWithTournamentFormat(tournamentDataForCanvas);
    }
}

function closePostPreview() {
    if (isTemplateEditorPage() || isPostPreviewPage()) {
        notifyTemplateEditorUpdated();
        window.close();
        window.location.href = './index.html';
        return;
    }
    const modal = document.getElementById('postPreviewModal');
    if (!modal) return;
    setPostTemplateEditorActive(false);
    modal.classList.add('u-hidden');
}

async function openPostPreview() {
    if (!tournamentDataForCanvas) {
        alert('Load a tournament first.');
        return;
    }

    await drawPostCanvas();
    const modal = document.getElementById('postPreviewModal');
    if (modal) {
        modal.classList.remove('u-hidden');
    }
    syncTypographyControls();
    syncPodiumGapControl();
    syncPostPreviewZoomSelector();
    applyPostPreviewZoom();
    refreshDistributionPieControls();
    updateTemplateEditorButtons();
    if (isPostTemplateEditorActive) {
        renderTemplateEditorOverlay();
    }
}

function downloadPost() {
    const canvas = document.getElementById('postCanvas');
    if (!canvas || !tournamentDataForCanvas) return;

    const safeStore = String(tournamentDataForCanvas.storeName || 'store')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const safeDate = String(tournamentDataForCanvas.dateStr || 'date').replace(/[\/\s]+/g, '-');

    const link = document.createElement('a');
    link.download = `digistats-${safeStore}-${safeDate}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

async function drawPostCanvas() {
    const canvas = document.getElementById('postCanvas');
    if (!canvas || !tournamentDataForCanvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const layout = postLayout;
    ctx.clearRect(0, 0, width, height);

    if (selectedBackgroundPath) {
        const customBg = await loadImage(selectedBackgroundPath);
        if (customBg) {
            drawImageCover(ctx, customBg, 0, 0, width, height);
        } else {
            const bg = ctx.createLinearGradient(0, 0, width, height);
            bg.addColorStop(0, '#2f3a7a');
            bg.addColorStop(1, '#6f47c7');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, '#2f3a7a');
        bg.addColorStop(1, '#6f47c7');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(9, 23, 51, 0.24)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    drawRoundedRect(ctx, 56, 72, width - 112, height - 120, 36, 'rgba(248,250,255,0.94)');
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    const logo = await loadFirstAvailableImage(TOP_LEFT_LOGO_CANDIDATES);
    if (logo) {
        const logoPaddingX = Math.round(layout.logo.w * 0.1);
        const logoPaddingY = Math.round(layout.logo.h * 0.12);
        const logoShiftLeft = 74;
        drawImageContain(
            ctx,
            logo,
            Math.max(0, layout.logo.x + logoPaddingX - logoShiftLeft),
            layout.logo.y + logoPaddingY,
            layout.logo.w - logoPaddingX * 2,
            layout.logo.h - logoPaddingY * 2
        );
    }

    const titleBoxX = layout.title.x;
    const titleBoxY = layout.title.y;
    const titleBoxW = layout.title.w;
    const titleBoxH = layout.title.h;
    const titleCenterX = titleBoxX + titleBoxW / 2;
    // No container padding for title/date: text is placed directly from layout bounds.
    const tournamentTitle = String(
        tournamentDataForCanvas.tournamentName || 'SEMANAL'
    ).toUpperCase();
    ctx.fillStyle = '#184fae';
    let titleFontSize = postLayout.typography.titleSize;
    const titleMaxWidth = Math.max(160, titleBoxW - 16);
    ctx.font = `italic 900 ${titleFontSize}px "Barlow Condensed", "Segoe UI", sans-serif`;
    while (ctx.measureText(tournamentTitle).width > titleMaxWidth && titleFontSize > 38) {
        titleFontSize -= 2;
        ctx.font = `italic 900 ${titleFontSize}px "Barlow Condensed", "Segoe UI", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    const titleY = titleBoxY + layout.title.titleOffsetY;
    ctx.strokeText(tournamentTitle, titleCenterX, titleY);
    ctx.fillText(tournamentTitle, titleCenterX, titleY);

    ctx.fillStyle = '#425678';
    const dateLabel = tournamentDataForCanvas.dateStr || '--/--/--';
    let dateFontSize = postLayout.typography.dateSize;
    ctx.font = `700 ${dateFontSize}px "Barlow Condensed", "Segoe UI", sans-serif`;
    while (ctx.measureText(dateLabel).width > layout.title.dateMaxWidth && dateFontSize > 58) {
        dateFontSize -= 2;
        ctx.font = `700 ${dateFontSize}px "Barlow Condensed", "Segoe UI", sans-serif`;
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    const dateY = titleBoxY + layout.title.dateOffsetY;
    ctx.fillText(dateLabel, titleCenterX, dateY);

    if (selectedPostType === 'distribution_results') {
        await drawDistributionAndResultsContent(ctx, width, height, tournamentDataForCanvas, layout);
    } else if (selectedPostType === 'blank_middle') {
        lastDistributionPieRenderState = null;
        await drawBlankMiddleContent(ctx, width, height, layout);
    } else {
        lastDistributionPieRenderState = null;
        const rows = (tournamentDataForCanvas.topFour || []).slice(0, 4);
        const trophyAsset = await loadFirstAvailableAsset(TROPHY_ICON_CANDIDATES);
        const startY = layout.rows.startY;
        const rowHeight = layout.rows.rowHeight;
        const rowGap = layout.rows.rowGap;
        const borderStartY = layout.rowBorder.startY;
        const borderRowHeight = layout.rowBorder.rowHeight;
        const borderRowGap = layout.rowBorder.rowGap;
        const trophyGap = layout.rowElements.trophy.gap ?? rowGap;
        const avatarGap = layout.rowElements.avatar.gap ?? rowGap;
        const textGap = layout.rowElements.text.gap ?? rowGap;
        for (let i = 0; i < 4; i += 1) {
            const y = startY + i * (rowHeight + rowGap);
            const borderY = borderStartY + i * (borderRowHeight + borderRowGap);
            const trophyY = startY + i * (rowHeight + trophyGap);
            const avatarY = startY + i * (rowHeight + avatarGap);
            const textY = startY + i * (rowHeight + textGap);
            await drawPlacementRow(
                ctx,
                i + 1,
                y,
                borderY,
                trophyY,
                avatarY,
                textY,
                rowHeight,
                borderRowHeight,
                rows[i] || null,
                trophyAsset,
                layout.rows,
                layout.rowBorder
            );
        }
    }

    ctx.textBaseline = 'alphabetic';
    const storeBoxX = layout.store.x;
    const storeBoxY = layout.store.y;
    const storeBoxW = layout.store.w;
    const storeBoxH = layout.store.h;
    drawStoreBadge(ctx, storeBoxX, storeBoxY, storeBoxW, storeBoxH, '#102d58');
    const storeIconPath = resolveStoreIconPath(tournamentDataForCanvas.storeName || '');
    const storeIcon = await loadImage(storeIconPath);
    if (storeIcon) {
        const storePaddingX = 36;
        const storePaddingY = 18;
        drawImageContain(
            ctx,
            storeIcon,
            storeBoxX + storePaddingX,
            storeBoxY + storePaddingY,
            storeBoxW - storePaddingX * 2,
            storeBoxH - storePaddingY * 2
        );
    }

    ctx.fillStyle = '#102d58';
    ctx.font = `bold ${postLayout.typography.handleSize}px Segoe UI`;
    ctx.textAlign = 'right';
    ctx.fillText('@digimoncwb', layout.handle.x, layout.handle.y);

    if (isPostTemplateEditorActive) {
        renderTemplateEditorOverlay();
    }
}

async function drawPlacementRow(
    ctx,
    placement,
    y,
    borderY,
    trophyY,
    avatarYBase,
    textYBase,
    rowHeight,
    borderRowHeight,
    entry,
    trophyAsset,
    rowLayout,
    rowBorderLayout
) {
    const style = PLACEMENT_STYLES[placement] || PLACEMENT_STYLES[4];
    const rowElements = postLayout.rowElements;

    const borderRowX = rowBorderLayout.x;
    const borderRowW = rowBorderLayout.w;
    const borderGradient = ctx.createLinearGradient(
        borderRowX,
        borderY,
        borderRowX + borderRowW,
        borderY + borderRowHeight
    );
    borderGradient.addColorStop(0, style.medal);
    borderGradient.addColorStop(0.45, style.border);
    borderGradient.addColorStop(1, style.dark || style.border);
    ctx.save();
    ctx.shadowColor = placement === 1 ? 'rgba(153,110,28,0.16)' : 'rgba(18,40,72,0.09)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    drawRoundedRect(
        ctx,
        borderRowX,
        borderY,
        borderRowW,
        borderRowHeight,
        26,
        placement === 1 ? '#fffcf3' : '#ffffff',
        borderGradient,
        3
    );
    ctx.restore();

    const rowX = rowLayout.x;
    const rowW = rowLayout.w;

    await drawTrophyBadge(
        ctx,
        rowX + rowElements.trophy.x,
        trophyY + rowElements.trophy.y,
        placement,
        style.border,
        trophyAsset,
        rowElements
    );

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#43516b';
    ctx.textAlign = 'center';
    const playerText = String(entry?.player || 'PLAYER').toUpperCase();
    const avatarX = rowX + rowW - rowElements.avatar.xFromRight;
    const textAreaLeft = rowX + rowElements.text.leftPadding;
    const textAreaRight = avatarX - rowElements.text.rightPadding;
    const textCenterX = textAreaLeft + (textAreaRight - textAreaLeft) / 2;
    const textMaxWidth = Math.max(40, textAreaRight - textAreaLeft - 16);
    fitPostText(ctx, playerText, postLayout.typography.playerSize, textMaxWidth, '700');
    ctx.fillText(playerText, textCenterX, textYBase + rowElements.text.playerY, textMaxWidth);

    const deckText = String(entry?.deck || 'DECK').toUpperCase();
    const deckCenterX = textCenterX;
    fitPostText(ctx, deckText, postLayout.typography.deckSize, textMaxWidth, '800');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#123b78';
    ctx.fillText(deckText, deckCenterX, textYBase + rowElements.text.deckY, textMaxWidth);

    const avatarY = avatarYBase + rowHeight / 2 + rowElements.avatar.yOffset;
    const avatarOuterRadius = rowElements.avatar.outerRadius;
    const avatarImageRadius = Math.max(
        rowElements.avatar.imageRadius,
        avatarOuterRadius - rowElements.avatar.borderRingWidth / 2
    );
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarOuterRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const _avatarCode = String(entry?.image_url || '').match(/([A-Z]{1,3}\d{0,2}-\d{1,3})\.(?:webp|jpg|png)/i)?.[1]?.toUpperCase();
    const image = _avatarCode
        ? await loadDeckCardImage(_avatarCode)
        : (entry?.image_url ? await loadImage(entry.image_url) : null);
    if (image) {
        drawImageCoverInCircle(ctx, image, avatarX, avatarY, avatarImageRadius);
    }

    const ringGradient = ctx.createLinearGradient(
        avatarX - avatarOuterRadius,
        avatarY - avatarOuterRadius,
        avatarX + avatarOuterRadius,
        avatarY + avatarOuterRadius
    );
    ringGradient.addColorStop(0, '#ffffff');
    ringGradient.addColorStop(0.5, style.border);
    ringGradient.addColorStop(1, style.dark || style.border);
    ctx.lineWidth = rowElements.avatar.borderRingWidth;
    ctx.strokeStyle = ringGradient;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarOuterRadius - 2, 0, Math.PI * 2);
    ctx.stroke();
}

function fitPostText(ctx, text, preferredSize, maxWidth, weight, minimum = 28) {
    let size = preferredSize;
    const minimumSize = Math.min(preferredSize, minimum);
    const setFont = () => {
        ctx.font = `${weight} ${size}px "Barlow Condensed", "Segoe UI", sans-serif`;
    };
    setFont();
    while (ctx.measureText(text).width > maxWidth && size > minimumSize) {
        size = Math.max(minimumSize, size - 2);
        setFont();
    }
    return size;
}

async function drawTrophyBadge(ctx, centerX, centerY, placement, color, trophyAsset, rowElements) {
    const trophyScale = 1.18;
    const trophyW = Math.round(rowElements.trophy.w * trophyScale);
    const trophyH = Math.round(rowElements.trophy.h * trophyScale);
    const numberOffsetX = rowElements.podiumNumber.offsetX;
    const numberOffsetY = rowElements.podiumNumber.offsetY;
    const numberSize = rowElements.podiumNumber.size;
    const style = PLACEMENT_STYLES[placement] || PLACEMENT_STYLES[4];
    function drawAssetWithMetallicGradient(assetImage) {
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(1, Math.round(trophyW));
        offscreen.height = Math.max(1, Math.round(trophyH));
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) {
            drawImageContain(ctx, assetImage, drawX, drawY, trophyW, trophyH);
            return;
        }

        // Draw icon into isolated buffer first.
        drawImageContain(offCtx, assetImage, 0, 0, trophyW, trophyH);

        // Apply metallic gradient only where icon pixels exist.
        const medalGradient = offCtx.createLinearGradient(0, 0, trophyW, trophyH);
        medalGradient.addColorStop(0, '#fffef7');
        medalGradient.addColorStop(0.4, style.medal);
        medalGradient.addColorStop(1, style.dark || color);
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.fillStyle = medalGradient;
        offCtx.fillRect(0, 0, trophyW, trophyH);
        offCtx.globalCompositeOperation = 'source-over';

        ctx.drawImage(offscreen, drawX, drawY);
    }

    const drawX = centerX - trophyW / 2;
    const drawY = centerY - trophyH / 2;

    if (trophyAsset?.type === 'svg') {
        const tintedTrophyIcon = await loadTintedSvgIcon(trophyAsset.src, color);
        if (tintedTrophyIcon) {
            drawAssetWithMetallicGradient(tintedTrophyIcon);
        }
    } else if (trophyAsset?.image) {
        drawAssetWithMetallicGradient(trophyAsset.image);
    }

    if (trophyAsset) {
        const textGradient = ctx.createLinearGradient(
            centerX,
            centerY - trophyH / 2,
            centerX,
            centerY + trophyH / 2
        );
        textGradient.addColorStop(0, '#fffef7');
        textGradient.addColorStop(0.42, style.medal);
        textGradient.addColorStop(1, style.dark || color);
        ctx.fillStyle = textGradient;
        ctx.font = `700 ${numberSize}px "Barlow Condensed", "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        const placementLabel = formatPlacementLabel(placement);
        // The circle is centered at y=632 in the asset's 1012.5-high viewBox.
        // Treat saved offsets as adjustments relative to the legacy default.
        const medalCenterY = centerY + trophyH * (632 / 1012.5 - 0.5);
        const metrics = ctx.measureText(placementLabel);
        const textCenterOffset = ((metrics.actualBoundingBoxAscent ?? numberSize * 0.75) -
            (metrics.actualBoundingBoxDescent ?? numberSize * 0.15)) / 2;
        const labelY = medalCenterY + numberOffsetY - DEFAULT_POST_LAYOUT.rowElements.podiumNumber.offsetY + textCenterOffset;
        ctx.strokeText(placementLabel, centerX + numberOffsetX, labelY);
        ctx.fillStyle = style.dark || '#102d58';
        ctx.fillText(placementLabel, centerX + numberOffsetX, labelY);
        return;
    }

    const fallbackTextGradient = ctx.createLinearGradient(
        centerX,
        centerY - trophyH / 2,
        centerX,
        centerY + trophyH / 2
    );
    fallbackTextGradient.addColorStop(0, '#fffef7');
    fallbackTextGradient.addColorStop(0.42, style.medal);
    fallbackTextGradient.addColorStop(1, style.dark || color);
    ctx.fillStyle = fallbackTextGradient;
    ctx.font = `700 ${numberSize}px "Barlow Condensed", "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    const fallbackPlacementLabel = formatPlacementLabel(placement);
    ctx.strokeText(fallbackPlacementLabel, centerX + numberOffsetX, centerY + numberOffsetY);
    ctx.fillStyle = style.dark || '#102d58';
    ctx.fillText(fallbackPlacementLabel, centerX + numberOffsetX, centerY + numberOffsetY);
}

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke, strokeWidth) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.fill();

    if (stroke) {
        ctx.lineWidth = strokeWidth || 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
    }
}

function loadImage(src) {
    return new Promise((resolve) => {
        const resolvedSrc = new URL(src, window.location.href).href;
        const isHttpAsset = resolvedSrc.startsWith('http://') || resolvedSrc.startsWith('https://');

        if (!isHttpAsset) {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = resolvedSrc;
            return;
        }

        // Fetch as blob to bypass CORS cache-poisoning issues.
        // Public Supabase storage responds with Access-Control-Allow-Origin: *
        // so fetch() succeeds; the resulting blob URL is same-origin → no canvas taint.
        fetch(resolvedSrc)
            .then((res) => (res.ok ? res.blob() : null))
            .then((blob) => {
                if (!blob) { resolve(null); return; }
                const blobUrl = URL.createObjectURL(blob);
                const image = new Image();
                image._originalSrc = resolvedSrc;
                image.onload = () => { URL.revokeObjectURL(blobUrl); resolve(image); };
                image.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
                image.src = blobUrl;
            })
            .catch(() => resolve(null));
    });
}

function normalizeStoreName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function resolveStoreIconPath(storeName) {
    const normalized = normalizeStoreName(storeName);
    for (const [key, url] of storeLogoMap) {
        if (normalized.includes(key) || key.includes(normalized)) return url;
    }
    return '';
}

async function loadFirstAvailableImage(candidates) {
    for (const candidate of candidates) {
        const image = await loadImage(candidate);
        if (image) return image;
    }
    return null;
}

async function loadFirstAvailableAsset(candidates) {
    for (const candidate of candidates) {
        if (candidate.toLowerCase().endsWith('.svg')) {
            try {
                const response = await fetch(candidate, { cache: 'no-store' });
                if (response.ok) {
                    return { type: 'svg', src: new URL(candidate, window.location.href).href };
                }
            } catch (_) {
                // Keep trying next candidates.
            }

            const svgImage = await loadImage(candidate);
            if (svgImage) {
                return { type: 'image', image: svgImage };
            }
        }

        const image = await loadImage(candidate);
        if (image) {
            return { type: 'image', image };
        }
    }

    return null;
}

async function loadTintedSvgIcon(svgPath, color) {
    const cacheKey = `${svgPath}|${color.toLowerCase()}`;
    if (trophyTintedIconCache.has(cacheKey)) {
        return trophyTintedIconCache.get(cacheKey);
    }

    try {
        let svgTemplate = trophySvgTemplateCache.get(svgPath) || null;
        if (!svgTemplate) {
            const response = await fetch(svgPath, { cache: 'no-store' });
            if (!response.ok) return null;
            svgTemplate = await response.text();
            trophySvgTemplateCache.set(svgPath, svgTemplate);
        }

        const withoutOuterWhite = svgTemplate.replace(
            /<path\s+fill="#(?:fff|ffffff)"\s+d="M 0\.199219 0 L 809\.800781 0 L 809\.800781 1012 L 0\.199219 1012 Z M 0\.199219 0 "\s+fill-opacity="1"\s+fill-rule="nonzero"\/>/gi,
            ''
        );

        const tintedSvg = withoutOuterWhite.replace(new RegExp(TROPHY_SVG_BASE_COLOR, 'gi'), color);
        const svgBlob = new Blob([tintedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const blobUrl = URL.createObjectURL(svgBlob);
        const tintedIcon = await loadImage(blobUrl);
        URL.revokeObjectURL(blobUrl);

        if (tintedIcon) {
            trophyTintedIconCache.set(cacheKey, tintedIcon);
        }
        return tintedIcon;
    } catch (_) {
        return null;
    }
}

function drawImageCover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
}

function drawImageContain(ctx, image, x, y, width, height) {
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
}

function drawImageCoverInCircle(ctx, image, centerX, centerY, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    const size = radius * 2;
    // Match .card-image-wrapper feel: cover + extra zoom, anchored near top.
    const coverScale = Math.max(size / image.width, size / image.height);
    const isWebp = /\.webp(?:$|\?)/i.test(String(image._originalSrc || image.currentSrc || image.src || ''));
    const scale = coverScale * (isWebp ? 1.95 : 1.95);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = centerX - drawWidth / 2;
    const dy = centerY - drawHeight * (isWebp ? 0.25 : 0.11);
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
    ctx.restore();
}

function drawImageCoverInCircleWithPosition(
    ctx,
    image,
    centerX,
    centerY,
    radius,
    zoomPct = 120,
    xPct = 50,
    yPct = 11
) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    const size = radius * 2;
    const coverScale = Math.max(size / image.width, size / image.height);
    const scale = coverScale * Math.max(1, Number(zoomPct || 120) / 100);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const freeX = size - drawWidth;
    const freeY = size - drawHeight;
    const posX = Number.isFinite(Number(xPct)) ? Number(xPct) / 100 : 0.5;
    const posY = Number.isFinite(Number(yPct)) ? Number(yPct) / 100 : 0.11;
    const dx = centerX - radius + freeX * posX;
    const dy = centerY - radius + freeY * posY;
    ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
    ctx.restore();
}

function drawStoreBadge(ctx, x, y, w, h, color) {
    const r = 18;
    const notch = 14;
    ctx.beginPath();
    ctx.moveTo(x + r + notch, y);
    ctx.lineTo(x + w - r - notch, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r - notch, y + h);
    ctx.lineTo(x + r + notch, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r + notch, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function getDefaultPostLayout() {
    return JSON.parse(JSON.stringify(DEFAULT_POST_LAYOUT));
}

function loadPostLayout() {
    const fallback = getDefaultPostLayout();
    try {
        const raw = localStorage.getItem(POST_LAYOUT_STORAGE_KEY);
        if (!raw) return fallback;
        const saved = JSON.parse(raw);
        return mergePostLayout(fallback, saved);
    } catch (_) {
        return fallback;
    }
}

function savePostLayout() {
    try {
        localStorage.setItem(POST_LAYOUT_STORAGE_KEY, JSON.stringify(postLayout));
    } catch (_) {
        // Ignore storage errors in private modes.
    }
}

function mergePostLayout(base, override) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    Object.keys(override || {}).forEach((key) => {
        const baseValue = out[key];
        const overrideValue = override[key];
        if (
            baseValue &&
            overrideValue &&
            typeof baseValue === 'object' &&
            typeof overrideValue === 'object' &&
            !Array.isArray(baseValue) &&
            !Array.isArray(overrideValue)
        ) {
            out[key] = mergePostLayout(baseValue, overrideValue);
        } else {
            out[key] = overrideValue;
        }
    });
    return out;
}

function resetPostTemplateLayout() {
    postLayout = getDefaultPostLayout();
    savePostLayout();
    syncTypographyControls();
    syncPodiumGapControl();
    drawPostCanvas();
    if (isPostTemplateEditorActive) {
        renderTemplateEditorOverlay();
    }
}

function togglePostTemplateEditor() {
    if (!tournamentDataForCanvas) return;
    setPostTemplateEditorActive(!isPostTemplateEditorActive);
    if (isPostTemplateEditorActive) {
        renderTemplateEditorOverlay();
    }
}

function getDeckDistributionRows(results) {
    const map = new Map();
    (results || []).forEach((item) => {
        const deck = String(item?.deck || 'Unknown').trim() || 'Unknown';
        if (!map.has(deck)) {
            map.set(deck, {
                deck,
                count: 0,
                image_url: String(item?.image_url || '').trim()
            });
        }
        const current = map.get(deck);
        current.count += 1;
        if (!current.image_url && item?.image_url) {
            current.image_url = String(item.image_url).trim();
        }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.deck.localeCompare(b.deck));
}

function buildDeckPieDataForCanvas(results) {
    const grouped = new Map();
    (results || []).forEach((item) => {
        const key = String(item?.deck || 'Unknown Deck') || 'Unknown Deck';
        const placement = Number(item?.placement) || Number.MAX_SAFE_INTEGER;
        if (!grouped.has(key)) {
            grouped.set(key, {
                deck: key,
                image_url: String(item?.image_url || '').trim(),
                count: 0,
                firstPlacement: placement
            });
        }
        const current = grouped.get(key);
        current.count += 1;
        current.firstPlacement = Math.min(current.firstPlacement, placement);
        if (!current.image_url && item?.image_url) {
            current.image_url = String(item.image_url).trim();
        }
    });

    const entries = Array.from(grouped.values()).sort(
        (a, b) => a.firstPlacement - b.firstPlacement || a.deck.localeCompare(b.deck)
    );
    const total = entries.reduce((acc, item) => acc + item.count, 0) || 1;
    const colors = ['#ffd700', '#c0c0c0', '#cd7f32', '#268d7c', '#667eea', '#764ba2', '#2a9d8f', '#e76f51', '#8ab17d', '#3d5a80'];

    const fullStart = -Math.PI / 2;
    const fullEnd = fullStart + Math.PI * 2;
    let currentAngle = fullStart;
    return entries.map((entry, index) => {
        const ratio = entry.count / total;
        const sliceAngle = ratio * Math.PI * 2;
        const start = currentAngle;
        const isLast = index === entries.length - 1;
        const end = isLast ? fullEnd : currentAngle + sliceAngle;
        currentAngle = end;
        const zoomPct = 160;
        const xPct = 50;
        const yPct = 32;

        return {
            deck: entry.deck,
            count: entry.count,
            color: colors[index % colors.length],
            image_url: entry.image_url,
            start,
            end,
            zoomPct,
            xPct,
            yPct
        };
    });
}

function getPieStorageKey(tournamentId) {
    return `pieState:${tournamentId}`;
}

function getPostPieStorageKey(tournamentId) {
    return `postPieState:${tournamentId}`;
}

function getPieStateKeysForPostData(data) {
    const keys = [];
    const directKey = String(data?.pieStateKey || '').trim();
    const tournamentId = String(data?.tournamentId || '').trim();
    const storeId = String(data?.storeId || '').trim();
    const tournamentDate = String(data?.tournamentDate || '').trim();
    const fallbackComposite = storeId && tournamentDate ? `${storeId}-${tournamentDate}` : '';
    const normalizedStoreName = normalizeStoreName(String(data?.storeName || ''));
    const dateStr = String(data?.dateStr || '').trim();
    const fallbackByNameDate =
        normalizedStoreName && dateStr ? `name:${normalizedStoreName}|date:${dateStr}` : '';

    [directKey, tournamentId, fallbackComposite, fallbackByNameDate].forEach((key) => {
        if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
}

function loadSavedPieStateForPost(data) {
    const keys = getPieStateKeysForPostData(data);

    // Prefer post-specific state first so changes here don't break dashboard details pie.
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(getPostPieStorageKey(key));
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (_) {
            // Ignore invalid state and keep trying other keys.
        }
    }

    // Fallback to dashboard state for initial import.
    for (const key of keys) {
        try {
            const raw = localStorage.getItem(getPieStorageKey(key));
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (_) {
            // Ignore invalid state and keep trying other keys.
        }
    }
    return {};
}

function getMiddlePanelRect(layout, width, height) {
    const rowBaseY = Number(layout?.rows?.startY) || 280;
    const rowBaseH = Number(layout?.rows?.rowHeight) || 178;
    const rowBaseGap = Number(layout?.rows?.rowGap) || 24;
    const borderBaseY = Number(layout?.rowBorder?.startY) || rowBaseY;
    const borderBaseH = Number(layout?.rowBorder?.rowHeight) || rowBaseH;
    const borderBaseGap = Number(layout?.rowBorder?.rowGap) || rowBaseGap;
    const baseX = Math.min(Number(layout?.rows?.x) || 92, Number(layout?.rowBorder?.x) || 92);
    const baseW = Math.max(Number(layout?.rows?.w) || 896, Number(layout?.rowBorder?.w) || 896);

    const rowEnd = rowBaseY + rowBaseH * 4 + rowBaseGap * 3;
    const borderEnd = borderBaseY + borderBaseH * 4 + borderBaseGap * 3;
    const panelY = Math.max(220, Math.min(rowBaseY, borderBaseY) - 12);
    const panelH = Math.min(height - panelY - 210, Math.max(rowEnd, borderEnd) - panelY + 12);

    return {
        x: baseX,
        y: panelY,
        w: Math.min(baseW, width - baseX * 2),
        h: Math.max(420, panelH)
    };
}

function getDistributionGeometry(layout, width, height) {
    const panelRect = getMiddlePanelRect(layout, width, height);
    const dist = layout.distribution || {};
    const inset = Math.max(8, Number(dist.panel?.inset) || 16);
    const card = {
        x: panelRect.x + inset + (Number(dist.deckCard?.x) || 0),
        y: panelRect.y + inset + (Number(dist.deckCard?.y) || 0),
        w: panelRect.w - inset * 2,
        h: panelRect.h - inset * 2
    };
    const defaultRadius = Math.round(Math.min(card.w * 0.35, card.h * 0.3));
    return {
        panelRect, leftCard: card, rightCard: card,
        pie: {
            x: card.x + card.w / 2 + (Number(dist.pie?.x) || 0),
            y: card.y + 82 + defaultRadius + (Number(dist.pie?.y) || 0),
            radius: Math.max(64, Number(dist.pie?.radius) || defaultRadius)
        }
    };
}

function drawPieSliceImage(ctx, image, centerX, centerY, radius, row) {
    // Cover this sector's bounds, rather than cropping every image around the whole pie.
    const angles = [row.start, row.end];
    for (let angle = Math.ceil(row.start / (Math.PI / 2)) * (Math.PI / 2); angle < row.end; angle += Math.PI / 2) angles.push(angle);
    const xs = [centerX, ...angles.map((angle) => centerX + Math.cos(angle) * radius)];
    const ys = [centerY, ...angles.map((angle) => centerY + Math.sin(angle) * radius)];
    const x = Math.min(...xs), y = Math.min(...ys);
    const w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y);
    const scale = Math.max(w / image.width, h / image.height) * Math.max(1, row.zoomPct / 100);
    const drawW = image.width * scale, drawH = image.height * scale;
    ctx.drawImage(image, x + (w - drawW) * row.xPct / 100, y + (h - drawH) * row.yPct / 100, drawW, drawH);
}

async function drawDistributionAndResultsContent(ctx, width, height, data, layout) {
    const geometry = getDistributionGeometry(layout, width, height);
    const card = geometry.leftCard;
    const results = Array.isArray(data?.allResults) ? data.allResults : [];
    const savedPieState = getCombinedDistributionPieState(data);
    const pieRows = buildDeckPieDataForCanvas(results).map((row) => {
        const saved = savedPieState[row.deck];
        return saved ? {
            ...row,
            xPct: Number.isFinite(Number(saved.x)) ? Math.max(-300, Math.min(300, Number(saved.x))) : row.xPct,
            yPct: Number.isFinite(Number(saved.y)) ? Math.max(-300, Math.min(300, Number(saved.y))) : row.yPct,
            zoomPct: Number.isFinite(Number(saved.zoom)) ? Math.max(120, Math.min(420, Number(saved.zoom))) : row.zoomPct
        } : row;
    });
    const { x: centerX, y: centerY, radius } = geometry.pie;
    drawRoundedRect(ctx, card.x, card.y, card.w, card.h, 24, 'rgba(255,255,255,0.92)');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#102d58';
    ctx.font = '800 40px "Barlow Condensed", sans-serif';
    ctx.fillText('DISTRIBUIÇÃO DE DECKS', card.x + card.w / 2, card.y + 42);
    ctx.fillStyle = '#53647d';
    ctx.font = '500 23px "Segoe UI", sans-serif';
    ctx.fillText(results.length + ' participações · ' + pieRows.length + ' decks', card.x + card.w / 2, card.y + 72);
    lastDistributionPieRenderState = {
        centerX, centerY, radius,
        slices: pieRows.map((row) => ({ deck: row.deck, start: row.start, end: row.end }))
    };
    const images = await Promise.all(pieRows.map(async (row) => {
        const code = String(row.image_url || '').match(/([A-Z]{1,3}\d{0,2}-\d{1,3})\.(?:webp|jpg|png)/i)?.[1]?.toUpperCase();
        if (code) {
            const image = await loadDeckCardImage(code);
            if (image) return image;
        }
        return row.image_url ? loadImage(row.image_url) : null;
    }));
    pieRows.forEach((row, index) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, row.start, row.end);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = row.color;
        ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
        if (images[index]) drawPieSliceImage(ctx, images[index], centerX, centerY, radius, row);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 5, row.start, row.end);
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, row.start, row.end);
        ctx.closePath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#dbe3ee';
    ctx.lineWidth = 3;
    ctx.stroke();
    const legendY = centerY + radius + 42;
    const pitch = 46;
    const columns = card.w >= 620 ? 2 : 1;
    const rowsAvailable = Math.max(1, Math.floor((card.y + card.h - 24 - legendY) / pitch) + 1);
    const capacity = rowsAvailable * columns;
    const visible = pieRows.length <= capacity ? pieRows : pieRows.slice(0, Math.max(0, capacity - 1));
    const remainder = pieRows.slice(visible.length);
    const legend = remainder.length ? [...visible, { deck: 'Outros (' + remainder.length + ' decks)', count: remainder.reduce((sum, row) => sum + row.count, 0), color: '#64748b' }] : visible;
    const columnW = (card.w - 48) / columns;
    legend.forEach((row, index) => {
        const column = Math.floor(index / rowsAvailable);
        const x = card.x + 24 + column * columnW;
        const y = legendY + index % rowsAvailable * pitch;
        drawRoundedRect(ctx, x, y - 20, 10, 24, 4, row.color);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#243750';
        fitPostText(ctx, row.deck, 30, columnW - 126, '700', 18);
        ctx.fillText(row.deck, x + 22, y, columnW - 126);
        ctx.textAlign = 'right';
        ctx.font = '700 26px "Barlow Condensed", sans-serif';
        ctx.fillText(row.count + ' · ' + Math.round(row.count / Math.max(1, results.length) * 100) + '%', x + columnW - 14, y);
    });
}

async function drawBlankMiddleContent(ctx, width, height, layout) {
    if (!ctx || !layout || width <= 0 || height <= 0) return;

    const entries = await getFirstPlaceDecklistEntries();
    if (!entries.length) return;

    const rect = getBlankMiddleDecklistRect(layout, width, height);
    const contentPadding = rect.padding;
    const contentX = rect.x;
    const contentY = rect.y;
    const contentW = rect.w;
    const contentH = rect.h;

    const cardGapX = 10;
    const cardGapY = 18;
    const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(entries.length * 1.8))));
    const gridW = contentW - contentPadding * 2;
    const gridH = contentH - contentPadding * 2;
    const cardW = Math.floor((gridW - cardGapX * (cols - 1)) / cols);
    const cardH = Math.floor((cardW * 88) / 63);
    const rows = Math.max(1, Math.ceil(entries.length / cols));
    const maxRowsByHeight = Math.max(1, Math.floor((gridH + cardGapY) / (cardH + cardGapY)));
    const allowedRows = Math.min(rows, maxRowsByHeight);
    const maxCards = allowedRows * cols;

    const visibleEntries = entries.slice(0, maxCards);
    const images = await Promise.all(visibleEntries.map((entry) => loadDeckCardImage(entry.code)));

    visibleEntries.forEach((entry, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const x = contentX + contentPadding + col * (cardW + cardGapX);
        const y = contentY + contentPadding + row * (cardH + cardGapY);
        const image = images[index];

        drawRoundedRect(ctx, x - 1, y - 1, cardW + 2, cardH + 2, 6, '#fff', '#1f2d60', 1);

        if (image) {
            ctx.drawImage(image, x, y, cardW, cardH);
        } else {
            ctx.fillStyle = '#d7e1ff';
            ctx.fillRect(x, y, cardW, cardH);
            ctx.fillStyle = '#30448f';
            ctx.font = '700 12px Segoe UI, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(entry.code, x + cardW / 2, y + cardH / 2);
        }

        const badgeSize = Math.max(26, Math.min(40, Math.round(cardW * 0.28)));
        const badgeX = x + cardW - Math.round(cardW * 0.04) - badgeSize;
        const badgeY = y + Math.round(cardH * 0.12);
        const centerX = badgeX + badgeSize / 2;
        const centerY = badgeY + badgeSize / 2;

        ctx.fillStyle = 'rgba(26, 31, 58, 0.9)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.max(16, Math.round(badgeSize * 0.58))}px Segoe UI, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(entry.count), centerX, centerY + 1);
        ctx.textBaseline = 'alphabetic';
    });
}

function ensureBlankMiddleDecklistLayout(layout) {
    layout.blankMiddle ||= {};
    layout.blankMiddle.decklist ||= { x: 0, y: 0, w: 0, h: 0, padding: 10 };
    return layout.blankMiddle.decklist;
}

function getBlankMiddleDecklistRect(layout, width = 1080, height = 1350) {
    const cfg = ensureBlankMiddleDecklistLayout(layout);
    const baseX = layout.rows.x + 6;
    const baseY = layout.rows.startY + 8;
    const baseW = Math.max(120, layout.rows.w - 12);
    const baseH = Math.max(120, layout.store.y - baseY - 18);

    let x = Math.round(baseX + (Number(cfg.x) || 0));
    let y = Math.round(baseY + (Number(cfg.y) || 0));
    let w = Math.round(baseW + (Number(cfg.w) || 0));
    let h = Math.round(baseH + (Number(cfg.h) || 0));
    const padding = Math.max(4, Math.min(24, Math.round(Number(cfg.padding) || 10)));

    w = Math.max(120, w);
    h = Math.max(120, h);
    x = Math.max(0, Math.min(width - 120, x));
    y = Math.max(0, Math.min(height - 120, y));
    w = Math.max(120, Math.min(w, width - x));
    h = Math.max(120, Math.min(h, height - y));

    return { x, y, w, h, padding, baseX, baseY };
}

async function refreshDecklistPostAvailability(data) {
    if (!data) return;
    const entries = await getFirstPlaceDecklistEntries();
    if (tournamentDataForCanvas !== data) return;
    firstPlaceDecklistAvailable = entries.length > 0;
    if (!firstPlaceDecklistAvailable && selectedPostType === 'blank_middle') {
        selectedPostType = 'top4';
        saveSelectedPostType();
        updateTemplateControlsVisibility();
        updatePostPreviewMeta();
        updateTemplateEditorButtons();
        void drawPostCanvas();
    }
    syncPostTypeSelector();
}

async function getFirstPlaceDecklistEntries() {
    const topFour = Array.isArray(tournamentDataForCanvas?.topFour) ? tournamentDataForCanvas.topFour : [];
    const firstPlace = topFour.find((row) => Number(row?.placement) === 1) || null;
    const inlineEntries = parseDecklistEntriesForBlankMiddle(firstPlace?.decklist);
    if (inlineEntries.length) return inlineEntries;
    const resultId = String(firstPlace?.result_id || firstPlace?.id || '').trim();
    if (!resultId) return [];

    if (BLANK_MIDDLE_DECKLIST_CACHE.has(resultId)) {
        return BLANK_MIDDLE_DECKLIST_CACHE.get(resultId);
    }

    const decklistText = await fetchDecklistTextByResultId(resultId);
    const parsed = parseDecklistEntriesForBlankMiddle(decklistText);
    if (parsed.length) BLANK_MIDDLE_DECKLIST_CACHE.set(resultId, parsed);
    return parsed;
}

async function fetchDecklistTextByResultId(resultId) {
    const columns = ['decklist', 'decklist_link'];
    for (const column of columns) {
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament_results?id=eq.${encodeURIComponent(resultId)}&select=${column}`,
                { headers }
            );
            if (!res.ok) continue;
            const rows = await res.json();
            const rawText = String(rows?.[0]?.[column] || '').trim();
            if (rawText) return rawText;
        } catch (_) {
            continue;
        }
    }
    return '';
}

function parseDecklistEntriesForBlankMiddle(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return [];

    const ordered = [];
    const map = new Map();
    const lines = text.split(/\r?\n/);
    const linePattern =
        /^(\d{1,2})\s+.*?((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}(?:_[A-Z0-9]+)?)\s*$/i;

    lines.forEach((line) => {
        const raw = String(line || '').trim();
        if (!raw || /^\/\/\s*/.test(raw) || /^decklist$/i.test(raw)) return;

        const m = raw.match(linePattern);
        if (!m) return;
        const count = Math.max(1, Math.min(4, Number(m[1]) || 1));
        const code = normalizeDeckCodeForBlankMiddle(m[2]);
        if (!/^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/.test(code)) return;

        if (!map.has(code)) {
            const entry = { code, count: 0 };
            map.set(code, entry);
            ordered.push(entry);
        }
        map.get(code).count = Math.min(4, map.get(code).count + count);
    });

    return ordered;
}

function normalizeDeckCodeForBlankMiddle(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/^["'\[\(]+/, '')
        .replace(/["'\]\),;:.]+$/, '')
        .replace(/_.+$/, '');
}

async function loadDeckCardImage(code) {
    const supabaseUrl = window.APP_CONFIG?.SUPABASE_URL || '';
    const candidates = [
        supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/deck-images/${encodeURIComponent(code)}.webp?t=${Date.now()}` : null,
        `https://digimoncardgame.fandom.com/wiki/Special:FilePath/${code}-Sample.png`,
        `https://digimon.digilab.cards/api/card/${code}.jpg`,
    ].filter(Boolean);

    for (const src of candidates) {
        const result = await loadImage(src);
        if (result && !isDeckCardImageBlank(result)) return result;
    }

    // egmanevents: confirmed CORS, but returns white image for sets it doesn't have yet
    const egma = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `https://deckbuilder.egmanevents.com/card_images/digimon/${code}.webp`;
    });
    if (egma && !isDeckCardImageBlank(egma)) return egma;

    return null;
}

function isDeckCardImageBlank(img) {
    try {
        const cv = document.createElement('canvas');
        cv.width = 8; cv.height = 8;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let r = 0, g = 0, b = 0;
        const px = data.length / 4;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
        return (r / px) > 245 && (g / px) > 245 && (b / px) > 245;
    } catch { return false; }
}

function setPostTemplateEditorActive(active) {
    isPostTemplateEditorActive = Boolean(active);
    const overlay = document.getElementById('postEditorOverlay');
    if (overlay) {
        overlay.classList.toggle('u-hidden', !isPostTemplateEditorActive);
        if (!isPostTemplateEditorActive) {
            postEditorGuides = [];
            overlay.innerHTML = '';
        }
    }
    updateTemplateEditorButtons();
}

function updateTemplateEditorButtons() {
    const btn = document.getElementById('btnPostTemplateEdit');
    if (!btn) return;
    btn.textContent = isPostTemplateEditorActive ? 'Finish Editing' : 'Edit Template';
    btn.classList.toggle('is-active', isPostTemplateEditorActive);
}

function renderTemplateEditorOverlay() {
    const overlay = document.getElementById('postEditorOverlay');
    const wrap = document.getElementById('postCanvasWrap');
    const canvas = document.getElementById('postCanvas');
    if (!overlay || !wrap || !canvas || !isPostTemplateEditorActive) return;

    const wrapRect = wrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;

    overlay.style.left = `${canvasRect.left - wrapRect.left}px`;
    overlay.style.top = `${canvasRect.top - wrapRect.top}px`;
    overlay.style.width = `${canvasRect.width}px`;
    overlay.style.height = `${canvasRect.height}px`;
    overlay.innerHTML = '';

    const handles = getTemplateEditorHandles();
    postEditorGuides.forEach((guide) => {
        const line = document.createElement('div');
        line.className = `post-editor-guide ${guide.axis}`;
        if (guide.axis === 'x') {
            line.style.left = `${guide.value * scaleX}px`;
        } else {
            line.style.top = `${guide.value * scaleY}px`;
        }
        overlay.appendChild(line);
    });

    handles.forEach((handle) => {
        const div = document.createElement('button');
        div.type = 'button';
        div.className = 'post-editor-handle';
        div.dataset.key = handle.key;
        div.style.left = `${handle.x * scaleX}px`;
        div.style.top = `${handle.y * scaleY}px`;
        div.style.width = `${handle.w * scaleX}px`;
        div.style.height = `${handle.h * scaleY}px`;
        div.innerHTML = `<span>${handle.label}</span>`;
        div.addEventListener('pointerdown', (event) => startTemplateHandleDrag(event, handle.key));
        overlay.appendChild(div);
    });
}

function getTemplateEditorHandles() {
    if (selectedPostType === 'distribution_results') {
        const geometry = getDistributionGeometry(postLayout, 1080, 1350);
        return [
            {
                key: 'logo',
                label: 'Logo',
                x: postLayout.logo.x,
                y: postLayout.logo.y,
                w: postLayout.logo.w,
                h: postLayout.logo.h
            },
            {
                key: 'title',
                label: 'Title/Date',
                x: postLayout.title.x,
                y: postLayout.title.y,
                w: postLayout.title.w,
                h: postLayout.title.h
            },
            {
                key: 'distDeckCard',
                label: 'Deck Distribution Card',
                x: geometry.leftCard.x,
                y: geometry.leftCard.y,
                w: geometry.leftCard.w,
                h: geometry.leftCard.h
            },
            {
                key: 'distPie',
                label: 'Distribution Pie',
                x: geometry.pie.x - geometry.pie.radius,
                y: geometry.pie.y - geometry.pie.radius,
                w: geometry.pie.radius * 2,
                h: geometry.pie.radius * 2
            },
            {
                key: 'store',
                label: 'Store Logo',
                x: postLayout.store.x,
                y: postLayout.store.y,
                w: postLayout.store.w,
                h: postLayout.store.h
            },
            {
                key: 'handle',
                label: '@digimoncwb',
                x: postLayout.handle.x - 280,
                y: postLayout.handle.y - 52,
                w: 280,
                h: 62
            }
        ];
    }

    if (selectedPostType === 'blank_middle') {
        const decklistRect = getBlankMiddleDecklistRect(postLayout, 1080, 1350);
        return [
            {
                key: 'logo',
                label: 'Logo',
                x: postLayout.logo.x,
                y: postLayout.logo.y,
                w: postLayout.logo.w,
                h: postLayout.logo.h
            },
            {
                key: 'title',
                label: 'Title/Date',
                x: postLayout.title.x,
                y: postLayout.title.y,
                w: postLayout.title.w,
                h: postLayout.title.h
            },
            {
                key: 'decklist',
                label: 'Decklist',
                x: decklistRect.x,
                y: decklistRect.y,
                w: decklistRect.w,
                h: decklistRect.h
            },
            {
                key: 'store',
                label: 'Store Logo',
                x: postLayout.store.x,
                y: postLayout.store.y,
                w: postLayout.store.w,
                h: postLayout.store.h
            },
            {
                key: 'handle',
                label: '@digimoncwb',
                x: postLayout.handle.x - 280,
                y: postLayout.handle.y - 52,
                w: 280,
                h: 62
            }
        ];
    }

    const rowsHeight = postLayout.rows.rowHeight * 4 + postLayout.rows.rowGap * 3;
    const rowX = postLayout.rows.x;
    const rowY = postLayout.rows.startY;
    const rowW = postLayout.rows.w;
    const rowH = postLayout.rows.rowHeight;
    const rowElements = postLayout.rowElements;
    const avatarX = rowX + rowW - rowElements.avatar.xFromRight;
    const avatarY = rowY + rowH / 2 + rowElements.avatar.yOffset;
    const textAreaLeft = rowX + rowElements.text.leftPadding;
    const textAreaRight = avatarX - rowElements.text.rightPadding;
    const textWidth = Math.max(80, textAreaRight - textAreaLeft);
    return [
        {
            key: 'logo',
            label: 'Logo',
            x: postLayout.logo.x,
            y: postLayout.logo.y,
            w: postLayout.logo.w,
            h: postLayout.logo.h
        },
        {
            key: 'title',
            label: 'Title/Date',
            x: postLayout.title.x,
            y: postLayout.title.y,
            w: postLayout.title.w,
            h: postLayout.title.h
        },
        {
            key: 'rows',
            label: 'Podium Border',
            x: postLayout.rowBorder.x,
            y: postLayout.rowBorder.startY,
            w: postLayout.rowBorder.w,
            h: postLayout.rowBorder.rowHeight
        },
        {
            key: 'trophy',
            label: 'Trophy Icon',
            x: rowX + rowElements.trophy.x - rowElements.trophy.w / 2,
            y: rowY + rowElements.trophy.y - rowElements.trophy.h / 2,
            w: rowElements.trophy.w,
            h: rowElements.trophy.h
        },
        {
            key: 'podiumNumber',
            label: 'Podium Number',
            x: rowX + rowElements.trophy.x + rowElements.podiumNumber.offsetX - 48,
            y: rowY + rowElements.trophy.y + rowElements.podiumNumber.offsetY - 34,
            w: 96,
            h: 68
        },
        {
            key: 'avatar',
            label: 'Deck Circle',
            x: avatarX - rowElements.avatar.outerRadius,
            y: avatarY - rowElements.avatar.outerRadius,
            w: rowElements.avatar.outerRadius * 2,
            h: rowElements.avatar.outerRadius * 2
        },
        {
            key: 'rowText',
            label: 'Player/Deck',
            x: textAreaLeft,
            y: rowY + rowElements.text.playerY - 36,
            w: textWidth,
            h: Math.max(72, rowElements.text.deckY - rowElements.text.playerY + 54)
        },
        {
            key: 'store',
            label: 'Store Logo',
            x: postLayout.store.x,
            y: postLayout.store.y,
            w: postLayout.store.w,
            h: postLayout.store.h
        },
        {
            key: 'handle',
            label: '@digimoncwb',
            x: postLayout.handle.x - 280,
            y: postLayout.handle.y - 52,
            w: 280,
            h: 62
        }
    ];
}

function startTemplateHandleDrag(event, key) {
    if (!isPostTemplateEditorActive) return;
    event.preventDefault();
    activeTemplateHandleKey = key;
    syncTemplateObjectSelect();

    const canvas = document.getElementById('postCanvas');
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    const origin = getHandleOrigin(key);

    postEditorDragState = {
        key,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: origin.x,
        originY: origin.y,
        scaleX,
        scaleY
    };

    window.addEventListener('pointermove', onTemplateHandleDrag);
    window.addEventListener('pointerup', stopTemplateHandleDrag);
}

function onTemplateHandleDrag(event) {
    if (!postEditorDragState) return;

    const dx = (event.clientX - postEditorDragState.startClientX) / postEditorDragState.scaleX;
    const dy = (event.clientY - postEditorDragState.startClientY) / postEditorDragState.scaleY;

    const nextX = Math.round(postEditorDragState.originX + dx);
    const nextY = Math.round(postEditorDragState.originY + dy);
    const snapped = applyTemplateSnap(postEditorDragState.key, nextX, nextY);
    postEditorGuides = snapped.guides;
    updateHandleOrigin(postEditorDragState.key, snapped.x, snapped.y);
    drawPostCanvas();
}

function stopTemplateHandleDrag() {
    if (!postEditorDragState) return;
    postEditorDragState = null;
    postEditorGuides = [];
    savePostLayout();
    renderTemplateEditorOverlay();
    window.removeEventListener('pointermove', onTemplateHandleDrag);
    window.removeEventListener('pointerup', stopTemplateHandleDrag);
}

function getHandleOrigin(key) {
    if (selectedPostType === 'distribution_results') {
        const geometry = getDistributionGeometry(postLayout, 1080, 1350);
        switch (key) {
            case 'logo':
                return { x: postLayout.logo.x, y: postLayout.logo.y };
            case 'title':
                return { x: postLayout.title.x, y: postLayout.title.y };
            case 'distPanel':
                return { x: geometry.panelRect.x, y: geometry.panelRect.y };
            case 'distDeckCard':
                return { x: geometry.leftCard.x, y: geometry.leftCard.y };
            case 'distResultsCard':
                return { x: geometry.rightCard.x, y: geometry.rightCard.y };
            case 'distPie':
                return { x: geometry.pie.x - geometry.pie.radius, y: geometry.pie.y - geometry.pie.radius };
            case 'store':
                return { x: postLayout.store.x, y: postLayout.store.y };
            case 'handle':
                return { x: postLayout.handle.x - 280, y: postLayout.handle.y - 52 };
            default:
                return { x: 0, y: 0 };
        }
    }

    if (selectedPostType === 'blank_middle') {
        const decklistRect = getBlankMiddleDecklistRect(postLayout, 1080, 1350);
        switch (key) {
            case 'logo':
                return { x: postLayout.logo.x, y: postLayout.logo.y };
            case 'title':
                return { x: postLayout.title.x, y: postLayout.title.y };
            case 'decklist':
                return { x: decklistRect.x, y: decklistRect.y };
            case 'store':
                return { x: postLayout.store.x, y: postLayout.store.y };
            case 'handle':
                return { x: postLayout.handle.x - 280, y: postLayout.handle.y - 52 };
            default:
                return { x: 0, y: 0 };
        }
    }

    const rowX = postLayout.rows.x;
    const rowY = postLayout.rows.startY;
    const rowW = postLayout.rows.w;
    const rowH = postLayout.rows.rowHeight;
    const rowElements = postLayout.rowElements;
    const avatarX = rowX + rowW - rowElements.avatar.xFromRight;
    const avatarY = rowY + rowH / 2 + rowElements.avatar.yOffset;
    const textAreaLeft = rowX + rowElements.text.leftPadding;
    switch (key) {
        case 'logo':
            return { x: postLayout.logo.x, y: postLayout.logo.y };
        case 'title':
            return { x: postLayout.title.x, y: postLayout.title.y };
        case 'rows':
            return { x: postLayout.rowBorder.x, y: postLayout.rowBorder.startY };
        case 'trophy':
            return {
                x: rowX + rowElements.trophy.x - rowElements.trophy.w / 2,
                y: rowY + rowElements.trophy.y - rowElements.trophy.h / 2
            };
        case 'podiumNumber':
            return {
                x: rowX + rowElements.trophy.x + rowElements.podiumNumber.offsetX - 48,
                y: rowY + rowElements.trophy.y + rowElements.podiumNumber.offsetY - 34
            };
        case 'avatar':
            return {
                x: avatarX - rowElements.avatar.outerRadius,
                y: avatarY - rowElements.avatar.outerRadius
            };
        case 'rowText':
            return {
                x: textAreaLeft,
                y: rowY + rowElements.text.playerY - 36
            };
        case 'store':
            return { x: postLayout.store.x, y: postLayout.store.y };
        case 'handle':
            return { x: postLayout.handle.x - 280, y: postLayout.handle.y - 52 };
        default:
            return { x: 0, y: 0 };
    }
}

function updateHandleOrigin(key, x, y) {
    if (selectedPostType === 'distribution_results') {
        const layoutDist = (postLayout.distribution ||= {
            panel: { inset: 16 },
            cards: { leftRatio: 0.54, gutter: 14 },
            deckCard: { x: 0, y: 0 },
            resultsCard: { x: 0, y: 0 },
            pie: { x: 0, y: 0, radius: 0 },
            results: { x: 0, y: 0, width: 0, columnSize: 12 }
        });
        const geometry = getDistributionGeometry(postLayout, 1080, 1350);
        switch (key) {
            case 'logo':
                postLayout.logo.x = x;
                postLayout.logo.y = y;
                return;
            case 'title':
                postLayout.title.x = x;
                postLayout.title.y = y;
                return;
            case 'distPanel': {
                const base = getMiddlePanelRect(postLayout, 1080, 1350);
                layoutDist.panel.inset = Math.max(8, Math.round(x - base.x));
                return;
            }
            case 'distDeckCard':
                layoutDist.deckCard.x = Math.round(x - geometry.leftCard.x + (layoutDist.deckCard.x || 0));
                layoutDist.deckCard.y = Math.round(y - geometry.leftCard.y + (layoutDist.deckCard.y || 0));
                return;
            case 'distResultsCard':
                layoutDist.resultsCard.x = Math.round(x - geometry.rightCard.x + (layoutDist.resultsCard.x || 0));
                layoutDist.resultsCard.y = Math.round(y - geometry.rightCard.y + (layoutDist.resultsCard.y || 0));
                return;
            case 'distPie':
                layoutDist.pie.x = Math.round(x + geometry.pie.radius - (geometry.leftCard.x + geometry.leftCard.w / 2));
                layoutDist.pie.y = Math.round(y + geometry.pie.radius - (geometry.leftCard.y + Math.round(geometry.leftCard.h * 0.35)));
                return;
            case 'store':
                postLayout.store.x = x;
                postLayout.store.y = y;
                return;
            case 'handle':
                postLayout.handle.x = x + 280;
                postLayout.handle.y = y + 52;
                return;
            default:
                return;
        }
    }

    if (selectedPostType === 'blank_middle') {
        switch (key) {
            case 'logo':
                postLayout.logo.x = x;
                postLayout.logo.y = y;
                return;
            case 'title':
                postLayout.title.x = x;
                postLayout.title.y = y;
                return;
            case 'decklist': {
                const cfg = ensureBlankMiddleDecklistLayout(postLayout);
                const current = getBlankMiddleDecklistRect(postLayout, 1080, 1350);
                cfg.x = Math.round((Number(cfg.x) || 0) + (x - current.x));
                cfg.y = Math.round((Number(cfg.y) || 0) + (y - current.y));
                return;
            }
            case 'store':
                postLayout.store.x = x;
                postLayout.store.y = y;
                return;
            case 'handle':
                postLayout.handle.x = x + 280;
                postLayout.handle.y = y + 52;
                return;
            default:
                return;
        }
    }

    const rowX = postLayout.rows.x;
    const rowY = postLayout.rows.startY;
    const rowW = postLayout.rows.w;
    const rowH = postLayout.rows.rowHeight;
    const rowElements = postLayout.rowElements;
    switch (key) {
        case 'logo':
            postLayout.logo.x = x;
            postLayout.logo.y = y;
            break;
        case 'title':
            postLayout.title.x = x;
            postLayout.title.y = y;
            break;
        case 'rows':
            postLayout.rowBorder.x = x;
            postLayout.rowBorder.startY = y;
            break;
        case 'trophy':
            postLayout.rowElements.trophy.x = Math.round(x + postLayout.rowElements.trophy.w / 2 - rowX);
            postLayout.rowElements.trophy.y = Math.round(y + postLayout.rowElements.trophy.h / 2 - rowY);
            break;
        case 'podiumNumber':
            postLayout.rowElements.podiumNumber.offsetX = Math.round(x + 48 - (rowX + rowElements.trophy.x));
            postLayout.rowElements.podiumNumber.offsetY = Math.round(y + 34 - (rowY + rowElements.trophy.y));
            break;
        case 'avatar': {
            const centerX = x + rowElements.avatar.outerRadius;
            const centerY = y + rowElements.avatar.outerRadius;
            postLayout.rowElements.avatar.xFromRight = Math.round(rowX + rowW - centerX);
            postLayout.rowElements.avatar.yOffset = Math.round(centerY - (rowY + rowH / 2));
            break;
        }
        case 'rowText': {
            const delta = rowElements.text.deckY - rowElements.text.playerY;
            postLayout.rowElements.text.leftPadding = Math.round(x - rowX);
            postLayout.rowElements.text.playerY = Math.round(y + 36 - rowY);
            postLayout.rowElements.text.deckY = postLayout.rowElements.text.playerY + delta;
            break;
        }
        case 'store':
            postLayout.store.x = x;
            postLayout.store.y = y;
            break;
        case 'handle':
            postLayout.handle.x = x + 280;
            postLayout.handle.y = y + 52;
            break;
        default:
            break;
    }
}

function getTemplateHandleRect(key) {
    if (selectedPostType === 'distribution_results') {
        const geometry = getDistributionGeometry(postLayout, 1080, 1350);
        switch (key) {
            case 'logo':
                return { x: postLayout.logo.x, y: postLayout.logo.y, w: postLayout.logo.w, h: postLayout.logo.h };
            case 'title':
                return { x: postLayout.title.x, y: postLayout.title.y, w: postLayout.title.w, h: postLayout.title.h };
            case 'distPanel':
                return {
                    x: geometry.panelRect.x,
                    y: geometry.panelRect.y,
                    w: geometry.panelRect.w,
                    h: geometry.panelRect.h
                };
            case 'distDeckCard':
                return { x: geometry.leftCard.x, y: geometry.leftCard.y, w: geometry.leftCard.w, h: geometry.leftCard.h };
            case 'distResultsCard':
                return { x: geometry.rightCard.x, y: geometry.rightCard.y, w: geometry.rightCard.w, h: geometry.rightCard.h };
            case 'distPie':
                return {
                    x: geometry.pie.x - geometry.pie.radius,
                    y: geometry.pie.y - geometry.pie.radius,
                    w: geometry.pie.radius * 2,
                    h: geometry.pie.radius * 2
                };
            case 'store':
                return { x: postLayout.store.x, y: postLayout.store.y, w: postLayout.store.w, h: postLayout.store.h };
            case 'handle':
                return { x: postLayout.handle.x - 280, y: postLayout.handle.y - 52, w: 280, h: 62 };
            default:
                return { x: 0, y: 0, w: 0, h: 0 };
        }
    }

    if (selectedPostType === 'blank_middle') {
        const decklistRect = getBlankMiddleDecklistRect(postLayout, 1080, 1350);
        switch (key) {
            case 'logo':
                return { x: postLayout.logo.x, y: postLayout.logo.y, w: postLayout.logo.w, h: postLayout.logo.h };
            case 'title':
                return { x: postLayout.title.x, y: postLayout.title.y, w: postLayout.title.w, h: postLayout.title.h };
            case 'decklist':
                return { x: decklistRect.x, y: decklistRect.y, w: decklistRect.w, h: decklistRect.h };
            case 'store':
                return { x: postLayout.store.x, y: postLayout.store.y, w: postLayout.store.w, h: postLayout.store.h };
            case 'handle':
                return { x: postLayout.handle.x - 280, y: postLayout.handle.y - 52, w: 280, h: 62 };
            default:
                return { x: 0, y: 0, w: 0, h: 0 };
        }
    }

    const rowX = postLayout.rows.x;
    const rowY = postLayout.rows.startY;
    const rowW = postLayout.rows.w;
    const rowH = postLayout.rows.rowHeight;
    const rowElements = postLayout.rowElements;
    const avatarX = rowX + rowW - rowElements.avatar.xFromRight;
    const avatarY = rowY + rowH / 2 + rowElements.avatar.yOffset;
    const textAreaLeft = rowX + rowElements.text.leftPadding;
    const textAreaRight = avatarX - rowElements.text.rightPadding;
    switch (key) {
        case 'logo':
            return { x: postLayout.logo.x, y: postLayout.logo.y, w: postLayout.logo.w, h: postLayout.logo.h };
        case 'title':
            return { x: postLayout.title.x, y: postLayout.title.y, w: postLayout.title.w, h: postLayout.title.h };
        case 'rows':
            return {
                x: postLayout.rowBorder.x,
                y: postLayout.rowBorder.startY,
                w: postLayout.rowBorder.w,
                h: postLayout.rowBorder.rowHeight
            };
        case 'trophy':
            return {
                x: rowX + rowElements.trophy.x - rowElements.trophy.w / 2,
                y: rowY + rowElements.trophy.y - rowElements.trophy.h / 2,
                w: rowElements.trophy.w,
                h: rowElements.trophy.h
            };
        case 'podiumNumber':
            return {
                x: rowX + rowElements.trophy.x + rowElements.podiumNumber.offsetX - 48,
                y: rowY + rowElements.trophy.y + rowElements.podiumNumber.offsetY - 34,
                w: 96,
                h: 68
            };
        case 'avatar':
            return {
                x: avatarX - rowElements.avatar.outerRadius,
                y: avatarY - rowElements.avatar.outerRadius,
                w: rowElements.avatar.outerRadius * 2,
                h: rowElements.avatar.outerRadius * 2
            };
        case 'rowText':
            return {
                x: textAreaLeft,
                y: rowY + rowElements.text.playerY - 36,
                w: Math.max(80, textAreaRight - textAreaLeft),
                h: Math.max(72, rowElements.text.deckY - rowElements.text.playerY + 54)
            };
        case 'store':
            return { x: postLayout.store.x, y: postLayout.store.y, w: postLayout.store.w, h: postLayout.store.h };
        case 'handle':
            return { x: postLayout.handle.x - 280, y: postLayout.handle.y - 52, w: 280, h: 62 };
        default:
            return { x: 0, y: 0, w: 0, h: 0 };
    }
}

function applyTemplateSnap(key, x, y) {
    const canvasW = 1080;
    const canvasH = 1350;
    const rect = getTemplateHandleRect(key);
    const guides = [];
    let snappedX = x;
    let snappedY = y;

    const xTargets = [0, canvasW - rect.w, Math.round((canvasW - rect.w) / 2)];
    const yTargets = [0, canvasH - rect.h, Math.round((canvasH - rect.h) / 2)];

    const otherHandles = getTemplateEditorHandles().filter((h) => h.key !== key);
    otherHandles.forEach((h) => {
        xTargets.push(Math.round(h.x));
        xTargets.push(Math.round(h.x + h.w / 2 - rect.w / 2));
        yTargets.push(Math.round(h.y));
        yTargets.push(Math.round(h.y + h.h / 2 - rect.h / 2));
    });

    const closestX = findClosestSnap(x, xTargets, EDITOR_SNAP_DISTANCE);
    if (closestX !== null) {
        snappedX = closestX;
        guides.push({ axis: 'x', value: closestX + rect.w / 2 });
    }

    const closestY = findClosestSnap(y, yTargets, EDITOR_SNAP_DISTANCE);
    if (closestY !== null) {
        snappedY = closestY;
        guides.push({ axis: 'y', value: closestY + rect.h / 2 });
    }

    return { x: snappedX, y: snappedY, guides };
}

function nudgeTemplateHandle(key, dx, dy) {
    const origin = getHandleOrigin(key);
    updateHandleOrigin(key, origin.x + dx, origin.y + dy);
    postEditorGuides = [];
    renderTemplateEditorOverlay();
}

function resizeTemplateHandle(key, delta) {
    const fontDelta = Math.round(delta / 2);
    let typographyUpdated = false;
    if (selectedPostType === 'distribution_results') {
        const layoutDist = (postLayout.distribution ||= {
            panel: { inset: 16 },
            cards: { leftRatio: 0.54, gutter: 14 },
            deckCard: { x: 0, y: 0 },
            resultsCard: { x: 0, y: 0 },
            pie: { x: 0, y: 0, radius: 0 },
            results: { x: 0, y: 0, width: 0, columnSize: 12 }
        });
        switch (key) {
            case 'logo':
                postLayout.logo.w = Math.max(120, postLayout.logo.w + delta);
                postLayout.logo.h = Math.max(60, postLayout.logo.h + delta);
                break;
            case 'title':
                postLayout.title.w = Math.max(180, postLayout.title.w + delta);
                postLayout.title.h = Math.max(90, postLayout.title.h + delta);
                postLayout.typography.titleSize = Math.max(20, postLayout.typography.titleSize + fontDelta);
                postLayout.typography.dateSize = Math.max(20, postLayout.typography.dateSize + fontDelta);
                typographyUpdated = true;
                break;
            case 'distDeckCard': {
                const current = Number(layoutDist.cards.leftRatio) || 0.54;
                layoutDist.cards.leftRatio = Math.max(0.38, Math.min(0.68, current + delta / 1200));
                break;
            }
            case 'distResultsCard':
                layoutDist.results.width = Math.max(-80, Math.min(80, (Number(layoutDist.results.width) || 0) + delta));
                break;
            case 'distPie':
                layoutDist.pie.radius = Math.max(64, (Number(layoutDist.pie.radius) || 0) + Math.round(delta / 2));
                break;
            case 'store':
                postLayout.store.w = Math.max(120, postLayout.store.w + delta);
                postLayout.store.h = Math.max(60, postLayout.store.h + Math.round(delta / 2));
                break;
            case 'handle':
                postLayout.typography.handleSize = Math.max(
                    20,
                    postLayout.typography.handleSize + Math.round(delta / 2)
                );
                break;
            default:
                break;
        }
        postEditorGuides = [];
        if (typographyUpdated) syncTypographyControls();
        renderTemplateEditorOverlay();
        return;
    }

    if (selectedPostType === 'blank_middle') {
        switch (key) {
            case 'logo':
                postLayout.logo.w = Math.max(120, postLayout.logo.w + delta);
                postLayout.logo.h = Math.max(60, postLayout.logo.h + delta);
                break;
            case 'title':
                postLayout.title.w = Math.max(180, postLayout.title.w + delta);
                postLayout.title.h = Math.max(90, postLayout.title.h + delta);
                postLayout.typography.titleSize = Math.max(20, postLayout.typography.titleSize + fontDelta);
                postLayout.typography.dateSize = Math.max(20, postLayout.typography.dateSize + fontDelta);
                typographyUpdated = true;
                break;
            case 'decklist': {
                const cfg = ensureBlankMiddleDecklistLayout(postLayout);
                cfg.w = Math.max(-420, Math.min(420, (Number(cfg.w) || 0) + delta));
                cfg.h = Math.max(-480, Math.min(480, (Number(cfg.h) || 0) + Math.round(delta / 2)));
                break;
            }
            case 'store':
                postLayout.store.w = Math.max(120, postLayout.store.w + delta);
                postLayout.store.h = Math.max(60, postLayout.store.h + Math.round(delta / 2));
                break;
            case 'handle':
                postLayout.typography.handleSize = Math.max(20, postLayout.typography.handleSize + Math.round(delta / 2));
                break;
            default:
                break;
        }
        postEditorGuides = [];
        if (typographyUpdated) syncTypographyControls();
        renderTemplateEditorOverlay();
        return;
    }

    switch (key) {
        case 'logo':
            postLayout.logo.w = Math.max(120, postLayout.logo.w + delta);
            postLayout.logo.h = Math.max(60, postLayout.logo.h + delta);
            break;
        case 'title':
            postLayout.title.w = Math.max(180, postLayout.title.w + delta);
            postLayout.title.h = Math.max(90, postLayout.title.h + delta);
            postLayout.typography.titleSize = Math.max(20, postLayout.typography.titleSize + fontDelta);
            postLayout.typography.dateSize = Math.max(20, postLayout.typography.dateSize + fontDelta);
            typographyUpdated = true;
            break;
        case 'rows':
            postLayout.rowBorder.w = Math.max(500, postLayout.rowBorder.w + delta);
            postLayout.rowBorder.rowHeight = Math.max(
                120,
                postLayout.rowBorder.rowHeight + Math.round(delta / 2)
            );
            break;
        case 'trophy':
            postLayout.rowElements.trophy.w = Math.max(70, postLayout.rowElements.trophy.w + delta);
            postLayout.rowElements.trophy.h = Math.max(70, postLayout.rowElements.trophy.h + delta);
            break;
        case 'podiumNumber':
            postLayout.rowElements.podiumNumber.size = Math.max(
                24,
                postLayout.rowElements.podiumNumber.size + Math.round(delta / 2)
            );
            break;
        case 'avatar':
            postLayout.rowElements.avatar.outerRadius = Math.max(
                40,
                postLayout.rowElements.avatar.outerRadius + Math.round(delta / 2)
            );
            postLayout.rowElements.avatar.imageRadius = Math.max(
                34,
                postLayout.rowElements.avatar.imageRadius + Math.round(delta / 2)
            );
            break;
        case 'rowText':
            postLayout.rowElements.text.rightPadding = Math.max(
                40,
                postLayout.rowElements.text.rightPadding - Math.round(delta / 2)
            );
            break;
        case 'store':
            postLayout.store.w = Math.max(120, postLayout.store.w + delta);
            postLayout.store.h = Math.max(60, postLayout.store.h + Math.round(delta / 2));
            break;
        case 'handle':
            postLayout.typography.handleSize = Math.max(20, postLayout.typography.handleSize + Math.round(delta / 2));
            break;
        default:
            break;
    }
    postEditorGuides = [];
    if (typographyUpdated) syncTypographyControls();
    renderTemplateEditorOverlay();
}

function findClosestSnap(value, targets, threshold) {
    let closest = null;
    let minDistance = Number.POSITIVE_INFINITY;
    targets.forEach((target) => {
        const distance = Math.abs(value - target);
        if (distance <= threshold && distance < minDistance) {
            minDistance = distance;
            closest = target;
        }
    });
    return closest;
}


