#!/usr/bin/env node

/**
 * @summary The stacked-PR guard's owning implementation: decides stacking from the one sound
 * observable — a sibling OPEN PR head inside this branch's exclusive range — and reports
 * commit/ticket agreement separately, non-failing.
 *
 * **Why a committed script and not inline workflow JS.** The guard previously lived inline in
 * `agent-pr-body-lint.yml` as a ticket-proxy with failures in both directions. The repo's doctrine
 * ("ONE OWNING IMPLEMENTATION", same step shape as `validatePrBody`) is that gates run as
 * committed code so local and hosted verdicts cannot diverge — and so the decision helpers carry
 * real unit arms instead of trusting an untestable YAML block.
 *
 * **Input contract.** One JSON document on **stdin**:
 *
 * ```
 * {
 *   "prNumber": 17721,
 *   "body": "<full PR body text>",
 *   "commits": [{ "sha": "<full sha>", "subject": "<first line>" }],
 *   "openPullRequests": [{ "number": 1, "headSha": "<sha>", "headRefName": "<branch>" }]
 * }
 * ```
 *
 * `commits` MUST be exactly `origin/<base>..HEAD` — the exclusive range is the population the
 * stacking question is about. Authentication stays in the caller (the workflow's already-
 * authenticated client), so this script needs no token and no network.
 *
 * **Verdicts.**
 * - *Stacked* (exit 1): an open sibling PR's head is among the exclusive commits; the diagnostic
 *   names the parent PR and branch, with the rebase fix.
 * - *Agreement warnings* (stdout, non-failing): commits claiming tickets the body does not declare
 *   are listed with their squash-provenance consequence. A repointed close-target on a healthy
 *   branch produces these by design; failing them re-created a known false positive.
 *
 * @see buildScripts/util/prStackingGuard.mjs — the pure helpers this CLI orchestrates
 * @see .github/workflows/agent-pr-body-lint.yml — the calling workflow step
 */

import {findAgreementMismatches, findStackedParent, parseDeclaredTickets} from './prStackingGuard.mjs';

let raw = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
    let payload;

    try {
        payload = JSON.parse(raw)
    } catch (error) {
        console.error(`[stacking-guard] stdin was not valid JSON: ${error.message}`);
        process.exit(2)
    }

    const {prNumber, body, commits, openPullRequests} = payload ?? {};

    if (!Array.isArray(commits)) {
        console.error('[stacking-guard] `commits` (exclusive range, oldest first) is required');
        process.exit(2)
    }

    // ── Stacking verdict ─────────────────────────────────────────────────────────────────
    const {stacked, parent} = findStackedParent({rangeCommits: commits.map(commit => commit.sha), openPullRequests});

    if (stacked) {
        console.error([
            `[stacking-guard] STACKED (exit 1): commit ${commits.at(-1)?.sha.slice(0, 10)} is the head of open PR #${parent.number}`,
            `(\`${parent.headRefName}\`) — this branch was cut from that PR's head, not off \`dev\`.`,
            'Fix: git rebase --onto origin/dev <cut-point> <this-branch>, then push --force-with-lease.'
        ].join('\n'));

        process.exit(1)
    }

    console.log(`[stacking-guard] OK — ${commits.length} exclusive commit(s); none is an open sibling PR head.`);

    // ── Agreement (non-failing) ──────────────────────────────────────────────────────────
    if (!body) {
        return
    }

    const declared   = parseDeclaredTickets(body);
    const mismatches = findAgreementMismatches(commits, declared);

    if (mismatches.length > 0) {
        const deliveredList = [...declared].map(t => `#${t}`).join(', ') || '(none)';
        const warning       = buildAgreementWarning({mismatches, deliveredList});

        console.log(`\n${warning}`)
    }
});
