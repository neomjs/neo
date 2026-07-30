/**
 * @summary Pure predicate for the pre-push branch-freshness / revert-trap guard.
 *
 * Detects the "revert-trap" signature: a feature branch that has fallen behind its base
 * branch such that its two-dot diff (`git diff base..HEAD`) carries files that are NOT part
 * of its actual changes (the three-dot `git diff base...HEAD`). Those extra files are the
 * base branch's own advance — a PR opened from such a branch shows a misleading diff and
 * risks reverting merged peer work on squash/force-push.
 *
 * Kept pure and side-effect-free so it is unit-testable without executing the pre-push hook
 * itself; the hook supplies the live git file counts and owns the warn/exit behaviour.
 *
 * @param {Object}  args
 * @param {Number}  args.twoDotFiles    File count of the two-dot `base..HEAD` diff.
 * @param {Number}  args.threeDotFiles  File count of the three-dot `base...HEAD` diff.
 * @param {Number} [args.threshold=5]   Extra-file count above which the diff is flagged misleading.
 * @returns {{stale: Boolean, extraFiles: Number}} `stale` is true when `extraFiles > threshold`.
 */
export function detectStaleBranch({twoDotFiles, threeDotFiles, threshold = 5}) {
    const extraFiles = Math.max(0, twoDotFiles - threeDotFiles);
    return {stale: extraFiles > threshold, extraFiles};
}

/**
 * @summary Decides whether a local origin/dev object is authoritative after its refresh fails.
 * @param {Object}       args
 * @param {Boolean}      args.fetchSucceeded Whether the ordinary origin/dev fetch completed.
 * @param {String|null} [args.localSha=null]  Full local refs/remotes/origin/dev commit ID.
 * @param {String|null} [args.remoteSha=null] Full remote refs/heads/dev commit ID.
 * @returns {{usable: Boolean, status: String}}
 */
export function assessDevReferenceAuthority({
    fetchSucceeded,
    localSha = null,
    remoteSha = null
}) {
    if (fetchSucceeded) {
        return {usable: true, status: 'fetched'}
    }

    const fullObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

    if (!fullObjectIdPattern.test(localSha || '')) {
        return {usable: false, status: 'local-unavailable'}
    }

    if (!remoteSha) {
        return {usable: false, status: 'remote-unavailable'}
    }

    if (!fullObjectIdPattern.test(remoteSha)) {
        return {usable: false, status: 'remote-malformed'}
    }

    return localSha.toLowerCase() === remoteSha.toLowerCase()
        ? {usable: true, status: 'verified-local'}
        : {usable: false, status: 'stale-local'}
}
