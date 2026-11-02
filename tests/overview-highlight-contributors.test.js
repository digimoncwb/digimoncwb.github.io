const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

test('highlight cards list every deck participant with counts and attribute titles only to eligible winners', async () => {
    const { transformWithOxc } = await import('vite');
    const modelSource = stripTypeScriptTypes(
        readFileSync('frontend/apps/dashboard/metagame-model.ts', 'utf8')
    )
        .replace(/^import.*$/gm, '')
        .replace(/export /g, '');
    const analyzeMeta = vm.runInNewContext(modelSource + '\nanalyzeMeta');
    const events = ['1', '2', '3', '4'].map((id) => ({
        id,
        players: 2,
        results: [],
        title: 'Semanal'
    }));
    const records = [];
    for (const [id, winner] of [
        ['1', 'Ana'],
        ['2', 'Bruno'],
        ['3', 'Ana'],
        ['4', 'Ana']
    ]) {
        records.push({
            id: `${id}-1`,
            tournament_id: id,
            placement: 1,
            deck_id: 'deck',
            player_id: winner,
            player: { name: winner },
            deck: { name: 'Deck A' }
        });
        if (id !== '4')
            records.push({
                id: `${id}-2`,
                tournament_id: id,
                placement: 2,
                deck_id: 'other',
                player_id: 'Carlos',
                player: { name: 'Carlos' },
                deck: { name: 'Deck B' }
            });
    }
    for (const id of ['5', '6']) {
        events.push({ id, players: 8, results: [], title: 'Semanal' });
        for (let placement = 1; placement <= 8; placement++) {
            const name =
                (id === '5' && placement === 1) || (id === '6' && placement === 5)
                    ? 'Diana'
                    : id === '5' && placement === 2
                      ? 'Eva'
                      : `Player ${id}-${placement}`;
            records.push({
                id: `${id}-${placement}`,
                tournament_id: id,
                placement,
                player_id: name,
                player: { name },
                deck_id: ['Diana', 'Eva'].includes(name)
                    ? 'conversion'
                    : `filler-${id}-${placement}`,
                deck: {
                    name: ['Diana', 'Eva'].includes(name)
                        ? 'Conversion deck'
                        : `Filler ${id}-${placement}`
                }
            });
        }
    }
    records.push(records[0]); // A duplicate page row must not inflate a player's count.
    const source = readFileSync('frontend/apps/dashboard/OverviewHighlights.tsx', 'utf8');
    const { code } = await transformWithOxc(
        source
            .slice(source.indexOf('export function OverviewHighlights'))
            .replace('export function', 'function'),
        'OverviewHighlights.tsx'
    );
    const Component = vm.runInNewContext(code + '\nOverviewHighlights', {
        require,
        analyzeMeta,
        useSiteAuth: () => ({ user: null, isAdmin: false }),
        canAccessRoute: () => false,
        useData: () => ({ data: { events, formats: [] }, updatedAt: 1 }),
        useMetaResults: () => ({ records, loading: false, error: null }),
        currentFormat: () => '',
        overviewFourWeeks: () => ({ events }),
        Portrait: () => null,
        Loader: () => null
    });
    const tree = Component({ context: { href: () => '#', navigate: () => {} } });
    const children = (node) => (Array.isArray(node) ? node : node?.props?.children);
    const find = (node, predicate) =>
        !node
            ? []
            : Array.isArray(node)
              ? node.flatMap((child) => find(child, predicate))
              : typeof node === 'object'
                ? [...(predicate(node) ? [node] : []), ...find(children(node), predicate)]
                : [];
    const text = (node) =>
        !node
            ? ''
            : Array.isArray(node)
              ? node.map(text).join('')
              : typeof node === 'object'
                ? text(children(node))
                : String(node);
    const columns = find(tree, (node) => node.type === 'article');
    const participants = find(columns[0], (node) => node.type === 'ul')[0];
    assert.deepEqual(find(participants, (node) => node.type === 'li').map(text), [
        'Anax3',
        'Brunox1'
    ]);
    const champions = find(columns[1], (node) => node.type === 'ul')[0];
    assert.deepEqual(find(champions, (node) => node.type === 'li').map(text), ['Anax2', 'Brunox1']);
    const conversion = find(columns[2], (node) => node.type === 'ul')[0];
    assert.deepEqual(find(conversion, (node) => node.type === 'li').map(text), [
        'Diana1/2',
        'Eva1/1'
    ]);
});
