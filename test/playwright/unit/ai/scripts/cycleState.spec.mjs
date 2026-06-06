import {test, expect}                                from '@playwright/test';
import {CycleStep, computeCycleState, formatCycleStateLine, isClaimableNow} from '../../../../../ai/scripts/lifecycle/cycleState.mjs';

/**
 * Self-test for the shared cycle-state discriminator — the pure core of the idle-out fix that the daemon
 * (producer: compute + cache + render into the wake digest) and the liveness Stop hook (consumer: read +
 * enforce) both depend on.
 *
 * The load-bearing case these lock in: **claimable-now ≠ raw-backlog-non-empty.** A non-empty backlog of
 * gated / blocked / colliding items is a legitimately-empty cycle — the enforcement hook MUST NOT fire on
 * it (else it becomes the noise it removes). Plus the deterministic cycle priority order (lifecycle-closure
 * before new-lane expansion).
 */

test.describe('cycleState — isClaimableNow (the raw-backlog filter)', () => {
    test('a clean item is claimable; gated / blocked / collided items are NOT', () => {
        expect(isClaimableNow({ref: '#1'})).toBe(true);
        expect(isClaimableNow({ref: '#1', gated: true})).toBe(false);            // decision/architecture-gated
        expect(isClaimableNow({ref: '#1', blocked: true})).toBe(false);          // blocked-by unmerged dep
        expect(isClaimableNow({ref: '#1', claimedByOther: '@peer'})).toBe(false);// collision
        expect(isClaimableNow(null)).toBe(false)
    });
});

test.describe('cycleState — computeCycleState priority order (lifecycle-closure first)', () => {
    test('1: own PR with changes-requested wins over everything', () => {
        const v = computeCycleState({
            ownPRs        : [{ref: '#10', changesRequested: true}, {ref: '#11', ciGreen: true, reviewRequested: false}],
            reviewRequests: [{ref: '#20'}],
            backlog       : [{ref: '#30'}]
        });
        expect(v.nextStep.step).toBe(CycleStep.ADDRESS_REVIEW_CHANGES);
        expect(v.nextStep.ref).toBe('#10');
        expect(v.isEmptyCycle).toBe(false)
    });

    test('2: a designated review beats own-green-request + next-lane', () => {
        const v = computeCycleState({
            ownPRs        : [{ref: '#11', ciGreen: true, reviewRequested: false}],
            reviewRequests: [{ref: '#20'}],
            backlog       : [{ref: '#30'}]
        });
        expect(v.nextStep.step).toBe(CycleStep.REVIEW_REQUESTED_PR);
        expect(v.nextStep.ref).toBe('#20')
    });

    test('3: own green PR with no review requested → request review (never wait the CI window)', () => {
        const v = computeCycleState({
            ownPRs : [{ref: '#11', ciGreen: true, reviewRequested: false}],
            backlog: [{ref: '#30'}]
        });
        expect(v.nextStep.step).toBe(CycleStep.REQUEST_REVIEW);
        expect(v.nextStep.ref).toBe('#11')
    });

    test('4: nothing else → a claimable-now backlog lane', () => {
        const v = computeCycleState({backlog: [{ref: '#30'}]});
        expect(v.nextStep.step).toBe(CycleStep.NEXT_LANE);
        expect(v.nextStep.ref).toBe('#30')
    });
});

test.describe('cycleState — claimable-now ≠ raw-backlog (the falsification-AC core)', () => {
    test('a non-empty backlog of ONLY gated/blocked/collided items → empty cycle (MUST NOT fire)', () => {
        const v = computeCycleState({
            backlog: [
                {ref: '#31', gated: true},
                {ref: '#32', blocked: true},
                {ref: '#33', claimedByOther: '@neo-gpt'}
            ]
        });
        expect(v.isEmptyCycle).toBe(true);                  // legitimately empty despite a non-empty backlog
        expect(v.nextStep).toBeNull();
        expect(v.claimableNowCount).toBe(0)
    });

    test('one claimable item among gated ones → that item is the next lane (MUST fire path)', () => {
        const v = computeCycleState({
            backlog: [
                {ref: '#31', gated: true},
                {ref: '#34'},                               // the one claimable-now item
                {ref: '#33', claimedByOther: '@neo-gpt'}
            ]
        });
        expect(v.isEmptyCycle).toBe(false);
        expect(v.nextStep.step).toBe(CycleStep.NEXT_LANE);
        expect(v.nextStep.ref).toBe('#34');
        expect(v.claimableNowCount).toBe(1)
    });

    test('fully empty state → empty cycle', () => {
        const v = computeCycleState({});
        expect(v.isEmptyCycle).toBe(true);
        expect(v.nextStep).toBeNull()
    });
});

test.describe('cycleState — approved own PRs are human-gated, not a request-review step (#12640 RC)', () => {
    test('an approved green PR with no reviewer is NOT request-review — it sits on the human merge-gate', () => {
        const v = computeCycleState({
            ownPRs: [{ref: '#12605', ciGreen: true, reviewRequested: false, approved: true}]
        });
        expect(v.nextStep).toBeNull();              // no agent action; the human merge-gate owns it
        expect(v.isEmptyCycle).toBe(true)
    });

    test('an approved own PR does NOT block a claimable backlog lane from surfacing', () => {
        const v = computeCycleState({
            ownPRs : [{ref: '#12605', ciGreen: true, reviewRequested: false, approved: true}],
            backlog: [{ref: '#40'}]
        });
        expect(v.nextStep.step).toBe(CycleStep.NEXT_LANE);   // backlog still surfaces past the human-gated PR
        expect(v.nextStep.ref).toBe('#40')
    });

    test('a green UN-approved own PR still requests review (the exclusion is precise to approved)', () => {
        const v = computeCycleState({
            ownPRs: [{ref: '#11', ciGreen: true, reviewRequested: false, approved: false}]
        });
        expect(v.nextStep.step).toBe(CycleStep.REQUEST_REVIEW);
        expect(v.nextStep.ref).toBe('#11')
    });
});

test.describe('cycleState — formatCycleStateLine (the daemon digest fragment)', () => {
    test('renders the next step; null for empty/absent (caller falls back to the count line)', () => {
        const v = computeCycleState({reviewRequests: [{ref: '#20'}]});
        expect(formatCycleStateLine(v)).toBe('next: A review is designated to you — review it before a new lane. (#20)');
        expect(formatCycleStateLine(computeCycleState({}))).toBeNull();   // empty cycle → null
        expect(formatCycleStateLine(null)).toBeNull()
    });
});

test.describe('cycleState — the ≤10 cap is backpressure on new lanes, not a halt', () => {
    test('at/over the cap → next step is drive-existing, still a step (never empty)', () => {
        const v = computeCycleState({openOwnPrCount: 10, backlog: [{ref: '#40'}]});
        expect(v.nextStep.step).toBe(CycleStep.NEXT_LANE);
        expect(v.nextStep.reason).toMatch(/drive an existing PR/i);
        expect(v.isEmptyCycle).toBe(false)
    });

    test('under the cap → open a new lane', () => {
        const v = computeCycleState({openOwnPrCount: 2, backlog: [{ref: '#40'}]});
        expect(v.nextStep.reason).toMatch(/claimable-now backlog lane/i)
    });
});
