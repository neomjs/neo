import fs                    from 'node:fs';
import {deriveAgentRepoPath} from './deriveAgentRepoPath.mjs';
import {inspectAgentRepo}    from './inspectAgentRepo.mjs';

/**
 * Default destructive remove: a recursive directory removal. `force: true` makes an already-absent
 * path a no-op (defensive — the caller already gates on existence). Injectable via the `removeDir`
 * seam so the contract is unit-testable without deleting beyond a test's own temp fixtures.
 * @param {String} repoPath
 * @private
 */
function defaultRemoveDir(repoPath) {
    fs.rmSync(repoPath, {recursive: true, force: true});
}

/**
 * @summary Safely remove an agent's managed repo checkout — the cleanup counterpart to
 * {@link Neo.ai.services.fleet.ensureAgentRepo} (provision ↔ remove).
 *
 * Derives the agent's stable, contained checkout path, classifies what is on disk (via
 * {@link Neo.ai.services.fleet.inspectAgentRepo}), and removes **only what the Fleet Manager
 * provisioned** — a managed checkout, or an empty managed dir (a pre-clone shell). A **foreign
 * occupant** (a non-checkout directory, a file, a symlink → `'occupied-non-checkout'`) is **refused**,
 * never clobbered — the exact mirror of provisioning's never-clobber guarantee. An absent path is an
 * idempotent no-op.
 *
 * **Destructive + caller-driven.** Removing a checkout deletes the agent's working tree *including any
 * uncommitted work*, and the Fleet Manager's auto-memory is checkout-path-keyed — so deleting a path
 * orphans memory keyed on it. The *policy* of **when** to remove (and whether to preserve that memory)
 * is the **caller's** concern, NOT this mechanism's: this primitive is a safe, on-demand removal
 * mechanism and is deliberately **never auto-wired** into `removeAgent`. It only ever decides *what is
 * safe to remove*, never *whether removal is wanted*.
 *
 * Pure composition over injectable seams: `inspect` (default
 * {@link Neo.ai.services.fleet.inspectAgentRepo}) + `removeDir` (default a real recursive remove) make
 * the safe/refuse/no-op contract unit-testable, mirroring the fleet services' default-real + seam idiom.
 *
 * @param {Object}    options
 * @param {String}    options.managedRoot The absolute, trusted fleet-managed checkout root.
 * @param {String}    options.agentId     The Fleet Manager agent id.
 * @param {String}    options.repoSlug    The repo identifier, e.g. `'neomjs/neo'`.
 * @param {Function} [options.inspect]    `({repoPath}) => {exists, isCheckout, state, …}` classifier;
 *                                        defaults to {@link Neo.ai.services.fleet.inspectAgentRepo}.
 * @param {Function} [options.removeDir]  `(repoPath) => void` destructive remove; defaults to a real
 *                                        recursive directory removal, injectable for tests.
 * @returns {{removed: Boolean, repoPath: String, state: (String|undefined), reason: (String|undefined)}}
 *   `removed` is `true` only when a managed checkout / empty dir was actually removed; an absent path is
 *   `{removed: false, reason: 'absent'}`.
 * @throws {Error} On invalid `managedRoot` / `agentId` / `repoSlug` (from derivation), or when the path
 *   holds a non-managed occupant (fail-closed — never remove what the Fleet Manager did not provision).
 */
export function removeAgentRepo({managedRoot, agentId, repoSlug, inspect = inspectAgentRepo, removeDir = defaultRemoveDir} = {}) {
    const
        repoPath   = deriveAgentRepoPath({managedRoot, agentId, repoSlug}),
        inspection = inspect({repoPath});

    // Idempotent: nothing on disk → nothing to remove.
    if (!inspection.exists) {
        return {removed: false, reason: 'absent', repoPath};
    }

    // Remove ONLY what the Fleet Manager provisioned: our managed checkout (`isCheckout`) or an empty
    // managed dir (`state === 'empty'`, a pre-clone shell). Everything else on an existing path is a
    // non-managed occupant — refuse, never remove.
    if (inspection.isCheckout || inspection.state === 'empty') {
        removeDir(repoPath);
        return {removed: true, state: inspection.state, repoPath};
    }

    throw new Error(`removeAgentRepo: refusing to remove a non-managed occupant at '${repoPath}' (state: '${inspection.state}'). Only a Fleet-Manager-provisioned checkout or empty dir is removable.`);
}
