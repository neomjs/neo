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
 * @see buildScripts/util/lintPrStacking.mjs — the committed CLI orchestrating these helpers
 * @see .github/workflows/agent-pr-body-lint.yml — the calling workflow step
 */

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

    for (const match of String(body || '').matchAll(/\b(?:Resolves|Refs|Related)\s*(?:#|:)[^\n]*/gi)) {
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
            const ticket  = subject.match(/\(#(\d+)\)\s*$/);

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
 * @param {String[]} params.rangeCommits Commit shas in `origin/base..HEAD`, oldest first.
 * @param {Array<{number: Number, headSha: String, headRefName: String}>} params.openPullRequests
 *   All open PRs in the repository.
 * @param {Number|String} [params.excludePrNumber] The PR under review — excluded so a run never
 *   detects “stacked on myself”.
 * @returns {{stacked: Boolean, parent: {number: Number, headRefName: String}|null}}
 */
export function findStackedParent({rangeCommits, openPullRequests, excludePrNumber}) {
    const selfNumber = excludePrNumber != null ? String(excludePrNumber) : null;
    // The PR under review is itself an open PR whose head sits at the top of its own range;
    // without this exclusion every run detects "stacked on myself".
    const inRange = new Set(Array.isArray(rangeCommits) ? rangeCommits : []);
    const opens   = (Array.isArray(openPullRequests) ? openPullRequests : [])
        .filter(pull => selfNumber === null || String(pull?.number) !== selfNumber);

    for (const pull of opens) {
        if (pull?.headSha && inRange.has(pull.headSha)) {
            return {stacked: true, parent: {number: pull.number, headRefName: String(pull.headRefName || '')}}
        }
    }

    return {stacked: false, parent: null}
}
