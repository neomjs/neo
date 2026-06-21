/**
 * @summary Pure revert-commit-trailer detection — the foundational revert slice of the PR Outcome
 * Tracker. Parses the `This reverts commit <sha>` trailer git writes for a `git revert`, producing
 * the `reverted` flag the reward-computation core consumes for the -1.0 "actively harmful —
 * regression" signal: the highest-value, hardest RLAIF reward outcome (a session whose merged PRs
 * were later reverted must score negative, and the merge state's `closedAt` is a false signal — the
 * revert trailer is the ground truth).
 *
 * Deliberately PURE — no git/gh I/O. The commit SCAN (fetching later commits to check against a
 * merge SHA) and the wiring into the outcome-scan are the rest of the tracker (the integration /
 * memory-core domain). Plain function exports mirror this directory's local-pure-helper convention.
 *
 * @module ai/services/ingestion/RevertDetection
 */

/**
 * @summary Matches a `This reverts commit <sha>` line as a standalone trailer (anchored to the line,
 * so a mid-sentence mention is not a false match). Global + multiline so a revert of a range/merge
 * with several such lines yields all of them.
 * @type {RegExp}
 */
const REVERT_TRAILER = /^\s*This reverts commit ([0-9a-f]{7,40})\.?\s*$/gim;

/**
 * @summary Extracts every reverted commit SHA from a commit message's `This reverts commit <sha>`
 * trailer line(s). A `git revert` of a range or a merge can produce multiple such lines.
 * @param {String} commitMessage
 * @returns {String[]} the reverted SHAs (lowercased), in order; empty if none / non-string.
 */
export function parseRevertTrailer(commitMessage) {
    if (typeof commitMessage !== 'string' || !commitMessage) {
        return [];
    }

    const shas = [];
    let   match;

    REVERT_TRAILER.lastIndex = 0;

    while ((match = REVERT_TRAILER.exec(commitMessage)) !== null) {
        shas.push(match[1].toLowerCase());
    }

    return shas;
}

/**
 * @summary Whether a commit message reverts a specific target SHA. Matches on SHA-prefix equality in
 * either direction, so a 7-char abbreviated trailer SHA matches a full 40-char target and vice versa.
 * @param {String} commitMessage
 * @param {String} targetSha
 * @returns {Boolean}
 */
export function isRevertOf(commitMessage, targetSha) {
    if (typeof targetSha !== 'string' || targetSha === '') {
        return false;
    }

    const target = targetSha.toLowerCase();

    return parseRevertTrailer(commitMessage).some(sha => target.startsWith(sha) || sha.startsWith(target));
}
