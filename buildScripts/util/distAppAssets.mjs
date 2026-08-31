import fs   from 'node:fs';
import path from 'node:path';

/**
 * Static sibling assets a built app page must carry next to its generated `index.html`.
 *
 * The dist tree is served as its own root, so an asset the page links relatively has to exist
 * inside the dist app folder — rewriting the link to reach back into the source tree would break
 * that self-containment. Nothing else copies these: the webpack builds enumerate the three files
 * they generate (`neo-config.json`, an optional remotes API map, `index.html`) and the esm build
 * gates its recursive walk on `.mjs` / `.json` / `.html` plus `/resources/`. A root-level asset
 * with any other extension falls through both.
 *
 * The set lives here rather than inline because the two copy sets drifting apart is precisely the
 * defect this module exists to prevent: a web app manifest went missing from the webpack output
 * and from the esm output for two unrelated reasons, and neither build named the extension.
 */
export const DIST_APP_ASSET_EXTENSIONS = ['.webmanifest'];

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
