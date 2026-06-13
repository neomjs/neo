import {execFile}  from 'child_process';
import path        from 'path';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);

/**
 * Default clone executor: a real `git clone -- <cloneUrl> <repoPath>`. The `--` terminates git's
 * option parsing so a hostile URL or path cannot smuggle a flag. Overridden via the `cloneRepo` seam
 * in tests so the provisioning contract is exercised without a git binary or network — mirroring
 * `FleetLifecycleService`'s default-real `spawnFn` seam.
 * @param {String} cloneUrl
 * @param {String} repoPath
 * @returns {Promise<void>}
 * @private
 */
async function gitClone(cloneUrl, repoPath) {
    await execFileAsync('git', ['clone', '--', cloneUrl, repoPath]);
}

/**
 * @summary Execute a Fleet Manager repo-provisioning decision — the side-effecting "act" half of the
 * read → decide → act trio, materializing (or safely declining to touch) an agent's managed checkout.
 *
 * Given an already-derived `repoPath` and the `provisioningAction` an inspector decided for it, this
 * carries it out WITHOUT clobbering:
 * - `'clone'`    → clone `cloneUrl` into the absent / empty path.
 * - `'reuse'`    → no-op: an existing valid checkout is kept as-is. Re-cloning is never correct —
 *                 Fleet Manager auto-memory is path-keyed, so it would fork the agent's memory.
 * - `'conflict'` → throw: the path holds a foreign occupant (a file, a non-empty non-checkout, a
 *                 symlink) and must never be overwritten.
 *
 * The clone is a subprocess side effect, so the executor is injectable: `cloneRepo` defaults to a real
 * `git clone` but a test passes a recording stub, so the clone / reuse / conflict contract is
 * unit-testable without a git binary or network — the same default-real + injectable seam
 * `FleetLifecycleService` uses for process spawning. Decoupled from the inspector (it takes the decided
 * `provisioningAction`, not the inspector) — the composing derive → inspect → provision orchestrator
 * is a later leaf.
 *
 * @param {Object}    options
 * @param {String}    options.repoPath           The absolute, already-derived managed checkout path.
 * @param {String}    options.provisioningAction One of `'clone'` | `'reuse'` | `'conflict'`.
 * @param {String}   [options.cloneUrl]          The clone source (required for `'clone'`); the caller
 *                                               supplies an already-credential-resolved URL.
 * @param {Function} [options.cloneRepo=gitClone] `(cloneUrl, repoPath) => Promise<void>` — the clone
 *                                               executor; defaults to a real `git clone`, injectable for tests.
 * @returns {Promise<{repoPath: String, action: String, cloned: Boolean}>}
 *   `action` ∈ `'cloned' | 'reused'`; `cloned` is `true` only when a clone actually ran.
 * @throws {Error} On a `'conflict'` action, an unknown action, a missing `cloneUrl` for `'clone'`, or a
 *   non-string / empty / non-absolute `repoPath`.
 */
export async function provisionAgentRepo({repoPath, provisioningAction, cloneUrl, cloneRepo=gitClone} = {}) {
    if (typeof repoPath !== 'string' || repoPath.length === 0) {
        throw new Error("provisionAgentRepo: 'repoPath' must be a non-empty string.");
    }
    if (!path.isAbsolute(repoPath)) {
        throw new Error(`provisionAgentRepo: 'repoPath' must be an absolute path, received '${repoPath}'.`);
    }

    switch (provisioningAction) {
        case 'conflict':
            // The inspector found a foreign occupant — refuse rather than overwrite it.
            throw new Error(`provisionAgentRepo: refusing to provision over a conflicting occupant at '${repoPath}'.`);

        case 'reuse':
            // An existing valid checkout: keep it as-is (re-cloning would fork the path-keyed memory).
            return {repoPath, action: 'reused', cloned: false};

        case 'clone': {
            // Blank-check, not just empty-check: a whitespace-only cloneUrl must fail closed and never
            // reach the clone seam. Pass the trimmed url so accidental padding doesn't break the clone.
            const url = typeof cloneUrl === 'string' ? cloneUrl.trim() : '';
            if (!url) {
                throw new Error("provisionAgentRepo: 'cloneUrl' is required (a non-blank string) for a 'clone' action.");
            }
            await cloneRepo(url, repoPath);
            return {repoPath, action: 'cloned', cloned: true};
        }

        default:
            throw new Error(`provisionAgentRepo: unknown provisioningAction '${provisioningAction}'.`);
    }
}
