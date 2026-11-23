import fs   from 'node:fs';
import path from 'node:path';

/**
 * Static sibling assets a built app page must carry next to its generated `index.html`, and
 * server/SSG-only app resource files that browser `dist/*` builds must omit.
 *
 * The dist tree is served as its own root, so an asset the page links relatively has to exist
 * inside the dist app folder — rewriting the link to reach back into the source tree would break
 * that self-containment. Conversely, server/SSG-only metadata tables (`seo.json`,
 * `ssg-archive-routes.json`) stay in the repository and npm package for `neomjs/middleware-v2`
 * and `neomjs/pages` while being excluded from `dist/{development,production,esm}`.
 *
 * Both sets live here rather than inline so `webpack/development`, `webpack/production`, and
 * `build/esmodules` share one source of truth and cannot drift apart.
 */
export const DIST_APP_ASSET_EXTENSIONS = ['.webmanifest'];

/**
 * Workspace-relative app resource files consumed exclusively by Node SSR/SSG tooling and omitted from browser `dist/*`.
 * @type {String[]}
 */
export const DIST_EXCLUDED_APP_RESOURCES = [
    'apps/portal/resources/data/seo.json',
    'apps/portal/resources/data/ssg-archive-routes.json'
];

/**
 * @summary Whether a file must be carried into the dist tree verbatim as an app-page sibling.
 * Extension-driven rather than filename-driven so the webpack and esm builds agree by
 * construction; a build that matched only `manifest.webmanifest` would silently diverge again the
 * first time an app named its manifest anything else.
 * @param {String} fileName File name, not a path.
 * @returns {Boolean}
 */
export function isDistAppAsset(fileName) {
    return DIST_APP_ASSET_EXTENSIONS.some(extension => fileName.endsWith(extension))
}

/**
 * @summary Whether an absolute or workspace-relative path resolves to a server/SSG-only app resource
 * excluded from browser `dist/*` trees.
 * @param {String} filePath Absolute or workspace-relative path.
 * @returns {Boolean}
 */
export function isExcludedDistResource(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;

    const normalized = filePath.replace(/\\/g, '/').replace(/\/+/g, '/');

    return DIST_EXCLUDED_APP_RESOURCES.some(
        resource => normalized === resource || normalized.endsWith(`/${resource}`)
    )
}

/**
 * @summary Returns paths relative to `resourcesPath` that must be excluded when copying `resourcesPath` into `dist/*`.
 * @param {String} resourcesPath Workspace-relative resources directory (e.g. `apps/portal/resources`).
 * @returns {String[]}
 */
export function excludedResourcesFor(resourcesPath) {
    if (!resourcesPath || typeof resourcesPath !== 'string') return [];

    const prefix = resourcesPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '') + '/';

    return DIST_EXCLUDED_APP_RESOURCES
        .filter(resource => resource.startsWith(prefix))
        .map(resource => resource.slice(prefix.length))
}

/**
 * @summary Copies an app folder's root-level static assets into its dist counterpart.
 * Only the folder root is scanned: deeper assets live under `resources/`, which both builds
 * already copy wholesale. A missing source folder is not an error — `Docs` and app folders
 * without assets are ordinary.
 * @param {String} sourceDir Absolute path of the source app folder.
 * @param {String} targetDir Absolute path of the dist app folder, expected to exist.
 * @returns {String[]} The file names copied, for the caller to log or assert on.
 */
export function copyDistAppAssets(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) return [];

    const copied = [];

    for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
        if (entry.isFile() && isDistAppAsset(entry.name)) {
            fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
            copied.push(entry.name)
        }
    }

    return copied
}
