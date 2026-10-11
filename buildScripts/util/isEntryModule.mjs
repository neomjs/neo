import {realpathSync}  from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * @module buildScripts/util/isEntryModule
 * @summary Whether a module is the script `node` was asked to run, the test every CLI block of a build script gates on.
 *
 * Node resolves symlinks in the entry module's own `import.meta.url`, and never in `process.argv[1]`. A comparison
 * that leaves either side unresolved is false for a script run through a symlinked path (a checkout under macOS
 * `/tmp`, a package `bin`), and the script then skips its CLI block and exits 0 having checked nothing. Under
 * `--preserve-symlinks-main` it is the URL that keeps the link, which resolving both sides covers as well.
 *
 * @example
 * import isEntryModule from './isEntryModule.mjs';
 *
 * if (isEntryModule(import.meta.url)) {
 *     process.exitCode = run()
 * }
 */

/**
 * @param {String} importMetaUrl The calling module's `import.meta.url`
 * @returns {Boolean} false as well when `process.argv[1]` is missing or names nothing on disk
 */
export default function isEntryModule(importMetaUrl) {
    const entry = process.argv[1];

    if (!entry) {
        return false
    }

    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl))
    } catch {
        return false
    }
}
