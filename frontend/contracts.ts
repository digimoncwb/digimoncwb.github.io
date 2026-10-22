export type RouteName =
    | 'overview'
    | 'tournaments'
    | 'meta'
    | 'decks'
    | 'players'
    | 'admin'
    | 'manage'
    | 'statistics'
    | 'posts'
    | 'builder';
export interface Route {
    name: RouteName;
    params: URLSearchParams;
}
export interface Result {
    id?: string;
    name: string;
    deck: string;
    image: string;
    placement: number;
    members?: Result[];
}
export interface Tournament {
    id: string;
    storeId: string;
    title: string;
    deckless: boolean;
    team?: boolean;
    store: string;
    logo: string;
    isoDate: string;
    date: string;
    day: string;
    players: number;
    format: string;
    deckFormatId?: string;
    deckFormat?: string;
    winner: Result | null;
    podium: (Result | null)[];
    results: Result[];
    instagram: string;
}
export interface Store {
    id: string | number;
    name: string;
    logo_url?: string;
    is_active?: boolean;
}
export interface Format {
    id: string | number;
    code: string;
    name: string;
    created_at: string;
    is_default?: boolean;
    is_active?: boolean;
    description?: string | null;
    rules_text?: string | null;
    rules_url?: string | null;
    is_community_highlight?: boolean;
    validation_rules?: import('./apps/builder/editor-model').FormatRules | null;
    rules_revision?: number;
    rules_status?: 'draft' | 'published';
    updated_at?: string;
    change_note?: string | null;
}
export interface Data {
    events: Tournament[];
    stores: Store[];
    formats: Format[];
    deckFormats?: Format[];
    schedule: { weekday: number; store_id: string | number; is_active?: boolean }[];
}
export interface Snapshot {
    data: Data;
    loading: boolean;
    error: string;
    updatedAt: number;
}
export interface DataService {
    getSnapshot(): Snapshot;
    subscribe(listener: () => void): () => void;
    refresh(): Promise<void>;
}
export interface MicroContext {
    route: Route;
    active: boolean;
    data: DataService;
    asset(path: string): string;
    navigate(name: RouteName, params?: Record<string, string>): void;
    href(name: RouteName, params?: Record<string, string>): string;
    loadScript(path: string): Promise<void>;
}
export interface MicroHandle {
    update(context: MicroContext): void;
    unmount(): void;
}
export interface MicroModule {
    apiVersion: 1;
    mount(element: HTMLElement, context: MicroContext): MicroHandle;
}
export interface Manifest {
    apiVersion: 1;
    version: string;
    modules: Record<string, { entry: string; styles?: string[]; routes: RouteName[] }>;
}
declare global {
    interface Window {
        digistatsAdminAuthenticated?: boolean;
        cardPortraits: {
            codes(): string[];
            get(src?: string): PortraitSetting;
            style(setting: PortraitSetting): { transform: string; transformOrigin: string };
            load(): Promise<void>;
            codeFromImage(src?: string): string;
            defaults: PortraitSetting;
        };
        digistatsDeckMutations: {
            create(
                url: string,
                headers: Record<string, string>,
                name: string,
                code: string,
                colors: string
            ): Promise<void>;
            update(
                url: string,
                headers: Record<string, string>,
                id: string | number,
                name: string,
                code: string,
                colors: string,
                family: string | null,
                includeFamily: boolean
            ): Promise<void>;
        };
        editTournament(id: string | number): void;
        digilabExport: {
            normalizeDigilabExportRows(rows: unknown[]): unknown[];
            buildDigilabClipboardText(rows: unknown[]): string;
            getMissingMemberNames(rows: unknown[]): string[];
        };
        APP_VERSION?: string;
        APP_CONFIG: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
        createSupabaseHeaders(extra?: Record<string, string>): Record<string, string>;
        liveData: {
            load(
                request: (path: string, options?: RequestInit) => Promise<Response>,
                signal?: AbortSignal
            ): Promise<Data>;
            formatLabel(code: string, formats: Format[]): string;
            eventsForFormat(events: Tournament[], format: string): Tournament[];
            weekStart(date: string): string;
            weekEnd(date: string): string;
            displayDate(date: string): string;
        };
        resultStatistics: {
            analyze(events: Tournament[]): { decks: StatisticsRow[]; players: StatisticsRow[] };
        };
        digistatsAdminSession: {
            request(path: string, options?: RequestInit): Promise<Response>;
            refresh(): Promise<void>;
            verify(): Promise<void>;
            profile: { user_id: string; display_name?: string; username?: string } | null;
            restore(): Promise<boolean>;
            login(password: string): Promise<void>;
            logout(): Promise<void>;
        };
        DIGISTATS_MICRO_FRONTENDS: boolean;
        DIGISTATS_NATIVE_V2: boolean;
        DIGISTATS_WORKSPACE_VIEW: string;
        digiStatsComponentRoot: () => HTMLElement;
        initializeTournamentTools: () => Promise<void>;
        switchDashboardView: (view: string) => Promise<void>;
        openCreateTournamentModal: (date?: string) => Promise<void>;
        initializeDeckbuilder: () => Promise<void>;
        refreshDeckbuilderContext: () => Promise<void>;
        digistatsBuilderAssets: {
            loadCatalog(): Promise<Record<string, unknown>[]>;
            details(code: string): Promise<Record<string, unknown>>;
            systemRules(): import('./apps/builder/editor-model').FormatRules;
            exportImage(
                cards: { code: string; qty: number }[],
                metadata: Record<string, string>
            ): Promise<void>;
        };
        digistatsNavigate: MicroContext['navigate'];
        restoreDashboardReturnContext: () => Promise<void>;
    }
}
export interface PortraitSetting {
    center_x: number;
    offset_y: number;
    zoom: number;
}
export interface StatisticsRow {
    name: string;
    image: string;
    count: number;
    titles: number;
    top3: number;
    eligible: number;
}
