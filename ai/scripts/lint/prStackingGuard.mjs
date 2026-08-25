/**
 * @summary Pure decision helpers for the agent-pr-body-lint stacked-PR guard.
 *
 * **Why this module exists.** The guard used one ticket-proxy check for two unrelated questions —
 * "was this branched off `dev`?" and "does every commit's ticket match the body?" — and the proxy
 * failed in both directions: a legitimate close-target repoint turned the check red on a PR
 * branched off `dev`, while the house `Related:` convention contributed nothing to the declared
 * set, letting genuinely stacked PRs through.
 *
 * **Ancestry over inference — falsified, then replaced.** The ticket prescribed a merge-base
 * ancestry test; a fixture falsified it before this module shipped (a branch cut from unmerged
 * work has a merge-base that IS an ancestor of the base — the parent's commits live strictly
 * between). The sound observable is a sibling OPEN PR whose head commit sits inside this branch's
 * exclusive range: that is stacking by definition, with the parent named by number.
 *
 * **Commit/body agreement is a separate concern** about squash-provenance, never about branches;
 * it reports as a warning naming the consequence rather than failing the run.
 *
 * @see ./lint-pr-stacking.mjs — the committed CLI orchestrating these helpers
 * @see .github/workflows/agent-pr-body-lint.yml — the calling workflow step
 */

/**
 * One declaring LINE of a PR body: the keyword, then every ticket id to end-of-line. Shared with
 * `ai/scripts/agent-preflight.mjs` so author-side and hosted lint cannot drift on what counts as
 * declared.
 * @type {RegExp}
 */
export const DECLARED_TICKET_LINE_PATTERN = /\b(?:Resolves|Refs|Related)\b[^\n]*/gi;

/**
 * A trailing `(#N)` on a commit subject. Shared with the same consumer pair.
 * @type {RegExp}
 */
export const COMMIT_TICKET_PATTERN = /\(#(\d+)\)\s*$/;

/**
 * @summary Collects every ticket id a PR body declares, honoring the house multi-id convention.
 *
 * `Related: epic <id1> · <id2> · <id3>` declares all three — the keyword opens the line and
 * every `#N` to end-of-line counts. Capture is bounded to the keyword's own line so trailing
 * prose on later lines never widens the declared set.
 *
 * @param {String} body Pull-request body text.
 * @returns {Set<String>} Declared ticket numbers as strings (no `#`).
 */
export function parseDeclaredTickets(body) {
    const declared = new Set();

    for (const match of String(body || '').matchAll(DECLARED_TICKET_LINE_PATTERN)) {
        for (const id of match[0].matchAll(/#(\d+)/g)) {
            declared.add(id[1])
        }
    }

    return declared
}

/**
 * @summary Finds commits whose claimed ticket the body does not declare.
 *
 * This is COMMIT/BODY AGREEMENT only. It says nothing about branch ancestry: a repointed
 * close-target produces these mismatches on a perfectly healthy branch, which is why the caller
 * treats the result as a named warning about the squash body rather than as a stacking verdict.
 *
 * @param {Object[]} commits `{sha, subject}` tuples from the PR's commit list.
 * @param {Set<String>} declared Tickets the body declares ({@link parseDeclaredTickets}).
 * @returns {Array<{sha: String, ticket: String, subject: String}>}
 */
export function findAgreementMismatches(commits, declared) {
    return (Array.isArray(commits) ? commits : [])
        .map(commit => {
            const subject = String(commit?.subject || '');
            const ticket  = subject.match(COMMIT_TICKET_PATTERN);

            return ticket && !declared.has(ticket[1])
                ? {sha: String(commit?.sha || '').slice(0, 10), ticket: ticket[1], subject: subject.slice(0, 72)}
                : null
        })
        .filter(Boolean)
}

/**
 * @summary Builds the non-failing agreement warning named by the split-check contract.
 *
 * The message states the squash-body consequence — concatenated commit subjects land in `dev`
 * provenance verbatim — and never claims anything about branch ancestry: that question is answered
 * by {@link findStackedParent} from observable facts, not by which tickets a commit names.
 *
 * @param {Object} params
 * @param {Array<{sha: String, ticket: String, subject: String}>} params.mismatches
 *   Output of {@link findAgreementMismatches}.
 * @param {String} params.deliveredList Comma-separated declared tickets, e.g. `#101, #102`.
 * @returns {String}
 */
export function buildAgreementWarning({mismatches, deliveredList}) {
    const rows = mismatches
        .map(m => `- \`${m.sha}\` claims **#${m.ticket}** — \`${m.subject}\``)
        .join('\n');

    return [
        '**Commit/ticket agreement warning** (informational — this does NOT mean the PR is stacked):',
        '',
        rows,
        '',
        `This PR declares ${deliveredList}. Under squash-merge the concatenated commit subjects land `,
        `in \`dev\` verbatim, so #${mismatches[0]?.ticket ?? ''} will appear in \`dev\` provenance without having been `,
        'delivered here. If a commit above belongs to this PR, add its ticket as `Related: #N`; ',
        'if it is leftover history, consider a rebase before merge.'
    ].join('\n')
}

/**
 * @summary Detects stacking the only sound way: a sibling OPEN PR whose head sits inside this
 * branch's exclusive range.
 *
 * **Why not the merge-base ancestry test the ticket prescribed.** A fixture falsified it before
 * this module shipped: a branch cut from unmerged work has a merge-base that IS an ancestor of
 * the base — the parent's own commits live strictly between — so the prescribed test waves through
 * exactly the case it was written to catch. What IS observable: every commit in `origin/base..HEAD`
 * that is also the head of another OPEN pull request is a commit this PR did not author, which is
 * the definition of stacked, with the parent named by number.
 *
 * Known limit, directional and safe: stacking onto a closed PR or a bare branch is invisible
 * here, because nothing open names it.
 *
 * @param {Object} params
 * @param {String[]} params.rangeCommits Commit shas in `origin/base..HEAD`, OLDEST FIRST — the
 *   caller reverses `git log`'s newest-first output at the boundary, and this order is what makes
 *   the returned parents oldest-first too.
 * @param {Array<{number: Number, headSha: String, headRefName: String}>} params.openPullRequests
 *   All open PRs in the repository.
 * @param {Number|String} [params.excludePrNumber] The PR under review — excluded so a run never
 *   detects “stacked on myself”.
 * @returns {{stacked: Boolean, parents: Array<{number: Number, headRefName: String, sha: String}>}}
 *   Every detected parent ordered by cut position (oldest-first), each carrying its matched head
 *   sha so the caller's rebase instruction names the exact commit.
 */
export function findStackedParent({rangeCommits, openPullRequests, excludePrNumber}) {
    const selfNumber = excludePrNumber != null ? String(excludePrNumber) : null;
    // The PR under review is itself an open PR whose head sits at the top of its own range;
    // without this exclusion every run detects "stacked on myself".
    const commits = Array.isArray(rangeCommits) ? rangeCommits : [];
    const opens   = (Array.isArray(openPullRequests) ? openPullRequests : [])
        .filter(pull => selfNumber === null || String(pull?.number) !== selfNumber);

    // Walk the range in order (not the API's arbitrary PR ordering) so multiple stacked parents
    // come back oldest-first and the cut-point arithmetic has a deterministic answer.
    const parents = [];

    for (const sha of commits) {
        const pull = opens.find(candidate => candidate?.headSha && candidate.headSha === sha);

        if (pull) {
            parents.push({number: pull.number, headRefName: String(pull.headRefName || ''), sha})
        }
    }

    return {stacked: parents.length > 0, parents}
}

/**
 * @summary Builds the stacked refusal's stderr text from the detected parents.
 *
 * Pure so the DIAGNOSTIC — the part that tells an author exactly how to recover — is unit-covered
 * like the verdict behind it. The cut-point arithmetic lives here and nowhere else: rebase --onto
 * origin/<base> <cut> replays every commit AFTER <cut>, so cutting at the OLDEST parent's head
 * drops the entire stacked chain in one command, even three deep.
 *
 * @param {Object} params
 * @param {Array<{number: Number, headRefName: String, sha: String}>} params.parents
 *   Output of {@link findStackedParent}, oldest-first by cut position.
 * @param {String} params.baseBranch The intended base branch name.
 * @returns {String}
 */
export function buildStackedRefusal({parents, baseBranch}) {
    const named = parents.map(parent =>
        `- commit ${parent.sha.slice(0, 10)} is the head of open PR #${parent.number} (\`${parent.headRefName}\`)`
    );
    const cutSha = String(parents[0]?.sha || '').slice(0, 10);

    return [
        `[stacking-guard] STACKED (exit 1): this branch contains ${parents.length} open sibling PR head(s), oldest first:`,
        ...named,
        `— this branch was cut from stacked work, not off \`${baseBranch}\`.`,
        'Fix: git rebase --onto origin/' + baseBranch + ' ' + cutSha + ' <this-branch>, then push --force-with-lease.'
    ].join('\n')
}
