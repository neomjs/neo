#!/usr/bin/env node

/**
 * @summary The stacked-PR guard's owning implementation: decides stacking from the one sound
 * observable — a sibling OPEN PR head inside this branch's exclusive range — and reports
 * commit/ticket agreement separately, non-failing.
 *
 * **Why a committed script and not inline workflow JS.** Two reasons, both load-bearing. First,
 * the repo's doctrine: gates run as committed code so local and hosted verdicts cannot diverge,
 * and the decision helpers carry real unit arms instead of trusting an untestable YAML block.
 * Second, discovered while landing this file: the extraction inventory derives launch roots from
 * workflow `run:` commands, and a script referenced only inside github-script JS is invisible to
 * every census — the exact invisibility class this module exists to end elsewhere.
 *
 * **Inputs** (environment, provided by the calling workflow step):
 * - `PR_NUMBER` — the pull request under lint.
 * - `BASE_BRANCH` (default `dev`) — the intended base branch.
 * - `GITHUB_TOKEN` — read-only API access (body, commit list, open-PR heads).
 *
 * Requires `fetch-depth: 0` so `origin/<base>` exists locally.
 *
 * **Verdicts.**
 * - *Stacked* (exit 1): an open sibling PR's head is among the exclusive commits; the diagnostic
 *   names the parent PR and branch, with the rebase fix.
 * - *Agreement warnings* (stdout, non-failing): commits claiming tickets the body does not declare
 *   are listed with their squash-provenance consequence. A repointed close-target on a healthy
 *   branch produces these by design; failing them once re-created a known false positive.
 *
 * @see buildScripts/../ai/scripts/lint/prStackingGuard.mjs — the pure helpers this CLI orchestrates
 * @see .github/workflows/agent-pr-body-lint.yml — the calling workflow step
 */

import {execSync} from 'node:child_process';
import process    from 'node:process';

import {
    buildAgreementWarning,
    findAgreementMismatches,
    findStackedParent,
    parseDeclaredTickets
} from './prStackingGuard.mjs';

const sh = command => execSync(command, {encoding: 'utf8'}).trim();
const gh = command => execSync(`gh api ${command}`, {encoding: 'utf8'});

const guard = () => {
    const prNumber   = process.env.PR_NUMBER;
    const baseBranch = process.env.BASE_BRANCH || 'dev';

    if (!prNumber) {
        console.error('[stacking-guard] PR_NUMBER is required');
        process.exit(2)
    }

    // ── Facts ────────────────────────────────────────────────────────────────────────────
    // Unit-separator pairing survives any subject content, unlike line-splitting on \n.
    const rangeCommits = sh(
        `git log --format='%H%x1f%s' "origin/${baseBranch}..HEAD"`
    )
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [sha, ...rest] = line.split('\x1f');

            return {sha, subject: rest.join('\x1f')}
        });

    const openPullRequests = gh(
        `"repos/{owner}/{repo}/pulls?state=open&per_page=100" --jq '.[] | {number: .number, headSha: .head.sha, headRefName: .head.ref}'`
    )
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));

    const bodyText = gh(`"repos/{owner}/{repo}/pulls/${prNumber}" --jq .body`);

    // ── Stacking verdict ─────────────────────────────────────────────────────────────────
    const {stacked, parent} = findStackedParent({
        rangeCommits   : rangeCommits.map(commit => commit.sha),
        openPullRequests,
        excludePrNumber: Number(prNumber)
    });

    if (stacked) {
        console.error([
            `[stacking-guard] STACKED (exit 1): commit ${rangeCommits.at(-1)?.sha.slice(0, 10)} is the head of open PR #${parent.number}`,
            `(\`${parent.headRefName}\`) — this branch was cut from that PR's head, not off \`${baseBranch}\`.`,
            'Fix: git rebase --onto origin/' + baseBranch + ' <cut-point> <this-branch>, then push --force-with-lease.'
        ].join('\n'));

        process.exit(1)
    }

    console.log(`[stacking-guard] OK — ${rangeCommits.length} exclusive commit(s); none is an open sibling PR head.`);

    // ── Agreement (non-failing) ──────────────────────────────────────────────────────────
    const declared   = parseDeclaredTickets(bodyText);
    const mismatches = findAgreementMismatches(rangeCommits, declared);

    if (mismatches.length > 0) {
        const deliveredList = [...declared].map(t => `#${t}`).join(', ') || '(none)';
        const warning       = buildAgreementWarning({mismatches, deliveredList});

        console.log(`\n${warning}`)
    }
};


guard()
