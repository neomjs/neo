import {realpath, stat} from 'node:fs/promises';
import path             from 'node:path';

export const APP_HOST = 'neo';

export const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "child-src 'self'",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
    "font-src 'self' data:",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: https://github.com https://avatars.githubusercontent.com",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'"
].join('; ');

export const REQUIRED_ASSET_PATHS = Object.freeze([
    '/dist/development/css/src/Global.css',
    '/dist/development/css/theme-neo-dark/Global.css',
    '/dist/development/css/theme-neo-light/Global.css',
    '/node_modules/@fortawesome/fontawesome-free/css/all.min.css',
    '/resources/images/logo/neo_logo_primary.svg',
    '/resources/theme-map.json'
]);

// Exported (read-only) because the packaging pipeline derives its bundle manifest FROM this
// allowlist — one authority for "what the renderer may load" and "what the artifact must carry".
export const ALLOWED_EXACT_PATHS = Object.freeze([
    '/node_modules/@fortawesome/fontawesome-free/css/all.min.css',
    '/resources/images/logo/neo_logo_primary.svg',
    '/resources/theme-map.json'
]);

export const ALLOWED_PATH_PREFIXES = Object.freeze([
    '/apps/agentos/',
    '/dist/development/css/',
    '/node_modules/@fortawesome/fontawesome-free/webfonts/',
    '/src/'
]);

const
    ALLOWED_EXACT_PATH_SET = new Set(ALLOWED_EXACT_PATHS),
    MIME_TYPES             = Object.freeze({
        '.avif' : 'image/avif',
        '.css'  : 'text/css; charset=utf-8',
        '.gif'  : 'image/gif',
        '.html' : 'text/html; charset=utf-8',
        '.ico'  : 'image/x-icon',
        '.jpeg' : 'image/jpeg',
        '.jpg'  : 'image/jpeg',
        '.js'   : 'text/javascript; charset=utf-8',
        '.json' : 'application/json; charset=utf-8',
        '.map'  : 'application/json; charset=utf-8',
        '.mjs'  : 'text/javascript; charset=utf-8',
        '.png'  : 'image/png',
        '.svg'  : 'image/svg+xml',
        '.ttf'  : 'font/ttf',
        '.wasm' : 'application/wasm',
        '.webp' : 'image/webp',
        '.woff' : 'font/woff',
        '.woff2': 'font/woff2'
    });

/**
 * Parses an app:// URL into a canonical, dotfile-free path.
 * @summary Enforces the packaged origin before any filesystem resolution occurs.
 * @param {String} value
 * @returns {{ok: Boolean, pathname: String|null, reason: String}}
 */
export function parseHarnessUrl(value) {
    try {
        const url = new URL(value);

        if (
            url.protocol !== 'app:' ||
            url.hostname !== APP_HOST ||
            url.username ||
            url.password ||
            url.port
        ) {
            return {ok: false, pathname: null, reason: 'origin'}
        }

        const pathname = decodeURIComponent(url.pathname);

        if (
            !pathname.startsWith('/') ||
            pathname.includes('\\') ||
            pathname.includes('\0') ||
            pathname.includes(':') ||
            path.posix.normalize(pathname) !== pathname ||
            pathname.split('/').some(segment => segment.startsWith('.'))
        ) {
            return {ok: false, pathname: null, reason: 'path'}
        }

        return {ok: true, pathname, reason: 'allowed'}
    } catch {
        return {ok: false, pathname: null, reason: 'malformed'}
    }
}

/**
 * @summary Returns whether a canonical URL path belongs to the explicit renderer asset surface.
 * @param {String} pathname
 * @returns {Boolean}
 */
export function isAllowedHarnessAssetPath(pathname) {
    return ALLOWED_EXACT_PATH_SET.has(pathname) ||
        ALLOWED_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

/**
 * @summary Restricts top-level navigation and popups to HTML documents owned by apps/agentos.
 * @param {String} value
 * @returns {Boolean}
 */
export function isHarnessDocumentUrl(value) {
    const parsed = parseHarnessUrl(value);

    return parsed.ok &&
        parsed.pathname.startsWith('/apps/agentos/') &&
        parsed.pathname.endsWith('.html')
}

/**
 * Creates a resolver whose realpath containment check cannot be bypassed through symlinks.
 * @summary Maps only explicit public renderer assets to regular files inside the canonical repo root.
 * @param {String} repoRoot
 * @returns {Promise<Function>}
 */
export async function createHarnessAssetResolver(repoRoot) {
    const canonicalRoot = await realpath(repoRoot);

    /**
     * @summary Resolves one packaged-origin request without exposing denied filesystem details.
     * @param {String} requestUrl
     * @returns {Promise<Object>}
     */
    return async function resolveHarnessAsset(requestUrl) {
        const parsed = parseHarnessUrl(requestUrl);

        if (!parsed.ok || !isAllowedHarnessAssetPath(parsed.pathname)) {
            return {
                ok      : false,
                pathname: parsed.pathname,
                reason  : parsed.ok ? 'not-allowlisted' : parsed.reason
            }
        }

        const candidate = path.resolve(canonicalRoot, `.${parsed.pathname}`);

        if (!candidate.startsWith(canonicalRoot + path.sep)) {
            return {ok: false, pathname: parsed.pathname, reason: 'containment'}
        }

        try {
            const canonicalFile = await realpath(candidate);

            if (!canonicalFile.startsWith(canonicalRoot + path.sep) || !(await stat(canonicalFile)).isFile()) {
                return {ok: false, pathname: parsed.pathname, reason: 'containment'}
            }

            return {
                contentType: MIME_TYPES[path.extname(canonicalFile).toLowerCase()] ?? 'application/octet-stream',
                filePath   : canonicalFile,
                isDocument : path.extname(canonicalFile).toLowerCase() === '.html',
                ok         : true,
                pathname   : parsed.pathname,
                reason     : 'allowed'
            }
        } catch {
            return {ok: false, pathname: parsed.pathname, reason: 'missing'}
        }
    }
}
