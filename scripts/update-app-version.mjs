import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function commitDateVersion(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) throw new Error('Data de commit inválida.');
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    return ['year', 'month', 'day']
        .map((type) => parts.find((part) => part.type === type).value)
        .join('.');
}

export function updateAppVersion(root) {
    const [timestamp, revision] = execFileSync('git', ['log', '-1', '--format=%cI%n%h'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    })
        .trim()
        .split(/\r?\n/);
    if (!/^[a-f0-9]+$/.test(revision || ''))
        throw new Error('Não foi possível obter o último commit.');
    const version = commitDateVersion(timestamp);
    const assetVersion = `${version}-${revision}`;
    const file = path.join(root, 'config/app-version.js');
    const source = fs.readFileSync(file, 'utf8');
    const pattern = /window\.APP_VERSION\s*=\s*['"][^'"]+['"];?/;
    if (!pattern.test(source)) throw new Error('Declaração APP_VERSION não encontrada.');
    const withoutAssetVersion = source.replace(
        /\s*window\.APP_ASSET_VERSION\s*=\s*['"][^'"]+['"];?/,
        ''
    );
    const next = withoutAssetVersion.replace(
        pattern,
        `window.APP_VERSION = '${version}';\n    window.APP_ASSET_VERSION = '${assetVersion}';`
    );
    if (next !== source) fs.writeFileSync(file, next);
    return { version, assetVersion };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = updateAppVersion(path.resolve(import.meta.dirname, '..'));
    console.log(`Versão ${result.version} · ${result.assetVersion}`);
}
