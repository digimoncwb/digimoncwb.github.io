import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.tmp', 'site');
const files = ['index.html', 'tools.html', 'offline.html', 'styles.css', 'sw.js', 'manifest.json'];
const directories = [
    'demo-v2',
    'shared',
    'config',
    'icons',
    'styles',
    'admin',
    'decks',
    'players',
    'torneios',
    'post-preview',
    'feedback',
    'legal'
];
const extensions = new Set([
    '.html',
    '.js',
    '.mjs',
    '.css',
    '.json',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf'
]);

// Fail before preparing a package when the production build is missing.
const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'demo-v2/microfrontends.json'), 'utf8')
);
const required = [
    'demo-v2/app-shell/index.html',
    'demo-v2/mfe/shared/react.js',
    'demo-v2/mfe/shared/jsx.js',
    'demo-v2/mfe/shared/dom.js',
    ...Object.values(manifest.modules).flatMap((module) => [
        module.entry.split('?')[0],
        ...(module.styles || [])
    ])
];
for (const file of required) await fs.access(path.join(root, file));

await fs.mkdir(output, { recursive: true });
for (const file of files) await fs.copyFile(path.join(root, file), path.join(output, file));
for (const directory of directories) {
    await fs.cp(path.join(root, directory), path.join(output, directory), {
        recursive: true,
        filter: async (source) => {
            if (path.basename(source).startsWith('.')) return false;
            const stat = await fs.lstat(source);
            if (stat.isSymbolicLink()) return false;
            return stat.isDirectory() || extensions.has(path.extname(source).toLowerCase());
        }
    });
}
await fs.writeFile(path.join(output, '.nojekyll'), '');
for (const file of required) await fs.access(path.join(output, file));
console.log('Site package ready: .tmp/site (static assets and production bundles).');
