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
        checkedAt            : '2026-07-16T10:00:00.000Z',
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

    test('stage 3 admits a live request to me and discharges on MY current-head verdict only', () => {
        const requested = ownPr({authorId: PEER, reviewRequests: [ME]});

        expect(admitRequestedReview({pr: requested, agentId: ME}).stage).toBe('requested-review');
        // my verdict on the CURRENT head discharges it
        expect(admitRequestedReview({
            pr: {...requested, reviews: [{state: 'APPROVED', commitSha: HEAD, authorId: ME}]}, agentId: ME
        })).toBeNull();
        // my verdict on an OLD head does not — the head moved
        expect(admitRequestedReview({
            pr: {...requested, reviews: [{state: 'APPROVED', commitSha: OLD, authorId: ME}]}, agentId: ME
        })).not.toBeNull();
        // a peer's current-head verdict does not discharge MY request
        expect(admitRequestedReview({
            pr: {...requested, reviews: [{state: 'APPROVED', commitSha: HEAD, authorId: PEER}]}, agentId: ME
        })).not.toBeNull();
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
});
