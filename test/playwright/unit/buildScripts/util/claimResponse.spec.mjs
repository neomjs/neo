import fs             from 'node:fs';
import path           from 'node:path';
import {test, expect} from '@playwright/test';

import {
    CLAIM_WINDOW_DAYS,
    claimText,
    decideClaim,
    decideReply,
    earlierClaim,
    holders,
    isClaim,
    isWithdrawal,
    pickAlternatives,
    renderReply,
    replyMarker,
    staleAssignees
} from '../../../../../buildScripts/util/claimResponse.mjs';

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
                claimAt  = '2026-10-31T10:00:00Z',
                claim    = comment('slow-claimant', claimAt, "I'd like to work on this."),
                progressAt = daysAfter(claimAt, CLAIM_WINDOW_DAYS * 2),
                progress = comment('slow-claimant', progressAt, 'Implementation is complete; tests are in progress.'),
                second   = comment('newcomer', daysAfter(progressAt, 1), "I'd like to work on this."),
                silent   = comment('newcomer', daysAfter(progressAt, CLAIM_WINDOW_DAYS + 1), "I'd like to work on this.");

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

    test('renderReply says so when nothing else is free', () => {
        const reply = renderReply({claimant: 'second-claimant', holders: [{kind: 'assignee', login: 'first-claimant'}], alternatives: [], label: 'good first issue', repoUrl: REPO_URL});

        expect(reply).toContain('No other `good first issue` issue is free right now.');
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
                comment   : day4Claim,
                comments  : [oldClaim, day4Claim],
                issue     : staleIssue,
                repoUrl   : REPO_URL
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

        test('workflow github-script auto-assigns verified first-in-line claims, falls back if assignment does not stick, and enforces the 1-issue cap', async () => {
            const
                workflowPath  = path.resolve(process.cwd(), '.github/workflows/claim-responder.yml'),
                raw           = fs.readFileSync(workflowPath, 'utf8'),
                scriptBlock   = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
                AsyncFunction = Object.getPrototypeOf(async function () {}).constructor,
                runStep       = new AsyncFunction('github', 'context', 'core', scriptBlock),
                prevWorkspace = process.env.GITHUB_WORKSPACE;

            expect(raw).not.toMatch(/^concurrency:/m);
            expect(raw).toMatch(/\n    if: >-[\s\S]*?\n    concurrency:\n      group: claim-responder\n      cancel-in-progress: false\n      queue: max\n/);

            process.env.GITHUB_WORKSPACE = process.cwd();

            const runScenario = async ({assignedItems = [], addAssigneesImpl, claim = firstClaim, comments = [firstClaim], events = [], issue = gfiIssue({state: 'open'})}) => {
                const posted = [], assignedCalls = [], unassignedCalls = [], warnings = [], listForRepoCalls = [];

                const github = {
                    graphql : async () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: []}}}}),
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
                                expect(q).not.toContain('assignee:');
                                return {data: {items: [{number: 20691}, {number: 20692}]}}
                            }
                        }
                    }
                };

                await runStep(
                    github,
                    {payload: {comment: claim, issue: {number: issue.number}}, repo: {owner: 'neomjs', repo: 'neo'}},
                    {info: () => {}, warning: msg => warnings.push(msg)}
                );

                return {assignedCalls, listForRepoCalls, posted, unassignedCalls, warnings}
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
                expect(ok.posted[0].body).toContain('Assigned to you — you can start now.');
                expect(ok.warnings).toEqual([]);

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
                expect(capped.posted[0].body).toContain("You're already assigned to #20717");

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
                const
                    burstFirst  = comment('burst-claimant', '2026-11-11T02:34:01Z', "I'd love to work on this."),
                    burstSecond = comment('burst-claimant', '2026-11-11T02:34:03Z', "I'd love to work on this too."),
                    store       = new Map([
                        [19143, gfiIssue({number: 19143, state: 'open'})],
                        [20691, gfiIssue({number: 20691, state: 'open'})]
                    ]),
                    commentsByIssue = new Map([[19143, [burstFirst]], [20691, [burstSecond]]]),
                    burstAssigned   = [],
                    burstPosted     = [];

                const sharedGithub = {
                    graphql : async () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: []}}}}),
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
                            issuesAndPullRequests: async () => ({data: {items: [{number: 19143}, {number: 20691}, {number: 20692}]}})
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
                expect(burstPosted[1].body).toContain("You're already assigned to #19143");
            } finally {
                if (prevWorkspace === undefined) {
                    delete process.env.GITHUB_WORKSPACE
                } else {
                    process.env.GITHUB_WORKSPACE = prevWorkspace
                }
            }
        });
    });
});
