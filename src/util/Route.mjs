const DISALLOWED_QUERY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * File extensions treated as static assets rather than SPA routes in `'pathname'` mode.
 * @type {Set<String>}
 */
export const STATIC_ASSET_EXTENSIONS = new Set([
    'avif', 'bmp', 'cjs', 'css', 'csv', 'eot', 'gif', 'glb', 'gltf',
    'gz', 'htm', 'html', 'ico', 'jpeg', 'jpg', 'js', 'json', 'jsonl',
    'map', 'md', 'mjs', 'mp3', 'mp4', 'ogg', 'otf', 'pdf', 'png',
    'svg', 'ttf', 'txt', 'wasm', 'wav', 'webm', 'webp', 'woff',
    'woff2', 'xml', 'yaml', 'yml', 'zip'
]);

/**
 * @summary Checks whether a URL pathname belongs to the `'pathname'` router rather than a static asset or ignored prefix.
 * Evaluates raw `pathname` (preserving trailing `/`) before any slash canonicalization.
 * @param {String} [pathname='']
 * @param {String[]} [routerIgnorePaths=[]]
 * @param {String} [routerBasePath='']
 * @returns {Boolean}
 */
export function isManagedRoutePath(pathname='', routerIgnorePaths=[], routerBasePath='') {
    const basePath = routerBasePath ? routerBasePath.replace(/\/+$/, '') : '';
    let rawPath;

    if (basePath) {
        if (pathname !== basePath && !pathname.startsWith(basePath + '/')) {
            return false
        }

        rawPath = pathname.substring(basePath.length) || '/'
    } else {
        rawPath = pathname || '/'
    }

    if (!rawPath.startsWith('/')) {
        rawPath = '/' + rawPath
    }

    if (rawPath !== '/index.html' && !rawPath.endsWith('/')) {
        const
            lastSegment = rawPath.slice(rawPath.lastIndexOf('/') + 1),
            dotIndex    = lastSegment.lastIndexOf('.');

        if (dotIndex > 0 && STATIC_ASSET_EXTENSIONS.has(lastSegment.slice(dotIndex + 1).toLowerCase())) {
            return false
        }
    }

    if (Array.isArray(routerIgnorePaths) && routerIgnorePaths.some(pattern =>
        typeof pattern === 'string' && pattern.length > 0 && (
            pattern.startsWith('^') ? new RegExp(pattern).test(rawPath) : rawPath.startsWith(pattern)
        )
    )) {
        return false
    }

    return true
}

/**
 * @summary Normalizes a managed URL pathname relative to `routerBasePath`, mapping root and `/index.html` to `'/'`.
 * @param {String} [pathname='']
 * @param {String} [routerBasePath='']
 * @returns {String}
 */
export function normalizeRoutePathname(pathname='', routerBasePath='') {
    const basePath = routerBasePath ? routerBasePath.replace(/\/+$/, '') : '';
    let   path     = basePath && (pathname === basePath || pathname.startsWith(basePath + '/')) ?
        pathname.substring(basePath.length) :
        pathname;

    if (!path || path === '/' || path === '/index.html') {
        return '/'
    }

    path = path.startsWith('/') ? path : '/' + path;

    return path.replace(/\/+$/, '') || '/'
}

/**
 * @summary Parses a URL query string via `URLSearchParams`, preserving repeated keys as arrays.
 * @param {String} [search='']
 * @returns {Object}
 */
export function parseQueryParams(search='') {
    if (!search || search === '?') {
        return {}
    }

    const
        params = new URLSearchParams(search.startsWith('?') ? search.substring(1) : search),
        result = {};

    for (const [rawKey, value] of params.entries()) {
        const
            isBracketArray = rawKey.endsWith('[]'),
            key            = isBracketArray ? rawKey.slice(0, -2) : rawKey;

        if (!key || DISALLOWED_QUERY_KEYS.has(key) || DISALLOWED_QUERY_KEYS.has(rawKey)) {
            continue
        }

        if (Object.hasOwn(result, key)) {
            if (Array.isArray(result[key])) {
                result[key].push(value)
            } else {
                result[key] = [result[key], value]
            }
        } else {
            result[key] = isBracketArray ? [value] : value
        }
    }

    return result
}
