import path            from 'path';
import {fileURLToPath} from 'url';

import {newestMtime} from '../../../buildScripts/util/developmentThemeAssets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

/**
 * The rebuild-before-baseline invariant, enforced mechanically: the dist theme CSS is a
 * gitignored BUILD artifact — merged SCSS is invisible to every rendered surface until the
 * theme build runs, so a golden captured over stale artifacts is a poisoned baseline that
 * silently locks in the WRONG pixels. A stale tree fails the whole visual run loudly;
 * capturing anyway is never an option.
 *
 * The guidance names the DURABLE fix first, and that ordering is the point. Printing only the
 * one-off build resolves this instance and guarantees the next one: an author runs the command,
 * edits SCSS again, and meets the identical failure. `npm run watch-themes` ends the recurrence
 * for every consumer of the built CSS, not just this harness.
 *
 * Deliberately NOT auto-rebuilding here — and not on cost grounds, since the build is ~1.3s.
 * The watcher already covers this and serves every surface, so a repair bolted into one
 * harness's setup would be a second mechanism for a solved problem, reachable only by the
 * authors who happen to run visual tests.
 */
const THEME_GUIDANCE =
    '  npm run build-themes && npm run watch-themes   ← build once, then keep them fresh\n' +
    '  node ./buildScripts/build/themes.mjs -f -n -e dev   ← one-off, if you only need this run';

export default function globalSetup() {
    const newestScss = newestMtime(path.join(repoRoot, 'resources/scss'), '.scss'),
          newestCss  = newestMtime(path.join(repoRoot, 'dist/development/css'), '.css');

    if (newestCss === 0) {
        throw new Error(
            'visual harness: no built theme CSS found under dist/development/css. This is the ' +
            'first-run state on a fresh clone or a newly checked-out branch — the artifacts are ' +
            'gitignored, so switching branches never brings them along:\n' + THEME_GUIDANCE
        )
    }

    if (newestScss > newestCss) {
        throw new Error(
            'visual harness: the built theme CSS is OLDER than the newest SCSS source — a baseline over ' +
            'stale artifacts is a poisoned golden:\n' + THEME_GUIDANCE
        )
    }
}
