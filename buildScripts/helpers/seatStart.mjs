import isEntryModule                  from '../util/isEntryModule.mjs';
import {ensureDevelopmentThemeAssets} from '../util/developmentThemeAssets.mjs';

/**
 * @module buildScripts/helpers/seatStart
 * @summary What a fresh seat Start needs from this checkout: current development themes.
 *
 * A Fleet Start fast-forwards the seat's checkout, installs its dependencies and then runs the
 * repository's `seat:start` script. The fast-forward is the "pull with peer scss changes" after
 * which the operator workflow calls for `build-themes`, and nothing else rebuilds the compiled
 * CSS. This entry point runs the canonical development theme build only when
 * `inspectDevelopmentThemeAssets()` finds the outputs missing or stale, so a Start that brings in
 * no SCSS change exits at once.
 */

/**
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root to inspect and build. Defaults to `process.cwd()`.
 * @param {Function} [options.build] Injectable builder seam for focused tests.
 * @param {Object} [options.logger] Console-compatible logger.
 * @returns {Promise<{built: Boolean, state: Object}>}
 */
export async function seatStart({repoRoot = process.cwd(), build, logger = console} = {}) {
    const result = await ensureDevelopmentThemeAssets({repoRoot, build, logger});

    logger.log(result.built
        ? '[seat:start] development themes rebuilt'
        : '[seat:start] development themes are current');

    return result
}

if (isEntryModule(import.meta.url)) {
    try {
        await seatStart()
    } catch (error) {
        console.error(`[seat:start] ${error.message}`);
        process.exitCode = 1
    }
}
