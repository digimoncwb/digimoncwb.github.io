import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import './generate-react-forms.mjs';
const root = path.resolve(import.meta.dirname, '..');
const assetVersion = fs
    .readFileSync(path.join(root, 'config/app-version.js'), 'utf8')
    .match(/2026\.\d+\.\d+\.\d+/)?.[0];
if (!assetVersion) throw Error('Missing asset release version');
const target = process.argv.find((arg) => arg.startsWith('--app='))?.split('=')[1];
const names = ['dashboard', 'workspace', 'studio', 'builder'];
if (target && !['shell', 'shared', ...names].includes(target))
    throw Error('Micro-frontend desconhecido.');
const external = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'];
function safeOutput(name) {
    const output = path.resolve(root, 'demo-v2/mfe', name);
    if (!output.startsWith(path.join(root, 'demo-v2/mfe') + path.sep))
        throw Error('Invalid build path');
    return output;
}
async function library(name, entry) {
    await build({
        configFile: false,
        root,
        plugins: [react()],
        base: './',
        define: { 'process.env.NODE_ENV': '"production"' },
        build: {
            target: ['es2020', 'safari17.4'],
            outDir: safeOutput(name),
            emptyOutDir: true,
            minify: true,
            lib: {
                entry,
                formats: ['es'],
                fileName: (format, key) => (name === 'shared' ? `${key}.js` : 'remote.js')
            },
            rolldownOptions: name === 'shared' ? {} : { external }
        }
    });
}
if (!target || target === 'shared')
    await library('shared', {
        react: path.join(root, 'frontend/vendor/react.ts'),
        jsx: path.join(root, 'frontend/vendor/jsx.ts'),
        dom: path.join(root, 'frontend/vendor/dom.ts')
    });
for (const name of names)
    if (!target || target === name)
        await library(name, path.join(root, `frontend/apps/${name}/entry.tsx`));
// Older domain CSS is isolated; it never styles the shell or other micro-frontends.
const css = [
    'styles.css',
    'styles/components/utilities.css',
    'styles/components/states.css',
    'styles/pages/players.css'
]
    .map((file) =>
        fs
            .readFileSync(path.join(root, file), 'utf8')
            .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (match, quote, url) =>
                /^(data:|https?:|\/|#)/.test(url)
                    ? match
                    : `url(${quote}../../../${path.posix.normalize(path.posix.join(path.posix.dirname(file), url))}${quote})`
            )
    )
    .join('\n');
fs.mkdirSync(path.join(root, 'demo-v2/mfe/workspace'), { recursive: true });
fs.writeFileSync(
    path.join(root, 'demo-v2/mfe/workspace/legacy-scoped.css'),
    `@scope (#v2Tools) {\n${css}\n}`
);
if (!target || target === 'shell') {
    await build({ configFile: path.join(root, 'frontend/shell/vite.config.mts') });
    const built = fs
        .readFileSync(path.join(root, 'demo-v2/app-shell/index.html'), 'utf8')
        .replaceAll('./assets/', './app-shell/assets/')
        .replace(/(\.\/mfe\/shared\/(?:react|jsx|dom)\.js)/g, `$1?v=${assetVersion}`);
    fs.writeFileSync(path.join(root, 'demo-v2/index.html'), built);
    fs.writeFileSync(
        path.join(root, 'index.html'),
        built
            .replaceAll('"../', '"./')
            .replaceAll('./app-shell/', './demo-v2/app-shell/')
            .replaceAll('./mfe/', './demo-v2/mfe/')
    );
    for (const file of ['tools.html', 'deckbuilder.html'])
        fs.writeFileSync(
            path.join(root, 'demo-v2', file),
            `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DIGIMON CWB</title></head><body><script>const params=new URLSearchParams(location.search);const view=params.get('view')||'tournaments';const name=${JSON.stringify(file)}==='deckbuilder.html'?'builder':({tournaments:'manage',statistics:'statistics',decks:'decks',players:'players',admin:'admin'}[view]||'manage');params.set('__cwb_release','2026.10.05.6');location.replace(new URL('../?'+params.toString()+'#'+name,location.href));</script></body></html>`
        );
}
const version = Date.now().toString(36);
const manifest = {
    apiVersion: 1,
    version,
    modules: Object.fromEntries(
        names.map((name) => [
            name,
            {
                entry: `demo-v2/mfe/${name}/remote.js?v=${version}`,
                routes: {
                    dashboard: ['overview', 'meta'],
                    workspace: ['tournaments', 'manage', 'decks', 'players', 'admin', 'statistics'],
                    studio: ['posts'],
                    builder: ['builder']
                }[name],
                styles:
                    name === 'workspace' || name === 'builder'
                        ? [
                              'demo-v2/mfe/workspace/legacy-scoped.css',
                              'shared/workspace/tools.css',
                              'shared/workspace/native.css',
                              ...(name === 'workspace'
                                  ? ['demo-v2/mfe/workspace/digimon-dashboard.css']
                                  : ['demo-v2/mfe/builder/digimon-dashboard.css'])
                          ]
                        : name === 'dashboard'
                          ? ['demo-v2/mfe/dashboard/digimon-dashboard.css']
                          : name === 'studio'
                            ? ['demo-v2/mfe/studio/digimon-dashboard.css']
                            : []
            }
        ])
    )
};
fs.writeFileSync(path.join(root, 'demo-v2/microfrontends.json'), JSON.stringify(manifest, null, 2));
