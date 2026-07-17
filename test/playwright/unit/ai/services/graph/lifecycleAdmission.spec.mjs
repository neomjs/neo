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
        admitDirectMessage, collectLifecycleItems, hasCurrentHeadClosingReview;

    const ME   = '@neo-opus-ada',
          PEER = '@neo-gpt',
          HEAD = 'head-2',
          OLD  = 'head-1';

    const ownPr = (overrides = {}) => ({
        id                   : 'pr-15231',
        authorId             : ME,
        state                : 'OPEN',
        isDraft              : false,
        headSha              : HEAD,
        mergeable            : true,
        checks               : [{name: 'unit', required: true, conclusion: 'SUCCESS'}],
        reviews              : [],
        reviewRequests       : [],
        url                  : 'https://github.com/neomjs/neo/pull/15231',
        repairActionableSince: '2026-07-16T09:00:00.000Z',
        reviewableSince      : '2026-07-16T09:30:00.000Z',
        reviewRequestedSince : '2026-07-16T09:45:00.000Z',
        // Clock provenance: the source states which head each clock was started for, so the stateless
        // predicate can VERIFY the head-change reset instead of assuming it.
        repairActionableSinceHeadSha: HEAD,
        reviewableSinceHeadSha      : HEAD,
        reviewRequestedSinceHeadSha : HEAD,
        checkedAt                   : '2026-07-16T10:00:00.000Z',
        ...overrides
    });

    test.beforeAll(async () => {
        ({
            admitOwnPrRepair, admitOwnPrReviewerRouting, admitRequestedReview, admitClaimedTask,
            admitDirectMessage, collectLifecycleItems, hasCurrentHeadClosingReview
        } = await import('../../../../../../ai/services/graph/lifecycleAdmission.mjs'));
    });

    test('stage 1 admits a current-head CHANGES_REQUESTED, a failed REQUIRED check, and a merge conflict', () => {
        expect(admitOwnPrRepair({pr: ownPr({reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD}]}), agentId: ME}).kind)
            .toBe('changes-requested');
        expect(admitOwnPrRepair({pr: ownPr({checks: [{name: 'unit', required: true, conclusion: 'FAILURE'}]}), agentId: ME}).kind)
            .toBe('failed-required-check');
        expect(admitOwnPrRepair({pr: ownPr({mergeable: false}), agentId: ME}).kind).toBe('merge-conflict');
        // a clean head is not a repair
        expect(admitOwnPrRepair({pr: ownPr(), agentId: ME})).toBeNull();
    });

    test('EXCLUSION — pending/running CI is a wait, not a repair', () => {
        // "CI is running" must never manufacture a row; only a FAILED required check is actionable.
        const pending = ownPr({checks: [{name: 'unit', required: true, conclusion: null}]});

        expect(admitOwnPrRepair({pr: pending, agentId: ME})).toBeNull();
        // ...and it is not reviewable either: required checks have not passed yet
        expect(admitOwnPrReviewerRouting({pr: pending, agentId: ME})).toBeNull();
    });

    test('EXCLUSION — an OPTIONAL check failing is not a repair trigger', () => {
        // otherwise every advisory linter invents an obligation
        const optionalFail = ownPr({checks: [
            {name: 'unit',    required: true,  conclusion: 'SUCCESS'},
            {name: 'advisory', required: false, conclusion: 'FAILURE'}
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
        const draft = ownPr({isDraft: true, reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD}]});

        expect(admitOwnPrRepair({pr: draft, agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: draft, agentId: ME})).toBeNull();
        expect(admitRequestedReview({pr: {...draft, reviewRequests: [ME]}, agentId: ME})).toBeNull();
    });

    test('an OLD-head verdict does not close the current head — the code changed underneath it', () => {
        const staleVerdict = ownPr({reviews: [{state: 'APPROVED', commitSha: OLD, authorId: PEER}]});

        expect(hasCurrentHeadClosingReview(staleVerdict)).toBe(false);
        // so the PR still needs a reviewer on THIS head
        expect(admitOwnPrReviewerRouting({pr: staleVerdict, agentId: ME})).not.toBeNull();
        // and a stale CHANGES_REQUESTED is likewise not a current-head repair
        expect(admitOwnPrRepair({pr: ownPr({reviews: [{state: 'CHANGES_REQUESTED', commitSha: OLD}]}), agentId: ME})).toBeNull();
    });

    test('stage 2 excludes a PR that already has an outstanding review request — someone has it', () => {
        expect(admitOwnPrReviewerRouting({pr: ownPr({reviewRequests: [PEER]}), agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: ownPr(), agentId: ME}).kind).toBe('needs-reviewer');
    });

    test('stage 3 admits a live request to me and discharges on ANY current-head verdict', () => {
        const requested = ownPr({authorId: PEER, reviewRequests: [ME]});

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
        const peerPr = ownPr({authorId: PEER, reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD}]});

        expect(admitOwnPrRepair({pr: peerPr, agentId: ME})).toBeNull();
        expect(admitOwnPrReviewerRouting({pr: peerPr, agentId: ME})).toBeNull();
    });

    test('collectLifecycleItems runs every stage over the source records', () => {
        const items = collectLifecycleItems({
            agentId: ME,
            prs    : [
                ownPr({id: 'pr-a', reviews: [{state: 'CHANGES_REQUESTED', commitSha: HEAD}]}),
                ownPr({id: 'pr-b', authorId: PEER, reviewRequests: [ME]})
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
            reviewRequests: [ME],
            reviews       : [{state: 'APPROVED', authorId: PEER, commitSha: HEAD}]
        });

        expect(admitRequestedReview({pr, agentId: ME})).toBeNull();

        // ...but an OLDER-head verdict cannot close the current head — the code changed underneath it.
        const stale = ownPr({
            authorId      : PEER,
            reviewRequests: [ME],
            reviews       : [{state: 'APPROVED', authorId: PEER, commitSha: OLD}]
        });

        expect(admitRequestedReview({pr: stale, agentId: ME}).stage).toBe('requested-review');
    });

    test('a clock measured at an OLDER head fails LOUD — a stateless predicate cannot fake a reset', () => {
        // Every PR-derived row resets on head change. A predicate with no memory of the previous head
        // can only VERIFY that, and only if the source says which head the clock belongs to. Copying it
        // blind reports "blocked for 6 hours" about code that has existed for 30 seconds.
        const staleClock = ownPr({
            reviews                     : [{state: 'CHANGES_REQUESTED', commitSha: HEAD}],
            repairActionableSinceHeadSha: OLD
        });

        expect(() => admitOwnPrRepair({pr: staleClock, agentId: ME}))
            .toThrow(/was measured at head head-1 but the current head is head-2/);

        // an absent clock is equally a source-contract violation, not a silent drop
        const noClock = ownPr({
            reviews              : [{state: 'CHANGES_REQUESTED', commitSha: HEAD}],
            repairActionableSince: undefined
        });

        expect(() => admitOwnPrRepair({pr: noClock, agentId: ME})).toThrow(/repairActionableSince is required/);
    });

    test('archived and retracted direct messages are removed — unread is not the only clearing', () => {
        // Both are unread forever. Keying on readAt alone pins them to the frontier permanently, and a
        // row that cannot be cleared teaches the reader to ignore the surface.
        const base = {messageId: 'm-1', to: ME, readAt: null, sentAt: '2026-07-16T09:00:00.000Z'};

        expect(admitDirectMessage({message: base, agentId: ME}).stage).toBe('direct-message');
        expect(admitDirectMessage({message: {...base, archivedAt: '2026-07-16T09:30:00.000Z'}, agentId: ME})).toBeNull();
        expect(admitDirectMessage({message: {...base, retractedAt: '2026-07-16T09:30:00.000Z'}, agentId: ME})).toBeNull();
    });
});
