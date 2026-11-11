import isEntryModule                  from '../util/isEntryModule.mjs';
import {ensureDevelopmentThemeAssets} from '../util/developmentThemeAssets.mjs';
import {runStage}                     from '../util/prepare.mjs';

/**
 * @module buildScripts/helpers/seatStart
 * @summary What a fresh seat Start needs from this checkout: an `AGENTS.md` generated from the
 * installed skills, and current development themes.
 *
 * A Fleet Start fast-forwards the seat's checkout, installs its dependencies and then runs the
 * repository's `seat:start` script, after every install outcome, including one that installed
 * nothing because the lockfile was unchanged. So `AGENTS.md` is regenerated here on every Start,
 * through the same `agents-md` stage `prepare` runs: a deleted file, or the committed pointer a
 * fast-forward wrote back, holds the rules again before the harness launches.
 *
 * The fast-forward is also the "pull with peer scss changes" after which the operator workflow
 * calls for `build-themes`, and nothing else rebuilds the compiled CSS. This entry point runs the
 * canonical development theme build only when `inspectDevelopmentThemeAssets()` finds the outputs
 * missing or stale, so a Start that brings in no SCSS change does not build.
 *
 * Each step runs whatever the other did; a failure in either fails the Start, and the Fleet shows
 * it on the seat's start row.
 */

/**
 * @param {Object} [options]
 * @param {String} [options.repoRoot] Repository root to inspect and build. Defaults to `process.cwd()`.
 * @param {Function} [options.build] Injectable builder seam for focused tests.
 * @param {Object} [options.logger] Console-compatible logger.
 * @param {Function} [options.runStageFn=runStage] Injectable seam for the `agents-md` stage.
 * @returns {Promise<{built: Boolean, state: Object, agentsMd: Object}>}
 */
export async function seatStart({repoRoot = process.cwd(), build, logger = console, runStageFn = runStage} = {}) {
    const failures = [];
    let agentsMd, themes;

    try {
        agentsMd = runStageFn('agents-md', {root: repoRoot});

        if (agentsMd.status !== 0) {
            throw new Error(`the generator exited ${agentsMd.status}`)
        }

        logger.log(agentsMd.skipped
            ? '[seat:start] AGENTS.md: this checkout declares no generate-agents-md script'
            : '[seat:start] AGENTS.md generated');
    } catch (error) {
        failures.push(new Error(`AGENTS.md was not generated (${error.message}). Recovery: npm run generate-agents-md`))
    }

    try {
        themes = await ensureDevelopmentThemeAssets({repoRoot, build, logger});

        logger.log(themes.built
            ? '[seat:start] development themes rebuilt'
            : '[seat:start] development themes are current');
    } catch (error) {
        failures.push(error)
    }

    if (failures.length) {
        throw failures.length === 1 ? failures[0] : new Error(failures.map(failure => failure.message).join('\n'))
    }

    return {...themes, agentsMd}
}

if (isEntryModule(import.meta.url)) {
    try {
        await seatStart()
    } catch (error) {
        console.error(`[seat:start] ${error.message}`);
        process.exitCode = 1
    }
}
