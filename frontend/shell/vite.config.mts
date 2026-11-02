import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, extname } from 'node:path';
import fs from 'node:fs';
import { updateAppVersion } from '../../scripts/update-app-version.mjs';
const project = resolve(import.meta.dirname, '../..');
export default defineConfig(({ command }) => ({
    root: resolve(project, 'frontend/shell'),
    base: command === 'build' ? './' : '/',
    define: {
        __CWB_ASSET_VERSION__: JSON.stringify(updateAppVersion(project).assetVersion)
    },
    plugins: [
        react(),
        {
            name: 'digistats-static-assets',
            transformIndexHtml(html) {
                return command === 'serve'
                    ? html
                          .replace('content="../"', 'content="/project/"')
                          .split('./mfe/')
                          .join('/project/demo-v2/mfe/')
                          .replace('href="../icons/', 'href="/project/icons/')
                    : html;
            },
            configureServer(server) {
                server.middlewares.use('/project/', (req, res, next) => {
                    const relative = decodeURIComponent((req.url || '').split('?')[0]).replace(
                        /^\/+/,
                        ''
                    );
                    const file = resolve(project, relative);
                    if (!file.startsWith(project + '/') && !file.startsWith(project + '\\'))
                        return next();
                    if (relative.split(/[\\/]/).some((segment) => segment.startsWith('.')))
                        return next();
                    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
                    if (relative === 'demo-v2/microfrontends.json') {
                        const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
                        for (const [name, config] of Object.entries(manifest.modules) as [
                            string,
                            { entry: string }
                        ][])
                            config.entry = `/@fs/${resolve(project, `frontend/apps/${name}/entry.tsx`).replace(/\\/g, '/')}`;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(manifest));
                        return;
                    }
                    const mime: Record<string, string> = {
                        '.js': 'text/javascript',
                        '.mjs': 'text/javascript',
                        '.json': 'application/json',
                        '.css': 'text/css',
                        '.svg': 'image/svg+xml',
                        '.png': 'image/png',
                        '.webp': 'image/webp',
                        '.woff2': 'font/woff2',
                        '.html': 'text/html'
                    };
                    res.setHeader(
                        'Content-Type',
                        mime[extname(file)] || 'application/octet-stream'
                    );
                    fs.createReadStream(file).pipe(res);
                });
            }
        }
    ],
    server: { host: '127.0.0.1', port: 5173, fs: { allow: [project] } },
    build: {
        outDir: resolve(project, 'demo-v2/app-shell'),
        emptyOutDir: true,
        target: ['es2020', 'safari17.4'],
        rolldownOptions: {
            external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']
        }
    }
}));
