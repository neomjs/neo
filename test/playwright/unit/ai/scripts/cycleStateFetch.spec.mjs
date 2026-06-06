import {test, expect}                            from '@playwright/test';
import {isCiGreen, mapOwnPRs, mapReviewRequests} from '../../../../../ai/scripts/lifecycle/cycleStateFetch.mjs';

/**
 * Self-test for the GitHub-state → cycle-state-input mappers (the daemon-side fetch-and-map layer). The
 * derivation (CI-green, changes-requested, review-requested) is pure over raw `gh ... --json` output, so
 * it's unit-testable without running `gh`.
 */

test.describe('cycleStateFetch — isCiGreen', () => {
    test('empty / missing rollup → green (no checks = nothing failing)', () => {
        expect(isCiGreen([])).toBe(true);
        expect(isCiGreen(undefined)).toBe(true);
        expect(isCiGreen(null)).toBe(true)
    });

    test('all settled-successful → green; any failure or pending → not green', () => {
        expect(isCiGreen([{conclusion: 'SUCCESS'}, {state: 'SUCCESS'}, {conclusion: 'SKIPPED'}])).toBe(true);
        expect(isCiGreen([{conclusion: 'SUCCESS'}, {conclusion: 'FAILURE'}])).toBe(false);
        expect(isCiGreen([{conclusion: 'SUCCESS'}, {state: 'PENDING'}])).toBe(false);      // legacy StatusContext pending
        expect(isCiGreen([{status: 'IN_PROGRESS', conclusion: null}])).toBe(false)         // not yet settled
    });
});

test.describe('cycleStateFetch — mapOwnPRs', () => {
    test('derives ciGreen / reviewRequested / changesRequested per PR', () => {
        const mapped = mapOwnPRs([
            {number: 10, statusCheckRollup: [{conclusion: 'SUCCESS'}], reviewDecision: null,                reviewRequests: []},
            {number: 11, statusCheckRollup: [{conclusion: 'FAILURE'}], reviewDecision: 'CHANGES_REQUESTED',  reviewRequests: [{login: 'x'}]},
            {number: 12, statusCheckRollup: [],                        reviewDecision: 'REVIEW_REQUIRED',    reviewRequests: [{login: 'y'}]}
        ]);
        expect(mapped[0]).toEqual({ref: '#10', ciGreen: true,  reviewRequested: false, changesRequested: false}); // green, no reviewer → step 3
        expect(mapped[1]).toEqual({ref: '#11', ciGreen: false, reviewRequested: true,  changesRequested: true});  // changes requested → step 1
        expect(mapped[2]).toEqual({ref: '#12', ciGreen: true,  reviewRequested: true,  changesRequested: false}); // green + reviewer requested → no step
    });

    test('non-array input → empty', () => {
        expect(mapOwnPRs(undefined)).toEqual([]);
        expect(mapOwnPRs(null)).toEqual([])
    });
});

test.describe('cycleStateFetch — mapReviewRequests', () => {
    test('maps to {ref} (designated reviews)', () => {
        expect(mapReviewRequests([{number: 20}, {number: 21}])).toEqual([{ref: '#20'}, {ref: '#21'}]);
        expect(mapReviewRequests(undefined)).toEqual([])
    });
});
