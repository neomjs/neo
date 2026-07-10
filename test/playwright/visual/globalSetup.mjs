import {readdirSync, statSync} from 'fs';
import path                    from 'path';
import {fileURLToPath}         from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

/**
 * Returns the newest mtime (ms) of any file matching the extension under a directory tree.
 * @param {String} dir absolute directory
 * @param {String} ext file extension including the dot
 * @returns {Number} newest mtime in ms, or 0 when the tree is empty/absent
 */
function newestMtime(dir, ext) {
    let newest = 0;

    let entries;
    try {
        entries = readdirSync(dir, {withFileTypes: true})
    } catch (e) {
        return 0
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            newest = Math.max(newest, newestMtime(full, ext))
        } else if (entry.name.endsWith(ext)) {
            newest = Math.max(newest, statSync(full).mtimeMs)
        }
    }

    return newest
}

/**
 * The rebuild-before-baseline invariant, enforced mechanically: the dist theme CSS is a
 * gitignored BUILD artifact — merged SCSS is invisible to every rendered surface until the
 * theme build runs, so a golden captured over stale artifacts is a poisoned baseline that
 * silently locks in the WRONG pixels. A stale tree fails the whole visual run loudly with the
 * exact rebuild command; capturing anyway is never an option.
 */
export default function globalSetup() {
    const newestScss = newestMtime(path.join(repoRoot, 'resources/scss'), '.scss'),
          newestCss  = newestMtime(path.join(repoRoot, 'dist/development/css'), '.css');

    if (newestCss === 0) {
        throw new Error(
            'visual harness: no built theme CSS found under dist/development/css — build first:\n' +
            '  node ./buildScripts/build/themes.mjs -f -n -e dev'
        )
    }

    if (newestScss > newestCss) {
        throw new Error(
            'visual harness: the built theme CSS is OLDER than the newest SCSS source — a baseline over ' +
            'stale artifacts is a poisoned golden. Rebuild first:\n' +
            '  node ./buildScripts/build/themes.mjs -f -n -e dev'
        )
    }
}
