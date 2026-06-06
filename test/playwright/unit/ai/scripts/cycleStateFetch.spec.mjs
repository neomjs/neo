import {test, expect}                            from '@playwright/test';
import {fetchExternalState, isCiGreen, mapBacklog, mapLaneClaims, mapOwnPRs, mapReviewRequests} from '../../../../../ai/scripts/lifecycle/cycleStateFetch.mjs';

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
    test('derives ciGreen / reviewRequested / changesRequested / approved per PR', () => {
        const mapped = mapOwnPRs([
            {number: 10, statusCheckRollup: [{conclusion: 'SUCCESS'}], reviewDecision: null,                reviewRequests: []},
            {number: 11, statusCheckRollup: [{conclusion: 'FAILURE'}], reviewDecision: 'CHANGES_REQUESTED',  reviewRequests: [{login: 'x'}]},
            {number: 12, statusCheckRollup: [],                        reviewDecision: 'REVIEW_REQUIRED',    reviewRequests: [{login: 'y'}]},
            {number: 13, statusCheckRollup: [{conclusion: 'SUCCESS'}], reviewDecision: 'APPROVED',           reviewRequests: []}
        ]);
        expect(mapped[0]).toEqual({ref: '#10', ciGreen: true,  reviewRequested: false, changesRequested: false, approved: false}); // green, no reviewer → step 3
        expect(mapped[1]).toEqual({ref: '#11', ciGreen: false, reviewRequested: true,  changesRequested: true,  approved: false}); // changes requested → step 1
        expect(mapped[2]).toEqual({ref: '#12', ciGreen: true,  reviewRequested: true,  changesRequested: false, approved: false}); // green + reviewer requested → no step
        expect(mapped[3]).toEqual({ref: '#13', ciGreen: true,  reviewRequested: false, changesRequested: false, approved: true});  // APPROVED green, no reviewer → human merge-gate, NOT step 3
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

test.describe('cycleStateFetch — mapBacklog (claimable-now exclusion flags)', () => {
    test('derives blocked / gated / claimedByOther from the context sets', () => {
        const mapped = mapBacklog([{number: 30}, {number: 31}, {number: 32}, {number: 33}], {
            blockedRefs   : new Set(['#30']),
            gatedRefs     : new Set(['#31']),
            claimedByOther: new Map([['#32', '@neo-gpt']])
        });
        expect(mapped[0]).toEqual({ref: '#30', blocked: true,  gated: false, claimedByOther: undefined});  // blocked
        expect(mapped[1]).toEqual({ref: '#31', blocked: false, gated: true,  claimedByOther: undefined});  // gated
        expect(mapped[2]).toEqual({ref: '#32', blocked: false, gated: false, claimedByOther: '@neo-gpt'}); // collision
        expect(mapped[3]).toEqual({ref: '#33', blocked: false, gated: false, claimedByOther: undefined});  // claimable-now
    });

    test('no context → all unflagged (all claimable); non-array → empty', () => {
        expect(mapBacklog([{number: 40}])).toEqual([{ref: '#40', blocked: false, gated: false, claimedByOther: undefined}]);
        expect(mapBacklog(undefined)).toEqual([])
    });
});

test.describe('cycleStateFetch — mapLaneClaims (the claimedByOther collision source)', () => {
    test('extracts ref → other-agent; excludes self-claims + non-lane-claim subjects', () => {
        const map = mapLaneClaims([
            {subject: '[lane-claim] taking #100 some work', from: '@neo-gpt'},
            {subject: '[lane-claim] resuming #101 — REM prune',  from: '@neo-opus-ada'},
            {subject: '[lane-claim] #102 mine',                  from: '@neo-opus-vega'},  // self → excluded
            {subject: '[pr-opened] PR #103 (#104)',              from: '@neo-gpt'},        // not a lane-claim → ignored
            {subject: 'no ref here [lane-claim] taking it',      from: '@neo-gpt'}         // no #N → ignored
        ], '@neo-opus-vega');

        expect(map.get('#100')).toBe('@neo-gpt');
        expect(map.get('#101')).toBe('@neo-opus-ada');
        expect(map.has('#102')).toBe(false);   // self-claim
        expect(map.has('#103')).toBe(false);   // pr-opened, not lane-claim
        expect(map.size).toBe(2)
    });

    test('non-array → empty map', () => {
        expect(mapLaneClaims(undefined, '@me').size).toBe(0)
    });
});

test.describe('cycleStateFetch — fetchExternalState (orchestration, injected runner)', () => {
    test('runs the 3 queries in parallel, maps them, strips leading @, honors gatherContext', async () => {
        const calls = [];
        const runQuery = async (args) => {
            calls.push(args);
            if (args.includes('--author')) return [{number: 10, statusCheckRollup: [{conclusion: 'SUCCESS'}], reviewDecision: null, reviewRequests: []}];
            if (args.includes('--search')) return [{number: 20}];
            return [{number: 30}, {number: 31}];                                  // gh issue list (backlog)
        };
        const gatherContext = async () => ({blockedRefs: new Set(['#31'])});
        const state = await fetchExternalState('@neo-opus-vega', {runQuery, gatherContext});

        expect(state.ownPRs).toEqual([{ref: '#10', ciGreen: true, reviewRequested: false, changesRequested: false, approved: false}]);
        expect(state.reviewRequests).toEqual([{ref: '#20'}]);
        expect(state.backlog).toEqual([
            {ref: '#30', blocked: false, gated: false, claimedByOther: undefined},
            {ref: '#31', blocked: true,  gated: false, claimedByOther: undefined}  // from gatherContext
        ]);
        expect(state.openOwnPrCount).toBe(1);
        expect(calls.find(a => a.includes('--search'))).toContain('review-requested:neo-opus-vega'); // @ stripped
    });
});
