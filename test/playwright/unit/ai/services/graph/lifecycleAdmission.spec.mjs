import {setup} from '../../../../setup.mjs';

const appName = 'LifecycleAdmissionTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * The admission/exclusion matrix. The exclusions carry as much weight as the admissions: a row that
 * does not truly need action teaches peers to ignore the surface, which is how the route's fixture
 * rows failed.
 */
test.describe('lifecycleAdmission — the five stages and their exclusions', () => {
    let admitOwnPrRepair, admitOwnPrReviewerRouting, admitRequestedReview, admitClaimedTask,
        admitDirectMessage, collectLifecycleItems, hasCurrentHeadClosingReview, normalizeClocks;

    const ME   = '@neo-opus-ada',
          PEER = '@neo-gpt',
          HEAD = 'head-2',
          OLD  = 'head-1';

    // SOURCE-shaped, not clock-shaped: reviews name the commit they reviewed and when, checks name their
    // head and completion. The clock owner derives every `*Since` from exactly these, so a fixture that
    // hand-supplied clocks would be testing a contract nothing produces.
    const sourcePr = (overrides = {}) => ({
        id             : 'pr-15231',
        authorId       : ME,
        state          : 'OPEN',
        isDraft        : false,
        headSha        : HEAD,
        headCommittedAt: '2026-07-16T08:00:00.000Z',
        mergeable      : true,
        checks         : [{name: 'unit', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T09:30:00.000Z'}],
        reviews        : [],
        reviewRequests : [],
        url            : 'https://github.com/neomjs/neo/pull/15231',
        mergeableSince : '2026-07-16T09:00:00.000Z',
        checkedAt      : '2026-07-16T10:00:00.000Z',
        ...overrides
    });

    // What the collector hands the predicates.
    const ownPr = (overrides = {}) => normalizeClocks(sourcePr(overrides));

    test.beforeAll(async () => {
        ({
            admitOwnPrRepair, admitOwnPrReviewerRouting, admitRequestedReview, admitClaimedTask,
            admitDirectMessage, collectLifecycleItems, hasCurrentHeadClosingReview
        } = await import('../../../../../../ai/services/graph/lifecycleAdmission.mjs'));
        ({normalizeLifecycleClocks: normalizeClocks} = await import('../../../../../../ai/services/graph/lifecycleAdmission.mjs'));
    });

    test('stage 1 admits a current-head CHANGES_REQUESTED, a failed REQUIRED check, and a merge conflict', () => {
        expect(admitOwnPrRepair({pr: ownPr({reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T09:00:00.000Z'}]}), agentId: ME}).kind)
            .toBe('changes-requested');
        expect(admitOwnPrRepair({pr: ownPr({checks: [{name: 'unit', required: true, conclusion: 'FAILURE', headSha: HEAD, completedAt: '2026-07-16T09:10:00.000Z'}]}), agentId: ME}).kind)
            .toBe('failed-required-check');
        expect(admitOwnPrRepair({pr: ownPr({mergeable: false}), agentId: ME}).kind).toBe('merge-conflict');
        // a clean head is not a repair
        expect(admitOwnPrRepair({pr: ownPr(), agentId: ME})).toBeNull();
    });

    test('EXCLUSION — pending/running CI is a wait, not a repair', () => {
        // "CI is running" must never manufacture a row; only a FAILED required check is actionable.
        const pending = ownPr({checks: [{name: 'unit', required: true, conclusion: null, headSha: HEAD}]});

        expect(admitOwnPrRepair({pr: pending, agentId: ME})).toBeNull();
        // ...and it is not reviewable either: required checks have not passed yet
        expect(admitOwnPrReviewerRouting({pr: pending, agentId: ME})).toBeNull();
    });

    test('EXCLUSION — an OPTIONAL check failing is not a repair trigger', () => {
        // otherwise every advisory linter invents an obligation
        const optionalFail = ownPr({checks: [
            {name: 'unit',     required: true,  conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T09:30:00.000Z'},
            {name: 'advisory', required: false, conclusion: 'FAILURE', headSha: HEAD, completedAt: '2026-07-16T09:40:00.000Z'}
        ]});

        expect(admitOwnPrRepair({pr: optionalFail, agentId: ME})).toBeNull();
        // it stays cleanly reviewable
        expect(admitOwnPrReviewerRouting({pr: optionalFail, agentId: ME})).not.toBeNull();
    });

    test('EXCLUSION — an APPROVED PR awaiting the human merge gate is NOT the agent\'s move', () => {
        // merge is human-only; listing it would ask for an action the agent must never take
        const approved = ownPr({reviews: [{state: 'APPROVED', commitSha: HEAD, authorId: PEER}]});

        expect(admitOwnPrReviewerRouting({pr: approved, agentId: ME})).toBeNull();
        expect(admitOwnPrRepair({pr: approved, agentId: ME})).toBeNull();
    });

    test('EXCLUSION — a draft PR is not yet anyone\'s obligation', () => {
        const draft = ownPr({isDraft: true, reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T09:00:00.000Z'}]});

        expect(admitOwnPrRepair({pr: draft, agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: draft, agentId: ME})).toBeNull();
        expect(admitRequestedReview({pr: {...draft, reviewRequests: [{login: ME, requestedAt: '2026-07-16T09:45:00.000Z'}]}, agentId: ME})).toBeNull();
    });

    test('an OLD-head verdict does not close the current head — the code changed underneath it', () => {
        const staleVerdict = ownPr({reviews: [{state: 'APPROVED', commitSha: OLD, authorId: PEER}]});

        expect(hasCurrentHeadClosingReview(staleVerdict)).toBe(false);
        // so the PR still needs a reviewer on THIS head
        expect(admitOwnPrReviewerRouting({pr: staleVerdict, agentId: ME})).not.toBeNull();
        // and a stale CHANGES_REQUESTED is likewise not a current-head repair
        expect(admitOwnPrRepair({pr: ownPr({reviews: [{state: 'CHANGES_REQUESTED', commitSha: OLD, submittedAt: '2026-07-16T08:30:00.000Z'}]}), agentId: ME})).toBeNull();
    });

    test('stage 2 excludes a PR that already has an outstanding review request — someone has it', () => {
        expect(admitOwnPrReviewerRouting({pr: ownPr({reviewRequests: [{login: PEER, requestedAt: '2026-07-16T09:45:00.000Z'}]}), agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: ownPr(), agentId: ME}).kind).toBe('needs-reviewer');
    });

    test('stage 3 admits a live request to me and discharges on ANY current-head verdict', () => {
        const requested = ownPr({authorId: PEER, reviewRequests: [{login: ME, requestedAt: '2026-07-16T09:45:00.000Z'}]});

        expect(admitRequestedReview({pr: requested, agentId: ME}).stage).toBe('requested-review');
        // my verdict on the CURRENT head discharges it
        expect(admitRequestedReview({
            pr: {...requested, reviews: [{state: 'APPROVED', commitSha: HEAD, authorId: ME}]}, agentId: ME
        })).toBeNull();
        // my verdict on an OLD head does not — the head moved underneath it
        expect(admitRequestedReview({
            pr: {...requested, reviews: [{state: 'APPROVED', commitSha: OLD, authorId: ME}]}, agentId: ME
        })).not.toBeNull();
        // Closure is defined by the HEAD, not the verdict's author: a peer's current-head decision
        // closes it too. (This assertion previously demanded the opposite — an author-is-me rule the
        // contract never contained, which kept a request live after the head was already closed.)
        expect(admitRequestedReview({
            pr: {...requested, reviews: [{state: 'APPROVED', commitSha: HEAD, authorId: PEER}]}, agentId: ME
        })).toBeNull();
    });

    test('stage 4 admits only a CLAIMED task in an action-requiring state', () => {
        const task = {id: 't-1', ownerId: ME, state: 'InputRequired', actionableSince: '2026-07-16T09:00:00.000Z'};

        expect(admitClaimedTask({task, agentId: ME}).stage).toBe('claimed-a2a-task');
        // EXCLUSION: an unclaimed broadcast has no owner — awareness never becomes an obligation
        expect(admitClaimedTask({task: {...task, ownerId: null}, agentId: ME})).toBeNull();
        // EXCLUSION: another agent's claimed task is never mine
        expect(admitClaimedTask({task: {...task, ownerId: PEER}, agentId: ME})).toBeNull();
        // EXCLUSION: a terminal task has ended
        expect(admitClaimedTask({task: {...task, state: 'Completed'}, agentId: ME})).toBeNull();
        // EXCLUSION: a non-actionable live state is awareness, not an obligation
        expect(admitClaimedTask({task: {...task, state: 'Working'}, agentId: ME})).toBeNull();
    });

    test('stage 5 admits an unread DIRECT message; broadcasts and read messages are excluded', () => {
        const message = {messageId: 'm-1', to: ME, readAt: null, sentAt: '2026-07-16T09:00:00.000Z'};

        expect(admitDirectMessage({message, agentId: ME}).stage).toBe('direct-message');
        expect(admitDirectMessage({message: {...message, readAt: '2026-07-16T09:30:00.000Z'}, agentId: ME})).toBeNull();
        // a broadcast is awareness — otherwise every peer's announcement becomes my todo
        expect(admitDirectMessage({message: {...message, to: 'AGENT:*'}, agentId: ME})).toBeNull();
        expect(admitDirectMessage({message: {...message, to: PEER}, agentId: ME})).toBeNull();
    });

    test('never-foreign: another agent\'s PR never admits an own-PR stage', () => {
        const peerPr = ownPr({authorId: PEER, reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T09:00:00.000Z'}]});

        expect(admitOwnPrRepair({pr: peerPr, agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: peerPr, agentId: ME})).toBeNull();
    });

    test('collectLifecycleItems runs every stage over the source records', () => {
        const items = collectLifecycleItems({
            agentId: ME,
            prs    : [
                ownPr({id: 'pr-a', reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T09:00:00.000Z'}]}),
                ownPr({id: 'pr-b', authorId: PEER, reviewRequests: [{login: ME, requestedAt: '2026-07-16T09:45:00.000Z'}]})
            ],
            tasks   : [{id: 't-1', ownerId: ME, state: 'InputRequired', actionableSince: '2026-07-16T09:00:00.000Z'}],
            messages: [{messageId: 'm-1', to: ME, readAt: null, sentAt: '2026-07-16T09:00:00.000Z'}]
        });

        expect(items.map(entry => entry.stage).sort()).toEqual(
            ['claimed-a2a-task', 'direct-message', 'own-pr-repair', 'requested-review']
        );
    });

    test('a merge-conflicted PR with GREEN checks enters repair only — the stages are exclusive in fact', () => {
        // The prose claimed mutual exclusion; a merge conflict falsified it. Each stage tested a
        // different subset of the blockers, so a conflicted-but-green PR satisfied "needs repair" AND
        // "cleanly reviewable" at once, and the peer saw one PR twice.
        const conflicted = ownPr({mergeable: false});

        expect(admitOwnPrRepair({pr: conflicted, agentId: ME}).kind).toBe('merge-conflict');
        expect(admitOwnPrReviewerRouting({pr: conflicted, agentId: ME})).toBeNull();

        const stages = collectLifecycleItems({agentId: ME, prs: [conflicted]}).map(entry => entry.stage);
        expect(stages).toEqual(['own-pr-repair']);
    });

    test('a PEER\'s current-head verdict closes MY requested review — closure is by head, not by author', () => {
        // An author-is-me restriction invented a rule the contract does not have: it kept the request
        // live after the current head was already closed, manufacturing an obligation.
        const pr = ownPr({
            authorId      : PEER,
            reviewRequests: [{login: ME, requestedAt: '2026-07-16T09:45:00.000Z'}],
            reviews       : [{state: 'APPROVED', authorId: PEER, commitSha: HEAD}]
        });

        expect(admitRequestedReview({pr, agentId: ME})).toBeNull();

        // ...but an OLDER-head verdict cannot close the current head — the code changed underneath it.
        const stale = ownPr({
            authorId      : PEER,
            reviewRequests: [{login: ME, requestedAt: '2026-07-16T09:45:00.000Z'}],
            reviews       : [{state: 'APPROVED', authorId: PEER, commitSha: OLD}]
        });

        expect(admitRequestedReview({pr: stale, agentId: ME}).stage).toBe('requested-review');
    });

    test('a clock whose provenance names a DIFFERENT head fails loud — the guard behind the derivation', () => {
        // Defence in depth. The clock owner derives provenance by construction, so this cannot arise
        // from `normalizeLifecycleClocks` — only from a caller that pre-normalized with its own logic.
        // A clock from three pushes ago reports "blocked for 6 hours" about 30-second-old code, so the
        // predicate refuses the record rather than trusting it.
        const withCurrentHeadReview = sourcePr({
            reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T09:00:00.000Z'}]
        });

        expect(() => admitOwnPrRepair({
            pr: {
                ...withCurrentHeadReview,
                repairActionableSince       : '2026-07-16T09:00:00.000Z',
                repairActionableSinceHeadSha: OLD
            },
            agentId: ME
        })).toThrow(/was measured at head head-1 but the current head is head-2/);

        // an absent clock is equally a source-contract violation, not a silent drop
        expect(() => admitOwnPrRepair({
            pr     : {...withCurrentHeadReview, repairActionableSince: undefined, repairActionableSinceHeadSha: HEAD},
            agentId: ME
        })).toThrow(/repairActionableSince is required/);
    });

    test('the SAME subject moving head A → clear → head B carries no clock across the transition', async () => {
        const {normalizeLifecycleClocks} = await import('../../../../../../ai/services/graph/lifecycleAdmission.mjs');

        // Head A: a CHANGES_REQUESTED review dates this head from its own submittedAt.
        const atHeadA = normalizeLifecycleClocks({
            id     : 'pr-1',
            headSha: OLD,
            reviews: [{state: 'CHANGES_REQUESTED', commitSha: OLD, submittedAt: '2026-07-16T09:00:00.000Z'}],
            checks : []
        });

        expect(atHeadA.repairActionableSince).toBe('2026-07-16T09:00:00.000Z');
        expect(atHeadA.repairActionableSinceHeadSha).toBe(OLD);

        // The author pushes. The A-attached review is no longer current-head evidence, so the clock
        // does not merely reset — it ceases to exist, because it was never stored.
        const atHeadB = normalizeLifecycleClocks({...atHeadA, headSha: HEAD});

        expect(atHeadB.repairActionableSince).toBeNull();
        expect(atHeadB.repairActionableSinceHeadSha).toBeNull();
        // A's clock cannot survive into B even though the caller passed A's normalized record forward
        expect(atHeadB.repairActionableSince).not.toBe('2026-07-16T09:00:00.000Z');

        // Re-entry on head B derives a FRESH clock from B's own evidence.
        const reentered = normalizeLifecycleClocks({
            ...atHeadB,
            reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T11:00:00.000Z'}]
        });

        expect(reentered.repairActionableSince).toBe('2026-07-16T11:00:00.000Z');
        expect(reentered.repairActionableSinceHeadSha).toBe(HEAD);
    });

    test('each clock has its OWN algebra — min for repair, max-when-all-pass for reviewable', () => {
        // One reducer for three questions was wrong three different ways. These are the reviewer's exact
        // literals.

        // REVIEWABLE: required checks at 10:05 and 10:30 → the head became reviewable at 10:30, when the
        // LAST one went green. At 10:05 it was not reviewable at all.
        const twoChecks = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            checks         : [
                {name: 'a', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T10:05:00.000Z'},
                {name: 'b', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T10:30:00.000Z'}
            ]
        });

        expect(twoChecks.reviewableSince).toBe('2026-07-16T10:30:00.000Z');

        // ...and until ALL pass there is no reviewable clock at all
        const oneStillRunning = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            checks         : [
                {name: 'a', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T10:05:00.000Z'},
                {name: 'b', required: true, conclusion: null,      headSha: HEAD}
            ]
        });

        expect(oneStillRunning.reviewableSince).toBeNull();

        // REPAIR: earliest blocking evidence — the first thing that broke this head dates it.
        const twoBlockers = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            reviews        : [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T10:40:00.000Z'}],
            checks         : [{name: 'a', required: true, conclusion: 'FAILURE', headSha: HEAD, completedAt: '2026-07-16T10:20:00.000Z'}]
        });

        expect(twoBlockers.repairActionableSince).toBe('2026-07-16T10:20:00.000Z');
    });

    test('a clock can never predate its own head — later(evidence, head), not the evidence alone', () => {
        // REQUESTED: a request at 09:00 followed by a push at 10:00 is not a request to review THIS
        // code. The obligation restarts with the head.
        const requestedBeforePush = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            reviewRequests : [{login: ME, requestedAt: '2026-07-16T09:00:00.000Z'}],
            checks         : []
        });

        expect(requestedBeforePush.reviewRequestedByTarget[ME]).toBe('2026-07-16T10:00:00.000Z');
        expect(requestedBeforePush.reviewRequestedSinceHeadSha).toBe(HEAD);

        // CONFLICT: a conflict observed at 09:00 cannot describe a head committed at 10:00. Keeping
        // 09:00 while stamping current-head provenance claimed a duration this head never had.
        const conflictBeforePush = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            mergeable      : false,
            mergeableSince : '2026-07-16T09:00:00.000Z',
            reviews        : [],
            checks         : []
        });

        expect(conflictBeforePush.repairActionableSince).toBe('2026-07-16T10:00:00.000Z');

        // a request AFTER the push keeps its own timestamp — the clamp is a floor, not an override
        const requestedAfterPush = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            reviewRequests : [{login: ME, requestedAt: '2026-07-16T11:00:00.000Z'}],
            checks         : []
        });

        expect(requestedAfterPush.reviewRequestedByTarget[ME]).toBe('2026-07-16T11:00:00.000Z');
    });

    test('an OLD-head failed check neither blocks nor clears the current head', () => {
        // The predicates read every raw check while the derivation filtered to head, so an old-head
        // failure produced repairReason=failed-required-check AND allRequiredChecksPass=false AND
        // repairSince=null — three answers from two views of the same rows. A check names the head it
        // ran against; one naming an OLDER head describes code that no longer exists.
        const mixed = ownPr({
            checks: [
                {name: 'unit', required: true, conclusion: 'FAILURE', headSha: OLD,  completedAt: '2026-07-16T08:10:00.000Z'},
                {name: 'unit', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T09:30:00.000Z'}
            ]
        });

        expect(admitOwnPrRepair({pr: mixed, agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: mixed, agentId: ME}).kind).toBe('needs-reviewer');
    });

    test('an UNPROVENANCED check is not assumed current — scope must be provable', () => {
        // The reviewer's falsifier: an unprovenanced FAILED required check plus a current-head SUCCESS
        // yielded failed-required-check and suppressed reviewer routing — blocking a head the check may
        // never have run against. "The source did not say" is not proof of anything, and treating a
        // missing headSha as current was a guess wearing a convenience's clothes.
        const unprovenanced = ownPr({
            checks: [
                {name: 'unit', required: true, conclusion: 'FAILURE'},
                {name: 'unit', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T09:30:00.000Z'}
            ]
        });

        expect(admitOwnPrRepair({pr: unprovenanced, agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: unprovenanced, agentId: ME}).kind).toBe('needs-reviewer');

        // A source that cannot stamp each check may ATTEST its snapshot is current-head-only. Same fact,
        // asserted by the party that can actually know it, and visible in the record rather than assumed
        // in the filter.
        const attested = ownPr({
            checksAreCurrentHeadSnapshot: true,
            checks                      : [{name: 'unit', required: true, conclusion: 'FAILURE', completedAt: '2026-07-16T09:10:00.000Z'}]
        });

        expect(admitOwnPrRepair({pr: attested, agentId: ME}).kind).toBe('failed-required-check');
    });

    test('a RESOLVED conflict does not date a repair — mergeableSince is gated on an active one', () => {
        // mergeable:true means there is no conflict now, so a leftover mergeableSince is evidence of a
        // problem that no longer exists. Ungated, it dated an unrelated repair from it.
        const resolved = normalizeClocks({
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            mergeable      : true,
            mergeableSince : '2026-07-16T08:00:00.000Z',
            reviews        : [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T11:00:00.000Z'}],
            checks         : []
        });

        // the RC dates it, not the stale conflict
        expect(resolved.repairActionableSince).toBe('2026-07-16T11:00:00.000Z');
    });

    test('a repo requiring NO checks is reviewable from the head — "all pass OR none exist"', () => {
        // Treating zero-required as undatable threw on a perfectly ordinary repo.
        const noChecks = ownPr({checks: []});

        expect(noChecks.reviewableSince).toBe('2026-07-16T08:00:00.000Z');
        expect(admitOwnPrReviewerRouting({pr: noChecks, agentId: ME}).actionableSince).toBe('2026-07-16T08:00:00.000Z');
    });

    test('each reviewer is dated from when THEY were asked, not from whoever was asked first', () => {
        const twoTargets = normalizeClocks({
            id             : 'pr-multi',
            authorId       : '@someone-else',
            state          : 'OPEN',
            isDraft        : false,
            headSha        : HEAD,
            headCommittedAt: '2026-07-16T10:00:00.000Z',
            reviewRequests : [
                {login: ME,   requestedAt: '2026-07-16T09:00:00.000Z'},
                {login: PEER, requestedAt: '2026-07-16T11:00:00.000Z'}
            ],
            reviews: [],
            checks : [],
            url    : 'https://github.com/neomjs/neo/pull/2'
        });

        // ME asked at 09:00, before the 10:00 push → clamped to the head
        expect(admitRequestedReview({pr: twoTargets, agentId: ME}).actionableSince).toBe('2026-07-16T10:00:00.000Z');
        // PEER asked at 11:00 keeps their OWN clock — one shared clock gave them someone else's 09:00,
        // which is not a rounding error but the wrong reviewer's fact, and age is what a peer sorts by
        expect(admitRequestedReview({pr: twoTargets, agentId: PEER}).actionableSince).toBe('2026-07-16T11:00:00.000Z');
    });

    test('a source-owned transition beats an evergreen fact — same-head re-entry', () => {
        // Checks are evergreen: green at 10:30 stays green, and reads identically before and after a
        // request arrives and is withdrawn. So the facts cannot express "reviewable at 10:30, lost at
        // 11:00, re-entered at 12:00" — only the source that WITNESSED the transition can date it.
        const reentered = ownPr({
            reviewerRoutingSince       : '2026-07-16T12:00:00.000Z',
            reviewerRoutingSinceHeadSha: HEAD
        });

        expect(reentered.reviewableSince).toBe('2026-07-16T12:00:00.000Z');

        // ...but an unprovenanced transition is ignored: it would carry a previous head's history into
        // this one under current-head provenance.
        const staleTransition = ownPr({
            reviewerRoutingSince       : '2026-07-16T12:00:00.000Z',
            reviewerRoutingSinceHeadSha: OLD
        });

        expect(staleTransition.reviewableSince).toBe('2026-07-16T09:30:00.000Z');
    });

    test('the clock owner runs inside collectLifecycleItems — a raw source row needs no caller clock', () => {
        // The provenance contract is worthless if nothing produces it. Raw rows carry only source facts.
        const items = collectLifecycleItems({
            agentId: ME,
            prs    : [{
                id       : 'pr-raw',
                authorId : ME,
                state    : 'OPEN',
                isDraft  : false,
                headSha  : HEAD,
                mergeable: true,
                reviews  : [{state: 'CHANGES_REQUESTED', commitSha: HEAD, submittedAt: '2026-07-16T08:00:00.000Z'}],
                checks   : [{name: 'unit', required: true, conclusion: 'SUCCESS', headSha: HEAD, completedAt: '2026-07-16T07:00:00.000Z'}],
                url      : 'https://github.com/neomjs/neo/pull/1'
            }]
        });

        expect(items).toHaveLength(1);
        expect(items[0].stage).toBe('own-pr-repair');
        // derived from the review that dates THIS head, not supplied by the caller
        expect(items[0].actionableSince).toBe('2026-07-16T08:00:00.000Z');
    });

    test('archived and retracted direct messages are removed — unread is not the only clearing', () => {
        // Both are unread forever. Keying on readAt alone pins them to the frontier permanently, and a
        // row that cannot be cleared teaches the reader to ignore the surface.
        const base = {messageId: 'm-1', to: ME, readAt: null, sentAt: '2026-07-16T09:00:00.000Z'};

        expect(admitDirectMessage({message: base, agentId: ME}).stage).toBe('direct-message');
        expect(admitDirectMessage({message: {...base, archivedAt: '2026-07-16T09:30:00.000Z'}, agentId: ME})).toBeNull();

        // The LIVE shape: MailboxService emits `retracted: true` (a boolean) and blanks the body to a
        // placeholder. The previous check tested an invented `retractedAt` timestamp, so it never fired
        // on a real row — the exclusion existed only in the spec's imagination.
        expect(admitDirectMessage({message: {...base, retracted: true}, agentId: ME})).toBeNull();
        // a compatibility shape a caller may still pass
        expect(admitDirectMessage({message: {...base, retractedAt: '2026-07-16T09:30:00.000Z'}, agentId: ME})).toBeNull();
        // and `retracted: false` is not a retraction
        expect(admitDirectMessage({message: {...base, retracted: false}, agentId: ME}).stage).toBe('direct-message');
    });
});
