const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDigilabClipboardText,
    getMissingMemberNames,
    normalizeDigilabExportRows
} = require('../config/digilab-export.js');

test('community paste emits exactly one hash and keeps zero points and leading zeroes', () => {
    assert.equal(
        buildDigilabClipboardText(
            [
                {
                    placement: 2,
                    playerName: '  Player Two ',
                    memberNumber: '##0098765432',
                    points: 0
                },
                { placement: 1, playerName: 'PlayerOne', memberNumber: '0012345678', points: 9 }
            ],
            { hashPrefix: true }
        ),
        '1 PlayerOne #0012345678 9\n2 Player Two #0098765432 0'
    );
});

test('DigiLab clipboard text sorts rows and preserves Bandai ID leading zeroes', () => {
    const text = buildDigilabClipboardText([
        { placement: 2, playerName: 'Outro Player', memberNumber: '0000238400', points: 7 },
        { placement: 1, playerName: 'Player Name', memberNumber: '0000238403', points: 9 }
    ]);

    assert.equal(text, '1 Player Name 0000238403 9\n2 Outro Player 0000238400 7');
});

test('DigiLab clipboard text normalizes whitespace and removes a legacy hash prefix', () => {
    assert.equal(
        buildDigilabClipboardText([
            { placement: 1, playerName: '  Nome   Com  Espaços ', memberNumber: '#0001', points: 0 }
        ]),
        '1 Nome Com Espaços 0001 0'
    );
});

test('DigiLab clipboard text tolerates optional Bandai ID and points', () => {
    assert.equal(
        buildDigilabClipboardText([
            { placement: 1, playerName: 'Sem dados', memberNumber: '', points: '' }
        ]),
        '1 Sem dados'
    );
});

test('DigiLab copy reports missing member numbers without blocking rows', () => {
    assert.deepEqual(
        getMissingMemberNames([
            { placement: 1, playerName: 'Com ID', memberNumber: '0001' },
            { placement: 2, playerName: 'Sem ID', memberNumber: '' }
        ]),
        ['Sem ID']
    );
});

test('DigiLab copy prefers digilab_name and falls back to the local name', () => {
    assert.deepEqual(
        normalizeDigilabExportRows([
            {
                placement: 1,
                match_points: 9,
                player: { name: 'Nome local', digilab_name: 'Nome DigiLab', bandai_id: '0001' }
            },
            {
                placement: 2,
                match_points: null,
                player: { name: 'Fallback local', digilab_name: '', bandai_id: null }
            }
        ]),
        [
            {
                placement: 1,
                playerName: 'Nome DigiLab',
                memberNumber: '0001',
                points: 9
            },
            {
                placement: 2,
                playerName: 'Fallback local',
                memberNumber: '',
                points: ''
            }
        ]
    );
});
