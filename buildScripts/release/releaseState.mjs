/**
 * @summary Decides a release's next step from what the remote already shows, so a release that stopped at any
 * push or call continues without hand-run git.
 *
 * `publish.mjs` reads the state (the GitHub release, the release PR, the release branch, `main`'s tip) and acts on
 * the step returned here. The module does no I/O, which keeps every resume path a unit-testable table.
 * @module buildScripts/release/releaseState
 */

/**
 * @typedef {Object} ReleaseState
 * @property {Boolean}     released        A GitHub release for the version exists.
 * @property {Object|null} pr              The newest release PR from `release/v<version>` to `dev`: `{state, url, mergeCommit}`.
 * @property {Boolean}     branchPushed    `release/v<version>` exists on origin.
 * @property {Boolean}     branchCommitted The local `release/v<version>` carries a commit `origin/dev` does not.
 * @property {Boolean}     mainHasTree     `origin/main`'s tip already holds the merged release tree.
 */

/**
 * @summary The `prepare` phase's next step.
 *
 * - `released`: the version is out; nothing to do.
 * - `merged`: the release PR is merged; `finish` takes over.
 * - `waiting`: the release PR is open; its required checks run and the operator merges it.
 * - `open-pr`: the branch is on origin without an open or merged PR.
 * - `push`: the release commit exists locally only.
 * - `build`: nothing exists yet.
 * @param {ReleaseState} state
 * @returns {'released'|'merged'|'waiting'|'open-pr'|'push'|'build'}
 */
export function getPrepareStep({released, pr, branchPushed, branchCommitted}) {
    if (released)               return 'released';
    if (pr?.state === 'MERGED') return 'merged';
    if (pr?.state === 'OPEN')   return 'waiting';
    if (branchPushed)           return 'open-pr';
    if (branchCommitted)        return 'push';

    return 'build'
}

/**
 * @summary The `finish` phase's next step.
 *
 * - `released`: the version is out; nothing to do.
 * - `not-merged`: there is no merged release PR to release from.
 * - `release`: `main` already holds the squash (a run stopped after its push); create the GitHub release.
 * - `squash`: squash the release PR's merge commit onto `main`, then create the GitHub release.
 * @param {ReleaseState} state
 * @returns {'released'|'not-merged'|'release'|'squash'}
 */
export function getFinishStep({released, pr, mainHasTree}) {
    if (released)                                  return 'released';
    if (pr?.state !== 'MERGED' || !pr.mergeCommit) return 'not-merged';
    if (mainHasTree)                               return 'release';

    return 'squash'
}
