import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'ValidateMergeReadyTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../src/core/_export.mjs';
import {validateMergeReady} from '../../../../../../ai/scripts/lifecycle/validateMergeReady.mjs';

test.describe('validateMergeReady — strict merge-readiness contract', () => {
    test('a fully-disposed approved PR is strict-merge-ready', () => {
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN', reviewRequests: []
        });
        expect(result.strictMergeReady).toBe(true);
        expect(result.blockers).toEqual([]);
    });

    test('APPROVED + green + CLEAN with an OUTSTANDING requested reviewer is NOT strict-merge-ready (#13587)', () => {
        // The false-positive class: reviewDecision flattens to APPROVED + CLEAN, but a requested reviewer is outstanding.
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN',
            reviewRequests: ['neo-opus-grace']
        });
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('outstanding requested reviewer');
        expect(result.blockers.join(' ')).toContain('neo-opus-grace');
    });

    test('an outstanding reviewer who is later disposed no longer blocks', () => {
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN',
            reviewRequests: ['neo-opus-grace'], disposedReviewers: ['neo-opus-grace']
        });
        expect(result.strictMergeReady).toBe(true);
    });

    test('a non-APPROVED reviewDecision blocks', () => {
        const result = validateMergeReady({reviewDecision: 'REVIEW_REQUIRED', checksGreen: true, mergeStateStatus: 'CLEAN'});
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('not APPROVED');
    });

    test('red CI blocks even when approved', () => {
        const result = validateMergeReady({reviewDecision: 'APPROVED', checksGreen: false, mergeStateStatus: 'CLEAN'});
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('CI checks');
    });

    test('a DIRTY merge state (conflict / stale base) blocks', () => {
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'DIRTY', reviewRequests: []
        });
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain("'DIRTY'");
    });

    test('UNSTABLE (mergeable, CI in flux) is not itself a non-mergeable blocker', () => {
        // UNSTABLE is mergeable; checksGreen is the CI gate, not mergeStateStatus.
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'UNSTABLE', reviewRequests: []
        });
        expect(result.strictMergeReady).toBe(true);
    });

    test('fails CLOSED when reviewRequests was not fetched (undefined, not [])', () => {
        // The omission false-positive: APPROVED + green + CLEAN but reviewRequests never queried.
        const result = validateMergeReady({reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN'});
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('reviewRequests was not fetched');
    });

    test('fails CLOSED when mergeStateStatus was not fetched', () => {
        const result = validateMergeReady({reviewDecision: 'APPROVED', checksGreen: true, reviewRequests: []});
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('mergeStateStatus was not fetched');
    });

    test('an empty-array reviewRequests (fetched-and-empty) does NOT fail closed', () => {
        // [] is the explicit "fetched, none outstanding" assertion — distinct from undefined.
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN', reviewRequests: []
        });
        expect(result.strictMergeReady).toBe(true);
    });

    test('UNKNOWN mergeStateStatus fails closed — GitHub has not computed mergeability (#13588 cycle-2)', () => {
        // Allowlist: only CLEAN/UNSTABLE certify; an uncomputed UNKNOWN must NOT certify strict-ready.
        const result = validateMergeReady({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'UNKNOWN', reviewRequests: []
        });
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('UNKNOWN');
    });
});
