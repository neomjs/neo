import {existsSync, readFileSync} from 'node:fs';
import path                       from 'node:path';

/**
 * @summary Finds the directory that owns a given npm script, walking up from a starting directory.
 *
 * The Playwright fixture is the second Neural Link Bridge entrypoint, and it owes `spawnBridge` the
 * same working directory the MCP server supplies via `--cwd`. It cannot use `process.cwd()` for that:
 * Playwright resolves `testDir` from the CONFIG and never changes directory, so
 * `npx playwright test -c /abs/config.mjs` from any directory is a valid run whose worker cwd owns
 * nothing. Anchoring on a caller-supplied directory inside the package is what makes the answer
 * portable.
 *
 * Each candidate is confirmed by reading the script out of its `package.json`, so a returned path is
 * one where `npm run <scriptName>` is known to resolve rather than one that merely looks like a root.
 * `null` means no ancestor declared it — the caller must leave the cwd unassigned and let the spawn
 * refuse by name, because substituting an unvalidated directory turns that named refusal into an
 * ENOENT from `npm` several layers away.
 *
 * Both parameters are required on purpose: a default for either would be a hidden default of exactly
 * the kind this function exists to remove.
 *
 * @param {String} fromDir    Absolute directory to start the walk at (typically the caller's own).
 * @param {String} scriptName The npm script the returned directory must declare.
 * @returns {String|null} The nearest ancestor declaring `scriptName`, or `null`.
 */
export function findBridgeScriptRoot(fromDir, scriptName) {
    let dir = fromDir;

    for (let previous = null; dir && dir !== previous; previous = dir, dir = path.dirname(dir)) {
        const manifest = path.join(dir, 'package.json');

        if (!existsSync(manifest)) continue;

        try {
            if (JSON.parse(readFileSync(manifest, 'utf-8'))?.scripts?.[scriptName]) return dir
        } catch {
            // An unreadable or malformed manifest is not this walk's to report: a nearer ancestor may
            // still own the script, and stopping here would answer "not found" for a different reason
            // than the one the caller acts on.
        }
    }

    return null
}
