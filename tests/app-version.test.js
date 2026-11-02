const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('footer version uses the commit date in Brasilia, including UTC day changes and future years', async () => {
    const { commitDateVersion } = await import('../scripts/update-app-version.mjs');
    assert.equal(commitDateVersion('2026-11-02T02:00:00Z'), '2026.11.01');
    assert.equal(commitDateVersion('2026-11-02T03:00:00Z'), '2026.11.02');
    assert.equal(commitDateVersion('2027-01-01T00:00:00-03:00'), '2027.01.01');
    assert.throws(() => commitDateVersion('invalid'));
});

test('build version follows HEAD rather than build time and separates same-day commit cache keys', async () => {
    const { updateAppVersion } = await import('../scripts/update-app-version.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'digimon-version-'));
    try {
        fs.mkdirSync(path.join(root, 'config'));
        const file = path.join(root, 'config/app-version.js');
        fs.writeFileSync(
            file,
            "window.APP_VERSION = '2026.10.26.3';\nwindow.otherSetting = true;\n"
        );
        const git = (...args) =>
            execFileSync('git', args, {
                cwd: root,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    GIT_AUTHOR_DATE: '2026-11-02T02:00:00Z',
                    GIT_COMMITTER_DATE: '2026-11-02T02:00:00Z'
                }
            });
        git('init', '--quiet');
        const commit = () =>
            git(
                '-c',
                'user.name=Version Test',
                '-c',
                'user.email=version@example.test',
                '-c',
                'commit.gpgsign=false',
                '-c',
                `core.hooksPath=${path.join(root, 'no-hooks')}`,
                'commit',
                '--quiet',
                '--allow-empty',
                '-m',
                'Version test'
            );
        commit();
        const first = updateAppVersion(root);
        assert.equal(first.version, '2026.11.01');
        assert.match(first.assetVersion, /^2026\.11\.01-[a-f0-9]+$/);
        const written = fs.readFileSync(file, 'utf8');
        assert.ok(written.includes('window.otherSetting = true;'));
        assert.deepEqual(updateAppVersion(root), first);
        assert.equal(
            fs.readFileSync(file, 'utf8'),
            written,
            'Rebuilding the same commit is idempotent'
        );
        commit();
        const second = updateAppVersion(root);
        assert.equal(second.version, first.version);
        assert.notEqual(second.assetVersion, first.assetVersion);
        assert.equal(
            (fs.readFileSync(file, 'utf8').match(/window.APP_ASSET_VERSION/g) || []).length,
            1
        );
    } finally {
        // root is a freshly created temporary fixture, never the user's repository.
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('digimon-version-'));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
