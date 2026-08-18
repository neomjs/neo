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
    const openSource = overrides => ({state: 'OPEN', mergedAt: null, ...overrides});

    test('a fully-disposed approved PR is strict-merge-ready', () => {
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN', reviewRequests: []
        }));
        expect(result.strictMergeReady).toBe(true);
        expect(result.blockers).toEqual([]);
    });

    test('APPROVED + green + CLEAN with an OUTSTANDING requested reviewer is NOT strict-merge-ready (#13587)', () => {
        // The false-positive class: reviewDecision flattens to APPROVED + CLEAN, but a requested reviewer is outstanding.
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN',
            reviewRequests: ['neo-opus-grace']
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('outstanding requested reviewer');
        expect(result.blockers.join(' ')).toContain('neo-opus-grace');
    });

    test('an outstanding reviewer who is later disposed no longer blocks', () => {
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN',
            reviewRequests: ['neo-opus-grace'], disposedReviewers: ['neo-opus-grace']
        }));
        expect(result.strictMergeReady).toBe(true);
    });

    test('a non-APPROVED reviewDecision blocks', () => {
        const result = validateMergeReady(openSource({
            reviewDecision: 'REVIEW_REQUIRED', checksGreen: true, mergeStateStatus: 'CLEAN'
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('not APPROVED');
    });

    test('red CI blocks even when approved', () => {
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: false, mergeStateStatus: 'CLEAN'
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('CI checks');
    });

    test('a DIRTY merge state (conflict / stale base) blocks', () => {
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'DIRTY', reviewRequests: []
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain("'DIRTY'");
    });

    test('UNSTABLE (mergeable, CI in flux) is not itself a non-mergeable blocker', () => {
        // UNSTABLE is mergeable; checksGreen is the CI gate, not mergeStateStatus.
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'UNSTABLE', reviewRequests: []
        }));
        expect(result.strictMergeReady).toBe(true);
    });

    test('fails CLOSED when reviewRequests was not fetched (undefined, not [])', () => {
        // The omission false-positive: APPROVED + green + CLEAN but reviewRequests never queried.
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN'
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('reviewRequests was not fetched');
    });

    test('fails CLOSED when mergeStateStatus was not fetched', () => {
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, reviewRequests: []
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('mergeStateStatus was not fetched');
    });

    test('an empty-array reviewRequests (fetched-and-empty) does NOT fail closed', () => {
        // [] is the explicit "fetched, none outstanding" assertion — distinct from undefined.
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'CLEAN', reviewRequests: []
        }));
        expect(result.strictMergeReady).toBe(true);
    });

    test('UNKNOWN mergeStateStatus fails closed — GitHub has not computed mergeability (#13588 cycle-2)', () => {
        // Allowlist: only CLEAN/UNSTABLE certify; an uncomputed UNKNOWN must NOT certify strict-ready.
        const result = validateMergeReady(openSource({
            reviewDecision: 'APPROVED', checksGreen: true, mergeStateStatus: 'UNKNOWN', reviewRequests: []
        }));
        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('UNKNOWN');
    });

    test('fails CLOSED when state or mergedAt was not fetched', () => {
        const result = validateMergeReady({
            reviewDecision  : 'APPROVED',
            checksGreen     : true,
            mergeStateStatus: 'CLEAN',
            reviewRequests  : []
        });

        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain('state was not fetched');
        expect(result.blockers.join(' ')).toContain('mergedAt was not fetched');
    });

    test('a closed or already-merged pull request blocks', () => {
        const result = validateMergeReady(openSource({
            state           : 'CLOSED',
            mergedAt        : '2026-07-29T08:00:00Z',
            reviewDecision  : 'APPROVED',
            checksGreen     : true,
            mergeStateStatus: 'CLEAN',
            reviewRequests  : []
        }));

        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.join(' ')).toContain("state is 'CLOSED'");
        expect(result.blockers.join(' ')).toContain('already merged');
    });
});

test.describe('validateMergeReady — the approval anchor', () => {
    const openSource = overrides => ({state: 'OPEN', mergedAt: null, ...overrides});

    test('a stale anchor is REPORTED, never a blocker', () => {
        const result = validateMergeReady(openSource({
            reviewDecision  : 'APPROVED',
            checksGreen     : true,
            mergeStateStatus: 'CLEAN',
            reviewRequests  : [],
            approvedAtOid   : '8a24e213c1',
            headRefOid      : '23588b661a'
        }));

        // The load-bearing half: a rebase that moves every sha and changes nothing anyone reviewed
        // is the COMMON case. Blocking it would red every rebased PR in the repo and train reviewers
        // to ignore the signal, which costs more than the gap it closes.
        expect(result.strictMergeReady).toBe(true);
        expect(result.blockers).toEqual([]);
        expect(result.advisories).toHaveLength(1);
        // both shas named — a report that says "stale" without saying stale-against-what sends the
        // reader back to the API to reconstruct what the check already had in hand
        expect(result.advisories[0]).toContain('8a24e213c1');
        expect(result.advisories[0]).toContain('23588b661a')
    });

    test('a fresh anchor reports nothing', () => {
        const result = validateMergeReady(openSource({
            reviewDecision  : 'APPROVED',
            checksGreen     : true,
            mergeStateStatus: 'CLEAN',
            reviewRequests  : [],
            approvedAtOid   : '23588b661a',
            headRefOid      : '23588b661a'
        }));

        expect(result.strictMergeReady).toBe(true);
        expect(result.advisories).toEqual([])
    });

    test('an UNFETCHED anchor is silence, not a fail-closed block — and this inverts the module rule on purpose', () => {
        // Every other field here fails closed when un-queried, because each is part of the
        // merge-ready PREDICATE and an unasked question cannot certify. The anchor certifies
        // nothing; it is a reporting channel. A caller that never asks for it is not making a
        // weaker claim, and blocking it would break every existing call site for no added safety.
        const result = validateMergeReady(openSource({
            reviewDecision  : 'APPROVED',
            checksGreen     : true,
            mergeStateStatus: 'CLEAN',
            reviewRequests  : []
        }));

        expect(result.strictMergeReady).toBe(true);
        expect(result.advisories).toEqual([])
    });

    test('a stale anchor does not rescue an otherwise-blocked PR, nor mask its blockers', () => {
        // The fence: advisories and blockers are separate channels, and neither may leak into the
        // other. Without this, "advisory" could quietly become "downgraded blocker".
        const result = validateMergeReady(openSource({
            reviewDecision  : 'CHANGES_REQUESTED',
            checksGreen     : true,
            mergeStateStatus: 'CLEAN',
            reviewRequests  : [],
            approvedAtOid   : 'aaaaaaaaaa',
            headRefOid      : 'bbbbbbbbbb'
        }));

        expect(result.strictMergeReady).toBe(false);
        expect(result.blockers.some(entry => entry.includes('not APPROVED'))).toBe(true);
        expect(result.advisories).toHaveLength(1)
    })
});
