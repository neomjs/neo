import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import path           from 'node:path';
import {test, expect} from '@playwright/test';
import * as yaml      from 'js-yaml';

import {
    CLAIM_RELEASE_SINCE,
    CLAIM_WINDOW_DAYS,
    TEAM_ASSOCIATIONS,
    changedCloseTargets,
    claimRecords,
    claimText,
    closeTargets,
    decideClaim,
    decidePullRequestRelease,
    decidePullRequestTarget,
    decideReply,
    decideTargetRemoval,
    decideWithdrawal,
    earlierClaim,
    holders,
    isClaim,
    isTeamPermission,
    isWithdrawal,
    overlapMarker,
    pickAlternatives,
    releaseMarker,
    renderOverlapNotice,
    renderReply,
    renderWithdrawalReply,
    replyMarker,
    staleAssignees,
    withdrawalMarker
} from '../../../../../buildScripts/util/claimResponse.mjs';
import {decideClaimHint} from '../../../../../buildScripts/util/claimGuidance.mjs';
import {standing}        from '../../../../../buildScripts/util/contributorStanding.mjs';

const REPO_URL = 'https://github.com/neomjs/neo';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An ISO timestamp `days` after `base`, so a holding or lapsing case tracks {@link CLAIM_WINDOW_DAYS} instead of
 * repeating its number. A case that hard-codes the offset silently tests the old window after the constant moves.
 */
const daysAfter = (base, days) => new Date(Date.parse(base) + days * DAY_MS).toISOString();

let nextId = 1;

/**
 * A REST-shaped issue comment. `association` defaults to an outside contributor.
 */
const comment = (login, createdAt, body, {association = 'NONE', id, type = 'User'} = {}) => ({
    author_association: association,
    body,
    created_at        : createdAt,
    id                : nextId++,
    user              : {login, type, ...(Number.isSafeInteger(id) ? {id} : {})}
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

        test('participle-lead, progressive and #N / row-target contributor claims are claims', () => {
            for (const body of [
                "I'll take the `examples/layout/form` row: the leftover `child` in `src/layout/Form.mjs`'s `applyChildAttributes`, with a unit test.",
                "I'll also take the `examples/component/wrapper/openStreetMaps` row, as a separate PR: ...",
                'Dude i am taking the examples/calendar/weekview row for now.',
                'Claiming #19930. Working on the calendar/weekview fix.',
                "I'm starting work on #19931: reproduce the selector-container failure, keep day-view initialization safe while its bound formatter is unavailable, and verify the regression in the unit tier and the rendered example.",
                'Claiming #19933. Working on the popover fix in `afterSetIsVnodeInitializing`.',
                'Claiming this one, so nobody duplicates the work.'
            ]) {
                expect(isClaim(body), body).toBe(true)
            }
        });

        test("the assignee's thank-you is not a claim, although it says \"work on the fix\" and quotes \"it's yours\"", () => {
            expect(isClaim(assigneeThanks.body)).toBe(false);
            expect(claimText(assigneeThanks.body)).not.toContain("it's yours")
        });

        test('questions, refusals and code are not claims', () => {
            for (const body of [
                'How do I run only my spec?',
                'Is this still available?',
                'Is anyone claiming this?',
                'Are you taking #19930?',
                "I don't want to work on this, just a note.",
                "I'm starting the dev server with `npm run server-start` and the weekview throws a TypeError.",
                "I'm starting the example in Firefox and the popover never opens.",
                'I am taking the same steps as in the description and it still fails on dev.',
                "I'll take the feedback into account.",
                'Let me take the screenshot again, the first one was blurry.',
                'Taking the example from the docs, I get this error:',
                'Picking up the thread from yesterday: the bug still reproduces on dev.',
                "I'm handling the same error in my own app; here is the stack trace.",
                "I'm working on the docs side of this in another repo, not the fix.",
                '```\n// I\'d like to work on this\n```'
            ]) {
                expect(isClaim(body), body).toBe(false)
            }
        });

        test('a claim typed with an apostrophe look-alike (’ ‘ ʼ ´) reads as its ASCII spelling (#21057)', () => {
            expect(claimText('I’d like to take this.')).toBe("I'd like to take this.");

            for (const body of [
                'I’d like to take this.',
                'I’m working on this',
                'I’ll take this',
                'I‘d like to take this.',
                'Iʼd like to take this.',
                'I´d like to take this.'
            ]) {
                expect(isClaim(body), body).toBe(true)
            }

            // The fold makes no claim that the ASCII spelling would not make
            for (const body of ['I don’t want to work on this, just a note.', '```\n// I’d like to work on this\n```']) {
                expect(isClaim(body), body).toBe(false)
            }
        });
    });

    test.describe('decideClaimHint guidance without ownership (#21194)', () => {
        const
            now     = '2026-11-16T21:30:00Z',
            issue   = gfiIssue({number: 42, state: 'open'}),
            unknown = comment('outside-dev', '2026-11-16T21:18:45Z',
                'I can help after we agree on scope and payment. Work will not begin until we agree.', {id: 123}),
            marker  = '<!-- claim-guidance:v1 {"repo":"neomjs/neo","issue":42,"to":123} -->',
            hint    = (overrides = {}) => decideClaimHint({
                comment: unknown, comments: [unknown], events: [], issue, now, openPullRequests: [], repoUrl: REPO_URL, ...overrides
            });

        test('returns guidance, with a separate account-scoped receipt, for unknown comments on either curated label', () => {
            for (const body of [unknown.body, 'How do I run only my spec?']) {
                const note = {...unknown, body};
                expect(isClaim(body)).toBe(false);
                const result = hint({comment: note, comments: [note]});
                expect(typeof result).toBe('string');
                expect(result).toContain('`/claim`');
                expect(result).toContain(`${REPO_URL}/blob/dev/CONTRIBUTING.md`);
                expect(result.split('\n')).toContain(marker);
                expect(result).not.toContain(replyMarker('outside-dev'));
                expect(result).not.toContain(withdrawalMarker('outside-dev'));
                expect(result).not.toContain('<!-- neo-claim:');
            }
            expect(hint({issue: {...issue, labels: [{name: 'help wanted'}]}})).toEqual(expect.any(String));
        });

        test('does not guide recognized claims, releases, team comments, bots, or ineligible targets', () => {
            for (const body of ['/claim', "I'd like to work on this.", '/unclaim', 'Please unassign me.']) {
                expect(hint({comment: {...unknown, body}}), body).toBeNull();
            }
            for (const association of ['MEMBER', 'COLLABORATOR', 'OWNER']) {
                expect(hint({comment: {...unknown, author_association: association}}), association).toBeNull();
            }
            expect(hint({comment: {...unknown, user: {...unknown.user, type: 'Bot'}}})).toBeNull();
            for (const target of [
                {...issue, state: 'closed'}, {...issue, labels: [{name: 'bug'}]}, {...issue, pull_request: {}},
                {...issue, assignees: undefined}
            ]) {
                expect(hint({issue: target})).toBeNull();
            }
        });

        test('requires numeric account identity and a valid current observation with complete holder inputs', () => {
            for (const id of [undefined, 0, -1, 1.5, '123', Number.MAX_SAFE_INTEGER + 1]) {
                expect(hint({comment: {...unknown, user: {...unknown.user, id}}}), String(id)).toBeNull();
            }
            for (const at of [undefined, null, 'not-a-date', '2026-11-16T21:18:44Z']) {
                expect(hint({now: at}), String(at)).toBeNull();
            }
            for (const key of ['comments', 'events', 'openPullRequests']) {
                expect(hint({[key]: undefined}), key).toBeNull();
            }
            expect(hint()).toEqual(expect.any(String));
        });

        test('every current assignee blocks guidance, even a stale outside assignee or the commenter', () => {
            const oldClaim = comment('silent-dev', daysAfter(now, -CLAIM_WINDOW_DAYS - 1), '/claim', {id: 456});
            expect(staleAssignees({
                comment: {...unknown, created_at: now}, comments: [oldClaim, unknown], events: [],
                issue  : {...issue, assignees: [oldClaim.user]}, repository: 'neomjs/neo'
            })).toEqual(['silent-dev']);
            for (const assignee of [oldClaim.user, unknown.user, {login: 'maintainer', id: 999}]) {
                expect(hint({issue: {...issue, assignees: [assignee]}, comments: [oldClaim, unknown]})).toBeNull();
            }
        });

        test('uses current holder state, including own claims and upstream PRs newer than the triggering comment', () => {
            const
                ownClaim   = comment('outside-dev', '2026-11-16T21:20:00Z', '/claim', {id: 123}),
                otherClaim = comment('other-dev', '2026-11-16T21:20:00Z', '/claim', {id: 456}),
                release    = comment('other-dev', '2026-11-16T21:25:00Z', '/unclaim', {id: 456}),
                expired    = comment('silent-dev', daysAfter(now, -CLAIM_WINDOW_DAYS - 1), '/claim', {id: 789});
            for (const claim of [ownClaim, otherClaim]) {
                expect(hint({comments: [unknown, claim]})).toBeNull();
            }
            expect(hint({comments: [unknown, otherClaim, release]})).toEqual(expect.any(String));
            expect(hint({comments: [expired, unknown]})).toEqual(expect.any(String));
            expect(hint({comments: [unknown, otherClaim], events: [{
                assignee: otherClaim.user, created_at: release.created_at, event: 'unassigned'
            }]})).toEqual(expect.any(String));
            for (const author of ['outside-dev', 'other-dev']) {
                expect(hint({openPullRequests: [{author, number: 43, repository: 'neomjs/neo'}]})).toBeNull();
            }
            expect(hint({openPullRequests: [{author: 'other-dev', number: 43, repository: 'outside/neo'}]})).toEqual(expect.any(String));
        });

        test('deduplicates replay and account renames, while keeping repository, issue and other accounts independent', () => {
            const
                reply   = comment('github-actions[bot]', '2026-11-16T21:19:00Z', hint(), {type: 'Bot'}),
                renamed = comment('renamed-dev', '2026-11-16T21:21:00Z', 'Is this available?', {id: 123});
            expect(unknown.id).not.toBe(unknown.user.id);
            expect(hint({comments: [unknown, reply]})).toBeNull();
            expect(hint({comment: renamed, comments: [unknown, reply, renamed]})).toBeNull();
            expect(hint({
                comment: {...renamed, user: {...renamed.user, login: 'outside-dev', id: 456}}, comments: [unknown, reply]
            })).toEqual(expect.any(String));
            expect(hint({issue: {...issue, number: 43}, comments: [unknown, reply]})).toEqual(expect.any(String));
            expect(hint({repoUrl: 'https://github.com/neomjs/neo-agent-brain', comments: [unknown, reply]})).toEqual(expect.any(String));
            expect(hint({repoUrl: 'https://github.com/NEOMJS/NEO', comments: [unknown, reply]})).toBeNull();
        });

        test('ignores copied, other-bot, inline, malformed and unknown-version guidance receipts', () => {
            const genuine = comment('github-actions[bot]', '2026-11-16T21:19:00Z', marker, {type: 'Bot'});
            expect(hint({comments: [unknown, genuine]})).toBeNull();
            for (const forged of [
                {...genuine, user: {login: 'outside-dev', type: 'User', id: 123}},
                {...genuine, user: {login: 'other-app[bot]', type: 'Bot'}},
                {...genuine, user: {login: 'github-actions[bot]', type: 'User'}},
                {...genuine, body: `An example: ${marker}`},
                {...genuine, body: marker.replace(':v1 ', ':v2 ')},
                {...genuine, body: marker.replace('"to":123', '"to":"123"')},
                {...genuine, body: marker.replace('"to":123', '"to":456')},
                {...genuine, body: marker.replace('{"repo"', '{broken "repo"')}
            ]) {
                expect(hint({comments: [unknown, forged]}), forged.body).toEqual(expect.any(String));
            }
        });

        test('a hint reserves nothing and cannot suppress the same contributor or another contributor later claiming', () => {
            const reply = comment('github-actions[bot]', '2026-11-16T21:19:00Z', hint(), {type: 'Bot'});
            expect(claimRecords([reply])).toEqual([]);
            for (const [login, id] of [['outside-dev', 123], ['other-dev', 456]]) {
                const
                    laterClaim = comment(login, '2026-11-16T21:22:00Z', '/claim', {id}),
                    comments   = [unknown, reply, laterClaim],
                    options    = {comment: laterClaim, comments, events: [], issue, repoUrl: REPO_URL};
                expect(earlierClaim({...options, claimant: login})).toBeNull();
                expect(holders({...options, claimant: login, repository: 'neomjs/neo'})).toEqual([]);
                const decision = decideClaim(options);
                expect(decision.assign).toBe(true);
                expect(decision.assignedBody).toContain('Assigned to you');
            }
        });
    });

    test('isTeamPermission names the team by who can write, and throws on a value that is no permission', () => {
        expect(['admin', 'maintain', 'write'].map(isTeamPermission)).toEqual([true, true, true]);
        expect(['triage', 'read', 'none'].map(isTeamPermission)).toEqual([false, false, false]);

        // An account that cannot be told apart is not an outside one
        for (const unnamed of [undefined, null, '', 'owner', 'WRITE']) {
            expect(() => isTeamPermission(unnamed)).toThrow('names no repository permission')
        }
    });

    test('isWithdrawal recognises a claim given back', () => {
        expect(isWithdrawal(withdrawal.body)).toBe(true);
        expect(isWithdrawal('Please unassign me, I ran out of time.')).toBe(true);
        expect(isWithdrawal(withdrawnClaim.body)).toBe(false);
        expect(isWithdrawal(secondClaim.body)).toBe(false)
    });

    test('isWithdrawal recognises a claim given back with an apostrophe look-alike (#21057)', () => {
        expect(isWithdrawal('Sorry, I can’t work on this anymore')).toBe(true);
        expect(isWithdrawal('I won’t continue with this')).toBe(true)
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
                openPullRequests: [{number: 19200, author: 'first-claimant', repository: 'neomjs/neo'}],
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
                claimAt         = '2026-09-23T15:40:38Z',
                participleClaim = comment('participle-claimant', daysAfter(claimAt, 0), 'Claiming #19143. Working on the fix.'),
                recent          = comment('newcomer', daysAfter(claimAt, CLAIM_WINDOW_DAYS - 1), 'Can I take this?'),
                late            = comment('newcomer', daysAfter(claimAt, CLAIM_WINDOW_DAYS + 1), 'Can I take this?');

            expect(decideReply({comment: recent, comments: [firstClaim, recent], issue: gfiIssue(), candidates: CANDIDATES, repoUrl: REPO_URL})).toContain('This one is taken: [first-claimant](https://github.com/first-claimant) asked first.');
            expect(decideReply({comment: recent, comments: [participleClaim, recent], issue: gfiIssue(), candidates: CANDIDATES, repoUrl: REPO_URL})).toContain('This one is taken: [participle-claimant](https://github.com/participle-claimant) asked first.');
            expect(decideReply({comment: late, comments: [firstClaim, late], issue: gfiIssue(), repoUrl: REPO_URL})).toContain("You're first in line")
        });

        test(`any later comment from the claimant keeps the claim: the ${CLAIM_WINDOW_DAYS} days run from their latest word`, () => {
            const
                claimAt    = '2026-10-31T10:00:00Z',
                claim      = comment('slow-claimant', claimAt, "I'd like to work on this."),
                progressAt = daysAfter(claimAt, CLAIM_WINDOW_DAYS * 2),
                progress   = comment('slow-claimant', progressAt, 'Implementation is complete; tests are in progress.'),
                second     = comment('newcomer', daysAfter(progressAt, 1), "I'd like to work on this."),
                silent     = comment('newcomer', daysAfter(progressAt, CLAIM_WINDOW_DAYS + 1), "I'd like to work on this.");

            expect(isClaim(progress.body)).toBe(false);
            expect(decideReply({comment: second, comments: [claim, progress, second], issue: gfiIssue(), candidates: CANDIDATES, repoUrl: REPO_URL})).toContain('This one is taken: [slow-claimant](https://github.com/slow-claimant) asked first.');
            expect(decideReply({comment: silent, comments: [claim, progress, silent], issue: gfiIssue(), repoUrl: REPO_URL})).toContain("You're first in line")
        });

        test("the claimant's own open pull request holds nothing against them", () => {
            const reply = decideReply({comment: firstClaim, comments: [firstClaim], issue: gfiIssue(), openPullRequests: [{number: 19200, author: 'first-claimant', repository: 'neomjs/neo'}], repoUrl: REPO_URL});

            expect(reply).toContain("You're first in line")
        });

        test('a pull request inside a fork holds nothing: only one into this repository does (#19413)', () => {
            // A draft inside the contributor's fork references the issue: its base is the fork, so it holds nothing here
            const
                claim = comment('Saadanjum01', '2026-10-05T14:17:57Z', "I'd like to take this one — PR coming shortly with the `:where()` fix and a Playwright test covering both creation orders."),
                reply = decideReply({comment: claim, comments: [claim], issue: gfiIssue(), openPullRequests: [{number: 1, author: 'Saadanjum0', repository: 'Saadanjum0/neo'}], repoUrl: REPO_URL});

            expect(reply).toContain("You're first in line");
            expect(reply).not.toContain('#1 ')
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

    test('renderReply links to the list when it has no verified alternatives', () => {
        const reply = renderReply({claimant: 'second-claimant', holders: [{kind: 'assignee', login: 'first-claimant'}], alternatives: [], label: 'good first issue', repoUrl: REPO_URL});

        expect(reply).toContain('list of open `good first issue` issues');
        expect(reply).toContain(`${REPO_URL}/blob/dev/CONTRIBUTING.md`)
    });

    test.describe(`decideClaim, single-issue cap, ${CLAIM_WINDOW_DAYS}-day expiry, unassign release and workflow script`, () => {
        test('the window is three days: a claim four days old has lapsed, and the reply names the window', () => {
            const
                claimAt    = '2026-11-01T10:00:00Z',
                oldClaim   = comment('StaleClaimant', claimAt, "I'd like to claim this issue."),
                day4Claim  = comment('day4-newcomer', daysAfter(claimAt, 4), "I'd like to work on this."),
                staleIssue = gfiIssue({assignees: [{login: 'StaleClaimant'}]});

            // The ticket's decision, not the current constant: seven days would keep this issue parked
            expect(CLAIM_WINDOW_DAYS).toBe(3);
            expect(staleAssignees({
                comment   : day4Claim,
                comments  : [oldClaim, day4Claim],
                issue     : staleIssue,
                repository: 'neomjs/neo'
            })).toEqual(['StaleClaimant']);
            expect(decideClaim({
                comment : day4Claim,
                comments: [oldClaim, day4Claim],
                issue   : staleIssue,
                repoUrl : REPO_URL
            }).assignedBody).toContain('reserves this issue for 3 days')
        });

        test('first in line with no other curated assignment gets assign: true and assignedBody while decideReply stays String|null', () => {
            const decision = decideClaim({
                candidates: CANDIDATES,
                comment   : firstClaim,
                comments  : [firstClaim],
                issue     : gfiIssue(),
                repoUrl   : REPO_URL
            });

            expect(decision.assign).toBe(true);
            expect(decision.unassign).toEqual([]);
            expect(decision.assignedBody).toContain('Assigned to you — you can start now.');
            expect(decision.assignedBody).toContain(`reserves this issue for ${CLAIM_WINDOW_DAYS} days`);
            expect(decision.assignedBody).toContain('first approve-worthy PR');
            expect(decision.assignedBody).toContain(replyMarker('first-claimant'));
            expect(decision.body).toContain("You're first in line, so you can start now.");
            expect(typeof decideReply({comment: firstClaim, comments: [firstClaim], issue: gfiIssue(), repoUrl: REPO_URL})).toBe('string')
        });

        test(`an outside-contributor assignee holds until day ${CLAIM_WINDOW_DAYS - 1} and lapses after ${CLAIM_WINDOW_DAYS} silent days unless they have an open PR or team status`, () => {
            const
                claimAt       = '2026-11-01T10:00:00Z',
                initialClaim  = comment('StaleClaimant', claimAt, "I'd like to claim this issue."),
                day6Claim     = comment('holding-newcomer', daysAfter(claimAt, CLAIM_WINDOW_DAYS - 1), "I'd like to work on this."),
                day8Claim     = comment('lapsed-newcomer', daysAfter(claimAt, CLAIM_WINDOW_DAYS + 1), "I'd like to work on this."),
                assignedIssue = gfiIssue({assignees: [{login: 'StaleClaimant'}]});

            // One day short of the window: still holds
            const day6Decision = decideClaim({
                candidates: CANDIDATES,
                comment   : day6Claim,
                comments  : [initialClaim, day6Claim],
                issue     : assignedIssue,
                repoUrl   : REPO_URL
            });

            expect(day6Decision.assign).toBe(false);
            expect(day6Decision.body).toContain("This one is taken: it's assigned to [StaleClaimant](https://github.com/StaleClaimant).");

            // Past the window with no open PR: lapses and hands over with unassign: ['StaleClaimant']
            expect(staleAssignees({
                comment   : day8Claim,
                comments  : [initialClaim, day8Claim],
                issue     : assignedIssue,
                repository: 'neomjs/neo'
            })).toEqual(['StaleClaimant']);
            expect(holders({
                claimant  : 'day8-newcomer',
                comment   : day8Claim,
                comments  : [initialClaim, day8Claim],
                issue     : assignedIssue,
                repository: 'neomjs/neo'
            })).toEqual([]);

            const day8Decision = decideClaim({
                candidates: CANDIDATES,
                comment   : day8Claim,
                comments  : [initialClaim, day8Claim],
                issue     : assignedIssue,
                repoUrl   : REPO_URL
            });

            expect(day8Decision.assign).toBe(true);
            expect(day8Decision.unassign).toEqual(['StaleClaimant']);
            expect(day8Decision.assignedBody).toContain('Thanks for claiming this, @lapsed-newcomer, and welcome! Assigned to you');

            // Past the window on issue comments, but has an open PR into neomjs/neo: still holds
            const withPrDecision = decideClaim({
                candidates      : CANDIDATES,
                comment         : day8Claim,
                comments        : [initialClaim, day8Claim],
                issue           : assignedIssue,
                openPullRequests: [{number: 20799, author: 'StaleClaimant', repository: 'neomjs/neo'}],
                repoUrl         : REPO_URL
            });

            expect(withPrDecision.assign).toBe(false);
            expect(withPrDecision.body).toContain("it's assigned to [StaleClaimant](https://github.com/StaleClaimant) and #20799 is open for it.");

            // Past the window since the initial claim comment, but manually assigned inside it: still holds
            const recentAssignDecision = decideClaim({
                candidates: CANDIDATES,
                comment   : day8Claim,
                comments  : [initialClaim, day8Claim],
                events    : [{event: 'assigned', assignee: {login: 'StaleClaimant'}, created_at: daysAfter(claimAt, CLAIM_WINDOW_DAYS - 1)}],
                issue     : assignedIssue,
                repoUrl   : REPO_URL
            });

            expect(recentAssignDecision.assign).toBe(false);

            // Team assignees (both self-assigned with zero comments and MEMBER commenters) never lapse
            const
                teamComment = comment('neo-opus-grace', '2026-10-20T10:00:00Z', 'Taking this lane.', {association: 'MEMBER'}),
                silentTeam  = gfiIssue({assignees: [{login: 'neo-opus-grace'}]}),
                lateClaim   = comment('day20-newcomer', '2026-11-09T10:00:01Z', "I'd like to work on this.");

            expect(decideClaim({comment: lateClaim, comments: [lateClaim], issue: silentTeam, repoUrl: REPO_URL}).assign).toBe(false);
            expect(decideClaim({comment: lateClaim, comments: [teamComment, lateClaim], issue: silentTeam, repoUrl: REPO_URL}).assign).toBe(false)
        });

        test('a claimant who already holds another open curated issue gets assign: false and a cap reply', () => {
            const decision = decideClaim({
                comment       : secondClaim,
                comments      : [secondClaim],
                heldByClaimant: [20717, 19143],
                issue         : gfiIssue({number: 19143}),
                repoUrl       : REPO_URL
            });

            expect(decision.assign).toBe(false);
            expect(decision.assignedBody).toBeUndefined();
            expect(decision.body).toContain("Thanks, @second-claimant! You're already assigned to #20717");
            expect(decision.body).not.toContain('#19143');
            expect(decision.body).toContain(replyMarker('second-claimant'))
        });

        test('a fresh claim retries a prior capacity refusal against current slots and holders', () => {
            const
                issue = gfiIssue(),
                ask   = comment('AdaCat', '2026-11-14T12:00:00Z', '/claim'),
                again = comment('AdaCat', '2026-11-14T13:01:00Z', '/claim'),
                make  = (request, replies, extra = {}) => decideClaim({
                    comment: request, comments: [ask, ...replies, again], issue, repoUrl: REPO_URL, claimLimit: 1, ...extra
                }),
                denied = make(ask, [], {heldByClaimant: [20957]});

            expect(denied.assign).toBe(false);
            expect(denied.body).toContain('You already hold #20957. From five merged pull requests you can hold two at once.');

            const firstReply = comment('github-actions[bot]', '2026-11-14T12:00:02Z', denied.body, {type: 'Bot'});
            expect(make(ask, [firstReply])).toBeNull(); // a replay after the blocking issue closed
            const stillBlocked = make(again, [firstReply], {heldByClaimant: [20957]});
            expect(stillBlocked).toMatchObject({assign: false, updateCommentId: firstReply.id});
            expect(make(again, [{...firstReply, body: stillBlocked.body}])).toBeNull(); // edited refusal covers this event
            expect(make(again, [firstReply], {issue: gfiIssue({assignees: [{login: 'Other'}]})}).assign).toBe(false);
            expect(make(again, [firstReply], {openPullRequests: [{number: 23, author: 'Other', repository: 'neomjs/neo'}]}).assign).toBe(false);
            expect(make(again, [firstReply]).assign).toBe(true);
            expect(make({...again, body: 'Thanks for the update!'}, [firstReply])).toBeNull();
            for (const foreign of [
                {...firstReply, user: {type: 'Bot', login: 'another-app[bot]'}},
                {...firstReply, user: {type: 'User', login: 'other'}},
                {...firstReply, body: firstReply.body.replace(replyMarker(ask.user.login), replyMarker('other'))}
            ]) {
                expect(make(again, [foreign], {heldByClaimant: [20957]}).updateCommentId).toBeUndefined()
            }
            expect(decideReply({comment: again, comments: [ask, firstReply, again], issue, repoUrl: REPO_URL})).toBeNull();

            const accepted = comment('github-actions[bot]', '2026-11-14T13:01:03Z', make(again, [firstReply]).assignedBody, {type: 'Bot'});
            expect(make(again, [firstReply, accepted])).toBeNull();
        });

        test('old-style refusals allow a fresh retry without reserving the issue against another contributor', () => {
            const
                first  = comment('MyLogin', '2026-11-14T11:00:00Z', '/claim'),
                next   = comment('another', '2026-11-14T12:00:00Z', '/claim'),
                retry  = comment('mylogin', '2026-11-14T13:00:00Z', '/claim'),
                decide = (claim, comments) => decideClaim({comment: claim, comments, issue: gfiIssue(), repoUrl: REPO_URL, claimLimit: 1});

            for (const reason of ["You're already assigned to #12", "This one is taken: it's assigned to someone else"]) {
                const bot = comment('github-actions[bot]', '2026-11-14T11:01:00Z',
                    `Thanks, @MyLogin! ${reason}.\n\n${replyMarker('MyLogin')}`, {type: 'Bot'});
                expect(decide(retry, [first, bot, retry]).assign).toBe(true);
                expect(decide(next, [first, bot, next]).assign).toBe(true);
                expect(decide(retry, [first, bot, next, retry]).assign).toBe(false);
            }
        });

        test('a queued claimant can proceed when the first claim was refused while the workflow was running', () => {
            const
                at     = '2026-11-14T12:00:00Z',
                first  = comment('first', at, '/claim'),
                next   = comment('next', at, '/claim'),
                issue  = gfiIssue(),
                decide = (claim, comments, heldByClaimant = []) => decideClaim({
                    comment: claim, comments, heldByClaimant, claimLimit: 1, issue, repoUrl: REPO_URL
                }),
                refused = comment('github-actions[bot]', at, decide(first, [first, next], [12]).body, {type: 'Bot'});

            expect(decide(next, [first, next, refused]).assign).toBe(true);
            expect(decide(first, [first, next, refused])).toBeNull();

            const queuedRetry = {...next, user: first.user};
            expect(decide(queuedRetry, [first, queuedRetry, refused]).assign).toBe(true);

            const withdraw = comment('first', at, 'Please unassign me.');
            const claimant = comment('third', at, '/claim');
            expect(decide(claimant, [first, withdraw, claimant]).assign).toBe(true);
        });

        test('a maintainer unassignment event releases an earlier claim just like a withdrawal', () => {
            const
                sprayed    = comment('spray-account', '2026-11-11T02:34:01Z', "I'd love to work on it. Could you please assign it to me?"),
                unassigned = {event: 'unassigned', assignee: {login: 'spray-account'}, created_at: '2026-11-11T03:00:00Z'},
                next       = comment('newcomer', '2026-11-11T03:15:00Z', "I'd like to take this one.");

            expect(earlierClaim({claimant: 'newcomer', comment: next, comments: [sprayed, next], events: []})?.user.login).toBe('spray-account');
            expect(earlierClaim({claimant: 'newcomer', comment: next, comments: [sprayed, next], events: [unassigned]})).toBeNull();

            const decision = decideClaim({
                comment : next,
                comments: [sprayed, next],
                events  : [unassigned],
                issue   : gfiIssue({number: 20717}),
                repoUrl : REPO_URL
            });

            expect(decision.assign).toBe(true);
            expect(decision.assignedBody).toContain('Thanks for claiming this, @newcomer, and welcome! Assigned to you')
        });

        test('a claimant with a merged pull request is welcomed back in both greetings', () => {
            const claim = comment('returning-claimant', '2026-11-17T20:00:00Z', "I'd like to take this one.");

            // The workflow derives `welcomeBack` from the merged count it already fetched; an unread count stays false.
            for (const [count, greeting] of [[0, 'welcome!'], [1, 'welcome back!'], [undefined, 'welcome!']]) {
                const decision = decideClaim({
                    comment    : claim,
                    comments   : [claim],
                    issue      : gfiIssue({number: 21284}),
                    repoUrl    : REPO_URL,
                    welcomeBack: count === undefined ? undefined : standing(count).rung !== null
                });

                expect(decision.assign).toBe(true);
                expect(decision.assignedBody).toContain(`Thanks for claiming this, @returning-claimant, and ${greeting} Assigned to you — you can start now.`);
                expect(decision.body).toContain(`Thanks for claiming this, @returning-claimant, and ${greeting} You're first in line, so you can start now.`)
            }

            // Only the two greetings change: a refusal reads the same either way.
            const held = {claimant: 'returning-claimant', holders: [{kind: 'assignee', login: 'someone'}], label: 'good first issue', repoUrl: REPO_URL};
            expect(renderReply({...held, welcomeBack: true})).toBe(renderReply(held))
        });

        test('workflow github-script assigns claims under their standing limit and falls back safely', async () => {
            const
                workflowPath  = path.resolve(process.cwd(), '.github/workflows/claim-responder.yml'),
                raw           = fs.readFileSync(workflowPath, 'utf8'),
                scriptBlock   = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
                AsyncFunction = Object.getPrototypeOf(async function () {}).constructor,
                runStep       = new AsyncFunction('github', 'context', 'core', scriptBlock),
                prevWorkspace = process.env.GITHUB_WORKSPACE;

            expect(raw).not.toMatch(/^concurrency:/m);
            expect(raw).toMatch(/\n    if: >-[\s\S]*?\n    concurrency:\n      group: claim-responder\n      cancel-in-progress: false\n      queue: max\n/);
            expect(raw).toContain('for module in claimResponse.mjs contributorStanding.mjs claimGuidance.mjs; do');

            process.env.GITHUB_WORKSPACE = process.cwd();

            const runScenario = async ({assignedItems = [], addAssigneesImpl, claim = firstClaim, comments = [firstClaim], events = [], issue = gfiIssue({state: 'open'}), count = {total_count: 0, incomplete_results: false}, alternativesError, workspace = process.cwd()}) => {
                const posted = [], assignedCalls = [], unassignedCalls = [], warnings = [], listForRepoCalls = [], countQueries = [];

                const github = {
                    graphql : async () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}),
                    paginate: async (fn, args) => {
                        if (fn === github.rest.issues.listComments) return comments;
                        if (fn === github.rest.issues.listEvents)   return events;
                        if (fn === github.rest.issues.listForRepo)  { listForRepoCalls.push(args); return assignedItems }
                        throw new Error('unexpected paginate target')
                    },
                    rest    : {
                        issues: {
                            addAssignees   : async args => { assignedCalls.push(args); return addAssigneesImpl(args) },
                            createComment  : async args => { posted.push(args); return {data: {}} },
                            get            : async ()   => ({data: issue}),
                            listComments   : Symbol('listComments'),
                            listEvents     : Symbol('listEvents'),
                            listForRepo    : Symbol('listForRepo'),
                            removeAssignees: async args => { unassignedCalls.push(args); return {data: {}} }
                        },
                        search: {
                            issuesAndPullRequests: async ({q}) => {
                                if (q.startsWith('org:')) {
                                    countQueries.push(q);
                                    if (count instanceof Error) throw count;
                                    return {data: count}
                                }
                                expect(q).not.toContain('assignee:');
                                if (alternativesError) throw alternativesError;
                                return {data: {items: [{number: 20691}, {number: 20692}]}}
                            }
                        }
                    }
                };

                const previous = process.env.GITHUB_WORKSPACE;
                process.env.GITHUB_WORKSPACE = workspace;
                try {
                    await runStep(
                        github,
                        {payload: {comment: claim, issue: {number: issue.number}}, repo: {owner: 'neomjs', repo: 'neo'}},
                        {info: () => {}, warning: msg => warnings.push(msg)}
                    )
                } finally { process.env.GITHUB_WORKSPACE = previous }

                return {assignedCalls, countQueries, listForRepoCalls, posted, unassignedCalls, warnings}
            };

            try {
                // 1. Verified auto-assignment -> posts assignedBody
                const ok = await runScenario({
                    addAssigneesImpl: async ({assignees}) => ({data: {assignees: assignees.map(login => ({login}))}})
                });

                expect(ok.assignedCalls).toEqual([{assignees: ['first-claimant'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
                expect(ok.listForRepoCalls).toEqual([{assignee: 'first-claimant', owner: 'neomjs', per_page: 100, repo: 'neo', state: 'open'}]);
                expect(ok.unassignedCalls).toEqual([]);
                expect(ok.posted).toHaveLength(1);
                expect(ok.posted[0].body).toContain('and welcome! Assigned to you — you can start now.');
                expect(ok.warnings).toEqual([]);
                expect(ok.countQueries).toEqual(['org:neomjs is:public is:pr is:merged author:first-claimant']);

                // 1b. One merged pull request across the organisation -> the same search welcomes the claimant back
                const back = await runScenario({
                    addAssigneesImpl: async ({assignees}) => ({data: {assignees: assignees.map(login => ({login}))}}),
                    count           : {total_count: 1, incomplete_results: false}
                });

                expect(back.posted[0].body).toContain('Thanks for claiming this, @first-claimant, and welcome back! Assigned to you');
                expect(back.countQueries).toHaveLength(1);

                // 1c. An unread count keeps the first-time greeting
                const unread = await runScenario({
                    addAssigneesImpl: async ({assignees}) => ({data: {assignees: assignees.map(login => ({login}))}}),
                    count           : new Error('search refused')
                });

                expect(unread.posted[0].body).toContain('Thanks for claiming this, @first-claimant, and welcome! Assigned to you');
                expect(unread.warnings).toHaveLength(1);

                // 2. GitHub returns HTTP 201 with empty assignees -> posts fallback body without removing stale assignees
                const
                    staleAt    = '2026-11-01T10:00:00Z',
                    staleClaim = comment('StaleClaimant', staleAt, "I'd like to claim this issue."),
                    freshClaim = comment('lapsed-newcomer', daysAfter(staleAt, CLAIM_WINDOW_DAYS + 1), "I'd like to work on this."),
                    staleIssue = gfiIssue({assignees: [{login: 'StaleClaimant'}], state: 'open'});

                const dropped = await runScenario({
                    addAssigneesImpl: async () => ({data: {assignees: []}}),
                    claim           : freshClaim,
                    comments        : [staleClaim, freshClaim],
                    issue           : staleIssue
                });

                expect(dropped.assignedCalls).toHaveLength(1);
                expect(dropped.unassignedCalls).toEqual([]);
                expect(dropped.posted).toHaveLength(1);
                expect(dropped.posted[0].body).toContain("You're first in line, so you can start now.");
                expect(dropped.warnings).toHaveLength(1);

                // 3. Claimant already holds another open curated issue -> skips addAssignees and posts cap reply
                const capped = await runScenario({
                    addAssigneesImpl: async () => { throw new Error('must not assign') },
                    assignedItems   : [{number: 20717, labels: [{name: 'good first issue'}]}]
                });

                expect(capped.assignedCalls).toEqual([]);
                expect(capped.unassignedCalls).toEqual([]);
                expect(capped.posted).toHaveLength(1);
                expect(capped.posted[0].body).toContain('You already hold #20717');

                // A returning contributor may take a second, but not a third, curated issue.
                const oneHeld   = [{number: 20717, labels: [{name: 'good first issue'}]}],
                      twoHeld   = [...oneHeld, {number: 20718, labels: [{name: 'help wanted'}]}],
                      returning = {total_count: 5, incomplete_results: false},
                      second    = await runScenario({assignedItems: oneHeld, count: returning,
                          addAssigneesImpl: async ({assignees}) => ({data: {assignees: assignees.map(login => ({login}))}})}),
                      third = await runScenario({assignedItems: twoHeld, count: returning,
                          addAssigneesImpl: async () => { throw new Error('must not assign') }});
                expect(second.assignedCalls).toHaveLength(1);
                expect(second.posted[0].body).toContain('Assigned to you');
                expect(third.assignedCalls).toEqual([]);
                expect(third.posted[0].body).toContain('You already hold #20717 and #20718');
                expect(second.countQueries).toHaveLength(1);
                expect(third.countQueries).toHaveLength(1);

                // Failed, incomplete and malformed count responses leave the existing one-claim cap.
                for (const count of [new Error('search refused'), {total_count: 5, incomplete_results: true},
                    {total_count: '5', incomplete_results: false}, {total_count: 5}, {total_count: -1, incomplete_results: false}]) {
                    const fallback = await runScenario({assignedItems: oneHeld, count, addAssigneesImpl: async () => { throw new Error('must not assign') }});
                    expect(fallback.assignedCalls).toEqual([]);
                    expect(fallback.posted[0].body).toContain('You already hold #20717');
                    expect(fallback.warnings).toHaveLength(1)
                }

                // The claim module has no imports, so even a missing or broken standing module can answer safely.
                const limited = new Error('search rate limited');
                const outage  = await runScenario({count: limited, alternativesError: limited, assignedItems: oneHeld});
                expect(outage.warnings).toHaveLength(2);
                expect(outage.assignedCalls).toEqual([]);
                expect(outage.posted[0].body).toContain('You already hold #20717');

                for (const broken of [false, true]) {
                    const workspace = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'neo-claim-standing-')),
                          util      = path.join(workspace, 'buildScripts/util');
                    try {
                        fs.mkdirSync(util, {recursive: true});
                        fs.copyFileSync(path.resolve(process.cwd(), 'buildScripts/util/claimResponse.mjs'), path.join(util, 'claimResponse.mjs'));
                        fs.copyFileSync(path.resolve(process.cwd(), 'buildScripts/util/claimGuidance.mjs'), path.join(util, 'claimGuidance.mjs'));
                        if (broken) fs.writeFileSync(path.join(util, 'contributorStanding.mjs'), 'export const = broken');
                        const fallback = await runScenario({workspace, assignedItems: oneHeld, addAssigneesImpl: async () => { throw new Error('must not assign') }});
                        expect(fallback.assignedCalls).toEqual([]);
                        expect(fallback.posted[0].body).toContain('You already hold #20717');
                        expect(fallback.warnings).toHaveLength(1);
                        expect(fallback.countQueries).toHaveLength(0)
                    } finally { fs.rmSync(workspace, {recursive: true, force: true}) }
                }

                // 4. Lapsed silent outside assignee (past the claim window) -> assigns newcomer and removes StaleClaimant
                const handedOver = await runScenario({
                    addAssigneesImpl: async ({assignees}) => ({data: {assignees: assignees.map(login => ({login}))}}),
                    claim           : freshClaim,
                    comments        : [staleClaim, freshClaim],
                    issue           : staleIssue
                });

                expect(handedOver.assignedCalls).toEqual([{assignees: ['lapsed-newcomer'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
                expect(handedOver.unassignedCalls).toEqual([{assignees: ['StaleClaimant'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
                expect(handedOver.posted).toHaveLength(1);
                expect(handedOver.posted[0].body).toContain('Thanks for claiming this, @lapsed-newcomer, and welcome! Assigned to you');
                expect(handedOver.warnings).toEqual([]);

                // 5. One account claims two free curated issues in sequence -> only the first is assigned (even when search lags)
                let mergedCount = 0;
                const
                    burstFirst  = comment('burst-claimant', '2026-11-11T02:34:01Z', "I'd love to work on this."),
                    burstSecond = comment('burst-claimant', '2026-11-11T02:34:03Z', "I'd love to work on this too."),
                    burstThird  = comment('burst-claimant', '2026-11-11T02:34:05Z', "I'd like to work on this too."),
                    store       = new Map([
                        [19143, gfiIssue({number: 19143, state: 'open'})],
                        [20691, gfiIssue({number: 20691, state: 'open'})],
                        [20692, gfiIssue({number: 20692, state: 'open'})]
                    ]),
                    commentsByIssue = new Map([[19143, [burstFirst]], [20691, [burstSecond]], [20692, [burstThird]]]),
                    burstAssigned   = [],
                    burstPosted     = [];

                const sharedGithub = {
                    graphql : async () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}),
                    paginate: async (fn, args) => {
                        if (fn === sharedGithub.rest.issues.listComments) return commentsByIssue.get(args.issue_number) || [];
                        if (fn === sharedGithub.rest.issues.listEvents)   return [];
                        if (fn === sharedGithub.rest.issues.listForRepo) {
                            return [...store.values()].filter(item =>
                                item.state === args.state &&
                                (item.assignees || []).some(a => a.login.toLowerCase() === args.assignee.toLowerCase())
                            )
                        }
                        throw new Error('unexpected paginate target')
                    },
                    rest: {
                        issues: {
                            addAssignees   : async args => {
                                burstAssigned.push(args);
                                const target = store.get(args.issue_number);
                                target.assignees = [...(target.assignees || []), ...args.assignees.map(login => ({login}))];
                                return {data: target}
                            },
                            createComment  : async args => { burstPosted.push(args); return {data: {}} },
                            get            : async ({issue_number}) => ({data: store.get(issue_number)}),
                            listComments   : Symbol('listComments'),
                            listEvents     : Symbol('listEvents'),
                            listForRepo    : Symbol('listForRepo'),
                            removeAssignees: async () => ({data: {}})
                        },
                        search: {
                            // Lagging search index still shows both issues unassigned during the second run
                            issuesAndPullRequests: async ({q}) => q.startsWith('org:')
                                ? {data: {total_count: mergedCount, incomplete_results: false}}
                                : {data: {items: [{number: 19143}, {number: 20691}, {number: 20692}]}}
                        }
                    }
                };

                await runStep(
                    sharedGithub,
                    {payload: {comment: burstFirst, issue: {number: 19143}}, repo: {owner: 'neomjs', repo: 'neo'}},
                    {info: () => {}, warning: () => {}}
                );
                await runStep(
                    sharedGithub,
                    {payload: {comment: burstSecond, issue: {number: 20691}}, repo: {owner: 'neomjs', repo: 'neo'}},
                    {info: () => {}, warning: () => {}}
                );

                expect(burstAssigned).toEqual([{assignees: ['burst-claimant'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
                expect(burstPosted).toHaveLength(2);
                expect(burstPosted[0]).toMatchObject({issue_number: 19143});
                expect(burstPosted[0].body).toContain('Assigned to you — you can start now.');
                expect(burstPosted[1]).toMatchObject({issue_number: 20691});
                expect(burstPosted[1].body).toContain('You already hold #19143');

                // The same lagging-search sequence at the returning rung assigns twice, then refuses.
                store.get(19143).assignees = [];
                burstAssigned.length = 0;
                burstPosted.length = 0;
                mergedCount = 5;
                for (const [claim, number] of [[burstFirst, 19143], [burstSecond, 20691], [burstThird, 20692]]) {
                    await runStep(sharedGithub, {payload: {comment: claim, issue: {number}}, repo: {owner: 'neomjs', repo: 'neo'}},
                        {info: () => {}, warning: () => {}})
                }
                expect(burstAssigned.map(call => call.issue_number)).toEqual([19143, 20691]);
                expect(burstPosted[2].body).toContain('You already hold #19143 and #20691');
            } finally {
                if (prevWorkspace === undefined) {
                    delete process.env.GITHUB_WORKSPACE
                } else {
                    process.env.GITHUB_WORKSPACE = prevWorkspace
                }
            }
        });

        test('workflow edits the matching refusal on retry, keeps it non-reserving, and assigns after capacity clears', async () => {
            const raw      = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/claim-responder.yml'), 'utf8'),
                  script   = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
                  run      = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', script),
                  first    = comment('alice', '2026-11-15T10:00:00Z', '/claim'),
                  retry    = comment('alice', '2026-11-15T10:01:00Z', '/claim'),
                  other    = comment('bob', '2026-11-15T10:02:00Z', '/claim'),
                  later    = comment('alice', '2026-11-15T10:03:00Z', '/claim'),
                  issue    = gfiIssue({number: 19143, state: 'open'}),
                  comments = [], events = [], created = [], updated = [], assigned = [], warnings = [];
            let   current = first, aliceAtCapacity = true, failUpdate = false;
            const github  = {
                graphql : async () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}),
                paginate: async (fn, args) => {
                    if (fn === github.rest.issues.listComments) return comments;
                    if (fn === github.rest.issues.listEvents) return events;
                    if (fn === github.rest.issues.listForRepo) return args.assignee === 'alice' && aliceAtCapacity
                        ? [{number: 20717, labels: [{name: 'good first issue'}]}] : [];
                    throw new Error('unexpected pagination')
                },
                rest: {
                    issues: {
                        get            : async () => ({data: issue}),
                        listComments   : Symbol('comments'), listEvents: Symbol('events'), listForRepo: Symbol('assigned'),
                        addAssignees   : async args => { assigned.push(args); issue.assignees = args.assignees.map(login => ({login})); return {data: issue} },
                        removeAssignees: async () => ({data:{}}),
                        createComment  : async args => {
                            created.push(args);
                            comments.push(comment('github-actions[bot]', current.created_at, args.body, {type:'Bot'}));
                            return {data: {}}
                        },
                        updateComment: async args => {
                            updated.push(args);
                            if (failUpdate) throw new Error('update refused');
                            const target = comments.find(row => row.id === args.comment_id);
                            if (!target) throw new Error('missing target');
                            target.body = args.body;
                            return {data: target}
                        }
                    },
                    search: {issuesAndPullRequests: async ({q}) => q.startsWith('org:')
                        ? {data:{total_count:0,incomplete_results:false}} : {data:{items:[]}}}
                }
            },
            core = {info: () => {}, warning: message => warnings.push(message)},
            previous = process.env.GITHUB_WORKSPACE,
            invoke = async claim => {
                current = claim;
                if (!comments.some(row => row.id === claim.id)) comments.push(claim);
                await run(github, {payload:{comment:claim,issue:{number:issue.number}},repo:{owner:'neomjs',repo:'neo'}}, core)
            };

            process.env.GITHUB_WORKSPACE = process.cwd();
            try {
                await invoke(first);
                expect(created).toHaveLength(1);
                expect(assigned).toHaveLength(0);
                const refusal = comments.find(row => row.user.login === 'github-actions[bot]');
                expect(refusal.body).toContain('You already hold #20717');

                failUpdate = true;
                const prior = refusal.body;
                await expect(invoke(retry)).rejects.toThrow('update refused');
                expect(created).toHaveLength(1);
                expect(updated).toHaveLength(1);
                expect(refusal.body).toBe(prior);
                expect(warnings).toEqual([]);
                failUpdate = false;
                warnings.length = 0;
                await invoke(retry);
                expect(created).toHaveLength(1);
                expect(updated).toHaveLength(2);
                expect(updated[1].comment_id).toBe(refusal.id);
                const edited = refusal.body;

                await invoke(retry);
                expect([created.length, updated.length, assigned.length]).toEqual([1, 2, 0]);
                expect(refusal.body).toBe(edited);

                await invoke(other);
                expect(assigned.map(call => call.assignees)).toEqual([['bob']]);
                expect(created).toHaveLength(2);
                issue.assignees = [];
                events.push({event:'unassigned',assignee:{login:'bob'},created_at:'2026-11-15T10:02:30Z'});
                aliceAtCapacity = false;
                await invoke(later);
                expect(assigned.map(call => call.assignees)).toEqual([['bob'], ['alice']]);
                expect(created).toHaveLength(3);
                expect(warnings).toEqual([]);

                // GitHub IDs break timestamp ties: create the second claim only after the bot reply,
                // as a real same-second retry does, rather than preallocating its synthetic ID.
                comments.length = 0; events.length = 0; created.length = 0; updated.length = 0; assigned.length = 0;
                issue.assignees = [];
                aliceAtCapacity = true;
                const sameFirst = comment('alice', '2026-11-15T11:00:00Z', '/claim');
                await invoke(sameFirst);
                const sameRefusal = comments.find(row => row.user.login === 'github-actions[bot]'),
                      sameRetry   = comment('alice', '2026-11-15T11:00:00Z', '/claim');
                expect(sameFirst.id).toBeLessThan(sameRefusal.id);
                expect(sameRefusal.id).toBeLessThan(sameRetry.id);
                await invoke(sameRetry);
                await invoke(sameRetry);
                expect([created.length, updated.length, assigned.length]).toEqual([1, 1, 0]);
                expect(updated[0].comment_id).toBe(sameRefusal.id)
            } finally {
                if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
                else process.env.GITHUB_WORKSPACE = previous
            }
        });

    });

    test.describe('pull_request_target claim, overlap, reconciliation and release rules (#21022)', () => {
        const pullRequestFixture = ({
            number      = 21500,
            login       = 'pr-contributor',
            id          = 7001,
            type        = 'User',
            association = 'NONE',
            body        = 'Resolves #19143',
            createdAt   = '2026-11-15T17:10:00Z',
            closedAt    = null,
            merged      = false
        } = {}) => ({
            author_association: association,
            body,
            closed_at         : closedAt,
            created_at        : createdAt,
            merged,
            number,
            user              : {id, login, type}
        });

        test('closeTargets and changedCloseTargets parse closing keywords safely and ignore non-target changes', () => {
            const body = [
                'Summary line',
                'Resolves #101',
                'Fixes: neomjs/neo#102',
                'Closes https://github.com/NeoMJS/Neo/issues/103',
                'Resolves #101',
                'Closes otherorg/other#104',
                'Fixes https://github.com/other/repo/issues/105',
                '<!-- Resolves #106 -->',
                '`Resolves #107`',
                '> Fixes #108',
                '```md\nCloses #109\n```',
                '~~~text\nResolves #110\n~~~',
                '<!<!-- Resolves #111 -->-->',
                'Inline ```Resolves #112``` code'
            ].join('\n');

            expect(closeTargets(body, 'neomjs/neo')).toEqual([101, 102, 103]);

            const startedAt = Date.now();
            expect(closeTargets(`Resolves${' :'.repeat(60)} no-target`, 'neomjs/neo')).toEqual([]);
            expect(Date.now() - startedAt).toBeLessThan(50);

            const basePr = pullRequestFixture({body: 'Resolves #101\n- [ ] task'});
            expect(changedCloseTargets({action: 'opened', pullRequest: basePr, repository: 'neomjs/neo'})).toEqual({
                added  : [101],
                removed: []
            });
            expect(changedCloseTargets({
                action     : 'edited',
                changes    : {body: {from: 'Resolves #101\n- [ ] task'}},
                pullRequest: {...basePr, body: 'Resolves #101\n- [x] task\nUpdated prose'},
                repository : 'neomjs/neo'
            })).toEqual({added: [], removed: []});
            expect(changedCloseTargets({
                action     : 'edited',
                changes    : {title: {from: 'old title'}},
                pullRequest: basePr,
                repository : 'neomjs/neo'
            })).toEqual({added: [], removed: []});
            expect(changedCloseTargets({
                action     : 'edited',
                changes    : {body: {from: 'Resolves #101'}},
                pullRequest: {...basePr, body: 'Fixes #202'},
                repository : 'neomjs/neo'
            })).toEqual({added: [202], removed: [101]});
            expect(changedCloseTargets({
                action     : 'edited',
                changes    : {body: {from: null}},
                pullRequest: {...basePr, body: 'Resolves #101'},
                repository : 'neomjs/neo'
            })).toEqual({added: [101], removed: []});
        });

        test('overlapMarker, releaseMarker and claimRecords enforce exact wire spelling and bot provenance', () => {
            expect(overlapMarker({heldBy: 'pr:21500', issue: 19143, pr: 21501})).toBe(
                '<!-- neo-claim:v1 {"kind":"overlap","issue":19143,"pr":21501,"heldBy":"pr:21500"} -->'
            );
            expect(overlapMarker({heldBy: 'user:4242', issue: 19143, pr: 21501})).toBe(
                '<!-- neo-claim:v1 {"kind":"overlap","issue":19143,"pr":21501,"heldBy":"user:4242"} -->'
            );
            expect(releaseMarker({issue: 19143, login: 'alice', pr: 21500, repo: 'neomjs/neo', to: 9001})).toBe(
                '<!-- neo-claim:v1 {"kind":"release","repo":"neomjs/neo","issue":19143,"pr":21500,"to":9001,"login":"alice"} -->'
            );

            const
                validOverlap = overlapMarker({heldBy: 'pr:21500', issue: 19143, pr: 21501}),
                validRelease = releaseMarker({issue: 19143, login: 'alice', pr: 21500, repo: 'neomjs/neo', to: 9001}),
                botComment   = comment('github-actions[bot]', '2026-11-15T17:15:00Z',
                    `${validOverlap}\n${validRelease}\n<!-- neo-claim:v2 {"kind":"release"} -->\n<!-- neo-claim:v1 {broken -->`,
                    {type: 'Bot'}),
                copied       = comment('contributor', '2026-11-15T17:16:00Z', validRelease),
                otherBot     = comment('other-app[bot]', '2026-11-15T17:17:00Z', validRelease, {type: 'Bot'});

            expect(claimRecords([botComment, copied, otherBot])).toEqual([
                {commentId: botComment.id, heldBy: 'pr:21500', issue: 19143, kind: 'overlap', pr: 21501},
                {commentId: botComment.id, issue: 19143, kind: 'release', login: 'alice', pr: 21500, repo: 'neomjs/neo', to: 9001}
            ]);

            expect(() => overlapMarker({heldBy: 'bad', issue: 1, pr: 2})).toThrow();
            expect(() => releaseMarker({issue: 1, login: 'a', pr: 2, repo: 'noslash', to: 3})).toThrow();
        });

        test('decidePullRequestTarget assigns unclaimed issues, emits neutral overlap/residual notices, and is idempotent', () => {
            const pr = pullRequestFixture();

            // Unclaimed open curated issue -> assigns cleanly and creates no issue comment
            const assigned = decidePullRequestTarget({
                candidates : CANDIDATES,
                issue      : gfiIssue({state: 'open'}),
                pullRequest: pr,
                repoUrl    : REPO_URL
            });
            expect(assigned).toEqual({assign: true, unassign: []});

            // Stale outside assignee (>3d silent) is evicted on PR claim
            const
                staleClaim = comment('stale-user', '2026-11-01T10:00:00Z', "I'd like to work on this.", {id: 101}),
                staleIssue = gfiIssue({assignees: [{id: 101, login: 'stale-user'}], state: 'open'});
            expect(decidePullRequestTarget({
                comments   : [staleClaim],
                issue      : staleIssue,
                pullRequest: pr,
                repoUrl    : REPO_URL
            })).toEqual({assign: true, unassign: ['stale-user']});

            // Capacity cap blocks assignment silently without creating an overlap notice
            expect(decidePullRequestTarget({
                claimLimit  : 1,
                heldByAuthor: [20717],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : pr,
                repoUrl     : REPO_URL
            })).toEqual({assign: false});
            expect(decidePullRequestTarget({
                claimLimit  : 2,
                heldByAuthor: [20717],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : pr,
                repoUrl     : REPO_URL
            })).toEqual({assign: true, unassign: []});

            // Held by another open PR -> neutral overlap notice without "taken", ending in overlapMarker(pr:<n>)
            const heldByPr = decidePullRequestTarget({
                candidates      : CANDIDATES,
                issue           : gfiIssue({state: 'open'}),
                openPullRequests: [{author: 'earlier-author', number: 21499, repository: 'neomjs/neo'}],
                pullRequest     : pr,
                repoUrl         : REPO_URL
            });
            expect(heldByPr.assign).toBe(false);
            expect(heldByPr.prNotice.toLowerCase()).not.toContain('taken');
            expect(heldByPr.prNotice).toContain('#21499 is already open for it');
            expect(heldByPr.prNotice).toContain(overlapMarker({heldBy: 'pr:21499', issue: 19143, pr: 21500}));

            // Held by assignee -> overlapMarker(user:<id>)
            const heldByAssignee = decidePullRequestTarget({
                candidates : CANDIDATES,
                comments   : [comment('holder-login', '2026-11-15T10:00:00Z', "I'll take this.", {id: 5001})],
                issue      : gfiIssue({assignees: [{id: 5001, login: 'holder-login'}], state: 'open'}),
                pullRequest: pr,
                repoUrl    : REPO_URL
            });
            expect(heldByAssignee.assign).toBe(false);
            expect(heldByAssignee.prNotice.toLowerCase()).not.toContain('taken');
            expect(heldByAssignee.prNotice).toContain(overlapMarker({heldBy: 'user:5001', issue: 19143, pr: 21500}));

            // Existing bot overlap marker suppresses duplicate comment on reopen/redelivery
            const botOverlap = comment('github-actions[bot]', '2026-11-15T17:11:00Z', heldByPr.prNotice, {type: 'Bot'});
            expect(decidePullRequestTarget({
                candidates      : CANDIDATES,
                issue           : gfiIssue({state: 'open'}),
                openPullRequests: [{author: 'earlier-author', number: 21499, repository: 'neomjs/neo'}],
                prComments      : [botOverlap],
                pullRequest     : pr,
                repoUrl         : REPO_URL
            })).toBeNull();

            // Already assigned to the PR author -> idempotent null on reopen/redelivery
            expect(decidePullRequestTarget({
                issue      : gfiIssue({assignees: [{id: 7001, login: 'pr-contributor'}], state: 'open'}),
                pullRequest: pr,
                repoUrl    : REPO_URL
            })).toBeNull();

            // Closed curated issue already completed by a merged PR -> residual-scope review notice
            const completed = decidePullRequestTarget({
                candidates        : CANDIDATES,
                issue             : gfiIssue({state: 'closed'}),
                mergedPullRequests: [{author: 'earlier-author', number: 21400, repository: 'neomjs/neo'}],
                pullRequest       : pr,
                repoUrl           : REPO_URL
            });
            expect(completed.assign).toBe(false);
            expect(completed.prNotice).toContain('residual-scope review');
            expect(completed.prNotice).toContain('#21400');
            expect(completed.prNotice).toContain(overlapMarker({heldBy: 'pr:21400', issue: 19143, pr: 21500}));

            // Prior opening overlap notice never suppresses completed-issue notice when holder merges; second merge delivery does
            const afterOverlapMerge = decidePullRequestTarget({
                candidates        : CANDIDATES,
                issue             : gfiIssue({state: 'closed'}),
                mergedPullRequests: [{author: 'earlier-author', number: 21499, repository: 'neomjs/neo'}],
                prComments        : [botOverlap],
                pullRequest       : pr,
                repoUrl           : REPO_URL
            });
            expect(afterOverlapMerge.assign).toBe(false);
            expect(afterOverlapMerge.prNotice).toContain('residual-scope review');
            expect(afterOverlapMerge.prNotice).toContain(overlapMarker({heldBy: 'pr:21499', issue: 19143, pr: 21500}));
            expect(decidePullRequestTarget({
                candidates        : CANDIDATES,
                issue             : gfiIssue({state: 'closed'}),
                mergedPullRequests: [{author: 'earlier-author', number: 21499, repository: 'neomjs/neo'}],
                prComments        : [
                    botOverlap,
                    comment('github-actions[bot]', '2026-11-15T17:20:00Z', afterOverlapMerge.prNotice, {type: 'Bot'})
                ],
                pullRequest: pr,
                repoUrl    : REPO_URL
            })).toBeNull();

            // Unknown identity fails visibly
            expect(() => decidePullRequestTarget({
                issue      : gfiIssue({state: 'open'}),
                pullRequest: {...pr, user: {login: 'pr-contributor', type: 'User'}},
                repoUrl    : REPO_URL
            })).toThrow();
            expect(() => renderOverlapNotice({
                author     : 'pr-contributor',
                holders    : [{kind: 'assignee', login: 'no-id-holder'}],
                issueNumber: 19143,
                label      : 'good first issue',
                prNumber   : 21500,
                repoUrl    : REPO_URL
            })).toThrow();
        });

        test('decideTargetRemoval releases only verifiable PR-created bot assignments and throws on uncertain provenance', () => {
            const
                pr    = pullRequestFixture({createdAt: '2026-11-15T17:10:00Z'}),
                issue = gfiIssue({assignees: [{id: 7001, login: 'pr-contributor'}], state: 'open'});

            // Bot-assigned at/after PR created, no independent claim or sibling PR -> unassign
            expect(decideTargetRemoval({
                events     : [{actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T17:10:04Z', event: 'assigned'}],
                issue,
                pullRequest: pr,
                repository : 'neomjs/neo'
            })).toEqual({assignee: 'pr-contributor', unassign: true});

            // Prior refused comment claim does NOT count as an independent live claim
            const
                refusedOld = comment('pr-contributor', '2026-11-14T10:00:00Z', '/claim', {id: 7001}),
                botRefused = comment('github-actions[bot]', '2026-11-14T10:00:05Z',
                    `Thanks, @pr-contributor! This one is taken: someone else.\n\n${replyMarker('pr-contributor')}\n<!-- claim-refused:${refusedOld.id} -->`,
                    {type: 'Bot'});
            expect(decideTargetRemoval({
                comments   : [refusedOld, botRefused],
                events     : [{actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T17:10:04Z', event: 'assigned'}],
                issue,
                pullRequest: pr,
                repository : 'neomjs/neo'
            })).toEqual({assignee: 'pr-contributor', unassign: true});

            // Manual maintainer assignment stays
            expect(decideTargetRemoval({
                events     : [{actor: {login: 'tobiu', type: 'User'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T17:12:00Z', event: 'assigned'}],
                issue,
                pullRequest: pr,
                repository : 'neomjs/neo'
            })).toEqual({unassign: false});

            // Independent live claim comment stays
            expect(decideTargetRemoval({
                comments   : [comment('pr-contributor', '2026-11-15T16:50:00Z', "I'd like to work on this.", {id: 7001})],
                events     : [{actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T16:50:05Z', event: 'assigned'}],
                issue,
                pullRequest: pr,
                repository : 'neomjs/neo'
            })).toEqual({unassign: false});

            // Another open PR targeting the issue keeps ownership
            expect(decideTargetRemoval({
                events          : [{actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T17:10:04Z', event: 'assigned'}],
                issue,
                openPullRequests: [{author: 'pr-contributor', number: 21509, repository: 'neomjs/neo'}],
                pullRequest     : pr,
                repository      : 'neomjs/neo'
            })).toEqual({unassign: false});

            // Uncertain provenance cases fail visibly
            expect(() => decideTargetRemoval({events: [], issue, pullRequest: pr, repository: 'neomjs/neo'})).toThrow('no assigned event');
            expect(() => decideTargetRemoval({
                events     : [{actor: {login: 'other-bot[bot]', type: 'Bot'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T17:10:04Z', event: 'assigned'}],
                issue,
                pullRequest: pr,
                repository : 'neomjs/neo'
            })).toThrow('unexpected actor');
            expect(() => decideTargetRemoval({
                events     : [{actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'pr-contributor'}, created_at: '2026-11-15T16:00:00Z', event: 'assigned'}],
                issue,
                pullRequest: pr,
                repository : 'neomjs/neo'
            })).toThrow('predates PR');
        });

        test('decidePullRequestRelease respects activation boundary, notifies once in order, handles renames, and ignores fake markers', () => {
            const
                activationCut = '2026-11-15T17:25:00Z',
                prClosedAfter = pullRequestFixture({closedAt: '2026-11-15T17:30:00Z', createdAt: '2026-11-15T17:10:00Z', merged: false}),
                prClosedPrior = pullRequestFixture({closedAt: '2026-11-15T16:59:59Z', createdAt: '2026-11-15T16:00:00Z', merged: false}),
                cAlice        = comment('alice-old', '2026-11-15T17:12:00Z', "I'd like to work on this.", {id: 101}),
                cBob          = comment('bob', '2026-11-15T17:13:00Z', '/claim', {id: 102}),
                cBobWithdraw  = comment('bob', '2026-11-15T17:14:00Z', "I'm stepping back from this one.", {id: 102}),
                cCap          = comment('carol', '2026-11-15T17:15:00Z', '/claim', {id: 103}),
                botCapRefusal = comment('github-actions[bot]', '2026-11-15T17:15:02Z',
                    `Thanks, @carol! You already hold #20717.\n\n${replyMarker('carol')}\n<!-- claim-refused:${cCap.id} -->`,
                    {type: 'Bot'}),
                cDan          = comment('dan', '2026-11-15T17:16:00Z', 'Can I work on this?', {id: 104}),
                botTakenReply = comment('github-actions[bot]', '2026-11-15T17:16:02Z',
                    `Thanks, @dan! This one is taken: #21500 is open for it.\n\n${replyMarker('dan')}\n<!-- claim-refused:${cDan.id} -->`,
                    {type: 'Bot'}),
                botAliceTaken = comment('github-actions[bot]', '2026-11-15T17:12:02Z',
                    `Thanks, @alice-old! This one is taken: #21500 is open for it.\n\n${replyMarker('alice-old')}\n<!-- claim-refused:${cAlice.id} -->`,
                    {type: 'Bot'}),
                aliceRenamed  = comment('alice-new', '2026-11-15T17:20:00Z', 'Still watching from my renamed handle.', {id: 101}),
                fakeCopy      = comment('spoof', '2026-11-15T17:25:00Z',
                    releaseMarker({issue: 19143, login: 'alice-new', pr: 21500, repo: 'neomjs/neo', to: 101}) + '\n' +
                    releaseMarker({issue: 19143, login: 'dan', pr: 21500, repo: 'neomjs/neo', to: 104}));

            // Default module export keeps release notices disabled until repository activation supplies an explicit cut
            expect(CLAIM_RELEASE_SINCE).toBeNull();
            expect(decidePullRequestRelease({
                comments   : [cAlice, botAliceTaken],
                issue      : gfiIssue({state: 'open'}),
                pullRequest: prClosedAfter,
                repoUrl    : REPO_URL
            })).toBeNull();

            // Pre-activation closes and null activation gates never fire
            expect(decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : prClosedPrior,
                releaseSince: activationCut,
                repoUrl     : REPO_URL
            })).toBeNull();
            expect(decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : prClosedAfter,
                releaseSince: null,
                repoUrl     : REPO_URL
            })).toBeNull();
            expect(() => decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : prClosedAfter,
                releaseSince: 'not-a-date',
                repoUrl     : REPO_URL
            })).toThrow('Invalid release activation boundary');

            // Merged closes never emit release notice
            expect(decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : {...prClosedAfter, merged: true},
                releaseSince: activationCut,
                repoUrl     : REPO_URL
            })).toBeNull();

            // Live holder (excluding closing PR) suppresses release notice
            expect(decidePullRequestRelease({
                comments        : [cAlice, botAliceTaken],
                issue           : gfiIssue({state: 'open'}),
                openPullRequests: [{author: 'other', number: 21505, repository: 'neomjs/neo'}],
                pullRequest     : prClosedAfter,
                releaseSince    : activationCut,
                repoUrl         : REPO_URL
            })).toBeNull();

            // Valid unmerged close: notifies alice-new (renamed, id 101) and dan (104) in first-claim order,
            // excludes bob (withdrawn) and carol (capacity-only refusal), ignores contributor-copied marker.
            const first = decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken, cBob, cBobWithdraw, cCap, botCapRefusal, cDan, botTakenReply, aliceRenamed, fakeCopy],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : prClosedAfter,
                releaseSince: activationCut,
                repoUrl     : REPO_URL
            });
            expect(first.notified).toEqual([
                {id: 101, login: 'alice-new'},
                {id: 104, login: 'dan'}
            ]);
            expect(first.body).toContain('@alice-new @dan');
            expect(first.body.indexOf('@alice-new')).toBeLessThan(first.body.indexOf('@dan'));
            expect(first.body).toContain('#21500 closed without merging');
            expect(first.body).toContain('grants no priority and does not guarantee');
            expect(first.body).toContain(releaseMarker({issue: 19143, login: 'alice-new', pr: 21500, repo: 'neomjs/neo', to: 101}));
            expect(first.body).toContain(releaseMarker({issue: 19143, login: 'dan', pr: 21500, repo: 'neomjs/neo', to: 104}));

            // Close -> reopen -> close with same PR + renamed login under same numeric user id emits zero duplicate notice
            const botRelease = comment('github-actions[bot]', '2026-11-15T17:30:05Z', first.body, {type: 'Bot'});
            expect(decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken, aliceRenamed, cDan, botTakenReply, botRelease],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : {...prClosedAfter, user: {...prClosedAfter.user}, closed_at: '2026-11-15T17:40:00Z'},
                releaseSince: activationCut,
                repoUrl     : REPO_URL
            })).toBeNull();

            // Reusing old login with a NEW numeric account id (1999) is NOT blocked by old release marker for id 101
            const newAccountSameLogin = comment('alice-old', '2026-11-15T17:35:00Z', '/claim', {id: 1999});
            const botNewTaken         = comment('github-actions[bot]', '2026-11-15T17:35:02Z',
                `Thanks, @alice-old! This one is taken: #21500 is open for it.\n\n${replyMarker('alice-old')}\n<!-- claim-refused:${newAccountSameLogin.id} -->`,
                {type: 'Bot'});
            expect(decidePullRequestRelease({
                comments    : [cAlice, botAliceTaken, cDan, botTakenReply, botRelease, newAccountSameLogin, botNewTaken],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : {...prClosedAfter, closed_at: '2026-11-15T17:45:00Z'},
                releaseSince: activationCut,
                repoUrl     : REPO_URL
            }).notified).toEqual([{id: 1999, login: 'alice-old'}]);

            // Incomplete claimant identity (no numeric user id) fails visibly
            const cNoId        = comment('no-id-claimant', '2026-11-15T17:12:00Z', '/claim');
            const botNoIdTaken = comment('github-actions[bot]', '2026-11-15T17:12:02Z',
                `Thanks, @no-id-claimant! This one is taken: #21500 is open for it.\n\n${replyMarker('no-id-claimant')}\n<!-- claim-refused:${cNoId.id} -->`,
                {type: 'Bot'});
            expect(() => decidePullRequestRelease({
                comments    : [cNoId, botNoIdTaken],
                issue       : gfiIssue({state: 'open'}),
                pullRequest : prClosedAfter,
                releaseSince: activationCut,
                repoUrl     : REPO_URL
            })).toThrow('missing numeric user id');
        });

        test('workflow github-script handles pull_request_target lifecycle, security boundary, provenance, and release race checks', async () => {
            const
                workflowPath     = path.resolve(process.cwd(), '.github/workflows/claim-responder.yml'),
                raw              = fs.readFileSync(workflowPath, 'utf8'),
                scriptBlock      = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
                AsyncFunction    = Object.getPrototypeOf(async function () {}).constructor,
                runStep          = new AsyncFunction('github', 'context', 'core', scriptBlock),
                prevWorkspace    = process.env.GITHUB_WORKSPACE,
                prevReleaseSince = process.env.NEO_CLAIM_RELEASE_SINCE;

            expect(raw).toContain('pull_request_target:');
            expect(raw).toContain('types: [opened, reopened, edited, closed]');
            expect(raw).toContain('pull-requests: write');
            expect(raw).toContain('NEO_CLAIM_RELEASE_SINCE: ${{ vars.NEO_CLAIM_RELEASE_SINCE }}');
            expect(raw).toContain('"repos/neomjs/neo/contents/buildScripts/util/${module}?ref=${WORKFLOW_SHA}"');
            expect(raw).toContain('WORKFLOW_SHA: ${{ job.workflow_sha }}');
            expect(raw).not.toContain('github.event.pull_request.head');

            const createHarness = ({permission = 'read', mergedCount = 0, nextIssueReadHook, graphqlHasNextPage = false} = {}) => {
                const
                    issues      = new Map([
                        [19143, gfiIssue({assignees: [], number: 19143, state: 'open'})],
                        [20691, gfiIssue({assignees: [], number: 20691, state: 'open'})],
                        [20692, gfiIssue({assignees: [], number: 20692, state: 'closed'})]
                    ]),
                    comments    = new Map([[19143, []], [20691, []], [20692, []], [21500, []], [21501, []]]),
                    events      = new Map([[19143, []], [20691, []], [20692, []]]),
                    pullLinks   = new Map([
                        [19143, []],
                        [20691, []],
                        [20692, [{author: {login: 'merged-author'}, merged: true, number: 21400, repository: {nameWithOwner: 'neomjs/neo'}, state: 'MERGED'}]]
                    ]),
                    pullDetails = new Map(),
                    created     = [],
                    assigned    = [],
                    unassigned  = [],
                    warnings    = [];
                let reads = 0;

                const github = {
                    graphql : async (query, vars) => ({
                        repository: {
                            issue: {
                                closedByPullRequestsReferences: {
                                    nodes   : pullLinks.get(vars.number) || [],
                                    pageInfo: {hasNextPage: graphqlHasNextPage}
                                }
                            }
                        }
                    }),
                    paginate: async (fn, args) => {
                        if (fn === github.rest.issues.listComments) return [...(comments.get(args.issue_number) || [])];
                        if (fn === github.rest.issues.listEvents)   return [...(events.get(args.issue_number) || [])];
                        if (fn === github.rest.issues.listForRepo) {
                            return [...issues.values()].filter(item =>
                                item.state === args.state &&
                                (item.assignees || []).some(a => a.login.toLowerCase() === args.assignee.toLowerCase())
                            )
                        }
                        throw new Error('unexpected paginate')
                    },
                    rest: {
                        issues: {
                            addAssignees: async args => {
                                assigned.push(args);
                                const
                                    target        = issues.get(args.issue_number),
                                    issueComments = comments.get(args.issue_number) || [],
                                    canAttach     = login => {
                                        const lower = String(login).toLowerCase();
                                        return String(target.user?.login || '').toLowerCase() === lower ||
                                            issueComments.some(c => String(c.user?.login || '').toLowerCase() === lower)
                                    },
                                    attachable    = args.assignees.filter(canAttach);

                                target.assignees = [
                                    ...(target.assignees || []),
                                    ...attachable
                                        .filter(login => !(target.assignees || []).some(a => a.login.toLowerCase() === login.toLowerCase()))
                                        .map(login => ({id: 7001, login}))
                                ];
                                return {data: target}
                            },
                            createComment: async args => {
                                created.push(args);
                                const list  = comments.get(args.issue_number) || [];
                                const entry = comment('github-actions[bot]', '2026-11-15T17:30:05Z', args.body, {type: 'Bot'});
                                list.push(entry);
                                comments.set(args.issue_number, list);
                                return {data: entry}
                            },
                            get: async ({issue_number}) => {
                                reads += 1;
                                if (nextIssueReadHook) nextIssueReadHook({comments, events, issue_number, issues, pullLinks, reads});
                                return {data: issues.get(issue_number)}
                            },
                            listComments   : Symbol('listComments'),
                            listEvents     : Symbol('listEvents'),
                            listForRepo    : Symbol('listForRepo'),
                            removeAssignees: async args => {
                                unassigned.push(args);
                                const target = issues.get(args.issue_number);
                                target.assignees = (target.assignees || []).filter(a =>
                                    !args.assignees.some(login => login.toLowerCase() === a.login.toLowerCase())
                                );
                                return {data: target}
                            }
                        },
                        pulls: {
                            get: async ({pull_number}) => ({data: pullDetails.get(pull_number)})
                        },
                        repos: {
                            getCollaboratorPermissionLevel: async ({username}) => ({
                                data: {permission: typeof permission === 'function' ? permission(username) : permission}
                            })
                        },
                        search: {
                            issuesAndPullRequests: async ({q}) => q.startsWith('org:')
                                ? {data: {incomplete_results: false, total_count: mergedCount}}
                                : {data: {items: [{number: 20691}, {number: 20695}]}}
                        }
                    }
                };

                const runPrEvent = (action, pullRequest, changes) => runStep(
                    github,
                    {eventName: 'pull_request_target', payload: {action, changes, pull_request: pullRequest}, repo: {owner: 'neomjs', repo: 'neo'}},
                    {info: () => {}, warning: msg => warnings.push(msg)}
                );

                return {assigned, comments, created, events, issues, pullDetails, pullLinks, runPrEvent, unassigned, warnings}
            };

            process.env.GITHUB_WORKSPACE = process.cwd();
            try {
                // 1. Opening on unclaimed curated issue assigns attachable author + target swap unassigns old issue and claims new issue + edits without target delta do nothing
                const hUnattachable  = createHarness();
                const prUnattachable = {
                    author_association: 'NONE',
                    body              : 'Resolves #19143',
                    created_at        : '2026-11-15T17:10:00Z',
                    number            : 21498,
                    user              : {id: 7002, login: 'silent-author', type: 'User'}
                };
                hUnattachable.pullLinks.set(19143, [{author: {login: 'silent-author'}, merged: false, number: 21498, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}]);
                await hUnattachable.runPrEvent('opened', prUnattachable);
                expect(hUnattachable.issues.get(19143).assignees).toEqual([]);
                expect(hUnattachable.created).toEqual([]);
                expect(hUnattachable.warnings).toEqual(['GitHub did not attach silent-author as assignee on #19143.']);

                const h1  = createHarness();
                const pr1 = {
                    author_association: 'NONE',
                    body              : 'Resolves #19143',
                    created_at        : '2026-11-15T17:10:00Z',
                    number            : 21500,
                    user              : {id: 7001, login: 'outside-dev', type: 'User'}
                };
                h1.comments.set(19143, [comment('outside-dev', '2026-11-15T17:00:00Z', 'Investigating the reproduction steps.', {id: 7001})]);
                h1.issues.get(20691).user = {id: 7001, login: 'outside-dev'};
                h1.pullLinks.set(19143, [{author: {login: 'outside-dev'}, merged: false, number: 21500, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}]);
                await h1.runPrEvent('opened', pr1);
                expect(h1.assigned).toEqual([{assignees: ['outside-dev'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
                expect(h1.issues.get(19143).assignees.map(a => a.login)).toEqual(['outside-dev']);
                expect(h1.created).toEqual([]);

                // Redelivery / reopen / checklist edit make zero extra assignments or comments
                await h1.runPrEvent('reopened', pr1);
                await h1.runPrEvent('edited', {...pr1, body: 'Resolves #19143\n- [x] done'}, {body: {from: 'Resolves #19143'}});
                expect(h1.assigned).toHaveLength(1);
                expect(h1.created).toEqual([]);

                // Bot assigned event enables clean swap from old issue to new issue without exceeding 1-slot cap
                h1.events.get(19143).push({
                    actor     : {login: 'github-actions[bot]', type: 'Bot'},
                    assignee  : {login: 'outside-dev'},
                    created_at: '2026-11-15T17:10:02Z',
                    event     : 'assigned'
                });
                h1.pullLinks.set(19143, []);
                await h1.runPrEvent('edited', {...pr1, body: 'Resolves #20691'}, {body: {from: 'Resolves #19143'}});
                expect(h1.unassigned).toEqual([{assignees: ['outside-dev'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
                expect(h1.assigned.map(c => c.issue_number)).toEqual([19143, 20691]);
                expect(h1.issues.get(20691).assignees.map(a => a.login)).toEqual(['outside-dev']);

                // 2. Hidden team membership is skipped without assignment
                const hTeam = createHarness({permission: 'write'});
                await hTeam.runPrEvent('opened', {...pr1, author_association: 'CONTRIBUTOR'});
                expect(hTeam.assigned).toEqual([]);
                expect(hTeam.created).toEqual([]);

                // 3. Unknown permission or truncated GraphQL fails visibly with zero writes
                const hBadPerm = createHarness({permission: 'mystery'});
                await expect(hBadPerm.runPrEvent('opened', pr1)).rejects.toThrow('names no repository permission');
                expect(hBadPerm.assigned).toEqual([]);

                const hTrunc = createHarness({graphqlHasNextPage: true});
                await expect(hTrunc.runPrEvent('opened', pr1)).rejects.toThrow('Incomplete state read');
                expect(hTrunc.assigned).toEqual([]);

                // 4. Removing target with uncertain provenance throws BEFORE mutating anything (even if a new target was added in same edit)
                const hUncertain = createHarness();
                hUncertain.issues.get(19143).assignees = [{id: 7001, login: 'outside-dev'}];
                await expect(hUncertain.runPrEvent(
                    'edited',
                    {...pr1, body: 'Resolves #20691'},
                    {body: {from: 'Resolves #19143'}}
                )).rejects.toThrow('no assigned event');
                expect(hUncertain.unassigned).toEqual([]);
                expect(hUncertain.assigned).toEqual([]);

                // 5. Merged team PR closing the issue notifies an open outside PR carrying an opening overlap notice once, and warns cleanly if closed-event reads throw
                const hMerged       = createHarness({permission: username => username === 'team-dev' ? 'maintain' : 'read'});
                const outsideOpenPr = {
                    author_association: 'NONE',
                    body              : 'Resolves #19143',
                    created_at        : '2026-11-15T17:10:00Z',
                    number            : 21501,
                    user              : {id: 8001, login: 'second-dev', type: 'User'}
                };
                const mergedTeamPr = {
                    author_association: 'MEMBER',
                    body              : 'Resolves #19143',
                    closed_at         : '2026-11-15T17:25:00Z',
                    created_at        : '2026-11-15T17:05:00Z',
                    merged            : true,
                    number            : 21500,
                    user              : {id: 9001, login: 'team-dev', type: 'User'}
                };
                hMerged.pullDetails.set(21501, outsideOpenPr);
                hMerged.pullLinks.set(19143, [
                    {author: {login: 'team-dev'}, merged: false, number: 21500, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'},
                    {author: {login: 'second-dev'}, merged: false, number: 21501, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}
                ]);
                await hMerged.runPrEvent('opened', outsideOpenPr);
                expect(hMerged.created).toHaveLength(1);
                expect(hMerged.created[0].body).toContain(overlapMarker({heldBy: 'pr:21500', issue: 19143, pr: 21501}));

                hMerged.pullLinks.set(19143, [{author: {login: 'second-dev'}, merged: false, number: 21501, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}]);
                await hMerged.runPrEvent('closed', mergedTeamPr);
                await hMerged.runPrEvent('closed', mergedTeamPr);
                expect(hMerged.created).toHaveLength(2);
                expect(hMerged.created[1].issue_number).toBe(21501);
                expect(hMerged.created[1].body).toContain('residual-scope review');
                expect(hMerged.created[1].body).toContain(overlapMarker({heldBy: 'pr:21500', issue: 19143, pr: 21501}));

                const hMergedThrow = createHarness({
                    permission       : username => username === 'team-dev' ? 'maintain' : 'read',
                    nextIssueReadHook: () => {
                        throw new Error('boom on merged close')
                    }
                });
                await hMergedThrow.runPrEvent('closed', mergedTeamPr);
                expect(hMergedThrow.created).toEqual([]);
                expect(hMergedThrow.warnings).toHaveLength(1);
                expect(hMergedThrow.warnings[0]).toMatch(/boom on merged close/);

                // 6. Unmerged close hold & race re-check: default (unset env + null export) emits nothing; when activated,
                // a concurrent claimant arriving between read 1 and read 2 suppresses any release comment
                const displaced      = comment('displaced-dev', '2026-11-15T17:12:00Z', "I'd like to claim this.", {id: 8002});
                const displacedReply = comment('github-actions[bot]', '2026-11-15T17:12:03Z',
                    `Thanks, @displaced-dev! This one is taken: #21500 is open for it.\n\n${replyMarker('displaced-dev')}\n<!-- claim-refused:${displaced.id} -->`,
                    {type: 'Bot'});
                const closedPr = {
                    author_association: 'NONE',
                    body              : 'Resolves #19143',
                    closed_at         : '2026-11-15T17:35:00Z',
                    created_at        : '2026-11-15T17:10:00Z',
                    merged            : false,
                    number            : 21500,
                    user              : {id: 7001, login: 'outside-dev', type: 'User'}
                };

                delete process.env.NEO_CLAIM_RELEASE_SINCE;
                const hDefaultHold = createHarness();
                hDefaultHold.comments.set(19143, [displaced, displacedReply]);
                await hDefaultHold.runPrEvent('closed', closedPr);
                expect(hDefaultHold.created).toEqual([]);

                process.env.NEO_CLAIM_RELEASE_SINCE = '2026-11-15T17:25:00Z';

                const hRace = createHarness({
                    nextIssueReadHook: ({issues: liveIssues, reads: r}) => {
                        if (r === 2) liveIssues.get(19143).assignees = [{id: 8003, login: 'racer'}]
                    }
                });
                hRace.comments.set(19143, [displaced, displacedReply]);
                await hRace.runPrEvent('closed', closedPr);
                expect(hRace.created).toEqual([]);

                // Without race, unmerged close notifies displaced-dev once and close -> reopen -> close stays silent
                const hRel = createHarness();
                hRel.comments.set(19143, [displaced, displacedReply]);
                await hRel.runPrEvent('closed', closedPr);
                await hRel.runPrEvent('closed', {...closedPr, closed_at: '2026-11-15T17:45:00Z'});
                expect(hRel.created).toHaveLength(1);
                expect(hRel.created[0].issue_number).toBe(19143);
                expect(hRel.created[0].body).toContain('@displaced-dev');
                expect(hRel.created[0].body).toContain(releaseMarker({issue: 19143, login: 'displaced-dev', pr: 21500, repo: 'neomjs/neo', to: 8002}));

                // Throwing read on unmerged close warns cleanly without failing the closed head
                const hRelThrow = createHarness({
                    nextIssueReadHook: () => {
                        throw new Error('boom on unmerged close')
                    }
                });
                await hRelThrow.runPrEvent('closed', closedPr);
                expect(hRelThrow.created).toEqual([]);
                expect(hRelThrow.warnings).toHaveLength(1);
                expect(hRelThrow.warnings[0]).toMatch(/boom on unmerged close/);
            } finally {
                if (prevWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
                else process.env.GITHUB_WORKSPACE = prevWorkspace;
                if (prevReleaseSince === undefined) delete process.env.NEO_CLAIM_RELEASE_SINCE;
                else process.env.NEO_CLAIM_RELEASE_SINCE = prevReleaseSince
            }
        });

        test('workflow exposes zero-input workflow_call pinned by job.workflow_sha, keeps single claim-responder queue owner, and executes against sibling repositories', async () => {
            const
                workflowPath  = path.resolve(process.cwd(), '.github/workflows/claim-responder.yml'),
                raw           = fs.readFileSync(workflowPath, 'utf8'),
                workflow      = yaml.load(raw),
                respondJob    = workflow?.jobs?.respond,
                steps         = respondJob?.steps ?? [],
                verifyStep    = steps.find(step => step.name === 'Verify defining workflow commit'),
                checkoutSteps = steps.filter(step => String(step.uses || '').startsWith('actions/checkout@')),
                fetchStep     = steps.find(step => step.name === 'Fetch the reply modules'),
                scriptStep    = steps.find(step => step.name === 'Answer the claim'),
                prevWorkspace = process.env.GITHUB_WORKSPACE;

            expect(Object.keys(workflow.on).sort()).toEqual(['issue_comment', 'pull_request_target', 'workflow_call']);
            expect(workflow.on.workflow_call).toBeNull();

            expect(respondJob.if.replace(/\s+/g, ' ')).toContain(
                `github.event.action == 'closed' || !contains(fromJSON('${JSON.stringify(TEAM_ASSOCIATIONS)}'), github.event.pull_request.author_association)`
            );

            expect(workflow.concurrency).toBeUndefined();
            expect(Object.keys(workflow.jobs)).toEqual(['respond']);
            expect(respondJob?.concurrency).toEqual({
                group               : 'claim-responder',
                'cancel-in-progress': false,
                queue               : 'max'
            });

            expect(verifyStep).toBeTruthy();
            expect(verifyStep.if).toBeUndefined();
            expect(verifyStep.env).toEqual({WORKFLOW_SHA: '${{ job.workflow_sha }}'});
            expect(String(verifyStep.run)).not.toContain('${{');

            // No checkout: on a merged close the workflow commit is the pull request's merge commit, which
            // actions/checkout refuses for a fork. The modules come through the contents API at that commit.
            expect(checkoutSteps).toHaveLength(0);
            expect(fetchStep.env).toEqual({GH_TOKEN: '${{ github.token }}', WORKFLOW_SHA: '${{ job.workflow_sha }}'});
            expect(String(fetchStep.run)).not.toContain('${{');
            expect(String(fetchStep.run)).toContain('"repos/neomjs/neo/contents/buildScripts/util/${module}?ref=${WORKFLOW_SHA}"');

            expect(scriptStep?.uses).toMatch(/^actions\/github-script@/);
            expect(String(scriptStep?.with?.script || '')).not.toContain('${{');

            // Execute the actual shell revision guard across valid 40-hex defining commits and invalid refs
            const
                definingSha    = '8dfdf6da6ec994300e951c6a56e582d6ab95c4a1',
                alternateSha   = '79f1de332a10193722b7934f21277001616b8501',
                runVerifyGuard = workflowSha => execFileSync('bash', ['-eo', 'pipefail', '-c', String(verifyStep.run)], {
                    env  : {...process.env, WORKFLOW_SHA: workflowSha},
                    stdio: 'pipe'
                });

            expect(() => runVerifyGuard(definingSha)).not.toThrow();
            expect(() => runVerifyGuard(alternateSha)).not.toThrow();
            for (const badRef of ['dev', '', '8dfdf6da6ec994300e951c6a56e582d6ab95c4a']) {
                expect(() => runVerifyGuard(badRef), `expected guard rejection for ${JSON.stringify(badRef)}`).toThrow();
            }

            // Contract validator modeling GitHub Actions reusable-workflow dispatch and queue ownership
            const validateThinCallerContract = (callerYaml, calledWorkflow, runtime) => {
                const
                    caller     = yaml.load(callerYaml),
                    jobEntries = Object.entries(caller?.jobs ?? {}),
                    calledJobs = Object.values(calledWorkflow?.jobs ?? {});

                if (jobEntries.length !== 1) {
                    throw new Error('Caller must declare exactly one workflow_call job');
                }

                const [callerJobName, callerJob] = jobEntries[0];

                if (caller?.concurrency || callerJob?.concurrency) {
                    throw new Error(`Nested concurrency group deadlock: caller '${callerJobName}' must omit concurrency`);
                }

                if (Array.isArray(callerJob?.steps) && callerJob.steps.length > 0) {
                    throw new Error('Thin caller must not declare steps or check out files');
                }

                const usesMatch = String(callerJob?.uses || '').match(/^neomjs\/neo\/\.github\/workflows\/claim-responder\.yml@([0-9a-f]{40})$/);

                if (!usesMatch) {
                    throw new Error(`Caller uses ref must pin a full 40-hex SHA on neomjs/neo: ${callerJob?.uses ?? '<missing>'}`);
                }

                const declaredInputs = calledWorkflow?.on?.workflow_call?.inputs ?? {};

                if (callerJob?.with && Object.keys(callerJob.with).length > 0) {
                    const unknownKeys = Object.keys(callerJob.with).filter(key => !Object.hasOwn(declaredInputs, key));

                    if (unknownKeys.length > 0) {
                        throw new Error(`Zero-input workflow_call rejects caller inputs: ${unknownKeys.join(', ')}`);
                    }
                }

                const owners = [
                    ...(caller?.concurrency?.group === 'claim-responder' ? ['caller:workflow'] : []),
                    ...(callerJob?.concurrency?.group === 'claim-responder' ? [`caller:${callerJobName}`] : []),
                    ...Object.entries(calledWorkflow?.jobs ?? {})
                        .filter(([, job]) => job?.concurrency?.group === 'claim-responder')
                        .map(([name]) => `called:${name}`)
                ];

                if (owners.length !== 1 || calledJobs.length !== 1) {
                    throw new Error(`Expected exactly one claim-responder concurrency owner, found ${owners.join(', ') || 'none'}`);
                }

                const workflowSha = runtime.repository === 'neomjs/neo' ? runtime.directWorkflowSha : usesMatch[1];

                runVerifyGuard(workflowSha);

                return {
                    moduleRef        : workflowSha,
                    concurrencyOwners: owners,
                    callerShaIgnored : runtime.callerRepoSha
                };
            };

            const validCallerYaml = [
                'name: Claim responder',
                'on:',
                '  issue_comment:',
                '    types: [created]',
                '  pull_request_target:',
                '    types: [opened, reopened, edited, closed]',
                'jobs:',
                '  call-responder:',
                `    uses: neomjs/neo/.github/workflows/claim-responder.yml@${definingSha}`,
                '    secrets: inherit'
            ].join('\n');

            // Valid single-pin sibling caller: single concurrency owner, reads the modules at the defining SHA even when caller repo SHA differs
            expect(validateThinCallerContract(validCallerYaml, workflow, {
                repository   : 'neomjs/neo-agent-brain',
                callerRepoSha: alternateSha
            })).toEqual({
                moduleRef        : definingSha,
                concurrencyOwners: ['called:respond'],
                callerShaIgnored : alternateSha
            });

            // Direct Engine run: reads the modules at job.workflow_sha directly with single concurrency owner
            expect(validateThinCallerContract(validCallerYaml, workflow, {
                repository       : 'neomjs/neo',
                directWorkflowSha: alternateSha,
                callerRepoSha    : alternateSha
            })).toEqual({
                moduleRef        : alternateSha,
                concurrencyOwners: ['called:respond'],
                callerShaIgnored : alternateSha
            });

            // Two different well-formed SHAs AND redundant matching engine_commit are both rejected under zero-input contract
            expect(() => validateThinCallerContract(
                `${validCallerYaml}\n    with:\n      engine_commit: ${alternateSha}`,
                workflow,
                {repository: 'neomjs/neo-agent-brain', callerRepoSha: alternateSha}
            )).toThrow(/Zero-input workflow_call rejects caller inputs: engine_commit/);

            expect(() => validateThinCallerContract(
                `${validCallerYaml}\n    with:\n      engine_commit: ${definingSha}`,
                workflow,
                {repository: 'neomjs/neo-agent-brain', callerRepoSha: alternateSha}
            )).toThrow(/Zero-input workflow_call rejects caller inputs: engine_commit/);

            // Unpinned caller ref and caller-declared claim-responder concurrency (nested lock deadlock) are rejected
            expect(() => validateThinCallerContract(
                validCallerYaml.replace(definingSha, 'dev'),
                workflow,
                {repository: 'neomjs/neo-agent-brain', callerRepoSha: alternateSha}
            )).toThrow(/40-hex SHA/);

            expect(() => validateThinCallerContract(
                `${validCallerYaml}\n    concurrency:\n      group: claim-responder\n      cancel-in-progress: false\n      queue: max`,
                workflow,
                {repository: 'neomjs/neo-agent-brain', callerRepoSha: alternateSha}
            )).toThrow(/Nested concurrency group deadlock/);

            expect(() => validateThinCallerContract(
                `concurrency:\n  group: claim-responder\n${validCallerYaml}`,
                workflow,
                {repository: 'neomjs/neo-agent-brain', callerRepoSha: alternateSha}
            )).toThrow(/Nested concurrency group deadlock/);

            const
                AsyncFunction = Object.getPrototypeOf(async function () {}).constructor,
                runStep       = new AsyncFunction('github', 'context', 'core', String(scriptStep.with.script)),
                issue         = gfiIssue({number: 1764, state: 'open'}),
                assigned      = [],
                created       = [],
                siblingClaim  = comment('outside-sibling-dev', '2026-11-16T02:00:00Z', "I'd like to work on this.", {id: 8801});

            const github = {
                graphql : async () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}),
                paginate: async fn => {
                    if (fn === github.rest.issues.listComments) return [siblingClaim];
                    if (fn === github.rest.issues.listEvents)   return [];
                    if (fn === github.rest.issues.listForRepo)  return [];
                    throw new Error('unexpected paginate')
                },
                rest: {
                    issues: {
                        addAssignees: async args => {
                            assigned.push(args);
                            return {data: {...issue, assignees: [{id: 8801, login: 'outside-sibling-dev'}]}}
                        },
                        createComment: async args => { created.push(args); return {data: {}} },
                        get          : async () => ({data: issue}),
                        listComments : Symbol('listComments'),
                        listEvents   : Symbol('listEvents'),
                        listForRepo  : Symbol('listForRepo')
                    },
                    repos : {getCollaboratorPermissionLevel: async () => ({data: {permission: 'read'}})},
                    search: {
                        issuesAndPullRequests: async ({q}) => q.startsWith('org:')
                            ? {data: {incomplete_results: false, total_count: 0}}
                            : {data: {items: []}}
                    }
                }
            };

            process.env.GITHUB_WORKSPACE = process.cwd();
            try {
                await runStep(
                    github,
                    {
                        eventName: 'issue_comment',
                        payload  : {action: 'created', comment: siblingClaim, issue: {number: 1764, state: 'open'}},
                        repo     : {owner: 'neomjs', repo: 'neo-agent-brain'}
                    },
                    {info: () => {}, warning: () => {}}
                );

                expect(assigned).toEqual([{
                    assignees   : ['outside-sibling-dev'],
                    issue_number: 1764,
                    owner       : 'neomjs',
                    repo        : 'neo-agent-brain'
                }]);
                expect(created).toHaveLength(1);
                expect(created[0].owner).toBe('neomjs');
                expect(created[0].repo).toBe('neo-agent-brain');
                expect(created[0].issue_number).toBe(1764);
                expect(created[0].body).toContain('Assigned to you')
            } finally {
                if (prevWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
                else process.env.GITHUB_WORKSPACE = prevWorkspace
            }
        });
    });

    test.describe('assigned claimant withdrawal recognition, unassignment, and workflow guards', () => {
        test('isWithdrawal separates actual releases and combined claim words from negations and scheduled deferrals', () => {
            const expectedReleases = [
                'Unclaiming this: I closed #21058 (see the note there). The issue is free for anyone; the branch on that PR has a verified fix plus tests if useful.',
                "I'm withdrawing my claim.",
                'Please unassign me.',
                "I'm stepping back from this one.",
                'Consider it available.',
                "Sorry, I can't work on this anymore.",
                'Giving up the claim.',
                "I'm no longer able to work on this.",
                "I wasn't stepping back earlier, please unassign me now.",
                "Sorry I couldn't finish this, stepping back.",
                "I couldn't reproduce this and I'm stepping back.",
                "I ran out of bandwidth so I'm withdrawing my claim.",
                "Because I can't get my build working, I'm stepping back."
            ];
            for (const text of expectedReleases) {
                expect(isWithdrawal(text), text).toBe(true)
            }

            const nonReleases = [
                "I can't finish this before Friday, the PR comes Monday.",
                'Still working on this.',
                "Please unassign me — wait, I'll take this one after all.",
                'Consider it available\n/claim',
                'I am not withdrawing my claim. The fix is still underway.',
                'I do not plan to withdraw my claim. The fix is still underway.',
                "I'm not considering withdrawing my claim. I am still working on it.",
                'I am not withdrawing my claim.',
                'I do not plan to withdraw my claim.',
                "I'm not considering withdrawing my claim.",
                'I do not think I should withdraw my claim.',
                "I don't think I'm withdrawing my claim.",
                'I have no plans at all to withdraw my claim.',
                "I'm not dropping my claim.",
                'not giving up the claim',
                'I am no longer stepping back from this.',
                'Never unclaiming this.',
                "Please don't unassign me.",
                "I'm not going to work on this tonight, I'll push tomorrow.",
                'What happens if I withdraw my claim?',
                'Am I stepping back from this? No.',
                "If something comes up, I'll withdraw my claim.",
                'Commenting `/unclaim` or "please unassign me" returns the claim.',
                'I will withdraw my claim if someone else would like it.',
                '/unclaim if someone else can finish it',
                'I have not, and never will, withdraw my claim.',
                'Do not write: I withdraw my claim.',
                'It would be wrong to say, I withdraw my claim.',
                'I know I should not say, I cannot work on this anymore.',
                'Do not give up and unclaim this.',
                'Do not write — I withdraw my claim.'
            ];
            for (const text of nonReleases) {
                expect(isWithdrawal(text), text).toBe(false)
            }

            // Linear-time bound under repetitive input (ReDoS guard)
            const t0 = performance.now();
            expect(isWithdrawal(`sorry ${'not '.repeat(200)}withdrawing my claim`)).toBe(false);
            expect(isWithdrawal(`sorry, ${'a, '.repeat(200)}withdrawing my claim`)).toBe(true);
            expect(performance.now() - t0).toBeLessThan(50);

            // Exact assigned-fixture check for ordinary continuing negations, two-subject denials, trailing conditionals, and comma-split denials
            const
                claim1    = comment('outside-dev', '2026-11-16T04:00:00Z', '/claim', {id: 7101}),
                assigned1 = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'outside-dev'}, created_at: '2026-11-16T04:00:02Z', event: 'assigned'},
                openIssue = gfiIssue({assignees: [{id: 7101, login: 'outside-dev'}], state: 'open'});

            for (const phrase of [
                'I do not plan to withdraw my claim. The fix is still underway.',
                "I'm not considering withdrawing my claim. I am still working on it.",
                'I do not think I should withdraw my claim.',
                'I have no plans at all to withdraw my claim.',
                'I will withdraw my claim if someone else would like it.',
                '/unclaim if someone else can finish it',
                'I have not, and never will, withdraw my claim.',
                'Do not write: I withdraw my claim.',
                'It would be wrong to say, I withdraw my claim.',
                'I know I should not say, I cannot work on this anymore.',
                'Do not give up and unclaim this.',
                'Do not write — I withdraw my claim.'
            ]) {
                const note = comment('outside-dev', '2026-11-16T10:00:00Z', phrase, {id: 7101});
                expect(decideWithdrawal({comment: note, comments: [claim1, note], events: [assigned1], issue: openIssue, repoUrl: REPO_URL})).toBeNull();
            }
        });

        test('replays an assigned withdrawal so the next claimant is first in line, prevents clock reset, and allows re-claiming', () => {
            const
                claimedAt = '2026-11-16T04:00:00Z',
                wrenClaim = comment('wren', claimedAt, '/claim', {id: 7101}),
                botAccept = comment('github-actions[bot]', '2026-11-16T04:00:02Z',
                    decideClaim({comment: wrenClaim, comments: [wrenClaim], issue: gfiIssue(), repoUrl: REPO_URL}).assignedBody,
                    {type: 'Bot'}),
                assignEv    = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'wren'}, created_at: '2026-11-16T04:00:02Z', event: 'assigned'},
                realRelease = comment('wren', '2026-11-16T04:27:50Z',
                    'Unclaiming this: I closed #21058 (see the note there). The issue is free for anyone; the branch on that PR has a verified fix plus tests if useful. — Wren (AI agent)',
                    {id: 7101}),
                pleaseFree  = comment('wren', '2026-11-16T04:27:50Z', 'Please unassign me.', {id: 7101}),
                newcomer    = comment('next-dev', '2026-11-16T04:28:30Z', "I'd like to work on this.", {id: 7201}),
                stillAssigned = gfiIssue({assignees: [{id: 7101, login: 'wren'}]});

            // Control without withdrawal refuses the newcomer
            const control = decideClaim({
                candidates: CANDIDATES,
                comment   : newcomer,
                comments  : [wrenClaim, botAccept, newcomer],
                events    : [assignEv],
                issue     : stillAssigned,
                repoUrl   : REPO_URL
            });
            expect(control.assign).toBe(false);
            expect(control.body).toContain('This one is taken');

            // Both real withdrawal prose and explicit unassign free the issue immediately, even while still listed on assignees
            for (const releaseComment of [realRelease, pleaseFree]) {
                expect(holders({
                    claimant  : 'next-dev',
                    comment   : newcomer,
                    comments  : [wrenClaim, botAccept, releaseComment, newcomer],
                    events    : [assignEv],
                    issue     : stillAssigned,
                    repository: 'neomjs/neo'
                })).toEqual([]);

                const decision = decideClaim({
                    candidates: CANDIDATES,
                    comment   : newcomer,
                    comments  : [wrenClaim, botAccept, releaseComment, newcomer],
                    events    : [assignEv],
                    issue     : stillAssigned,
                    repoUrl   : REPO_URL
                });
                expect(decision.assign).toBe(true);
                expect(decision.unassign).toEqual(['wren']);
            }

            // Failed removeAssignees fallback also does NOT restart the 3-day window from a day-2 withdrawal comment
            const
                day2Release  = comment('wren', daysAfter(claimedAt, 2), pleaseFree.body, {id: 7101}),
                day4Newcomer = comment('day4-dev', daysAfter(claimedAt, CLAIM_WINDOW_DAYS + 1), '/claim', {id: 7202});
            expect(staleAssignees({
                comment   : day4Newcomer,
                comments  : [wrenClaim, botAccept, day2Release, day4Newcomer],
                events    : [assignEv],
                issue     : stillAssigned,
                repository: 'neomjs/neo'
            })).toEqual(['wren']);
            expect(holders({
                claimant  : 'day4-dev',
                comment   : day4Newcomer,
                comments  : [wrenClaim, botAccept, day2Release, day4Newcomer],
                events    : [assignEv],
                issue     : stillAssigned,
                repository: 'neomjs/neo'
            })).toEqual([]);

            // After unassignment, the withdrawing contributor can re-claim via `/claim` and receive a fresh assignment
            const
                unassignEv = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'wren'}, created_at: '2026-11-16T04:27:52Z', event: 'unassigned'},
                reclaim    = comment('wren', '2026-11-16T05:00:00Z', '/claim', {id: 7101}),
                reDecision = decideClaim({
                    candidates: CANDIDATES,
                    comment   : reclaim,
                    comments  : [wrenClaim, botAccept, realRelease, reclaim],
                    events    : [assignEv, unassignEv],
                    issue     : gfiIssue(),
                    repoUrl   : REPO_URL
                });
            expect(reDecision.assign).toBe(true);
            expect(reDecision.assignedBody).toContain('Assigned to you');
        });

        test('decideWithdrawal keeps author open PR holdings while unassigning and deduplicates replies across cycles', () => {
            const
                wrenClaim = comment('wren', '2026-11-16T04:00:00Z', '/claim', {id: 7101}),
                assignEv  = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'wren'}, created_at: '2026-11-16T04:00:02Z', event: 'assigned'},
                withdraw1 = comment('wren', '2026-11-16T04:27:50Z', 'Please unassign me.', {id: 7101}),
                assigned  = gfiIssue({assignees: [{id: 7101, login: 'wren'}], state: 'open'}),
                openPrs   = [{author: 'wren', number: 21500, repository: 'neomjs/neo'}];

            const withPr = decideWithdrawal({
                comment         : withdraw1,
                comments        : [wrenClaim, withdraw1],
                events          : [assignEv],
                issue           : assigned,
                openPullRequests: openPrs,
                repoUrl         : REPO_URL
            });
            expect(withPr.unassign).toBe('wren');
            expect(withPr.body).toContain('Unassigned you, though #21500 is still open and keeps holding this issue');
            expect(withPr.body).toContain(withdrawalMarker('wren'));

            // A subsequent claim sees only the open PR holding the issue even if removeAssignees did not drop the assignee
            const newcomer = comment('other-dev', '2026-11-16T04:28:30Z', '/claim', {id: 7201});
            expect(holders({
                claimant        : 'other-dev',
                comment         : newcomer,
                comments        : [wrenClaim, withdraw1, newcomer],
                events          : [assignEv],
                issue           : assigned,
                openPullRequests: openPrs,
                repository      : 'neomjs/neo'
            })).toEqual([{kind: 'pull-request', login: 'wren', number: 21500}]);
            const nextClaim = decideClaim({
                candidates      : CANDIDATES,
                comment         : newcomer,
                comments        : [wrenClaim, withdraw1, newcomer],
                events          : [assignEv],
                issue           : assigned,
                openPullRequests: openPrs,
                repoUrl         : REPO_URL
            });
            expect(nextClaim.assign).toBe(false);
            expect(nextClaim.body).toContain('#21500 is open for it');
            expect(nextClaim.body).not.toContain('assigned to');

            // Duplicate withdrawal comment adds no reply until a fresh claim or assignment starts a new cycle
            const
                botReply  = comment('github-actions[bot]', '2026-11-16T04:27:52Z', withPr.body, {type: 'Bot'}),
                withdraw2 = comment('wren', '2026-11-16T04:29:00Z', 'Consider it available.', {id: 7101});
            expect(decideWithdrawal({
                comment : withdraw2,
                comments: [wrenClaim, withdraw1, botReply, withdraw2],
                events  : [assignEv],
                issue   : assigned,
                repoUrl : REPO_URL
            })).toBeNull();

            const
                reclaim   = comment('wren', '2026-11-16T05:00:00Z', '/claim', {id: 7101}),
                assign2   = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'wren'}, created_at: '2026-11-16T05:00:02Z', event: 'assigned'},
                withdraw3 = comment('wren', '2026-11-16T05:10:00Z', "I'm stepping back from this one.", {id: 7101});
            expect(decideWithdrawal({
                comment : withdraw3,
                comments: [wrenClaim, withdraw1, botReply, reclaim, withdraw3],
                events  : [assignEv, assign2],
                issue   : assigned,
                repoUrl : REPO_URL
            }).unassign).toBe('wren')
        });

        test('workflow github-script unassigns only verified outside assignees, deduplicates replies, and ignores team/non-assignee/closed targets', async () => {
            const
                workflowPath  = path.resolve(process.cwd(), '.github/workflows/claim-responder.yml'),
                raw           = fs.readFileSync(workflowPath, 'utf8'),
                scriptBlock   = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
                AsyncFunction = Object.getPrototypeOf(async function () {}).constructor,
                runStep       = new AsyncFunction('github', 'context', 'core', scriptBlock),
                prevWorkspace = process.env.GITHUB_WORKSPACE;

            const runWithdrawalHarness = async ({
                assignees     = [{id: 7101, login: 'outside-dev'}],
                association   = 'NONE',
                commentEntry  = null,
                commentsSeed  = [],
                eventsSeed    = [],
                labels        = [{name: 'good first issue'}],
                laterComments = [],
                login         = 'outside-dev',
                openPrs       = [],
                permission    = 'read',
                removeImpl    = null,
                state         = 'open',
                text          = 'Please unassign me.'
            } = {}) => {
                const
                    targetComment = commentEntry || comment(login, '2026-11-16T04:27:50Z', text, {association, id: 7101}),
                    issue         = {assignees: assignees.map(a => ({...a})), labels, number: 19143, state},
                    comments      = [...commentsSeed, targetComment, ...laterComments],
                    events        = [...eventsSeed],
                    created       = [],
                    unassigned    = [],
                    warnings      = [];

                const github = {
                    graphql : async () => ({
                        repository: {
                            issue: {
                                closedByPullRequestsReferences: {
                                    nodes   : openPrs,
                                    pageInfo: {hasNextPage: false}
                                }
                            }
                        }
                    }),
                    paginate: async fn => {
                        if (fn === github.rest.issues.listComments) return [...comments];
                        if (fn === github.rest.issues.listEvents)   return [...events];
                        if (fn === github.rest.issues.listForRepo)  return [];
                        throw new Error('unexpected paginate')
                    },
                    rest: {
                        issues: {
                            addAssignees : async () => ({data: issue}),
                            createComment: async args => {
                                created.push(args);
                                const entry = comment('github-actions[bot]', '2026-11-16T04:27:52Z', args.body, {type: 'Bot'});
                                comments.push(entry);
                                return {data: entry}
                            },
                            get            : async () => ({data: issue}),
                            listComments   : Symbol('listComments'),
                            listEvents     : Symbol('listEvents'),
                            listForRepo    : Symbol('listForRepo'),
                            removeAssignees: async args => {
                                unassigned.push(args);
                                if (removeImpl) return removeImpl(args, issue);
                                issue.assignees = issue.assignees.filter(a => !args.assignees.includes(a.login));
                                return {data: issue}
                            }
                        },
                        repos : {getCollaboratorPermissionLevel: async () => ({data: {permission}})},
                        search: {issuesAndPullRequests: async () => ({data: {incomplete_results: false, items: [], total_count: 0}})}
                    }
                };

                process.env.GITHUB_WORKSPACE = process.cwd();
                try {
                    await runStep(
                        github,
                        {payload: {comment: targetComment, issue: {number: 19143}}, repo: {owner: 'neomjs', repo: 'neo'}},
                        {info: () => {}, warning: msg => warnings.push(msg)}
                    )
                } finally {
                    if (prevWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
                    else process.env.GITHUB_WORKSPACE = prevWorkspace
                }

                return {comments, created, issue, unassigned, warnings}
            };

            // 1. Removes only withdrawing assignee, leaves co-assignee, replies once, suppresses second withdrawal comment
            const claim1    = comment('outside-dev', '2026-11-16T04:00:00Z', '/claim', {id: 7101});
            const assigned1 = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'outside-dev'}, created_at: '2026-11-16T04:00:02Z', event: 'assigned'};
            const ok        = await runWithdrawalHarness({
                assignees   : [{id: 7101, login: 'outside-dev'}, {id: 9001, login: 'co-assignee'}],
                commentsSeed: [claim1],
                eventsSeed  : [assigned1],
                text        : 'Unclaiming this: I closed #21058 (see the note there). The issue is free for anyone; the branch on that PR has a verified fix plus tests if useful.'
            });
            expect(ok.unassigned).toEqual([{assignees: ['outside-dev'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
            expect(ok.issue.assignees.map(a => a.login)).toEqual(['co-assignee']);
            expect(ok.created).toHaveLength(1);
            expect(ok.created[0].body).toContain('this issue is free again');
            expect(ok.created[0].body).toContain('/claim');
            expect(ok.created[0].body).toContain(withdrawalMarker('outside-dev'));
            expect(ok.warnings).toEqual([]);

            // Replay / second withdrawal comment emits zero replies even if assignee lingered
            const second = await runWithdrawalHarness({
                commentsSeed: ok.comments,
                eventsSeed  : [assigned1],
                text        : 'Please unassign me.'
            });
            expect(second.unassigned).toEqual([]);
            expect(second.created).toEqual([]);

            // 2. Unverified removeAssignees (still assigned in response or throws) warns and posts nothing
            const unverified = await runWithdrawalHarness({
                removeImpl: (_args, issue) => ({data: issue})
            });
            expect(unverified.unassigned).toHaveLength(1);
            expect(unverified.created).toEqual([]);
            expect(unverified.warnings).toHaveLength(1);

            const rejected = await runWithdrawalHarness({
                removeImpl: () => { throw new Error('forbidden') }
            });
            expect(rejected.unassigned).toHaveLength(1);
            expect(rejected.created).toEqual([]);
            expect(rejected.warnings[0]).toMatch(/forbidden/);

            // 3. Team assignee (association or collaborator write permission), non-assignee, closed issue, and uncurated issue are untouched
            const teamMember  = await runWithdrawalHarness({assignees: [{id: 8001, login: 'team-dev'}], association: 'MEMBER', login: 'team-dev'});
            const hiddenTeam  = await runWithdrawalHarness({assignees: [{id: 8001, login: 'team-dev'}], login: 'team-dev', permission: 'write'});
            const nonAssignee = await runWithdrawalHarness({assignees: [{id: 9999, login: 'someone-else'}]});
            const closedIssue = await runWithdrawalHarness({state: 'closed'});
            const uncurated   = await runWithdrawalHarness({labels: [{name: 'bug'}]});

            for (const untouched of [teamMember, hiddenTeam, nonAssignee, closedIssue, uncurated]) {
                expect(untouched.unassigned).toEqual([]);
                expect(untouched.created).toEqual([])
            }

            // 4. Negated continuation statements never unassign or trigger withdrawal replies
            const negatedStatement = comment('outside-dev', '2026-11-16T10:00:00Z', 'I am not withdrawing my claim. The fix is still underway.', {id: 7101});
            expect(decideWithdrawal({
                comment : negatedStatement,
                comments: [claim1, negatedStatement],
                events  : [assigned1],
                issue   : gfiIssue({assignees: [{id: 7101, login: 'outside-dev'}], state: 'open'}),
                repoUrl : REPO_URL
            })).toBeNull();

            const negatedRun = await runWithdrawalHarness({
                commentEntry: negatedStatement,
                commentsSeed: [claim1],
                eventsSeed  : [assigned1]
            });
            expect(negatedRun.unassigned).toEqual([]);
            expect(negatedRun.created).toEqual([]);
            expect(holders({
                claimant  : 'next-dev',
                comment   : comment('next-dev', '2026-11-16T10:01:00Z', '/claim', {id: 7201}),
                comments  : [claim1, negatedStatement],
                events    : [assigned1],
                issue     : gfiIssue({assignees: [{id: 7101, login: 'outside-dev'}]}),
                repository: 'neomjs/neo'
            })).toEqual([{id: 7101, kind: 'assignee', login: 'outside-dev'}]);

            // 5. Delayed /unclaim superseded by a later claim, assignment, or negated continuation does nothing
            const
                delayedUnclaim = comment('outside-dev', '2026-11-16T10:00:00Z', '/unclaim', {id: 7101}),
                laterClaim     = comment('outside-dev', '2026-11-16T10:01:00Z', '/claim', {id: 7101}),
                laterAssigned  = {actor: {login: 'github-actions[bot]', type: 'Bot'}, assignee: {login: 'outside-dev'}, created_at: '2026-11-16T10:02:00Z', event: 'assigned'},
                assignedOpen   = gfiIssue({assignees: [{id: 7101, login: 'outside-dev'}], state: 'open'});

            expect(decideWithdrawal({
                comment : delayedUnclaim,
                comments: [claim1, delayedUnclaim, laterClaim],
                events  : [assigned1, laterAssigned],
                issue   : assignedOpen,
                repoUrl : REPO_URL
            })).toBeNull();
            expect(decideWithdrawal({
                comment : delayedUnclaim,
                comments: [claim1, delayedUnclaim, laterClaim],
                events  : [assigned1],
                issue   : assignedOpen,
                repoUrl : REPO_URL
            })).toBeNull();
            expect(decideWithdrawal({
                comment : delayedUnclaim,
                comments: [claim1, delayedUnclaim],
                events  : [assigned1, laterAssigned],
                issue   : assignedOpen,
                repoUrl : REPO_URL
            })).toBeNull();
            expect(decideWithdrawal({
                comment : delayedUnclaim,
                comments: [claim1, delayedUnclaim, comment('outside-dev', '2026-11-16T10:01:00Z', 'Actually I am not withdrawing my claim. The fix is still underway.', {id: 7101})],
                events  : [assigned1],
                issue   : assignedOpen,
                repoUrl : REPO_URL
            })).toBeNull();

            const supersededRun = await runWithdrawalHarness({
                commentEntry : delayedUnclaim,
                commentsSeed : [claim1],
                eventsSeed   : [assigned1, laterAssigned],
                laterComments: [laterClaim]
            });
            expect(supersededRun.unassigned).toEqual([]);
            expect(supersededRun.created).toEqual([]);

            // Positive control: unclaim with no newer activity releases cleanly
            expect(decideWithdrawal({
                comment : delayedUnclaim,
                comments: [claim1, delayedUnclaim],
                events  : [assigned1],
                issue   : assignedOpen,
                repoUrl : REPO_URL
            })?.unassign).toBe('outside-dev');

            const plainControlRun = await runWithdrawalHarness({
                commentEntry: delayedUnclaim,
                commentsSeed: [claim1],
                eventsSeed  : [assigned1]
            });
            expect(plainControlRun.unassigned).toEqual([{assignees: ['outside-dev'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
            expect(plainControlRun.created).toHaveLength(1)
        });
    });
});
