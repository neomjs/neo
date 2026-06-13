import fs   from 'fs';
import path from 'path';

/**
 * @summary Classify the on-disk state of an agent's managed repo checkout into a
 * provisioning-relevant verdict — the read-only "locate + health-check" half of Fleet Manager repo
 * provisioning.
 *
 * Given the already-derived checkout path, inspect what is actually on disk so the later
 * side-effecting clone/repair leaf can decide WITHOUT clobbering: an absent path is safe to clone
 * into; an existing valid checkout is reused as-is (path stability is load-bearing — Fleet Manager
 * auto-memory is path-keyed, so a reclone would fork it); a path occupied by a non-checkout is a
 * conflict that must never be overwritten.
 *
 * Read-only and **fs-only** by design (no git binary, no network, no writes) — `existsSync` /
 * `statSync` / `readdirSync` only — so the classification is deterministic and unit-testable against
 * temp-dir fixtures. It is deliberately decoupled from the path-derivation helper (it takes the
 * resolved `repoPath` rather than importing it), so each concern is independently testable and the
 * composition (derive → inspect → act) lives in the consuming I/O shell.
 *
 * Presence + checkout-validity only; remote-URL match / repair is a later refinement.
 *
 * @param {Object} options
 * @param {String} options.repoPath The absolute, already-derived managed checkout path to inspect.
 * @returns {{repoPath: String, exists: Boolean, isCheckout: Boolean, state: String, provisioningAction: String}}
 *   `state` ∈ `'absent' | 'empty' | 'occupied-non-checkout' | 'checkout'`;
 *   `provisioningAction` ∈ `'clone' | 'reuse' | 'conflict'`.
 * @throws {Error} If `repoPath` is not a non-empty absolute string.
 */
export function inspectAgentRepo({repoPath} = {}) {
    if (typeof repoPath !== 'string' || repoPath.length === 0) {
        throw new Error("inspectAgentRepo: 'repoPath' must be a non-empty string.");
    }
    if (!path.isAbsolute(repoPath)) {
        throw new Error(`inspectAgentRepo: 'repoPath' must be an absolute path, received '${repoPath}'.`);
    }

    if (!fs.existsSync(repoPath)) {
        return result(repoPath, false, false, 'absent', 'clone');
    }

    // A path occupied by a non-directory (a file, a symlink to one) is a hard conflict — never clobber.
    if (!fs.statSync(repoPath).isDirectory()) {
        return result(repoPath, true, false, 'occupied-non-checkout', 'conflict');
    }

    // A directory carrying `.git` (a dir for a clone, a file for a linked worktree) is a usable checkout.
    if (fs.existsSync(path.join(repoPath, '.git'))) {
        return result(repoPath, true, true, 'checkout', 'reuse');
    }

    // A directory without `.git`: empty is safe to clone into; non-empty is foreign content → conflict.
    const isEmpty = fs.readdirSync(repoPath).length === 0;

    return isEmpty
        ? result(repoPath, true, false, 'empty',                 'clone')
        : result(repoPath, true, false, 'occupied-non-checkout', 'conflict');
}

/**
 * Shape the inspection verdict.
 * @param {String}  repoPath
 * @param {Boolean} exists
 * @param {Boolean} isCheckout
 * @param {String}  state
 * @param {String}  provisioningAction
 * @returns {{repoPath: String, exists: Boolean, isCheckout: Boolean, state: String, provisioningAction: String}}
 * @private
 */
function result(repoPath, exists, isCheckout, state, provisioningAction) {
    return {repoPath, exists, isCheckout, state, provisioningAction};
}
