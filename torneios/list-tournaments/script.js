const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL || 'https://vllqakohumoinpdwnsqa.supabase.co';
const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY || '';
const headers = window.createSupabaseHeaders
    ? window.createSupabaseHeaders()
    : {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
      };
const TOURNAMENT_NAME_OPTIONS = [
    'Semanal',
    'Mensal',
    'Quinzenal',
    'Pre-Release',
    'Top 8',
    'Win-A-Box',
    'Evo Cup',
    'Regulation Battle',
    'For Fun',
    '2v2'
];

const SORT_STORAGE_KEY = 'tournamentsSort';
const PER_PAGE_STORAGE_KEY = 'tournamentsPerPage';
const VIEW_STORAGE_KEY = 'tournamentsViewMode';
const DASHBOARD_VIEW_STORAGE_KEY = 'dashboardActiveView';
const STATS_VIEW_STORAGE_KEY = 'dashboardStatisticsView';
const STATS_COLUMN_WIDTHS_STORAGE_KEY = 'dashboardStatisticsColumnWidths';
const POST_PREVIEW_STATE_KEY = 'digistats.post-preview.state.v1';
const OCR_API_BASE_URL = 'https://digimon-ocr-api.vercel.app';
const DIGIMON_CARD_API_URL = 'https://digimoncard.io/api-public/search';
const DIGILAB_BACKGROUND_INTERVAL_MS = 60 * 60 * 1000;
// Synchronize at the start of every hour, matching pg_cron.
const DIGILAB_BACKGROUND_OFFSET_MS = 0;
const DIGILAB_BACKGROUND_REFRESH_DELAY_MS = 35 * 1000;
const ENABLE_TOP_CARDS_API_LOOKUP = window.APP_CONFIG?.ENABLE_TOP_CARDS_API_LOOKUP !== false;
const IMAGE_BASE_URL = 'https://deckbuilder.egmanevents.com/card_images/digimon/';
const DEFAULT_SORT = { field: 'tournament_date', direction: 'desc' };
const SORTABLE_FIELDS = ['tournament_date', 'total_players'];
const SORT_DIRECTIONS = ['asc', 'desc'];
const MONTH_NAMES_PT = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro'
];
const DEFAULT_STATISTICS_VIEW = 'v_deck_stats';
const STATISTICS_VIEWS = [
    { value: 'meta_overview', label: 'Visão geral do Meta' },
    { value: 'v_deck_representation', label: 'Representação de Decks' },
    { value: 'v_deck_stats', label: 'Estatísticas de Decks' },
    { value: 'v_top_cards_by_month', label: 'Top Cards' },
    { value: 'v_player_ranking', label: 'Ranking de Jogadores' },
    { value: 'v_store_champions', label: 'Ranking por Loja' }
];
const STATISTICS_COLUMN_HELP_PTBR = {
    common: {
        deck: 'Nome do deck arquétipo.',
        player: 'Nome do jogador.',
        store: 'Nome da loja onde o torneio aconteceu.',
        month: 'Mês de referência da estatística.',
        appearances: 'Quantidade total de aparições no recorte.',
        entries: 'Total de aparições/resultados registrados.',
        titles: 'Quantidade de títulos (1º lugar).',
        top4_total: 'Quantidade de vezes no Top 4.',
        ranking_points: 'Pontuação acumulada conforme o sistema de pontos da view.',
        avg_placement: 'Média de colocação (quanto menor, melhor).',
        meta_share_percent:
            'Meta Share (%): (aparições do deck no recorte / total de aparições no mesmo recorte) x 100.',
        title_rate_percent: 'Taxa de Títulos (%): (títulos / total de entradas) x 100.',
        top4_rate_percent: 'Taxa Top4 (%): (resultados no Top4 / total de entradas) x 100.',
        format_code: 'Código do formato do torneio (ex.: BT24, EX11).',
        card_code: 'Código da carta (ex.: BT1-001).',
        card_name: 'Nome da carta.',
        card_type: 'Tipo da carta (Digimon, Tamer, Option, etc.).',
        is_staple: 'Indica se a carta é staple.',
        color: 'Cor do deck.',
        usage_percent:
            'Uso da Cor (%): (quantidade de resultados com a cor no período / total de resultados do período) x 100.',
        top_deck: 'Deck da cor com maior número de títulos (Top 1) no período filtrado.',
        top_deck_titles: 'Quantidade de títulos do deck líder da cor no período.',
        total: 'Quantidade total de decklists Top 4 contendo a carta no mês.',
        champion: 'Quantidade de decklists campeãs (1º lugar) contendo a carta no mês.',
        top2: 'Quantidade de decklists Top 2 contendo a carta no mês.',
        top3: 'Quantidade de decklists Top 3 contendo a carta no mês.',
        top4: 'Quantidade de decklists Top 4 contendo a carta no mês.',
        tournament_date: 'Data do torneio.',
        tournament_name: 'Nome do torneio.',
        placement: 'Colocação final no torneio.',
        total_players: 'Quantidade total de jogadores no torneio.',
        image_url: 'URL da imagem principal do deck.',
        instagram_link: 'Link do post no Instagram do evento.',
        decklist: 'Decklist registrada para o resultado.',
        trend: 'Meta Share (%) mês a mês. Mostra se o deck está subindo ou caindo no meta.'
    },
    v_deck_representation: {
        tournaments_played: 'Quantidade de torneios distintos em que o deck apareceu.',
        unique_players: 'Quantidade de jogadores únicos usando o deck.',
        top4_finishes: 'Quantidade de resultados no Top 4.',
        avg_placement: 'Média de colocação do deck em todos os resultados.'
    },
    v_deck_stats: {
        best_finish: 'Melhor colocação já alcançada pelo deck.',
        worst_finish: 'Pior colocação já registrada para o deck.',
        performance_rank: 'Ranking geral de desempenho do deck.'
    },
    v_meta_by_month: {
        month: 'Mês analisado para o metagame.',
        meta_share_percent:
            'Meta Share (%): (aparições do deck no mês e formato selecionados / total de aparições no mesmo mês e formato) x 100.',
        top4_total: 'Total de resultados Top 4 no mês.',
        titles: 'Total de títulos no mês.'
    },
    v_deck_color_stats: {
        month: 'Mês de referência para as estatísticas de cor.',
        format_code: 'Formato do metagame (ex: BT24, EX11).',
        color: 'Cor do deck (R/U/B/W/G/Y/P).',
        usage_percent:
            'Uso da cor no período (%): (resultados com a cor / total de resultados do período) x 100.',
        titles: 'Quantidade de Top 1 da cor no período.',
        top4_total: 'Quantidade de Top 4 da cor no período.',
        top_deck: 'Deck da cor que mais venceu no período.',
        top_deck_titles: 'Quantidade de títulos do deck líder.'
    },
    v_top_cards_by_month: {
        monthly_rank: 'Posição da carta no mês com base na presença em decklists Top 4.',
        card_name: 'Nome da carta.',
        total: 'Total de decklists Top 4 (1º ao 4º lugar) que contêm esta carta.',
        champion:
            'Decklists campeãs (1º lugar) que contêm esta carta. Não é o número de títulos da carta.',
        top2: 'Decklists que finalizaram em 2º lugar contendo esta carta.',
        top3: 'Decklists que finalizaram em 3º lugar contendo esta carta.',
        top4: 'Decklists que finalizaram em 4º lugar contendo esta carta.'
    },
    v_player_ranking: {
        unique_decks_used: 'Quantidade de decks diferentes usados pelo jogador.',
        last_event_date: 'Data mais recente em que o jogador apareceu.',
        overall_rank: 'Posição geral do jogador no ranking acumulado.'
    },
    v_store_champions: {
        store_title_share_percent:
            'Share de Títulos da Loja (%): (títulos do player na loja / total de títulos da loja) x 100.',
        store_rank: 'Posição do jogador no ranking interno da loja.'
    }
};
const STATISTICS_HIDDEN_COLUMNS = new Set([
    'id',
    'store_id',
    'tournament_id',
    'player_id',
    'deck_id',
    'format_id',
    'created_at',
    'updated_at'
]);
const PLAYER_RANKING_TABLE_COLUMNS = [
    'player',
    'overall_rank',
    'ranking_points',
    'titles',
    'top4_total',
    'entries',
    'unique_decks_used',
    'title_rate_percent'
];
const STATISTICS_REMOVED_COLUMNS = new Set([
    'top8_total',
    'top16_total',
    'top_cut_total',
    'top_cut_finishes',
    'top_cut_rate_percent',
    'top_cut_conversion_percent'
]);
const STATISTICS_VIEW_COLUMN_ORDER = {
    v_deck_representation: [
        'deck',
        'trend',
        'appearances',
        'tournaments_played',
        'unique_players',
        'titles',
        'top4_finishes',
        'avg_placement',
        'meta_share_percent'
    ],
    v_deck_stats: [
        'deck',
        'trend',
        'entries',
        'titles',
        'top4_total',
        'avg_placement',
        'performance_rank',
        'best_finish',
        'worst_finish',
        'title_rate_percent',
        'top4_rate_percent',
        'ranking_points'
    ],
    v_deck_color_stats: [
        'month',
        'format_code',
        'color',
        'usage_percent',
        'titles',
        'top4_total',
        'top_deck'
    ],
    v_meta_by_month: [
        'month',
        'format_code',
        'deck',
        'format_rank',
        'ranking_points',
        'titles',
        'top4_total',
        'appearances'
    ],
    v_top_cards_by_month: [
        'month',
        'monthly_rank',
        'card_name',
        'card_code',
        'is_staple',
        'card_type',
        'total',
        'champion',
        'top2',
        'top3',
        'top4'
    ],
    v_player_ranking: PLAYER_RANKING_TABLE_COLUMNS,
    v_store_champions: [
        'store',
        'store_rank',
        'player',
        'titles',
        'top4_total',
        'entries',
        'store_title_share_percent',
        'ranking_points'
    ]
};
function getTodayInSaoPaulo() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

let tournaments = [];
let filteredTournaments = [];
const tournamentChampionMap = new Map();
let currentSort = getSavedSort();
let currentPage = 1;
const PER_PAGE_OPTIONS = [5, 10, 15, 20, 25, 30, 50, 100];
const DEFAULT_PER_PAGE = 25;
let perPage = DEFAULT_PER_PAGE;
let createPlayers = [];
let createDecks = [];
let createStores = [];
let tournamentWeeklySchedule = [];
let createResults = [];
let createOcrImportInProgress = false;
let createDigilabImportInProgress = false;
let createOcrSelectedFiles = [];
let createOcrProcessedFiles = [];
let createTournamentSaveInProgress = false;
let selectedTournamentId = null;
let currentViewMode = getSavedViewMode();
let calendarMonthKey = '';
let currentDashboardView = 'tournaments';
let tournamentListNeedsRefresh = false;
let tournamentListRefreshPromise = null;
let digilabObservedCycleStart = null;
let digilabScheduledRefreshTimer = null;
let currentStatisticsView = getSavedStatisticsView();
let decksViewMounted = false;
let decksScriptsPromise = null;
let playersViewMounted = false;
let playersScriptsPromise = null;
let statisticsViewMounted = false;
let adminViewMounted = false;
let adminScriptsPromise = null;
let statisticsViewData = [];
let statisticsMonthlyRankingData = [];
let currentStatisticsSort = { column: '', direction: 'asc' };
let currentStatisticsMonthFilter = '';
let currentStatisticsStoreFilter = '';
let currentStatisticsFormatFilter = '';
let currentStatisticsDateFilter = '';
let currentStatisticsStapleFilter = '';
let currentStatisticsDeckFilter = '';
let statisticsTopCardsDeckNames = [];
let statisticsDeckSparklineData = new Map();
let statisticsColorData = [];
let statisticsDeckImageMap = new Map();
let statisticsDeckColorMap = new Map();
let currentMetaOverviewPeriod = 'all';
let hasManualMetaFormatSelection = false;
let hasManualMetaPeriodSelection = false;
let currentTopCardsPage = 1;
let currentStoreChampionsPlayerQuery = '';
const stapleTogglePendingCodes = new Set();
const TOP_CARDS_PER_PAGE = 10;
const topCardsNameCache = new Map();
const topCardsNameLookupAttempted = new Set();
let deckColorStatsSourceRows = [];
const storeLogoMap = new Map(); // normalized name → bucket URL
const DECK_COLOR_ORDER = ['r', 'u', 'y', 'g', 'b', 'p', 'w'];
const DECK_COLOR_LABELS = {
    r: 'Red',
    u: 'Blue',
    b: 'Black',
    w: 'White',
    g: 'Green',
    y: 'Yellow',
    p: 'Purple'
};
let tournamentFormatIdSupported = true;
const FALLBACK_FORMAT_OPTIONS = [
    { id: 1, code: 'BT23', isDefault: false },
    { id: 2, code: 'BT24', isDefault: false },
    { id: 3, code: 'EX11', isDefault: true }
];
let tournamentFormats = [];
let tournamentFormatCatalog = [];
let tournamentFormatsLoaded = false;

window.addEventListener('digistats:tournaments-changed', () => {
    tournamentListNeedsRefresh = true;
    if (currentDashboardView === 'tournaments') {
        void refreshTournamentListAfterExternalChange();
    }
});

// ============================================================
// FORMAT DATE FUNCTION
// ============================================================
function getSavedSort() {
    try {
        const raw = localStorage.getItem(SORT_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SORT };

        const parsed = JSON.parse(raw);
        const field = SORTABLE_FIELDS.includes(parsed?.field) ? parsed.field : DEFAULT_SORT.field;
        const direction = SORT_DIRECTIONS.includes(parsed?.direction)
            ? parsed.direction
            : DEFAULT_SORT.direction;

        return { field, direction };
    } catch (error) {
        return { ...DEFAULT_SORT };
    }
}

function saveSortPreference() {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(currentSort));
}

function getSavedPerPage() {
    try {
        const value = Number(localStorage.getItem(PER_PAGE_STORAGE_KEY));
        return PER_PAGE_OPTIONS.includes(value) ? value : DEFAULT_PER_PAGE;
    } catch (error) {
        return DEFAULT_PER_PAGE;
    }
}

function savePerPagePreference() {
    localStorage.setItem(PER_PAGE_STORAGE_KEY, String(perPage));
}

function getSavedViewMode() {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === 'calendar' ? 'calendar' : 'list';
}

function saveViewMode() {
    localStorage.setItem(VIEW_STORAGE_KEY, currentViewMode);
}

function getSavedDashboardView() {
    if (window.DIGISTATS_WORKSPACE_VIEW) return window.DIGISTATS_WORKSPACE_VIEW;
    const requested = new URLSearchParams(window.location.search).get('view');
    if (
        requested === 'tournaments' ||
        requested === 'decks' ||
        requested === 'players' ||
        requested === 'statistics' ||
        requested === 'admin'
    ) {
        return requested;
    }
    const saved = localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY);
    return saved === 'decks' || saved === 'players' || saved === 'statistics'
        ? saved
        : 'tournaments';
}

function saveDashboardViewPreference() {
    localStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, currentDashboardView);
}

function getSavedStatisticsView() {
    const saved = localStorage.getItem(STATS_VIEW_STORAGE_KEY);
    return STATISTICS_VIEWS.some((item) => item.value === saved) ? saved : DEFAULT_STATISTICS_VIEW;
}

function saveStatisticsViewPreference(value) {
    if (!STATISTICS_VIEWS.some((item) => item.value === value)) return;
    localStorage.setItem(STATS_VIEW_STORAGE_KEY, value);
}

function getSavedStatisticsColumnWidths() {
    try {
        const raw = localStorage.getItem(STATS_COLUMN_WIDTHS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function saveStatisticsColumnWidths(map) {
    try {
        localStorage.setItem(STATS_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(map || {}));
    } catch (_error) {}
}

function getStatisticsColumnWidth(viewName, column) {
    const map = getSavedStatisticsColumnWidths();
    const viewMap = map?.[viewName];
    if (!viewMap || typeof viewMap !== 'object') return null;
    const width = Number(viewMap[column]);
    return Number.isFinite(width) && width > 0 ? width : null;
}

function setStatisticsColumnWidth(viewName, column, width) {
    const px = Math.max(72, Math.min(720, Math.round(Number(width) || 0)));
    if (!Number.isFinite(px)) return;
    const map = getSavedStatisticsColumnWidths();
    const viewMap = map?.[viewName] && typeof map[viewName] === 'object' ? map[viewName] : {};
    viewMap[column] = px;
    map[viewName] = viewMap;
    saveStatisticsColumnWidths(map);
}

function clearStatisticsColumnWidth(viewName, column) {
    const map = getSavedStatisticsColumnWidths();
    const viewMap = map?.[viewName];
    if (!viewMap || typeof viewMap !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(viewMap, column)) return;
    delete viewMap[column];
    map[viewName] = viewMap;
    saveStatisticsColumnWidths(map);
}

function applyStatisticsColumnWidth(head, body, columnIndex, widthPx) {
    const width = Math.max(72, Math.min(720, Math.round(Number(widthPx) || 0)));
    if (!Number.isFinite(width)) return;
    const th = head.querySelector(`tr th:nth-child(${columnIndex + 1})`);
    if (th) {
        th.style.width = `${width}px`;
        th.style.minWidth = `${width}px`;
        th.style.maxWidth = `${width}px`;
    }
    body.querySelectorAll(`tr td:nth-child(${columnIndex + 1})`).forEach((td) => {
        td.style.width = `${width}px`;
        td.style.minWidth = `${width}px`;
        td.style.maxWidth = `${width}px`;
    });
}

function applySavedStatisticsColumnWidths(head, body, viewName, columns) {
    columns.forEach((column, index) => {
        const width = getStatisticsColumnWidth(viewName, column);
        if (width) applyStatisticsColumnWidth(head, body, index, width);
    });
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
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

function getResultPlacementClass(value) {
    const placement = Number(value);
    if (placement === 1) return 'result-placement-first';
    if (placement === 2) return 'result-placement-second';
    if (placement === 3) return 'result-placement-third';
    if (placement === 4) return 'result-placement-fourth';
    return 'result-placement-default';
}

function readTournamentFormatValue(inputId) {
    const input = document.getElementById(inputId);
    if (!input) {
        return { formatId: null, formatCode: '' };
    }

    const selectedOption = input.options?.[input.selectedIndex] || null;
    const rawFormatId = String(input.value || '').trim();
    if (!rawFormatId) {
        return { formatId: null, formatCode: '' };
    }

    if (rawFormatId.startsWith('code:')) {
        const fallbackCode = normalizeFormatCode(rawFormatId.replace(/^code:/, ''));
        return { formatId: null, formatCode: fallbackCode };
    }

    const formatId = Number(rawFormatId);
    const formatCode = normalizeFormatCode(
        selectedOption?.dataset?.formatCode || selectedOption?.textContent || ''
    );

    return {
        formatId: Number.isFinite(formatId) && formatId > 0 ? formatId : null,
        formatCode
    };
}

function assignTournamentFormat(payload, formatSelection) {
    const formatId = Number(formatSelection?.formatId);
    const nextPayload = { ...payload };

    if (tournamentFormatIdSupported) {
        nextPayload.format_id = Number.isFinite(formatId) && formatId > 0 ? formatId : null;
    }

    return nextPayload;
}

function normalizeFormatCode(value) {
    const raw = String(value || '')
        .trim()
        .toUpperCase();
    if (!raw) return '';
    const explicitCode = raw.match(/[A-Z]{1,4}-?\d{1,3}(?:\.\d+)?/);
    if (explicitCode?.[0]) return explicitCode[0].replace('-', '');
    return raw.replace(/[^A-Z0-9]/g, '');
}

function getDefaultTournamentFormatCode() {
    const preferred = tournamentFormats.find((item) => item.isDefault);
    if (preferred?.code) return preferred.code;
    return tournamentFormats[0]?.code || '';
}

function getTournamentFormatCode(tournament) {
    const relation = tournament?.format_ref;
    const relationCode = Array.isArray(relation) ? relation?.[0]?.code : relation?.code;
    const fromRelation = normalizeFormatCode(relationCode || '');
    if (fromRelation) return fromRelation;

    const fromDirect = normalizeFormatCode(tournament?.format_code || tournament?.format || '');
    if (fromDirect) return fromDirect;

    const formatId = Number(tournament?.format_id ?? tournament?.formar_id);
    if (Number.isFinite(formatId) && formatId > 0) {
        const byId = tournamentFormats.find((item) => Number(item?.id) === formatId);
        if (byId?.code) return normalizeFormatCode(byId.code);
    }

    return '';
}

async function loadTournamentFormats() {
    if (tournamentFormatsLoaded) return tournamentFormats;

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/formats?select=id,code,name,is_active,is_default,created_at&order=created_at.desc,id.desc`,
            { headers }
        );

        if (!res.ok) throw new Error(`Erro ao carregar formatos (${res.status})`);

        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) {
            tournamentFormats = FALLBACK_FORMAT_OPTIONS.map((item) => ({
                id: item.id,
                code: item.code,
                label: item.code,
                isDefault: item.isDefault
            }));
            tournamentFormatsLoaded = true;
            return tournamentFormats;
        }

        tournamentFormatCatalog = rows;
        tournamentFormats = rows
            .filter((row) => row.is_active !== false)
            .map((row) => {
                const code = normalizeFormatCode(row?.code);
                if (!code) return null;
                const name = String(row?.name || '').trim();
                const normalizedName = normalizeFormatCode(name);
                return {
                    id: Number.isFinite(Number(row?.id)) ? Number(row.id) : null,
                    code,
                    created_at: row.created_at,
                    name,
                    label: name && normalizedName !== code ? `${name} - ${code}` : code,
                    isDefault: row?.is_default === true
                };
            })
            .filter(Boolean);

        tournamentFormatsLoaded = true;
    } catch (err) {
        console.warn(err);
        tournamentFormats = FALLBACK_FORMAT_OPTIONS.map((item) => ({
            id: item.id,
            code: item.code,
            label: item.code,
            isDefault: item.isDefault
        }));
        tournamentFormatsLoaded = true;
    }

    return tournamentFormats;
}

function populateTournamentFormatSelect(selectId, options = {}) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const selectedValue = normalizeFormatCode(options.selectedValue || '');
    const selectedId = Number(options.selectedId);
    const includeBlank = options.includeBlank !== false;
    const optionItems = [];
    tournamentFormats.forEach((format) => {
        if (!format?.code) return;
        optionItems.push({
            id: Number.isFinite(Number(format.id)) ? Number(format.id) : null,
            code: format.code,
            created_at: format.created_at,
            label: format.label || format.code
        });
    });

    if (selectedValue && !optionItems.some((item) => item.code === selectedValue)) {
        optionItems.push({
            id: null,
            code: selectedValue,
            label: `${selectedValue} (code only)`
        });
    }

    select.innerHTML = '';
    if (includeBlank) {
        const blankOption = document.createElement('option');
        blankOption.value = '';
        blankOption.textContent = 'Selecione o formato...';
        select.appendChild(blankOption);
    }

    const sortedItems = optionItems.sort(
        (a, b) =>
            String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
            b.code.localeCompare(a.code)
    );
    sortedItems.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id ? String(item.id) : `code:${item.code}`;
        option.dataset.formatCode = item.code;
        option.textContent = item.label;
        select.appendChild(option);
    });

    if (Number.isFinite(selectedId) && selectedId > 0) {
        const idMatch = sortedItems.find((item) => item.id === selectedId);
        if (idMatch) {
            select.value = String(selectedId);
            return;
        }
    }

    if (selectedValue) {
        const codeMatch = sortedItems.find((item) => item.code === selectedValue);
        if (codeMatch && codeMatch.id) {
            select.value = String(codeMatch.id);
            return;
        }
        if (codeMatch && !codeMatch.id) {
            select.value = `code:${codeMatch.code}`;
            return;
        }
    }

    const defaultCode = getDefaultTournamentFormatCode();
    const defaultItem = sortedItems.find((item) => item.code === defaultCode && item.id);
    if (defaultItem) {
        select.value = String(defaultItem.id);
        return;
    }
    const defaultCodeOnlyItem = sortedItems.find((item) => item.code === defaultCode && !item.id);
    if (defaultCodeOnlyItem) {
        select.value = `code:${defaultCodeOnlyItem.code}`;
        return;
    }

    if (includeBlank) {
        select.value = '';
    } else if (sortedItems[0]?.id) {
        select.value = String(sortedItems[0].id);
    }
}

function getAssetPrefix() {
    return window.location.pathname.includes('/torneios/list-tournaments/') ? '../../' : '';
}

function extractDeckCodeFromImageUrl(imageUrl) {
    const match = String(imageUrl || '').match(/\/([A-Z0-9-]+)\.webp(?:$|\?)/i);
    return match ? String(match[1]).toUpperCase() : '';
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

// ============================================================
// INIT - DOMContentLoaded
// ============================================================
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
        window.__storeLogoMap = storeLogoMap;
    } catch {
        /* silent — falls back to local icons */
    }
}

function setTournamentFormDirty(mode, isDirty) {
    const indicator = document.getElementById(`${mode}TournamentDirtyIndicator`);
    indicator?.classList.toggle('is-visible', Boolean(isDirty));
}

function updateTournamentPlayerCount(mode, count) {
    const value = Math.max(0, Number(count) || 0);
    const team = window.tournamentUtils?.isTeamTournament(
        document.getElementById(`${mode}TournamentName`)?.value
    );
    const counter = document.getElementById(`${mode}TournamentPlayerCount`);
    if (counter)
        counter.textContent = team
            ? `${value / 2} ${value === 2 ? 'dupla' : 'duplas'} · ${value} jogadores`
            : `${value} ${value === 1 ? 'jogador' : 'jogadores'}`;
}
window.updateTournamentPlayerCount = updateTournamentPlayerCount;

function enhanceTournamentFormLayout(mode) {
    const isCreate = mode === 'create';
    const form = document.getElementById(`${mode}TournamentForm`);
    if (!form || form.dataset.layoutEnhanced === 'true') return;
    const ids = isCreate
        ? {
              store: 'createStoreSelect',
              date: 'createTournamentDate',
              name: 'createTournamentName',
              format: 'createTournamentFormat',
              total: 'createTotalPlayers',
              instagram: 'createInstagramLink',
              rows: 'createResultsRows',
              add: 'btnAddResultRow',
              ocr: 'createOcrFilesInput'
          }
        : {
              store: 'editStoreSelect',
              date: 'editTournamentDate',
              name: 'editTournamentName',
              format: 'editTournamentFormat',
              total: 'editTotalPlayers',
              instagram: 'editInstagramLink',
              rows: 'editResultsRows',
              add: 'btnAddEditResultRow',
              ocr: 'editOcrFilesInput'
          };
    const groupFor = (id) => document.getElementById(id)?.closest('.form-group');
    const generalGroups = [
        ['store', groupFor(ids.store)],
        ['date', groupFor(ids.date)],
        ['name', groupFor(ids.name)],
        ['format', groupFor(ids.format)]
    ].filter(([, group]) => group);
    const totalGroup = groupFor(ids.total);
    const instagramGroup = groupFor(ids.instagram);
    const resultsGroup = groupFor(ids.rows);
    const ocrGroup = groupFor(ids.ocr);
    const actions = form.querySelector(':scope > .modal-actions');
    if (!generalGroups.length || !instagramGroup || !resultsGroup || !ocrGroup || !actions) return;

    const title = form.closest('.modal-content')?.querySelector('.modal-header h2');
    if (title && !title.querySelector('.tournament-dirty-indicator')) {
        const dirty = document.createElement('span');
        dirty.id = `${mode}TournamentDirtyIndicator`;
        dirty.className = 'tournament-dirty-indicator';
        dirty.textContent = 'Alteracoes nao salvas';
        title.appendChild(dirty);
    }

    const nav = document.createElement('nav');
    nav.className = 'tournament-mobile-jump-nav';
    nav.setAttribute('aria-label', 'Navegar pelo formulario');
    nav.innerHTML = `
        <button type="button" data-tournament-jump="${mode}TournamentOcrSection">Importar</button>
        <button type="button" data-tournament-jump="${mode}TournamentResultsSection">Classificação</button>
        <button type="button" data-tournament-jump="${mode}TournamentGeneralSection">Dados</button>`;

    const general = document.createElement('section');
    general.id = `${mode}TournamentGeneralSection`;
    general.className = 'tournament-general-section tournament-general-grid';
    const generalTitle = document.createElement('h3');
    generalTitle.className = 'tournament-section-title';
    generalTitle.textContent = 'Dados do torneio';
    general.appendChild(generalTitle);
    generalGroups.forEach(([key, group]) => {
        group.classList.add(`tournament-field-${key}`);
        general.appendChild(group);
    });

    resultsGroup.id = `${mode}TournamentResultsSection`;
    resultsGroup.classList.add('tournament-results-section');
    resultsGroup.querySelector(':scope > label')?.remove();
    const rows = document.getElementById(ids.rows);
    const addButton = document.getElementById(ids.add);
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'tournament-results-header';
    resultsHeader.innerHTML = `
        <strong>Classificação</strong>
        <span id="${mode}TournamentPlayerCount" class="tournament-player-count">0 jogadores</span>`;
    if (addButton) {
        addButton.textContent = '+ Jogador';
        resultsHeader.appendChild(addButton);
        resultsHeader.appendChild(resultsHeader.querySelector('.tournament-player-count'));
    }
    const columns = document.createElement('div');
    columns.className = 'tournament-results-columns';
    columns.innerHTML =
        '<span>#</span><span>Jogador</span><span>Deck</span><span>Pontos</span><span>Acoes</span>';
    resultsGroup.insertBefore(resultsHeader, rows);
    resultsGroup.insertBefore(columns, rows);
    if (totalGroup) {
        totalGroup.classList.add('tournament-total-derived');
        totalGroup.setAttribute('aria-hidden', 'true');
        document.getElementById(ids.total)?.removeAttribute('required');
        resultsGroup.appendChild(totalGroup);
    }
    resultsGroup.querySelector(':scope > .field-hint')?.remove();

    instagramGroup.classList.add('tournament-instagram-section');
    const instagramDetails = document.createElement('details');
    instagramDetails.id = `${mode}TournamentInstagramSection`;
    instagramDetails.className = 'tournament-instagram-details';
    const instagramSummary = document.createElement('summary');
    instagramSummary.textContent = 'Adicionar link do Instagram (opcional)';
    instagramDetails.append(instagramSummary, instagramGroup);

    const ocrDetails = document.createElement('details');
    ocrDetails.id = `${mode}TournamentOcrSection`;
    ocrDetails.className = 'tournament-ocr-section';
    ocrDetails.open = isCreate;
    const summary = document.createElement('summary');
    summary.innerHTML = isCreate
        ? '<strong>Importar dados</strong><span>DigiLab ou print da Bandai</span>'
        : '<strong>Importar print da Bandai TCG+</strong><span>Preenchimento automático</span>';
    ocrGroup.querySelector(':scope > label')?.remove();
    ocrDetails.append(summary, ocrGroup);

    if (window.DIGISTATS_NATIVE_V2) {
        ocrDetails.open = false;
        form.insertBefore(general, actions);
        form.insertBefore(ocrDetails, actions);
        form.insertBefore(resultsGroup, actions);
    } else {
        form.insertBefore(nav, actions);
        form.insertBefore(ocrDetails, actions);
        form.insertBefore(resultsGroup, actions);
        form.insertBefore(general, actions);
    }
    form.insertBefore(instagramDetails, actions);
    const cancel = actions.querySelector('.btn-cancel');
    const save = actions.querySelector('.btn-save');
    if (cancel) actions.appendChild(cancel);
    if (save) actions.appendChild(save);

    const navButtons = [...nav.querySelectorAll('[data-tournament-jump]')];
    const setActiveSection = (sectionId) => {
        navButtons.forEach((button) => {
            const isActive = button.dataset.tournamentJump === sectionId;
            button.classList.toggle('is-active', isActive);
            if (isActive) button.setAttribute('aria-current', 'location');
            else button.removeAttribute('aria-current');
        });
    };
    const trackedSections = [ocrDetails, resultsGroup, general];
    let scrollFrame = null;
    const updateActiveSection = () => {
        scrollFrame = null;
        const formTop = form.getBoundingClientRect().top;
        const marker = formTop + nav.offsetHeight + 28;
        let activeSection = trackedSections[0];
        trackedSections.forEach((section) => {
            if (section.getBoundingClientRect().top <= marker) activeSection = section;
        });
        setActiveSection(activeSection.id);
    };
    const scheduleActiveSectionUpdate = () => {
        if (scrollFrame !== null) return;
        scrollFrame = window.requestAnimationFrame(updateActiveSection);
    };

    navButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const sectionId = button.dataset.tournamentJump || '';
            setActiveSection(sectionId);
            document.getElementById(sectionId)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });
    form.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true });
    setActiveSection(ocrDetails.id);
    form.addEventListener('input', () => setTournamentFormDirty(mode, true));
    form.addEventListener('change', () => setTournamentFormDirty(mode, true));
    form.dataset.layoutEnhanced = 'true';
}

function setupTournamentModalLayouts() {
    enhanceTournamentFormLayout('create');
    enhanceTournamentFormLayout('edit');
}

async function initializeTournamentTools() {
    setupTournamentModalLayouts();
    setupDigilabSyncCountdown();
    setupPerPageSelector();
    setupViewToggle();
    bindStaticActions();
    setupDashboardViewSwitching();
    setupMobileDashboardShell();
    setupMobileTournamentToolbar();
    await waitForMobileShellFirstPaint();
    loadStoreLogos();
    await Promise.all([loadTournaments(), loadTournamentFormats()]);
    populateTournamentFormatSelect('createTournamentFormat');
    populateTournamentFormatSelect('editTournamentFormat');
    setupFilters();
    setupSorting();
    applyFilters();
    await restoreDashboardReturnContext();

    // Event listeners for create modal
    document
        .getElementById('btnCreateTournament')
        .addEventListener('click', openCreateTournamentModal);
    document
        .getElementById('btnCreateTournamentMobile')
        ?.addEventListener('click', openCreateTournamentModal);

    // Submit create form
    document
        .getElementById('createTournamentForm')
        .addEventListener('submit', createTournamentFormSubmit);
    document.getElementById('btnAddResultRow').addEventListener('click', addCreateResultRow);
    document
        .getElementById('createTournamentName')
        .addEventListener('change', renderCreateResultsRows);
    document
        .getElementById('createTotalPlayers')
        .addEventListener('input', syncCreateResultsByTotal);
    document.getElementById('createTournamentDate').addEventListener('change', (event) => {
        applyScheduledStoreToCreate(event.target.value);
    });
    const btnSelectOcrPrints = document.getElementById('btnSelectOcrPrints');
    const btnProcessOcrPrints = document.getElementById('btnProcessOcrPrints');
    const createOcrFilesInput = document.getElementById('createOcrFilesInput');
    const btnImportCreateDigilab = document.getElementById('btnImportCreateDigilab');
    const createDigilabTournamentUrl = document.getElementById('createDigilabTournamentUrl');
    if (btnImportCreateDigilab && createDigilabTournamentUrl) {
        btnImportCreateDigilab.addEventListener('click', importCreateTournamentFromDigilab);
        createDigilabTournamentUrl.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            importCreateTournamentFromDigilab();
        });
    }
    if (btnSelectOcrPrints && createOcrFilesInput) {
        btnSelectOcrPrints.addEventListener('click', () => {
            if (createOcrImportInProgress) return;
            createOcrFilesInput.click();
        });
        if (btnProcessOcrPrints) {
            btnProcessOcrPrints.addEventListener('click', processCreateOcrFiles);
        }
        createOcrFilesInput.addEventListener('change', onCreateOcrFilesSelected);
        setupCreateOcrDropZone(btnSelectOcrPrints.closest('.ocr-import-actions'));
    }

    // Submit edit form
    document
        .getElementById('editTournamentForm')
        .addEventListener('submit', editTournamentFormSubmit);
    window.digistatsToolsReady = true;
    window.dispatchEvent(new CustomEvent('digistats:tools-ready'));
}
window.initializeTournamentTools = initializeTournamentTools;
if (!window.DIGISTATS_MICRO_FRONTENDS)
    document.addEventListener('DOMContentLoaded', initializeTournamentTools);

function waitForMobileShellFirstPaint() {
    if (!window.matchMedia?.('(max-width: 768px)').matches) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        window.requestAnimationFrame(() => {
            document.body.classList.add('mobile-shell-ready');
            window.requestAnimationFrame(resolve);
        });
    });
}

async function restoreDashboardReturnContext() {
    const params = new URLSearchParams(window.location.search);
    const requestedView =
        params.get('view') ||
        (window.DIGISTATS_MICRO_FRONTENDS && params.has('returnTournamentId')
            ? 'tournaments'
            : null);
    const tournamentId = String(params.get('returnTournamentId') || '').trim();
    const requestedMode = params.get('returnMode');

    if (
        requestedView === 'tournaments' ||
        requestedView === 'decks' ||
        requestedView === 'players' ||
        requestedView === 'statistics'
    ) {
        await switchDashboardView(requestedView);
    }

    if (requestedView === 'tournaments' && tournamentId) {
        const tournament = tournaments.find((item) => String(item.id) === tournamentId);
        if (tournament) {
            if (requestedMode === 'calendar') {
                currentViewMode = 'calendar';
                saveViewMode();
                renderCurrentView();
                openCalendarTournamentDetails(tournament);
            } else {
                currentViewMode = 'list';
                saveViewMode();
                selectedTournamentId = tournament.id;
                renderCurrentView();
                await renderTournamentDetails(tournament);
            }
        }
    }

    if (requestedView || tournamentId || requestedMode) {
        if (!window.DIGISTATS_NATIVE_V2) params.delete('view');
        params.delete('returnTournamentId');
        params.delete('returnMode');
        const query = params.toString();
        window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
        );
    }
}

function bindStaticActions() {
    const btnCreateCancel = document.getElementById('btnCreateCancel');
    const btnEditCancel = document.getElementById('btnEditCancel');

    if (btnCreateCancel) {
        btnCreateCancel.addEventListener('click', closeCreateModal);
    }
    if (btnEditCancel) {
        btnEditCancel.addEventListener('click', closeEditModal);
    }
    const btnEditModalCloseX = document.getElementById('btnEditModalCloseX');
    if (btnEditModalCloseX) {
        btnEditModalCloseX.addEventListener('click', closeEditModal);
    }
}

// ============================================================
// CARREGAMENTO DE TORNEIOS
// ============================================================
async function loadTournaments() {
    try {
        const baseSelect =
            'id,store_id,tournament_date,store:stores(name),tournament_name,total_players,instagram_link';
        const selectWithFormatAndId = `${baseSelect},format_id,format_ref:formats!tournament_format_id_fkey(code)`;
        const selectWithFormatId = `${baseSelect},format_id`;
        const selectWithLegacyFormatId = `${baseSelect},formar_id`;
        let usedLegacyFormatId = false;
        let res = await fetch(
            `${SUPABASE_URL}/rest/v1/tournament?select=${encodeURIComponent(selectWithFormatAndId)}&order=tournament_date.desc`,
            { headers }
        );
        if (!res.ok) {
            res = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament?select=${encodeURIComponent(selectWithFormatId)}&order=tournament_date.desc`,
                { headers }
            );
        }
        if (!res.ok) {
            res = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament?select=${encodeURIComponent(selectWithLegacyFormatId)}&order=tournament_date.desc`,
                { headers }
            );
            if (res.ok) {
                usedLegacyFormatId = true;
            }
        }
        if (!res.ok) {
            res = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament?select=${encodeURIComponent(baseSelect)}&order=tournament_date.desc`,
                { headers }
            );
            tournamentFormatIdSupported = false;
        } else {
            tournamentFormatIdSupported = true;
        }
        if (!res.ok) throw new Error('Erro ao carregar torneios.');
        const rows = await res.json();
        tournaments = (Array.isArray(rows) ? rows : []).map((row) => ({
            ...row,
            format_id: row?.format_id ?? row?.formar_id ?? null
        }));
        if (usedLegacyFormatId) {
            tournamentFormatIdSupported = false;
        }
        await loadTournamentChampions();
        populateFilterOptions();
    } catch (err) {
        console.error(err);
        alert('Falha ao carregar dados.');
    }
}

async function refreshTournamentListAfterExternalChange() {
    if (!tournamentListNeedsRefresh) return;
    if (tournamentListRefreshPromise) return tournamentListRefreshPromise;

    tournamentListRefreshPromise = (async () => {
        do {
            tournamentListNeedsRefresh = false;
            await loadTournaments();
            applyFilters();
        } while (tournamentListNeedsRefresh && currentDashboardView === 'tournaments');
    })();

    try {
        await tournamentListRefreshPromise;
    } finally {
        tournamentListRefreshPromise = null;
    }
}

function getDigilabCycleStart(timestamp = Date.now()) {
    return (
        Math.floor((timestamp - DIGILAB_BACKGROUND_OFFSET_MS) / DIGILAB_BACKGROUND_INTERVAL_MS) *
            DIGILAB_BACKGROUND_INTERVAL_MS +
        DIGILAB_BACKGROUND_OFFSET_MS
    );
}

function refreshTournamentListAfterScheduledDigilabSync() {
    digilabScheduledRefreshTimer = null;
    tournamentListNeedsRefresh = true;
    if (currentDashboardView === 'tournaments') {
        void refreshTournamentListAfterExternalChange();
    }
}

function scheduleTournamentRefreshForDigilabCycle(cycleStart, now = Date.now()) {
    if (digilabScheduledRefreshTimer) clearTimeout(digilabScheduledRefreshTimer);
    const refreshAt = cycleStart + DIGILAB_BACKGROUND_REFRESH_DELAY_MS;
    const delay = Math.max(0, refreshAt - now);
    digilabScheduledRefreshTimer = setTimeout(
        refreshTournamentListAfterScheduledDigilabSync,
        delay
    );
}

function updateDigilabSyncCountdown() {
    const countdown = document.getElementById('digilabSyncCountdown');
    const hint = document.getElementById('digilabSyncCountdownHint');
    if (!countdown || !hint) return;

    const now = Date.now();
    const cycleStart = getDigilabCycleStart(now);
    const elapsedInCycle = now - cycleStart;
    if (digilabObservedCycleStart === null) {
        digilabObservedCycleStart = cycleStart;
        if (elapsedInCycle < DIGILAB_BACKGROUND_REFRESH_DELAY_MS) {
            scheduleTournamentRefreshForDigilabCycle(cycleStart, now);
        }
    } else if (cycleStart > digilabObservedCycleStart) {
        digilabObservedCycleStart = cycleStart;
        scheduleTournamentRefreshForDigilabCycle(cycleStart, now);
    }

    if (elapsedInCycle < DIGILAB_BACKGROUND_REFRESH_DELAY_MS) {
        countdown.textContent = 'Atualizando…';
        hint.textContent = 'Consultando novos torneios';
        return;
    }

    const nextCycle = cycleStart + DIGILAB_BACKGROUND_INTERVAL_MS;
    const remainingSeconds = Math.max(0, Math.ceil((nextCycle - now) / 1000));
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    countdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    hint.textContent = 'Próxima busca automática';
}

function setupDigilabSyncCountdown() {
    if (!document.getElementById('digilabSyncCountdown')) return;
    updateDigilabSyncCountdown();
    window.setInterval(updateDigilabSyncCountdown, 1000);
}

async function reloadTournamentsAfterEdit(tournamentId) {
    const targetId = String(tournamentId || '');
    const shouldRestoreListDetails =
        currentViewMode === 'list' && String(selectedTournamentId || '') === targetId;
    const shouldRestoreCalendarDetails =
        currentViewMode === 'calendar' &&
        Boolean(document.getElementById('calendarTournamentDetails')?.innerHTML.trim());

    await loadTournaments();
    applyFilters();

    const refreshedTournament = tournaments.find((item) => String(item?.id || '') === targetId);
    if (!refreshedTournament) return;

    if (shouldRestoreListDetails) {
        await renderTournamentDetails(refreshedTournament);
    } else if (shouldRestoreCalendarDetails) {
        openCalendarTournamentDetails(refreshedTournament);
    }
}

async function reloadTournamentsAfterDelete(tournamentId) {
    if (String(selectedTournamentId || '') === String(tournamentId || '')) {
        selectedTournamentId = null;
    }
    clearTournamentDetails();
    clearCalendarExpandedDetails();
    await loadTournaments();
    applyFilters();
}

async function loadTournamentChampions() {
    tournamentChampionMap.clear();
    try {
        const select = encodeURIComponent('tournament_id,store_id,tournament_date,player,deck');
        let response = await fetch(
            `${SUPABASE_URL}/rest/v1/v_podium_full?select=${select}&placement=eq.1&limit=5000`,
            { headers }
        );
        let rows = [];
        if (response.ok) {
            rows = await response.json();
        } else {
            const fallbackSelect = encodeURIComponent(
                'tournament_id,store_id,tournament_date,player:players(name),deck:decks(name)'
            );
            response = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament_results?select=${fallbackSelect}&placement=eq.1&limit=5000`,
                { headers }
            );
            if (!response.ok) return;
            rows = await response.json();
        }
        (Array.isArray(rows) ? rows : []).forEach((row) => {
            const champion = {
                player: String(row?.player?.name || row?.player || '').trim(),
                deck: String(row?.deck?.name || row?.deck || '').trim()
            };
            if (row?.tournament_id !== null && row?.tournament_id !== undefined) {
                tournamentChampionMap.set(`id:${String(row.tournament_id)}`, champion);
            }
            tournamentChampionMap.set(
                `legacy:${String(row?.store_id || '')}:${String(row?.tournament_date || '')}`,
                champion
            );
        });
    } catch (error) {
        console.warn('Não foi possível carregar os campeões para os cartões mobile.', error);
    }
}

function getTournamentChampion(tournament) {
    return (
        tournamentChampionMap.get(`id:${String(tournament?.id || '')}`) ||
        tournamentChampionMap.get(
            `legacy:${String(tournament?.store_id || '')}:${String(tournament?.tournament_date || '')}`
        ) ||
        null
    );
}

function setupFilters() {
    const filterStore = document.getElementById('filterStore');
    const filterTournamentName = document.getElementById('filterTournamentName');
    const filterInstagram = document.getElementById('filterInstagram');
    const filterMonthYear = document.getElementById('filterMonthYear');
    const btnClearFilters = document.getElementById('btnClearFilters');
    const btnResetFilters = document.getElementById('btnResetFilters');
    const btnMobileFilters = document.getElementById('btnMobileFilters');
    const mobileFilterCount = document.getElementById('mobileFilterCount');
    const filtersRow = document.querySelector('.filters-row');

    const getActiveFilterCount = () =>
        [filterStore, filterTournamentName, filterInstagram, filterMonthYear].filter((input) =>
            Boolean(input?.value)
        ).length;
    const updateFilterToggle = () => {
        const count = getActiveFilterCount();
        const label = btnClearFilters?.querySelector('.filter-toggle-label');
        if (label) label.textContent = count ? `Filtros (${count})` : 'Filtros';
        if (mobileFilterCount) {
            mobileFilterCount.textContent = String(count);
            mobileFilterCount.hidden = count === 0;
        }
        filtersRow?.classList.toggle('has-active-filters', count > 0);
        if (btnResetFilters) btnResetFilters.disabled = count === 0;
    };
    const resetFilters = () => {
        if (filterStore) filterStore.value = '';
        if (filterTournamentName) filterTournamentName.value = '';
        if (filterInstagram) filterInstagram.value = '';
        if (filterMonthYear) filterMonthYear.value = '';
        calendarMonthKey = '';
        applyFilters();
        updateFilterToggle();
        filtersRow?.classList.remove('filters-expanded');
        btnMobileFilters?.setAttribute('aria-expanded', 'false');
    };
    const applyAndUpdateFilters = () => {
        applyFilters();
        updateFilterToggle();
    };

    if (filterStore) filterStore.addEventListener('change', applyAndUpdateFilters);
    if (filterTournamentName)
        filterTournamentName.addEventListener('change', applyAndUpdateFilters);
    if (filterInstagram) filterInstagram.addEventListener('change', applyAndUpdateFilters);
    if (filterMonthYear) {
        filterMonthYear.addEventListener('change', () => {
            calendarMonthKey = filterMonthYear.value || '';
            applyAndUpdateFilters();
        });
    }
    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', () => {
            resetFilters();
        });
    }
    btnMobileFilters?.addEventListener('click', () => {
        const expanded = !filtersRow?.classList.contains('filters-expanded');
        filtersRow?.classList.toggle('filters-expanded', expanded);
        btnMobileFilters.setAttribute('aria-expanded', String(expanded));
    });
    btnResetFilters?.addEventListener('click', resetFilters);
    updateFilterToggle();
}

function populateFilterOptions() {
    const filterStore = document.getElementById('filterStore');
    const filterTournamentName = document.getElementById('filterTournamentName');
    const filterMonthYear = document.getElementById('filterMonthYear');
    if (!filterStore || !filterTournamentName) return;

    const selectedStore = filterStore.value;
    const selectedName = filterTournamentName.value;
    const selectedMonthYear = filterMonthYear?.value || '';

    const storesMap = new Map();
    tournaments.forEach((t) => {
        if (t.store_id && t.store?.name) storesMap.set(String(t.store_id), t.store.name);
    });
    const stores = Array.from(storesMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

    filterStore.innerHTML =
        `<option value="">Todas as lojas</option>` +
        stores.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
    if (selectedStore && storesMap.has(String(selectedStore)))
        filterStore.value = String(selectedStore);

    filterTournamentName.innerHTML =
        `<option value="">Todos os tipos</option>` +
        TOURNAMENT_NAME_OPTIONS.map((name) => `<option value="${name}">${name}</option>`).join('');
    if (selectedName && TOURNAMENT_NAME_OPTIONS.includes(selectedName))
        filterTournamentName.value = selectedName;

    if (filterMonthYear) {
        const monthKeys = Array.from(
            new Set(tournaments.map((t) => getMonthYearKey(t.tournament_date)).filter(Boolean))
        ).sort((a, b) => b.localeCompare(a));

        filterMonthYear.innerHTML =
            `<option value="">Todos os meses</option>` +
            monthKeys
                .map((key) => `<option value="${key}">${formatMonthYearLabel(key)}</option>`)
                .join('');
        if (selectedMonthYear && monthKeys.includes(selectedMonthYear))
            filterMonthYear.value = selectedMonthYear;
    }
}

function getFilteredTournaments() {
    const filterStore = document.getElementById('filterStore')?.value || '';
    const filterTournamentName = document.getElementById('filterTournamentName')?.value || '';
    const filterInstagram = document.getElementById('filterInstagram')?.value || '';
    const filterMonthYear = document.getElementById('filterMonthYear')?.value || '';

    return tournaments.filter((t) => {
        const byStore = !filterStore || String(t.store_id) === String(filterStore);
        const byName = !filterTournamentName || (t.tournament_name || '') === filterTournamentName;
        const hasInstagramLink = Boolean((t.instagram_link || '').trim());
        const byInstagram =
            !filterInstagram ||
            (filterInstagram === 'with_link' && hasInstagramLink) ||
            (filterInstagram === 'without_link' && !hasInstagramLink);
        const byMonthYear =
            !filterMonthYear || getMonthYearKey(t.tournament_date) === filterMonthYear;
        return byStore && byName && byInstagram && byMonthYear;
    });
}

function getMonthYearKey(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';
    const parts = dateString.split('-');
    if (parts.length < 2) return '';
    const year = parts[0];
    const month = parts[1];
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) return '';
    return `${year}-${month}`;
}

function formatMonthYearLabel(monthKey) {
    const parts = String(monthKey).split('-');
    if (parts.length !== 2) return monthKey;
    const year = parts[0];
    const monthIndex = Number(parts[1]) - 1;
    const monthName = MONTH_NAMES_PT[monthIndex] || parts[1];
    return `${monthName} ${year}`;
}

function openPostGeneratorWithTournamentData(tournament, results, totalPlayers) {
    if (window.DIGISTATS_MICRO_FRONTENDS) {
        window.digistatsNavigate('posts', { tournament: String(tournament.id) });
        return;
    }
    const formatCode = getTournamentFormatCode(tournament);
    const tournamentDataForCanvas = {
        topFour: (results || []).slice(0, 4).map((item) => ({
            result_id: item.id || '',
            placement: Number(item.placement),
            deck: item.deck || '-',
            player: item.player || '-',
            image_url: item.image_url || ''
        })),
        tournamentId: String(tournament.id || ''),
        storeId: String(tournament.store_id || ''),
        tournamentDate: String(tournament.tournament_date || ''),
        pieStateKey: String(
            tournament.id ||
                `${String(tournament.store_id || '')}-${String(tournament.tournament_date || '')}`
        ),
        storeName: tournament.store?.name || 'Loja',
        tournamentName: tournament.tournament_name || 'Torneio',
        format: formatCode || '',
        dateStr: formatDate(tournament.tournament_date),
        totalPlayers: Number(totalPlayers) || 0,
        allResults: (results || []).map((item) => ({
            result_id: item.id || '',
            placement: Number(item.placement),
            deck: item.deck || '-',
            player: item.player || '-',
            image_url: item.image_url || ''
        }))
    };

    try {
        const previewState = { tournamentDataForCanvas };
        localStorage.setItem(POST_PREVIEW_STATE_KEY, JSON.stringify(previewState));
        const previewData = encodeURIComponent(JSON.stringify(previewState));
        window.open(
            `${getAssetPrefix()}post-preview/index.html?postPreview=1&previewData=${previewData}`,
            '_blank'
        );
    } catch (error) {
        console.error(error);
        alert('Falha ao abrir o gerador de post.');
    }
}

function applyFilters() {
    filteredTournaments = sortTournaments(getFilteredTournaments());
    currentPage = 1;

    if (
        selectedTournamentId &&
        !filteredTournaments.some((t) => String(t.id) === String(selectedTournamentId))
    ) {
        selectedTournamentId = null;
        clearTournamentDetails();
    }

    if (currentDashboardView !== 'tournaments') {
        return;
    }

    renderCurrentView();
}

function setupViewToggle() {
    const button = document.getElementById('btnToggleView');
    if (!button) return;
    button.addEventListener('click', () => {
        currentViewMode = currentViewMode === 'list' ? 'calendar' : 'list';
        saveViewMode();
        if (currentViewMode === 'calendar') ensureCalendarMonthKey();
        renderCurrentView();
    });
}

function getAvailableCalendarMonthKeys() {
    return Array.from(
        new Set(
            (filteredTournaments || [])
                .map((t) => getMonthYearKey(t.tournament_date))
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));
}

function ensureCalendarMonthKey() {
    const available = getAvailableCalendarMonthKeys();
    if (!available.length) {
        calendarMonthKey = '';
        return;
    }

    const selected = document.getElementById('filterMonthYear')?.value || '';
    if (selected && available.includes(selected)) {
        calendarMonthKey = selected;
        return;
    }

    if (calendarMonthKey && available.includes(calendarMonthKey)) return;

    calendarMonthKey = available[available.length - 1];
}

function moveCalendarMonth(step) {
    const available = getAvailableCalendarMonthKeys();
    if (!available.length) return;
    const currentIndex = available.indexOf(calendarMonthKey);
    if (currentIndex < 0) {
        calendarMonthKey = available[available.length - 1];
        clearCalendarExpandedDetails();
        renderCalendarView();
        return;
    }
    const nextIndex = currentIndex + step;
    if (nextIndex < 0 || nextIndex >= available.length) return;
    calendarMonthKey = available[nextIndex];
    clearCalendarExpandedDetails();
    renderCalendarView();
}

function clearCalendarExpandedDetails() {
    const details = document.getElementById('calendarTournamentDetails');
    if (!details) return;
    details.innerHTML = '';
    details.classList.add('is-hidden');
}

function moveCalendarYear(step) {
    const available = getAvailableCalendarMonthKeys();
    if (!available.length || !calendarMonthKey) return;

    const [yearStr, monthStr] = calendarMonthKey.split('-');
    const currentYear = Number(yearStr);
    const currentMonth = Number(monthStr);
    if (!Number.isInteger(currentYear) || !Number.isInteger(currentMonth)) return;

    const targetYears = Array.from(new Set(available.map((key) => Number(key.split('-')[0]))))
        .filter((year) => Number.isInteger(year))
        .sort((a, b) => a - b);

    const targetYear =
        step < 0
            ? [...targetYears].reverse().find((year) => year < currentYear)
            : targetYears.find((year) => year > currentYear);
    if (!targetYear) return;

    const monthsInYear = available
        .filter((key) => Number(key.split('-')[0]) === targetYear)
        .map((key) => ({ key, month: Number(key.split('-')[1]) }))
        .sort((a, b) => a.month - b.month);
    if (!monthsInYear.length) return;

    let best = monthsInYear[0];
    let bestDistance = Math.abs(best.month - currentMonth);
    for (const item of monthsInYear) {
        const dist = Math.abs(item.month - currentMonth);
        if (dist < bestDistance) {
            best = item;
            bestDistance = dist;
        }
    }

    calendarMonthKey = best.key;
    clearCalendarExpandedDetails();
    renderCalendarView();
}

function renderCurrentView() {
    if (currentDashboardView !== 'tournaments') return;

    syncMobileTournamentViewControls();

    const listContainer = document.getElementById('listViewContainer');
    const calendarContainer = document.getElementById('calendarViewContainer');
    const calendarDetails = document.getElementById('calendarTournamentDetails');
    const toggleButton = document.getElementById('btnToggleView');
    const perPageField = document.querySelector('.per-page-filter');

    if (currentViewMode === 'calendar') {
        if (listContainer) listContainer.classList.add('is-hidden');
        if (calendarContainer) calendarContainer.classList.remove('is-hidden');
        if (calendarDetails) calendarDetails.classList.remove('is-hidden');
        if (toggleButton) toggleButton.classList.add('is-calendar-active');
        updateToggleViewButton();
        if (perPageField) perPageField.classList.add('is-hidden');
        ensureCalendarMonthKey();
        renderCalendarView();
        return;
    }

    if (listContainer) listContainer.classList.remove('is-hidden');
    if (calendarContainer) calendarContainer.classList.add('is-hidden');
    if (calendarDetails) {
        calendarDetails.classList.add('is-hidden');
        calendarDetails.innerHTML = '';
    }
    if (toggleButton) toggleButton.classList.remove('is-calendar-active');
    updateToggleViewButton();
    if (perPageField) perPageField.classList.remove('is-hidden');
    renderTable();
    renderPagination();
}

function updateToggleViewButton() {
    const button = document.getElementById('btnToggleView');
    if (!button) return;

    if (currentViewMode === 'calendar') {
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M3 6h18"/>
                <path d="M3 12h18"/>
                <path d="M3 18h18"/>
            </svg>
        `;
        button.title = 'Switch to list';
        button.setAttribute('aria-label', 'Switch to list');
        return;
    }

    button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M8 2v4M16 2v4M3 10h18"/>
        </svg>
    `;
    button.title = 'Switch to calendar';
    button.setAttribute('aria-label', 'Switch to calendar');
}

function syncMobileTournamentViewControls() {
    const listButton = document.getElementById('btnMobileListView');
    const calendarButton = document.getElementById('btnMobileCalendarView');
    const isList = currentViewMode === 'list';
    listButton?.classList.toggle('is-active', isList);
    calendarButton?.classList.toggle('is-active', !isList);
    listButton?.setAttribute('aria-pressed', String(isList));
    calendarButton?.setAttribute('aria-pressed', String(!isList));
}

function setupMobileTournamentToolbar() {
    const activate = (mode) => {
        if (currentViewMode === mode) return;
        currentViewMode = mode;
        saveViewMode();
        if (mode === 'calendar') ensureCalendarMonthKey();
        renderCurrentView();
    };
    document.getElementById('btnMobileListView')?.addEventListener('click', () => activate('list'));
    document
        .getElementById('btnMobileCalendarView')
        ?.addEventListener('click', () => activate('calendar'));
    syncMobileTournamentViewControls();
}

function setupMobileDashboardShell() {
    const menu = document.getElementById('mobileMoreMenu');
    const moreButton = document.getElementById('btnMoreNav');
    const profileButton = document.getElementById('btnMobileProfileMenu');
    const versionBadge = document.getElementById('mobileVersionBadge');
    if (versionBadge) {
        const version = String(window.APP_VERSION || '').trim();
        versionBadge.textContent = version ? `v${version}` : 'DigiStats';
    }
    if (!menu) return;

    const setOpen = (open) => {
        menu.hidden = !open;
        document.body.classList.toggle('mobile-menu-open', open);
        moreButton?.setAttribute('aria-expanded', String(open));
        profileButton?.setAttribute('aria-expanded', String(open));
        moreButton?.classList.toggle('is-active', open || currentDashboardView === 'admin');
        if (open) menu.querySelector('.mobile-more-close')?.focus();
    };
    const toggle = () => setOpen(menu.hidden);

    moreButton?.addEventListener('click', toggle);
    profileButton?.addEventListener('click', toggle);
    menu.querySelectorAll('[data-close-mobile-more]').forEach((button) => {
        button.addEventListener('click', () => setOpen(false));
    });
    menu.querySelector('[data-mobile-view="admin"]')?.addEventListener('click', () => {
        setOpen(false);
        switchDashboardView('admin');
    });
    menu.querySelectorAll('[data-feedback-type]').forEach((button) => {
        button.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) setOpen(false);
    });
    document.addEventListener('click', (event) => {
        if (event.target.closest('.mobile-card-actions')) return;
        document.querySelectorAll('.mobile-card-menu:not([hidden])').forEach((cardMenu) => {
            cardMenu.hidden = true;
            cardMenu.previousElementSibling?.setAttribute('aria-expanded', 'false');
        });
    });
}

function setupDashboardViewSwitching() {
    const btnShowTournamentsNav = document.getElementById('btnShowTournamentsNav');
    const btnManageDecksNav = document.getElementById('btnManageDecksNav');
    const btnManagePlayersNav = document.getElementById('btnManagePlayersNav');
    const btnShowStatisticsNav = document.getElementById('btnShowStatisticsNav');
    const btnAdminNav = document.getElementById('btnAdminNav');

    if (
        !btnShowTournamentsNav &&
        !btnManageDecksNav &&
        !btnManagePlayersNav &&
        !btnShowStatisticsNav
    )
        return;

    if (btnShowTournamentsNav) {
        btnShowTournamentsNav.addEventListener('click', () => {
            switchDashboardView('tournaments');
        });
    }

    if (btnManageDecksNav) {
        btnManageDecksNav.addEventListener('click', () => {
            switchDashboardView('decks');
        });
    }

    if (btnManagePlayersNav) {
        btnManagePlayersNav.addEventListener('click', () => {
            switchDashboardView('players');
        });
    }

    if (btnShowStatisticsNav) {
        btnShowStatisticsNav.addEventListener('click', () => {
            switchDashboardView('statistics');
        });
    }

    if (btnAdminNav) {
        btnAdminNav.addEventListener('click', () => {
            switchDashboardView('admin');
        });
    }

    updateDashboardViewUi();
    const savedDashboardView = getSavedDashboardView();
    if (!window.DIGISTATS_MICRO_FRONTENDS && savedDashboardView !== currentDashboardView) {
        switchDashboardView(savedDashboardView);
    }
}

async function switchDashboardView(view) {
    if (
        view !== 'tournaments' &&
        view !== 'decks' &&
        view !== 'players' &&
        view !== 'statistics' &&
        view !== 'admin'
    )
        return;
    if (currentDashboardView === view) return;

    currentDashboardView = view;
    saveDashboardViewPreference();
    updateDashboardViewUi();

    if (view === 'tournaments') {
        await refreshTournamentListAfterExternalChange();
        return;
    }

    if (view === 'decks') {
        try {
            await ensureDecksViewReady();
            if (typeof window.initDecksPage === 'function') {
                window.initDecksPage();
            }
        } catch (error) {
            console.error(error);
            alert('Unable to load decks view right now.');
            currentDashboardView = 'tournaments';
            saveDashboardViewPreference();
            updateDashboardViewUi();
        }
        return;
    }

    if (view === 'players') {
        try {
            await ensurePlayersViewReady();
            if (typeof window.initPlayersPage === 'function') {
                window.initPlayersPage();
            }
        } catch (error) {
            console.error(error);
            alert('Unable to load players view right now.');
            currentDashboardView = 'tournaments';
            saveDashboardViewPreference();
            updateDashboardViewUi();
        }
        return;
    }

    if (view === 'statistics') {
        try {
            await ensureStatisticsViewReady();
            await loadAndRenderStatistics(currentStatisticsView);
        } catch (error) {
            console.error(error);
            alert('Unable to load statistics view right now.');
            currentDashboardView = 'tournaments';
            saveDashboardViewPreference();
            updateDashboardViewUi();
        }
    }

    if (view === 'admin') {
        try {
            await ensureAdminViewReady();
            if (typeof window.initAdminPage === 'function') {
                window.initAdminPage();
            }
        } catch (error) {
            console.error(error);
            alert('Unable to load admin view right now.');
            currentDashboardView = 'tournaments';
            saveDashboardViewPreference();
            updateDashboardViewUi();
        }
    }
}

function updateDashboardViewUi() {
    const isDecks = currentDashboardView === 'decks';
    const isPlayers = currentDashboardView === 'players';
    const isStatistics = currentDashboardView === 'statistics';
    const isAdmin = currentDashboardView === 'admin';
    const isTournaments = !isDecks && !isPlayers && !isStatistics && !isAdmin;
    const filtersRow = document.querySelector('.filters-row');
    const decksContainer = document.getElementById('decksDynamicContainer');
    const playersContainer = document.getElementById('playersDynamicContainer');
    const statisticsContainer = document.getElementById('statisticsDynamicContainer');
    const adminContainer = document.getElementById('adminDynamicContainer');
    const btnShowTournamentsNav = document.getElementById('btnShowTournamentsNav');
    const btnManageDecksNav = document.getElementById('btnManageDecksNav');
    const btnManagePlayersNav = document.getElementById('btnManagePlayersNav');
    const btnShowStatisticsNav = document.getElementById('btnShowStatisticsNav');
    const btnAdminNav = document.getElementById('btnAdminNav');
    const btnMoreNav = document.getElementById('btnMoreNav');
    const mobileTournamentPageHeader = document.getElementById('mobileTournamentPageHeader');
    const mobileTournamentToolbar = document.querySelector('.mobile-tournament-toolbar');

    if (filtersRow)
        filtersRow.classList.toggle('is-hidden', isDecks || isPlayers || isStatistics || isAdmin);
    if (decksContainer) decksContainer.classList.toggle('is-hidden', !isDecks);
    if (playersContainer) playersContainer.classList.toggle('is-hidden', !isPlayers);
    if (statisticsContainer) statisticsContainer.classList.toggle('is-hidden', !isStatistics);
    if (adminContainer) adminContainer.classList.toggle('is-hidden', !isAdmin);
    if (mobileTournamentPageHeader)
        mobileTournamentPageHeader.classList.toggle('is-hidden', !isTournaments);
    if (mobileTournamentToolbar)
        mobileTournamentToolbar.classList.toggle('is-hidden', !isTournaments);

    if (btnShowTournamentsNav) {
        btnShowTournamentsNav.classList.toggle('is-active', isTournaments);
        btnShowTournamentsNav.disabled = isTournaments;
        btnShowTournamentsNav.setAttribute('aria-pressed', String(isTournaments));
    }
    if (btnManageDecksNav) {
        btnManageDecksNav.classList.toggle('is-active', isDecks);
        btnManageDecksNav.disabled = isDecks;
        btnManageDecksNav.setAttribute('aria-pressed', String(isDecks));
    }
    if (btnManagePlayersNav) {
        btnManagePlayersNav.classList.toggle('is-active', isPlayers);
        btnManagePlayersNav.disabled = isPlayers;
        btnManagePlayersNav.setAttribute('aria-pressed', String(isPlayers));
    }
    if (btnShowStatisticsNav) {
        btnShowStatisticsNav.classList.toggle('is-active', isStatistics);
        btnShowStatisticsNav.disabled = isStatistics;
        btnShowStatisticsNav.setAttribute('aria-pressed', String(isStatistics));
    }
    if (btnAdminNav) {
        btnAdminNav.classList.toggle('is-active', isAdmin);
        btnAdminNav.disabled = isAdmin;
        btnAdminNav.setAttribute('aria-pressed', String(isAdmin));
    }
    btnMoreNav?.classList.toggle('is-active', isAdmin);

    if (!isDecks && !isPlayers && !isStatistics && !isAdmin) {
        renderCurrentView();
        return;
    }

    const listContainer = document.getElementById('listViewContainer');
    const calendarContainer = document.getElementById('calendarViewContainer');
    const calendarDetails = document.getElementById('calendarTournamentDetails');
    if (listContainer) listContainer.classList.add('is-hidden');
    if (calendarContainer) calendarContainer.classList.add('is-hidden');
    if (calendarDetails) calendarDetails.classList.add('is-hidden');
}

async function ensureDecksViewReady() {
    unmountPlayersContainer();
    unmountStatisticsContainer();
    unmountAdminContainer();
    await mountDecksContainer();
    await loadDecksAssets();
}

async function mountDecksContainer() {
    if (decksViewMounted) return;

    const host = document.getElementById('decksDynamicContainer');
    if (!host) return;

    let embedded = null;
    const localTemplate = document.getElementById('decksContainerTemplate');
    if (localTemplate?.content?.firstElementChild) {
        embedded = localTemplate.content.firstElementChild.cloneNode(true);
    } else {
        const prefix = getAssetPrefix();
        const response = await fetch(`${prefix}decks/index.html`, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Failed to load decks markup (${response.status})`);
        }

        const pageHtml = await response.text();
        const parsed = new DOMParser().parseFromString(pageHtml, 'text/html');
        const decksContainer = parsed.querySelector('.decks-container');
        if (!decksContainer) {
            throw new Error('Decks container not found in decks/index.html');
        }
        embedded = decksContainer.cloneNode(true);
        const topNav = embedded.querySelector('.top-nav');
        if (topNav) topNav.remove();
    }

    host.innerHTML = '';
    if (embedded) {
        embedded.classList.add('embedded-decks-view');
        host.appendChild(embedded);
    }

    if (!host.querySelector('#createDeckModalHost')) {
        const createHost = document.createElement('div');
        createHost.id = 'createDeckModalHost';
        host.appendChild(createHost);
    }
    if (!host.querySelector('#editDeckModalHost')) {
        const editHost = document.createElement('div');
        editHost.id = 'editDeckModalHost';
        host.appendChild(editHost);
    }

    decksViewMounted = true;
}

async function loadDecksAssets() {
    if (decksScriptsPromise) return decksScriptsPromise;

    const prefix = getAssetPrefix();
    const scriptPaths = [
        `${prefix}decks/create-deck/modal.js?v=${window.APP_VERSION || 'dev'}`,
        `${prefix}decks/edit-deck/modal.js?v=${window.APP_VERSION || 'dev'}`,
        `${prefix}decks/page.js?v=${window.APP_VERSION || 'dev'}`
    ];

    decksScriptsPromise = scriptPaths.reduce(
        (chain, src) => chain.then(() => loadScriptOnce(src)),
        Promise.resolve()
    );

    return decksScriptsPromise;
}

function loadScriptOnce(src) {
    const absoluteSrc = new URL(src, window.location.href).href;
    const existing = Array.from(document.querySelectorAll('script')).find((script) => {
        return script.src === absoluteSrc;
    });

    if (existing) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        (window.digiStatsComponentRoot
            ? window.digiStatsComponentRoot()
            : document.body
        ).appendChild(script);
    });
}

async function ensurePlayersViewReady() {
    unmountDecksContainer();
    unmountStatisticsContainer();
    unmountAdminContainer();
    await mountPlayersContainer();
    await loadPlayersAssets();
}

async function ensureStatisticsViewReady() {
    unmountDecksContainer();
    unmountPlayersContainer();
    unmountAdminContainer();
    await mountStatisticsContainer();
}

async function mountPlayersContainer() {
    if (playersViewMounted) return;

    const host = document.getElementById('playersDynamicContainer');
    if (!host) return;

    const template = document.getElementById('playersContainerTemplate');
    if (!template?.content?.firstElementChild) {
        throw new Error('Players template not found in index.html');
    }

    const embedded = template.content.firstElementChild.cloneNode(true);
    host.innerHTML = '';
    host.appendChild(embedded);

    if (!document.getElementById('toast-container')) {
        const toast = document.createElement('div');
        toast.id = 'toast-container';
        host.appendChild(toast);
    }

    playersViewMounted = true;
}

function unmountDecksContainer() {
    const host = document.getElementById('decksDynamicContainer');
    if (host && host.innerHTML) {
        host.innerHTML = '';
    }
    decksViewMounted = false;
    if (typeof window.resetDecksPage === 'function') {
        window.resetDecksPage();
    }
}

function unmountPlayersContainer() {
    const host = document.getElementById('playersDynamicContainer');
    if (host && host.innerHTML) {
        host.innerHTML = '';
    }
    playersViewMounted = false;
    if (typeof window.resetPlayersPage === 'function') {
        window.resetPlayersPage();
    }
}

async function loadPlayersAssets() {
    if (playersScriptsPromise) return playersScriptsPromise;

    const prefix = getAssetPrefix();
    playersScriptsPromise = loadScriptOnce(
        `${prefix}players/script.js?v=${window.APP_VERSION || 'dev'}`
    );
    return playersScriptsPromise;
}

async function mountStatisticsContainer() {
    if (statisticsViewMounted) return;

    const host = document.getElementById('statisticsDynamicContainer');
    if (!host) return;

    const template = document.getElementById('statisticsContainerTemplate');
    if (!template?.content?.firstElementChild) {
        throw new Error('Statistics template not found in index.html');
    }

    const embedded = template.content.firstElementChild.cloneNode(true);
    host.innerHTML = '';
    host.appendChild(embedded);

    const select = host.querySelector('#statisticsViewSelect');
    const viewTabs = host.querySelector('#statisticsViewTabs');

    if (select) {
        select.value = currentStatisticsView;
        select.addEventListener('change', async () => {
            const nextView = String(select.value || '');
            currentStatisticsView = nextView;
            currentStatisticsSort = { column: '', direction: 'asc' };
            currentStatisticsMonthFilter = '';
            currentStatisticsStoreFilter = '';
            currentStatisticsFormatFilter = '';
            currentStatisticsDateFilter = '';
            currentStatisticsStapleFilter = '';
            hasManualMetaFormatSelection = false;
            hasManualMetaPeriodSelection = false;
            currentTopCardsPage = 1;
            currentStoreChampionsPlayerQuery = '';
            currentMetaOverviewPeriod = 'all';
            saveStatisticsViewPreference(nextView);
            await loadAndRenderStatistics(nextView);
        });
    }

    if (viewTabs) {
        viewTabs.innerHTML = STATISTICS_VIEWS.map(
            (view) =>
                `<button type="button" class="statistics-view-btn" data-view="${view.value}">${view.label}</button>`
        ).join('');

        const buttons = viewTabs.querySelectorAll('.statistics-view-btn');
        const syncButtons = () => {
            buttons.forEach((btn) =>
                btn.classList.toggle('is-active', btn.dataset.view === currentStatisticsView)
            );
        };
        syncButtons();

        buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const nextView = btn.dataset.view;
                if (!nextView || nextView === currentStatisticsView) return;
                if (select) {
                    select.value = nextView;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    currentStatisticsView = nextView;
                    saveStatisticsViewPreference(nextView);
                    loadAndRenderStatistics(nextView);
                }
            });
        });

        if (select) {
            select.classList.add('is-hidden');
            select.addEventListener('change', syncButtons);
        }
    }

    const monthSelect = host.querySelector('#statisticsFilterMonth');
    if (monthSelect) {
        monthSelect.addEventListener('change', () => {
            currentStatisticsMonthFilter = String(monthSelect.value || '');
            currentTopCardsPage = 1;
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }

    const storeFilterSelect = host.querySelector('#statisticsFilterStore');
    if (storeFilterSelect) {
        storeFilterSelect.addEventListener('change', () => {
            currentStatisticsStoreFilter = String(storeFilterSelect.value || '');
            currentTopCardsPage = 1;
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }

    const formatFilterSelect = host.querySelector('#statisticsFilterFormat');
    if (formatFilterSelect) {
        formatFilterSelect.addEventListener('change', () => {
            currentStatisticsFormatFilter = String(formatFilterSelect.value || '');
            if (currentStatisticsView === 'v_meta_by_month') {
                hasManualMetaFormatSelection = true;
            }
            currentTopCardsPage = 1;
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }

    const dateFilterSelect = host.querySelector('#statisticsFilterDate');
    if (dateFilterSelect) {
        dateFilterSelect.addEventListener('change', () => {
            currentStatisticsDateFilter = String(dateFilterSelect.value || '');
            currentTopCardsPage = 1;
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }

    const stapleFilterSelect = host.querySelector('#statisticsFilterStaple');
    if (stapleFilterSelect) {
        stapleFilterSelect.addEventListener('change', () => {
            currentStatisticsStapleFilter = String(stapleFilterSelect.value || '');
            currentTopCardsPage = 1;
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }

    const deckFilterInput = host.querySelector('#statisticsFilterDeck');
    if (deckFilterInput) {
        let deckFilterDebounce = null;
        deckFilterInput.addEventListener('input', () => {
            const typed = String(deckFilterInput.value || '').trim();
            clearTimeout(deckFilterDebounce);
            deckFilterDebounce = setTimeout(() => {
                const matched = statisticsTopCardsDeckNames.find(
                    (n) => n.toLowerCase() === typed.toLowerCase()
                );
                const newFilter = matched || '';
                if (newFilter !== currentStatisticsDeckFilter) {
                    currentStatisticsDeckFilter = newFilter;
                    currentTopCardsPage = 1;
                    loadAndRenderStatistics(currentStatisticsView);
                }
            }, 350);
        });
        deckFilterInput.addEventListener('change', () => {
            const typed = String(deckFilterInput.value || '').trim();
            const matched = statisticsTopCardsDeckNames.find(
                (n) => n.toLowerCase() === typed.toLowerCase()
            );
            const newFilter = matched || (typed === '' ? '' : currentStatisticsDeckFilter);
            if (typed === '') {
                deckFilterInput.value = '';
            }
            if (newFilter !== currentStatisticsDeckFilter) {
                currentStatisticsDeckFilter = newFilter;
                currentTopCardsPage = 1;
                loadAndRenderStatistics(currentStatisticsView);
            }
        });
    }

    const playerSearchInput = host.querySelector('#statisticsPlayerSearch');
    if (playerSearchInput) {
        playerSearchInput.addEventListener('input', () => {
            currentStoreChampionsPlayerQuery = String(playerSearchInput.value || '').trim();
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }

    window.addEventListener('resize', handleStatisticsViewportChange);

    statisticsViewMounted = true;
}

function unmountStatisticsContainer() {
    const host = document.getElementById('statisticsDynamicContainer');
    if (host && host.innerHTML) {
        host.innerHTML = '';
    }
    statisticsViewMounted = false;
    statisticsViewData = [];
    statisticsMonthlyRankingData = [];
    currentStatisticsSort = { column: '', direction: 'asc' };
    currentStatisticsMonthFilter = '';
    currentStatisticsStoreFilter = '';
    currentStatisticsFormatFilter = '';
    currentStatisticsDateFilter = '';
    currentStatisticsStapleFilter = '';
    hasManualMetaFormatSelection = false;
    hasManualMetaPeriodSelection = false;
    currentTopCardsPage = 1;
    currentStoreChampionsPlayerQuery = '';
    window.removeEventListener('resize', handleStatisticsViewportChange);
}

async function ensureAdminViewReady() {
    unmountDecksContainer();
    unmountPlayersContainer();
    unmountStatisticsContainer();
    await mountAdminContainer();
    await loadAdminAssets();
}

async function mountAdminContainer() {
    if (adminViewMounted) return;

    const host = document.getElementById('adminDynamicContainer');
    if (!host) return;

    const template = document.getElementById('adminContainerTemplate');
    if (!template?.content?.firstElementChild) {
        throw new Error('Admin template not found in index.html');
    }

    const embedded = template.content.firstElementChild.cloneNode(true);
    host.innerHTML = '';
    host.appendChild(embedded);

    adminViewMounted = true;
}

function unmountAdminContainer() {
    const host = document.getElementById('adminDynamicContainer');
    if (host && host.innerHTML) {
        host.innerHTML = '';
    }
    adminViewMounted = false;
    if (typeof window.resetAdminPage === 'function') {
        window.resetAdminPage();
    }
}

async function loadAdminAssets() {
    if (adminScriptsPromise) return adminScriptsPromise;

    const prefix = getAssetPrefix();
    adminScriptsPromise = loadScriptOnce(
        `${prefix}admin/script.js?v=${window.APP_VERSION || 'dev'}`
    );
    return adminScriptsPromise;
}

async function loadAndRenderStatistics(viewName) {
    const host = document.getElementById('statisticsDynamicContainer');
    if (!host) return;

    const status = host.querySelector('#statisticsStatus');
    const dataCard = host.querySelector('.statistics-data-card');
    const tableWrapper = host.querySelector('.statistics-table-wrapper');
    if (status) {
        status.innerHTML = '<span class="stats-loading-spinner"></span> Carregando...';
        status.classList.remove('is-hidden');
    }
    if (dataCard) dataCard.classList.remove('is-hidden');
    if (tableWrapper) tableWrapper.classList.add('is-hidden');

    try {
        if (viewName === 'v_player_ranking') {
            const allTimeEndpoint = '/rest/v1/v_player_ranking?select=*&limit=1000';
            const monthlyEndpoint = '/rest/v1/v_monthly_ranking?select=*&limit=1000';
            const [allTimeResponse, monthlyResponse] = await Promise.all([
                window.supabaseApi
                    ? window.supabaseApi.get(allTimeEndpoint)
                    : fetch(`${SUPABASE_URL}${allTimeEndpoint}`, { headers }),
                window.supabaseApi
                    ? window.supabaseApi.get(monthlyEndpoint)
                    : fetch(`${SUPABASE_URL}${monthlyEndpoint}`, { headers })
            ]);

            if (!allTimeResponse.ok) {
                throw new Error(`Failed to load v_player_ranking (${allTimeResponse.status})`);
            }
            if (!monthlyResponse.ok) {
                throw new Error(`Failed to load v_monthly_ranking (${monthlyResponse.status})`);
            }

            const [allTimeRows, monthlyRows] = await Promise.all([
                allTimeResponse.json(),
                monthlyResponse.json()
            ]);
            statisticsViewData = normalizePlayerRankingRows(
                Array.isArray(allTimeRows) ? allTimeRows : [],
                { isMonthly: false }
            );
            const playerAllTimeMap = new Map(
                statisticsViewData.map((row) => [
                    String(row?.player || '')
                        .trim()
                        .toLowerCase(),
                    row
                ])
            );
            statisticsMonthlyRankingData = normalizePlayerRankingRows(
                Array.isArray(monthlyRows) ? monthlyRows : [],
                { isMonthly: true, allTimeByPlayer: playerAllTimeMap }
            );
        } else if (viewName === 'v_top_cards_by_month') {
            // Load deck names for the filter dropdown (cached across renders).
            if (!statisticsTopCardsDeckNames.length) {
                try {
                    const dnEndpoint = '/rest/v1/v_top_cards_by_deck?select=deck_name&limit=1000';
                    const dnResponse = window.supabaseApi
                        ? await window.supabaseApi.get(dnEndpoint)
                        : await fetch(`${SUPABASE_URL}${dnEndpoint}`, { headers });
                    if (dnResponse.ok) {
                        const dnRows = await dnResponse.json();
                        statisticsTopCardsDeckNames = [
                            ...new Set(
                                (Array.isArray(dnRows) ? dnRows : [])
                                    .map((r) => String(r?.deck_name || '').trim())
                                    .filter(Boolean)
                            )
                        ].sort((a, b) => a.localeCompare(b));
                    }
                } catch (_) {
                    // ignore — filter will show empty, still functional
                }
            }

            const topCardsEndpoint = currentStatisticsDeckFilter
                ? `/rest/v1/v_top_cards_by_deck?deck_name=eq.${encodeURIComponent(currentStatisticsDeckFilter)}&select=*&limit=1000`
                : '/rest/v1/v_top_cards_by_month?select=*&limit=1000';
            const response = window.supabaseApi
                ? await window.supabaseApi.get(topCardsEndpoint)
                : await fetch(`${SUPABASE_URL}${topCardsEndpoint}`, { headers });

            if (!response.ok) {
                throw new Error(`Failed to load top cards (${response.status})`);
            }

            const rows = await response.json();
            statisticsViewData = await enrichTopCardsWithCardName(Array.isArray(rows) ? rows : []);
            statisticsMonthlyRankingData = [];
        } else if (viewName === 'meta_overview') {
            const metaEndpoint = '/rest/v1/v_meta_by_month?select=*&limit=1000';
            const colorEndpoint = '/rest/v1/v_deck_color_stats?select=*&limit=1000';
            const imgEndpoint = '/rest/v1/v_podium_full?select=deck,image_url&limit=1000';
            const [metaResponse, colorResponse, imgResponse] = await Promise.all([
                window.supabaseApi
                    ? window.supabaseApi.get(metaEndpoint)
                    : fetch(`${SUPABASE_URL}${metaEndpoint}`, { headers }),
                window.supabaseApi
                    ? window.supabaseApi.get(colorEndpoint)
                    : fetch(`${SUPABASE_URL}${colorEndpoint}`, { headers }),
                window.supabaseApi
                    ? window.supabaseApi.get(imgEndpoint)
                    : fetch(`${SUPABASE_URL}${imgEndpoint}`, { headers })
            ]);
            if (!metaResponse.ok)
                throw new Error(`Failed to load meta data (${metaResponse.status})`);
            if (!colorResponse.ok)
                throw new Error(`Failed to load color data (${colorResponse.status})`);
            const [metaRows, colorRows, imgRows] = await Promise.all([
                metaResponse.json(),
                colorResponse.json(),
                imgResponse.ok ? imgResponse.json() : Promise.resolve([])
            ]);
            await ensureStatisticsDeckColorMap();
            statisticsViewData = Array.isArray(metaRows) ? metaRows : [];
            statisticsColorData = Array.isArray(colorRows) ? colorRows : [];
            statisticsDeckImageMap = new Map();
            (Array.isArray(imgRows) ? imgRows : []).forEach((r) => {
                const deck = String(r?.deck || '').trim();
                const url = String(r?.image_url || '').trim();
                if (deck && url && !statisticsDeckImageMap.has(deck)) {
                    statisticsDeckImageMap.set(deck, url);
                }
            });
            statisticsMonthlyRankingData = [];
        } else {
            const isDeckView = viewName === 'v_deck_stats' || viewName === 'v_deck_representation';

            const endpoint = `/rest/v1/${viewName}?select=*&limit=1000`;
            const sparklineEndpoint =
                '/rest/v1/v_meta_by_month?select=deck,month,meta_share_percent&limit=1000';

            const fetches = [
                window.supabaseApi
                    ? window.supabaseApi.get(endpoint)
                    : fetch(`${SUPABASE_URL}${endpoint}`, { headers })
            ];
            if (isDeckView) {
                fetches.push(
                    window.supabaseApi
                        ? window.supabaseApi.get(sparklineEndpoint)
                        : fetch(`${SUPABASE_URL}${sparklineEndpoint}`, { headers })
                );
            }

            const [response, sparklineResponse] = await Promise.all(fetches);

            if (!response.ok) {
                throw new Error(`Failed to load ${viewName} (${response.status})`);
            }

            const rows = await response.json();
            const baseRows = Array.isArray(rows) ? rows : [];

            if (isDeckView && sparklineResponse?.ok) {
                const sparklineRows = await sparklineResponse.json();
                const byDeck = new Map();
                (Array.isArray(sparklineRows) ? sparklineRows : []).forEach((r) => {
                    const deck = String(r?.deck || '').trim();
                    if (!deck) return;
                    if (!byDeck.has(deck)) byDeck.set(deck, []);
                    byDeck.get(deck).push({
                        month: String(r?.month || ''),
                        pct: Number(r?.meta_share_percent) || 0
                    });
                });
                byDeck.forEach((arr) =>
                    arr.sort((a, b) => String(a.month).localeCompare(String(b.month)))
                );
                statisticsDeckSparklineData = byDeck;
                statisticsViewData = baseRows.map((row) => ({
                    ...row,
                    trend: byDeck.get(String(row?.deck || '').trim()) || []
                }));
            } else {
                if (isDeckView) statisticsDeckSparklineData = new Map();
                statisticsViewData = baseRows;
            }
            statisticsMonthlyRankingData = [];
        }
        renderStatisticsTable(statisticsViewData, viewName);
    } catch (error) {
        console.error(error);
        statisticsViewData = [];
        statisticsMonthlyRankingData = [];
        renderStatisticsTable([], viewName, error.message || 'Unexpected error');
    }
}

async function fetchAllTournamentResultsForColorStats() {
    const out = [];
    const limit = 1000;
    let offset = 0;
    const selectClause = encodeURIComponent(
        'placement,tournament_date,tournament_id,store_id,deck:decks(name,colors)'
    );

    while (true) {
        const endpoint = `/rest/v1/tournament_results?select=${selectClause}&order=tournament_date.desc&limit=${limit}&offset=${offset}`;
        const response = window.supabaseApi
            ? await window.supabaseApi.get(endpoint)
            : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });

        if (!response.ok) {
            throw new Error(`Failed to load deck color stats source (${response.status})`);
        }

        const rows = await response.json();
        if (!Array.isArray(rows) || !rows.length) break;
        out.push(...rows);
        if (rows.length < limit) break;
        offset += limit;
    }

    return out;
}

function normalizeDeckColorsForStatistics(value) {
    const tokenMap = {
        r: 'r',
        red: 'r',
        vermelho: 'r',
        u: 'u',
        blue: 'u',
        azul: 'u',
        b: 'b',
        black: 'b',
        preto: 'b',
        w: 'w',
        white: 'w',
        branco: 'w',
        g: 'g',
        green: 'g',
        verde: 'g',
        y: 'y',
        yellow: 'y',
        amarelo: 'y',
        p: 'p',
        purple: 'p',
        roxo: 'p'
    };
    const tokens = String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter(Boolean);

    const colorsSet = new Set();
    tokens.forEach((token) => {
        const normalized = tokenMap[token];
        if (normalized) colorsSet.add(normalized);
    });

    return DECK_COLOR_ORDER.filter((color) => colorsSet.has(color));
}

function resolveTournamentFormatCodeForStatistics(row) {
    const tournamentId = Number(row?.tournament_id);
    if (Number.isFinite(tournamentId) && tournamentId > 0 && Array.isArray(tournaments)) {
        const sourceTournament = tournaments.find((item) => Number(item?.id) === tournamentId);
        const byTournament = normalizeFormatCode(getTournamentFormatCode(sourceTournament));
        if (byTournament) return byTournament;
    }

    const rowStoreId = String(row?.store_id || '').trim();
    const rowDate = normalizeStatisticsDateKey(row?.tournament_date);
    if (rowStoreId && rowDate && Array.isArray(tournaments)) {
        const sourceTournament = tournaments.find((item) => {
            const tStoreId = String(item?.store_id || '').trim();
            const tDate = normalizeStatisticsDateKey(item?.tournament_date);
            return tStoreId === rowStoreId && tDate === rowDate;
        });
        const byStoreDate = normalizeFormatCode(getTournamentFormatCode(sourceTournament));
        if (byStoreDate) return byStoreDate;
    }

    return 'N/A';
}

function buildStatisticsDeckColorMap(sourceRows) {
    const map = new Map();
    (Array.isArray(sourceRows) ? sourceRows : []).forEach((row) => {
        const deck = row?.deck || {};
        const deckName = String(deck?.name || '').trim();
        if (!deckName) return;
        const colors = normalizeDeckColorsForStatistics(deck?.colors || '');
        if (!colors.length) return;
        const existing = map.get(deckName) || new Set();
        colors.forEach((c) => existing.add(c));
        map.set(deckName, existing);
    });
    const finalMap = new Map();
    map.forEach((set, deck) => finalMap.set(deck, Array.from(set)));
    statisticsDeckColorMap = finalMap;
}

async function loadDeckColorStatisticsRows() {
    const sourceRows = await fetchAllTournamentResultsForColorStats();
    deckColorStatsSourceRows = Array.isArray(sourceRows) ? sourceRows : [];
    buildStatisticsDeckColorMap(deckColorStatsSourceRows);
    if (!Array.isArray(sourceRows) || !sourceRows.length) return [];

    const periodTotals = new Map();
    const periodColorAgg = new Map();
    const periodColorDeckAgg = new Map();
    const colorOrderIndex = new Map(DECK_COLOR_ORDER.map((color, index) => [color, index]));

    sourceRows.forEach((row) => {
        const placement = Number(row?.placement);
        if (!Number.isFinite(placement) || placement <= 0) return;

        const month = normalizeStatisticsMonthKey(row?.tournament_date) || '';
        const formatCode = resolveTournamentFormatCodeForStatistics(row);
        const periodKey = `${month}|${formatCode}`;
        periodTotals.set(periodKey, (periodTotals.get(periodKey) || 0) + 1);

        const deck = row?.deck || {};
        const deckName = String(deck?.name || '-').trim() || '-';
        const colors = normalizeDeckColorsForStatistics(deck?.colors || '');
        if (!colors.length) return;

        colors.forEach((colorCode) => {
            const colorLabel = DECK_COLOR_LABELS[colorCode] || colorCode.toUpperCase();
            const periodColorKey = `${periodKey}|${colorCode}`;
            const current = periodColorAgg.get(periodColorKey) || {
                month,
                format_code: formatCode,
                color_code: colorCode,
                color: colorLabel,
                usage_count: 0,
                titles: 0,
                top4_total: 0
            };

            current.usage_count += 1;
            if (placement === 1) current.titles += 1;
            if (placement <= 4) current.top4_total += 1;
            periodColorAgg.set(periodColorKey, current);

            if (!periodColorDeckAgg.has(periodColorKey)) {
                periodColorDeckAgg.set(periodColorKey, new Map());
            }
            const deckMap = periodColorDeckAgg.get(periodColorKey);
            const deckStats = deckMap.get(deckName) || {
                deck: deckName,
                titles: 0,
                top4_total: 0,
                usage_count: 0
            };
            deckStats.usage_count += 1;
            if (placement === 1) deckStats.titles += 1;
            if (placement <= 4) deckStats.top4_total += 1;
            deckMap.set(deckName, deckStats);
        });
    });

    return Array.from(periodColorAgg.values())
        .map((entry) => {
            const periodKey = `${entry.month}|${entry.format_code}`;
            const periodColorKey = `${periodKey}|${entry.color_code}`;
            const periodTotal = Number(periodTotals.get(periodKey) || 0);
            const usagePercent = periodTotal > 0 ? (entry.usage_count / periodTotal) * 100 : 0;
            const deckMap = periodColorDeckAgg.get(periodColorKey) || new Map();
            const topDeck = Array.from(deckMap.values()).sort((a, b) => {
                const titleDiff = b.titles - a.titles;
                if (titleDiff !== 0) return titleDiff;
                const top4Diff = b.top4_total - a.top4_total;
                if (top4Diff !== 0) return top4Diff;
                const usageDiff = b.usage_count - a.usage_count;
                if (usageDiff !== 0) return usageDiff;
                return String(a.deck || '').localeCompare(String(b.deck || ''));
            })[0] || { deck: '-', titles: 0 };

            return {
                month: entry.month,
                format_code: entry.format_code,
                color_code: entry.color_code,
                color: entry.color,
                usage_percent: usagePercent,
                titles: entry.titles,
                top4_total: entry.top4_total,
                top_deck: topDeck.deck,
                top_deck_titles: topDeck.titles,
                _usage_count: entry.usage_count,
                _period_total: periodTotal
            };
        })
        .sort((a, b) => {
            const monthDiff = String(b.month || '').localeCompare(String(a.month || ''));
            if (monthDiff !== 0) return monthDiff;
            const formatDiff = String(a.format_code || '').localeCompare(
                String(b.format_code || '')
            );
            if (formatDiff !== 0) return formatDiff;
            const usageDiff = Number(b.usage_percent || 0) - Number(a.usage_percent || 0);
            if (usageDiff !== 0) return usageDiff;
            const colorDiff =
                (colorOrderIndex.get(String(a.color_code || '').toLowerCase()) ?? 999) -
                (colorOrderIndex.get(String(b.color_code || '').toLowerCase()) ?? 999);
            if (colorDiff !== 0) return colorDiff;
            return String(a.color || '').localeCompare(String(b.color || ''));
        });
}

function buildDeckColorOverallRowsFromSource(sourceRows, filters = {}) {
    const list = Array.isArray(sourceRows) ? sourceRows : [];
    if (!list.length) return [];
    const monthFilter = String(filters?.monthKey || '').trim();
    const formatFilter = String(filters?.formatCode || '')
        .trim()
        .toUpperCase();

    const scopedRows = list.filter((row) => {
        const placement = Number(row?.placement);
        if (!Number.isFinite(placement) || placement <= 0) return false;
        if (monthFilter) {
            const monthKey = normalizeStatisticsMonthKey(row?.tournament_date);
            if (monthKey !== monthFilter) return false;
        }
        if (formatFilter) {
            const code = resolveTournamentFormatCodeForStatistics(row).toUpperCase();
            if (code !== formatFilter) return false;
        }
        return true;
    });

    const totalResults = scopedRows.length;
    if (!totalResults) return [];

    const colorAgg = new Map();
    const colorDeckAgg = new Map();
    const colorOrderIndex = new Map(DECK_COLOR_ORDER.map((color, index) => [color, index]));

    scopedRows.forEach((row) => {
        const placement = Number(row?.placement);
        if (!Number.isFinite(placement) || placement <= 0) return;
        const deck = row?.deck || {};
        const deckName = String(deck?.name || '-').trim() || '-';
        const colors = normalizeDeckColorsForStatistics(deck?.colors || '');
        if (!colors.length) return;

        colors.forEach((colorCode) => {
            const colorLabel = DECK_COLOR_LABELS[colorCode] || colorCode.toUpperCase();
            const current = colorAgg.get(colorCode) || {
                color_code: colorCode,
                color: colorLabel,
                usage_count: 0,
                titles: 0,
                top4_total: 0
            };
            current.usage_count += 1;
            if (placement === 1) current.titles += 1;
            if (placement <= 4) current.top4_total += 1;
            colorAgg.set(colorCode, current);

            if (!colorDeckAgg.has(colorCode)) colorDeckAgg.set(colorCode, new Map());
            const deckMap = colorDeckAgg.get(colorCode);
            const deckStats = deckMap.get(deckName) || {
                deck: deckName,
                titles: 0,
                top4_total: 0,
                usage_count: 0
            };
            deckStats.usage_count += 1;
            if (placement === 1) deckStats.titles += 1;
            if (placement <= 4) deckStats.top4_total += 1;
            deckMap.set(deckName, deckStats);
        });
    });

    return Array.from(colorAgg.values())
        .map((entry) => {
            const deckMap = colorDeckAgg.get(entry.color_code) || new Map();
            const topDeck = Array.from(deckMap.values()).sort((a, b) => {
                const titleDiff = b.titles - a.titles;
                if (titleDiff !== 0) return titleDiff;
                const top4Diff = b.top4_total - a.top4_total;
                if (top4Diff !== 0) return top4Diff;
                const usageDiff = b.usage_count - a.usage_count;
                if (usageDiff !== 0) return usageDiff;
                return String(a.deck || '').localeCompare(String(b.deck || ''));
            })[0] || { deck: '-', titles: 0 };
            return {
                color_code: entry.color_code,
                color: entry.color,
                usage_percent: (entry.usage_count / totalResults) * 100,
                titles: entry.titles,
                top4_total: entry.top4_total,
                top_deck: topDeck.deck,
                top_deck_titles: topDeck.titles,
                month: monthFilter || '',
                format_code: formatFilter || ''
            };
        })
        .sort((a, b) => {
            const usageDiff = Number(b.usage_percent || 0) - Number(a.usage_percent || 0);
            if (usageDiff !== 0) return usageDiff;
            const colorDiff =
                (colorOrderIndex.get(String(a.color_code || '').toLowerCase()) ?? 999) -
                (colorOrderIndex.get(String(b.color_code || '').toLowerCase()) ?? 999);
            if (colorDiff !== 0) return colorDiff;
            return String(a.color || '').localeCompare(String(b.color || ''));
        });
}

async function enrichTopCardsWithCardName(rows) {
    const list = normalizeTopCardsRows(Array.isArray(rows) ? rows : []);
    if (!list.length) return [];

    // If the DB view returns a card_name column, trust the server-side resolution
    // and skip the cards_cache fetch + external API calls entirely.
    // (cards without metadata fall back to card_code in the view, which is fine.)
    if (list.length > 0 && 'card_name' in list[0]) return list;

    const byCode = new Map(topCardsNameCache);
    try {
        const cacheRows = await fetchAllCardsCacheRows();
        (Array.isArray(cacheRows) ? cacheRows : []).forEach((row) => {
            const key = normalizeCardCodeForLookup(row?.card_code);
            const name = String(row?.name || '').trim();
            const normalizedNameAsCode = normalizeCardCodeForLookup(name);
            if (key && name && normalizedNameAsCode !== key) {
                byCode.set(key, name);
                topCardsNameCache.set(key, name);
            }
        });
    } catch (_error) {
        // Ignore cache failures; fallback stays local to avoid browser CORS/rate-limit loops.
    }

    const missingCodes = Array.from(
        new Set(
            list
                .map((row) => normalizeCardCodeForLookup(row?.card_code))
                .filter(
                    (code) => code && !byCode.has(code) && !topCardsNameLookupAttempted.has(code)
                )
        )
    );
    if (missingCodes.length && ENABLE_TOP_CARDS_API_LOOKUP) {
        const apiRows = await fetchCardsFromDigimonApi(missingCodes);
        apiRows.forEach((row) => {
            const code = normalizeCardCodeForLookup(row?.card_code || row?.id || row?.card);
            const name = String(row?.name || '').trim();
            if (!code) return;
            topCardsNameLookupAttempted.add(code);
            if (name && normalizeCardCodeForLookup(name) !== code) {
                byCode.set(code, name);
                topCardsNameCache.set(code, name);
            }
        });
        missingCodes.forEach((code) => topCardsNameLookupAttempted.add(code));
    } else if (missingCodes.length) {
        missingCodes.forEach((code) => topCardsNameLookupAttempted.add(code));
    }

    return list.map((row) => {
        const code = normalizeCardCodeForLookup(row?.card_code);
        const inlineName = String(row?.card_name || '').trim();
        const inlineNameIsCode =
            normalizeCardCodeForLookup(inlineName) &&
            normalizeCardCodeForLookup(inlineName) === code;
        return {
            ...row,
            card_name: byCode.get(code) || (!inlineNameIsCode ? inlineName : '') || '-'
        };
    });
}

async function fetchAllCardsCacheRows() {
    const out = [];
    const limit = 1000;
    let offset = 0;
    while (true) {
        const endpoint = `/rest/v1/cards_cache?select=card_code,name&order=card_code.asc&limit=${limit}&offset=${offset}`;
        const response = window.supabaseApi
            ? await window.supabaseApi.get(endpoint)
            : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
        if (!response.ok) {
            throw new Error(`Failed to load cards_cache (${response.status})`);
        }
        const rows = await response.json();
        if (!Array.isArray(rows) || !rows.length) break;
        out.push(...rows);
        if (rows.length < limit) break;
        offset += limit;
    }
    return out;
}

async function fetchCardsFromDigimonApi(codes) {
    const result = [];
    const usedCodes = new Set();
    const pushRow = (row) => {
        const code = normalizeCardCodeForLookup(row?.id || row?.card || '');
        if (!code || usedCodes.has(code)) return;
        usedCodes.add(code);
        result.push({
            card_code: code,
            id: row?.id || code,
            name: row?.name || code,
            pack: row?.pack || code.split('-')[0] || '',
            color: row?.color || '',
            type: row?.type || '',
            card_payload: row || {}
        });
    };

    for (const chunk of chunkArray(codes, 20)) {
        try {
            const query = new URLSearchParams({
                card: chunk.join(','),
                limit: String(chunk.length * 2)
            });
            const response = await fetch(`${DIGIMON_CARD_API_URL}?${query}`);
            if (response.ok) {
                const rows = await response.json();
                if (Array.isArray(rows)) rows.forEach(pushRow);
            }
        } catch (_error) {}

        const missed = chunk.filter((code) => !usedCodes.has(code));
        for (const code of missed) {
            try {
                const query = new URLSearchParams({ card: code, limit: '1' });
                const response = await fetch(`${DIGIMON_CARD_API_URL}?${query}`);
                if (!response.ok) continue;
                const rows = await response.json();
                if (Array.isArray(rows)) rows.forEach(pushRow);
            } catch (_error) {}
        }
    }
    return result;
}

function normalizeCardCodeForLookup(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function chunkArray(items, size) {
    const source = Array.isArray(items) ? items : [];
    const result = [];
    const step = Math.max(1, Number(size) || 1);
    for (let i = 0; i < source.length; i += step) {
        result.push(source.slice(i, i + step));
    }
    return result;
}

function normalizeTopCardsRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
        const source = row || {};
        const totalValue = source.total ?? source.total_copies ?? source.decklists_with_card ?? 0;
        return {
            ...source,
            total: totalValue,
            champion: source.champion ?? source.champion_copies ?? 0,
            top2: source.top2 ?? source.top2_copies ?? 0,
            top3: source.top3 ?? source.top3_copies ?? 0,
            top4: source.top4 ?? source.top4_copies ?? 0
        };
    });
}

function aggregateTopCardsRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const byCode = new Map();

    rows.forEach((row) => {
        const source = row || {};
        const code = normalizeCardCodeForLookup(source.card_code || source.id || source.card || '');
        if (!code) return;

        const existing = byCode.get(code) || {
            ...source,
            card_code: code,
            total: 0,
            champion: 0,
            top2: 0,
            top3: 0,
            top4: 0,
            is_staple: 'null'
        };

        const sourceName = String(source.card_name || '').trim();
        if (!String(existing.card_name || '').trim() && sourceName) {
            existing.card_name = sourceName;
        }

        existing.total += Number(source.total) || 0;
        existing.champion += Number(source.champion) || 0;
        existing.top2 += Number(source.top2) || 0;
        existing.top3 += Number(source.top3) || 0;
        existing.top4 += Number(source.top4) || 0;

        if (normalizeStatisticsStapleState(source.is_staple) === 'true') {
            existing.is_staple = 'true';
        } else if (
            normalizeStatisticsStapleState(source.is_staple) === 'false' &&
            normalizeStatisticsStapleState(existing.is_staple) !== 'true'
        ) {
            existing.is_staple = 'false';
        }

        byCode.set(code, existing);
    });

    return Array.from(byCode.values());
}

function aggregateMetaByDeckRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const byDeck = new Map();

    rows.forEach((row) => {
        const source = row || {};
        const deckName = String(source.deck || source.deck_name || '-').trim() || '-';
        const deckKey = deckName.toLowerCase();
        const existing = byDeck.get(deckKey) || {
            deck: deckName,
            format_rank: 0,
            ranking_points: 0,
            titles: 0,
            top2_total: 0,
            top3_total: 0,
            top4_total: 0,
            appearances: 0
        };

        if (!String(existing.deck || '').trim() && deckName) {
            existing.deck = deckName;
        }

        existing.ranking_points += Number(source.ranking_points) || 0;
        existing.titles += Number(source.titles) || 0;
        existing.top2_total += Number(source.top2_total) || 0;
        existing.top3_total += Number(source.top3_total) || 0;
        existing.top4_total += Number(source.top4_total) || 0;
        existing.appearances += Number(source.appearances) || 0;

        byDeck.set(deckKey, existing);
    });

    const aggregated = Array.from(byDeck.values());
    aggregated.sort((a, b) => {
        const pointsDiff = (Number(b.ranking_points) || 0) - (Number(a.ranking_points) || 0);
        if (pointsDiff !== 0) return pointsDiff;
        const appearancesDiff = (Number(b.appearances) || 0) - (Number(a.appearances) || 0);
        if (appearancesDiff !== 0) return appearancesDiff;
        const top4Diff = (Number(b.top4_total) || 0) - (Number(a.top4_total) || 0);
        if (top4Diff !== 0) return top4Diff;
        const titlesDiff = (Number(b.titles) || 0) - (Number(a.titles) || 0);
        if (titlesDiff !== 0) return titlesDiff;
        return String(a.deck || '').localeCompare(String(b.deck || ''));
    });

    aggregated.forEach((row, index) => {
        row.format_rank = index + 1;
    });

    return aggregated;
}

function renderStatisticsTable(rows, viewName, errorMessage = '') {
    const host = document.getElementById('statisticsDynamicContainer');
    if (!host) return;

    const status = host.querySelector('#statisticsStatus');
    const formulaHint = host.querySelector('#statisticsFormulaHint');
    const rowCount = host.querySelector('#statisticsRowCount');
    const dataCard = host.querySelector('.statistics-data-card');
    const tableWrapper = host.querySelector('.statistics-table-wrapper');
    const primaryControls = host.querySelector('.statistics-primary-controls');
    const mainSelects = host.querySelector('.statistics-main-selects');
    const secondaryControls = host.querySelector('.statistics-secondary-controls');
    const storeFilterSelect = host.querySelector('#statisticsFilterStore');
    const formatFilterSelect = host.querySelector('#statisticsFilterFormat');
    const monthFilterSelect = host.querySelector('#statisticsFilterMonth');
    const dateFilterSelect = host.querySelector('#statisticsFilterDate');
    const stapleFilterSelect = host.querySelector('#statisticsFilterStaple');
    const deckFilterInput = host.querySelector('#statisticsFilterDeck');
    const deckDatalist =
        host.querySelector('#statisticsDeckDatalist') ||
        document.getElementById('statisticsDeckDatalist');
    const playerSearchInput = host.querySelector('#statisticsPlayerSearch');
    const previousBoard = host.querySelector('.store-champions-board');
    if (previousBoard) previousBoard.remove();
    const previousMetaOverview = host.querySelector('.meta-overview-panel');
    if (previousMetaOverview) previousMetaOverview.remove();
    const previousHighlights = host.querySelector('.statistics-highlights');
    if (previousHighlights) previousHighlights.remove();
    const previousTopCardsPagination = host.querySelector('.statistics-top-cards-pagination');
    if (previousTopCardsPagination) previousTopCardsPagination.remove();
    const head = host.querySelector('#statisticsTable thead');
    const body = host.querySelector('#statisticsTable tbody');
    if (!head || !body) return;

    head.innerHTML = '';
    body.innerHTML = '';
    if (status) {
        status.textContent = '';
        status.classList.add('is-hidden');
    }
    if (rowCount) rowCount.textContent = String(rows.length || 0);
    if (dataCard) dataCard.classList.add('is-hidden');
    if (tableWrapper) tableWrapper.classList.remove('is-hidden');
    if (tableWrapper) {
        tableWrapper.classList.toggle(
            'is-wide-table',
            viewName === 'v_player_ranking' ||
                viewName === 'v_deck_stats' ||
                viewName === 'v_deck_representation' ||
                viewName === 'v_deck_color_stats' ||
                viewName === 'v_top_cards_by_month'
        );
    }
    if (formulaHint) {
        const formulaHtml = getStatisticsFormulaHintHtml(viewName, rows);
        formulaHint.innerHTML = formulaHtml;
        formulaHint.classList.toggle('is-hidden', !formulaHtml);
    }
    if (storeFilterSelect) {
        storeFilterSelect.classList.add('is-hidden');
        storeFilterSelect.innerHTML = '<option value="">Todas as lojas</option>';
        if (mainSelects && storeFilterSelect.parentElement !== mainSelects) {
            mainSelects.appendChild(storeFilterSelect);
        }
    }
    if (monthFilterSelect) {
        monthFilterSelect.classList.add('is-hidden');
        monthFilterSelect.innerHTML = '<option value="">Todos os meses</option>';
    }
    if (formatFilterSelect) {
        formatFilterSelect.classList.add('is-hidden');
        formatFilterSelect.innerHTML = '<option value="">Todos os formatos</option>';
    }
    if (dateFilterSelect) {
        dateFilterSelect.classList.add('is-hidden');
        dateFilterSelect.innerHTML = '<option value="">Todas as datas</option>';
    }
    if (stapleFilterSelect) {
        stapleFilterSelect.classList.add('is-hidden');
        stapleFilterSelect.innerHTML =
            '<option value="">Todas as cartas</option><option value="true">Somente staple</option>';
    }
    if (playerSearchInput) {
        playerSearchInput.classList.add('is-hidden');
        playerSearchInput.value = '';
    }
    if (secondaryControls) {
        secondaryControls.classList.add('is-hidden');
        secondaryControls.classList.remove('is-store-champions-row');
    }
    if (primaryControls) {
        primaryControls.classList.remove('is-store-champions-layout');
    }

    if (errorMessage) {
        if (status) {
            status.textContent = `Unable to load ${viewName}: ${errorMessage}`;
            status.classList.remove('is-hidden');
        }
        if (dataCard) dataCard.classList.remove('is-hidden');
        return;
    }

    const playerMonthlyRows =
        viewName === 'v_player_ranking' && Array.isArray(statisticsMonthlyRankingData)
            ? statisticsMonthlyRankingData
            : [];
    const hasBaseRows = Array.isArray(rows) && rows.length > 0;
    const hasPlayerMonthlyRows = viewName === 'v_player_ranking' && playerMonthlyRows.length > 0;

    if (!hasBaseRows && !hasPlayerMonthlyRows) {
        if (status) {
            status.textContent = `No rows returned for ${viewName}.`;
            status.classList.remove('is-hidden');
        }
        if (dataCard) dataCard.classList.remove('is-hidden');
        return;
    }
    const playerMonthlyColumns = Object.keys(playerMonthlyRows[0] || {});

    const sourceColumns = Object.keys(rows[0] || {});
    const storeColumn = sourceColumns.includes('store') ? 'store' : '';
    const formatColumn = sourceColumns.includes('format_code')
        ? 'format_code'
        : sourceColumns.includes('format')
          ? 'format'
          : '';
    const monthColumn = sourceColumns.includes('month')
        ? 'month'
        : viewName === 'v_player_ranking' && playerMonthlyColumns.includes('month')
          ? 'month'
          : '';
    const dateColumn =
        viewName === 'v_player_ranking'
            ? ''
            : sourceColumns.includes('tournament_date')
              ? 'tournament_date'
              : sourceColumns.find((column) => /(^|_)date$/i.test(column)) || '';

    if (storeFilterSelect && storeColumn) {
        storeFilterSelect.classList.remove('is-hidden');
        populateStatisticsValueSelect(
            storeFilterSelect,
            rows.map((row) => row?.[storeColumn]),
            currentStatisticsStoreFilter,
            'Todas as lojas'
        );
        currentStatisticsStoreFilter = String(storeFilterSelect.value || '');
    } else {
        currentStatisticsStoreFilter = '';
    }

    if (formatFilterSelect && formatColumn) {
        formatFilterSelect.classList.remove('is-hidden');
        populateStatisticsValueSelect(
            formatFilterSelect,
            rows.map((row) => row?.[formatColumn]),
            currentStatisticsFormatFilter,
            'Todos os formatos'
        );
        if (
            viewName === 'v_meta_by_month' &&
            !currentStatisticsFormatFilter &&
            !hasManualMetaFormatSelection
        ) {
            const latestFormat = getLatestStatisticsFormat(rows, formatColumn, monthColumn);
            if (latestFormat) {
                currentStatisticsFormatFilter = latestFormat;
                formatFilterSelect.value = latestFormat;
            }
        }
        currentStatisticsFormatFilter = String(formatFilterSelect.value || '');
    } else {
        currentStatisticsFormatFilter = '';
    }

    if (monthFilterSelect && monthColumn) {
        const monthSourceRows =
            viewName === 'v_meta_by_month' && formatColumn && currentStatisticsFormatFilter
                ? rows.filter(
                      (row) =>
                          String(row?.[formatColumn] || '').trim() === currentStatisticsFormatFilter
                  )
                : rows;
        if (!currentStatisticsMonthFilter) {
            const latestMonth =
                viewName === 'v_player_ranking'
                    ? getLatestStatisticsMonth(playerMonthlyRows, monthColumn)
                    : getLatestStatisticsMonth(monthSourceRows, monthColumn);
            if (latestMonth) currentStatisticsMonthFilter = latestMonth;
        }
        populateStatisticsMonthSelect(
            monthFilterSelect,
            viewName === 'v_player_ranking'
                ? playerMonthlyRows.map((row) => row?.[monthColumn])
                : monthSourceRows.map((row) => row?.[monthColumn]),
            currentStatisticsMonthFilter
        );
        if (viewName === 'v_player_ranking') {
            monthFilterSelect.classList.add('is-hidden');
        } else {
            monthFilterSelect.classList.remove('is-hidden');
        }
        currentStatisticsMonthFilter = String(monthFilterSelect.value || '');
    } else {
        currentStatisticsMonthFilter = '';
    }

    if (dateFilterSelect && dateColumn) {
        dateFilterSelect.classList.remove('is-hidden');
        populateStatisticsDateSelect(
            dateFilterSelect,
            rows.map((row) => row?.[dateColumn]),
            currentStatisticsDateFilter
        );
        currentStatisticsDateFilter = String(dateFilterSelect.value || '');
    } else {
        currentStatisticsDateFilter = '';
    }

    if (stapleFilterSelect && viewName === 'v_top_cards_by_month') {
        stapleFilterSelect.classList.remove('is-hidden');
        const allowedValues = new Set(['', 'true']);
        if (!allowedValues.has(currentStatisticsStapleFilter)) {
            currentStatisticsStapleFilter = '';
        }
        stapleFilterSelect.value = currentStatisticsStapleFilter;
        currentStatisticsStapleFilter = String(stapleFilterSelect.value || '');
    } else {
        currentStatisticsStapleFilter = '';
    }

    if (deckFilterInput) {
        if (viewName === 'v_top_cards_by_month') {
            deckFilterInput.classList.remove('is-hidden');
            if (deckDatalist) {
                deckDatalist.innerHTML = '';
                statisticsTopCardsDeckNames.forEach((name) => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    deckDatalist.appendChild(opt);
                });
            }
            if (!deckFilterInput.value && currentStatisticsDeckFilter) {
                deckFilterInput.value = currentStatisticsDeckFilter;
            }
        } else {
            deckFilterInput.classList.add('is-hidden');
            deckFilterInput.value = '';
            currentStatisticsDeckFilter = '';
        }
    }

    let filteredRows = rows;
    if (storeColumn && currentStatisticsStoreFilter) {
        filteredRows = filteredRows.filter(
            (row) => String(row?.[storeColumn] || '').trim() === currentStatisticsStoreFilter
        );
    }
    if (formatColumn && currentStatisticsFormatFilter) {
        filteredRows = filteredRows.filter(
            (row) => String(row?.[formatColumn] || '').trim() === currentStatisticsFormatFilter
        );
    }
    if (viewName !== 'meta_overview' && monthColumn && currentStatisticsMonthFilter) {
        if (viewName === 'v_player_ranking') {
            filteredRows = playerMonthlyRows.filter(
                (row) =>
                    normalizeStatisticsMonthKey(row?.[monthColumn]) === currentStatisticsMonthFilter
            );
        } else {
            filteredRows = filteredRows.filter(
                (row) =>
                    normalizeStatisticsMonthKey(row?.[monthColumn]) === currentStatisticsMonthFilter
            );
        }
    }
    if (dateColumn && currentStatisticsDateFilter) {
        filteredRows = filteredRows.filter(
            (row) => normalizeStatisticsDateKey(row?.[dateColumn]) === currentStatisticsDateFilter
        );
    }
    if (viewName === 'v_top_cards_by_month' && currentStatisticsStapleFilter === 'true') {
        filteredRows = filteredRows.filter((row) => {
            const value = String(row?.is_staple || '')
                .trim()
                .toLowerCase();
            return (
                value === 'true' ||
                value === 't' ||
                value === '1' ||
                value === 'yes' ||
                value === 'sim'
            );
        });
    }
    if (
        viewName === 'v_top_cards_by_month' &&
        !currentStatisticsMonthFilter &&
        !currentStatisticsDeckFilter
    ) {
        filteredRows = aggregateTopCardsRows(filteredRows);
    }
    if (viewName === 'v_meta_by_month' && !currentStatisticsFormatFilter) {
        filteredRows = aggregateMetaByDeckRows(filteredRows);
    }
    if (viewName === 'meta_overview') {
        const metaBaseRows = rows.filter((row) => {
            if (storeColumn && currentStatisticsStoreFilter) {
                return String(row?.[storeColumn] || '').trim() === currentStatisticsStoreFilter;
            }
            return true;
        });
        if (
            !hasManualMetaPeriodSelection &&
            (!currentMetaOverviewPeriod || currentMetaOverviewPeriod === 'all')
        ) {
            const latestMonth = getLatestStatisticsMonth(
                filteredRows,
                monthColumn,
                formatColumn,
                currentStatisticsFormatFilter
            );
            if (latestMonth) currentMetaOverviewPeriod = latestMonth;
        }
        // Apply period filter (all formats first)
        const periodRowsAll = applyMetaPeriodFilter(metaBaseRows, currentMetaOverviewPeriod);
        // If user didn't manually choose a format, only auto-pick one when the period has no data.
        if (
            !hasManualMetaFormatSelection &&
            formatColumn &&
            monthColumn &&
            !currentStatisticsFormatFilter &&
            periodRowsAll.length === 0
        ) {
            const latestFormat = getLatestStatisticsFormat(metaBaseRows, formatColumn, monthColumn);
            if (latestFormat) {
                currentStatisticsFormatFilter = latestFormat;
                if (formatFilterSelect) formatFilterSelect.value = latestFormat;
            }
        }
        const metaFormatRows =
            formatColumn && currentStatisticsFormatFilter
                ? metaBaseRows.filter(
                      (row) =>
                          String(row?.[formatColumn] || '').trim() === currentStatisticsFormatFilter
                  )
                : metaBaseRows;
        const periodRows = applyMetaPeriodFilter(metaFormatRows, currentMetaOverviewPeriod);
        const rawMetaRows = periodRows; // per-month, for sparklines + evolution
        const aggregatedMeta = currentStatisticsFormatFilter
            ? periodRows
            : aggregateMetaByDeckRows(periodRows);
        // Color data: apply same period + format filter
        const filteredColor = applyMetaPeriodFilter(
            statisticsColorData.filter(
                (r) =>
                    !currentStatisticsFormatFilter ||
                    String(r?.format_code || '').trim() === currentStatisticsFormatFilter
            ),
            currentMetaOverviewPeriod
        );
        if (tableWrapper) tableWrapper.classList.add('is-hidden');
        if (dataCard) dataCard.classList.add('is-hidden');
        const chartArea = host.querySelector('#statisticsChartArea');
        if (chartArea) {
            chartArea.classList.add('is-hidden');
            chartArea.innerHTML = '';
        }
        host.querySelector('.meta-overview-panel')?.remove();
        renderMetaOverview(
            host,
            aggregatedMeta,
            filteredColor,
            isStatisticsMobileViewport(),
            rawMetaRows
        );
        if (status) status.textContent = '';
        return;
    }
    let topCardsTotalRows = 0;
    let topCardsTotalPages = 0;
    let isTopCardsPaginated = false;
    if (viewName === 'v_top_cards_by_month') {
        const compareTopCardsRows = (a, b) => {
            const championDiff = (Number(b?.champion) || 0) - (Number(a?.champion) || 0);
            if (championDiff !== 0) return championDiff;
            const top2Diff = (Number(b?.top2) || 0) - (Number(a?.top2) || 0);
            if (top2Diff !== 0) return top2Diff;
            const top3Diff = (Number(b?.top3) || 0) - (Number(a?.top3) || 0);
            if (top3Diff !== 0) return top3Diff;
            const top4Diff = (Number(b?.top4) || 0) - (Number(a?.top4) || 0);
            if (top4Diff !== 0) return top4Diff;
            const totalDiff = (Number(b?.total) || 0) - (Number(a?.total) || 0);
            if (totalDiff !== 0) return totalDiff;
            const nameDiff = String(a?.card_name || '').localeCompare(String(b?.card_name || ''));
            if (nameDiff !== 0) return nameDiff;
            return String(a?.card_code || '').localeCompare(String(b?.card_code || ''));
        };
        const sortedRows = [...filteredRows].sort(compareTopCardsRows);
        isTopCardsPaginated = true;
        topCardsTotalRows = sortedRows.length;
        topCardsTotalPages = Math.max(1, Math.ceil(topCardsTotalRows / TOP_CARDS_PER_PAGE));
        if (currentTopCardsPage > topCardsTotalPages) {
            currentTopCardsPage = topCardsTotalPages;
        }
        if (currentTopCardsPage < 1) currentTopCardsPage = 1;
        const start = (currentTopCardsPage - 1) * TOP_CARDS_PER_PAGE;
        const end = start + TOP_CARDS_PER_PAGE;
        filteredRows = sortedRows.slice(start, end).map((row, index) => ({
            ...row,
            monthly_rank: start + index + 1
        }));
    }

    if (viewName === 'v_store_champions') {
        if (primaryControls) {
            primaryControls.classList.add('is-store-champions-layout');
        }
        if (
            secondaryControls &&
            storeFilterSelect &&
            storeFilterSelect.parentElement !== secondaryControls
        ) {
            secondaryControls.prepend(storeFilterSelect);
        }
        if (secondaryControls) {
            secondaryControls.classList.add('is-store-champions-row');
        }
        if (playerSearchInput) {
            playerSearchInput.classList.remove('is-hidden');
            playerSearchInput.value = currentStoreChampionsPlayerQuery;
        }
        filteredRows = filterStoreChampionsRowsByPlayer(
            filteredRows,
            currentStoreChampionsPlayerQuery
        );
    }

    if (secondaryControls) {
        const hasVisibleSecondaryControl =
            (storeFilterSelect && !storeFilterSelect.classList.contains('is-hidden')) ||
            (formatFilterSelect && !formatFilterSelect.classList.contains('is-hidden')) ||
            (monthFilterSelect && !monthFilterSelect.classList.contains('is-hidden')) ||
            (dateFilterSelect && !dateFilterSelect.classList.contains('is-hidden')) ||
            (stapleFilterSelect && !stapleFilterSelect.classList.contains('is-hidden')) ||
            (playerSearchInput && !playerSearchInput.classList.contains('is-hidden'));
        secondaryControls.classList.toggle('is-hidden', !hasVisibleSecondaryControl);
    }

    if (!filteredRows.length) {
        if (status) {
            if (viewName === 'v_store_champions' && currentStoreChampionsPlayerQuery) {
                status.textContent = 'Nenhum player encontrado com esse filtro.';
            } else if (storeColumn && currentStatisticsStoreFilter) {
                status.textContent = 'Nenhum dado para a loja selecionada.';
            } else if (formatColumn && currentStatisticsFormatFilter) {
                status.textContent = 'Sem dados para o formato selecionado.';
            } else if (monthColumn && currentStatisticsMonthFilter) {
                status.textContent = 'Sem dados para o mes selecionado.';
            } else if (dateColumn && currentStatisticsDateFilter) {
                status.textContent = 'Sem dados para a data selecionada.';
            } else if (
                viewName === 'v_top_cards_by_month' &&
                currentStatisticsStapleFilter === 'true'
            ) {
                status.textContent = 'Sem dados para cartas staple.';
            } else if (viewName === 'v_top_cards_by_month') {
                status.textContent =
                    'Nenhum resultado Top 4 com decklist registrada encontrado. ' +
                    'Registre decklists pelo deckbuilder para ver as estatísticas de cartas aqui.';
            } else {
                status.textContent = `No rows returned for ${viewName}.`;
            }
            status.classList.remove('is-hidden');
        }
        if (dataCard) dataCard.classList.remove('is-hidden');
        renderStatisticsCharts(host, viewName, []);
        return;
    }
    if (rowCount) {
        rowCount.textContent = String(
            isTopCardsPaginated ? topCardsTotalRows : filteredRows.length || 0
        );
    }
    renderStatisticsCharts(host, viewName, filteredRows);

    if (viewName === 'v_store_champions') {
        const columns = getStatisticsDisplayColumns(
            viewName,
            Object.keys(filteredRows[0] || {}).filter(
                (column) => !isInternalStatisticsColumn(column, viewName)
            )
        );
        if (tableWrapper) tableWrapper.classList.add('is-hidden');
        if (dataCard) dataCard.classList.add('is-hidden');
        // Build attendance trend from already-loaded tournaments data
        const storeAttendance = new Map(); // storeName → [{date, players}]
        tournaments.forEach((t) => {
            const name = t.store?.name ? String(t.store.name).trim() : null;
            if (!name || !t.tournament_date) return;
            if (!storeAttendance.has(name)) storeAttendance.set(name, []);
            storeAttendance.get(name).push({
                date: String(t.tournament_date),
                players: Number(t.total_players) || 0
            });
        });
        storeAttendance.forEach((entries) => entries.sort((a, b) => a.date.localeCompare(b.date)));

        renderStoreChampionsBoard(host, filteredRows, {
            storeAttendance
        });
        if (status) status.textContent = '';
        return;
    }

    const columns = getStatisticsDisplayColumns(
        viewName,
        Object.keys(filteredRows[0] || {}).filter(
            (column) => !isInternalStatisticsColumn(column, viewName)
        )
    );
    if (!columns.length) {
        if (status) status.textContent = `No user-facing columns available for ${viewName}.`;
        return;
    }
    if (currentStatisticsSort.column && !columns.includes(currentStatisticsSort.column)) {
        currentStatisticsSort = { column: '', direction: 'asc' };
    }

    const sortedRows = sortStatisticsRows(filteredRows, currentStatisticsSort);
    const headerRow = document.createElement('tr');
    columns.forEach((column, columnIndex) => {
        const th = document.createElement('th');
        const normalizedColumn = String(column || '')
            .trim()
            .toLowerCase();
        if (
            normalizedColumn === 'monthly_rank' ||
            normalizedColumn === 'overall_rank' ||
            normalizedColumn === 'store_rank' ||
            normalizedColumn === 'format_rank'
        ) {
            th.classList.add('stats-rank-col');
        }
        if (
            normalizedColumn === 'total' ||
            normalizedColumn === 'champion' ||
            normalizedColumn === 'top2' ||
            normalizedColumn === 'top3' ||
            normalizedColumn === 'top4'
        ) {
            th.classList.add('stats-metric-col');
        }
        if (normalizedColumn === 'is_staple') {
            th.classList.add('stats-staple-col');
        }
        const description = getStatisticsColumnDescription(viewName, column);
        const columnLabel = getStatisticsHeaderLabel(viewName, column);
        th.title = description;
        if (normalizedColumn === 'trend') {
            th.classList.add('stats-trend-col');
            const label = document.createElement('span');
            label.className = 'stats-sort-button stats-trend-header';
            label.textContent = columnLabel;
            label.title = description;
            th.appendChild(label);
        } else {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'stats-sort-button';
            button.dataset.statsSortColumn = column;
            button.title = description;
            button.setAttribute('aria-label', `${columnLabel}: ${description}`);
            button.innerHTML = `
                ${columnLabel}
                <span class="sort-indicator" data-stats-sort-indicator="${column}">\u21C5</span>
            `;
            th.appendChild(button);
        }

        const resizer = document.createElement('span');
        resizer.className = 'stats-col-resizer';
        resizer.setAttribute('role', 'separator');
        resizer.setAttribute('aria-orientation', 'vertical');
        resizer.setAttribute('aria-label', `Resize column ${columnLabel}`);
        resizer.title = 'Arraste para ajustar a largura. Duplo clique para resetar.';
        resizer.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        resizer.addEventListener('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearStatisticsColumnWidth(viewName, column);
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
        resizer.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startWidth = th.getBoundingClientRect().width;

            const onMouseMove = (moveEvent) => {
                const delta = moveEvent.clientX - startX;
                const nextWidth = startWidth + delta;
                applyStatisticsColumnWidth(head, body, columnIndex, nextWidth);
            };
            const onMouseUp = (upEvent) => {
                const delta = upEvent.clientX - startX;
                const finalWidth = startWidth + delta;
                setStatisticsColumnWidth(viewName, column, finalWidth);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        th.appendChild(resizer);
        headerRow.appendChild(th);
    });
    head.appendChild(headerRow);

    sortedRows.forEach((row) => {
        const tr = document.createElement('tr');
        columns.forEach((column) => {
            const td = document.createElement('td');
            const normalizedColumn = String(column || '')
                .trim()
                .toLowerCase();
            if (
                normalizedColumn === 'monthly_rank' ||
                normalizedColumn === 'overall_rank' ||
                normalizedColumn === 'store_rank' ||
                normalizedColumn === 'format_rank'
            ) {
                td.classList.add('stats-rank-col');
            }
            if (
                normalizedColumn === 'total' ||
                normalizedColumn === 'champion' ||
                normalizedColumn === 'top2' ||
                normalizedColumn === 'top3' ||
                normalizedColumn === 'top4'
            ) {
                td.classList.add('stats-metric-col');
            }
            if (normalizedColumn === 'is_staple') {
                td.classList.add('stats-staple-col');
            }
            if (normalizedColumn === 'trend') {
                td.classList.add('stats-trend-col');
            }
            td.innerHTML = formatStatisticsCellValue(row[column], column, row);
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });

    bindStatisticsCardPreview(body);
    bindStatisticsStapleToggle(body, viewName);
    applySavedStatisticsColumnWidths(head, body, viewName, columns);

    const sortButtons = head.querySelectorAll('.stats-sort-button[data-stats-sort-column]');
    sortButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const column = button.dataset.statsSortColumn || '';
            if (!column) return;
            toggleStatisticsSort(column);
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    });
    updateStatisticsSortIndicators(head);
    if (isTopCardsPaginated && topCardsTotalPages > 1) {
        renderStatisticsTopCardsPagination(host, topCardsTotalPages);
    }

    if (status) status.textContent = '';
}

function renderStatisticsTopCardsPagination(host, totalPages) {
    if (!host || totalPages <= 1) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'statistics-top-cards-pagination';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn-pagination btn-pagination-prev';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', 'Pagina anterior');
    prev.disabled = currentTopCardsPage <= 1;
    prev.addEventListener('click', () => {
        if (currentTopCardsPage <= 1) return;
        currentTopCardsPage -= 1;
        renderStatisticsTable(statisticsViewData, currentStatisticsView);
    });
    wrapper.appendChild(prev);

    const startPage = Math.max(1, currentTopCardsPage - 2);
    const endPage = Math.min(totalPages, currentTopCardsPage + 2);
    for (let page = startPage; page <= endPage; page++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-pagination-number';
        button.textContent = String(page);
        if (page === currentTopCardsPage) {
            button.classList.add('active');
            button.disabled = true;
        }
        button.addEventListener('click', () => {
            currentTopCardsPage = page;
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
        wrapper.appendChild(button);
    }

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn-pagination btn-pagination-next';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Proxima pagina');
    next.disabled = currentTopCardsPage >= totalPages;
    next.addEventListener('click', () => {
        if (currentTopCardsPage >= totalPages) return;
        currentTopCardsPage += 1;
        renderStatisticsTable(statisticsViewData, currentStatisticsView);
    });
    wrapper.appendChild(next);

    const tableWrapper = host.querySelector('.statistics-table-wrapper');
    if (tableWrapper) {
        tableWrapper.insertAdjacentElement('afterend', wrapper);
    } else {
        host.appendChild(wrapper);
    }
}

function bindStatisticsCardPreview(root) {
    if (!root) return;
    const targets = root.querySelectorAll('[data-card-preview-code]');
    if (!targets.length) return;

    const popover = ensureStatisticsCardPreviewPopover();
    const img = popover.querySelector('img');
    if (!img) return;

    const show = (event) => {
        const el = event.currentTarget;
        const code = String(el?.getAttribute('data-card-preview-code') || '').trim();
        if (!code) return;
        const candidates = getStatisticsCardPreviewImageCandidates(code);
        if (!candidates.length) return;

        let candidateIndex = 0;
        img.onerror = () => {
            candidateIndex += 1;
            if (candidateIndex >= candidates.length) {
                popover.classList.remove('is-visible');
                img.removeAttribute('src');
                return;
            }
            img.src = candidates[candidateIndex];
        };
        img.src = candidates[candidateIndex];
        popover.classList.add('is-visible');
        moveCardPreviewPopover(popover, event.clientX, event.clientY);
    };
    const move = (event) => {
        if (!popover.classList.contains('is-visible')) return;
        moveCardPreviewPopover(popover, event.clientX, event.clientY);
    };
    const hide = () => {
        popover.classList.remove('is-visible');
    };

    targets.forEach((el) => {
        el.addEventListener('mouseenter', show);
        el.addEventListener('mousemove', move);
        el.addEventListener('mouseleave', hide);
        el.addEventListener('blur', hide);
    });
}

function getStatisticsCardPreviewImageCandidates(code) {
    const encodedCode = encodeURIComponent(
        String(code || '')
            .trim()
            .toUpperCase()
    );
    if (!encodedCode) return [];

    return [
        `https://images.digimoncard.io/images/cards/${encodedCode}.webp`,
        `https://images.digimoncard.io/images/cards/${encodedCode}.jpg`,
        `${IMAGE_BASE_URL}${encodedCode}.webp`
    ];
}

function normalizeStatisticsStapleState(value) {
    if (value === true) return 'true';
    if (value === false) return 'false';
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
    if (
        normalized === 'true' ||
        normalized === 't' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'sim'
    ) {
        return 'true';
    }
    if (
        normalized === 'false' ||
        normalized === 'f' ||
        normalized === '0' ||
        normalized === 'no' ||
        normalized === 'nao' ||
        normalized === 'não'
    ) {
        return 'false';
    }
    return 'null';
}

function getNextStatisticsStapleState(state) {
    if (state === 'true') return 'false';
    if (state === 'false') return 'null';
    return 'true';
}

function serializeStatisticsStapleState(state) {
    if (state === 'true') return true;
    if (state === 'false') return false;
    return null;
}

function renderStatisticsStapleToggle(row, value) {
    const code = normalizeCardCodeForLookup(row?.card_code || '');
    if (!code) return '-';
    const state = normalizeStatisticsStapleState(value);
    const nextState = getNextStatisticsStapleState(state);
    const stateLabel =
        state === 'true'
            ? 'Staple: Sim'
            : state === 'false'
              ? 'Staple: Não'
              : 'Staple: Não definido';
    const nextLabel = nextState === 'true' ? 'Sim' : nextState === 'false' ? 'Não' : 'Não definido';
    const icon = state === 'true' ? '?' : state === 'false' ? '?' : '';
    return `
        <button
            type="button"
            class="stats-staple-toggle stats-staple-toggle-${state}"
            data-stats-staple-code="${escapeHtml(code)}"
            data-stats-staple-state="${state}"
            title="${escapeHtml(`${stateLabel}. Clique para mudar para ${nextLabel}.`)}"
            aria-label="${escapeHtml(`${stateLabel}. Clique para mudar para ${nextLabel}.`)}"
        >
            <span class="stats-staple-toggle-icon" aria-hidden="true">${icon}</span>
        </button>
    `;
}

function bindStatisticsStapleToggle(root, viewName) {
    if (!root || viewName !== 'v_top_cards_by_month') return;
    const buttons = root.querySelectorAll(
        'button[data-stats-staple-code][data-stats-staple-state]'
    );
    if (!buttons.length) return;

    buttons.forEach((button) => {
        button.addEventListener('click', async () => {
            const code = normalizeCardCodeForLookup(button.dataset.statsStapleCode || '');
            const currentState = normalizeStatisticsStapleState(
                button.dataset.statsStapleState || ''
            );
            if (!code || stapleTogglePendingCodes.has(code)) return;
            const nextState = getNextStatisticsStapleState(currentState);

            stapleTogglePendingCodes.add(code);
            button.disabled = true;
            button.classList.add('is-loading');

            try {
                await updateStatisticsStapleStateOnServer(code, nextState);
                const serialized = serializeStatisticsStapleState(nextState);
                if (Array.isArray(statisticsViewData) && statisticsViewData.length) {
                    statisticsViewData = statisticsViewData.map((row) => {
                        const rowCode = normalizeCardCodeForLookup(row?.card_code || '');
                        if (rowCode !== code) return row;
                        return { ...row, is_staple: serialized };
                    });
                }
                renderStatisticsTable(statisticsViewData, currentStatisticsView);
            } catch (error) {
                console.error('Failed to update is_staple:', error);
                alert('Falha ao atualizar staple. Tente novamente.');
            } finally {
                stapleTogglePendingCodes.delete(code);
                button.disabled = false;
                button.classList.remove('is-loading');
            }
        });
    });
}

async function updateStatisticsStapleStateOnServer(cardCode, nextState) {
    const code = normalizeCardCodeForLookup(cardCode || '');
    if (!code) throw new Error('Invalid card code');
    const payload = { is_staple: serializeStatisticsStapleState(nextState) };
    const endpoint = `/rest/v1/decklist_card_metadata?card_code=eq.${encodeURIComponent(code)}`;
    const extraHeaders = { Prefer: 'return=minimal' };
    const response = window.supabaseApi
        ? await window.supabaseApi.patch(endpoint, payload, extraHeaders)
        : await fetch(`${SUPABASE_URL}${endpoint}`, {
              method: 'PATCH',
              headers: { ...headers, ...extraHeaders },
              body: JSON.stringify(payload)
          });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
}

function ensureStatisticsCardPreviewPopover() {
    let popover = document.getElementById('statisticsCardPreviewPopover');
    if (popover) return popover;
    popover = document.createElement('div');
    popover.id = 'statisticsCardPreviewPopover';
    popover.className = 'stats-card-preview-popover';
    popover.innerHTML = '<img alt="Card preview" />';
    (window.digiStatsComponentRoot ? window.digiStatsComponentRoot() : document.body).appendChild(
        popover
    );
    return popover;
}

function moveCardPreviewPopover(popover, clientX, clientY) {
    if (!popover) return;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = popover.getBoundingClientRect();
    const offset = 14;
    const margin = 8;

    let left = clientX + offset;
    let top = clientY + offset;

    if (left + rect.width + margin > vw) {
        left = clientX - rect.width - offset;
    }
    if (top + rect.height + margin > vh) {
        top = clientY - rect.height - offset;
    }
    left = Math.max(margin, left);
    top = Math.max(margin, top);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
}

function applyMetaPeriodFilter(rows, period) {
    if (!period || period === 'all' || !Array.isArray(rows)) return rows;
    // period is a specific month key like '2026-03'
    return rows.filter((r) => normalizeStatisticsMonthKey(r?.month) === period);
}

let _metaEvolutionChart = null;
let _metaBarChart = null;
let _metaDonutChart = null;
let _metaDeckDetailChart = null;
let _metaDeckPlacementChart = null;
let _metaTop4RateChart = null;
let _metaPlayerPointsChart = null;
let _metaScatterChart = null;

const PT_MONTHS_ABBR = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez'
];
const fmtMonthKey = (m) => {
    const [y, mo] = String(m).split('-').map(Number);
    return `${PT_MONTHS_ABBR[mo - 1]}/${String(y).slice(2)}`;
};

function buildMetaEvolutionChartHtml(rawRows, topDecks, isMobile = false) {
    if (!Array.isArray(rawRows) || rawRows.length === 0 || !topDecks?.length) return '';

    const MIN_TOP4_RATE_APPEARANCES_ALL = 5;
    const getTopNAppearancesCutoff = (rows, n = 10) => {
        const values = (Array.isArray(rows) ? rows : [])
            .map((r) => Number(r?.appearances) || 0)
            .filter((v) => v > 0)
            .sort((a, b) => b - a);
        if (!values.length) return 0;
        if (values.length < n) return values[values.length - 1] || 0;
        return values[n - 1] || 0;
    };
    const MIN_TOP4_RATE_APPEARANCES_MONTH = Math.max(
        2,
        getTopNAppearancesCutoff(topDecks, 10) || 2
    );
    const ellipsis = (text, max = 16) => {
        const clean = String(text || '').trim();
        if (clean.length <= max) return clean;
        return clean.slice(0, Math.max(0, max - 1)) + '…';
    };
    const makeTop4Label = (deck, appearances) => {
        const base = String(deck || '').trim();
        const short = ellipsis(base, 16);
        return short;
    };

    // Aggregate per (deck, month): composite score (for bar charts) + appearances (for meta share %)
    const allMonths = new Set();
    const monthTotals = new Map(); // month → total appearances
    const deckMonthScore = new Map(); // deck → Map<month, composite score>
    const deckMonthAppear = new Map(); // deck → Map<month, appearances>
    rawRows.forEach((r) => {
        const month = normalizeStatisticsMonthKey(r?.month);
        const deck = String(r?.deck || '').trim();
        const n = Number(r?.appearances) || 0;
        if (!month || !deck) return;
        allMonths.add(month);
        monthTotals.set(month, (monthTotals.get(month) || 0) + n);
        if (!deckMonthScore.has(deck)) deckMonthScore.set(deck, new Map());
        if (!deckMonthAppear.has(deck)) deckMonthAppear.set(deck, new Map());
        const prevScore = deckMonthScore.get(deck).get(month) || 0;
        deckMonthScore.get(deck).set(month, prevScore + deckCompositeScore(r));
        const prevAppear = deckMonthAppear.get(deck).get(month) || 0;
        deckMonthAppear.get(deck).set(month, prevAppear + n);
    });

    const months = [...allMonths].sort();
    const minTop4AppearancesAll = Math.max(2, allMonths.size || 0);
    if (months.length === 0) return '';

    if (_metaEvolutionChart) {
        _metaEvolutionChart.destroy();
        _metaEvolutionChart = null;
    }

    const canvasId = `meta-evol-canvas-${Date.now()}`;
    const tooltipDefaults = {
        backgroundColor: '#1a2640',
        borderColor: '#2d3f55',
        borderWidth: 1,
        titleColor: '#c8d4e8',
        bodyColor: '#8fa4c8',
        padding: 10
    };
    const scaleDefaults = {
        grid: { color: '#243450', drawTicks: false },
        border: { color: '#2e4268' }
    };

    // ── Single month → horizontal bar chart ranked by score ────────────────
    if (months.length === 1) {
        const month = months[0];
        const monthLabel = fmtMonthKey(month);
        const barData = (Array.isArray(topDecks) ? topDecks : [])
            .map((r) => ({
                deck: String(r?.deck || '').trim(),
                score: deckCompositeScore(r),
                titles: Number(r?.titles) || 0,
                top4_total: Number(r?.top4_total) || 0,
                appearances: Number(r?.appearances) || 0
            }))
            .filter((d) => d.deck && d.score > 0)
            .sort((a, b) => {
                const sd = b.score - a.score;
                if (sd !== 0) return sd;
                const td = b.titles - a.titles;
                if (td !== 0) return td;
                const ar = a.appearances > 0 ? a.top4_total / a.appearances : 0;
                const br = b.appearances > 0 ? b.top4_total / b.appearances : 0;
                return br - ar;
            })
            .slice(0, 10);
        const barLabelsFull = barData.map((d) => String(d.deck || '').trim());
        const barLabelsShort = barLabelsFull.map((name) => ellipsis(name, isMobile ? 10 : 16));
        const barMaxLabelLen = barLabelsFull.reduce((m, v) => Math.max(m, v.length), 0);
        const barLabelWidth = Math.min(260, Math.max(140, Math.round(barMaxLabelLen * 6.6)));
        const top4RateBase = (Array.isArray(topDecks) ? topDecks : [])
            .map((r) => {
                const appearances = Number(r?.appearances) || 0;
                const top4 = Number(r?.top4_total) || 0;
                return {
                    deck: String(r?.deck || '').trim(),
                    rate: appearances > 0 ? (top4 / appearances) * 100 : 0,
                    appearances
                };
            })
            .filter((d) => d.deck && d.rate > 0 && d.appearances >= 2);
        const top4RateTop = [...top4RateBase].sort((a, b) => b.rate - a.rate).slice(0, 10);
        const top4RateData = top4RateTop.filter((d) => d.deck && d.rate > 0);
        const top4MinAppearances = top4RateData.length
            ? Math.min(...top4RateData.map((d) => d.appearances))
            : 0;
        const top4LabelsFull = top4RateData.map((d) => String(d.deck || '').trim());
        const top4LabelsShort = top4RateData.map((d) =>
            ellipsis(String(d.deck || '').trim(), isMobile ? 10 : 16)
        );
        const top4MaxLabelLen = top4LabelsFull.reduce((m, v) => Math.max(m, v.length), 0);
        const top4LabelWidth = Math.min(260, Math.max(140, Math.round(top4MaxLabelLen * 6.6)));
        const sharedLabelWidth = Math.max(barLabelWidth, top4LabelWidth);
        const top4CanvasId = `meta-top4-canvas-${canvasId}`;
        const playerCanvasId = `meta-player-canvas-${canvasId}`;
        const scatterCanvasId = `meta-scatter-canvas-${canvasId}`;

        setTimeout(() => {
            const canvas = document.getElementById(canvasId);
            if (!canvas || !window.Chart) return;
            _metaEvolutionChart = new window.Chart(canvas, {
                type: 'bar',
                data: {
                    labels: barLabelsShort,
                    datasets: [
                        {
                            data: barData.map((d) => d.score),
                            backgroundColor: (ctx) =>
                                SOFT_PALETTE[ctx.dataIndex % SOFT_PALETTE.length],
                            borderColor: (ctx) => SOFT_PALETTE[ctx.dataIndex % SOFT_PALETTE.length],
                            borderWidth: 1.5,
                            borderRadius: 4,
                            barThickness: 10,
                            maxBarThickness: 12
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { right: 55, top: 20 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipDefaults,
                            callbacks: {
                                title: (items) => barLabelsFull[items[0]?.dataIndex] || '',
                                label: (ctx) => ` ${ctx.parsed.x} pts`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: {
                                color: '#6a7d9f',
                                font: { size: 11 },
                                callback: (v) => v + ' pts'
                            },
                            beginAtZero: true
                        },
                        y: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: { color: '#c8d4e8', font: { size: 11 } },
                            afterFit: (scale) => {
                                scale.width = sharedLabelWidth;
                            }
                        }
                    }
                },
                plugins: [
                    createValueLabelPlugin(
                        barData.map((d) => d.score),
                        (v) => `${v} pts`
                    ),
                    createAverageLinePlugin(
                        barData.length
                            ? barData.reduce((s, d) => s + d.score, 0) / barData.length
                            : 0,
                        'média',
                        (v) => `${Math.round(v)} pts`
                    )
                ]
            });
            const top4Canvas = document.getElementById(top4CanvasId);
            if (top4Canvas && window.Chart) {
                if (_metaTop4RateChart) {
                    _metaTop4RateChart.destroy();
                    _metaTop4RateChart = null;
                }
                _metaTop4RateChart = new window.Chart(top4Canvas, {
                    type: 'bar',
                    data: {
                        labels: top4LabelsShort,
                        datasets: [
                            {
                                data: top4RateData.map((d) => Number(d.rate.toFixed(1))),
                                backgroundColor: (ctx) =>
                                    getSoftDeckColor(top4LabelsFull[ctx.dataIndex], ctx.dataIndex),
                                borderColor: (ctx) =>
                                    getSoftDeckColor(top4LabelsFull[ctx.dataIndex], ctx.dataIndex),
                                borderWidth: 1.5,
                                borderRadius: 4,
                                barThickness: 10,
                                maxBarThickness: 12
                            }
                        ]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { right: 55, top: 20 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                ...tooltipDefaults,
                                callbacks: {
                                    title: (items) => top4LabelsFull[items[0]?.dataIndex] || '',
                                    label: (ctx) => {
                                        const ap = top4RateData[ctx.dataIndex]?.appearances ?? 0;
                                        return ` ${ctx.parsed.x}% · ${ap} aparições`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ...scaleDefaults,
                                grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                                border: { color: '#263554' },
                                ticks: {
                                    color: '#6a7d9f',
                                    font: { size: 11 },
                                    callback: (v) => v + '%'
                                },
                                beginAtZero: true,
                                max: 100
                            },
                            y: {
                                ...scaleDefaults,
                                grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                                border: { color: '#263554' },
                                ticks: { color: '#c8d4e8', font: { size: 11 } },
                                afterFit: (scale) => {
                                    scale.width = sharedLabelWidth;
                                }
                            }
                        }
                    },
                    plugins: [
                        createValueLabelPlugin(
                            top4RateData.map((d) => Number(d.rate.toFixed(1))),
                            (v) => `${v}%`
                        ),
                        createAverageLinePlugin(
                            top4RateData.length
                                ? top4RateData.reduce((s, d) => s + d.rate, 0) / top4RateData.length
                                : 0,
                            'média',
                            (v) => `${v.toFixed(1)}%`
                        )
                    ]
                });
            }
            const scatterCanvas = document.getElementById(scatterCanvasId);
            if (scatterCanvas && window.Chart) {
                if (_metaScatterChart) {
                    _metaScatterChart.destroy();
                    _metaScatterChart = null;
                }
                const scatterPoints = (Array.isArray(topDecks) ? topDecks : [])
                    .map((r) => {
                        const deck = String(r?.deck || '').trim();
                        const score = deckCompositeScore(r);
                        const appearances = Number(r?.appearances) || 0;
                        const top4 = Number(r?.top4_total) || 0;
                        const rate = appearances > 0 ? (top4 / appearances) * 100 : 0;
                        if (!deck || score <= 0) return null;
                        return {
                            x: score,
                            y: Number(rate.toFixed(1)),
                            origScore: score,
                            origRate: Number(rate.toFixed(1)),
                            deck,
                            appearances
                        };
                    })
                    .filter(Boolean)
                    .slice(0, isMobile ? 12 : Infinity);
                // Offset overlapping bubbles radially so they don't stack on top of each other
                const posGroups = new Map();
                scatterPoints.forEach((p, i) => {
                    const k = `${p.x}_${p.y}`;
                    if (!posGroups.has(k)) posGroups.set(k, []);
                    posGroups.get(k).push(i);
                });
                posGroups.forEach((idxs) => {
                    if (idxs.length < 2) return;
                    idxs.forEach((idx, j) => {
                        const angle = (2 * Math.PI * j) / idxs.length - Math.PI / 2;
                        scatterPoints[idx].x = +(
                            scatterPoints[idx].x +
                            2 * Math.cos(angle)
                        ).toFixed(1);
                        scatterPoints[idx].y = +(
                            scatterPoints[idx].y +
                            2 * Math.sin(angle)
                        ).toFixed(1);
                    });
                });
                const avgX = scatterPoints.length
                    ? scatterPoints.reduce((s, p) => s + p.origScore, 0) / scatterPoints.length
                    : 0;
                const avgY = scatterPoints.length
                    ? scatterPoints.reduce((s, p) => s + p.origRate, 0) / scatterPoints.length
                    : 0;
                const maxApp = Math.max(...scatterPoints.map((p) => p.appearances), 1);
                const minApp = Math.min(...scatterPoints.map((p) => p.appearances), 1);
                const scaleRadius = (n) => {
                    const t = maxApp === minApp ? 0.5 : (n - minApp) / (maxApp - minApp);
                    return Math.round(5 + t * 10);
                };
                _metaScatterChart = new window.Chart(scatterCanvas, {
                    type: 'scatter',
                    data: {
                        datasets: scatterPoints.map((pt) => {
                            const r = scaleRadius(pt.appearances);
                            return {
                                label: pt.deck,
                                data: [{ x: pt.x, y: pt.y }],
                                backgroundColor: hexToRgba(getSoftDeckColor(pt.deck, 0), 0.85),
                                pointRadius: r,
                                pointHoverRadius: r + 2
                            };
                        })
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 24, right: 24, bottom: 10, left: 10 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                ...tooltipDefaults,
                                callbacks: {
                                    title: (items) => items[0]?.dataset?.label || '',
                                    label: (ctx) => {
                                        const pt = scatterPoints[ctx.datasetIndex];
                                        return ` ${pt?.origScore ?? ctx.parsed.x} pts · Top4: ${pt?.origRate ?? ctx.parsed.y}% · ${pt?.appearances ?? 0} aparições`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ...scaleDefaults,
                                grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                                border: { color: '#263554' },
                                ticks: {
                                    color: '#6a7d9f',
                                    font: { size: 11 },
                                    callback: (v) => v + ' pts'
                                },
                                title: {
                                    display: true,
                                    text: 'Pontuação',
                                    color: '#6a7d9f',
                                    font: { size: 10 }
                                },
                                suggestedMin: Math.max(
                                    0,
                                    Math.min(...scatterPoints.map((p) => p.x)) - 5
                                ),
                                suggestedMax: Math.max(...scatterPoints.map((p) => p.x)) + 5
                            },
                            y: {
                                ...scaleDefaults,
                                grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                                border: { color: '#263554' },
                                ticks: {
                                    color: '#6a7d9f',
                                    font: { size: 11 },
                                    callback: (v) => (v > 100 ? '' : v + '%')
                                },
                                title: {
                                    display: true,
                                    text: 'Taxa Top4',
                                    color: '#6a7d9f',
                                    font: { size: 10 }
                                },
                                beginAtZero: true,
                                suggestedMax: 108
                            }
                        }
                    },
                    plugins: [
                        {
                            id: 'scatterQuadrants',
                            beforeDatasetsDraw(chart) {
                                const {
                                    ctx,
                                    chartArea: { top, bottom, left, right }
                                } = chart;
                                const px = chart.scales.x.getPixelForValue(avgX);
                                const py = chart.scales.y.getPixelForValue(avgY);
                                ctx.save();
                                // quadrant background fills
                                ctx.fillStyle = 'rgba(59,166,93,0.04)'; // top-right: dominantes
                                ctx.fillRect(px, top, right - px, py - top);
                                ctx.fillStyle = 'rgba(47,115,217,0.04)'; // top-left: alta taxa
                                ctx.fillRect(left, top, px - left, py - top);
                                ctx.fillStyle = 'rgba(217,74,74,0.04)'; // bottom-left: baixo desempenho
                                ctx.fillRect(left, py, px - left, bottom - py);
                                ctx.fillStyle = 'rgba(226,190,47,0.04)'; // bottom-right: alta pont baixa taxa
                                ctx.fillRect(px, py, right - px, bottom - py);
                                ctx.restore();
                            },
                            afterDatasetsDraw(chart) {
                                const {
                                    ctx,
                                    chartArea: { top, bottom, left, right }
                                } = chart;
                                const px = chart.scales.x.getPixelForValue(avgX);
                                const py = chart.scales.y.getPixelForValue(avgY);
                                ctx.save();
                                ctx.setLineDash([4, 4]);
                                ctx.lineWidth = 1;
                                ctx.strokeStyle = 'rgba(200,212,232,0.25)';
                                ctx.beginPath();
                                ctx.moveTo(px, top);
                                ctx.lineTo(px, bottom);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(left, py);
                                ctx.lineTo(right, py);
                                ctx.stroke();
                                ctx.setLineDash([]);
                                const isMobile = chart.width < 480;
                                ctx.font = `600 ${isMobile ? '9' : '10'}px sans-serif`;
                                // top-right
                                ctx.fillStyle = 'rgba(59,166,93,0.5)';
                                ctx.textBaseline = 'top';
                                ctx.textAlign = 'right';
                                ctx.fillText(isMobile ? 'Dom.' : 'Dominantes', right - 8, top + 6);
                                // top-left
                                ctx.fillStyle = 'rgba(47,115,217,0.4)';
                                ctx.textAlign = 'left';
                                ctx.fillText(
                                    isMobile ? 'Alta taxa' : 'Alta taxa, baixa pont.',
                                    left + 8,
                                    top + 6
                                );
                                // bottom-right
                                ctx.fillStyle = 'rgba(226,190,47,0.4)';
                                ctx.textBaseline = 'bottom';
                                ctx.textAlign = 'right';
                                ctx.fillText(
                                    isMobile ? 'Alta pont.' : 'Alta pont., baixa taxa',
                                    right - 8,
                                    bottom - 6
                                );
                                // bottom-left
                                ctx.fillStyle = 'rgba(217,74,74,0.4)';
                                ctx.textAlign = 'left';
                                ctx.fillText(
                                    isMobile ? 'Baixo' : 'Baixo desempenho',
                                    left + 8,
                                    bottom - 6
                                );
                                ctx.restore();
                            }
                        },
                        {
                            id: 'scatterDeckLabels',
                            afterDatasetsDraw(chart) {
                                if (isMobile) return;
                                const {
                                    ctx,
                                    chartArea: { left, right, top, bottom }
                                } = chart;
                                ctx.save();
                                const isMobileChart = chart.width < 480;
                                ctx.font = `${isMobileChart ? '10' : '11'}px sans-serif`;
                                const FONT_H = isMobileChart ? 12 : 13;
                                const midX = (left + right) / 2;
                                // Build label descriptors
                                const labels = [];
                                chart.data.datasets.forEach((ds, di) => {
                                    const meta = chart.getDatasetMeta(di);
                                    if (!meta?.data?.length) return;
                                    const pt = meta.data[0];
                                    const props = pt.getProps(['x', 'y'], true);
                                    const r = ds.pointRadius || 7;
                                    const text = ellipsis(ds.label, isMobileChart ? 12 : 20);
                                    const textW = ctx.measureText(text).width;
                                    const isRight = props.x > midX;
                                    labels.push({
                                        text,
                                        textW,
                                        isRight,
                                        r,
                                        anchorX: props.x,
                                        anchorY: props.y,
                                        x: props.x + (isRight ? -(r + 4) : r + 4),
                                        y: props.y - r - 2
                                    });
                                });
                                const getBBox = (l) => ({
                                    x1: l.isRight ? l.x - l.textW : l.x,
                                    x2: l.isRight ? l.x : l.x + l.textW,
                                    y1: l.y - FONT_H,
                                    y2: l.y
                                });
                                const overlaps = (a, b) => {
                                    const ba = getBBox(a),
                                        bb = getBBox(b);
                                    return (
                                        ba.x1 < bb.x2 &&
                                        ba.x2 > bb.x1 &&
                                        ba.y1 < bb.y2 &&
                                        ba.y2 > bb.y1
                                    );
                                };
                                const pushVert = (iters) => {
                                    for (let iter = 0; iter < iters; iter++) {
                                        let moved = false;
                                        for (let i = 0; i < labels.length; i++) {
                                            for (let j = i + 1; j < labels.length; j++) {
                                                if (!overlaps(labels[i], labels[j])) continue;
                                                const push = FONT_H / 2 + 1;
                                                if (labels[i].y <= labels[j].y) {
                                                    labels[i].y -= push;
                                                    labels[j].y += push;
                                                } else {
                                                    labels[i].y += push;
                                                    labels[j].y -= push;
                                                }
                                                moved = true;
                                            }
                                        }
                                        if (!moved) break;
                                    }
                                };
                                // Phase 1: vertical push
                                pushVert(30);
                                // Phase 2: flip side for still-overlapping pairs
                                for (let i = 0; i < labels.length; i++) {
                                    for (let j = i + 1; j < labels.length; j++) {
                                        if (!overlaps(labels[i], labels[j])) continue;
                                        const distI = Math.abs(labels[i].anchorX - midX);
                                        const distJ = Math.abs(labels[j].anchorX - midX);
                                        const fl = distI < distJ ? labels[i] : labels[j];
                                        fl.isRight = !fl.isRight;
                                        fl.x = fl.anchorX + (fl.isRight ? -(fl.r + 4) : fl.r + 4);
                                        fl.y = fl.anchorY - fl.r - 2;
                                    }
                                }
                                // Phase 3: vertical push again after flips
                                pushVert(20);
                                // Clamp to chart area
                                labels.forEach((l) => {
                                    l.y = Math.max(top + FONT_H, Math.min(bottom, l.y));
                                });
                                // Draw labels
                                labels.forEach(({ text, isRight, x, y }) => {
                                    ctx.fillStyle = 'rgba(200,212,232,0.9)';
                                    ctx.textBaseline = 'bottom';
                                    ctx.textAlign = isRight ? 'right' : 'left';
                                    ctx.fillText(text, x, y);
                                });
                                ctx.restore();
                            }
                        }
                    ]
                });
            }
            const playerCanvas = document.getElementById(playerCanvasId);
            if (playerCanvas && window.Chart) {
                fetchPlayerPointsByMonth(month, currentStatisticsFormatFilter).then(
                    (playerRows) => {
                        if (!playerRows.length) return;
                        if (_metaPlayerPointsChart) {
                            _metaPlayerPointsChart.destroy();
                            _metaPlayerPointsChart = null;
                        }
                        const playerWrap = playerCanvas.closest('.meta-evol-canvas-wrap');
                        if (playerWrap) {
                            const calcH = Math.max(240, playerRows.length * 22 + 60);
                            playerWrap.style.height = `${calcH}px`;
                        }
                        const labelsFull = playerRows.map((r) => String(r.player || '').trim());
                        const maxLabelLen = labelsFull.reduce((m, v) => Math.max(m, v.length), 0);
                        const labelWidth = Math.min(
                            260,
                            Math.max(140, Math.round(maxLabelLen * 6.6))
                        );
                        const playerPoints = playerRows.map((r) => r.points);
                        const playerAvg = playerPoints.length
                            ? playerPoints.reduce((s, v) => s + v, 0) / playerPoints.length
                            : 0;
                        _metaPlayerPointsChart = new window.Chart(playerCanvas, {
                            type: 'bar',
                            data: {
                                labels: labelsFull,
                                datasets: [
                                    {
                                        data: playerPoints,
                                        backgroundColor: playerRows.map(
                                            (_, i) => SOFT_PALETTE[i % SOFT_PALETTE.length]
                                        ),
                                        borderColor: playerRows.map(
                                            (_, i) => SOFT_PALETTE[i % SOFT_PALETTE.length]
                                        ),
                                        borderWidth: 1.5,
                                        borderRadius: 4,
                                        barThickness: 10,
                                        maxBarThickness: 12
                                    }
                                ]
                            },
                            options: {
                                indexAxis: 'y',
                                responsive: true,
                                maintainAspectRatio: false,
                                layout: { padding: { right: 55, top: 20 } },
                                plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                        ...tooltipDefaults,
                                        callbacks: {
                                            title: (items) => labelsFull[items[0]?.dataIndex] || '',
                                            label: (ctx) => ` ${ctx.parsed.x} pts`
                                        }
                                    }
                                },
                                scales: {
                                    x: {
                                        ...scaleDefaults,
                                        grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                                        border: { color: '#263554' },
                                        ticks: {
                                            color: '#6a7d9f',
                                            font: { size: 11 },
                                            callback: (v) => v + ' pts'
                                        },
                                        beginAtZero: true
                                    },
                                    y: {
                                        ...scaleDefaults,
                                        grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                                        border: { color: '#263554' },
                                        ticks: { color: '#c8d4e8', font: { size: 11 } },
                                        afterFit: (scale) => {
                                            scale.width = labelWidth;
                                        }
                                    }
                                }
                            },
                            plugins: [
                                createValueLabelPlugin(playerPoints, (v) => `${v} pts`),
                                createAverageLinePlugin(
                                    playerAvg,
                                    'média',
                                    (v) => `${Math.round(v)} pts`
                                )
                            ]
                        });
                    }
                );
            }
        }, 0);

        setTimeout(() => {
            const wrap = document.getElementById(canvasId)?.closest('.meta-evolution-wrap');
            if (!wrap) return;
            const btns = wrap.querySelectorAll('.meta-evol-tab-btn');
            const panels = wrap.querySelectorAll('.meta-evol-panel');
            btns.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const target = btn.dataset.evolTab;
                    btns.forEach((b) => b.classList.toggle('is-active', b === btn));
                    panels.forEach((p) =>
                        p.classList.toggle('is-hidden', p.dataset.evolPanel !== target)
                    );
                    if (target === 'players' && _metaPlayerPointsChart) {
                        _metaPlayerPointsChart.resize();
                    }
                    if (target === 'decks') {
                        _metaBarChart?.resize();
                        _metaTop4RateChart?.resize();
                        _metaScatterChart?.resize();
                    }
                });
            });
        }, 0);

        return `<div class="meta-evolution-wrap stats-chart-wrap">
            <div class="meta-evol-tabs">
                <button type="button" class="meta-evol-tab-btn is-active" data-evol-tab="decks">Decks</button>
                <button type="button" class="meta-evol-tab-btn" data-evol-tab="players">Players</button>
            </div>
            <div class="meta-evol-panel" data-evol-panel="decks">
            <div class="meta-evol-bars-row">
                <div class="meta-evol-bar-col">
                    <div class="meta-evol-header">
                        <span class="meta-evol-title">Pontuação por Deck — ${monthLabel}</span>
                    </div>
                    <div class="meta-evol-canvas-wrap meta-evol-canvas-bar">
                        <canvas id="${canvasId}"></canvas>
                    </div>
                </div>
                <div class="meta-evol-bar-col">
                    <div class="meta-evol-header">
                        <span class="meta-evol-title">Taxa Top4 — ${monthLabel}</span>
                    </div>
                    <div class="meta-evol-canvas-wrap meta-evol-canvas-bar">
                        <canvas id="${top4CanvasId}"></canvas>
                    </div>
                </div>
            </div>
            <div class="meta-evol-header" style="margin-top:20px">
                <span class="meta-evol-title">Correlação: Pontuação × Taxa Top4</span>
            </div>
            <div class="meta-evol-canvas-wrap meta-evol-canvas-scatter">
                <canvas id="${scatterCanvasId}"></canvas>
            </div>
            </div>
            <div class="meta-evol-panel is-hidden" data-evol-panel="players">
            <div class="meta-evol-header" style="margin-top:20px">
                <span class="meta-evol-title">Pontuação por Player — ${monthLabel}</span>
            </div>
            <div class="meta-evol-canvas-wrap meta-evol-canvas-bar">
                <canvas id="${playerCanvasId}"></canvas>
            </div>
            </div>
        </div>`;
    }

    // ── Multiple months → line chart evolution ─────────────────────────────
    // Build deck list: top 3 per month (union), ordered by peak share desc, max 8 decks.
    // This ensures breakout decks from any single month are represented.
    const monthlyTopSet = new Set();
    months.forEach((month) => {
        const ranked = [...deckMonthAppear.entries()]
            .map(([deck, mMap]) => ({ deck, count: Number(mMap.get(month)) || 0 }))
            .filter((d) => d.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        ranked.forEach((d) => monthlyTopSet.add(d.deck));
    });
    // Union of top 5 decks per month, sorted by total appearances across all months
    const topNames = [...deckMonthAppear.entries()]
        .filter(([deck]) => monthlyTopSet.has(deck))
        .map(([deck, mMap]) => ({
            deck,
            total: [...mMap.values()].reduce((s, v) => s + v, 0)
        }))
        .sort((a, b) => b.total - a.total)
        .map((d) => d.deck);

    const labels = months.map(fmtMonthKey);

    const bumpTopNames = topNames.slice(0, 10);

    // Compute meta-share rank per month for each deck in bumpTopNames
    const computeBumpRanks = (activeMonthList) => {
        const rankMap = new Map();
        bumpTopNames.forEach((d) => rankMap.set(d, new Map()));
        activeMonthList.forEach((month) => {
            const ranked = bumpTopNames
                .map((deck) => {
                    const byAppear = deckMonthAppear.get(deck) || new Map();
                    const total = monthTotals.get(month) || 1;
                    return { deck, share: ((byAppear.get(month) || 0) / total) * 100 };
                })
                .filter((d) => d.share > 0)
                .sort((a, b) => b.share - a.share);
            ranked.forEach(({ deck }, idx) => rankMap.get(deck)?.set(month, idx + 1));
        });
        return rankMap;
    };

    const bumpRankByMonth = computeBumpRanks(months);
    const bumpMaxRank = bumpTopNames.length;

    const bumpColors = bumpTopNames.map((_, di) => CHART_PALETTE[di % CHART_PALETTE.length]);

    const datasets = bumpTopNames.map((deck, di) => {
        const color = bumpColors[di];
        const rankMap = bumpRankByMonth.get(deck) || new Map();
        return {
            label: deck,
            data: months.map((m) => rankMap.get(m) ?? null),
            borderColor: color,
            backgroundColor: color,
            pointBackgroundColor: color,
            pointBorderColor: '#0f1826',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 8,
            borderWidth: 2.5,
            tension: 0.3,
            spanGaps: false
        };
    });

    const legendId = `meta-evol-legend-${canvasId}`;
    const monthPillsId = `meta-evol-months-${canvasId}`;

    // Total score across all months for bar chart — use pre-aggregated topDecks to match card scores
    const barData = (Array.isArray(topDecks) ? topDecks : [])
        .map((r) => ({
            deck: String(r?.deck || '').trim(),
            score: deckCompositeScore(r),
            titles: Number(r?.titles) || 0,
            top4_total: Number(r?.top4_total) || 0,
            appearances: Number(r?.appearances) || 0
        }))
        .filter((d) => d.deck && d.score > 0)
        .sort((a, b) => {
            const sd = b.score - a.score;
            if (sd !== 0) return sd;
            const td = b.titles - a.titles;
            if (td !== 0) return td;
            const ar = a.appearances > 0 ? a.top4_total / a.appearances : 0;
            const br = b.appearances > 0 ? b.top4_total / b.appearances : 0;
            return br - ar;
        })
        .slice(0, 10);
    const barLabelsFullAll = barData.map((d) => String(d.deck || '').trim());
    const barLabelsShortAll = barLabelsFullAll.map((name) => ellipsis(name, isMobile ? 10 : 16));
    const barMaxLabelLenAll = barLabelsFullAll.reduce((m, v) => Math.max(m, v.length), 0);
    const barLabelWidthAllRaw = Math.min(260, Math.max(140, Math.round(barMaxLabelLenAll * 6.6)));
    const barCanvasId = `meta-bar-canvas-${canvasId}`;
    const top4CanvasId = `meta-top4-canvas-${canvasId}`;
    const playerCanvasId = `meta-player-canvas-${canvasId}`;
    const scatterCanvasId = `meta-scatter-all-canvas-${canvasId}`;
    const MIN_TOP4_RATE_APPEARANCES = 5;
    const top4RateBase = (Array.isArray(topDecks) ? topDecks : [])
        .map((r) => {
            const appearances = Number(r?.appearances) || 0;
            const top4 = Number(r?.top4_total) || 0;
            return {
                deck: String(r?.deck || '').trim(),
                rate: appearances > 0 ? (top4 / appearances) * 100 : 0,
                appearances
            };
        })
        .filter((d) => d.deck && d.rate > 0 && d.appearances >= minTop4AppearancesAll);
    const top4RateTop = [...top4RateBase].sort((a, b) => b.rate - a.rate).slice(0, 10);
    const top4RateData = top4RateTop.filter((d) => d.deck && d.rate > 0);
    const top4MinAppearancesAll = top4RateData.length
        ? Math.min(...top4RateData.map((d) => d.appearances))
        : 0;
    const top4LabelsFull = top4RateData.map((d) => String(d.deck || '').trim());
    const top4LabelsShort = top4RateData.map((d) =>
        ellipsis(String(d.deck || '').trim(), isMobile ? 10 : 16)
    );
    const top4MaxLabelLenAll = top4LabelsFull.reduce((m, v) => Math.max(m, v.length), 0);
    const top4LabelWidthAllRaw = Math.min(260, Math.max(140, Math.round(top4MaxLabelLenAll * 6.6)));
    const sharedLabelWidthAll = Math.max(barLabelWidthAllRaw, top4LabelWidthAllRaw);
    const barLabelWidthAll = sharedLabelWidthAll;
    const top4LabelWidthAll = sharedLabelWidthAll;

    setTimeout(() => {
        if (!isMobile) {
            const canvas = document.getElementById(canvasId);
            if (canvas && window.Chart) {
                _metaEvolutionChart = new window.Chart(canvas, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                        layout: { padding: { right: 170, left: 150, top: 10 } },
                        onClick: (event, elements, chart) => {
                            const precise = chart.getElementsAtEventForMode(
                                event.native,
                                'nearest',
                                { intersect: true },
                                false
                            );
                            const clickedIdx = precise.length ? precise[0].datasetIndex : -1;
                            const alreadySelected =
                                chart._bumpSelectedIdx === clickedIdx && clickedIdx !== -1;
                            chart._bumpSelectedIdx = alreadySelected ? -1 : clickedIdx;
                            const sel = chart._bumpSelectedIdx;
                            chart.data.datasets.forEach((ds, i) => {
                                const base = bumpColors[i];
                                const active = sel === -1 || i === sel;
                                ds.borderColor = active ? base : hexToRgba(base, 0.1);
                                ds.pointBackgroundColor = active ? base : hexToRgba(base, 0.1);
                                ds.borderWidth = active ? 2.5 : 1.5;
                            });
                            chart.update('none');
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                ...tooltipDefaults,
                                callbacks: {
                                    title: (items) => items[0]?.dataset?.label || '',
                                    label: (ctx) => {
                                        const rank = ctx.parsed.y;
                                        const deck = ctx.dataset.label;
                                        const monthIdx = ctx.dataIndex;
                                        const month = months[monthIdx];
                                        const byAppear = deckMonthAppear.get(deck) || new Map();
                                        const total = monthTotals.get(month) || 1;
                                        const share = (
                                            ((byAppear.get(month) || 0) / total) *
                                            100
                                        ).toFixed(1);
                                        return ` ${rank}º lugar · ${share}% meta share`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ...scaleDefaults,
                                ticks: { color: '#6a7d9f', font: { size: 11 }, padding: 16 }
                            },
                            y: {
                                ...scaleDefaults,
                                reverse: true,
                                min: 0.5,
                                max: bumpMaxRank + 0.5,
                                ticks: {
                                    color: '#6a7d9f',
                                    font: { size: 11 },
                                    padding: 16,
                                    stepSize: 1,
                                    callback: (v) => (Number.isInteger(v) ? `${v}º` : '')
                                }
                            }
                        }
                    },
                    plugins: [
                        {
                            id: 'bumpEndLabels',
                            afterDatasetsDraw(chart) {
                                const {
                                    ctx,
                                    chartArea: { left, right, top, bottom }
                                } = chart;
                                ctx.save();
                                const FONT_H = 14;

                                const resolveLabels = (getPoint, getAnchorX, textAlign) => {
                                    const items = [];
                                    chart.data.datasets.forEach((ds, di) => {
                                        const meta = chart.getDatasetMeta(di);
                                        if (!meta?.data?.length) return;
                                        const pt = getPoint(ds, meta);
                                        if (!pt) return;
                                        const props = pt.getProps(['x', 'y'], true);
                                        items.push({
                                            y: props.y,
                                            anchorX: getAnchorX(props.x),
                                            color: bumpColors[di],
                                            label: ellipsis(ds.label, 18),
                                            rank: pt._rank
                                        });
                                    });
                                    items.sort((a, b) => a.y - b.y);
                                    for (let i = 1; i < items.length; i++) {
                                        if (items[i].y - items[i - 1].y < FONT_H)
                                            items[i].y = items[i - 1].y + FONT_H;
                                    }
                                    items.forEach((l) => {
                                        l.y = Math.max(top + FONT_H, Math.min(bottom, l.y));
                                    });
                                    items.forEach(({ y, anchorX, color, label, rank }) => {
                                        ctx.font = '11px sans-serif';
                                        ctx.fillStyle = color;
                                        ctx.textBaseline = 'middle';
                                        ctx.textAlign = textAlign;
                                        ctx.fillText(`${rank}º ${label}`, anchorX, y);
                                    });
                                };

                                // Right-side labels: last non-null point + rise/fall indicator
                                const rightItems = [];
                                chart.data.datasets.forEach((ds, di) => {
                                    const meta = chart.getDatasetMeta(di);
                                    if (!meta?.data?.length) return;
                                    let lastPt = null,
                                        lastRank = null,
                                        lastIdx = -1;
                                    let firstRank = null;
                                    for (let i = 0; i < ds.data.length; i++) {
                                        if (
                                            ds.data[i] !== null &&
                                            ds.data[i] !== undefined &&
                                            firstRank === null
                                        )
                                            firstRank = ds.data[i];
                                    }
                                    for (let i = meta.data.length - 1; i >= 0; i--) {
                                        if (ds.data[i] !== null && ds.data[i] !== undefined) {
                                            lastPt = meta.data[i];
                                            lastRank = ds.data[i];
                                            lastIdx = i;
                                            break;
                                        }
                                    }
                                    if (!lastPt) return;
                                    const props = lastPt.getProps(['x', 'y'], true);
                                    const delta =
                                        firstRank !== null && lastRank !== null
                                            ? firstRank - lastRank
                                            : 0;
                                    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
                                    const arrowColor =
                                        delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#6a7d9f';
                                    rightItems.push({
                                        y: props.y,
                                        color: bumpColors[di],
                                        arrowColor,
                                        arrow,
                                        label: ellipsis(ds.label, 18),
                                        rank: lastRank
                                    });
                                });
                                rightItems.sort((a, b) => a.y - b.y);
                                for (let i = 1; i < rightItems.length; i++) {
                                    if (rightItems[i].y - rightItems[i - 1].y < FONT_H)
                                        rightItems[i].y = rightItems[i - 1].y + FONT_H;
                                }
                                rightItems.forEach((l) => {
                                    l.y = Math.max(top + FONT_H, Math.min(bottom, l.y));
                                });
                                rightItems.forEach(
                                    ({ y, color, arrowColor, arrow, label, rank }) => {
                                        ctx.textBaseline = 'middle';
                                        ctx.textAlign = 'left';
                                        // rank + deck name
                                        ctx.font = '11px sans-serif';
                                        ctx.fillStyle = color;
                                        const rankText = `${rank}º ${label} `;
                                        ctx.fillText(rankText, right + 10, y);
                                        // arrow indicator
                                        ctx.font = 'bold 11px sans-serif';
                                        ctx.fillStyle = arrowColor;
                                        ctx.fillText(
                                            arrow,
                                            right + 10 + ctx.measureText(rankText).width,
                                            y
                                        );
                                    }
                                );

                                // Left-side labels: first non-null point
                                const leftItems = [];
                                chart.data.datasets.forEach((ds, di) => {
                                    const meta = chart.getDatasetMeta(di);
                                    if (!meta?.data?.length) return;
                                    let firstPt = null,
                                        firstRank = null;
                                    for (let i = 0; i < meta.data.length; i++) {
                                        if (ds.data[i] !== null && ds.data[i] !== undefined) {
                                            firstPt = meta.data[i];
                                            firstRank = ds.data[i];
                                            break;
                                        }
                                    }
                                    if (!firstPt) return;
                                    const props = firstPt.getProps(['x', 'y'], true);
                                    leftItems.push({
                                        y: props.y,
                                        color: bumpColors[di],
                                        label: ellipsis(ds.label, 18),
                                        rank: firstRank
                                    });
                                });
                                leftItems.sort((a, b) => a.y - b.y);
                                for (let i = 1; i < leftItems.length; i++) {
                                    if (leftItems[i].y - leftItems[i - 1].y < FONT_H)
                                        leftItems[i].y = leftItems[i - 1].y + FONT_H;
                                }
                                leftItems.forEach((l) => {
                                    l.y = Math.max(top + FONT_H, Math.min(bottom, l.y));
                                });
                                leftItems.forEach(({ y, color, label, rank }) => {
                                    ctx.font = '11px sans-serif';
                                    ctx.fillStyle = color;
                                    ctx.textBaseline = 'middle';
                                    ctx.textAlign = 'right';
                                    ctx.fillText(`${rank}º ${label}`, left - 10, y);
                                });

                                ctx.restore();
                            }
                        }
                    ]
                });

                // Wire up legend toggle clicks
                const legendEl = document.getElementById(legendId);
                if (legendEl) {
                    legendEl.querySelectorAll('.meta-evol-legend-item').forEach((item) => {
                        item.addEventListener('click', () => {
                            const idx = Number(item.dataset.datasetIndex);
                            const chart = _metaEvolutionChart;
                            if (!chart) return;
                            const meta = chart.getDatasetMeta(idx);
                            meta.hidden = !meta.hidden;
                            item.classList.toggle('is-muted', meta.hidden);
                            chart.update();
                        });
                    });
                }

                // Wire up month pill toggles
                const monthPillsEl = document.getElementById(monthPillsId);
                const activeMonths = new Set(months);
                if (monthPillsEl) {
                    monthPillsEl.querySelectorAll('.meta-evol-month-pill').forEach((pill) => {
                        pill.addEventListener('click', () => {
                            const m = pill.dataset.month;
                            if (activeMonths.has(m)) {
                                if (activeMonths.size <= 1) return; // keep at least 1 month
                                activeMonths.delete(m);
                                pill.classList.remove('is-active');
                            } else {
                                activeMonths.add(m);
                                pill.classList.add('is-active');
                            }
                            const chart = _metaEvolutionChart;
                            if (!chart) return;
                            const activeSorted = months.filter((mo) => activeMonths.has(mo));
                            const newRanks = computeBumpRanks(activeSorted);
                            chart.data.labels = activeSorted.map(fmtMonthKey);
                            chart.data.datasets.forEach((ds, di) => {
                                const deck = bumpTopNames[di];
                                const rankMap = newRanks.get(deck) || new Map();
                                ds.data = activeSorted.map((mo) => rankMap.get(mo) ?? null);
                            });
                            chart.update();
                        });
                    });
                }
            } // end if (canvas && window.Chart)
        } // end if (!isMobile)

        if (!window.Chart) return;

        // Bar chart — total score across all months
        if (_metaBarChart) {
            _metaBarChart.destroy();
            _metaBarChart = null;
        }
        const barCanvas = document.getElementById(barCanvasId);
        if (barCanvas && window.Chart) {
            _metaBarChart = new window.Chart(barCanvas, {
                type: 'bar',
                data: {
                    labels: barLabelsShortAll,
                    datasets: [
                        {
                            data: barData.map((d) => d.score),
                            backgroundColor: (ctx) =>
                                getSoftDeckColor(barData[ctx.dataIndex]?.deck, ctx.dataIndex),
                            borderColor: (ctx) =>
                                getSoftDeckColor(barData[ctx.dataIndex]?.deck, ctx.dataIndex),
                            borderWidth: 1.5,
                            borderRadius: 4,
                            barThickness: 10,
                            maxBarThickness: 12
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { right: 55, top: 20 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipDefaults,
                            callbacks: {
                                title: (items) => barData[items[0]?.dataIndex]?.deck || '',
                                label: (ctx) => ` ${ctx.parsed.x} pts`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: {
                                color: '#6a7d9f',
                                font: { size: 11 },
                                callback: (v) => v + ' pts'
                            },
                            beginAtZero: true
                        },
                        y: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: { color: '#c8d4e8', font: { size: 11 } },
                            afterFit: (scale) => {
                                scale.width = barLabelWidthAll;
                            }
                        }
                    }
                },
                plugins: [
                    createValueLabelPlugin(
                        barData.map((d) => d.score),
                        (v) => `${v} pts`
                    ),
                    createAverageLinePlugin(
                        barData.length
                            ? barData.reduce((s, d) => s + d.score, 0) / barData.length
                            : 0,
                        'média',
                        (v) => `${Math.round(v)} pts`
                    )
                ]
            });
        }

        // Bar chart — Top 4 rate (top 12 decks)
        const top4Canvas = document.getElementById(top4CanvasId);
        if (top4Canvas && window.Chart) {
            if (_metaTop4RateChart) {
                _metaTop4RateChart.destroy();
                _metaTop4RateChart = null;
            }
            _metaTop4RateChart = new window.Chart(top4Canvas, {
                type: 'bar',
                data: {
                    labels: top4LabelsShort,
                    datasets: [
                        {
                            data: top4RateData.map((d) => Number(d.rate.toFixed(1))),
                            backgroundColor: (ctx) =>
                                getSoftDeckColor(top4LabelsFull[ctx.dataIndex], ctx.dataIndex),
                            borderColor: (ctx) =>
                                getSoftDeckColor(top4LabelsFull[ctx.dataIndex], ctx.dataIndex),
                            borderWidth: 1.5,
                            borderRadius: 4,
                            barThickness: 10,
                            maxBarThickness: 12
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { right: 55, top: 20 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipDefaults,
                            callbacks: {
                                title: (items) => top4LabelsFull[items[0]?.dataIndex] || '',
                                label: (ctx) => {
                                    const ap = top4RateData[ctx.dataIndex]?.appearances ?? 0;
                                    return ` ${ctx.parsed.x}% · ${ap} aparições`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: {
                                color: '#6a7d9f',
                                font: { size: 11 },
                                callback: (v) => v + '%'
                            },
                            beginAtZero: true,
                            max: 100
                        },
                        y: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: { color: '#c8d4e8', font: { size: 11 } },
                            afterFit: (scale) => {
                                scale.width = top4LabelWidthAll;
                            }
                        }
                    }
                },
                plugins: [
                    createValueLabelPlugin(
                        top4RateData.map((d) => Number(d.rate.toFixed(1))),
                        (v) => `${v}%`
                    ),
                    createAverageLinePlugin(
                        top4RateData.length
                            ? top4RateData.reduce((s, d) => s + d.rate, 0) / top4RateData.length
                            : 0,
                        'média',
                        (v) => `${v.toFixed(1)}%`
                    )
                ]
            });
        }

        // Scatter chart — Score vs Top4 rate
        const scatterCanvas = document.getElementById(scatterCanvasId);
        if (scatterCanvas && window.Chart) {
            if (_metaScatterChart) {
                _metaScatterChart.destroy();
                _metaScatterChart = null;
            }
            const scatterPoints = (Array.isArray(topDecks) ? topDecks : [])
                .map((r) => {
                    const deck = String(r?.deck || '').trim();
                    const score = deckCompositeScore(r);
                    const appearances = Number(r?.appearances) || 0;
                    const top4 = Number(r?.top4_total) || 0;
                    const rate = appearances > 0 ? (top4 / appearances) * 100 : 0;
                    if (!deck || score <= 0) return null;
                    return {
                        x: score,
                        y: Number(rate.toFixed(1)),
                        origScore: score,
                        origRate: Number(rate.toFixed(1)),
                        deck,
                        appearances
                    };
                })
                .filter(Boolean)
                .slice(0, isMobile ? 12 : Infinity);
            // Offset overlapping bubbles radially so they don't stack on top of each other
            const posGroups = new Map();
            scatterPoints.forEach((p, i) => {
                const k = `${p.x}_${p.y}`;
                if (!posGroups.has(k)) posGroups.set(k, []);
                posGroups.get(k).push(i);
            });
            posGroups.forEach((idxs) => {
                if (idxs.length < 2) return;
                idxs.forEach((idx, j) => {
                    const angle = (2 * Math.PI * j) / idxs.length - Math.PI / 2;
                    scatterPoints[idx].x = +(scatterPoints[idx].x + 2 * Math.cos(angle)).toFixed(1);
                    scatterPoints[idx].y = +(scatterPoints[idx].y + 2 * Math.sin(angle)).toFixed(1);
                });
            });
            const avgX = scatterPoints.length
                ? scatterPoints.reduce((s, p) => s + p.origScore, 0) / scatterPoints.length
                : 0;
            const avgY = scatterPoints.length
                ? scatterPoints.reduce((s, p) => s + p.origRate, 0) / scatterPoints.length
                : 0;
            const maxApp = Math.max(...scatterPoints.map((p) => p.appearances), 1);
            const minApp = Math.min(...scatterPoints.map((p) => p.appearances), 1);
            const scaleRadius = (n) => {
                const t = maxApp === minApp ? 0.5 : (n - minApp) / (maxApp - minApp);
                return Math.round(5 + t * 10);
            };
            _metaScatterChart = new window.Chart(scatterCanvas, {
                type: 'scatter',
                data: {
                    datasets: scatterPoints.map((pt) => {
                        const r = scaleRadius(pt.appearances);
                        const prominent = pt.appearances >= MIN_TOP4_RATE_APPEARANCES;
                        return {
                            label: pt.deck,
                            data: [{ x: pt.x, y: pt.y }],
                            backgroundColor: hexToRgba(
                                getSoftDeckColor(pt.deck, 0),
                                prominent ? 0.85 : 0.3
                            ),
                            pointRadius: r,
                            pointHoverRadius: r + 2
                        };
                    })
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 24, right: 24, bottom: 10, left: 10 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipDefaults,
                            callbacks: {
                                title: (items) => items[0]?.dataset?.label || '',
                                label: (ctx) => {
                                    const pt = scatterPoints[ctx.datasetIndex];
                                    return ` ${pt?.origScore ?? ctx.parsed.x} pts · Top4: ${pt?.origRate ?? ctx.parsed.y}% · ${pt?.appearances ?? 0} aparições`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: {
                                color: '#6a7d9f',
                                font: { size: 11 },
                                callback: (v) => v + ' pts'
                            },
                            title: {
                                display: true,
                                text: 'Pontuação',
                                color: '#6a7d9f',
                                font: { size: 10 }
                            },
                            suggestedMin: Math.max(
                                0,
                                Math.min(...scatterPoints.map((p) => p.x)) - 5
                            ),
                            suggestedMax: Math.max(...scatterPoints.map((p) => p.x)) + 5
                        },
                        y: {
                            ...scaleDefaults,
                            grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                            border: { color: '#263554' },
                            ticks: {
                                color: '#6a7d9f',
                                font: { size: 11 },
                                callback: (v) => (v > 100 ? '' : v + '%')
                            },
                            title: {
                                display: true,
                                text: 'Taxa Top4',
                                color: '#6a7d9f',
                                font: { size: 10 }
                            },
                            beginAtZero: true,
                            suggestedMax: 108
                        }
                    }
                },
                plugins: [
                    {
                        id: 'scatterQuadrants',
                        beforeDatasetsDraw(chart) {
                            const {
                                ctx,
                                chartArea: { top, bottom, left, right }
                            } = chart;
                            const px = chart.scales.x.getPixelForValue(avgX);
                            const py = chart.scales.y.getPixelForValue(avgY);
                            ctx.save();
                            ctx.fillStyle = 'rgba(59,166,93,0.04)';
                            ctx.fillRect(px, top, right - px, py - top);
                            ctx.fillStyle = 'rgba(47,115,217,0.04)';
                            ctx.fillRect(left, top, px - left, py - top);
                            ctx.fillStyle = 'rgba(217,74,74,0.04)';
                            ctx.fillRect(left, py, px - left, bottom - py);
                            ctx.fillStyle = 'rgba(226,190,47,0.04)';
                            ctx.fillRect(px, py, right - px, bottom - py);
                            ctx.restore();
                        },
                        afterDatasetsDraw(chart) {
                            const {
                                ctx,
                                chartArea: { top, bottom, left, right }
                            } = chart;
                            const px = chart.scales.x.getPixelForValue(avgX);
                            const py = chart.scales.y.getPixelForValue(avgY);
                            ctx.save();
                            ctx.setLineDash([4, 4]);
                            ctx.lineWidth = 1;
                            ctx.strokeStyle = 'rgba(200,212,232,0.25)';
                            ctx.beginPath();
                            ctx.moveTo(px, top);
                            ctx.lineTo(px, bottom);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(left, py);
                            ctx.lineTo(right, py);
                            ctx.stroke();
                            ctx.setLineDash([]);
                            const isMobile = chart.width < 480;
                            ctx.font = `600 ${isMobile ? '9' : '10'}px sans-serif`;
                            ctx.fillStyle = 'rgba(59,166,93,0.5)';
                            ctx.textBaseline = 'top';
                            ctx.textAlign = 'right';
                            ctx.fillText(isMobile ? 'Dom.' : 'Dominantes', right - 8, top + 6);
                            ctx.fillStyle = 'rgba(47,115,217,0.4)';
                            ctx.textAlign = 'left';
                            ctx.fillText(
                                isMobile ? 'Alta taxa' : 'Alta taxa, baixa pont.',
                                left + 8,
                                top + 6
                            );
                            ctx.fillStyle = 'rgba(226,190,47,0.4)';
                            ctx.textBaseline = 'bottom';
                            ctx.textAlign = 'right';
                            ctx.fillText(
                                isMobile ? 'Alta pont.' : 'Alta pont., baixa taxa',
                                right - 8,
                                bottom - 6
                            );
                            ctx.fillStyle = 'rgba(217,74,74,0.4)';
                            ctx.textAlign = 'left';
                            ctx.fillText(
                                isMobile ? 'Baixo' : 'Baixo desempenho',
                                left + 8,
                                bottom - 6
                            );
                            ctx.fillStyle = 'rgba(200,212,232,0.5)';
                            ctx.font = '10px sans-serif';
                            ctx.textBaseline = 'bottom';
                            ctx.textAlign = 'center';
                            ctx.fillText(`média: ${Math.round(avgX)} pts`, px, top - 3);
                            ctx.textBaseline = 'middle';
                            ctx.textAlign = 'right';
                            ctx.fillText(`média: ${avgY.toFixed(1)}%`, right - 6, py);
                            ctx.restore();
                        }
                    },
                    {
                        id: 'scatterDeckLabels',
                        afterDatasetsDraw(chart) {
                            if (isMobile) return;
                            const {
                                ctx,
                                chartArea: { left, right, top, bottom }
                            } = chart;
                            ctx.save();
                            const isMobileChart = chart.width < 480;
                            ctx.font = `${isMobileChart ? '10' : '11'}px sans-serif`;
                            const FONT_H = isMobileChart ? 12 : 13;
                            const midX = (left + right) / 2;
                            const labels = [];
                            chart.data.datasets.forEach((ds, di) => {
                                const sp = scatterPoints[di];
                                if (!sp || sp.appearances < MIN_TOP4_RATE_APPEARANCES) return;
                                const meta = chart.getDatasetMeta(di);
                                if (!meta?.data?.length) return;
                                const pt = meta.data[0];
                                const props = pt.getProps(['x', 'y'], true);
                                const r = ds.pointRadius || 7;
                                const text = ellipsis(ds.label, 20);
                                const textW = ctx.measureText(text).width;
                                const isRight = props.x > midX;
                                labels.push({
                                    text,
                                    textW,
                                    isRight,
                                    r,
                                    anchorX: props.x,
                                    anchorY: props.y,
                                    x: props.x + (isRight ? -(r + 4) : r + 4),
                                    y: props.y - r - 2
                                });
                            });
                            const getBBox = (l) => ({
                                x1: l.isRight ? l.x - l.textW : l.x,
                                x2: l.isRight ? l.x : l.x + l.textW,
                                y1: l.y - FONT_H,
                                y2: l.y
                            });
                            const overlaps = (a, b) => {
                                const ba = getBBox(a),
                                    bb = getBBox(b);
                                return (
                                    ba.x1 < bb.x2 && ba.x2 > bb.x1 && ba.y1 < bb.y2 && ba.y2 > bb.y1
                                );
                            };
                            const pushVert = (iters) => {
                                for (let iter = 0; iter < iters; iter++) {
                                    let moved = false;
                                    for (let i = 0; i < labels.length; i++) {
                                        for (let j = i + 1; j < labels.length; j++) {
                                            if (!overlaps(labels[i], labels[j])) continue;
                                            const push = FONT_H / 2 + 1;
                                            if (labels[i].y <= labels[j].y) {
                                                labels[i].y -= push;
                                                labels[j].y += push;
                                            } else {
                                                labels[i].y += push;
                                                labels[j].y -= push;
                                            }
                                            moved = true;
                                        }
                                    }
                                    if (!moved) break;
                                }
                            };
                            pushVert(30);
                            for (let i = 0; i < labels.length; i++) {
                                for (let j = i + 1; j < labels.length; j++) {
                                    if (!overlaps(labels[i], labels[j])) continue;
                                    const distI = Math.abs(labels[i].anchorX - midX);
                                    const distJ = Math.abs(labels[j].anchorX - midX);
                                    const fl = distI < distJ ? labels[i] : labels[j];
                                    fl.isRight = !fl.isRight;
                                    fl.x = fl.anchorX + (fl.isRight ? -(fl.r + 4) : fl.r + 4);
                                    fl.y = fl.anchorY - fl.r - 2;
                                }
                            }
                            pushVert(20);
                            labels.forEach((l) => {
                                l.y = Math.max(top + FONT_H, Math.min(bottom, l.y));
                            });
                            labels.forEach(({ text, isRight, x, y }) => {
                                ctx.fillStyle = 'rgba(200,212,232,0.9)';
                                ctx.textBaseline = 'bottom';
                                ctx.textAlign = isRight ? 'right' : 'left';
                                ctx.fillText(text, x, y);
                            });
                            ctx.restore();
                        }
                    }
                ]
            });
        }

        // Player chart — total points across all months
        const playerCanvas = document.getElementById(playerCanvasId);
        if (playerCanvas && window.Chart) {
            fetchPlayerPointsAll(currentStatisticsFormatFilter).then((playerRows) => {
                if (!playerRows.length) return;
                if (_metaPlayerPointsChart) {
                    _metaPlayerPointsChart.destroy();
                    _metaPlayerPointsChart = null;
                }
                const playerWrap = playerCanvas.closest('.meta-evol-canvas-wrap');
                if (playerWrap) {
                    const calcH = Math.max(240, playerRows.length * 22 + 60);
                    playerWrap.style.height = `${calcH}px`;
                }
                const labelsFull = playerRows.map((r) => String(r.player || '').trim());
                const maxLabelLen = labelsFull.reduce((m, v) => Math.max(m, v.length), 0);
                const labelWidth = Math.min(260, Math.max(140, Math.round(maxLabelLen * 6.6)));
                const playerPoints = playerRows.map((r) => r.points);
                const playerAvg = playerPoints.length
                    ? playerPoints.reduce((s, v) => s + v, 0) / playerPoints.length
                    : 0;
                _metaPlayerPointsChart = new window.Chart(playerCanvas, {
                    type: 'bar',
                    data: {
                        labels: labelsFull,
                        datasets: [
                            {
                                data: playerPoints,
                                backgroundColor: playerRows.map(
                                    (_, i) => SOFT_PALETTE[i % SOFT_PALETTE.length]
                                ),
                                borderColor: playerRows.map(
                                    (_, i) => SOFT_PALETTE[i % SOFT_PALETTE.length]
                                ),
                                borderWidth: 1.5,
                                borderRadius: 4,
                                barThickness: 10,
                                maxBarThickness: 12
                            }
                        ]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { right: 55, top: 20 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                ...tooltipDefaults,
                                callbacks: {
                                    title: (items) => labelsFull[items[0]?.dataIndex] || '',
                                    label: (ctx) => ` ${ctx.parsed.x} pts`
                                }
                            }
                        },
                        scales: {
                            x: {
                                ...scaleDefaults,
                                grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
                                border: { color: '#263554' },
                                ticks: {
                                    color: '#6a7d9f',
                                    font: { size: 11 },
                                    callback: (v) => v + ' pts'
                                },
                                beginAtZero: true
                            },
                            y: {
                                ...scaleDefaults,
                                grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                                border: { color: '#263554' },
                                ticks: { color: '#c8d4e8', font: { size: 11 } },
                                afterFit: (scale) => {
                                    scale.width = labelWidth;
                                }
                            }
                        }
                    },
                    plugins: [
                        createValueLabelPlugin(playerPoints, (v) => `${v} pts`),
                        createAverageLinePlugin(playerAvg, 'média', (v) => `${Math.round(v)} pts`)
                    ]
                });
            });
        }

        const wrap = document.getElementById(barCanvasId)?.closest('.meta-evolution-wrap');
        if (wrap) {
            const btns = wrap.querySelectorAll('.meta-evol-tab-btn');
            const panels = wrap.querySelectorAll('.meta-evol-panel');
            btns.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const target = btn.dataset.evolTab;
                    btns.forEach((b) => b.classList.toggle('is-active', b === btn));
                    panels.forEach((p) =>
                        p.classList.toggle('is-hidden', p.dataset.evolPanel !== target)
                    );
                    if (target === 'players' && _metaPlayerPointsChart) {
                        _metaPlayerPointsChart.resize();
                    }
                    if (target === 'decks') {
                        _metaBarChart?.resize();
                        _metaTop4RateChart?.resize();
                        _metaScatterChart?.resize();
                    }
                    if (target === 'evolucao') {
                        _metaEvolutionChart?.resize();
                    }
                });
            });
        }

        // Sortable evolution table (mobile only)
        if (isMobile && wrap) {
            const table = wrap.querySelector('.meta-evol-table');
            if (table) {
                let sortCol = -1;
                let sortAsc = true;
                const ths = [...table.querySelectorAll('thead th')];
                ths.forEach((th, i) => {
                    if (i === 0) return; // skip deck name column
                    th.classList.add('meta-evol-th-sortable');
                    th.addEventListener('click', () => {
                        if (sortCol === i) {
                            sortAsc = !sortAsc;
                        } else {
                            sortCol = i;
                            sortAsc = true;
                        }
                        ths.forEach((h, hi) => {
                            h.classList.remove('sort-asc', 'sort-desc');
                            if (hi === sortCol) h.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
                        });
                        const tbody = table.querySelector('tbody');
                        const rows = [...tbody.querySelectorAll('tr')];
                        rows.sort((a, b) => {
                            const aText = a.querySelectorAll('td')[i]?.textContent.trim() || '–';
                            const bText = b.querySelectorAll('td')[i]?.textContent.trim() || '–';
                            const aRank = aText === '–' ? 999 : parseInt(aText);
                            const bRank = bText === '–' ? 999 : parseInt(bText);
                            return sortAsc ? aRank - bRank : bRank - aRank;
                        });
                        rows.forEach((row) => tbody.appendChild(row));
                    });
                });
            }
        }
    }, 0);

    const legendItemsHtml = datasets
        .map(
            (ds, i) =>
                `<span class="meta-evol-legend-item" data-dataset-index="${i}" title="${escapeHtml(ds.label)}">
            <span class="meta-evol-dot" style="background:${ds.borderColor}"></span>
            <span>${escapeHtml(ds.label)}</span>
        </span>`
        )
        .join('');

    const monthPillsHtml = months
        .map(
            (m) =>
                `<button type="button" class="meta-evol-month-pill is-active" data-month="${m}">${fmtMonthKey(m)}</button>`
        )
        .join('');

    // Mobile evolution table: last 5 months, all decks that ranked in any shown month
    const mobileEvolMonths = months.slice(-5);
    const mobileEvolTableHtml = (() => {
        const headers = mobileEvolMonths.map((m) => `<th>${fmtMonthKey(m)}</th>`).join('');
        // Include all decks that have at least one rank in the shown months
        const visibleDecks = bumpTopNames.filter((deck) => {
            const rankMap = bumpRankByMonth.get(deck) || new Map();
            return mobileEvolMonths.some((m) => rankMap.has(m));
        });
        const rows = visibleDecks
            .map((deck, di) => {
                const color = bumpColors[bumpTopNames.indexOf(deck)];
                const rankMap = bumpRankByMonth.get(deck) || new Map();
                const cells = mobileEvolMonths
                    .map((m) => {
                        const rank = rankMap.get(m);
                        const cls =
                            rank === 1
                                ? 'r1'
                                : rank === 2
                                  ? 'r2'
                                  : rank === 3
                                    ? 'r3'
                                    : rank
                                      ? 'r4'
                                      : '';
                        return `<td class="meta-evol-rank${cls ? ' ' + cls : ''}">${rank ? rank + 'º' : '–'}</td>`;
                    })
                    .join('');
                return `<tr>
                <td class="meta-evol-table-name"><span class="meta-evol-dot" style="background:${color}"></span>${escapeHtml(ellipsis(deck, 12))}</td>
                ${cells}
            </tr>`;
            })
            .join('');
        return `<table class="meta-evol-table">
            <thead><tr><th class="deck-col">Deck</th>${headers}</tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    })();

    return `<div class="meta-evolution-wrap stats-chart-wrap">
        <div class="meta-evol-tabs">
            <button type="button" class="meta-evol-tab-btn is-active" data-evol-tab="decks">Decks</button>
            <button type="button" class="meta-evol-tab-btn" data-evol-tab="evolucao">Evolução</button>
            <button type="button" class="meta-evol-tab-btn" data-evol-tab="players">Players</button>
        </div>
        <div class="meta-evol-panel" data-evol-panel="decks">
        <div class="meta-evol-bars-row">
            <div class="meta-evol-bar-col">
                <div class="meta-evol-header" style="margin-top:20px">
                    <span class="meta-evol-title">Pontuação Total — Todos os Meses</span>
                </div>
                <div class="meta-evol-canvas-wrap meta-evol-canvas-bar">
                    <canvas id="${barCanvasId}"></canvas>
                </div>
            </div>
            <div class="meta-evol-bar-col">
                <div class="meta-evol-header" style="margin-top:20px">
                    <span class="meta-evol-title">Taxa Top4 — Todos os Meses</span>
                </div>
                <div class="meta-evol-canvas-wrap meta-evol-canvas-bar">
                    <canvas id="${top4CanvasId}"></canvas>
                </div>
            </div>
        </div>
        <div class="meta-evol-header" style="margin-top:20px">
            <span class="meta-evol-title">Correlação: Pontuação × Taxa Top4</span>
        </div>
        <div class="meta-evol-canvas-wrap meta-evol-canvas-scatter">
            <canvas id="${scatterCanvasId}"></canvas>
        </div>
        </div>
        <div class="meta-evol-panel is-hidden" data-evol-panel="evolucao">
        ${
            isMobile
                ? `
        <div class="meta-evol-header"><span class="meta-evol-title">Evolução do Meta</span><span class="meta-evol-sort-hint">Toque no mês para ordenar</span></div>
        <div class="meta-evol-table-wrap">${mobileEvolTableHtml}</div>
        `
                : `
        <div class="meta-evol-header is-split">
            <span class="meta-evol-title">Evolução do Meta</span>
            <div class="meta-evol-legend" id="${legendId}">${legendItemsHtml}</div>
            <div class="meta-evol-month-pills is-inline" id="${monthPillsId}">${monthPillsHtml}</div>
        </div>
        <div class="meta-evol-canvas-wrap meta-evol-canvas-evol">
            <canvas id="${canvasId}"></canvas>
        </div>
        `
        }
        </div>
        <div class="meta-evol-panel is-hidden" data-evol-panel="players">
            <div class="meta-evol-header" style="margin-top:20px">
                <span class="meta-evol-title">Pontuação por Player — Todos os Meses</span>
            </div>
            <div class="meta-evol-canvas-wrap meta-evol-canvas-bar">
                <canvas id="${playerCanvasId}"></canvas>
            </div>
        </div>
    </div>`;
}

async function ensureStatisticsDeckColorMap() {
    if (statisticsDeckColorMap && statisticsDeckColorMap.size) return;
    try {
        await loadDeckColorStatisticsRows();
    } catch (_error) {
        // Best-effort: keep default palette if colors can't be loaded
    }
}

function hexToRgba(hex, alpha = 1) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHexColors(hexA, hexB, weight = 0.6) {
    const a = String(hexA || '').replace('#', '');
    const b = String(hexB || '').replace('#', '');
    if (a.length !== 6 || b.length !== 6) return hexA;
    const w = Math.min(1, Math.max(0, weight));
    const ar = parseInt(a.slice(0, 2), 16);
    const ag = parseInt(a.slice(2, 4), 16);
    const ab = parseInt(a.slice(4, 6), 16);
    const br = parseInt(b.slice(0, 2), 16);
    const bg = parseInt(b.slice(2, 4), 16);
    const bb = parseInt(b.slice(4, 6), 16);
    const r = Math.round(ar * (1 - w) + br * w);
    const g = Math.round(ag * (1 - w) + bg * w);
    const b2 = Math.round(ab * (1 - w) + bb * w);
    return `#${[r, g, b2].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function pastelizeColor(hex, mix = 0.2) {
    const normalized = String(hex || '').toLowerCase();
    if (normalized === '#2f2f35') {
        return mixHexColors('#3f4654', '#243450', 0.05);
    }
    return mixHexColors(hex, '#243450', mix);
}

function getDeckColorCodes(deckName) {
    const key = String(deckName || '').trim();
    if (!key) return [];
    const codes = statisticsDeckColorMap?.get(key) || [];
    if (!Array.isArray(codes) || !codes.length) return [];
    const order = new Map(DECK_COLOR_ORDER.map((c, i) => [c, i]));
    return [...new Set(codes)]
        .map((c) => String(c).toLowerCase())
        .filter((c) => COLOR_CODE_PALETTE[c])
        .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

function getDeckColorFill(ctxOrContext, deckName, alpha = 0.7) {
    if (!ctxOrContext) return null;
    const chart = ctxOrContext.chart || null;
    const ctx = chart ? chart.ctx : ctxOrContext;
    if (!ctx) return null;
    const codes = getDeckColorCodes(deckName);
    const colors = codes.map((c) => pastelizeColor(COLOR_CODE_PALETTE[c] || '')).filter(Boolean);
    if (!colors.length) return null;

    // Always use solid primary color — no gradient, no split
    const hasBlack = codes.includes('b');
    const baseColors = hasBlack ? codes.filter((c) => c !== 'b') : codes;
    const primaryCode = baseColors[0] || codes[0];
    const primaryColor = pastelizeColor(COLOR_CODE_PALETTE[primaryCode] || '');
    return hexToRgba(primaryColor, alpha);
}

function createBlackStripePlugin(stripeIndices = []) {
    const targets = new Set(stripeIndices);
    return {
        id: 'blackStripeOverlay',
        afterDatasetsDraw(chart) {
            if (!targets.size) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta?.data?.length) return;
            const ctx = chart.ctx;
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            meta.data.forEach((bar, i) => {
                if (!targets.has(i)) return;
                const { x, y, base, height } = bar.getProps(['x', 'y', 'base', 'height'], true);
                const left = Math.min(x, base);
                const right = Math.max(x, base);
                const top = y - height / 2;
                const h = height;
                if (
                    !Number.isFinite(left) ||
                    !Number.isFinite(right) ||
                    !Number.isFinite(top) ||
                    !Number.isFinite(h)
                ) {
                    return;
                }
                ctx.save();
                ctx.beginPath();
                ctx.rect(left, top, right - left, h);
                ctx.clip();
                const spacing = 30;
                for (let px = left - h; px < right + h; px += spacing) {
                    ctx.beginPath();
                    ctx.moveTo(px, top);
                    ctx.lineTo(px + h, top + h);
                    ctx.stroke();
                }
                ctx.restore();
            });
            ctx.restore();
        }
    };
}

function createValueLabelPlugin(values, formatter) {
    return {
        id: 'barValueLabels',
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            if (!meta?.data?.length) return;
            ctx.save();
            ctx.font = '600 10px sans-serif';
            ctx.fillStyle = '#8fa4c8';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            meta.data.forEach((bar, i) => {
                const v = values[i];
                if (v == null) return;
                const props = bar.getProps(['x', 'y', 'base'], true);
                const rightEdge = Math.max(props.x ?? 0, props.base ?? 0);
                ctx.fillText(formatter(v), rightEdge + 5, props.y);
            });
            ctx.restore();
        }
    };
}

function createAverageLinePlugin(avg, label, formatter) {
    return {
        id: 'avgLine',
        afterDatasetsDraw(chart) {
            const scale = chart.scales?.x;
            if (!scale || !Number.isFinite(avg)) return;
            const x = scale.getPixelForValue(avg);
            const { top, bottom } = chart.chartArea;
            const ctx = chart.ctx;
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = 'rgba(200,212,232,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const valueStr = formatter ? formatter(avg) : String(Math.round(avg));
            ctx.fillStyle = 'rgba(200,212,232,0.55)';
            ctx.font = '600 10px sans-serif';
            ctx.fillText(`${label}: ${valueStr}`, x, top - 4);
            ctx.restore();
        }
    };
}

function deckCompositeScore(r) {
    const top4 = Number(r?.top4_total) || 0;
    const top3 = r?.top3_total != null ? Number(r.top3_total) : top4;
    const top2 = r?.top2_total != null ? Number(r.top2_total) : top3;
    const titles = Number(r?.titles) || 0;
    return titles * 15 + (top2 - titles) * 10 + (top3 - top2) * 7 + (top4 - top3) * 5;
}

function placementPoints(placement) {
    if (placement === 1) return 15;
    if (placement === 2) return 10;
    if (placement === 3) return 7;
    if (placement === 4) return 5;
    return 0;
}

function getMonthRangeKeys(monthKey) {
    const [year, month] = String(monthKey || '')
        .split('-')
        .map(Number);
    if (!year || !month) return null;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const toKey = (d) => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    return { start: toKey(start), end: toKey(end) };
}

async function fetchDeckDailyPointsTrend(deckName, monthKey, formatCode) {
    const range = getMonthRangeKeys(monthKey);
    if (!range || !deckName) return [];
    const baseParams = [
        'select=deck,placement,tournament_date,format_code',
        `deck=eq.${encodeURIComponent(deckName)}`,
        `tournament_date=gte.${range.start}`,
        `tournament_date=lt.${range.end}`,
        'limit=1000'
    ];
    if (formatCode) {
        baseParams.push(`format_code=eq.${encodeURIComponent(formatCode)}`);
    }
    const endpoint = `/rest/v1/v_podium_full?${baseParams.join('&')}`;
    const res = window.supabaseApi
        ? await window.supabaseApi.get(endpoint)
        : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
    if (!res.ok) return [];
    const rows = await res.json();
    const byDate = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        const placement = Number(r?.placement);
        const points = placementPoints(placement);
        if (!points) return;
        const dateKey = normalizeStatisticsDateKey(r?.tournament_date);
        if (!dateKey) return;
        byDate.set(dateKey, (byDate.get(dateKey) || 0) + points);
    });
    return Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, points]) => ({ month: date, pct: points }));
}

async function fetchPlayerPointsByMonth(monthKey, formatCode) {
    const range = getMonthRangeKeys(monthKey);
    if (!range) return [];
    // Try view v_player_points_by_month (preferred)
    const monthDate = `${monthKey}-01`;
    const viewParams = [
        'select=player,points,month,format_code',
        `month=eq.${monthDate}`,
        'limit=1000'
    ];
    if (formatCode) viewParams.push(`format_code=eq.${encodeURIComponent(formatCode)}`);
    const viewEndpoint = `/rest/v1/v_player_points_by_month?${viewParams.join('&')}`;
    const viewRes = window.supabaseApi
        ? await window.supabaseApi.get(viewEndpoint)
        : await fetch(`${SUPABASE_URL}${viewEndpoint}`, { headers });
    if (viewRes.ok) {
        const rows = await viewRes.json();
        const list = (Array.isArray(rows) ? rows : [])
            .map((r) => ({
                player: String(r?.player || '').trim(),
                points: Number(r?.points) || 0
            }))
            .filter((r) => r.player && r.points > 0);
        // If no format filter, aggregate across formats to avoid duplicate players.
        if (!formatCode) {
            const byPlayer = new Map();
            list.forEach((r) => {
                byPlayer.set(r.player, (byPlayer.get(r.player) || 0) + r.points);
            });
            return Array.from(byPlayer.entries())
                .map(([player, points]) => ({ player, points }))
                .sort((a, b) => b.points - a.points);
        }
        return list.sort((a, b) => b.points - a.points);
    }

    // Fallback: compute from v_podium_full
    const params = [
        'select=player,placement,tournament_date,format_code',
        `tournament_date=gte.${range.start}`,
        `tournament_date=lt.${range.end}`,
        'limit=2000'
    ];
    if (formatCode) params.push(`format_code=eq.${encodeURIComponent(formatCode)}`);
    const endpoint = `/rest/v1/v_podium_full?${params.join('&')}`;
    const res = window.supabaseApi
        ? await window.supabaseApi.get(endpoint)
        : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
    if (!res.ok) return [];
    const rows = await res.json();
    const byPlayer = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        const player = String(r?.player || '').trim();
        if (!player) return;
        const points = placementPoints(Number(r?.placement));
        if (!points) return;
        byPlayer.set(player, (byPlayer.get(player) || 0) + points);
    });
    return Array.from(byPlayer.entries())
        .map(([player, points]) => ({ player, points }))
        .sort((a, b) => b.points - a.points);
}

async function fetchPlayerPointsAll(formatCode) {
    // Try view v_player_points_by_month (preferred)
    const viewParams = ['select=player,points,month,format_code', 'limit=5000'];
    if (formatCode) viewParams.push(`format_code=eq.${encodeURIComponent(formatCode)}`);
    const viewEndpoint = `/rest/v1/v_player_points_by_month?${viewParams.join('&')}`;
    const viewRes = window.supabaseApi
        ? await window.supabaseApi.get(viewEndpoint)
        : await fetch(`${SUPABASE_URL}${viewEndpoint}`, { headers });
    if (viewRes.ok) {
        const rows = await viewRes.json();
        const list = (Array.isArray(rows) ? rows : [])
            .map((r) => ({
                player: String(r?.player || '').trim(),
                points: Number(r?.points) || 0,
                format: String(r?.format_code || '').trim()
            }))
            .filter((r) => r.player && r.points > 0);
        const byPlayer = new Map();
        list.forEach((r) => {
            if (formatCode && r.format && r.format !== formatCode) return;
            byPlayer.set(r.player, (byPlayer.get(r.player) || 0) + r.points);
        });
        return Array.from(byPlayer.entries())
            .map(([player, points]) => ({ player, points }))
            .sort((a, b) => b.points - a.points);
    }

    // Fallback: compute from v_podium_full (all months)
    const params = ['select=player,placement,tournament_date,format_code', 'limit=5000'];
    if (formatCode) params.push(`format_code=eq.${encodeURIComponent(formatCode)}`);
    const endpoint = `/rest/v1/v_podium_full?${params.join('&')}`;
    const res = window.supabaseApi
        ? await window.supabaseApi.get(endpoint)
        : await fetch(`${SUPABASE_URL}${endpoint}`, { headers });
    if (!res.ok) return [];
    const rows = await res.json();
    const byPlayer = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
        const player = String(r?.player || '').trim();
        if (!player) return;
        if (formatCode) {
            const fmt = String(r?.format_code || '').trim();
            if (fmt !== formatCode) return;
        }
        const points = placementPoints(Number(r?.placement));
        if (!points) return;
        byPlayer.set(player, (byPlayer.get(player) || 0) + points);
    });
    return Array.from(byPlayer.entries())
        .map(([player, points]) => ({ player, points }))
        .sort((a, b) => b.points - a.points);
}

async function updateTopDeckDailySparklines(panel, deckNames, monthKey, formatCode) {
    if (!panel || !deckNames?.length) return;
    await Promise.all(
        deckNames.map(async (deckName) => {
            const trend = await fetchDeckDailyPointsTrend(deckName, monthKey, formatCode);
            const sparkline = buildSparklineSvg(trend);
            const trendColor = getSparklineTrendColor(trend);
            const card = panel.querySelector(
                `.meta-top-deck-card[data-deck="${CSS.escape(deckName)}"]`
            );
            const sparklineWrap = card?.querySelector('.meta-top-deck-sparkline');
            const trendLabelEl = card?.querySelector('.meta-top-deck-trend-value');
            if (sparklineWrap) sparklineWrap.innerHTML = sparkline;
            if (trendLabelEl) {
                if (trend.length >= 2) {
                    const start = Number(trend[0].pct);
                    const end = Number(trend[trend.length - 1].pct);
                    const formatPlacementFromPoints = (value) => {
                        const pts = Number(value);
                        if (!Number.isFinite(pts)) return '—';
                        const tiers = [
                            { pts: 15, label: '1º' },
                            { pts: 10, label: '2º' },
                            { pts: 7, label: '3º' },
                            { pts: 5, label: '4º' }
                        ];
                        let closest = tiers[0];
                        let bestDiff = Math.abs(pts - closest.pts);
                        for (let i = 1; i < tiers.length; i += 1) {
                            const diff = Math.abs(pts - tiers[i].pts);
                            if (diff < bestDiff) {
                                bestDiff = diff;
                                closest = tiers[i];
                            }
                        }
                        return closest.label;
                    };
                    trendLabelEl.textContent = `${formatPlacementFromPoints(start)} → ${formatPlacementFromPoints(end)}`;
                    trendLabelEl.style.color = trendColor;
                } else {
                    trendLabelEl.textContent = '—';
                    trendLabelEl.style.color = '#8fa8d4';
                }
            }
        })
    );
}

function renderMetaOverview(host, metaRows, colorRows, isMobile, rawMetaRows) {
    const panel = document.createElement('div');
    panel.className = 'meta-overview-panel';
    const isAllPeriod = !currentMetaOverviewPeriod || currentMetaOverviewPeriod === 'all';

    // ── KPI strip ──────────────────────────────────────────────────────────
    const allTournaments = Array.isArray(tournaments) ? tournaments : [];
    const totalTournaments =
        currentMetaOverviewPeriod === 'all' || !currentMetaOverviewPeriod
            ? allTournaments.length
            : allTournaments.filter((t) => {
                  const d = String(t?.tournament_date || '');
                  return d.startsWith(currentMetaOverviewPeriod);
              }).length;
    const uniqueDecks = metaRows.length;
    const topByScore = [...metaRows].sort((a, b) => {
        const sd = deckCompositeScore(b) - deckCompositeScore(a);
        if (sd !== 0) return sd;
        const td = (Number(b?.titles) || 0) - (Number(a?.titles) || 0);
        if (td !== 0) return td;
        const aa = Number(a?.appearances) || 0;
        const ba = Number(b?.appearances) || 0;
        const ar = aa > 0 ? (Number(a?.top4_total) || 0) / aa : 0;
        const br = ba > 0 ? (Number(b?.top4_total) || 0) / ba : 0;
        return br - ar;
    });
    const topDeckName = topByScore[0]?.deck ? escapeHtml(String(topByScore[0].deck)) : '—';
    const allDataMonths = [
        ...new Set(
            (Array.isArray(statisticsViewData) ? statisticsViewData : [])
                .map((r) => normalizeStatisticsMonthKey(r?.month))
                .filter(Boolean)
        )
    ];
    const mesesDados = allDataMonths.length;
    const kpiHtml = `<div class="meta-kpi-strip">
        <div class="meta-kpi-card">
            <span class="meta-kpi-value">${totalTournaments}</span>
            <span class="meta-kpi-label">Torneios</span>
        </div>
        <div class="meta-kpi-card">
            <span class="meta-kpi-value">${uniqueDecks}</span>
            <span class="meta-kpi-label">Decks únicos</span>
        </div>
        <div class="meta-kpi-card">
            <span class="meta-kpi-value meta-kpi-deck">${topDeckName}</span>
            <span class="meta-kpi-label">Deck dominante</span>
        </div>
        <div class="meta-kpi-card">
            <span class="meta-kpi-value">${mesesDados}</span>
            <span class="meta-kpi-label">Meses de dados</span>
        </div>
    </div>`;

    // ── Period filter buttons — one per month + Tudo ───────────────────────
    const availableMonths = [
        ...new Set(
            (Array.isArray(statisticsViewData) ? statisticsViewData : [])
                .map((r) => normalizeStatisticsMonthKey(r?.month))
                .filter(Boolean)
        )
    ].sort();
    const monthBtnLabels = availableMonths.map((m) => {
        const [year, month] = m.split('-');
        const names = [
            'Jan',
            'Fev',
            'Mar',
            'Abr',
            'Mai',
            'Jun',
            'Jul',
            'Ago',
            'Set',
            'Out',
            'Nov',
            'Dez'
        ];
        return { value: m, label: `${names[Number(month) - 1]}/${String(year).slice(2)}` };
    });
    const allPeriods = [...monthBtnLabels, { value: 'all', label: 'Tudo' }];
    const periodHtml = `<div class="meta-period-bar">
        ${allPeriods
            .map(
                (
                    p
                ) => `<button type="button" class="meta-period-btn${currentMetaOverviewPeriod === p.value ? ' is-active' : ''}"
            data-period="${p.value}">${p.label}</button>`
            )
            .join('')}
    </div>`;

    // ── Charts ─────────────────────────────────────────────────────────────
    // Compute previous month color rows for trend arrows
    let prevColorRows = [];
    if (currentMetaOverviewPeriod && currentMetaOverviewPeriod !== 'all') {
        const [py, pm] = currentMetaOverviewPeriod.split('-').map(Number);
        const prevDate = new Date(py, pm - 2, 1); // month - 2 because month is 1-based
        const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        prevColorRows = (Array.isArray(statisticsColorData) ? statisticsColorData : []).filter(
            (r) => normalizeStatisticsMonthKey(r?.month) === prevKey
        );
    }

    const donutHtml = metaRows.length
        ? buildMetaDonutChartHtml(metaRows)
        : '<p class="meta-overview-empty">Sem dados de meta.</p>';
    const colorHtml = colorRows.length
        ? buildColorBarChartHtml(colorRows, prevColorRows)
        : '<p class="meta-overview-empty">Sem dados de cores.</p>';

    // ── Per-deck trend for top-deck sparklines + peak meta share ───────────
    const trendByDeck = new Map();
    const peakShareByDeck = new Map();
    (Array.isArray(rawMetaRows) ? rawMetaRows : []).forEach((r) => {
        const deck = String(r?.deck || '').trim();
        if (!deck) return;
        if (!trendByDeck.has(deck)) trendByDeck.set(deck, []);
        if (isAllPeriod) {
            trendByDeck.get(deck).push({
                month: String(r?.month || ''),
                pct: Number(r?.meta_share_percent) || 0
            });
        }
        const share = Number(r?.meta_share_percent) || 0;
        if (share > (peakShareByDeck.get(deck) || 0)) peakShareByDeck.set(deck, share);
    });
    trendByDeck.forEach((arr) => arr.sort((a, b) => a.month.localeCompare(b.month)));

    // ── Top 3 deck cards ───────────────────────────────────────────────────
    // Sorted by composite score: 1st=15pts, 2nd=10pts, 3rd=7pts, 4th=5pts.
    const sorted = [...metaRows].sort((a, b) => {
        const sd = deckCompositeScore(b) - deckCompositeScore(a);
        if (sd !== 0) return sd;
        const td = (Number(b?.titles) || 0) - (Number(a?.titles) || 0);
        if (td !== 0) return td;
        const aa = Number(a?.appearances) || 0;
        const ba = Number(b?.appearances) || 0;
        const at4 = Number(a?.top4_total) || 0;
        const bt4 = Number(b?.top4_total) || 0;
        const ar = aa > 0 ? at4 / aa : 0;
        const br = ba > 0 ? bt4 / ba : 0;
        return br - ar;
    });
    const total = sorted.reduce((s, r) => s + (Number(r?.appearances) || 0), 0);
    const top3 = sorted.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const deckCardsHtml = top3
        .map((r, i) => {
            const deckName = String(r?.deck || '-');
            const appearances = Number(r?.appearances) || 0;
            const peakShare = peakShareByDeck.get(deckName) || 0;
            const color = CHART_PALETTE[i % CHART_PALETTE.length];
            const trendArr = trendByDeck.get(deckName) || [];
            const trendPcts = trendArr.map((t) => Number(t.pct)).filter((v) => Number.isFinite(v));
            const avgShare = trendPcts.length
                ? trendPcts.reduce((s, v) => s + v, 0) / trendPcts.length
                : 0;
            const deltaShare =
                trendPcts.length >= 2 ? trendPcts[trendPcts.length - 1] - trendPcts[0] : 0;
            const sparkline = buildSparklineSvg(trendArr);
            const trendColor = getSparklineTrendColor(trendArr);
            const trendTitle = isAllPeriod ? 'Meta share' : 'Posição média torneio';
            const trendLabel = isAllPeriod
                ? trendArr.length >= 2
                    ? `${Number(trendArr[0].pct).toFixed(1)}% → ${Number(trendArr[trendArr.length - 1].pct).toFixed(1)}%`
                    : '—'
                : '—';
            const titles = Number(r?.titles) || 0;
            const top4 = Number(r?.top4_total) || 0;
            const score = deckCompositeScore(r).toFixed(0);
            const top4Rate = appearances > 0 ? ((top4 / appearances) * 100).toFixed(0) : null;
            const fmt = (v, suffix = '') =>
                v === null || v === '0' || v === 0 ? '—' : `${v}${suffix}`;
            const isAll = currentMetaOverviewPeriod === 'all' || !currentMetaOverviewPeriod;
            const peakLabel = isAll ? 'média do período' : 'meta do mês';
            const imgUrl = statisticsDeckImageMap.get(deckName) || '';
            const imgHtml = imgUrl
                ? `<img class="meta-top-deck-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(deckName)}" onerror="this.style.display='none'">`
                : '';
            return `<div class="meta-top-deck-card" data-deck="${escapeHtml(deckName)}" role="button" tabindex="0" style="cursor:pointer">
            <div class="meta-top-deck-header">
                <span class="meta-top-deck-medal">${medals[i]}</span>
                <span class="meta-top-deck-name">${escapeHtml(deckName)}</span>
                  <span class="meta-top-deck-pct" style="color:${color}">
                      <span class="meta-top-deck-pct-row">
                          <span class="meta-top-deck-pct-value">${
                              isAll ? `${avgShare.toFixed(1)}%` : `${peakShare.toFixed(1)}%`
                          }</span>
                          <span class="meta-top-deck-pct-label">${peakLabel}</span>
                      </span>
                      ${isAll ? `<span class="meta-top-deck-pct-sub">Mudou ${deltaShare > 0 ? '↑' : deltaShare < 0 ? '↓' : '→'}${Math.abs(deltaShare).toFixed(1)} pontos</span>` : ''}
                  </span>
            </div>
            <div class="meta-top-deck-body">
                ${imgHtml}
                <div class="meta-top-deck-scores">
                    <span class="meta-top-deck-score-item">
                        <span class="meta-score-label" title="1º=15pts · 2º=10pts · 3º=7pts · 4º=5pts">Score ⓘ</span>
                        <span class="meta-score-value">${score} <span style="font-size:0.7em;opacity:0.7">pts</span></span>
                    </span>
                    <span class="meta-top-deck-score-item"><span class="meta-score-label">Aparições</span><span class="meta-score-value">${appearances}</span></span>
                    <span class="meta-top-deck-score-item"><span class="meta-score-label">Títulos</span><span class="meta-score-value">${fmt(titles)}${titles ? ' 🏆' : ''}</span></span>
                    <span class="meta-top-deck-score-item">
                        <span class="meta-score-label">Taxa Top4</span>
                        <span class="meta-score-value">${fmt(top4Rate, '%')}</span>
                    </span>
                </div>
                <div class="meta-top-deck-trend">
                    <div class="meta-top-deck-sparkline">${sparkline}</div>
                    <div class="meta-top-deck-trend-label meta-score-label">${trendTitle}</div>
                    <div class="meta-top-deck-trend-value meta-score-value" style="color:${trendColor}">${trendLabel}</div>
                </div>
            </div>
        </div>`;
        })
        .join('');
    const topDecksLabel = isAllPeriod
        ? 'Top decks por pontos — Todos os meses'
        : `Top decks por pontos — ${formatStatisticsMonthLabel(currentMetaOverviewPeriod)}`;
    const topDecksSection = top3.length
        ? `<div class="meta-top-decks">
                 <span class="meta-top-decks-label">${topDecksLabel}</span>
                 <div class="meta-top-decks-cards">${deckCardsHtml}</div>
             </div>`
        : '';

    // ── Meta Evolution chart ───────────────────────────────────────────────
    const evolutionHtml = buildMetaEvolutionChartHtml(rawMetaRows, sorted, isMobile);

    // ── Assemble ───────────────────────────────────────────────────────────
    const chartsHtml = isMobile
        ? `<div class="meta-overview-tabs">
                <button type="button" class="meta-tab-btn is-active" data-meta-tab="meta">Meta</button>
                <button type="button" class="meta-tab-btn" data-meta-tab="cores">Cores</button>
           </div>
           <div class="meta-tab-panel" data-meta-panel="meta">${donutHtml}</div>
           <div class="meta-tab-panel is-hidden" data-meta-panel="cores">${colorHtml}</div>`
        : `<div class="meta-overview-grid">
               <div class="meta-overview-col">${donutHtml}</div>
               <div class="meta-overview-col">${colorHtml}</div>
           </div>`;

    const deckModalHtml = `
        <div class="meta-deck-modal-backdrop is-hidden">
            <div class="meta-deck-modal" role="dialog" aria-modal="true">
                <div class="meta-deck-modal-header">
                    <img class="meta-deck-modal-img" src="" alt="" style="display:none">
                    <div class="meta-deck-modal-title-wrap">
                        <div class="meta-deck-modal-name-row">
                            <span class="meta-deck-modal-name"></span>
                            <span class="meta-deck-color-badges"></span>
                        </div>
                        <div class="meta-deck-modal-stats-row"></div>
                        <div class="meta-deck-score-breakdown"></div>
                    </div>
                    <button class="meta-deck-modal-close cancel-close" type="button" aria-label="Cancelar">Cancelar</button>
                </div>
                <div class="meta-deck-modal-body">
                    <div class="meta-deck-modal-pilots-wrap">
                        <div class="meta-deck-modal-section-label">Top Pilots</div>
                        <table class="meta-deck-pilots-table">
                            <thead><tr><th>Player</th><th>Vezes</th><th style="white-space:nowrap">Títulos 🏆</th><th style="text-align:right">Pontos</th></tr></thead>
                            <tbody class="meta-deck-pilots-tbody">
                                <tr><td colspan="4" class="meta-pilots-loading">Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="meta-deck-modal-chart-side">
                        <div class="meta-deck-modal-section-label meta-deck-chart-label-evol">Evolução (Meta Share)</div>
                        <div class="meta-deck-modal-chart-wrap">
                            <canvas class="meta-deck-detail-canvas"></canvas>
                        </div>
                        <div class="meta-deck-modal-section-label is-hidden meta-deck-chart-label-place" style="margin-top:14px">Distribuição de Colocações</div>
                        <div class="is-hidden meta-deck-placement-wrap">
                            <div class="meta-deck-placement-pills"></div>
                            <div class="meta-deck-modal-chart-wrap">
                                <canvas class="meta-deck-placement-canvas"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    panel.innerHTML = `${kpiHtml}${periodHtml}${chartsHtml}${topDecksSection}${evolutionHtml}${deckModalHtml}`;
    host.appendChild(panel);

    if (!isAllPeriod && top3.length) {
        const deckNames = top3.map((r) => String(r?.deck || '').trim()).filter(Boolean);
        updateTopDeckDailySparklines(
            panel,
            deckNames,
            currentMetaOverviewPeriod,
            currentStatisticsFormatFilter
        );
    }

    // ── Deck detail modal ──────────────────────────────────────────────────
    const backdrop = panel.querySelector('.meta-deck-modal-backdrop');
    const modalNameEl = backdrop?.querySelector('.meta-deck-modal-name');
    const modalStatsEl = backdrop?.querySelector('.meta-deck-modal-stats-row');
    const modalImgEl = backdrop?.querySelector('.meta-deck-modal-img');
    const modalTbody = backdrop?.querySelector('.meta-deck-pilots-tbody');
    const detailCanvas = backdrop?.querySelector('.meta-deck-detail-canvas');
    const placementCanvas = backdrop?.querySelector('.meta-deck-placement-canvas');
    const placementWrap = backdrop?.querySelector('.meta-deck-placement-wrap');
    const placementLabel = backdrop?.querySelector('.meta-deck-chart-label-place');

    const hideDeckModal = () => {
        backdrop?.classList.add('is-hidden');
        panel
            .querySelectorAll('.meta-top-deck-card')
            .forEach((c) => c.classList.remove('is-active'));
        if (_metaDeckDetailChart) {
            _metaDeckDetailChart.destroy();
            _metaDeckDetailChart = null;
        }
        if (_metaDeckPlacementChart) {
            _metaDeckPlacementChart.destroy();
            _metaDeckPlacementChart = null;
        }
    };

    const showDeckModal = async (deckName, deckRow, color, imgUrl) => {
        if (!backdrop) return;
        panel
            .querySelectorAll('.meta-top-deck-card')
            .forEach((c) => c.classList.remove('is-active'));
        backdrop.classList.remove('is-hidden');

        // Header
        if (modalNameEl) modalNameEl.textContent = deckName;
        if (modalImgEl) {
            if (imgUrl) {
                modalImgEl.src = imgUrl;
                modalImgEl.style.display = '';
            } else {
                modalImgEl.style.display = 'none';
            }
        }

        // Month rows (needed for stats + charts)
        const allMonths = [
            ...new Set(
                (Array.isArray(rawMetaRows) ? rawMetaRows : [])
                    .map((r) => String(r?.month || '').trim())
                    .filter(Boolean)
            )
        ].sort();
        const deckMonthRows = (Array.isArray(rawMetaRows) ? rawMetaRows : []).filter(
            (r) => String(r?.deck || '').trim() === deckName
        );

        // Stats bar
        const appearances = Number(deckRow?.appearances) || 0;
        const titles = Number(deckRow?.titles) || 0;
        const top2 = Number(deckRow?.top2_total) || 0;
        const top3 = Number(deckRow?.top3_total) || 0;
        const top4 = Number(deckRow?.top4_total) || 0;
        const peakShare = peakShareByDeck.get(deckName) || 0;
        const top4Rate = appearances > 0 ? ((top4 / appearances) * 100).toFixed(0) : '—';
        const score = deckCompositeScore(deckRow).toFixed(0);

        // Last event — prefer exact date from last_tournament_date, fall back to month label
        const lastDateExact = deckMonthRows.length
            ? deckMonthRows
                  .map((r) => String(r?.last_tournament_date || ''))
                  .filter(Boolean)
                  .sort()
                  .at(-1)
            : null;
        const lastMonthRaw = deckMonthRows.length
            ? deckMonthRows
                  .map((r) => String(r?.month || ''))
                  .sort()
                  .at(-1)
            : null;
        const lastEventLabel = lastDateExact
            ? formatDate(lastDateExact).slice(0, 5)
            : lastMonthRaw
              ? fmtMonthKey(lastMonthRaw)
              : '—';

        if (modalStatsEl) {
            modalStatsEl.innerHTML = [
                { label: 'Meta %', value: peakShare.toFixed(1) + '%' },
                { label: 'Score', value: score },
                { label: 'Aparições', value: appearances },
                { label: 'Títulos 🏆', value: titles || '—' },
                { label: 'Taxa Top4', value: top4Rate + (appearances > 0 ? '%' : '') },
                { label: 'Last Event', value: lastEventLabel }
            ]
                .map(
                    (s) =>
                        `<div class="meta-deck-modal-stat"><span class="meta-deck-modal-stat-val">${s.value}</span><span class="meta-deck-modal-stat-label">${s.label}</span></div>`
                )
                .join('');
        }

        // Score breakdown
        const breakdownEl = backdrop?.querySelector('.meta-deck-score-breakdown');
        if (breakdownEl) {
            const p1 = titles;
            const p2 = top2 - titles;
            const p3 = top3 - top2;
            const p4 = top4 - top3;
            const parts = [
                p1 > 0 ? `${p1}×1º` : null,
                p2 > 0 ? `${p2}×2º` : null,
                p3 > 0 ? `${p3}×3º` : null,
                p4 > 0 ? `${p4}×4º` : null
            ].filter(Boolean);
            breakdownEl.textContent = parts.length ? `${parts.join(' + ')} = ${score} pts` : '';
        }

        // Color badges
        const badgesEl = backdrop?.querySelector('.meta-deck-color-badges');
        if (badgesEl) {
            const codes = getDeckColorCodes(deckName);
            badgesEl.innerHTML = codes
                .map((c) => {
                    const col = COLOR_CODE_PALETTE[c] || '#888';
                    return `<span class="meta-deck-color-badge" style="background:${col}" title="${c.toUpperCase()}"></span>`;
                })
                .join('');
        }

        // Pilots table loading
        if (modalTbody)
            modalTbody.innerHTML =
                '<tr><td colspan="4" class="meta-pilots-loading">Carregando...</td></tr>';

        // Chart: placement breakdown (single month) or meta share evolution (all months)
        const barLabelPlugin = {
            id: 'deckBarLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets.forEach((ds, di) => {
                    const meta = chart.getDatasetMeta(di);
                    ds.data.forEach((value, i) => {
                        if (!value) return;
                        const bar = meta.data[i];
                        ctx.save();
                        ctx.fillStyle = '#c8dcf5';
                        ctx.font = 'bold 11px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        const labelText =
                            Array.isArray(ds._labelMap) && ds._labelMap[i]
                                ? ds._labelMap[i]
                                : ds._labelSuffix
                                  ? value.toFixed(1) + ds._labelSuffix
                                  : value;
                        ctx.fillText(labelText, bar.x, bar.y - 4);
                        ctx.restore();
                    });
                });
            }
        };

        if (_metaDeckDetailChart) {
            _metaDeckDetailChart.destroy();
            _metaDeckDetailChart = null;
        }
        if (_metaDeckPlacementChart) {
            _metaDeckPlacementChart.destroy();
            _metaDeckPlacementChart = null;
        }

        const scaleDefaults = {
            grid: { color: '#1a2840' },
            ticks: { color: '#6a7d9f', font: { size: 11 }, padding: 8 }
        };
        const chartSideLabel = backdrop.querySelector('.meta-deck-chart-label-evol');

        // Single month: no meta share chart, reuse the first label for placements
        if (allMonths.length === 1 && chartSideLabel) {
            chartSideLabel.textContent = 'Distribuição de Colocações';
        } else if (chartSideLabel) {
            chartSideLabel.textContent = 'Evolução (Meta Share)';
        }

        // Meta share chart — only for multiple months
        if (detailCanvas && allMonths.length > 1) {
            const shares = allMonths.map((m) => {
                const row = deckMonthRows.find((r) => String(r?.month || '').trim() === m);
                return row ? Number(row.meta_share_percent) || 0 : 0;
            });
            const ds = {
                label: 'Meta Share %',
                data: shares,
                backgroundColor: color + '99',
                borderColor: color,
                borderWidth: 1,
                borderRadius: 6
            };
            ds._labelSuffix = '%';
            _metaDeckDetailChart = new Chart(detailCanvas, {
                type: 'bar',
                plugins: [barLabelPlugin],
                data: { labels: allMonths.map(fmtMonthKey), datasets: [ds] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 22 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: { label: (ctx) => `${ctx.parsed.y?.toFixed(1) ?? '—'}%` }
                        }
                    },
                    scales: {
                        x: { ...scaleDefaults },
                        y: {
                            ...scaleDefaults,
                            beginAtZero: true,
                            ticks: { ...scaleDefaults.ticks, callback: (v) => v + '%' }
                        }
                    }
                }
            });
        } else if (detailCanvas && allMonths.length === 1) {
            // Hide the first chart wrap when single month (placement chart takes over in the 2nd slot)
            detailCanvas.closest('.meta-deck-modal-chart-wrap')?.classList.add('is-hidden');
        }

        // Always show placement chart (stacked by player) — rendered after pilot fetch below
        placementWrap?.classList.remove('is-hidden');
        if (allMonths.length === 1) {
            placementLabel?.classList.add('is-hidden');
        } else {
            placementLabel?.classList.remove('is-hidden');
        }

        // Fetch pilot data + individual placements in parallel
        try {
            const activeMonthSet = new Set(allMonths.map((m) => String(m).slice(0, 7)));
            const fmtParam = currentStatisticsFormatFilter
                ? `&format_code=eq.${encodeURIComponent(currentStatisticsFormatFilter)}`
                : '';

            const [pilotsRes, placRes] = await Promise.all([
                window.supabaseApi
                    ? window.supabaseApi.get(
                          `/rest/v1/v_deck_pilot_stats?select=player,times_played,titles,points,month&deck=eq.${encodeURIComponent(deckName)}${fmtParam}&limit=500`
                      )
                    : fetch(
                          `${SUPABASE_URL}/rest/v1/v_deck_pilot_stats?select=player,times_played,titles,points,month&deck=eq.${encodeURIComponent(deckName)}${fmtParam}&limit=500`,
                          { headers }
                      ),
                window.supabaseApi
                    ? window.supabaseApi.get(
                          `/rest/v1/v_podium_full?select=player,placement,tournament_date&deck=eq.${encodeURIComponent(deckName)}${fmtParam}&limit=1000`
                      )
                    : fetch(
                          `${SUPABASE_URL}/rest/v1/v_podium_full?select=player,placement,tournament_date&deck=eq.${encodeURIComponent(deckName)}${fmtParam}&limit=1000`,
                          { headers }
                      )
            ]);

            const pilotsRows = pilotsRes.ok ? await pilotsRes.json() : [];
            const placRows = placRes.ok ? await placRes.json() : [];

            // ── Pilots table ───────────────────────────────────────────────
            const playerMap = new Map();
            (Array.isArray(pilotsRows) ? pilotsRows : []).forEach((r) => {
                const monthKey = String(r?.month || '').slice(0, 7);
                if (activeMonthSet.size && !activeMonthSet.has(monthKey)) return;
                const player = String(r?.player || '').trim() || '—';
                if (!playerMap.has(player))
                    playerMap.set(player, { times: 0, titles: 0, points: 0 });
                const p = playerMap.get(player);
                p.times += Number(r?.times_played) || 0;
                p.titles += Number(r?.titles) || 0;
                p.points += Number(r?.points) || 0;
            });
            const pilotRows = [...playerMap.entries()]
                .map(([name, d]) => ({ name, ...d }))
                .sort((a, b) => b.points - a.points || b.titles - a.titles || b.times - a.times);

            if (modalTbody) {
                if (pilotRows.length === 0) {
                    modalTbody.innerHTML =
                        '<tr><td colspan="4" class="meta-pilots-loading">Sem dados.</td></tr>';
                } else {
                    const rankBadge = ['🥇', '🥈', '🥉'];
                    modalTbody.innerHTML = pilotRows
                        .map(
                            (p, i) => `
                        <tr class="meta-pilots-row${i === 0 ? ' meta-pilots-top' : ''}">
                            <td class="meta-pilots-td meta-pilots-player">
                                <span class="meta-pilots-rank">${rankBadge[i] || `${i + 1}.`}</span>
                                ${escapeHtml(p.name)}
                            </td>
                            <td class="meta-pilots-td meta-pilots-num">${p.times}</td>
                            <td class="meta-pilots-td meta-pilots-num">${p.titles || '—'}</td>
                            <td class="meta-pilots-td meta-pilots-num meta-pilots-pts">${p.points} <span class="meta-pilots-pts-label">pts</span></td>
                        </tr>`
                        )
                        .join('');
                }
            }

            // ── Placement distribution chart (color per placement, filtered by player pills) ──
            if (placementCanvas && placRows.length > 0) {
                const PLAC_COLORS = [
                    '#ffd700cc',
                    '#c0c0c0cc',
                    '#cd7f32cc',
                    '#268d7ccc',
                    '#3a507888'
                ];
                const PLAC_LABELS = [
                    '1° · 15pts',
                    '2° · 10pts',
                    '3° · 7pts',
                    '4° · 5pts',
                    'Outros'
                ];

                // Per-player per-placement counts
                const playerPlacMap = new Map();
                (Array.isArray(placRows) ? placRows : []).forEach((r) => {
                    const monthKey = String(r?.tournament_date || '').slice(0, 7);
                    if (activeMonthSet.size && !activeMonthSet.has(monthKey)) return;
                    const player = String(r?.player || '').trim() || '—';
                    const pl = Number(r?.placement) || 99;
                    if (!playerPlacMap.has(player)) playerPlacMap.set(player, [0, 0, 0, 0, 0]);
                    const arr = playerPlacMap.get(player);
                    if (pl === 1) arr[0]++;
                    else if (pl === 2) arr[1]++;
                    else if (pl === 3) arr[2]++;
                    else if (pl === 4) arr[3]++;
                    else arr[4]++;
                });

                // Sort by points desc (same order as pilot table)
                const sortedPlayers = [...playerPlacMap.entries()].sort((a, b) => {
                    const pts = (c) => c[0] * 15 + c[1] * 10 + c[2] * 7 + c[3] * 5;
                    return pts(b[1]) - pts(a[1]);
                });

                // Active player set (all active by default)
                const activePlayers = new Set(sortedPlayers.map(([n]) => n));

                const computeTotals = () => {
                    const totals = [0, 0, 0, 0, 0];
                    sortedPlayers.forEach(([name, counts]) => {
                        if (!activePlayers.has(name)) return;
                        counts.forEach((v, i) => {
                            totals[i] += v;
                        });
                    });
                    return totals;
                };

                // Build player pills
                const pillsWrap = backdrop.querySelector('.meta-deck-placement-pills');
                if (pillsWrap) {
                    pillsWrap.innerHTML = sortedPlayers
                        .map(
                            ([name], i) =>
                                `<button class="meta-plac-pill is-active" data-player="${escapeHtml(name)}" style="--pill-color:${CHART_PALETTE[i % CHART_PALETTE.length]}">${escapeHtml(name)}</button>`
                        )
                        .join('');
                    pillsWrap.querySelectorAll('.meta-plac-pill').forEach((btn) => {
                        btn.addEventListener('click', () => {
                            const player = btn.dataset.player;
                            if (activePlayers.has(player)) {
                                activePlayers.delete(player);
                                btn.classList.remove('is-active');
                            } else {
                                activePlayers.add(player);
                                btn.classList.add('is-active');
                            }
                            if (_metaDeckPlacementChart) {
                                const totals = computeTotals();
                                const ds = _metaDeckPlacementChart.data.datasets[0];
                                ds.data = totals;
                                ds._labelMap = totals.map((v, i) =>
                                    i === 4 ? `Outros (${v})` : String(v)
                                );
                                _metaDeckPlacementChart.update();
                            }
                        });
                    });
                }

                if (_metaDeckPlacementChart) {
                    _metaDeckPlacementChart.destroy();
                    _metaDeckPlacementChart = null;
                }
                const initialTotals = computeTotals();
                _metaDeckPlacementChart = new Chart(placementCanvas, {
                    type: 'bar',
                    plugins: [barLabelPlugin],
                    data: {
                        labels: PLAC_LABELS,
                        datasets: [
                            {
                                label: 'Colocações',
                                data: initialTotals,
                                backgroundColor: PLAC_COLORS,
                                borderRadius: 5,
                                borderWidth: 0,
                                _labelSuffix: null,
                                _labelMap: initialTotals.map((v, i) =>
                                    i === 4 ? `Outros (${v})` : String(v)
                                )
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 22 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) =>
                                        `${ctx.parsed.y} vez${ctx.parsed.y !== 1 ? 'es' : ''}`
                                }
                            }
                        },
                        scales: {
                            x: { ...scaleDefaults },
                            y: {
                                ...scaleDefaults,
                                beginAtZero: true,
                                ticks: { ...scaleDefaults.ticks, stepSize: 1 }
                            }
                        }
                    }
                });
            }
        } catch (_) {
            if (modalTbody)
                modalTbody.innerHTML =
                    '<tr><td colspan="4" class="meta-pilots-loading">Erro ao carregar.</td></tr>';
        }
    };

    panel.querySelectorAll('.meta-top-deck-card').forEach((card, i) => {
        card.addEventListener('click', () => {
            card.classList.add('is-active');
            const dn = card.dataset.deck;
            const row = top3.find((r) => String(r?.deck || '').trim() === dn) || {};
            showDeckModal(
                dn,
                row,
                CHART_PALETTE[i % CHART_PALETTE.length],
                statisticsDeckImageMap.get(dn) || ''
            );
        });
    });
    backdrop?.querySelector('.meta-deck-modal-close')?.addEventListener('click', hideDeckModal);
    backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) hideDeckModal();
    });

    // Tab switching (mobile)
    panel.querySelectorAll('.meta-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.metaTab;
            panel
                .querySelectorAll('.meta-tab-btn')
                .forEach((b) => b.classList.toggle('is-active', b === btn));
            panel
                .querySelectorAll('.meta-tab-panel')
                .forEach((p) => p.classList.toggle('is-hidden', p.dataset.metaPanel !== target));
        });
    });

    // Period filter
    panel.querySelectorAll('.meta-period-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            currentMetaOverviewPeriod = btn.dataset.period || 'all';
            hasManualMetaPeriodSelection = true;
            renderStatisticsTable(statisticsViewData, 'meta_overview');
        });
    });
}

function buildAttendanceSparkline(entries) {
    if (!Array.isArray(entries) || entries.length < 2) return '';
    const values = entries.map((e) => e.players);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const W = 80,
        H = 28,
        PAD = 2;
    const coords = values.map((v, i) => {
        const x = PAD + (i / (values.length - 1)) * (W - 2 * PAD);
        const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
        return [x.toFixed(1), y.toFixed(1)];
    });
    const polyline = coords.map((c) => c.join(',')).join(' ');
    const lastX = coords[coords.length - 1][0];
    const lastY = coords[coords.length - 1][1];
    const trend = values[values.length - 1] - values[0];
    const color = trend > 0 ? '#26de81' : trend < 0 ? '#fc5c65' : '#8fa8d4';
    const lastVal = values[values.length - 1];
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    return `<div class="store-attendance-trend">
        <span class="store-attendance-label">Jogadores (tendência)</span>
        <div class="store-attendance-sparkwrap">
            <svg class="stats-sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
                <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
                <circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${color}"/>
            </svg>
            <span class="store-attendance-stats">último: ${lastVal} · média: ${avg}</span>
        </div>
    </div>`;
}

function renderStoreChampionsBoard(host, rows, options = {}) {
    const storeAttendance =
        options.storeAttendance instanceof Map ? options.storeAttendance : new Map();
    const grouped = new Map();
    rows.forEach((row) => {
        const store = String(row?.store || '').trim() || 'Unknown Store';
        if (!grouped.has(store)) grouped.set(store, []);
        grouped.get(store).push(row);
    });

    const board = document.createElement('div');
    board.className = 'store-champions-board';
    if (grouped.size === 1) {
        board.classList.add('is-single-store');
    }

    Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([storeName, storeRows]) => {
            const sorted = [...storeRows].sort((a, b) => {
                const rankDiff = (Number(a.store_rank) || 999) - (Number(b.store_rank) || 999);
                if (rankDiff !== 0) return rankDiff;
                const titleDiff = (Number(b.titles) || 0) - (Number(a.titles) || 0);
                if (titleDiff !== 0) return titleDiff;
                return (Number(b.ranking_points) || 0) - (Number(a.ranking_points) || 0);
            });

            const card = document.createElement('article');
            card.className = 'store-podium-card';

            const iconSrc = resolveStoreIcon(storeName);
            const listHtml = sorted
                .map((item, index) => {
                    const rank = Number(item.store_rank) || index + 1;
                    const medalClass =
                        rank === 1
                            ? 'gold'
                            : rank === 2
                              ? 'silver'
                              : rank === 3
                                ? 'bronze'
                                : 'regular';
                    return `
                        <li class="store-podium-item ${medalClass}">
                            <span class="store-podium-rank">#${rank}</span>
                            <div class="store-podium-main">
                                <strong>${escapeHtml(item.player || '-')}</strong>
                                <small>
                                    Titulos: ${Number(item.titles) || 0}
                                    • Pontos: ${Number(item.ranking_points) || 0}
                                </small>
                            </div>
                        </li>
                    `;
                })
                .join('');

            const attendanceEntries = storeAttendance.get(storeName) || [];
            const attendanceHtml = buildAttendanceSparkline(attendanceEntries);

            card.innerHTML = `
                <header class="store-podium-header">
                    <div class="store-podium-title-wrap">
                        <img src="${escapeHtml(iconSrc)}" alt="${escapeHtml(storeName)}" class="store-podium-icon" loading="lazy" />
                        <h3>${escapeHtml(storeName)}</h3>
                    </div>
                </header>
                ${attendanceHtml}
                <ol class="store-podium-list">
                    ${listHtml || '<li class="store-podium-item regular"><div class="store-podium-main">Sem dados</div></li>'}
                </ol>
            `;

            board.appendChild(card);
        });

    host.appendChild(board);
}

function prettifyStatisticsColumn(column, viewName = '') {
    const normalized = String(column || '')
        .trim()
        .toLowerCase();
    if (viewName === 'v_player_ranking') {
        const playerRankingLabels = {
            player: 'Jogador',
            overall_rank: currentStatisticsMonthFilter ? 'Rank Mensal' : 'Rank Geral',
            titles: 'Títulos',
            top4_total: 'Top4',
            entries: 'Aparições',
            unique_decks_used: 'Decks Únicos',
            title_rate_percent: 'Taxa de Títulos',
            ranking_points: 'Pontuação total',
            points: 'Pontuação total'
        };
        if (playerRankingLabels[normalized]) return playerRankingLabels[normalized];
    }

    const labels = {
        ranking_points: 'Pontuação total',
        points: 'Pontuação total',
        avg_placement: 'Média',
        monthly_rank: 'Rank Mensal',
        overall_rank: 'Rank Geral',
        store_rank: 'Rank Loja',
        performance_rank: 'Rank Performance',
        format_rank: 'Rank',
        card_code: 'Carta',
        card_name: 'Nome',
        card_type: 'Tipo',
        is_staple: 'Staple',
        color: 'Cor',
        usage_percent: 'Uso (%)',
        top_deck: 'Deck Líder',
        top_deck_titles: 'Títulos do Líder',
        total: 'Total',
        champion: 'Champion',
        top2: 'Top2',
        top3: 'Top3',
        top4: 'Top4',
        top4_total: 'Top4',
        meta_share_percent: 'Meta Share (%)',
        title_rate_percent: 'Taxa de Títulos (%)',
        unique_players: 'Players Únicos',
        unique_decks_used: 'Decks Únicos',
        tournaments_played: 'Torneios',
        store_title_share_percent: 'Share de Títulos Loja (%)',
        month: 'Mês',
        appearances: 'Aparições',
        entries: 'Aparições',
        titles: 'Títulos',
        trend: 'Tendência'
    };
    if (labels[normalized]) return labels[normalized];
    return String(column || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatisticsHeaderLabel(viewName, column) {
    const normalized = String(column || '')
        .trim()
        .toLowerCase();
    if (viewName === 'v_deck_color_stats') {
        const colorHeaders = {
            month: 'Month',
            format_code: 'Format',
            color: 'Color',
            usage_percent: 'Usage (%)',
            titles: 'Top 1',
            top4_total: 'Top 4',
            top_deck: 'Best Deck',
            top_deck_titles: 'Titles'
        };
        if (colorHeaders[normalized]) return colorHeaders[normalized];
    }
    if (viewName === 'v_top_cards_by_month') {
        const topCardsHeaders = {
            month: 'Month',
            monthly_rank: 'Rank',
            card_code: 'Code',
            card_name: 'Name',
            is_staple: 'Staple',
            card_type: 'Type',
            decklists_with_card: 'Decklists',
            total: 'Decklists',
            total_copies: 'Decklists',
            champion: '1st',
            champion_copies: '1st',
            top2: '2nd',
            top2_copies: '2nd',
            top3: '3rd',
            top3_copies: '3rd',
            top4: '4th',
            top4_copies: '4th'
        };
        if (topCardsHeaders[normalized]) return topCardsHeaders[normalized];
    }
    return prettifyStatisticsColumn(column, viewName);
}

function getStatisticsDisplayColumns(viewName, columns) {
    let list = Array.isArray(columns) ? [...columns] : [];
    list = list.filter((column) => !STATISTICS_REMOVED_COLUMNS.has(String(column || '').trim()));
    if (viewName === 'v_meta_by_month') {
        list = list.filter((column) => column !== 'meta_share_percent');
    } else if (viewName === 'v_deck_color_stats') {
        list = list.filter(
            (column) =>
                column !== 'color_code' && column !== 'top_deck_titles' && column !== 'usage_count'
        );
    } else if (viewName === 'v_top_cards_by_month') {
        list = list.filter(
            (column) =>
                column !== 'card_level' &&
                column !== 'deck_name' &&
                column !== 'pack' &&
                column !== 'color' &&
                column !== 'is_digi_egg' &&
                column !== 'decklists_with_card' &&
                column !== 'total_copies' &&
                column !== 'champion_copies' &&
                column !== 'top2_copies' &&
                column !== 'top3_copies' &&
                column !== 'top4_copies'
        );
    }
    const preferred = STATISTICS_VIEW_COLUMN_ORDER[viewName];
    if (!Array.isArray(preferred) || !preferred.length) return list;

    const ordered = preferred.filter((column) => list.includes(column));
    if (viewName === 'v_player_ranking') {
        return ordered;
    }
    const remaining = list.filter((column) => !ordered.includes(column));
    return [...ordered, ...remaining];
}

function normalizePlayerRankingRows(rows, options = {}) {
    const isMonthly = options?.isMonthly === true;
    const allTimeByPlayer =
        options?.allTimeByPlayer instanceof Map ? options.allTimeByPlayer : new Map();
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => {
        const source = row || {};
        const playerKey = String(source.player || '')
            .trim()
            .toLowerCase();
        const allTimeRow = allTimeByPlayer.get(playerKey) || null;
        const entriesValue = normalizeStatNumber(source.entries);
        const titlesValue = normalizeStatNumber(source.titles);
        const inferredTitleRate =
            Number.isFinite(entriesValue) && entriesValue > 0 && Number.isFinite(titlesValue)
                ? (titlesValue / entriesValue) * 100
                : null;
        const normalized = {
            ...source,
            player: String(source.player || '').trim(),
            overall_rank: normalizeStatNumber(
                source.overall_rank ?? source.monthly_rank ?? source.rank
            ),
            titles: titlesValue,
            top4_total: normalizeStatNumber(source.top4_total ?? source.top4),
            entries: entriesValue,
            unique_decks_used:
                normalizeStatNumber(source.unique_decks_used) ??
                normalizeStatNumber(allTimeRow?.unique_decks_used),
            title_rate_percent: normalizeStatNumber(source.title_rate_percent) ?? inferredTitleRate,
            ranking_points: normalizeStatNumber(source.ranking_points ?? source.points)
        };

        if (isMonthly) {
            normalized.month = source.month || normalized.month || '';
        }
        return normalized;
    });
}

function normalizeStatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function renderStatisticsColorCell(row, value) {
    const colorCode = String(row?.color_code || '')
        .trim()
        .toLowerCase();
    const colorName = String(value || '').trim() || DECK_COLOR_LABELS[colorCode] || '';
    if (!colorCode || !DECK_COLOR_ORDER.includes(colorCode)) {
        return escapeHtml(colorName || '-');
    }
    return `
        <span class="stats-color-cell">
            <span class="deck-color-chip is-${escapeHtml(colorCode)}" aria-hidden="true"></span>
            <span>${escapeHtml(colorName || DECK_COLOR_LABELS[colorCode] || colorCode.toUpperCase())}</span>
        </span>
    `;
}

function getSparklineTrendColor(points) {
    const arr = Array.isArray(points) ? points : [];
    if (arr.length < 2) return '#8fa8d4';
    const values = arr.map((p) => p.pct);
    const trend = values[values.length - 1] - values[0];
    return trend > 0 ? '#26de81' : trend < 0 ? '#fc5c65' : '#8fa8d4';
}

function buildSparklineSvg(points) {
    const arr = Array.isArray(points) ? points : [];
    if (arr.length < 2) return '<span class="sparkline-empty">—</span>';
    const values = arr.map((p) => p.pct);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const W = 72,
        H = 24,
        PAD = 2;
    const coords = values.map((v, i) => {
        const x = PAD + (i / (values.length - 1)) * (W - 2 * PAD);
        const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
        return [x.toFixed(1), y.toFixed(1)];
    });
    const polyline = coords.map((c) => c.join(',')).join(' ');
    const lastX = coords[coords.length - 1][0];
    const lastY = coords[coords.length - 1][1];
    const color = getSparklineTrendColor(points);
    const start = values[0];
    const end = values[values.length - 1];
    const titleText = `Tendência de meta share: ${start.toFixed(1)}% → ${end.toFixed(1)}%`;
    return `<svg class="stats-sparkline" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <title>${titleText}</title>
        <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lastX}" cy="${lastY}" r="2.2" fill="${color}"/>
    </svg>`;
}

function formatStatisticsCellValue(value, column = '', row = null) {
    const normalizedColumn = String(column || '').toLowerCase();
    if (normalizedColumn === 'trend') {
        return buildSparklineSvg(Array.isArray(value) ? value : []);
    }
    if (normalizedColumn === 'is_staple' && row) {
        return renderStatisticsStapleToggle(row, value);
    }
    if (normalizedColumn === 'color' && row) {
        return renderStatisticsColorCell(row, value);
    }

    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return escapeHtml(JSON.stringify(value));

    const text = String(value).trim();
    if (!text) return '-';

    const numeric = Number(text);
    const isNumeric = Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(text);
    const isPercentColumn = normalizedColumn.includes('percent');
    const isAverageColumn = normalizedColumn.includes('avg');
    const isMonthColumn = normalizedColumn === 'month';
    const isTopCardsMetricColumn =
        normalizedColumn === 'total' ||
        normalizedColumn === 'champion' ||
        normalizedColumn === 'top2' ||
        normalizedColumn === 'top3' ||
        normalizedColumn === 'top4';
    const isRankColumn =
        normalizedColumn === 'rank' ||
        normalizedColumn.endsWith('_rank') ||
        normalizedColumn === 'placement' ||
        normalizedColumn.endsWith('_placement');

    if (isMonthColumn) {
        const monthKey = normalizeStatisticsMonthKey(text);
        if (monthKey) return formatStatisticsMonthLabel(monthKey);
    }
    if (isRankColumn && isNumeric) {
        const rank = Math.trunc(numeric);
        const rankClass =
            rank === 1
                ? 'stats-pill-rank-first'
                : rank === 2
                  ? 'stats-pill-rank-second'
                  : rank === 3
                    ? 'stats-pill-rank-third'
                    : rank === 4
                      ? 'stats-pill-rank-fourth'
                      : 'stats-pill-rank-default';
        return `<span class="stats-pill stats-pill-rank ${rankClass}">${formatOrdinal(rank)}</span>`;
    }
    if ((normalizedColumn === 'card_name' || normalizedColumn === 'card_code') && row) {
        const code = normalizeCardCodeForLookup(row?.card_code || '');
        if (code) {
            const display = normalizedColumn === 'card_name' ? text : code;
            return `<span class="stats-card-hover" data-card-preview-code="${escapeHtml(code)}">${escapeHtml(display)}</span>`;
        }
    }
    if (isPercentColumn && isNumeric) {
        return `<span class="stats-pill stats-pill-percent">${numeric.toFixed(2)}%</span>`;
    }
    if (isAverageColumn && isNumeric) {
        return numeric.toFixed(2);
    }
    if (isTopCardsMetricColumn && isNumeric) {
        return String(Math.trunc(numeric));
    }
    if (isNumeric) {
        return numeric.toLocaleString('pt-BR');
    }
    return escapeHtml(text);
}

function renderStatisticsHighlights(host, viewName, rows, columns, options = {}) {
    if (
        !host ||
        !Array.isArray(rows) ||
        !rows.length ||
        !Array.isArray(columns) ||
        !columns.length
    ) {
        return;
    }
    const tableWrapper = host.querySelector('.statistics-table-wrapper');
    if (!tableWrapper) return;

    const highlights = buildStatisticsHighlights(viewName, rows, columns).slice(0, 4);
    if (!highlights.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'statistics-highlights';
    const highlightCardsHtml = highlights
        .map(
            (item) => `
                <article class="statistics-highlight-card">
                    <span class="statistics-highlight-label">${escapeHtml(item.label)}</span>
                    <strong class="statistics-highlight-value">${escapeHtml(item.value)}</strong>
                </article>
            `
        )
        .join('');
    const monthOptions = getStatisticsMonthOptions(
        options.showInlineMonthSelect ? options.monthValues : [],
        options.selectedMonth || ''
    );
    const monthSelectHtml =
        options.showInlineMonthSelect && monthOptions.length
            ? `
                <article class="statistics-highlight-card is-month-select">
                    <span class="statistics-highlight-label">Seleção de mês</span>
                    <select id="statisticsInlineMonthSelect" class="statistics-inline-month-select" aria-label="Selecionar mês no ranking de players">
                        <option value="">Todos os meses</option>
                        ${monthOptions
                            .map(
                                (item) =>
                                    `<option value="${escapeHtml(item.value)}"${item.selected ? ' selected' : ''}>${escapeHtml(item.label)}</option>`
                            )
                            .join('')}
                    </select>
                </article>
            `
            : '';
    wrapper.innerHTML = highlightCardsHtml + monthSelectHtml;

    tableWrapper.insertAdjacentElement('beforebegin', wrapper);

    const inlineMonthSelect = wrapper.querySelector('#statisticsInlineMonthSelect');
    if (inlineMonthSelect) {
        inlineMonthSelect.addEventListener('change', () => {
            currentStatisticsMonthFilter = String(inlineMonthSelect.value || '');
            renderStatisticsTable(statisticsViewData, currentStatisticsView);
        });
    }
}

function buildStatisticsHighlights(viewName, rows, columns) {
    const list = [];
    const hasColumn = (key) => columns.includes(key);
    const valuesFor = (key) => rows.map((row) => row?.[key]);
    const countUnique = (key) =>
        new Set(
            valuesFor(key)
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        ).size;
    const sumNumeric = (key) =>
        valuesFor(key).reduce((total, value) => {
            const n = Number(value);
            return Number.isFinite(n) ? total + n : total;
        }, 0);
    const averageNumeric = (key) => {
        const nums = valuesFor(key)
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
        if (!nums.length) return null;
        return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    if (viewName === 'v_deck_representation') {
        if (hasColumn('deck')) list.push({ label: 'Decks', value: String(countUnique('deck')) });
    } else if (viewName === 'v_deck_stats') {
        if (hasColumn('deck')) list.push({ label: 'Decks', value: String(countUnique('deck')) });
        if (hasColumn('titles')) {
            list.push({ label: 'Torneios', value: sumNumeric('titles').toLocaleString('pt-BR') });
        }
    } else if (viewName === 'v_deck_color_stats') {
        if (hasColumn('color')) list.push({ label: 'Cores', value: String(countUnique('color')) });
        if (hasColumn('titles')) {
            list.push({ label: 'Top 1', value: sumNumeric('titles').toLocaleString('pt-BR') });
        }
        if (hasColumn('top4_total')) {
            list.push({ label: 'Top 4', value: sumNumeric('top4_total').toLocaleString('pt-BR') });
        }
    } else if (viewName === 'v_meta_by_month') {
        if (hasColumn('month')) list.push({ label: 'Meses', value: String(countUnique('month')) });
        if (hasColumn('deck')) list.push({ label: 'Decks', value: String(countUnique('deck')) });
        if (hasColumn('titles')) {
            list.push({ label: 'Torneios', value: sumNumeric('titles').toLocaleString('pt-BR') });
        }
    } else if (viewName === 'v_top_cards_by_month') {
        if (hasColumn('month')) list.push({ label: 'Meses', value: String(countUnique('month')) });
        if (hasColumn('card_code'))
            list.push({ label: 'Cartas', value: String(countUnique('card_code')) });
        if (hasColumn('total')) {
            list.push({ label: 'Total', value: sumNumeric('total').toLocaleString('pt-BR') });
        }
    } else if (viewName === 'v_player_ranking') {
        if (hasColumn('player'))
            list.push({ label: 'Players', value: String(countUnique('player')) });
        if (hasColumn('titles')) {
            list.push({ label: 'Torneios', value: sumNumeric('titles').toLocaleString('pt-BR') });
        }
    } else if (viewName === 'v_store_champions') {
        if (hasColumn('player'))
            list.push({ label: 'Players', value: String(countUnique('player')) });
        if (hasColumn('titles')) {
            list.push({ label: 'Torneios', value: sumNumeric('titles').toLocaleString('pt-BR') });
        }
    } else {
        if (hasColumn('player'))
            list.push({ label: 'Players', value: String(countUnique('player')) });
        if (hasColumn('deck')) list.push({ label: 'Decks', value: String(countUnique('deck')) });
        if (hasColumn('store')) list.push({ label: 'Lojas', value: String(countUnique('store')) });
        if (hasColumn('month')) list.push({ label: 'Meses', value: String(countUnique('month')) });
    }

    const dedup = [];
    const seen = new Set();
    list.forEach((item) => {
        const key = `${item.label}|${item.value}`;
        if (seen.has(key)) return;
        seen.add(key);
        dedup.push(item);
    });
    return dedup;
}

function getStatisticsColumnDescription(viewName, column) {
    const scoped = STATISTICS_COLUMN_HELP_PTBR[viewName] || {};
    const common = STATISTICS_COLUMN_HELP_PTBR.common || {};
    const message = scoped[column] || common[column];
    if (message) return message;
    return `Indicador: ${prettifyStatisticsColumn(column)}.`;
}

function isInternalStatisticsColumn(column, viewName = '') {
    const normalized = String(column || '')
        .trim()
        .toLowerCase();
    if (!normalized) return true;
    if (normalized.startsWith('_')) return true;
    if (STATISTICS_HIDDEN_COLUMNS.has(normalized)) return true;
    if (normalized.endsWith('_id')) return true;
    if (normalized.includes('url')) return true;
    if (normalized.endsWith('_link')) return true;
    if (viewName === 'v_deck_color_stats') {
        if (normalized === 'format_code' || normalized === 'month') return false;
    }
    if (normalized === 'format_code' || normalized === 'format') return true;
    if (normalized === 'store') return true;
    if (normalized === 'month') return true;
    if (normalized.endsWith('_date') || normalized === 'date') return true;
    return false;
}

function toggleStatisticsSort(column) {
    if (currentStatisticsSort.column === column) {
        currentStatisticsSort.direction =
            currentStatisticsSort.direction === 'asc' ? 'desc' : 'asc';
        return;
    }
    currentStatisticsSort.column = column;
    currentStatisticsSort.direction = 'asc';
}

function sortStatisticsRows(rows, sortState) {
    const sorted = [...rows];
    const column = String(sortState?.column || '');
    if (!column) return sorted;

    const direction = sortState.direction === 'desc' ? -1 : 1;
    sorted.sort((a, b) => {
        const left = getStatisticsComparableValue(a?.[column]);
        const right = getStatisticsComparableValue(b?.[column]);

        if (left < right) return -1 * direction;
        if (left > right) return 1 * direction;
        return 0;
    });
    return sorted;
}

function getStatisticsComparableValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    if (typeof value === 'boolean') return value ? 1 : 0;

    const text = String(value).trim();
    if (!text) return '';

    const numeric = Number(text);
    if (!Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(text)) {
        return numeric;
    }

    const dateValue = Date.parse(text);
    if (!Number.isNaN(dateValue) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
        return dateValue;
    }

    return text.toLowerCase();
}

function updateStatisticsSortIndicators(head) {
    if (!head) return;
    const indicators = head.querySelectorAll('[data-stats-sort-indicator]');
    indicators.forEach((el) => {
        const field = el.dataset.statsSortIndicator;
        if (field === currentStatisticsSort.column) {
            el.textContent = currentStatisticsSort.direction === 'asc' ? '\u25B2' : '\u25BC';
            el.classList.add('is-active');
        } else {
            el.textContent = '\u21C5';
            el.classList.remove('is-active');
        }
    });
}

function populateStatisticsMonthSelect(select, values, selectedValue) {
    const monthKeys = getStatisticsMonthOptions(values, selectedValue).map((item) => item.value);

    select.innerHTML =
        '<option value="">Todos os meses</option>' +
        monthKeys
            .map(
                (monthKey) =>
                    `<option value="${monthKey}">${formatStatisticsMonthLabel(monthKey)}</option>`
            )
            .join('');

    if (selectedValue && monthKeys.includes(selectedValue)) {
        select.value = selectedValue;
    } else {
        select.value = '';
    }
}

function getStatisticsMonthOptions(values, selectedValue) {
    const monthKeys = Array.from(
        new Set(
            (Array.isArray(values) ? values : [])
                .map((value) => normalizeStatisticsMonthKey(value))
                .filter(Boolean)
        )
    ).sort((a, b) => b.localeCompare(a));

    return monthKeys.map((monthKey) => ({
        value: monthKey,
        label: formatStatisticsMonthLabel(monthKey),
        selected: selectedValue === monthKey
    }));
}

function normalizeStatisticsMonthKey(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text) return '';

    const fullDateMatch = text.match(/^(\d{4})-(\d{2})-\d{2}/);
    if (fullDateMatch) return `${fullDateMatch[1]}-${fullDateMatch[2]}`;
    const directMonthMatch = text.match(/^(\d{4})-(\d{2})$/);
    if (directMonthMatch) return `${directMonthMatch[1]}-${directMonthMatch[2]}`;

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getUTCFullYear();
        const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
    return '';
}

function formatStatisticsMonthLabel(monthKey) {
    const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return monthKey;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    const label = new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function filterStoreChampionsRowsByPlayer(rows, query) {
    const text = String(query || '')
        .trim()
        .toLowerCase();
    if (!text) return rows;

    return rows.filter((row) =>
        String(row?.player || '')
            .toLowerCase()
            .includes(text)
    );
}

function populateStatisticsValueSelect(select, values, selectedValue, defaultLabel) {
    const options = Array.from(
        new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
    ).sort((a, b) =>
        select.id === 'statisticsFilterFormat'
            ? liveData.compareFormatCodes(a, b, tournamentFormatCatalog)
            : a.localeCompare(b)
    );

    select.innerHTML =
        `<option value="">${escapeHtml(defaultLabel || 'Todos')}</option>` +
        options
            .map(
                (value) =>
                    `<option value="${escapeHtml(value)}">${escapeHtml(select.id === 'statisticsFilterFormat' ? liveData.formatLabel(value, tournamentFormatCatalog) : value)}</option>`
            )
            .join('');

    if (selectedValue && options.includes(selectedValue)) {
        select.value = selectedValue;
    } else {
        select.value = '';
    }
}

function getLatestStatisticsFormat(rows, formatColumn, monthColumn) {
    if (!Array.isArray(rows) || !rows.length || !formatColumn) return '';

    const byFormat = new Map();
    rows.forEach((row) => {
        const formatValue = String(row?.[formatColumn] || '').trim();
        if (!formatValue) return;
        const monthKey = monthColumn ? normalizeStatisticsMonthKey(row?.[monthColumn]) : '';
        const current = byFormat.get(formatValue) || '';
        if (monthKey && (!current || monthKey > current)) {
            byFormat.set(formatValue, monthKey);
            return;
        }
        if (!byFormat.has(formatValue)) {
            byFormat.set(formatValue, current);
        }
    });

    let bestFormat = '';
    let bestMonth = '';
    Array.from(byFormat.entries()).forEach(([formatValue, latestMonth]) => {
        const monthKey = String(latestMonth || '');
        if (monthKey > bestMonth) {
            bestMonth = monthKey;
            bestFormat = formatValue;
            return;
        }
        if (monthKey === bestMonth && formatValue.localeCompare(bestFormat) > 0) {
            bestFormat = formatValue;
        }
    });

    return bestFormat;
}

function getLatestStatisticsMonth(rows, monthColumn, formatColumn = '', formatFilter = '') {
    if (!Array.isArray(rows) || !rows.length || !monthColumn) return '';
    let latest = '';
    rows.forEach((row) => {
        if (formatFilter && formatColumn) {
            const fmt = String(row?.[formatColumn] || '').trim();
            if (fmt !== formatFilter) return;
        }
        const key = normalizeStatisticsMonthKey(row?.[monthColumn]);
        if (key && key > latest) latest = key;
    });
    return latest;
}

function normalizeStatisticsDateKey(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text) return '';
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getUTCFullYear();
        const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
        const day = String(parsed.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return '';
}

function populateStatisticsDateSelect(select, values, selectedValue) {
    const dateKeys = Array.from(
        new Set(values.map((value) => normalizeStatisticsDateKey(value)).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));

    select.innerHTML =
        '<option value="">Todas as datas</option>' +
        dateKeys.map((key) => `<option value="${key}">${formatDate(key)}</option>`).join('');

    if (selectedValue && dateKeys.includes(selectedValue)) {
        select.value = selectedValue;
    } else {
        select.value = '';
    }
}

function isStatisticsMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function getStatisticsFormulaHintHtml(viewName, allRows) {
    const shouldShowPointsLegend =
        viewName === 'v_deck_stats' ||
        viewName === 'v_player_ranking' ||
        viewName === 'v_store_champions' ||
        viewName === 'v_meta_by_month';

    if (viewName === 'v_top_cards_by_month') {
        const rowList = Array.isArray(allRows) ? allRows : [];
        if (!rowList.length) return '';
        const uniqueCards = new Set(rowList.map((r) => r?.card_code).filter(Boolean)).size;
        if (currentStatisticsDeckFilter) {
            return `<div class="statistics-coverage-note">
                <span class="coverage-icon">📋</span>
                <span>${uniqueCards} carta${uniqueCards !== 1 ? 's' : ''} em decklists Top 4 de <strong>${currentStatisticsDeckFilter}</strong></span>
                <span class="coverage-tip">Apenas decklists registradas pelo deckbuilder aparecem aqui.</span>
            </div>`;
        }
        const uniqueMonths = new Set(
            rowList.map((r) => normalizeStatisticsMonthKey(r?.month)).filter(Boolean)
        ).size;
        const monthLabel = uniqueMonths === 1 ? '1 mês' : `${uniqueMonths} meses`;
        return `<div class="statistics-coverage-note">
            <span class="coverage-icon">📋</span>
            <span>${uniqueCards} carta${uniqueCards !== 1 ? 's' : ''} em decklists Top 4 registradas · ${monthLabel} de dados</span>
            <span class="coverage-tip">Apenas decklists registradas pelo deckbuilder aparecem aqui.</span>
        </div>`;
    }

    if (!shouldShowPointsLegend) return '';

    return `
        <div class="statistics-points-legend" aria-label="Sistema de pontuação">
            <span class="points-pill gold">1º +15pts</span>
            <span class="points-pill silver">2º +10pts</span>
            <span class="points-pill bronze">3º +7pts</span>
            <span class="points-pill top4">4º +5pts</span>
        </div>
    `;
}

// ─── Inline SVG Charts ────────────────────────────────────────────────────────

const CHART_PALETTE = [
    '#667eea',
    '#f7b731',
    '#fc5c65',
    '#26de81',
    '#fd9644',
    '#45aaf2',
    '#a55eea',
    '#20bf6b',
    '#eb3b5a',
    '#2bcbba'
];

const COLOR_CODE_PALETTE = {
    r: '#d94a4a',
    u: '#2f73d9',
    y: '#e2be2f',
    g: '#3ba65d',
    b: '#2f2f35',
    p: '#8e49c7',
    w: '#f4f4f6'
};

// Soft palette — pastelized deck colors by color code
const SOFT_COLOR_MAP = {
    r: pastelizeColor(COLOR_CODE_PALETTE.r),
    p: pastelizeColor(COLOR_CODE_PALETTE.p),
    u: pastelizeColor(COLOR_CODE_PALETTE.u),
    g: pastelizeColor(COLOR_CODE_PALETTE.g),
    y: pastelizeColor(COLOR_CODE_PALETTE.y),
    b: pastelizeColor(COLOR_CODE_PALETTE.b),
    w: '#7a8fa8' // muted blue-grey — white pastel blends into the background
};
const SOFT_PALETTE = Object.values(SOFT_COLOR_MAP); // array fallback for player charts

function getSoftDeckColor(deckName, fallbackIndex = 0) {
    const codes = getDeckColorCodes(deckName);
    const primary = codes.filter((c) => c !== 'b')[0] || codes[0];
    return SOFT_COLOR_MAP[primary] || SOFT_PALETTE[fallbackIndex % SOFT_PALETTE.length];
}

function renderStatisticsCharts(host, viewName, filteredRows) {
    const chartArea = host ? host.querySelector('#statisticsChartArea') : null;
    if (!chartArea) return;

    const showChart =
        (viewName === 'v_meta_by_month' || viewName === 'v_deck_color_stats') &&
        Array.isArray(filteredRows) &&
        filteredRows.length > 0;

    chartArea.classList.toggle('is-hidden', !showChart);
    if (!showChart) {
        chartArea.innerHTML = '';
        return;
    }

    if (viewName === 'v_meta_by_month') {
        chartArea.innerHTML = buildMetaDonutChartHtml(filteredRows);
    } else if (viewName === 'v_deck_color_stats') {
        chartArea.innerHTML = buildColorBarChartHtml(filteredRows);
    }
}

function buildMetaDonutChartHtml(rows) {
    const sorted = [...rows].sort(
        (a, b) => Number(b?.appearances || 0) - Number(a?.appearances || 0)
    );
    const total = sorted.reduce((sum, r) => sum + Number(r?.appearances || 0), 0);
    if (!total) return '';

    const TOP_N = 7;
    const topRows = sorted.slice(0, TOP_N);
    const othersRows = sorted.slice(TOP_N);
    const othersCount = othersRows.reduce((sum, r) => sum + Number(r?.appearances || 0), 0);
    const othersDecks = othersRows.length;
    const segments = topRows.map((r, i) => ({
        label: String(r?.deck || r?.deck_name || '-'),
        value: Number(r?.appearances || 0),
        color: CHART_PALETTE[i % CHART_PALETTE.length]
    }));
    if (othersCount > 0)
        segments.push({
            label: `Outros (${othersDecks} decks)`,
            value: othersCount,
            color: '#cbd5e1'
        });

    const donutCanvasId = `meta-donut-canvas-${Date.now()}`;

    if (_metaDonutChart) {
        _metaDonutChart.destroy();
        _metaDonutChart = null;
    }

    setTimeout(() => {
        const canvas = document.getElementById(donutCanvasId);
        if (!canvas || !window.Chart) return;
        _metaDonutChart = new window.Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: segments.map((s) => s.label),
                datasets: [
                    {
                        data: segments.map((s) => s.value),
                        backgroundColor: segments.map((s) => s.color),
                        borderColor: '#131e2e',
                        borderWidth: 2,
                        hoverOffset: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '58%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a2640',
                        borderColor: '#2d3f55',
                        borderWidth: 1,
                        titleColor: '#c8d4e8',
                        bodyColor: '#8fa4c8',
                        padding: 10,
                        callbacks: {
                            label: (ctx) => {
                                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                                return ` ${ctx.label}: ${pct}%`;
                            }
                        }
                    }
                }
            },
            plugins: []
        });
    }, 0);

    const LEGEND_MAX = 5;
    const legendSegments = segments
        .filter((seg) => !seg.label.startsWith('Outros'))
        .slice(0, LEGEND_MAX);
    const legendItems = legendSegments
        .map((seg) => {
            const pct = ((seg.value / total) * 100).toFixed(1);
            return `<span class="chart-legend-item">
            <span class="chart-legend-dot" style="background:${seg.color}"></span>
            <span class="chart-legend-label">${seg.label}</span>
            <span class="chart-legend-pct">${pct}%</span>
        </span>`;
        })
        .join('');

    // Herfindahl-Hirschman Index — uses all rows (not just top 7)
    const hhi = sorted.reduce((sum, r) => {
        const share = Number(r?.appearances || 0) / total;
        return sum + share * share;
    }, 0);
    const effectiveDecks = hhi > 0 ? Math.round(1 / hhi) : sorted.length;
    const hhiPct = Math.round(hhi * 100);

    // Diversity levels — bar goes left=green (diverse) to right=red (concentrated)
    // Cap display at 25% HHI; calibrated for Digimon TCG diverse meta
    const HHI_DISPLAY_MAX = 0.2;
    const indicatorPct = Math.min(hhi / HHI_DISPLAY_MAX, 1) * 100;

    const diversityLabel =
        hhi < 0.04
            ? 'Muito diverso'
            : hhi < 0.1
              ? 'Diverso'
              : hhi < 0.15
                ? 'Moderado'
                : 'Concentrado';
    const diversityColor =
        hhi < 0.04 ? '#22c55e' : hhi < 0.1 ? '#84cc16' : hhi < 0.15 ? '#f59e0b' : '#ef4444';
    const diversityDesc =
        hhi < 0.04
            ? 'muitos decks competitivos diferentes'
            : hhi < 0.1
              ? 'boa variedade de decks no meta'
              : hhi < 0.15
                ? 'alguns decks dominam o meta'
                : 'um ou poucos decks dominam o meta';

    // Threshold ticks — vertical marks above the bar
    const t1 = (0.05 / HHI_DISPLAY_MAX) * 100;
    const t2 = (0.1 / HHI_DISPLAY_MAX) * 100;
    const t3 = (0.15 / HHI_DISPLAY_MAX) * 100;
    const ticks = [
        { pct: t1, label: '5%' },
        { pct: t2, label: '10%' },
        { pct: t3, label: '15%' }
    ];
    const ticksHtml = ticks
        .map(
            (t) =>
                `<div class="meta-gauge-tick" style="left:${t.pct.toFixed(1)}%">
            <div class="meta-gauge-tick-line"></div>
            <span class="meta-gauge-tick-label">${t.label}</span>
        </div>`
        )
        .join('');

    // Region labels centered between each pair of thresholds, overlaid on the bar
    const regions = [
        { label: 'Muito diverso', center: t1 / 2 },
        { label: 'Diverso', center: (t1 + t2) / 2 },
        { label: 'Moderado', center: (t2 + t3) / 2 },
        { label: 'Concentrado', center: (t3 + 100) / 2 }
    ]; // thresholds: 5% / 10% / 15% (HHI, calibrated for Digimon TCG)
    const regionsHtml = regions
        .map(
            (rg) =>
                `<span class="meta-gauge-region-label" style="left:${rg.center.toFixed(1)}%">${rg.label}</span>`
        )
        .join('');

    return `<div class="stats-chart-wrap stats-donut-wrap">
        <div class="meta-donut-top-row">
            <div class="meta-donut-header">
                <span class="meta-donut-title">Distribuição do&nbsp;Meta <span class="meta-donut-title-sub">(Meta Share)</span></span>
                <span class="meta-donut-caption">ordenado por aparições</span>
            </div>
            <div class="meta-diversity-pill">
                <span class="meta-diversity-pill-score" style="color:${diversityColor}">${diversityLabel} <span class="meta-diversity-pill-pct">(${hhiPct}%)</span></span>
                <span class="meta-diversity-pill-detail">${diversityDesc}</span>
                <span class="meta-diversity-pill-detail">~${effectiveDecks} decks competitivos</span>
            </div>
        </div>
        <div class="meta-gauge-wrap">
            <div class="meta-gauge-row">
                <div class="meta-gauge-bar">
                    <div class="meta-gauge-indicator" style="left:${indicatorPct.toFixed(1)}%">
                        <div class="meta-gauge-indicator-dot" style="background:${diversityColor}"></div>
                    </div>
                    ${ticksHtml}
                    ${regionsHtml}
                </div>
            </div>
        </div>
        <div class="meta-donut-body">
            <div class="meta-donut-canvas-wrap">
                <canvas id="${donutCanvasId}"></canvas>
            </div>
            <div class="stats-chart-legend">${legendItems}</div>
        </div>
    </div>`;
}

function buildColorBarChartHtml(rows, prevRows = []) {
    // Aggregate current period by color_code
    const aggregate = (rowList) => {
        const map = new Map();
        rowList.forEach((r) => {
            const code = String(r?.color_code || '').toLowerCase();
            if (!code) return;
            const e = map.get(code) || {
                color_code: code,
                color: String(r?.color || code.toUpperCase()),
                sum: 0,
                count: 0
            };
            e.sum += Number(r?.usage_percent || 0);
            e.count += 1;
            map.set(code, e);
        });
        return map;
    };

    const byCode = aggregate(rows);
    const prevByCode = aggregate(prevRows);

    const sorted = Array.from(byCode.values())
        .map((e) => ({ ...e, usage_percent: e.sum / e.count }))
        .sort((a, b) => b.usage_percent - a.usage_percent);

    if (!sorted.length) return '';
    const maxPct = Math.max(...sorted.map((r) => r.usage_percent), 1);
    const hasPrev = prevByCode.size > 0;

    const bars = sorted
        .map((r) => {
            const pct = r.usage_percent;
            const barW = Math.max(2, (pct / maxPct) * 100);
            const fill = COLOR_CODE_PALETTE[r.color_code] || CHART_PALETTE[0];

            let trendHtml = '';
            if (hasPrev) {
                const prev = prevByCode.get(r.color_code);
                const prevPct = prev ? prev.sum / prev.count : null;
                if (prevPct !== null) {
                    const diff = pct - prevPct;
                    const diffLabel = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
                    const arrowUp = `<svg class="color-bar-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4l-5 6h3v6h4v-6h3z" fill="currentColor"/></svg>`;
                    const arrowDown = `<svg class="color-bar-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16l5-6h-3V4H8v6H5z" fill="currentColor"/></svg>`;
                    const arrowFlat = `<svg class="color-bar-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
                    if (Math.abs(diff) < 0.5) {
                        trendHtml = `<span class="color-bar-trend neutral" title="Estável vs mês anterior">${arrowFlat}<span class="color-bar-diff">(${diffLabel})</span></span>`;
                    } else if (diff > 0) {
                        trendHtml = `<span class="color-bar-trend up" title="${diffLabel} vs mês anterior">${arrowUp}<span class="color-bar-diff">(${diffLabel})</span></span>`;
                    } else {
                        trendHtml = `<span class="color-bar-trend down" title="${diffLabel} vs mês anterior">${arrowDown}<span class="color-bar-diff">(${diffLabel})</span></span>`;
                    }
                }
            }

            const colorLabel = String(r.color || '').trim();
            return `<div class="color-bar-row">
            <span class="color-bar-label" title="${escapeHtml(colorLabel)}">${escapeHtml(colorLabel)}</span>
            <div class="color-bar-track">
                <div class="color-bar-fill" style="width:${barW.toFixed(1)}%;background:${fill}"></div>
            </div>
            <span class="color-bar-pct">${pct.toFixed(1)}%</span>
            ${trendHtml}
        </div>`;
        })
        .join('');

    return `<div class="stats-chart-wrap stats-color-bars-wrap">
        <div class="color-bar-header">
            <span class="color-bar-title">Distribuição por Cor</span>
            <span class="color-bar-subtitle">% de aparições no Top 4 que incluem cada cor · decks multicolor contam em todas as cores${hasPrev ? ' · vs mês anterior' : ''}</span>
        </div>
        <div class="stats-color-bars">${bars}</div>
    </div>`;
}

function handleStatisticsViewportChange() {
    if (!statisticsViewMounted) return;
    if (currentDashboardView !== 'statistics') return;
    if (currentStatisticsView !== 'v_store_champions') return;
    renderStatisticsTable(statisticsViewData, currentStatisticsView);
}

function renderCalendarView() {
    const container = document.getElementById('calendarViewContainer');
    if (!container || !window.TournamentCalendarView) return;
    ensureCalendarMonthKey();
    const available = getAvailableCalendarMonthKeys();
    const currentIndex = available.indexOf(calendarMonthKey);
    const currentYear = Number((calendarMonthKey || '').split('-')[0]);
    const years = Array.from(new Set(available.map((key) => Number(key.split('-')[0]))))
        .filter((year) => Number.isInteger(year))
        .sort((a, b) => a - b);
    const hasPrevYear = years.some((year) => year < currentYear);
    const hasNextYear = years.some((year) => year > currentYear);

    window.TournamentCalendarView.render(container, {
        monthKey: calendarMonthKey,
        tournaments: filteredTournaments,
        monthNames: MONTH_NAMES_PT,
        hasPrevMonth: currentIndex > 0,
        hasNextMonth: currentIndex >= 0 && currentIndex < available.length - 1,
        hasPrevYear,
        hasNextYear,
        onPrev: () => moveCalendarMonth(-1),
        onNext: () => moveCalendarMonth(1),
        onPrevYear: () => moveCalendarYear(-1),
        onNextYear: () => moveCalendarYear(1),
        onSelectEvent: (eventData) => openCalendarTournamentDetails(eventData),
        onSelectDay: (dateString, entries) => {
            if (window.matchMedia('(max-width: 768px)').matches && entries?.length) {
                renderMobileCalendarDayEvents(dateString, entries);
                return;
            }
            openCreateTournamentModal(dateString);
        }
    });
}

function renderMobileCalendarDayEvents(dateString, entries) {
    const container = document.getElementById('calendarTournamentDetails');
    if (!container) return;
    if (entries.length === 1) {
        openCalendarTournamentDetails(entries[0]);
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }

    const compactDate = getCompactTournamentDate(dateString);
    container.classList.remove('is-hidden');
    container.innerHTML = `
        <section class="mobile-calendar-expanded-panel">
            <div class="mobile-calendar-events-heading">
                <strong>${compactDate.day} ${compactDate.month}</strong>
                <span>${entries.length} ${entries.length === 1 ? 'torneio' : 'torneios'}</span>
            </div>
            <div class="mobile-calendar-expanded-list"></div>
        </section>`;
    const list = container.querySelector('.mobile-calendar-expanded-list');
    entries.forEach((entry) => {
        const detailsHost = document.createElement('article');
        detailsHost.className = 'mobile-calendar-expanded-item';
        detailsHost.innerHTML =
            '<div class="details-block"><span class="spinner" aria-hidden="true"></span> Carregando detalhes...</div>';
        list?.appendChild(detailsHost);
        renderTournamentDetails(resolveCalendarTournament(entry), detailsHost);
    });
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resolveCalendarTournament(eventData) {
    const matchedTournament = tournaments.find(
        (item) => String(item?.id || '') === String(eventData?.id || '')
    );
    if (matchedTournament) return matchedTournament;
    return {
        id: eventData?.id || '',
        store_id: eventData?.storeId || '',
        tournament_date: eventData?.tournamentDate || '',
        tournament_name: eventData?.tournamentName || 'Torneio',
        total_players: eventData?.totalPlayers || '',
        format_id: eventData?.formatId || null,
        format: eventData?.format || eventData?.formatCode || '',
        store: { name: eventData?.storeName || 'Loja' }
    };
}

function openCalendarTournamentDetails(eventData) {
    const container = document.getElementById('calendarTournamentDetails');
    if (!container || !eventData) return;

    container.classList.remove('is-hidden');
    container.innerHTML = `<div class="details-block"><span class="spinner" aria-hidden="true"></span> Carregando detalhes...</div>`;

    renderTournamentDetails(resolveCalendarTournament(eventData), container);
}

function setupPerPageSelector() {
    const perPageSelect = document.getElementById('perPageSelect');
    if (!perPageSelect) return;

    perPage = getSavedPerPage();
    perPageSelect.innerHTML = PER_PAGE_OPTIONS.map(
        (value) => `<option value="${value}">${value}</option>`
    ).join('');
    perPageSelect.value = String(perPage);

    perPageSelect.addEventListener('change', () => {
        const nextValue = Number(perPageSelect.value);
        perPage = PER_PAGE_OPTIONS.includes(nextValue) ? nextValue : DEFAULT_PER_PAGE;
        savePerPagePreference();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

function setupSorting() {
    const sortButtons = document.querySelectorAll('.sort-button[data-sort-field]');
    sortButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.sortField;
            if (!field) return;
            toggleSort(field);
        });
    });
    updateSortIndicators();
}

function toggleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = field === 'tournament_date' ? 'desc' : 'asc';
    }
    saveSortPreference();
    updateSortIndicators();
    applyFilters();
}

function sortTournaments(list) {
    const sorted = [...list];
    const direction = currentSort.direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
        if (currentSort.field === 'tournament_date') {
            const aTime = Date.parse(a.tournament_date || '') || 0;
            const bTime = Date.parse(b.tournament_date || '') || 0;
            return (aTime - bTime) * direction;
        }

        if (currentSort.field === 'total_players') {
            const aPlayers = Number(a.total_players) || 0;
            const bPlayers = Number(b.total_players) || 0;
            return (aPlayers - bPlayers) * direction;
        }

        return 0;
    });

    return sorted;
}

function updateSortIndicators() {
    const indicators = document.querySelectorAll('[data-sort-indicator]');
    indicators.forEach((el) => {
        const field = el.dataset.sortIndicator;
        if (field === currentSort.field) {
            el.textContent = currentSort.direction === 'asc' ? '\u25B2' : '\u25BC';
            el.classList.add('is-active');
        } else {
            el.textContent = '\u21C5';
            el.classList.remove('is-active');
        }
    });
}

// ============================================================
// RENDER TABLE
// ============================================================
function getCompactTournamentDate(dateString) {
    const [year, month, day] = String(dateString || '')
        .split('-')
        .map(Number);
    if (!year || !month || !day) return { day: '--', month: '---' };
    const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, month - 1, day)))
        .replace('.', '')
        .toUpperCase();
    return { day: String(day).padStart(2, '0'), month: monthLabel };
}

function renderTable() {
    const tbody = document.querySelector('#tournamentsTable tbody');
    tbody.innerHTML = '';

    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const slice = filteredTournaments.slice(start, end);

    slice.forEach((t) => {
        const tr = document.createElement('tr');
        tr.classList.add('clickable-row');
        if (selectedTournamentId && String(selectedTournamentId) === String(t.id)) {
            tr.classList.add('is-active');
        }
        const instagramLink = t.instagram_link
            ? `<a href="${t.instagram_link}" target="_blank" rel="noopener noreferrer" class="btn-instagram" aria-label="Abrir Link do Instagram">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" ry="5"></rect>
                    <circle cx="12" cy="12" r="4"></circle>
                    <circle cx="17.5" cy="6.5" r="1.2"></circle>
                </svg>
            </a>`
            : '';

        const td1 = document.createElement('td');
        td1.setAttribute('data-label', 'Data:');
        td1.classList.add('table-date-cell');
        const formattedDate = formatDate(t.tournament_date);
        const dateValue = document.createElement('span');
        dateValue.className = 'table-date-value';
        dateValue.textContent = formattedDate;
        td1.appendChild(dateValue);

        const td2 = document.createElement('td');
        td2.setAttribute('data-label', 'Loja:');
        td2.classList.add('table-store-cell');
        const storeName = t.store?.name || '-';
        const storeContent = document.createElement('span');
        storeContent.className = 'table-store-content';
        const storeIcon = document.createElement('img');
        storeIcon.className = 'table-store-icon';
        storeIcon.src = resolveStoreIcon(storeName);
        storeIcon.alt = storeName;
        const storeText = document.createElement('span');
        storeText.className = 'table-store-name';
        storeText.textContent = storeName;
        storeContent.appendChild(storeIcon);
        storeContent.appendChild(storeText);
        td2.appendChild(storeContent);

        const td3 = document.createElement('td');
        td3.setAttribute('data-label', 'Tipo:');
        td3.classList.add('table-name-cell');
        const tournamentName =
            String(t.tournament_name || '').toLowerCase() === 'release_event'
                ? 'Release Event'
                : t.tournament_name || '-';
        const tournamentNameText = document.createElement('span');
        tournamentNameText.className = 'table-tournament-name';
        tournamentNameText.textContent = tournamentName;
        const mobileStoreTournament = document.createElement('span');
        mobileStoreTournament.className = 'table-mobile-store-tournament';
        mobileStoreTournament.textContent = `${storeName} - ${tournamentName}`;
        td3.appendChild(tournamentNameText);
        td3.appendChild(mobileStoreTournament);

        const td4 = document.createElement('td');
        td4.setAttribute('data-label', 'Jogadores:');
        td4.classList.add('table-players-cell');
        const playersValue = Number.isFinite(Number(t.total_players))
            ? String(t.total_players)
            : '-';
        const playersValueText = document.createElement('span');
        playersValueText.className = 'table-players-value';
        playersValueText.textContent = playersValue;
        const mobilePlayersLine = document.createElement('span');
        mobilePlayersLine.className = 'table-mobile-players-line';
        mobilePlayersLine.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-8 1c-2.33 0-7 1.17-7 3.5V19h5v-2c0-1.16.7-2.18 1.89-3Z"></path></svg><span></span>';
        const mobilePlayersText = mobilePlayersLine.querySelector('span');
        if (mobilePlayersText) mobilePlayersText.textContent = `Jogadores: ${playersValue}`;
        td4.appendChild(playersValueText);
        td4.appendChild(mobilePlayersLine);

        const td5 = document.createElement('td');
        td5.setAttribute('data-label', 'Instagram:');
        td5.innerHTML = instagramLink;

        const td6 = document.createElement('td');
        td6.setAttribute('data-label', 'Ações:');
        td6.innerHTML = `<button class="btn-edit btn-icon-only" type="button" title="Editar torneio" aria-label="Editar torneio" data-action="edit-tournament" data-tournament-id="${t.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
        </button>`;
        const editTournamentButton = td6.querySelector('[data-action="edit-tournament"]');
        if (editTournamentButton) {
            editTournamentButton.addEventListener('click', (event) => {
                event.stopPropagation();
                editTournament(t.id);
            });
        }

        const compactDate = getCompactTournamentDate(t.tournament_date);
        const champion = getTournamentChampion(t);
        const mobileStoreIcon = resolveStoreIcon(storeName) || `${getAssetPrefix()}icons/logo.png`;
        const championBadges = [
            champion?.player
                ? `<span class="mobile-champion-badge" title="Jogador campeão">${escapeHtml(champion.player)}</span>`
                : '',
            champion?.deck
                ? `<span class="mobile-champion-badge is-deck" title="Deck campeão">${escapeHtml(champion.deck)}</span>`
                : ''
        ]
            .filter(Boolean)
            .join('');
        const mobileCard = document.createElement('div');
        mobileCard.className = 'mobile-tournament-card';
        mobileCard.innerHTML = `
            <div class="mobile-tournament-date" aria-label="${escapeHtml(formattedDate)}">
                <strong>${compactDate.day}</strong><span>${compactDate.month}</span>
            </div>
            <div class="mobile-tournament-logo-wrap">
                <img src="${escapeHtml(mobileStoreIcon)}" alt="Logo ${escapeHtml(storeName)}" />
            </div>
            <div class="mobile-tournament-main">
                <strong class="mobile-tournament-name">${escapeHtml(tournamentName)}</strong>
                <span class="mobile-tournament-store">${escapeHtml(storeName)}</span>
                <span class="mobile-tournament-players"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-8 1c-2.33 0-7 1.17-7 3.5V19h5v-2c0-1.16.7-2.18 1.89-3Z"/></svg>${escapeHtml(playersValue)} ${playersValue === '1' ? 'jogador' : 'jogadores'}</span>
                ${championBadges ? `<div class="mobile-champion-badges">${championBadges}</div>` : ''}
            </div>
            <div class="mobile-card-actions">
                <button type="button" class="mobile-card-menu-trigger" aria-label="Ações do torneio" aria-expanded="false">•••</button>
                <div class="mobile-card-menu" hidden>
                    <button type="button" data-mobile-edit>Editar torneio</button>
                    <button type="button" data-mobile-generate-post>Gerar post</button>
                    ${t.instagram_link ? `<a href="${escapeHtml(t.instagram_link)}" target="_blank" rel="noopener noreferrer">Abrir Link do Instagram</a>` : ''}
                </div>
            </div>`;
        td1.prepend(mobileCard);

        const menuTrigger = mobileCard.querySelector('.mobile-card-menu-trigger');
        const cardMenu = mobileCard.querySelector('.mobile-card-menu');
        cardMenu?.addEventListener('click', (event) => event.stopPropagation());
        menuTrigger?.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = Boolean(cardMenu?.hidden);
            document.querySelectorAll('.mobile-card-menu:not([hidden])').forEach((menu) => {
                menu.hidden = true;
                menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
            });
            if (cardMenu) cardMenu.hidden = !willOpen;
            menuTrigger.setAttribute('aria-expanded', String(willOpen));
        });
        mobileCard.querySelector('[data-mobile-edit]')?.addEventListener('click', (event) => {
            event.stopPropagation();
            editTournament(t.id);
        });
        mobileCard
            .querySelector('[data-mobile-generate-post]')
            ?.addEventListener('click', (event) => {
                event.stopPropagation();
                generateTournamentPostFromCard(t);
            });
        mobileCard.querySelector('.mobile-card-menu a')?.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', `Abrir detalhes de ${tournamentName}, ${storeName}`);
        tr.addEventListener('click', () => toggleTournamentDetails(t));
        tr.addEventListener('keydown', (event) => {
            if (event.target !== tr || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            toggleTournamentDetails(t);
        });

        tbody.appendChild(tr);

        if (selectedTournamentId && String(selectedTournamentId) === String(t.id)) {
            const detailsTr = document.createElement('tr');
            detailsTr.className = 'details-row';
            detailsTr.setAttribute('data-details-for', String(t.id));

            const detailsTd = document.createElement('td');
            detailsTd.colSpan = 6;
            detailsTd.className = 'details-row-cell';
            detailsTd.innerHTML = `
                <div class="tournament-inline-details-content" data-details-content-for="${String(t.id)}">
                    <div class="details-block"><span class="spinner" aria-hidden="true"></span> Carregando detalhes...</div>
                </div>
            `;

            detailsTr.appendChild(detailsTd);
            tbody.appendChild(detailsTr);
        }
    });

    if (slice.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="text-align:center;">Nenhum torneio encontrado</td>`;
        tbody.appendChild(tr);
    }
}

async function generateTournamentPostFromCard(tournament) {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/v_podium_full?store_id=eq.${encodeURIComponent(tournament.store_id)}&tournament_date=eq.${encodeURIComponent(tournament.tournament_date)}&order=placement.asc`,
            { headers }
        );
        if (!response.ok) throw new Error(`Falha ao carregar resultados (${response.status})`);
        const results = await response.json();
        openPostGeneratorWithTournamentData(
            tournament,
            Array.isArray(results) ? results : [],
            Number(tournament.total_players) || 0
        );
    } catch (error) {
        console.error(error);
        alert('Não foi possível abrir o gerador de post deste torneio.');
    }
}

// ============================================================
// PAGINATION
// ============================================================
function renderPagination() {
    const totalPages = Math.ceil(filteredTournaments.length / perPage);
    const div = document.getElementById('pagination');
    const nav = document.getElementById('paginationNav');
    div.innerHTML = '';
    if (nav) nav.classList.add('is-hidden');

    if (totalPages <= 1) return;

    if (currentPage > totalPages) currentPage = totalPages;

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'btn-pagination btn-pagination-prev';
    prevButton.textContent = '\u2039';
    prevButton.setAttribute('aria-label', 'Página anterior');
    prevButton.disabled = currentPage <= 1;
    prevButton.addEventListener('click', () => {
        if (currentPage <= 1) return;
        currentPage -= 1;
        renderTable();
        renderPagination();
    });
    div.appendChild(prevButton);

    const visiblePageCount = Math.min(totalPages, window.innerWidth <= 768 ? 3 : 5);
    let startPage = currentPage - Math.floor(visiblePageCount / 2);
    let endPage = startPage + visiblePageCount - 1;
    if (startPage < 1) {
        startPage = 1;
        endPage = visiblePageCount;
    }
    if (endPage > totalPages) {
        endPage = totalPages;
        startPage = totalPages - visiblePageCount + 1;
    }

    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-pagination-number';
        btn.textContent = i;
        if (i === currentPage) {
            btn.classList.add('active');
            btn.setAttribute('aria-current', 'page');
            btn.setAttribute('aria-label', `Página ${i}, atual`);
        } else {
            btn.setAttribute('aria-label', `Ir para a página ${i}`);
        }
        btn.addEventListener('click', () => {
            if (i === currentPage) return;
            currentPage = i;
            renderTable();
            renderPagination();
        });
        div.appendChild(btn);
    }

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'btn-pagination btn-pagination-next';
    nextButton.textContent = '\u203A';
    nextButton.setAttribute('aria-label', 'Próxima página');
    nextButton.disabled = currentPage >= totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage >= totalPages) return;
        currentPage += 1;
        renderTable();
        renderPagination();
    });
    div.appendChild(nextButton);
}

// ============================================================
// CREATE MODAL
// ============================================================
async function openCreateTournamentModal(defaultDate = '') {
    // Reset form
    document.getElementById('createStoreSelect').value = '';
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(defaultDate) ? defaultDate : getTodayInSaoPaulo();
    document.getElementById('createTournamentDate').value = safeDate;
    document.getElementById('createTournamentName').value = document.querySelector(
        '#createTournamentName option[value="Locals"]'
    )
        ? 'Locals'
        : 'Semanal';
    document.getElementById('createTotalPlayers').value = '';
    document.getElementById('createInstagramLink').value = '';

    createResults = [];
    resetCreateOcrImportUi();
    resetCreateDigilabImportUi();

    // Carrega dados base para o modal
    try {
        tournamentFormatsLoaded = false; // força re-fetch para garantir o default atualizado
        await Promise.all([
            loadStoresToCreate(),
            loadTournamentWeeklySchedule(),
            loadPlayersToCreate(),
            loadDecksToCreate(),
            loadTournamentFormats()
        ]);
        populateTournamentFormatSelect('createTournamentFormat');
        applyScheduledStoreToCreate(safeDate);
        renderCreateResultsRows();
    } catch (err) {
        // CREATE MODAL
        alert('Falha ao carregar dados de players/decks/lojas.');
        return;
    }

    // Abre o modal
    setTournamentFormDirty('create', false);
    document.getElementById('createModal').classList.add('active');
}

function closeCreateModal() {
    if (
        createOcrImportInProgress ||
        createDigilabImportInProgress ||
        createTournamentSaveInProgress
    )
        return;
    document.getElementById('createModal').classList.remove('active');
    createResults = [];
    resetCreateOcrImportUi();
    resetCreateDigilabImportUi();
    renderCreateResultsRows();
}

function resetCreateDigilabImportUi() {
    createDigilabImportInProgress = false;
    const input = document.getElementById('createDigilabTournamentUrl');
    const button = document.getElementById('btnImportCreateDigilab');
    const status = document.getElementById('createDigilabStatus');
    if (input) input.value = '';
    if (button) {
        button.disabled = false;
        button.textContent = 'Buscar e preencher';
    }
    if (status) {
        status.textContent = '';
        status.classList.remove('is-error', 'is-success');
    }
}

function setCreateDigilabStatus(message, tone = 'info') {
    const status = document.getElementById('createDigilabStatus');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', tone === 'error');
    status.classList.toggle('is-success', tone === 'success');
}

function parseDigilabTournamentId(value) {
    if (window.tournamentUtils?.parseDigilabTournamentId) {
        return window.tournamentUtils.parseDigilabTournamentId(value);
    }
    const raw = String(value || '').trim();
    if (/^\d+$/.test(raw)) {
        const id = Number(raw);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    }

    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const match = url.pathname.match(/^\/tournament\/(\d+)\/?$/i);
        if (host !== 'digilab.cards' || !match) return null;
        const id = Number(match[1]);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}

function mapDigilabEventTypeToTournamentName(eventType) {
    const normalized = String(eventType || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    const names = {
        locals: 'Locals',
        online: 'Online',
        evo_cup: 'Evo Cup',
        store_championship: 'Store Championship',
        regulation_battle: 'Regulation Battle',
        release_event: 'release_event'
    };
    return (
        names[normalized] ||
        (document.querySelector('#createTournamentName option[value="Locals"]')
            ? 'Locals'
            : 'Semanal')
    );
}

function applyDigilabPreviewToCreateForm(preview) {
    if (preview?.already_linked?.tournament_id) {
        throw new Error(
            `Este torneio DigiLab já está vinculado ao DigiStats #${preview.already_linked.tournament_id}.`
        );
    }

    const tournament = preview?.tournament || {};
    const standings = Array.isArray(preview?.standings) ? preview.standings : [];
    if (!standings.length) throw new Error('O DigiLab não retornou jogadores para este torneio.');
    if (standings.length > 36) throw new Error('O torneio possui mais de 36 jogadores.');

    const previewFormat = preview?.import_resolution?.format;
    const previewFormatId = Number(previewFormat?.format_id);
    const previewFormatCode = normalizeFormatCode(previewFormat?.format_code || tournament.format);
    if (
        Number.isFinite(previewFormatId) &&
        previewFormatId > 0 &&
        previewFormatCode &&
        !tournamentFormats.some((format) => Number(format?.id) === previewFormatId)
    ) {
        tournamentFormats.push({
            id: previewFormatId,
            code: previewFormatCode,
            label: previewFormatCode,
            isDefault: false
        });
    }

    resetCreateOcrImportUi();

    const date = String(tournament.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        document.getElementById('createTournamentDate').value = date;
    }

    const storeId = preview?.import_resolution?.store?.store_id;
    const storeByName = resolveStoreFromOcrName(tournament.store?.name || '');
    document.getElementById('createStoreSelect').value = String(storeId || storeByName?.id || '');
    document.getElementById('createTournamentName').value = mapDigilabEventTypeToTournamentName(
        tournament.event_type
    );

    populateTournamentFormatSelect('createTournamentFormat', {
        selectedId: preview?.import_resolution?.format?.format_id,
        selectedValue: preview?.import_resolution?.format?.format_code || tournament.format || ''
    });

    createResults = [...standings]
        .sort((left, right) => Number(left.placement) - Number(right.placement))
        .map((standing) => ({
            player_id: standing.player_match?.player_id || '',
            deck_id: standing.deck_match?.deck_id || '',
            player_name: standing.player_match?.player_name || standing.player?.name || '',
            deck_name: standing.deck_match?.deck_name || standing.deck?.name || '',
            match_points: normalizeOcrMatchPoints(standing.match_points),
            ocr_member_id: '',
            ocr_player_unmatched: !standing.player_match?.player_id
        }));

    document.getElementById('createTotalPlayers').value = String(createResults.length);
    renderCreateResultsRows();
    setTournamentFormDirty('create', true);

    const unresolvedPlayers = createResults.filter((row) => !row.player_id).length;
    const unresolvedDecks = createResults.filter((row) => row.deck_name && !row.deck_id).length;
    const warnings = [];
    if (unresolvedPlayers) warnings.push(`${unresolvedPlayers} jogador(es) novo(s)`);
    if (unresolvedDecks) warnings.push(`${unresolvedDecks} deck(s) novo(s)`);
    if (!document.getElementById('createStoreSelect').value) warnings.push('loja não encontrada');
    return warnings;
}

async function importCreateTournamentFromDigilab() {
    if (
        createDigilabImportInProgress ||
        window.tournamentUtils?.isTeamTournament(
            document.getElementById('createTournamentName')?.value
        )
    )
        return;
    const input = document.getElementById('createDigilabTournamentUrl');
    const button = document.getElementById('btnImportCreateDigilab');
    const externalId = parseDigilabTournamentId(input?.value);
    if (!externalId) {
        setCreateDigilabStatus(
            'Informe um link válido, como https://digilab.cards/tournament/7187.',
            'error'
        );
        input?.focus();
        return;
    }

    createDigilabImportInProgress = true;
    if (button) {
        button.disabled = true;
        button.textContent = 'Buscando…';
    }
    setCreateDigilabStatus(`Buscando o torneio DigiLab #${externalId}…`);

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/preview-digilab-import`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ digilab_tournament_id: externalId })
        });
        const preview = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(
                preview.error || `Não foi possível consultar o DigiLab (${response.status}).`
            );
        }

        const warnings = applyDigilabPreviewToCreateForm(preview);
        setCreateDigilabStatus(
            warnings.length
                ? `Dados preenchidos. Revise: ${warnings.join(', ')}.`
                : `Torneio DigiLab #${externalId} preenchido com sucesso.`,
            warnings.length ? 'info' : 'success'
        );
    } catch (error) {
        setCreateDigilabStatus(error.message || 'Não foi possível importar o torneio.', 'error');
    } finally {
        createDigilabImportInProgress = false;
        if (button) {
            button.disabled = false;
            button.textContent = 'Buscar e preencher';
        }
    }
}

function syncCreateResultsByTotal() {
    const totalInput = document.getElementById('createTotalPlayers');
    const qty = parseInt(totalInput.value, 10);

    if (!Number.isInteger(qty) || qty < 1) {
        createResults = [];
        renderCreateResultsRows();
        return;
    }

    const next = [];
    for (let i = 0; i < Math.min(qty, 36); i++) {
        next.push(
            createResults[i] || {
                player_id: '',
                deck_id: '',
                player_name: '',
                deck_name: '',
                match_points: null,
                ocr_member_id: '',
                ocr_player_unmatched: false
            }
        );
    }
    createResults = next;
    renderCreateResultsRows();
}

function setCreateOcrStatus(message, tone = 'info') {
    const el = document.getElementById('createOcrStatus');
    if (!el) return;
    const prefix = tone === 'error' ? 'Erro: ' : tone === 'success' ? 'OK: ' : '';
    el.textContent = `${prefix}${message}`.trim();
}

function setCreateOcrSelectedInfo(message) {
    const el = document.getElementById('createOcrSelectedInfo');
    if (!el) return;
    el.textContent = message || '';
}

function resetCreateOcrImportUi() {
    createOcrImportInProgress = false;
    createOcrSelectedFiles = [];
    createOcrProcessedFiles = [];
    const input = document.getElementById('createOcrFilesInput');
    const btnSelect = document.getElementById('btnSelectOcrPrints');
    const btnProcess = document.getElementById('btnProcessOcrPrints');
    if (input) input.value = '';
    if (btnSelect) btnSelect.disabled = false;
    if (btnProcess) btnProcess.disabled = false;
    setCreateOcrSelectedInfo('');
    setCreateOcrStatus('');
    renderOcrFilePreview('createOcrPreview', []);
}

function renderOcrFilePreview(containerId, files) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const sourceFiles = Array.from(files || []);
    container.classList.toggle('is-empty', sourceFiles.length === 0);
    container.innerHTML = sourceFiles
        .map((file) => {
            const url = URL.createObjectURL(file);
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            return `
                <figure class="tournament-ocr-thumb">
                    <img src="${url}" alt="${escapeHtml(file.name || 'Print da Bandai')}" loading="lazy">
                    <figcaption>${escapeHtml(file.name || 'Print da Bandai')}</figcaption>
                </figure>
            `;
        })
        .join('');
}

function normalizeLookupName(value) {
    if (window.tournamentUtils?.normalizeEntityName) {
        return window.tournamentUtils.normalizeEntityName(value);
    }
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeMemberId(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '');
}

function isGuestMemberId(value) {
    const memberId = normalizeMemberId(value);
    return !memberId || /^GUEST/i.test(memberId);
}

function parseOcrRank(value, index) {
    const rank = Number(value);
    if (Number.isFinite(rank) && rank > 0) return rank;
    return index + 1;
}

function normalizeOcrMatchPoints(value) {
    if (window.tournamentUtils?.normalizeMatchPoints) {
        return window.tournamentUtils.normalizeMatchPoints(value);
    }
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const points = Number(String(value).trim().replace(',', '.'));
    return Number.isInteger(points) && points >= 0 ? points : null;
}

function extractOcrPlayers(payload) {
    const players = Array.isArray(payload?.players) ? payload.players : [];
    return players
        .map((item, index) => ({
            rank: parseOcrRank(item?.rank, index),
            name: String(item?.name || '').trim(),
            member_id: normalizeMemberId(item?.member_id),
            points: normalizeOcrMatchPoints(item?.points),
            omw: String(item?.omw || '').trim()
        }))
        .filter((item) => item.name || item.member_id)
        .slice(0, 100);
}

function mergeOcrPlayersByMemberId(allPlayers) {
    const merged = new Map();
    allPlayers.forEach((item, index) => {
        const key = item.member_id || `NO_ID_${index}`;
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...item });
            return;
        }
        if (item.rank < existing.rank) existing.rank = item.rank;
        if (!existing.name && item.name) existing.name = item.name;
        if (existing.points === null && item.points !== null) existing.points = item.points;
        else if (
            existing.points !== null &&
            item.points !== null &&
            existing.points !== item.points
        ) {
            existing.points_conflict = true;
        }
        if (!existing.omw && item.omw) existing.omw = item.omw;
    });
    return Array.from(merged.values())
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 36);
}

function findPlayerMatchFromOcr(ocrPlayer) {
    const ocrMemberId = normalizeMemberId(ocrPlayer.member_id);
    const ocrName = normalizeLookupName(ocrPlayer.name);

    if (ocrMemberId && !isGuestMemberId(ocrMemberId)) {
        const byBandaiId = createPlayers.find(
            (player) => normalizeMemberId(player.bandai_id) === ocrMemberId
        );
        if (byBandaiId?.id) {
            return byBandaiId;
        }
    }

    if (ocrName) {
        const byBandaiNick = createPlayers.find(
            (player) => normalizeLookupName(player.bandai_nick) === ocrName
        );
        if (byBandaiNick?.id) {
            return byBandaiNick;
        }

        const byName = createPlayers.find((player) => normalizeLookupName(player.name) === ocrName);
        if (byName?.id) {
            return byName;
        }

        const byDigilabName = createPlayers.find(
            (player) => normalizeLookupName(player.digilab_name) === ocrName
        );
        if (byDigilabName?.id) {
            return byDigilabName;
        }
    }

    return null;
}

async function loadInactivePlayersMatchingOcr(ocrPlayers) {
    const memberIds = new Set(
        ocrPlayers
            .map((player) => normalizeMemberId(player.member_id))
            .filter((memberId) => memberId && !isGuestMemberId(memberId))
    );
    const playerNames = new Set(
        ocrPlayers.map((player) => normalizeLookupName(player.name)).filter(Boolean)
    );
    if (!memberIds.size && !playerNames.size) return;

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/players?is_active=eq.false&select=id,name,bandai_id,bandai_nick,digilab_name,is_active`,
        { headers }
    );
    if (!res.ok) {
        throw new Error('Erro ao consultar players inativos para conciliar o OCR');
    }

    const inactivePlayers = await res.json();
    inactivePlayers.forEach((player) => {
        const memberId = normalizeMemberId(player.bandai_id);
        const matchesMemberId = memberId && memberIds.has(memberId);
        const matchesName = [player.name, player.bandai_nick, player.digilab_name]
            .map(normalizeLookupName)
            .some((name) => name && playerNames.has(name));
        if (!matchesMemberId && !matchesName) return;
        if (createPlayers.some((item) => String(item.id) === String(player.id))) return;
        createPlayers.push({
            ...player,
            bandai_id: player.bandai_id || '',
            bandai_nick: player.bandai_nick || '',
            is_active: false
        });
    });
}

function extractOcrStoreAndDate(payload) {
    const storeName = String(
        payload?.store_name || payload?.store || payload?.shop || payload?.venue || ''
    ).trim();
    const dateRaw = String(
        payload?.tournament_date ||
            payload?.event_date ||
            payload?.tournament_datetime ||
            payload?.date ||
            ''
    ).trim();
    return {
        storeName,
        tournamentDate: normalizeOcrTournamentDate(dateRaw)
    };
}

function normalizeOcrTournamentDate(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const normalized = raw
        .replace(/~/g, '')
        .replace(/^\w{3}\.\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const monthMap = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12
    };

    const enMonthMatch = normalized.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (enMonthMatch) {
        const month = monthMap[String(enMonthMatch[1]).toLowerCase()];
        const day = Number(enMonthMatch[2]);
        const year = Number(enMonthMatch[3]);
        if (month && day >= 1 && day <= 31 && year >= 2000) {
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
        }
    }

    const brMatch = normalized.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (brMatch) {
        const day = Number(brMatch[1]);
        const month = Number(brMatch[2]);
        const year = Number(brMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${year}-${mm}-${dd}`;
        }
    }

    return '';
}

function resolveStoreFromOcrName(storeName) {
    const target = normalizeLookupName(storeName);
    if (!target || !createStores.length) return null;

    const getAliases = (store) =>
        [store?.name, store?.bandai_nick, store?.store_nick, store?.nick, store?.alias]
            .map((value) => normalizeLookupName(value))
            .filter(Boolean);

    const exact = createStores.find((store) => getAliases(store).some((alias) => alias === target));
    if (exact) return exact;

    const includes = createStores.find((store) =>
        getAliases(store).some((alias) => alias.includes(target) || target.includes(alias))
    );
    return includes || null;
}

function isSupportedOcrImageFile(file) {
    if (!(file instanceof File)) return false;
    if (
        String(file.type || '')
            .toLowerCase()
            .startsWith('image/')
    )
        return true;
    return /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name || '');
}

function selectCreateOcrFiles(fileList) {
    const droppedFiles = Array.from(fileList || []);
    const files = droppedFiles.filter(isSupportedOcrImageFile);
    const ignoredCount = droppedFiles.length - files.length;
    createOcrSelectedFiles = files;
    if (files.length === 0) {
        createOcrProcessedFiles = [];
        renderOcrFilePreview('createOcrPreview', []);
        setCreateOcrSelectedInfo('');
        setCreateOcrStatus(
            ignoredCount ? 'Arraste somente arquivos de imagem.' : '',
            ignoredCount ? 'error' : 'info'
        );
        return;
    }
    setCreateOcrSelectedInfo(
        `${files.length} print(s) selecionado(s).${ignoredCount ? ` ${ignoredCount} arquivo(s) não compatível(is) ignorado(s).` : ''}`
    );
    renderOcrFilePreview('createOcrPreview', files);
    setCreateOcrStatus('Processando...');
    processCreateOcrFiles();
}

function onCreateOcrFilesSelected(event) {
    selectCreateOcrFiles(event.target?.files);
}

function setupCreateOcrDropZone(dropZone) {
    if (!dropZone || dropZone.dataset.dropZoneReady === 'true') return;

    const preventFileNavigation = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    dropZone.addEventListener('dragenter', (event) => {
        preventFileNavigation(event);
        if (!createOcrImportInProgress) dropZone.classList.add('is-drag-over');
    });
    dropZone.addEventListener('dragover', preventFileNavigation);
    dropZone.addEventListener('dragleave', (event) => {
        preventFileNavigation(event);
        if (!dropZone.contains(event.relatedTarget)) {
            dropZone.classList.remove('is-drag-over');
        }
    });
    dropZone.addEventListener('drop', (event) => {
        preventFileNavigation(event);
        dropZone.classList.remove('is-drag-over');
        if (createOcrImportInProgress) return;
        selectCreateOcrFiles(event.dataTransfer?.files);
    });
    dropZone.dataset.dropZoneReady = 'true';
}

async function requestOcrFromImage(file) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const res = await fetch(`${OCR_API_BASE_URL}/process`, {
        method: 'POST',
        body: formData
    });
    let payload = null;
    try {
        payload = await res.json();
    } catch (_error) {
        // The status-based error below is more useful than a JSON parse failure.
    }
    if (!res.ok) {
        throw new Error(`O serviço de leitura do print respondeu ${res.status}`);
    }
    if (payload?.error) {
        console.error('Erro retornado pelo serviço OCR:', payload.error);
        throw new Error(getOcrServiceErrorMessage(payload.error));
    }
    return payload || {};
}

function getOcrServiceErrorMessage(error) {
    const detail = String(error || '');
    if (/model_not_found|model .* does not exist|do not have access/i.test(detail)) {
        return 'O serviço de leitura está temporariamente indisponível porque o modelo de OCR não está acessível.';
    }
    if (/invalid_api_key|invalid api key|unauthorized/i.test(detail)) {
        return 'O serviço de leitura está temporariamente indisponível por um problema de autenticação.';
    }
    return 'O serviço de leitura não conseguiu processar o print neste momento.';
}

window.getOcrServiceErrorMessage = getOcrServiceErrorMessage;

async function processCreateOcrFiles() {
    if (!createOcrSelectedFiles.length) {
        setCreateOcrStatus('Selecione ao menos um print antes de processar.', 'error');
        return;
    }
    if (createOcrImportInProgress) return;
    createOcrImportInProgress = true;

    const btnSelect = document.getElementById('btnSelectOcrPrints');
    const btnProcess = document.getElementById('btnProcessOcrPrints');
    if (btnSelect) btnSelect.disabled = true;
    if (btnProcess) btnProcess.disabled = true;
    setCreateOcrStatus(`Processando ${createOcrSelectedFiles.length} print(s)...`);

    try {
        if (!createPlayers.length) {
            await loadPlayersToCreate();
        }
        if (!createStores.length) {
            await loadStoresToCreate();
        }

        const allPlayers = [];
        const detectedStores = [];
        const detectedDates = [];
        for (const file of createOcrSelectedFiles) {
            const payload = await requestOcrFromImage(file);
            allPlayers.push(...extractOcrPlayers(payload));
            const meta = extractOcrStoreAndDate(payload);
            if (meta.storeName) detectedStores.push(meta.storeName);
            if (meta.tournamentDate) detectedDates.push(meta.tournamentDate);
        }

        const mergedPlayers = mergeOcrPlayersByMemberId(allPlayers);
        if (!mergedPlayers.length) {
            throw new Error('Nenhum resultado reconhecido na imagem');
        }

        await loadInactivePlayersMatchingOcr(mergedPlayers);

        const tournamentType = document.getElementById('createTournamentName')?.value;
        const team = window.tournamentUtils.isTeamTournament(tournamentType);
        const importedResults = mergedPlayers.map((ocrPlayer) => {
            const matchedPlayer = findPlayerMatchFromOcr(ocrPlayer);
            const ocrMemberId = normalizeMemberId(ocrPlayer.member_id);
            return {
                player_id: matchedPlayer?.id || '',
                deck_id: '',
                player_name: ocrPlayer.name || '',
                deck_name: '',
                match_points: ocrPlayer.points,
                ocr_member_id: isGuestMemberId(ocrMemberId) ? '' : ocrMemberId,
                ocr_player_unmatched: !matchedPlayer?.id
            };
        });
        createResults = window.tournamentUtils.expandTeamOcrResults(
            importedResults,
            tournamentType
        );

        renderCreateResultsRows();
        document.getElementById('createTotalPlayers').value = String(createResults.length);

        const selectedStoreName = detectedStores[0] || '';
        const selectedDate = detectedDates[0] || '';
        if (selectedDate) {
            document.getElementById('createTournamentDate').value = selectedDate;
        }
        const matchedStore = selectedStoreName ? resolveStoreFromOcrName(selectedStoreName) : null;
        if (matchedStore?.id) {
            document.getElementById('createStoreSelect').value = String(matchedStore.id);
        } else if (selectedDate) {
            applyScheduledStoreToCreate(selectedDate);
        }

        const unresolvedPlayers = importedResults.filter((row) => !row.player_id).length;
        const pointConflicts = mergedPlayers.filter((row) => row.points_conflict).length;
        const unresolvedStore = selectedStoreName
            ? !resolveStoreFromOcrName(selectedStoreName)
            : false;
        const dateDetected = Boolean(selectedDate);
        if (team) {
            setCreateOcrStatus(
                `Print importado: ${mergedPlayers.length} duplas.${unresolvedPlayers ? ` ${unresolvedPlayers} jogador(es) do print sem correspondência.` : ''} Preencha o segundo jogador e os dois decks de cada dupla.${pointConflicts ? ` Revise ${pointConflicts} conflito(s) de pontos.` : ''}${unresolvedStore ? ' Loja não identificada.' : ''}${dateDetected ? ' Data preenchida.' : ''}`,
                'info'
            );
        } else if (unresolvedPlayers) {
            setCreateOcrStatus(
                `Print importado: ${createResults.length} players, ${unresolvedPlayers} sem correspondência${unresolvedStore ? ', loja não identificada' : ''}${dateDetected ? ', data preenchida' : ''}${pointConflicts ? `, ${pointConflicts} conflito(s) de pontos` : ''}.`,
                'info'
            );
        } else {
            setCreateOcrStatus(
                `Print importado (${createResults.length} players)${selectedStoreName ? ', loja preenchida' : ''}${dateDetected ? ', data preenchida' : ''}${pointConflicts ? `, revise ${pointConflicts} conflito(s) de pontos` : ''}.`,
                pointConflicts ? 'info' : 'success'
            );
        }
        createOcrProcessedFiles = [...createOcrSelectedFiles];
        setTournamentFormDirty('create', true);
    } catch (err) {
        createOcrSelectedFiles = [...createOcrProcessedFiles];
        renderOcrFilePreview('createOcrPreview', createOcrProcessedFiles);
        setCreateOcrSelectedInfo(
            createOcrProcessedFiles.length
                ? `${createOcrProcessedFiles.length} print(s) da última importação válida serão arquivados.`
                : ''
        );
        console.error('Erro no OCR:', err);
        setCreateOcrStatus(err.message || 'Falha ao processar o print da Bandai.', 'error');
    } finally {
        createOcrImportInProgress = false;
        if (btnSelect) btnSelect.disabled = false;
        if (btnProcess) btnProcess.disabled = false;
    }
}

async function loadStoresToCreate() {
    try {
        let res = await fetch(
            `${SUPABASE_URL}/rest/v1/stores?select=id,name,bandai_nick&order=name.asc`,
            { headers }
        );
        if (!res.ok) {
            res = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=id,name&order=name.asc`, {
                headers
            });
        }
        if (!res.ok) throw new Error('Erro ao carregar lojas');

        const stores = await res.json();
        createStores = stores || [];
        const select = document.getElementById('createStoreSelect');
        select.innerHTML = '<option value="">Selecione a loja...</option>';
        stores.forEach((s) => {
            select.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
        });
    } catch (err) {
        console.error('Erro ao carregar lojas:', err);
        alert('Falha ao carregar lojas: ' + err.message);
    }
}

async function toggleTournamentDetails(tournament) {
    if (selectedTournamentId && String(selectedTournamentId) === String(tournament.id)) {
        selectedTournamentId = null;
        clearTournamentDetails();
        renderTable();
        return;
    }

    selectedTournamentId = tournament.id;
    renderTable();
    await renderTournamentDetails(tournament);
}

function getDetailsContainer(tournamentId) {
    const targetId = String(tournamentId);
    const containers = document.querySelectorAll('.tournament-inline-details-content');
    for (const el of containers) {
        if (String(el.dataset.detailsContentFor) === targetId) return el;
    }
    return null;
}

function clearTournamentDetails() {
    const containers = document.querySelectorAll('.tournament-inline-details-content');
    containers.forEach((el) => {
        el.innerHTML = '';
    });
}

function buildPieSlicePolygon(startDeg, endDeg, steps = 24) {
    const points = ['50% 50%'];
    for (let i = 0; i <= steps; i++) {
        const angle = startDeg + ((endDeg - startDeg) * i) / steps;
        const rad = (angle * Math.PI) / 180;
        const x = 50 + 50 * Math.cos(rad);
        const y = 50 + 50 * Math.sin(rad);
        points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
    return `polygon(${points.join(',')})`;
}

function buildDeckPieData(results) {
    const grouped = new Map();
    (results || []).forEach((item) => {
        const deckName = String(item?.deck || '').trim();
        if (!deckName) return;
        const key = deckName;
        if (!grouped.has(key)) {
            grouped.set(key, {
                deck: key,
                image_url: item.image_url || '',
                count: 0
            });
        }
        grouped.get(key).count += 1;
        if (!grouped.get(key).image_url && item.image_url)
            grouped.get(key).image_url = item.image_url;
    });

    const entries = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    const total = entries.reduce((acc, item) => acc + item.count, 0) || 1;
    const colors = [
        '#ffd700',
        '#c0c0c0',
        '#cd7f32',
        '#268d7c',
        '#667eea',
        '#764ba2',
        '#2a9d8f',
        '#e76f51',
        '#8ab17d',
        '#3d5a80'
    ];

    let currentAngle = -90;
    return entries.map((entry, index) => {
        const sliceAngle = (entry.count / total) * 360;
        const start = currentAngle;
        const end = currentAngle + sliceAngle;
        currentAngle = end;
        const midDeg = (start + end) / 2;
        const midRad = (midDeg * Math.PI) / 180;

        const fallback = `https://via.placeholder.com/300x300/667eea/ffffff?text=${encodeURIComponent((entry.deck || 'Deck').substring(0, 10))}`;
        const percent = (entry.count / total) * 100;
        // Tuned for better perceived centering inside each slice.
        const initialZoom = Math.max(155, Math.min(320, 155 + percent * 3.2));
        const minZoom = Math.max(120, initialZoom - 55);
        const maxZoom = Math.min(420, initialZoom + 130);

        // Shift image opposite to slice direction so content appears centered in the wedge.
        const initialX = Math.max(34, Math.min(66, 50 - Math.cos(midRad) * 12));
        const initialY = Math.max(4, Math.min(24, 13 - Math.sin(midRad) * 4));
        return {
            deck: entry.deck,
            count: entry.count,
            percent,
            color: colors[index % colors.length],
            image_url: entry.image_url || fallback,
            clipPath: buildPieSlicePolygon(start, end),
            initialZoom,
            minZoom,
            maxZoom,
            initialX,
            initialY
        };
    });
}

function getPieStorageKey(tournamentId) {
    return `pieState:${tournamentId}`;
}

function loadPieState(tournamentId) {
    try {
        const raw = localStorage.getItem(getPieStorageKey(tournamentId));
        return raw ? JSON.parse(raw) : {};
    } catch (_) {
        return {};
    }
}

function savePieState(tournamentId, rootElement) {
    if (!tournamentId || !rootElement) return;
    const slices = rootElement.querySelectorAll('.details-pie-slice');
    const state = {};

    slices.forEach((slice) => {
        const deck = slice.dataset.deck || '';
        if (!deck) return;
        state[deck] = {
            x: parseFloat(slice.dataset.x || '50'),
            y: parseFloat(slice.dataset.y || '13'),
            zoom: parseFloat(slice.dataset.minZoom || slice.dataset.zoom || '120')
        };
    });

    try {
        localStorage.setItem(getPieStorageKey(tournamentId), JSON.stringify(state));
    } catch (_) {}
}

function setupInteractivePieSlices(rootElement, tournamentId) {
    if (!rootElement) return;
    const slices = rootElement.querySelectorAll('.details-pie-slice');
    const savedState = loadPieState(tournamentId);
    let topZ = 10;

    slices.forEach((slice) => {
        const deck = slice.dataset.deck || '';
        const saved = deck ? savedState[deck] : null;
        const clamp = (value, min, max, fallback) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return fallback;
            return Math.max(min, Math.min(max, numeric));
        };
        const safeX = clamp(saved?.x ?? slice.dataset.x ?? 50, 0, 100, 50);
        const safeY = clamp(saved?.y ?? slice.dataset.y ?? 13, 0, 100, 13);
        const minZoom = clamp(slice.dataset.minZoom || 120, 80, 420, 120);
        const safeZoom = minZoom;

        slice.dataset.x = String(safeX);
        slice.dataset.y = String(safeY);
        slice.dataset.zoom = String(safeZoom);
        slice.style.backgroundPosition = `${safeX}% ${safeY}%`;
        slice.style.backgroundSize = `${safeZoom}%`;
        slice.addEventListener(
            'wheel',
            (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
            },
            { capture: true, passive: false }
        );

        slice.onpointerdown = (e) => {
            slice.style.zIndex = String(++topZ);
            slice.setPointerCapture(e.pointerId);

            let lastX = e.clientX;
            let lastY = e.clientY;

            const onMove = (ev) => {
                let posX = parseFloat(slice.dataset.x || '50');
                let posY = parseFloat(slice.dataset.y || '50');
                const dx = ev.clientX - lastX;
                const dy = ev.clientY - lastY;
                lastX = ev.clientX;
                lastY = ev.clientY;

                posX += dx * 0.2;
                posY += dy * 0.2;

                slice.dataset.x = String(posX);
                slice.dataset.y = String(posY);
                slice.style.backgroundPosition = `${posX}% ${posY}%`;
            };

            const onUp = (ev) => {
                try {
                    slice.releasePointerCapture(ev.pointerId);
                } catch (_) {}
                slice.removeEventListener('pointermove', onMove);
                slice.removeEventListener('pointerup', onUp);
                slice.removeEventListener('pointercancel', onUp);
                savePieState(tournamentId, rootElement);
            };

            slice.addEventListener('pointermove', onMove);
            slice.addEventListener('pointerup', onUp);
            slice.addEventListener('pointercancel', onUp);
        };

        slice.onwheel = null;
    });
}

async function loadTournamentWeeklySchedule() {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/tournament_weekly_schedule?select=weekday,store_id,is_active&is_active=eq.true&order=weekday.asc`,
            { headers }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        tournamentWeeklySchedule = await res.json();
    } catch (err) {
        tournamentWeeklySchedule = [];
        console.warn('Agenda semanal de torneios indisponível:', err);
    }
}

function applyScheduledStoreToCreate(dateValue) {
    const utils = window.tournamentUtils;
    const storeId = utils?.findScheduledStoreId?.(tournamentWeeklySchedule, dateValue);
    const select = document.getElementById('createStoreSelect');
    if (!select) return false;
    if (!storeId || ![...select.options].some((option) => option.value === storeId)) {
        return false;
    }
    select.value = storeId;
    return true;
}

async function loadDigilabExportRows(tournament) {
    const select = encodeURIComponent(
        'placement,match_points,player:players(name,digilab_name,bandai_id)'
    );
    let rows = [];

    if (tournament?.id) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/tournament_results?tournament_id=eq.${encodeURIComponent(tournament.id)}&select=${select}&order=placement.asc`,
            { headers }
        );
        if (!res.ok) throw new Error(`Erro ao carregar resultados para exportação (${res.status})`);
        rows = await res.json();
    }

    if (!Array.isArray(rows) || !rows.length) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/tournament_results?store_id=eq.${encodeURIComponent(tournament?.store_id || '')}&tournament_date=eq.${encodeURIComponent(tournament?.tournament_date || '')}&select=${select}&order=placement.asc`,
            { headers }
        );
        if (!res.ok) throw new Error(`Erro ao carregar resultados antigos (${res.status})`);
        rows = await res.json();
    }

    if (!window.digilabExport?.normalizeDigilabExportRows) {
        throw new Error('Módulo de exportação do DigiLab indisponível');
    }
    return window.digilabExport.normalizeDigilabExportRows(rows);
}

async function copyTextToClipboard(content) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    (window.digiStatsComponentRoot ? window.digiStatsComponentRoot() : document.body).appendChild(
        textarea
    );
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('O navegador não permitiu copiar os dados automaticamente.');
}

async function copyTournamentDataForDigilab(tournament, button) {
    if (window.tournamentUtils?.isTeamTournament(tournament.tournament_name)) return;
    const digilabApi = window.digilabExport;
    if (!digilabApi) {
        showFriendlyErrorModal(
            'Exportação indisponível',
            'O módulo de exportação do DigiLab não foi carregado. Atualize a página e tente novamente.'
        );
        return;
    }

    if (button) button.disabled = true;

    try {
        const rows = await loadDigilabExportRows(tournament);
        if (!rows.length) {
            showFriendlyErrorModal(
                'Dados não copiados',
                'Este torneio não possui resultados para copiar.'
            );
            return;
        }

        const missingNames = digilabApi.getMissingMemberNames(rows);
        if (missingNames.length) {
            const visibleNames = missingNames.slice(0, 10).join(', ');
            const remaining = missingNames.length > 10 ? ` e mais ${missingNames.length - 10}` : '';
            alert(
                `Aviso: ${missingNames.length} jogador(es) estão sem Bandai ID. Os demais dados serão copiados mesmo assim.\n\n${visibleNames}${remaining}`
            );
        }

        const clipboardText = digilabApi.buildDigilabClipboardText(rows);
        await copyTextToClipboard(clipboardText);
        if (button) {
            button.classList.add('is-copied');
            setTimeout(() => button.classList.remove('is-copied'), 700);
        }
    } catch (error) {
        console.error('Erro ao copiar dados para o DigiLab:', error);
        showFriendlyErrorModal(
            'Falha ao copiar dados',
            error?.message || 'Não foi possível copiar os resultados deste torneio.'
        );
    } finally {
        if (button) button.disabled = false;
    }
}

async function renderTournamentDetails(tournament, targetContainer = null) {
    const tournamentId = String(tournament.id);
    let content = targetContainer || getDetailsContainer(tournamentId);
    if (!content) return;
    content.innerHTML = `<div class="details-block"><span class="spinner" aria-hidden="true"></span> Carregando detalhes...</div>`;

    try {
        const ocrFilesPromise = window.tournamentOcrFiles?.loadFiles
            ? window.tournamentOcrFiles
                  .loadFiles({
                      supabaseUrl: SUPABASE_URL,
                      headers,
                      tournamentId: tournament.id
                  })
                  .catch((error) => {
                      console.warn(error);
                      return [];
                  })
            : Promise.resolve([]);
        const [res, ocrFiles] = await Promise.all([
            fetch(
                `${SUPABASE_URL}/rest/v1/v_podium_full?store_id=eq.${encodeURIComponent(tournament.store_id)}&tournament_date=eq.${tournament.tournament_date}&order=placement.asc`,
                { headers }
            ),
            ocrFilesPromise
        ]);

        if (!res.ok) {
            throw new Error(`Erro ao carregar detalhes (${res.status})`);
        }

        let results = await res.json();
        if (!Array.isArray(results)) results = [];

        if (!results.length) {
            const fallbackSelect = encodeURIComponent(
                'id,placement,total_players,match_points,player:players(name),deck:decks(name)'
            );
            const fallbackRes = await fetch(
                `${SUPABASE_URL}/rest/v1/tournament_results?store_id=eq.${encodeURIComponent(tournament.store_id)}&tournament_date=eq.${tournament.tournament_date}&select=${fallbackSelect}&order=placement.asc`,
                { headers }
            );
            if (fallbackRes.ok) {
                const fallbackRows = await fallbackRes.json();
                if (Array.isArray(fallbackRows) && fallbackRows.length) {
                    results = fallbackRows.map((row) => ({
                        id: row?.id || '',
                        store_id: tournament.store_id || '',
                        store: tournament.store?.name || '',
                        tournament_date: tournament.tournament_date || '',
                        placement: Number(row?.placement) || 0,
                        player: String(row?.player?.name || '').trim() || '-',
                        deck: String(row?.deck?.name || '').trim(),
                        image_url: '',
                        total_players: Number(row?.total_players) || 0,
                        match_points:
                            row?.match_points === null || row?.match_points === undefined
                                ? null
                                : Number(row.match_points)
                    }));
                }
            }
        }

        results = results
            .map((row) => ({
                ...row,
                placement: Number(row?.placement) || 0,
                player: String(row?.player || row?.player_name || '').trim() || '-',
                deck: String(row?.deck || row?.deck_name || '').trim(),
                image_url: String(row?.image_url || '').trim(),
                match_points:
                    row?.match_points === null || row?.match_points === undefined
                        ? null
                        : Number(row.match_points)
            }))
            .sort((a, b) => (Number(a?.placement) || 999) - (Number(b?.placement) || 999));
        const storeName = String(tournament.store?.name || 'Loja').trim() || 'Loja';
        const storeIcon = resolveStoreIcon(storeName) || `${getAssetPrefix()}icons/logo.png`;
        const topFour = (results || []).filter((r) => Number(r.placement) <= 4);
        const totalPlayers = Number.isFinite(Number(tournament.total_players))
            ? Number(tournament.total_players)
            : results[0]?.total_players || 0;
        const formatCode = getTournamentFormatCode(tournament);
        const header = `
            <div class="tournament-details-header">
                <div class="details-header-top">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <img src="${escapeHtml(storeIcon)}" alt="${escapeHtml(storeName)}" class="details-pie-store-logo" loading="lazy"
                        style="max-width:210px;max-height:102px;width:auto;height:auto;object-fit:contain;">
                        <div class="details-header-meta">
                        <strong>${tournament.tournament_name || 'Tournament'}</strong>
                        <div>${formatDate(tournament.tournament_date)} - ${tournament.store?.name || 'Store'}</div>
                        <div>Total Players: ${totalPlayers}</div>
                        <div>Formato: ${formatCode || '-'}</div>
                        </div>                        
                    </div>
                    <div class="details-header-actions">
                        ${
                            window.tournamentUtils?.isTeamTournament(tournament.tournament_name)
                                ? ''
                                : `<button type="button" class="btn-create-filter details-export-digilab-btn" data-action="copy-digilab-data" aria-label="Copiar dados do torneio para o DigiLab">
                            <svg class="btn-create-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <rect x="9" y="9" width="11" height="11" rx="2"></rect>
                                <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path>
                            </svg>
                            <span>Copiar dados (DigiLab)</span>
                        </button>`
                        }
                        <button type="button" class="btn-create-filter details-generate-post-btn" data-action="generate-post-details" aria-label="Generate post">
                            <svg class="btn-create-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                            <circle cx="9" cy="10" r="1.7"></circle>
                            <path d="M4 17l5-4 3.2 2.6 3.8-3.6 4 5"></path>
                            </svg>
                            <span>Criar post</span>
                        </button>
                    </div>
                </div>      
            </div>
        `;

        const placementClass = (placement) => {
            if (placement === 1) return 'first-place';
            if (placement === 2) return 'second-place';
            if (placement === 3) return 'third-place';
            if (placement === 4) return 'fourth-place';
            return '';
        };

        const fullResultsPlacementClass = (placement) => {
            if (placement === 1) return 'first-place';
            if (placement === 2) return 'second-place';
            if (placement === 3) return 'third-place';
            if (placement === 4) return 'fourth-place';
            return 'other-place';
        };

        const podiumHtml = topFour.length
            ? topFour
                  .map((item) => {
                      const playerName = String(item.player || '-').trim() || '-';
                      const deckName = String(item.deck || '').trim();
                      const hasDeck = Boolean(deckName);
                      const podiumMainText = hasDeck ? deckName : playerName;
                      const podiumSubText = hasDeck ? playerName : '';
                      const imageUrl =
                          item.image_url ||
                          `https://via.placeholder.com/200x200/667eea/ffffff?text=${encodeURIComponent(podiumMainText.substring(0, 10) || 'Deck')}`;
                      return `
                <div class="details-podium-card ${placementClass(Number(item.placement))}">
                    <div class="details-rank-badge">${formatOrdinal(item.placement)}</div>
                    <div class="details-deck-card-footer">
                        ${hasDeck ? `<div class="details-player-name">${escapeHtml(podiumSubText)}</div>` : ''}
                        <div class="details-deck-name">${escapeHtml(podiumMainText)}</div>
                    </div>
                    ${
                        hasDeck
                            ? `
                    <div class="details-card-image-wrapper">
                        <img src="${imageUrl}" alt="${escapeHtml(podiumMainText || 'Deck')}" class="details-deck-card-image">
                    </div>
                    `
                            : ''
                    }
                </div>
            `;
                  })
                  .join('')
            : `<div class="details-empty-state">Nenhum podio registrado para este torneio.</div>`;

        const pieSlices = buildDeckPieData(results);
        const pieHtml = pieSlices.length
            ? pieSlices
                  .map(
                      (slice) => `
                <div class="details-pie-slice"
                     style="clip-path:${slice.clipPath}; background-image:url('${slice.image_url}');"
                     data-deck="${String(slice.deck || '').replace(/"/g, '&quot;')}"
                     data-x="${slice.initialX}" data-y="${slice.initialY}"
                     data-zoom="${slice.initialZoom}" data-min-zoom="${slice.minZoom}" data-max-zoom="${slice.maxZoom}"
                     title="${slice.deck} (${slice.percent.toFixed(1)}%)"></div>
            `
                  )
                  .join('')
            : '';
        const pieLegend = pieSlices.length
            ? pieSlices
                  .map(
                      (slice) => `
                <div class="details-pie-legend-item">
                    <span class="details-pie-legend-color" style="background:${slice.color}"></span>
                    <span class="details-pie-legend-name" title="${slice.deck}">${slice.deck}</span>
                    <strong>${slice.count}</strong>
                </div>
            `
                  )
                  .join('')
            : '';

        const resultsHtml = (results || []).length
            ? results
                  .map((item) => {
                      const playerName = String(item.player || '-').trim() || '-';
                      const deckName = String(item.deck || '').trim();
                      const hasDeck = Boolean(deckName);
                      const payload = encodeURIComponent(
                          JSON.stringify({
                              resultId: item.id || '',
                              deck: String(item.deck || '').trim(),
                              player: playerName,
                              code: extractDeckCodeFromImageUrl(item.image_url || ''),
                              store: tournament.store?.name || '',
                              date: tournament.tournament_date || '',
                              format: getTournamentFormatCode(tournament) || '',
                              tournamentName: tournament.tournament_name || ''
                          })
                      );
                      return `
                <div
                    class="results-mini-item ${hasDeck ? 'with-action' : ''} ${fullResultsPlacementClass(Number(item.placement))}"
                    ${hasDeck ? 'data-action="open-decklist-builder"' : ''}
                    data-decklist-payload="${payload}"
                    ${hasDeck ? 'role="button" tabindex="0"' : ''}
                    aria-label="${hasDeck ? `Open decklist builder for ${escapeHtml(item.deck || 'Deck')}` : `Placement ${formatOrdinal(item.placement)} - ${escapeHtml(playerName)}`}"
                    title="${hasDeck ? 'Open decklist builder' : ''}"
                >
                    <div class="results-mini-rank">${formatOrdinal(item.placement)}</div>
                    <div class="results-mini-main">
                        ${
                            hasDeck
                                ? `
                        <strong>${escapeHtml(deckName)}</strong>
                        <span>${escapeHtml(playerName)}</span>
                        `
                                : `
                        <strong>${escapeHtml(playerName)}</strong>
                        `
                        }
                        ${item.match_points !== null ? `<span class="results-mini-points">Pontos: ${escapeHtml(item.match_points)}</span>` : ''}
                    </div>
                </div>
            `;
                  })
                  .join('')
            : `<div class="details-empty-state">Nenhum resultado registrado para este torneio.</div>`;

        const pieSectionHtml = pieSlices.length
            ? `
                <div class="details-block details-pie-block">
                    <h3 class="details-section-title">
                        <svg class="details-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M21.21 15.89A10 10 0 1 1 12 2v10z" />
                            <path d="M12 2a10 0 0 1 10 10h-10z" />
                        </svg>
                        <span>Distribuição de decks</span>
                    </h3>
                    <div class="details-pie-panel">
                        <div class="details-pie-container">${pieHtml}</div>
                        <div class="details-pie-legend">${pieLegend}</div>
                    </div>
                </div>
            `
            : `
            `;

        const hasBandaiPrint = ocrFiles.length > 0;
        const bandaiPrintStatusHtml = `
            <span class="details-bandai-print-status ${hasBandaiPrint ? 'is-ok' : 'is-missing'}" title="${
                hasBandaiPrint
                    ? `${ocrFiles.length} print(s) da Bandai armazenado(s)`
                    : 'Nenhum print da Bandai armazenado'
            }">
                <span>Print Bandai ${hasBandaiPrint ? 'OK' : 'Ausente'}</span>
            </span>
        `;

        if (!targetContainer) {
            if (String(selectedTournamentId) !== tournamentId) return;
            content = getDetailsContainer(tournamentId);
            if (!content) return;
        }

        content.innerHTML = `
            ${header}
            <div class="details-grid">
                <div class="details-block">
                    <h3 class="details-section-title">
                        <svg class="details-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M6 21h12" />
                            <path d="M8 21V10h3v11" />
                            <path d="M13 21V6h3v15" />
                            <path d="M3 21V14h3v7" />
                        </svg>
                        <span>Pódio</span>
                    </h3>
                    <div class="details-podium">${podiumHtml}</div>
                </div>
                <div class="details-block details-full-results-block">
                    <h3 class="details-section-title details-full-results-title">
                        <svg class="details-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <span>Resultados completos</span>
                        ${bandaiPrintStatusHtml}
                    </h3>
                    <div class="results-mini">${resultsHtml}</div>
                </div>
                ${pieSectionHtml}
            </div>
        `;
        setupInteractivePieSlices(
            content,
            tournament.id || `${tournament.store_id}-${tournament.tournament_date}`
        );
        const btnGeneratePost = content.querySelector('[data-action="generate-post-details"]');
        if (btnGeneratePost) {
            btnGeneratePost.addEventListener('click', () => {
                openPostGeneratorWithTournamentData(tournament, results, totalPlayers);
            });
        }
        const btnExportDigilab = content.querySelector('[data-action="copy-digilab-data"]');
        if (btnExportDigilab) {
            btnExportDigilab.addEventListener('click', () => {
                copyTournamentDataForDigilab(tournament, btnExportDigilab);
            });
        }
        content
            .querySelectorAll('.results-mini-item.with-action[data-action="open-decklist-builder"]')
            .forEach((row) => {
                const openDecklistBuilder = () => {
                    const rawPayload = row.getAttribute('data-decklist-payload') || '';
                    let payload;
                    try {
                        payload = JSON.parse(decodeURIComponent(rawPayload));
                    } catch {
                        return;
                    }

                    const params = new URLSearchParams();
                    if (payload.deck) params.set('deck', payload.deck);
                    if (payload.player) params.set('player', payload.player);
                    if (payload.code) params.set('code', payload.code);
                    if (payload.store) params.set('store', payload.store);
                    if (payload.date) params.set('date', payload.date);
                    if (payload.format) params.set('format', payload.format);
                    if (payload.tournamentName)
                        params.set('tournamentName', payload.tournamentName);
                    if (payload.resultId) params.set('resultId', payload.resultId);
                    params.set('returnView', 'tournaments');
                    params.set('returnTournamentId', String(tournament.id));
                    params.set('returnMode', currentViewMode);

                    if (window.DIGISTATS_MICRO_FRONTENDS) {
                        window.digistatsNavigate('builder', Object.fromEntries(params));
                    } else {
                        window.location.href = `${getAssetPrefix()}${window.DIGISTATS_NATIVE_V2 ? 'demo-v2/deckbuilder.html' : 'torneios/decklist-builder/index.html'}?${params.toString()}`;
                    }
                };

                row.addEventListener('click', openDecklistBuilder);
                row.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDecklistBuilder();
                    }
                });
            });
    } catch (err) {
        console.error(err);
        if (!targetContainer) {
            if (String(selectedTournamentId) !== tournamentId) return;
            content = getDetailsContainer(tournamentId);
            if (!content) return;
        }
        content.innerHTML = `<div class="details-block">Falha ao carregar detalhes do torneio.</div>`;
    }
}

async function loadPlayersToCreate() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/players?is_active=eq.true&select=id,name,bandai_id,bandai_nick,digilab_name,is_active&order=name.asc`,
        {
            headers
        }
    );
    if (!res.ok) throw new Error('Erro ao carregar players');
    createPlayers = (await res.json()).map((player) => ({
        ...player,
        bandai_id: player.bandai_id || '',
        bandai_nick: player.bandai_nick || '',
        is_active: player.is_active !== false
    }));
}

async function loadDecksToCreate() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/decks?is_active=eq.true&select=id,name&order=name.asc`,
        { headers }
    );
    if (!res.ok) throw new Error('Erro ao carregar decks');
    createDecks = await res.json();
}

function addCreateResultRow() {
    const size = window.tournamentUtils?.isTeamTournament(
        document.getElementById('createTournamentName')?.value
    )
        ? 2
        : 1;
    if (createResults.length + size > 36) {
        alert('O limite é 36 jogadores (18 duplas).');
        return;
    }
    for (let member = 0; member < size; member++) {
        createResults.push({
            id: null,
            player_id: '',
            deck_id: '',
            player_name: '',
            deck_name: '',
            match_points: null,
            ocr_member_id: '',
            ocr_player_unmatched: false
        });
    }
    window.setTournamentFormDirty?.('create', true);
    renderCreateResultsRows();
}

function removeCreateResultRow(index) {
    const size = window.tournamentUtils?.isTeamTournament(
        document.getElementById('createTournamentName')?.value
    )
        ? 2
        : 1;
    createResults.splice(size === 2 ? Math.floor(index / 2) * 2 : index, size);
    window.setTournamentFormDirty?.('create', true);
    renderCreateResultsRows();
}

function updateCreateResultField(index, field, value) {
    if (!createResults[index]) return;
    createResults[index][field] = value;
    if (
        field === 'match_points' &&
        window.tournamentUtils?.isTeamTournament(
            document.getElementById('createTournamentName')?.value
        )
    ) {
        const partner = index % 2 ? index - 1 : index + 1;
        if (createResults[partner]) createResults[partner].match_points = value;
        const input = document.querySelector('[data-create-match-points-index="' + partner + '"]');
        if (input) input.value = value ?? '';
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[char] || char;
    });
}

function getItemNameById(items, id) {
    const match = items.find((item) => String(item.id) === String(id));
    return match?.name || '';
}

function parseSupabaseError(rawText) {
    if (!rawText) return null;
    try {
        return JSON.parse(rawText);
    } catch (_error) {
        return null;
    }
}

function getFriendlyResultsSaveErrorMessage(status, rawText) {
    const parsed = parseSupabaseError(rawText);
    const code = String(parsed?.code || '').trim();
    const message = String(parsed?.message || '').trim();

    if (code === '23502' && /deck_id/i.test(message)) {
        return 'Nao foi possivel salvar o torneio porque o banco ainda exige deck em todos os resultados. Preencha o deck dos players e tente novamente.';
    }

    if (message) {
        return `Nao foi possivel salvar os resultados do torneio. ${message}`;
    }

    return `Nao foi possivel salvar os resultados do torneio (erro ${status}).`;
}
window.getFriendlyResultsSaveErrorMessage = getFriendlyResultsSaveErrorMessage;

function showFriendlyErrorModal(title, message) {
    let modal = document.getElementById('friendlyErrorModal');
    if (!modal) {
        const host = document.createElement('div');
        host.innerHTML = `
            <div id="friendlyErrorModal" class="modal-overlay">
                <div class="modal-content friendly-error-modal-content">
                    <h2 id="friendlyErrorTitle">Erro</h2>
                    <p id="friendlyErrorMessage" class="friendly-error-message"></p>
                    <div class="modal-actions">
                        <button type="button" id="btnFriendlyErrorClose" class="btn-cancel">Entendi</button>
                    </div>
                </div>
            </div>
        `;
        (window.digiStatsComponentRoot
            ? window.digiStatsComponentRoot()
            : document.body
        ).appendChild(host.firstElementChild);
        modal = document.getElementById('friendlyErrorModal');
    }

    const titleEl = document.getElementById('friendlyErrorTitle');
    const messageEl = document.getElementById('friendlyErrorMessage');
    const btnClose = document.getElementById('btnFriendlyErrorClose');
    if (!modal || !titleEl || !messageEl || !btnClose) {
        alert(`${title}\n\n${message}`);
        return;
    }

    titleEl.textContent = title || 'Erro';
    messageEl.textContent = message || 'Ocorreu um erro inesperado.';
    modal.classList.add('active');

    const cleanup = () => {
        btnClose.removeEventListener('click', onClose);
        modal.removeEventListener('click', onOverlay);
        modal.classList.remove('active');
    };
    const onClose = () => cleanup();
    const onOverlay = (event) => {
        if (event.target === modal) cleanup();
    };

    btnClose.addEventListener('click', onClose);
    modal.addEventListener('click', onOverlay);
}

window.showFriendlyErrorModal = showFriendlyErrorModal;

function normalizePlayerNameInput(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getPendingPlayerRegistrations(results, players) {
    const missingRows = [];
    const pendingNames = [];
    const seen = new Set();

    results.forEach((row, index) => {
        if (row.player_id) return;
        const playerName = normalizePlayerNameInput(row.player_name);
        if (!playerName) {
            missingRows.push(index + 1);
            return;
        }

        const normalizedName = normalizeLookupName(playerName);
        const existing = players.find((player) => {
            const byName = normalizeLookupName(player.name) === normalizedName;
            const byNick = normalizeLookupName(player.bandai_nick) === normalizedName;
            return byName || byNick;
        });

        if (existing?.id) {
            row.player_id = existing.id;
            row.player_name = existing.name || playerName;
            row.ocr_player_unmatched = false;
            return;
        }

        if (!seen.has(normalizedName)) {
            seen.add(normalizedName);
            pendingNames.push(playerName);
        }
    });

    return { missingRows, pendingNames };
}

function openRegisterPlayersModal(playerNames) {
    let modal = document.getElementById('registerPlayersModal');
    if (!modal) {
        const host = document.createElement('div');
        host.innerHTML = `
            <div id="registerPlayersModal" class="modal-overlay">
                <div class="modal-content register-players-modal-content">
                    <h2>Os seguintes jogadores serao registrados</h2>
                    <p class="field-hint register-players-hint">
                        Confirme para cadastrar os jogadores abaixo antes de salvar o torneio.
                    </p>
                    <div class="register-players-box">
                        <ul id="registerPlayersList" class="register-players-list"></ul>
                    </div>
                    <div class="modal-actions">
                        <button type="button" id="btnRegisterPlayersConfirm" class="btn-save">Cadastrar</button>
                        <button type="button" id="btnRegisterPlayersCancel" class="btn-cancel">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        (window.digiStatsComponentRoot
            ? window.digiStatsComponentRoot()
            : document.body
        ).appendChild(host.firstElementChild);
        modal = document.getElementById('registerPlayersModal');
    }

    const list = document.getElementById('registerPlayersList');
    const btnConfirm = document.getElementById('btnRegisterPlayersConfirm');
    const btnCancel = document.getElementById('btnRegisterPlayersCancel');
    if (!modal || !list || !btnConfirm || !btnCancel) {
        return Promise.reject(
            new Error('Nao foi possivel abrir o modal de confirmacao de players.')
        );
    }

    list.innerHTML = playerNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
    modal.onclick = (event) => {
        if (event.target === modal) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    modal.classList.add('active');

    return new Promise((resolve) => {
        const cleanup = () => {
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            modal.classList.remove('active');
        };
        const onConfirm = () => {
            cleanup();
            resolve(true);
        };
        const onCancel = () => {
            cleanup();
            resolve(false);
        };
        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

window.openRegisterPlayersModal = openRegisterPlayersModal;

async function syncSelectedOcrPlayers() {
    const updatesByPlayerId = new Map();

    createResults.forEach((row) => {
        const playerId = String(row.player_id || '');
        if (!playerId) return;
        const player = createPlayers.find((item) => String(item.id) === playerId);
        if (!player) return;

        const update = updatesByPlayerId.get(playerId) || {};
        if (player.is_active === false) update.is_active = true;

        const ocrMemberId = normalizeMemberId(row.ocr_member_id);
        const currentMemberId = normalizeMemberId(player.bandai_id);
        if (ocrMemberId && !isGuestMemberId(ocrMemberId)) {
            if (currentMemberId && currentMemberId !== ocrMemberId) {
                throw new Error(
                    `O player "${player.name}" já possui outro Bandai ID (${currentMemberId}). Revise o print antes de continuar.`
                );
            }
            if (!currentMemberId) update.bandai_id = ocrMemberId;
        }

        if (Object.keys(update).length) updatesByPlayerId.set(playerId, update);
    });

    for (const [playerId, update] of updatesByPlayerId) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify(update)
            }
        );
        if (!res.ok) {
            const detail = await res.text();
            throw new Error(`Erro ao atualizar o cadastro do player (${res.status}): ${detail}`);
        }

        const player = createPlayers.find((item) => String(item.id) === playerId);
        if (player) Object.assign(player, update);
    }
}

async function ensurePlayersRegisteredForCreate() {
    await syncSelectedOcrPlayers();
    const { missingRows, pendingNames } = getPendingPlayerRegistrations(
        createResults,
        createPlayers
    );
    if (missingRows.length) {
        throw new Error('Informe o player nas colocacoes: ' + missingRows.join(', '));
    }

    if (!pendingNames.length) return true;

    const confirmed = await openRegisterPlayersModal(pendingNames);
    if (!confirmed) {
        return false;
    }

    for (const playerName of pendingNames) {
        const normalizedName = normalizeLookupName(playerName);
        const existing = createPlayers.find(
            (player) =>
                normalizeLookupName(player.name) === normalizedName ||
                normalizeLookupName(player.bandai_nick) === normalizedName
        );
        if (existing?.id) continue;

        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
            method: 'POST',
            headers: {
                ...headers,
                Prefer: 'return=representation'
            },
            body: JSON.stringify({ name: playerName })
        });
        if (!insertRes.ok) {
            const errorText = await insertRes.text();
            throw new Error(
                `Erro ao cadastrar player "${playerName}" (${insertRes.status}): ${errorText}`
            );
        }

        const insertedPlayer = (await insertRes.json())[0];
        if (!insertedPlayer?.id) {
            throw new Error(`Player "${playerName}" cadastrado sem retornar ID.`);
        }
        createPlayers.push({
            ...insertedPlayer,
            bandai_id: insertedPlayer.bandai_id || '',
            bandai_nick: insertedPlayer.bandai_nick || ''
        });
    }

    createResults.forEach((row) => {
        if (row.player_id) return;
        const normalizedName = normalizeLookupName(normalizePlayerNameInput(row.player_name));
        const player = createPlayers.find(
            (candidate) =>
                normalizeLookupName(candidate.name) === normalizedName ||
                normalizeLookupName(candidate.bandai_nick) === normalizedName
        );
        if (player?.id) {
            row.player_id = player.id;
            row.player_name = player.name || row.player_name;
            row.ocr_player_unmatched = false;
        }
    });
    return true;
}

function resolveTypedDecks(results, decks) {
    results.forEach((row) => {
        if (row.deck_id || !String(row.deck_name || '').trim()) return;
        const target = normalizeLookupName(row.deck_name);
        const existing = decks.find((deck) => normalizeLookupName(deck.name) === target);
        if (existing?.id) {
            row.deck_id = existing.id;
            row.deck_name = existing.name || row.deck_name;
        }
    });
}

function getPendingDeckNames(results, decks) {
    resolveTypedDecks(results, decks);
    const pendingNames = [];
    const seen = new Set();
    results.forEach((row) => {
        if (row.deck_id) return;
        const name = String(row.deck_name || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!name) return;
        const key = normalizeLookupName(name);
        if (!seen.has(key)) {
            seen.add(key);
            pendingNames.push(name);
        }
    });
    return pendingNames;
}

function openRegisterDecksModal(deckNames) {
    const modal = document.getElementById('registerDecksModal');
    const list = document.getElementById('registerDecksList');
    const btnConfirm = document.getElementById('btnRegisterDecksConfirm');
    const btnCancel = document.getElementById('btnRegisterDecksCancel');
    if (!modal || !list || !btnConfirm || !btnCancel) {
        return Promise.reject(new Error('Nao foi possivel abrir a confirmacao de decks.'));
    }
    list.innerHTML = deckNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
    modal.onclick = (event) => {
        if (event.target === modal) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    modal.classList.add('active');
    return new Promise((resolve) => {
        const cleanup = () => {
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            modal.classList.remove('active');
        };
        const onConfirm = () => {
            cleanup();
            resolve(true);
        };
        const onCancel = () => {
            cleanup();
            resolve(false);
        };
        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

async function ensureTournamentDecksRegistered({
    results,
    getDecks,
    reloadDecks,
    supabaseUrl,
    requestHeaders
}) {
    let decks = getDecks();
    let pendingNames = getPendingDeckNames(results, decks);
    if (!pendingNames.length) return true;
    if (!(await openRegisterDecksModal(pendingNames))) return false;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/decks`, {
        method: 'POST',
        headers: { ...requestHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(pendingNames.map((name) => ({ name })))
    });
    if (insertRes.ok) {
        const inserted = await insertRes.json();
        decks.push(...inserted);
    } else {
        // A concurrent insert may have created one of the names. Reload before failing.
        await reloadDecks();
        decks = getDecks();
        pendingNames = getPendingDeckNames(results, decks);
        if (pendingNames.length) {
            const retryRes = await fetch(`${supabaseUrl}/rest/v1/decks`, {
                method: 'POST',
                headers: { ...requestHeaders, Prefer: 'return=representation' },
                body: JSON.stringify(pendingNames.map((name) => ({ name })))
            });
            if (!retryRes.ok) {
                const detail = await retryRes.text();
                throw new Error(`Falha ao cadastrar deck(s) ${pendingNames.join(', ')}: ${detail}`);
            }
            getDecks().push(...(await retryRes.json()));
        }
    }

    resolveTypedDecks(results, getDecks());
    const unresolved = getPendingDeckNames(results, getDecks());
    if (unresolved.length) {
        throw new Error(`Nao foi possivel vincular o(s) deck(s): ${unresolved.join(', ')}`);
    }
    return true;
}

window.openRegisterDecksModal = openRegisterDecksModal;
window.ensureTournamentDecksRegistered = ensureTournamentDecksRegistered;

function bindCreateResultsAutocomplete() {
    const wrappers = document.querySelectorAll('#createResultsRows .autocomplete-wrapper');
    wrappers.forEach((wrapper) => {
        const input = wrapper.querySelector('input[data-autocomplete-type]');
        const dropdown = wrapper.querySelector('.autocomplete-dropdown');
        if (!input || !dropdown) return;

        const rowIndex = Number(wrapper.dataset.rowIndex);
        const type = input.dataset.autocompleteType;
        const field = type === 'player' ? 'player_id' : 'deck_id';
        const source = type === 'player' ? createPlayers : createDecks;

        const renderOptions = (query) => {
            const value = (query || '').trim().toLowerCase();
            const filtered = source
                .filter((item) => item.name.toLowerCase().includes(value))
                .slice(0, 8);

            if (filtered.length === 0) {
                dropdown.innerHTML = '<div class="autocomplete-item no-match">Nao encontrado</div>';
                dropdown.style.display = 'block';
                return;
            }

            dropdown.innerHTML = filtered
                .map(
                    (item) =>
                        `<div class="autocomplete-item" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>`
                )
                .join('');
            dropdown.style.display = 'block';
        };

        input.addEventListener('input', () => {
            updateCreateResultField(rowIndex, field, '');
            updateCreateResultField(rowIndex, `${type}_name`, input.value.trim());
            if (type === 'player') {
                updateCreateResultField(rowIndex, 'ocr_member_id', '');
                updateCreateResultField(
                    rowIndex,
                    'ocr_player_unmatched',
                    Boolean(input.value.trim())
                );
            }
            renderOptions(input.value);
        });

        input.addEventListener('focus', () => {
            renderOptions(input.value);
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 120);
        });

        dropdown.addEventListener('mousedown', (event) => {
            const option = event.target.closest('.autocomplete-item');
            if (!option || option.classList.contains('no-match')) return;
            event.preventDefault();
            updateCreateResultField(rowIndex, field, option.dataset.id || '');
            updateCreateResultField(rowIndex, `${type}_name`, option.dataset.name || '');
            if (type === 'player') {
                updateCreateResultField(rowIndex, 'ocr_player_unmatched', false);
            }
            input.value = option.dataset.name || '';
            dropdown.style.display = 'none';
        });
    });
}

function renderCreateResultsRows() {
    const container = document.getElementById('createResultsRows');
    if (!container) return;
    const team = window.tournamentUtils?.isTeamTournament(
        document.getElementById('createTournamentName')?.value
    );
    const addButton = document.getElementById('btnAddResultRow');
    if (addButton) addButton.textContent = team ? '+ Dupla' : '+ Jogador';
    if (team && createResults.length % 2) {
        createResults.push({
            id: null,
            player_id: '',
            deck_id: '',
            player_name: '',
            deck_name: '',
            match_points: null
        });
    }
    if (team) {
        for (let index = 0; index < createResults.length; index += 2) {
            const points =
                createResults[index].match_points ?? createResults[index + 1].match_points ?? null;
            createResults[index].match_points = createResults[index + 1].match_points = points;
        }
    }
    const form = document.getElementById('createTournamentForm');
    if (form) form.dataset.team = String(Boolean(team));
    const importSection = document.getElementById('createTournamentOcrSection');
    if (importSection) {
        importSection.hidden = false;
        const description = importSection.querySelector('summary span');
        if (description)
            description.textContent = team
                ? 'Print da Bandai · segundo jogador manual'
                : 'DigiLab ou print da Bandai';
    }
    const digilabImport = form?.querySelector('.create-digilab-import');
    if (digilabImport) digilabImport.hidden = Boolean(team);
    const importDivider = form?.querySelector('.create-import-divider');
    if (importDivider) importDivider.hidden = Boolean(team);
    const position = (index) =>
        window.tournamentUtils.resultPlacement(
            index,
            document.getElementById('createTournamentName')?.value
        );
    if (createResults.length === 0) {
        container.innerHTML = '';
        document.getElementById('createTotalPlayers').value = '';
        updateTournamentPlayerCount('create', 0);
        return;
    }

    container.innerHTML = createResults
        .map(
            (row, index) => `
        ${team && index % 2 === 0 ? '<div class="team-result-group">' : ''}
        <div class="result-row">
            <div class="form-group result-placement-group">
                <label>Posicao</label>
                <span class="result-placement-badge ${getResultPlacementClass(position(index))}" aria-label="${formatOrdinal(position(index))} lugar">${formatOrdinal(position(index))}</span>
            </div>
            <div class="form-group">
                <label>${team ? `Jogador ${(index % 2) + 1}` : 'Jogador'}<span class="required">*</span></label>
                <div class="autocomplete-wrapper" data-row-index="${index}">
                    <input
                        type="text"
                        class="player-input${row.ocr_player_unmatched ? ' ocr-player-unmatched' : ''}"
                        data-autocomplete-type="player"
                        placeholder="Nome do jogador..."
                        value="${escapeHtml(getItemNameById(createPlayers, row.player_id) || row.player_name || '')}"
                        ${row.ocr_player_unmatched ? 'style="border-color:#f59e0b;background:#fff7ed;" title="Player nao encontrado no cadastro"' : ''}
                        autocomplete="off"
                        required
                    >
                    <div class="autocomplete-dropdown"></div>
                </div>
            </div>
            <div class="form-group">
                <label>Deck${team ? '<span class="required">*</span>' : ''}</label>
                <div class="autocomplete-wrapper" data-row-index="${index}">
                    <input
                        type="text"
                        class="deck-input"
                        ${team ? 'required' : ''}
                        data-autocomplete-type="deck"
                        placeholder="Digite o deck..."
                        value="${escapeHtml(getItemNameById(createDecks, row.deck_id) || row.deck_name || '')}"
                        autocomplete="off"
                    >
                    <div class="autocomplete-dropdown"></div>
                </div>
            </div>
            <div class="form-group result-points-group">
                <label>Pontos</label>
                <input
                    type="number"
                    class="match-points-input"
                    data-create-match-points-index="${index}"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    placeholder="—"
                    value="${row.match_points === null || row.match_points === undefined ? '' : escapeHtml(row.match_points)}"
                >
            </div>
            <button type="button" class="btn-remove-result" ${team && index % 2 === 1 ? 'hidden' : ''} data-create-remove-index="${index}" aria-label="${team ? 'Remover dupla' : 'Remover jogador'}" title="${team ? 'Remover dupla' : 'Remover jogador'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4h8v2"></path>
                    <path d="M7 6l1 14h8l1-14"></path>
                    <path d="M10 10v7"></path>
                    <path d="M14 10v7"></path>
                </svg>
            </button>
        </div>
        ${team && index % 2 === 1 ? '</div>' : ''}
    `
        )
        .join('');

    container.querySelectorAll('[data-create-remove-index]').forEach((button) => {
        button.addEventListener('click', () => {
            const index = Number(button.getAttribute('data-create-remove-index'));
            removeCreateResultRow(index);
        });
    });
    container.querySelectorAll('[data-create-match-points-index]').forEach((input) => {
        input.addEventListener('input', () => {
            const index = Number(input.getAttribute('data-create-match-points-index'));
            updateCreateResultField(index, 'match_points', normalizeOcrMatchPoints(input.value));
        });
    });
    bindCreateResultsAutocomplete();

    document.getElementById('createTotalPlayers').value = String(createResults.length);
    updateTournamentPlayerCount('create', createResults.length);
}

async function createTournamentFormSubmit(e) {
    e.preventDefault();
    const submitBtn = document.querySelector("#createTournamentForm button[type='submit']");
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando...';
    createTournamentSaveInProgress = true;
    document.getElementById('createTournamentForm')?.setAttribute('aria-busy', 'true');
    ['btnCreateCancel', 'btnSelectOcrPrints', 'btnImportCreateDigilab'].forEach((id) => {
        const button = document.getElementById(id);
        if (button) button.disabled = true;
    });
    let ocrBatchForRollback = null;
    let saveCompleted = false;

    try {
        const totalPlayers = createResults.length;
        const payloadBase = {
            store_id: document.getElementById('createStoreSelect').value,
            tournament_date: document.getElementById('createTournamentDate').value,
            tournament_name: document.getElementById('createTournamentName').value,
            total_players: totalPlayers,
            instagram_link: document.getElementById('createInstagramLink').value.trim()
        };
        const payload = assignTournamentFormat(
            payloadBase,
            readTournamentFormatValue('createTournamentFormat')
        );

        const validTotalPlayers = window.validation
            ? window.validation.isPositiveInteger(payload.total_players, 1, 36)
            : payload.total_players > 0;
        const validInstagram = window.validation
            ? window.validation.isValidOptionalUrl(payload.instagram_link)
            : true;
        try {
            const shouldProceed = await ensurePlayersRegisteredForCreate();
            if (!shouldProceed) return;
        } catch (registrationError) {
            showFriendlyErrorModal(
                'Nao foi possivel continuar',
                registrationError.message || 'Falha ao validar cadastro de players.'
            );
            return;
        }
        try {
            const shouldProceed = await ensureTournamentDecksRegistered({
                results: createResults,
                getDecks: () => createDecks,
                reloadDecks: loadDecksToCreate,
                supabaseUrl: SUPABASE_URL,
                requestHeaders: headers
            });
            if (!shouldProceed) return;
        } catch (registrationError) {
            showFriendlyErrorModal(
                'Nao foi possivel continuar',
                registrationError.message || 'Falha ao validar cadastro de decks.'
            );
            return;
        }
        const hasInvalidResult = createResults.some((r) => !r.player_id);
        const teamError = window.tournamentUtils.validateTeamResults(
            createResults,
            payload.tournament_name
        );
        if (teamError) {
            alert(teamError);
            return;
        }
        if (
            !payload.store_id ||
            !payload.tournament_date ||
            !payload.tournament_name ||
            !validTotalPlayers ||
            !validInstagram ||
            hasInvalidResult
        ) {
            alert('Please fill all required fields correctly.');
            return;
        }

        if (createOcrProcessedFiles.length) {
            if (!window.tournamentOcrFiles?.uploadFiles) {
                throw new Error(
                    'O módulo de prints da Bandai não foi carregado. Atualize a página e tente novamente.'
                );
            }
            setCreateOcrStatus('Arquivando prints da Bandai...');
            ocrBatchForRollback = await window.tournamentOcrFiles.uploadFiles({
                supabaseUrl: SUPABASE_URL,
                headers,
                files: createOcrProcessedFiles
            });
        }

        const resultsPayload = createResults.map((row) => ({
            deck_id: row.deck_id || null,
            player_id: row.player_id,
            match_points: row.match_points ?? null
        }));

        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_tournament_transaction`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                p_tournament_id: null,
                p_tournament: payload,
                p_results: resultsPayload,
                p_ocr_files: ocrBatchForRollback?.metadata || []
            })
        });
        if (!saveRes.ok) {
            const detail = await saveRes.text();
            throw new Error(getFriendlyResultsSaveErrorMessage(saveRes.status, detail));
        }

        saveCompleted = true;
        createTournamentSaveInProgress = false;
        closeCreateModal();

        // Reset form
        document.getElementById('createTournamentForm').reset();
        await loadTournaments();
        applyFilters();
    } catch (err) {
        if (!saveCompleted && ocrBatchForRollback) {
            await window.tournamentOcrFiles.cleanupBatch({
                supabaseUrl: SUPABASE_URL,
                headers,
                batchId: ocrBatchForRollback.batchId,
                storagePaths: ocrBatchForRollback.storagePaths
            });
        }
        console.error('Erro completo:', err);
        showFriendlyErrorModal(
            saveCompleted ? 'Torneio salvo' : 'Falha ao cadastrar torneio',
            saveCompleted
                ? 'O torneio foi salvo, mas a lista nao foi atualizada. Recarregue a pagina.'
                : err?.message || 'Nao foi possivel concluir o cadastro do torneio.'
        );
    } finally {
        createTournamentSaveInProgress = false;
        document.getElementById('createTournamentForm')?.removeAttribute('aria-busy');
        ['btnCreateCancel', 'btnSelectOcrPrints', 'btnImportCreateDigilab'].forEach((id) => {
            const button = document.getElementById(id);
            if (button) button.disabled = false;
        });
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
