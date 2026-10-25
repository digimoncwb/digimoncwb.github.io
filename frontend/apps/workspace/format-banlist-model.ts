import type { FormatRules } from '../builder/editor-model';

export type BanlistKind = 'banned' | 'limited' | 'pair';
const validCode = (code: string) => /^[A-Z]{1,4}[0-9]{0,3}-[0-9]{1,4}$/.test(code);

export function banlistError(rules: FormatRules): string {
    if (
        rules.banned_codes !== undefined &&
        (!Array.isArray(rules.banned_codes) ||
            rules.banned_codes.some((code) => typeof code !== 'string' || !validCode(code)))
    )
        return 'Confira os códigos das cartas banidas.';
    if (
        rules.limited_cards !== undefined &&
        (!rules.limited_cards ||
            typeof rules.limited_cards !== 'object' ||
            Array.isArray(rules.limited_cards) ||
            Object.entries(rules.limited_cards).some(
                ([code, limit]) =>
                    !validCode(code) || !Number.isInteger(limit) || limit < 0 || limit > 999
            ))
    )
        return 'Os limites por carta devem ser inteiros entre 0 e 999, com códigos válidos.';
    if (
        rules.choice_groups !== undefined &&
        (!Array.isArray(rules.choice_groups) ||
            rules.choice_groups.some(
                (group) =>
                    !Array.isArray(group) ||
                    new Set(group).size < 2 ||
                    group.some((code) => typeof code !== 'string' || !validCode(code))
            ))
    )
        return 'Cada combinação precisa de pelo menos duas cartas diferentes, com códigos válidos.';
    return '';
}

export function addBanlistRule(
    rules: FormatRules,
    kind: BanlistKind,
    first: string,
    second = '',
    limit = 1
): FormatRules {
    const code = first.trim().toUpperCase();
    const other = second.trim().toUpperCase();
    if (!validCode(code) || (kind === 'pair' && !validCode(other)))
        throw new Error('Selecione uma carta ou informe um código válido, como EX14-012.');
    if (kind === 'pair') {
        if (code === other) throw new Error('Escolha duas cartas diferentes para o pair-ban.');
        if (
            (rules.choice_groups || []).some(
                (group) => group.length === 2 && group.includes(code) && group.includes(other)
            )
        )
            throw new Error('Este pair-ban já está cadastrado.');
        return { ...rules, choice_groups: [...(rules.choice_groups || []), [code, other]] };
    }
    if (
        (rules.banned_codes || []).includes(code) ||
        Object.prototype.hasOwnProperty.call(rules.limited_cards || {}, code)
    )
        throw new Error(
            'Esta carta já tem uma restrição individual. Edite ou remova a regra existente.'
        );
    if (kind === 'banned') return { ...rules, banned_codes: [...(rules.banned_codes || []), code] };
    if (!Number.isInteger(limit) || limit < 1 || limit > 999)
        throw new Error('Informe um limite inteiro entre 1 e 999 cópias.');
    return { ...rules, limited_cards: { ...rules.limited_cards, [code]: limit } };
}
