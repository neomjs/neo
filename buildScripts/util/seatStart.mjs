import process                       from 'node:process';
import isEntryModule                from './isEntryModule.mjs';
import {ensureDevelopmentThemeAssets} from './developmentThemeAssets.mjs';

/**
 * @summary Fleet seat:start entry point: rebuild development themes only when they are not current.
 *
 * A Fleet Start fast-forwards a seat's checkout and then runs the repository's own
 * `seat:start` npm script. After a fast-forward that brings in SCSS changes, the checkout
 * would otherwise serve CSS compiled before them until someone runs `npm run build-themes`.
 * Building on every Start would slow most starts down for nothing, so this script reuses
 * `inspectDevelopmentThemeAssets()` (via `ensureDevelopmentThemeAssets()`) and only runs the
 * canonical non-interactive development build when the inspection reports `ready: false`.
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root to inspect (defaults to this checkout).
 * @returns {Promise<Number>} the process exit code
 */
export async function runSeatStart({repoRoot} = {}) {
    try {
        const {built} = await ensureDevelopmentThemeAssets({repoRoot});

        if (!built) {
            console.log('[seat:start] development theme assets are current — nothing to build');
        }

        return 0
    } catch (error) {
        console.error(`seat:start: ${error.message}`);

        return 1
    }
}

if (isEntryModule(import.meta.url)) {
    runSeatStart().then(code => process.exitCode = code);
}
