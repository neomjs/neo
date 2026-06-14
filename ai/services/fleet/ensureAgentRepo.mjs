import {deriveAgentRepoPath} from './deriveAgentRepoPath.mjs';
import {inspectAgentRepo}    from './inspectAgentRepo.mjs';
import {provisionAgentRepo}  from './provisionAgentRepo.mjs';

/**
 * @summary Ensure an agent's managed repo checkout exists — the single Fleet Manager entry point that
 * composes the repo-provisioning trio (derive the path → inspect the state → provision the action).
 *
 * Given an agent + repo + the managed root + a clone URL, this derives the stable checkout path,
 * inspects what is on disk, and carries out the provisioning decision WITHOUT clobbering:
 * - an absent / empty path → clones `cloneUrl` into it;
 * - an existing valid checkout → reuses it as-is (no reclone — Fleet Manager auto-memory is path-keyed);
 * - a foreign occupant (a file, a non-empty non-checkout, a symlink) → throws (never overwrite).
 *
 * Each step's contract is inherited from its primitive: `deriveAgentRepoPath` validates the inputs +
 * computes a stable, collision-free, traversal-safe path; `inspectAgentRepo` classifies the on-disk
 * state read-only; `provisionAgentRepo` executes via an injectable clone seam. The `cloneRepo` seam is
 * passed through so the composed flow is unit-testable without a git binary; the default (un-injected)
 * path runs a real `git clone`.
 *
 * Fleet Manager is single-writer (Scenario-C-zero per the MVP epic), so the inspect→provision sequence
 * is not TOCTOU-guarded — and does not need to be: `git clone` fails safe if the directory changed
 * underneath, and no second writer races the same checkout.
 *
 * @param {Object}    options
 * @param {String}    options.managedRoot The absolute, trusted fleet-managed checkout root.
 * @param {String}    options.agentId     The Fleet Manager agent id.
 * @param {String}    options.repoSlug    The repo identifier, e.g. `'neomjs/neo'`.
 * @param {String}   [options.cloneUrl]   The clone source (required only when a clone is needed).
 * @param {Function} [options.cloneRepo]  `(cloneUrl, repoPath) => Promise<void>` — the clone executor;
 *                                        defaults to a real `git clone`, injectable for tests.
 * @returns {Promise<{repoPath: String, state: String, action: String, cloned: Boolean}>}
 *   `repoPath` is the derived checkout path; `state` is the inspected on-disk state; `action` ∈
 *   `'cloned' | 'reused'`; `cloned` is `true` only when a clone ran.
 * @throws {Error} On invalid `managedRoot` / `agentId` / `repoSlug` (from derivation), a conflicting
 *   occupant, or a missing `cloneUrl` when a clone is required.
 */
export async function ensureAgentRepo({managedRoot, agentId, repoSlug, cloneUrl, cloneRepo} = {}) {
    const
        repoPath   = deriveAgentRepoPath({managedRoot, agentId, repoSlug}),
        inspection = inspectAgentRepo({repoPath}),
        result     = await provisionAgentRepo({
            repoPath,
            provisioningAction: inspection.provisioningAction,
            cloneUrl,
            cloneRepo
        });

    return {repoPath, state: inspection.state, action: result.action, cloned: result.cloned};
}
