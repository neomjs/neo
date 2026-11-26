import {spawn}                                                               from 'node:child_process';
import fs                                                                    from 'node:fs';
import http                                                                  from 'node:http';
import net                                                                   from 'node:net';
import path                                                                  from 'node:path';
import {pipeline}                                                            from 'node:stream';
import {Command}                                                             from 'commander';
import {getEngineReleaseNotesRoot}                                           from './contentRoot.mjs';
import {createDevelopmentThemeFreshness}                                     from './developmentThemeFreshness.mjs';
import isEntryModule                                                         from './isEntryModule.mjs';
import {isManagedRoutePath, normalizeRoutePathname, STATIC_ASSET_EXTENSIONS} from '../../src/util/Route.mjs';

/**
 * @module buildScripts/util/fileServer
 * @summary The development server behind `npm run server-start`: it serves the working directory as
 * files, the way dev mode loads them, with no bundler in between.
 *
 * `.mjs` and `.wasm` go out with their MIME types, ranges are honored, a directory answers with its
 * `index.html` or else a listing, and the engine's release notes are served at their own dot-path
 * while every other dot-path stays closed (`.git`, `.env`). The development-theme freshness check
 * warns when served CSS trails its sources.
 * Pathname apps opt into shell fallback through their on-disk neo-config.json. An optional
 * package.json neo.spaRoot mounts an app at '/' in either router mode (deep paths stay pathname-only),
 * with --spa-root and --no-spa-root overriding it and a startup warning when its index.html lacks <base href>.
 * Static files and missing asset requests keep their normal file-server behavior; HTML is never rewritten.
 *
 * It listens on every interface, so a phone on the LAN reaches it by IP, and answers only a `Host`
 * that is an IP literal, `localhost` or a `*.localhost` name, as the webpack dev server's
 * `allowedHosts: 'auto'` did: a page on any other name could rebind that name to this machine.
 *
 * Port: `--port`, else `PORT` (how an agent seat's launcher tells the server its port), and a taken
 * one fails loudly. With neither, 8080 and up, as the webpack dev server did.
 */

export const DEFAULT_PORT = 8080;

const MIME_TYPES = {
    '.css'  : 'text/css; charset=utf-8',
    '.gif'  : 'image/gif',
    '.glb'  : 'model/gltf-binary',
    '.html' : 'text/html; charset=utf-8',
    '.ico'  : 'image/x-icon',
    '.jpeg' : 'image/jpeg',
    '.jpg'  : 'image/jpeg',
    '.js'   : 'text/javascript; charset=utf-8',
    '.json' : 'application/json; charset=utf-8',
    '.map'  : 'application/json; charset=utf-8',
    '.md'   : 'text/markdown; charset=utf-8',
    '.mjs'  : 'text/javascript; charset=utf-8',
    '.mp3'  : 'audio/mpeg',
    '.mp4'  : 'video/mp4',
    '.otf'  : 'font/otf',
    '.pdf'  : 'application/pdf',
    '.png'  : 'image/png',
    '.scss' : 'text/x-scss; charset=utf-8',
    '.svg'  : 'image/svg+xml',
    '.ttf'  : 'font/ttf',
    '.txt'  : 'text/plain; charset=utf-8',
    '.wasm' : 'application/wasm',
    '.webm' : 'video/webm',
    '.webp' : 'image/webp',
    '.woff' : 'font/woff',
    '.woff2': 'font/woff2',
    '.xml'  : 'application/xml; charset=utf-8',
    '.yaml' : 'text/yaml; charset=utf-8',
    '.yml'  : 'text/yaml; charset=utf-8'
};

/**
 * @summary The `Content-Type` a file is served with; `application/octet-stream` when its extension is unknown.
 * @param {String} file
 * @returns {String}
 */
export const contentType = file => MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * @summary Whether a `Host` header names this machine: an IP literal, `localhost` or a `*.localhost` name.
 * @param {String} [host] The header, with or without its port; an IPv6 literal in brackets.
 * @returns {Boolean}
 */
export function isAllowedHost(host = '') {
    const hostname = (host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d*$/, '')).toLowerCase();

    return hostname === 'localhost' || hostname.endsWith('.localhost') || net.isIP(hostname) !== 0
}

/**
 * @summary Escapes text for HTML element content and attribute values.
 * @param {String} text
 * @returns {String}
 */
const escapeHtml = text => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/**
 * @summary Returns whether `html` declares an uncommented `<base ... href=>` tag without mutating or sanitizing HTML.
 * @param {String} html
 * @returns {Boolean}
 */
function hasBaseHref(html) {
    let cursor = 0;

    while (cursor < html.length) {
        const comment = html.indexOf('<!--', cursor),
              slice   = html.slice(cursor, comment === -1 ? html.length : comment);

        if (/<base\b[^>]*\bhref\s*=/i.test(slice)) return true;
        if (comment === -1) return false;

        const end = html.indexOf('-->', comment + 4);
        if (end === -1) return false;

        cursor = end + 3
    }

    return false
}

/**
 * @summary Ends a response with a status and a body.
 * @param {http.ServerResponse} response
 * @param {Number} statusCode
 * @param {String} body
 * @param {String} [contentType]
 */
function send(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', contentType);
    response.end(body)
}

/**
 * @summary Whether an `If-None-Match` value names a tag. The comparison is weak (RFC 9110 §8.8.3.2):
 * `W/` counts on neither side, and `*` names any file that exists.
 * @param {String} header
 * @param {String} etag
 * @returns {Boolean}
 */
const matchesTag = (header, etag) => header.trim() === '*'
    || (header.match(/(?:W\/)?"[^"]*"/g) ?? []).some(tag => tag.replace(/^W\//, '') === etag.replace(/^W\//, ''));

/**
 * @summary Streams a file, answering conditional and single-range requests. Every response
 * revalidates (`no-cache`), so an edited file is never served stale.
 *
 * `If-None-Match` decides a revalidation alone, and `If-Modified-Since` counts only without it
 * (RFC 9110 §13.2.2). A range under `If-Range` answers the whole current file: a size and a time
 * can repeat across revisions, so both validators are weak, and only a strong one may resume
 * a download without joining two revisions (§13.1.5).
 * A client that leaves mid-transfer closes the file with its response.
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {String} file Absolute path.
 * @param {fs.Stats} stat
 */
function sendFile(request, response, file, stat) {
    const {'if-modified-since': since, 'if-none-match': tags, 'if-range': ifRange} = request.headers;

    const etag     = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
          modified = Math.floor(stat.mtimeMs / 1000) * 1000, // the precision of Last-Modified, and of a date sent back
          range    = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range?.trim() ?? '');

    let start = 0,
        end   = stat.size - 1;

    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', contentType(file));
    response.setHeader('ETag', etag);
    response.setHeader('Last-Modified', stat.mtime.toUTCString());

    if (tags ? matchesTag(tags, etag) : modified <= Date.parse(since)) {
        response.statusCode = 304;
        return response.end()
    }

    // A malformed or multi-part range is ignored: the whole file is a valid answer (RFC 9110 §14.2)
    if (!ifRange && range && (range[1] || range[2])) {
        if (range[1]) {
            start = Number(range[1]);
            end   = range[2] ? Math.min(Number(range[2]), end) : end
        } else {
            start = Math.max(stat.size - Number(range[2]), 0)
        }

        if (start > end) {
            response.setHeader('Content-Range', `bytes */${stat.size}`);
            return send(response, 416, 'Range Not Satisfiable')
        }

        response.statusCode = 206;
        response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    }

    response.setHeader('Content-Length', end - start + 1);

    if (request.method === 'HEAD' || stat.size === 0) return response.end();

    // An error or a departed client destroys both streams; nothing is left to answer.
    pipeline(fs.createReadStream(file, {start, end}), response, () => {})
}

/**
 * @summary Answers a directory without an `index.html` with a plain listing of links. Dot-entries
 * are left out, as they are never served.
 * @param {http.ServerResponse} response
 * @param {String} directory Absolute path.
 * @param {String} pathname The directory's URL path, with its trailing slash.
 */
async function sendListing(response, directory, pathname) {
    const title   = escapeHtml(decodeURIComponent(pathname)),
          entries = (await fs.promises.readdir(directory, {withFileTypes: true}))
              .filter(entry => !entry.name.startsWith('.'))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(entry => {
                  const slash = entry.isDirectory() ? '/' : '';
                  return `<li><a href="${encodeURIComponent(entry.name)}${slash}">${escapeHtml(entry.name)}${slash}</a></li>`
              });

    if (pathname !== '/') entries.unshift('<li><a href="../">../</a></li>');

    response.setHeader('Cache-Control', 'no-cache');
    send(response, 200, `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><ul>${entries.join('')}</ul>`, 'text/html; charset=utf-8')
}

/**
 * @summary Creates the file server for a root. It is not listening yet: see {@link listen}.
 * @param {Object} [options]
 * @param {String} [options.root] The served directory.
 * @param {String|Boolean} [options.spaRoot] Overrides package.json neo.spaRoot; false disables the root mount.
 * @param {Object} [options.freshness] The development-theme check, `{onListening, onRequest}`.
 * @returns {http.Server}
 */
export function createFileServer({root = process.cwd(), freshness = createDevelopmentThemeFreshness({root}), spaRoot} = {}) {
    root = path.resolve(root);
    if (spaRoot === undefined) {
        const manifest = path.join(root, 'package.json');
        if (fs.existsSync(manifest)) spaRoot = JSON.parse(fs.readFileSync(manifest, 'utf8')).neo?.spaRoot
    }
    if (spaRoot !== undefined && spaRoot !== false && (typeof spaRoot !== 'string' || !spaRoot ||
        path.isAbsolute(spaRoot) || spaRoot.includes('\\') || spaRoot.split('/').some(part => part.startsWith('.')))) {
        throw new Error('neo.spaRoot must be a directory relative to the served root')
    }
    const cleanSpaRoot = spaRoot ? spaRoot.replace(/\/+$/, '') : null,
          rootMount    = cleanSpaRoot ? '/' + cleanSpaRoot : null,
          rootIndex    = cleanSpaRoot ? path.join(root, cleanSpaRoot, 'index.html') : null,
          configCache  = new Map();
    if (rootIndex && !fs.statSync(rootIndex).isFile()) {
        throw new Error('neo.spaRoot must contain index.html')
    }
    const releaseNotesRoot = getEngineReleaseNotesRoot(root),
          releaseNotesPath = fs.existsSync(releaseNotesRoot) ? '/' + path.relative(root, releaseNotesRoot).split(path.sep).join('/') : null;

    /**
     * @summary Maps a decoded URL path to a file path, or `null` when the path is not servable: it
     * crosses a dot-segment other than the release notes, or it leaves its base directory.
     * @param {String} decoded
     * @returns {String|null}
     */
    function resolveFile(decoded) {
        const notes = releaseNotesPath && (decoded === releaseNotesPath || decoded.startsWith(releaseNotesPath + '/')),
              base  = notes ? releaseNotesRoot : root,
              parts = (notes ? decoded.slice(releaseNotesPath.length) : decoded).split('/').filter(Boolean);

        if (decoded.includes('\0') || parts.some(part => part.startsWith('.'))) return null;

        const file = path.join(base, ...parts);

        return file === base || file.startsWith(base + path.sep) ? file : null
    }

    /**
     * @summary Reads a candidate mount's config only when its mtime or size changes. Discovery follows the
     * requested path's ancestors, so unrelated apps and installed packages are never recursively scanned.
     * @param {String} directory
     * @returns {Promise<Object|null>}
     */
    async function readConfig(directory) {
        const file = path.join(directory, 'neo-config.json');
        let stat;
        try {stat = await fs.promises.stat(file)} catch (error) {
            if (['ENOENT', 'ENOTDIR'].includes(error.code)) {configCache.delete(file); return null}
            throw error
        }
        const cached = configCache.get(file);
        if (cached?.mtime === stat.mtimeMs && cached.size === stat.size) return cached.value;
        const value = JSON.parse(await fs.promises.readFile(file, 'utf8'));
        configCache.set(file, {mtime: stat.mtimeMs, size: stat.size, value});
        return value
    }

    /**
     * @summary Finds the nearest on-disk app boundary, including hash apps so the root SPA cannot capture them.
     * A hash app directory owns its trailing-slash shell and sub-paths (`/docs/`, `/examples/tree/`, `/docs/...`),
     * while a slashless route (`/docs`, `/examples/tree`, `/examples/dialogs`) yields to `rootMount` only when
     * `rootClaimsPath` is true so non-catalog demos (`/examples/dialog`) keep their native `301` directory redirect.
     * @param {String} decoded
     * @param {Boolean} rootClaimsPath
     * @returns {Promise<Object|null>}
     */
    async function findMount(decoded, rootClaimsPath) {
        let mount = decoded.replace(/\/+$/, '') || '/';
        while (true) {
            const directory = resolveFile(mount), config = directory && await readConfig(directory);
            if (config && (config.routerMode === 'pathname' || !rootClaimsPath || mount === '/' || decoded.startsWith(mount + '/'))) {
                return {mount: mount === '/' ? '' : mount, directory, config}
            }
            if (mount === '/') return null;
            mount = path.posix.dirname(mount)
        }
    }

    /**
     * @param {http.IncomingMessage} request
     * @param {http.ServerResponse} response
     */
    async function serve(request, response) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.setHeader('Allow', 'GET, HEAD');
            return send(response, 405, 'Method Not Allowed')
        }

        if (!isAllowedHost(request.headers.host)) {
            return send(response, 403, 'Forbidden: this server answers an IP, localhost or *.localhost')
        }

        const url = new URL(request.url, 'http://localhost');

        let file = null, decoded,
            stat;

        freshness.onRequest(url.pathname);

        try {
            decoded = decodeURIComponent(url.pathname);
            file = resolveFile(decoded);
            stat = file && await fs.promises.stat(file)
        } catch {}

        if (!file) return send(response, 404, 'Not Found');

        const rootAlias = rootMount && [rootMount, rootMount + '/', rootMount + '/index.html'].includes(decoded),
              redirect  = pathname => {
                  response.setHeader('Location', pathname + url.search);
                  return send(response, 307, 'Temporary Redirect')
              };

        // Physical files win, except the root app's own shell alias, which must canonicalize to '/'.
        if (!rootAlias && stat?.isFile()) return sendFile(request, response, file, stat);
        if (!rootAlias && STATIC_ASSET_EXTENSIONS.has(path.posix.extname(decoded).slice(1).toLowerCase())) {
            return send(response, 404, 'Not Found')
        }
        if (rootAlias) return redirect('/');

        const rootDirectory  = rootMount ? resolveFile(rootMount) : null,
              rootConfig     = rootDirectory ? await readConfig(rootDirectory) : null,
              rootClaimsPath = Boolean(rootConfig?.routerMode === 'pathname' && isManagedRoutePath(url.pathname, rootConfig.routerIgnorePaths, ''));

        let app = await findMount(decoded, rootClaimsPath);
        if (!app && rootClaimsPath) {
            app = {mount: '', directory: rootDirectory, config: rootConfig}
        }
        if (app?.config.routerMode === 'pathname' && isManagedRoutePath(url.pathname, app.config.routerIgnorePaths, app.mount)) {
            const route = normalizeRoutePathname(url.pathname, app.mount), canonical = app.mount + (route === '/' && app.mount ? '' : route);
            if (canonical !== url.pathname) return redirect(canonical);
            const index = path.join(app.directory, 'index.html'), indexStat = await fs.promises.stat(index).catch(() => null);
            return indexStat?.isFile() ? sendFile(request, response, index, indexStat) : send(response, 404, 'Not Found')
        }
        if (rootDirectory && decoded === '/' && rootConfig?.routerMode !== 'pathname') {
            const index = path.join(rootDirectory, 'index.html'), indexStat = await fs.promises.stat(index).catch(() => null);
            return indexStat?.isFile() ? sendFile(request, response, index, indexStat) : send(response, 404, 'Not Found')
        }

        if (stat?.isDirectory()) {
            if (!url.pathname.endsWith('/')) {
                response.setHeader('Location', url.pathname + '/' + url.search);
                return send(response, 301, 'Moved Permanently')
            }

            const index     = path.join(file, 'index.html'),
                  indexStat = await fs.promises.stat(index).catch(() => null);

            return indexStat?.isFile() ? sendFile(request, response, index, indexStat) : sendListing(response, file, url.pathname)
        }

        return stat?.isFile() ? sendFile(request, response, file, stat) : send(response, 404, 'Not Found')
    }

    const server = http.createServer((request, response) => {
        serve(request, response).catch(() => response.headersSent ? response.destroy() : send(response, 500, 'Internal Server Error'))
    });

    let baseWarned = false;

    server.on('listening', () => {
        freshness.onListening();
        if (rootMount) {
            console.log(`[file-server] spaRoot ${spaRoot} mounted at /`);
            if (!baseWarned) {
                baseWarned = true;
                try {
                    if (!hasBaseHref(fs.readFileSync(rootIndex, 'utf8'))) {
                        console.warn(
                            `[file-server] WARNING: ${cleanSpaRoot}/index.html has no <base href>; ` +
                            `add <base href="${rootMount}/"> so ./neo-config.json and relative assets resolve at /`
                        )
                    }
                } catch {}
            }
        }
    });

    return server
}

/**
 * @summary Starts listening and resolves the bound port. A taken port rejects when `strict`;
 * otherwise the next one is tried.
 * @param {http.Server} server
 * @param {Object} [options]
 * @param {Number} [options.port]
 * @param {Boolean} [options.strict] Whether the port was asked for explicitly.
 * @returns {Promise<Number>}
 */
export function listen(server, {port = DEFAULT_PORT, strict = false} = {}) {
    return new Promise((resolve, reject) => {
        const onError = error => {
            if (error.code === 'EADDRINUSE' && !strict && port < 65535) {
                server.listen(++port)
            } else {
                server.off('listening', onListening);
                reject(error)
            }
        };

        const onListening = () => {
            server.off('error', onError);
            resolve(server.address().port)
        };

        server.on('error', onError);
        server.once('listening', onListening);
        server.listen(port)
    })
}

/**
 * @summary Opens the default browser on a URL, without waiting for it.
 * @param {String} url
 * @param {Object} [options]
 * @param {String} [options.platform]
 * @param {Function} [options.run] `child_process.spawn` or a stand-in.
 */
export function openBrowser(url, {platform = process.platform, run = spawn} = {}) {
    const [command, args, options = {}] =
        platform === 'darwin' ? ['open', [url]] :
        platform === 'win32'  ? ['cmd', ['/c', 'start', '""', `"${url}"`], {windowsVerbatimArguments: true}] :
                                ['xdg-open', [url]];

    const child = run(command, args, {detached: true, stdio: 'ignore', ...options});

    child.on('error', () => console.warn(`[file-server] open ${url} in a browser`));
    child.unref()
}

/**
 * @summary Reads the command line: `--port <n>`, `--open [path]` and `--no-open`, the last flag
 * winning, so `npm run server-start -- --no-open` overrides the script's own `--open`.
 * @param {String[]} [argv]
 * @param {Object} [env]
 * @returns {{open: (Boolean|String|undefined), port: Number, strict: Boolean, spaRoot?: String|Boolean}}
 */
export function parseOptions(argv = process.argv, env = process.env) {
    const options = new Command()
              .option('-p, --port <port>', 'the port to listen on; a taken port fails')
              .option('-o, --open [path]', 'open the browser on a path under the served root')
              .option('--no-open', 'do not open the browser')
              .option('--spa-root <dir>', 'mount an app directory at / instead of listing the root')
              .option('--no-spa-root', 'disable the package.json root app mount')
              .parse(argv)
              .opts(),
          explicit = options.port ?? (env.PORT || undefined),
          port     = explicit === undefined ? DEFAULT_PORT : Number(explicit);

    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`invalid port: ${explicit}`)
    }

    return {open: options.open, port, strict: explicit !== undefined,
        ...(options.spaRoot === undefined ? {} : {spaRoot: options.spaRoot})}
}

/**
 * @summary Serves the working directory and opens the browser on the `--open` path, if any.
 * @param {Object} [options]
 * @param {String[]} [options.argv]
 * @param {Object} [options.env]
 * @param {String} [options.root]
 * @param {Function} [options.opener] {@link openBrowser} or a stand-in.
 * @returns {Promise<http.Server>} The listening server.
 */
export async function main({argv = process.argv, env = process.env, root = process.cwd(), opener = openBrowser} = {}) {
    const {open, port, strict, spaRoot} = parseOptions(argv, env),
          server                        = createFileServer({root, spaRoot}),
          url                           = `http://localhost:${await listen(server, {port, strict})}/`;

    console.log(`[file-server] serving ${root} at ${url}`);

    if (open) opener(new URL(typeof open === 'string' ? open.replace(/^\.?\/+/, '') : '', url).href);

    return server
}

/**
 * @summary The command-line entry: {@link main}, ending the process with one line when the server cannot start.
 *
 * A workspace's own server script passes the app it opens as `open`, so the path stays data no shell parses,
 * and a later `--open <path>` or `--no-open` on the command line still wins.
 * @param {Object} [options]
 * @param {String[]} [options.argv]
 * @param {String} [options.open] The path to open unless the command line says otherwise.
 * @param {Function} [options.opener] {@link openBrowser} or a stand-in.
 * @returns {Promise<http.Server>}
 */
export function run({argv = process.argv, open, opener} = {}) {
    const [node, script, ...flags] = argv;

    return main({argv: open ? [node, script, '--open', open, ...flags] : argv, opener}).catch(error => {
        console.error(`[file-server] ${error.code === 'EADDRINUSE' ? `port ${error.port} is taken` : error.message}`);
        process.exit(1)
    })
}

if (isEntryModule(import.meta.url)) run();
