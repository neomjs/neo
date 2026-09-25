import {test, expect} from '@playwright/test';

import {
    CLAIM_WINDOW_DAYS,
    claimText,
    decideReply,
    earlierClaim,
    isClaim,
    isWithdrawal,
    pickAlternatives,
    renderReply,
    replyMarker
} from '../../../../../buildScripts/util/claimResponse.mjs';

const REPO_URL = 'https://github.com/neomjs/neo';

let nextId = 1;

/**
 * A REST-shaped issue comment. `association` defaults to an outside contributor.
 */
const comment = (login, createdAt, body, {association = 'NONE', type = 'User'} = {}) => ({
    author_association: association,
    body,
    created_at        : createdAt,
    id                : nextId++,
    user              : {login, type}
});

const gfiIssue = (overrides = {}) => ({
    assignees: [],
    labels   : [{name: 'good first issue'}, {name: 'hacktoberfest'}],
    number   : 19143,
    ...overrides
});

// Fixtures are real claim threads: a first claim, its assignment, a second claim on the assigned issue, the
// assignee's thank-you, and a claim withdrawn sixteen minutes later.
const firstClaim     = comment('first-claimant', '2026-09-23T15:40:38Z', "Hi! I'd like to work on this issue as my first contribution to Neo.mjs. I'd like to claim it and work on the fix and regression test.");
const assignment     = comment('team-member', '2026-09-24T19:09:24Z', "@first-claimant, it's yours. Welcome, and sorry for the wait: your comment reached nobody for a day.", {association: 'MEMBER'});
const secondClaim    = comment('second-claimant', '2026-09-25T07:59:44Z', "I'd like to claim this — first-time Neo.mjs contributor. Planning the one-line `getHiddenState()` fix plus a Playwright unit spec.");
const assigneeThanks = comment('first-claimant', '2026-09-25T08:11:20Z', "> [@first-claimant](https://github.com/first-claimant), it's yours. Welcome\n> \n> Open the PR against `dev`.\n\nThanks! I appreciate the assignment and the detailed setup instructions. I'll follow the steps, write the regression test, and work on the fix. I'll ask here if I run into any issues.");
const withdrawnClaim = comment('withdrawn-claimant', '2026-09-24T18:20:27Z', "Hi, I'd like to work on this. I'll submit a focused test-only PR shortly.");
const withdrawal     = comment('withdrawn-claimant', '2026-09-24T18:36:29Z', "I'm stepping back from this one because the repository requires formal assignment before work starts, and I can't self-assign it. Please consider it available for another contributor.");

const CANDIDATES = [19129, 19132, 19133, 19134, 19137, 19140];

test.describe('buildScripts/util/claimResponse', () => {
    test.describe('isClaim reads intent, not keywords', () => {
        test('the three real claims are claims', () => {
            expect(isClaim(firstClaim.body)).toBe(true);
            expect(isClaim(secondClaim.body)).toBe(true);
            expect(isClaim(withdrawnClaim.body)).toBe(true)
        });

        test('the common shapes are claims', () => {
            for (const body of ['Can I work on this?', 'Please assign this to me.', '/assign', "I'll take this one.", "I'm interested in working on it", 'May I be assigned?']) {
                expect(isClaim(body), body).toBe(true)
            }
        });

        test("the assignee's thank-you is not a claim, although it says \"work on the fix\" and quotes \"it's yours\"", () => {
            expect(isClaim(assigneeThanks.body)).toBe(false);
            expect(claimText(assigneeThanks.body)).not.toContain("it's yours")
        });

        test('questions, refusals and code are not claims', () => {
            for (const body of ['How do I run only my spec?', 'Is this still available?', "I don't want to work on this, just a note.", '```\n// I\'d like to work on this\n```']) {
                expect(isClaim(body), body).toBe(false)
            }
        });
    });

    test('isWithdrawal recognises a claim given back', () => {
        expect(isWithdrawal(withdrawal.body)).toBe(true);
        expect(isWithdrawal('Please unassign me, I ran out of time.')).toBe(true);
        expect(isWithdrawal(withdrawnClaim.body)).toBe(false);
        expect(isWithdrawal(secondClaim.body)).toBe(false)
    });

    test.describe('decideReply', () => {
        test('the first claimant is first in line and may start now, with no promised time', () => {
            const reply = decideReply({comment: firstClaim, comments: [firstClaim], issue: gfiIssue(), candidates: CANDIDATES, repoUrl: REPO_URL});

            expect(reply).toContain("@first-claimant, and welcome! You're first in line, so you can start now.");
            expect(reply).toContain('can take a while');
            expect(reply).not.toMatch(/\b(hour|day|minute)s?\b/);
            expect(reply).toContain(replyMarker('first-claimant'))
        });

        test('a claim on an assigned issue names the holder once and offers rotated alternatives', () => {
            const reply = decideReply({
                comment         : secondClaim,
                comments        : [firstClaim, assignment, secondClaim],
                issue           : gfiIssue({assignees: [{login: 'first-claimant'}]}),
                openPullRequests: [{number: 19200, author: 'first-claimant'}],
                candidates      : [...CANDIDATES, 19143],
                repoUrl         : REPO_URL
            });

            // The assignee also wrote the open PR, and claimed first: each holder is named once, and the PR still counts.
            // Holders are linked, never @-mentioned; only the claimant is.
            expect(reply).toContain("This one is taken: it's assigned to [first-claimant](https://github.com/first-claimant) and #19200 is open for it.");
            expect(reply.match(/first-claimant\]/g).length).toBe(1);
            expect(reply).not.toContain('@first-claimant');
            expect(reply).toContain('@second-claimant');
            expect(reply).not.toContain('#19143');
            expect(reply.match(/^- #\d+$/gm).length).toBe(3);
            expect(reply).toContain(encodeURIComponent('no:assignee -linked:pr'))
        });

        test("no reply to the assignee, the team, a bot, a pull request, or an uncurated issue", () => {
            const assigned = gfiIssue({assignees: [{login: 'first-claimant'}]});

            expect(decideReply({comment: assigneeThanks, comments: [firstClaim, assigneeThanks], issue: assigned, repoUrl: REPO_URL})).toBeNull();
            expect(decideReply({comment: comment('first-claimant', '2026-09-25T09:00:00Z', 'Can I work on this?'), issue: assigned, repoUrl: REPO_URL})).toBeNull();
            expect(decideReply({comment: comment('team-member', '2026-09-25T09:00:00Z', "I'll take this.", {association: 'MEMBER'}), issue: gfiIssue(), repoUrl: REPO_URL})).toBeNull();
            expect(decideReply({comment: comment('renovate[bot]', '2026-09-25T09:00:00Z', "I'll take this.", {type: 'Bot'}), issue: gfiIssue(), repoUrl: REPO_URL})).toBeNull();
            expect(decideReply({comment: secondClaim, issue: gfiIssue({pull_request: {url: 'x'}}), repoUrl: REPO_URL})).toBeNull();
            expect(decideReply({comment: secondClaim, issue: gfiIssue({labels: [{name: 'bug'}]}), repoUrl: REPO_URL})).toBeNull()
        });

        test('one reply per claimant: a bot-authored marker suppresses a second one, a pasted marker does not', () => {
            const
                issue  = gfiIssue(),
                again  = comment('second-claimant', '2026-09-25T10:00:00Z', 'Can I work on this?'),
                ours   = comment('github-actions[bot]', '2026-09-25T08:00:10Z', `reply\n${replyMarker('second-claimant')}`, {type: 'Bot'}),
                pasted = comment('someone', '2026-09-25T08:00:10Z', `hi ${replyMarker('second-claimant')}`);

            expect(decideReply({comment: again, comments: [secondClaim, ours, again], issue, repoUrl: REPO_URL})).toBeNull();
            expect(decideReply({comment: again, comments: [secondClaim, pasted, again], issue, repoUrl: REPO_URL})).toContain(replyMarker('second-claimant'))
        });

        test('a withdrawn claim frees the issue: the next claimant is first in line', () => {
            const next = comment('newcomer', '2026-09-24T19:00:00Z', "I'd like to work on this.");

            expect(decideReply({comment: next, comments: [withdrawnClaim, withdrawal, next], issue: gfiIssue({number: 19140}), repoUrl: REPO_URL})).toContain("You're first in line");
            expect(earlierClaim({claimant: 'newcomer', comment: next, comments: [withdrawnClaim, next]}).user.login).toBe('withdrawn-claimant')
        });

        test(`an unassigned earlier claim holds for ${CLAIM_WINDOW_DAYS} days, then lapses`, () => {
            const
                recent = comment('newcomer', '2026-09-26T15:00:00Z', 'Can I take this?'),
                late   = comment('newcomer', '2026-10-01T15:41:00Z', 'Can I take this?');

            expect(decideReply({comment: recent, comments: [firstClaim, recent], issue: gfiIssue(), candidates: CANDIDATES, repoUrl: REPO_URL})).toContain('This one is taken: [first-claimant](https://github.com/first-claimant) asked first.');
            expect(decideReply({comment: late, comments: [firstClaim, late], issue: gfiIssue(), repoUrl: REPO_URL})).toContain("You're first in line")
        });

        test("the claimant's own open pull request holds nothing against them", () => {
            const reply = decideReply({comment: firstClaim, comments: [firstClaim], issue: gfiIssue(), openPullRequests: [{number: 19200, author: 'first-claimant'}], repoUrl: REPO_URL});

            expect(reply).toContain("You're first in line")
        });
    });

    test.describe('pickAlternatives', () => {
        test('excludes the claimed issue, caps the count and is deterministic per claimant', () => {
            const picks = pickAlternatives({candidates: [...CANDIDATES, 19143], exclude: 19143, seed: 'second-claimant'});

            expect(picks.length).toBe(3);
            expect(picks).not.toContain(19143);
            expect(pickAlternatives({candidates: CANDIDATES, exclude: 19143, seed: 'second-claimant'})).toEqual(picks);
            expect(pickAlternatives({candidates: [], exclude: 1, seed: 'x'})).toEqual([])
        });

        test('different claimants are not all sent to the same first ticket', () => {
            const firsts = new Set(['second-claimant', 'first-claimant', 'withdrawn-claimant', 'another-newcomer', 'newcomer'].map(seed =>
                pickAlternatives({candidates: CANDIDATES, exclude: 19143, seed})[0]
            ));

            expect(firsts.size).toBeGreaterThan(1)
        });
    });

    test('renderReply says so when nothing else is free', () => {
        const reply = renderReply({claimant: 'second-claimant', holders: [{kind: 'assignee', login: 'first-claimant'}], alternatives: [], label: 'good first issue', repoUrl: REPO_URL});

        expect(reply).toContain('No other `good first issue` issue is free right now.');
        expect(reply).toContain(`${REPO_URL}/blob/dev/CONTRIBUTING.md`)
    });
});
