export interface FormatRules {
    main_count?: number;
    egg_max?: number;
    security_count?: number;
    copies?: number;
    use_official_banlist?: boolean;
    banned_codes?: string[];
    limited_cards?: Record<string, number>;
    unlimited_codes?: string[];
    allowed_colors?: string[];
    allowed_sets?: string[];
    choice_groups?: string[][];
    allowed_rarities?: string[];
    points_limit?: number | null;
    card_points?: Record<string, { name: string; points: number }>;
    points_pending?: { code: string; name: string; points: number }[];
}
export function pendingFormatRules(format?: {
    rules_status?: string;
    validation_rules?: FormatRules | null;
}) {
    const pending: string[] = [];
    if (format?.validation_rules?.main_count == null) pending.push('Quantidade do deck principal');
    if (format?.validation_rules?.egg_max == null) pending.push('Quantidade de Digi-Eggs');
    if (format?.validation_rules?.copies == null) pending.push('Limite de cópias');
    if (format?.rules_status !== 'published') pending.push('Publicação do regulamento');
    if (format?.validation_rules?.points_pending?.length)
        pending.push(
            `${format.validation_rules.points_pending.length} códigos da pontuação aguardando correção`
        );
    return pending;
}
export interface Card {
    code: string;
    name: string;
    type: string;
    level: number | null;
    colors: string[];
    cost: number | null;
    image: string;
    payload: Record<string, unknown>;
    known: boolean;
    rarity: string;
}
export interface Entry {
    code: string;
    qty: number;
}
export interface Issue {
    id: string;
    title: string;
    message: string;
    codes: string[];
}
export const colorLabels: Record<string, string> = {
    red: 'Vermelho',
    blue: 'Azul',
    yellow: 'Amarelo',
    green: 'Verde',
    purple: 'Roxo',
    black: 'Preto',
    white: 'Branco'
};
export const colorHex: Record<string, string> = {
    red: '#ef646b',
    blue: '#66a7f5',
    yellow: '#f1cc5b',
    green: '#4edb9b',
    purple: '#bf8afb',
    black: '#707780',
    white: '#f4f5f6'
};
export const textKey = (value: unknown) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
export const cardCode = (value: unknown) =>
    String(value ?? '')
        .trim()
        .toUpperCase()
        .match(/^([A-Z]{1,4}\d{0,3}-\d{1,4})(?:_[A-Z0-9]+)?$/)?.[1] || '';
export const isDigimonCardCode = (value: string) =>
    /^(?:BT\d+|EX\d+|ST\d+|RB\d+|AD\d+|LM\d*|P)-\d{1,4}$/.test(value);
const numeric = (value: unknown) =>
    value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
export function normalizeRarity(value: unknown): string {
    const rarity = textKey(value);
    return (
        (
            {
                common: 'C',
                comum: 'C',
                uncommon: 'U',
                incomum: 'U',
                incomun: 'U',
                uc: 'U',
                unknown: ''
            } as Record<string, string>
        )[rarity] ?? rarity.toUpperCase()
    );
}
export function normalizeCard(row: Record<string, unknown>): Card {
    const payload =
        row.card_payload && typeof row.card_payload === 'object'
            ? (row.card_payload as Record<string, unknown>)
            : row;
    const code = cardCode(
        row.card_code || row.cardnumber || row.id || row.card || payload.cardnumber
    );
    let type = textKey(row.card_type || row.type || payload.type);
    if (['digitama', 'digi egg', 'digi-egg'].includes(type) || row.is_digi_egg === true)
        type = 'digi-egg';
    const colors = [
        ...new Set(
            [row.color, payload.color, row.color2, payload.color2]
                .flatMap((v) => textKey(v).split(/[^a-z]+/))
                .filter((c) => c in colorLabels)
        )
    ];
    return {
        code,
        name: String(row.name || payload.name || code),
        type,
        colors,
        level: numeric(row.card_level ?? row.level ?? payload.level),
        cost: numeric(row.play_cost ?? payload.play_cost ?? payload.playcost),
        image: `https://digimon.digilab.cards/api/card/${encodeURIComponent(code)}.jpg`,
        payload,
        rarity: normalizeRarity(row.rarity || payload.rarity),
        known: Boolean(
            isDigimonCardCode(code) &&
            ['digimon', 'digi-egg', 'tamer', 'option', 'dual'].includes(type) &&
            colors.length &&
            String(row.name || payload.name || '') &&
            (row.name || payload.name) !== code
        )
    };
}
export function mergeCatalog(...sources: Record<string, unknown>[][]): Card[] {
    const rows = new Map<string, Card>();
    for (const source of sources)
        for (const row of source) {
            const card = normalizeCard(row);
            if (!card.code || !isDigimonCardCode(card.code)) continue;
            const old = rows.get(card.code);
            if (!old || (!old.known && card.known)) rows.set(card.code, card);
        }
    return [...rows.values()].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })
    );
}
export function effectiveRules(
    base: FormatRules,
    custom?: FormatRules | null
): Required<FormatRules> {
    const useOfficialBanlist = custom?.use_official_banlist ?? base.use_official_banlist ?? true;
    const inherited = {
        ...base,
        banned_codes: useOfficialBanlist ? base.banned_codes || [] : [],
        limited_cards: useOfficialBanlist ? base.limited_cards || {} : {},
        choice_groups: useOfficialBanlist ? base.choice_groups || [] : []
    };
    const rules: Required<FormatRules> = {
        main_count: 50,
        egg_max: 5,
        security_count: 5,
        copies: 4,
        use_official_banlist: useOfficialBanlist,
        unlimited_codes: [],
        allowed_colors: [],
        allowed_sets: [],
        allowed_rarities: [],
        points_limit: null,
        card_points: {},
        points_pending: [],
        ...inherited,
        ...custom
    };
    // Official restrictions are inherited only when enabled for this format.
    rules.banned_codes = [...new Set([...inherited.banned_codes, ...(custom?.banned_codes || [])])];
    rules.limited_cards = { ...inherited.limited_cards, ...custom?.limited_cards };
    for (const [code, limit] of Object.entries(inherited.limited_cards))
        rules.limited_cards[code] = Math.min(limit, rules.limited_cards[code] ?? limit);
    rules.choice_groups = [
        ...new Map(
            [...inherited.choice_groups, ...(custom?.choice_groups || [])].map((group) => [
                [...new Set(group)].sort().join('|'),
                group
            ])
        ).values()
    ];
    rules.unlimited_codes = [
        ...new Set([...(base.unlimited_codes || []), ...(custom?.unlimited_codes || [])])
    ];
    return rules;
}
export function cardPoints(code: string, rules: Required<FormatRules>) {
    return rules.card_points[code]?.points ?? 0;
}
export function formatSpecificRestrictions(base: FormatRules, custom?: FormatRules | null) {
    const general = effectiveRules(base, {
        use_official_banlist: custom?.use_official_banlist ?? base.use_official_banlist ?? true
    });
    const rules = effectiveRules(base, custom);
    const groupKey = (codes: string[]) => [...new Set(codes)].sort().join('|');
    const baseGroups = new Set(general.choice_groups.map(groupKey));
    return {
        banned_codes: rules.banned_codes.filter((code) => !general.banned_codes.includes(code)),
        limited_cards: Object.fromEntries(
            Object.entries(rules.limited_cards).filter(
                ([code, limit]) =>
                    !rules.banned_codes.includes(code) && limit < copyLimit(code, general)
            )
        ),
        unlimited_codes: rules.unlimited_codes.filter(
            (code) => !general.unlimited_codes.includes(code)
        ),
        choice_groups: rules.choice_groups.filter((group) => !baseGroups.has(groupKey(group)))
    };
}
export function copyLimit(code: string, rules: Required<FormatRules>) {
    if (rules.banned_codes.includes(code)) return 0;
    return (
        rules.limited_cards[code] ??
        (rules.unlimited_codes.includes(code) ? rules.main_count : rules.copies)
    );
}
export function adjustCopies(
    entries: Entry[],
    code: string,
    delta: number,
    rules: Required<FormatRules>
) {
    const combined = aggregate(entries);
    const current = combined.find((entry) => entry.code === code)?.qty || 0;
    const next =
        delta > 0
            ? Math.min(current + delta, Math.max(current, copyLimit(code, rules)))
            : Math.max(0, current + delta);
    return aggregate([...combined.filter((entry) => entry.code !== code), { code, qty: next }]);
}
export function orderCatalog(cards: Card[], sets: { code: string; created_at: string }[]) {
    const dates = new Map(sets.map((set) => [set.code, Date.parse(set.created_at) || 0]));
    return [...cards].sort((a, b) => {
        const [setA, numberA] = a.code.split('-');
        const [setB, numberB] = b.code.split('-');
        if (setA === setB) return Number(numberA) - Number(numberB) || a.code.localeCompare(b.code);
        return (
            (dates.get(setB) || 0) - (dates.get(setA) || 0) ||
            setB.localeCompare(setA, undefined, { numeric: true })
        );
    });
}
export function cardEligibility(card: Card, rules: Required<FormatRules>): string {
    if (rules.banned_codes.includes(card.code)) return 'Carta proibida neste formato';
    if (rules.allowed_rarities.length) {
        if (!card.rarity) return 'Raridade não confirmada';
        if (!rules.allowed_rarities.map(normalizeRarity).includes(normalizeRarity(card.rarity)))
            return `Raridade não permitida (${card.rarity})`;
    }
    if (rules.allowed_sets.length && !rules.allowed_sets.includes(card.code.split('-')[0]))
        return 'Coleção não permitida neste formato';
    if (
        rules.allowed_colors.length &&
        (!card.colors.length ||
            card.colors.some((color) => !rules.allowed_colors.map(textKey).includes(color)))
    )
        return 'Cor não permitida neste formato';
    return '';
}
export function validateDeck(
    entries: Entry[],
    cards: Map<string, Card>,
    rules: Required<FormatRules>,
    available: boolean
) {
    const issues: Issue[] = [];
    let main = 0,
        eggs = 0,
        points = 0;
    const quantities = new Map<string, number>();
    for (const item of entries)
        quantities.set(item.code, (quantities.get(item.code) || 0) + item.qty);
    for (const [code, qty] of quantities) {
        points += qty * cardPoints(code, rules);
        const card = cards.get(code);
        if (card?.type === 'digi-egg') eggs += qty;
        else main += qty;
        if (!card?.known)
            issues.push({
                id: `unknown-${code}`,
                title: 'Carta sem metadados',
                message: `${code}: não foi possível confirmar tipo e restrições.`,
                codes: [code]
            });
        const eligibility = card ? cardEligibility(card, rules) : '';
        if (eligibility)
            issues.push({
                id: `eligibility-${code}`,
                title: eligibility,
                message: `${code} permanece no rascunho. Remova a carta ou revise o formato.`,
                codes: [code]
            });
        const limit = copyLimit(code, rules);
        if (!rules.banned_codes.includes(code) && qty > limit)
            issues.push({
                id: `copies-${code}`,
                title: 'Limite de cópias',
                message: `${code} permite ${limit} ${limit === 1 ? 'cópia' : 'cópias'}; seu deck contém ${qty}.`,
                codes: [code]
            });
    }
    if (main !== rules.main_count)
        issues.unshift({
            id: 'main',
            title: `Deck principal: ${main} / ${rules.main_count}`,
            message:
                main < rules.main_count
                    ? `Adicione mais ${rules.main_count - main} cartas.`
                    : `Remova ${main - rules.main_count} cartas.`,
            codes: []
        });
    if (eggs > rules.egg_max)
        issues.push({
            id: 'eggs',
            title: `Digi-Eggs: ${eggs} / ${rules.egg_max}`,
            message: `Remova ${eggs - rules.egg_max} Digi-Eggs.`,
            codes: entries.filter((e) => cards.get(e.code)?.type === 'digi-egg').map((e) => e.code)
        });
    const seen = new Set<string>();
    for (const group of rules.choice_groups) {
        const codes = [...new Set(group.filter((code) => (quantities.get(code) || 0) > 0))].sort();
        const key = codes.join('|');
        if (codes.length > 1 && !seen.has(key)) {
            seen.add(key);
            issues.push({
                id: `choice-${key}`,
                title: 'Combinação de cartas não permitida',
                message: `Use apenas uma destas cartas: ${codes.join(', ')}.`,
                codes
            });
        }
    }
    if (!available)
        issues.unshift({
            id: 'unavailable',
            title: 'Validação indisponível',
            message:
                'Não foi possível carregar todas as regras. Tente novamente antes de considerar o deck válido.',
            codes: []
        });
    if (rules.points_limit !== null && points > rules.points_limit)
        issues.push({
            id: 'points',
            title: `Pontuação: ${points} / ${rules.points_limit}`,
            message: `O deck excede o limite em ${points - rules.points_limit} pontos. Cada cópia soma os pontos da carta.`,
            codes: [...quantities.keys()].filter((code) => cardPoints(code, rules) > 0)
        });
    const raritiesValid =
        !rules.allowed_rarities.length ||
        [...quantities.keys()].every((code) => {
            const card = cards.get(code);
            return (
                card?.known &&
                !!card.rarity &&
                rules.allowed_rarities.map(normalizeRarity).includes(normalizeRarity(card.rarity))
            );
        });
    return { main, eggs, points, raritiesValid, issues, valid: available && issues.length === 0 };
}
export interface CatalogFilters {
    query: string;
    color: string;
    color2: string;
    colors?: string[];
    rarities?: string[];
    type: string;
    level: string;
    cost: string;
    set: string;
    permitted: boolean;
}
export function filterCatalog(
    cards: Card[],
    filters: CatalogFilters,
    rules: Required<FormatRules>
) {
    const query = textKey(filters.query);
    return cards.filter(
        (card) =>
            (!query ||
                textKey(
                    [
                        card.name,
                        card.code,
                        card.payload.main_effect,
                        card.payload.source_effect,
                        card.payload.digi_type
                    ].join(' ')
                ).includes(query)) &&
            (!filters.color || card.colors.includes(filters.color)) &&
            (!filters.color2 || card.colors.includes(filters.color2)) &&
            (!filters.colors?.length ||
                filters.colors.some((color) => card.colors.includes(color))) &&
            (!filters.rarities?.length ||
                filters.rarities.map(normalizeRarity).includes(normalizeRarity(card.rarity))) &&
            (!filters.type || card.type === filters.type) &&
            (!filters.level || String(card.level) === filters.level) &&
            (!filters.cost || String(card.cost) === filters.cost) &&
            (!textKey(filters.set) ||
                textKey(card.code.split('-')[0]).includes(textKey(filters.set))) &&
            (!filters.permitted || !cardEligibility(card, rules))
    );
}
export function aggregate(entries: Entry[]): Entry[] {
    const values = new Map<string, number>();
    for (const entry of entries) values.set(entry.code, (values.get(entry.code) || 0) + entry.qty);
    return [...values].filter(([, qty]) => qty > 0).map(([code, qty]) => ({ code, qty }));
}
export function parseImport(text: string) {
    const entries: Entry[] = [];
    const errors: string[] = [];
    try {
        const json: unknown = JSON.parse(text);
        if (Array.isArray(json)) {
            json.forEach((value, index) => {
                const row: Record<string, unknown> =
                    typeof value === 'object' && value
                        ? (value as Record<string, unknown>)
                        : { code: value, qty: 1 };
                const code = cardCode(row.code || row.card_code);
                const qty = Number(row.qty ?? row.count ?? 1);
                if (code && Number.isInteger(qty) && qty > 0 && qty <= 999)
                    entries.push({ code, qty });
                else errors.push(`Item ${index + 1}: código ou quantidade não reconhecido.`);
            });
            return { entries: aggregate(entries), errors };
        }
    } catch {
        /* Text lists are handled below. */
    }
    text.split(/\r?\n/).forEach((line, index) => {
        const raw = line.trim();
        if (!raw || /^(\/\/|#|decklist$)/i.test(raw)) return;
        const match = raw.match(/([A-Z]{1,4}\d{0,3}-\d{1,4})(?:_[A-Z0-9]+)?/i);
        const code = cardCode(match?.[1]);
        const qty = Number(
            raw.match(/^(\d+)\s*(?:[x×]\s*)?/)?.[1] || raw.match(/\s+[x×]?(\d+)\s*$/)?.[1] || 1
        );
        if (!code || !Number.isInteger(qty) || qty < 1 || qty > 999)
            errors.push(`Linha ${index + 1}: ${raw}`);
        else entries.push({ code, qty });
    });
    return { entries: aggregate(entries), errors };
}
export function groupName(card?: Card) {
    if (card?.type === 'digi-egg') return 'Digi-Eggs';
    if (card?.type === 'digimon') return card.level ? `Nível ${card.level}` : 'Digimon sem nível';
    return card?.type === 'tamer'
        ? 'Tamers'
        : card?.type === 'option'
          ? 'Options'
          : card?.type === 'dual'
            ? 'Dual'
            : 'Outras cartas';
}
export function sortEntries(entries: Entry[], cards: Map<string, Card>, mode: string) {
    if (mode === 'manual') return [...entries];
    const typeRank = (card?: Card) =>
        ({ 'digi-egg': 0, digimon: 1, dual: 2, tamer: 3, option: 4 })[card?.type || ''] ?? 5;
    return [...entries].sort((a, b) => {
        const x = cards.get(a.code),
            y = cards.get(b.code);
        return (
            (mode === 'name'
                ? (x?.name || a.code).localeCompare(y?.name || b.code)
                : mode === 'color'
                  ? (x?.colors[0] || '').localeCompare(y?.colors[0] || '')
                  : mode === 'code'
                    ? a.code.localeCompare(b.code, undefined, { numeric: true })
                    : typeRank(x) - typeRank(y) || (x?.level ?? 99) - (y?.level ?? 99)) ||
            a.code.localeCompare(b.code, undefined, { numeric: true })
        );
    });
}
