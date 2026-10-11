import { test, expect }                                 from '@playwright/test';
import {assessDevReferenceAuthority, detectStaleBranch} from '../../../../../buildScripts/util/branchFreshness.mjs';

test.describe('buildScripts/util/branchFreshness.detectStaleBranch (#13710)', () => {
    test('flags a behind branch whose two-dot diff carries many extra files (the #13708 revert-trap anchor)', () => {
        expect(detectStaleBranch({ twoDotFiles: 32, threeDotFiles: 2 })).toEqual({ stale: true, extraFiles: 30 });
    });

    test('does NOT flag a current branch (two-dot equals three-dot)', () => {
        expect(detectStaleBranch({ twoDotFiles: 3, threeDotFiles: 3 })).toEqual({ stale: false, extraFiles: 0 });
    });

    test('does NOT flag a slightly-behind branch under the threshold (low false-positive)', () => {
        expect(detectStaleBranch({ twoDotFiles: 5, threeDotFiles: 2 })).toEqual({ stale: false, extraFiles: 3 });
    });

    test('threshold is tunable (the design knob #13710 leaves for review)', () => {
        expect(detectStaleBranch({ twoDotFiles: 5, threeDotFiles: 2, threshold: 2 })).toEqual({ stale: true, extraFiles: 3 });
    });

    test('clamps extraFiles to zero when three-dot exceeds two-dot', () => {
        expect(detectStaleBranch({ twoDotFiles: 2, threeDotFiles: 5 })).toEqual({ stale: false, extraFiles: 0 });
    });
});

test.describe('buildScripts/util/branchFreshness.assessDevReferenceAuthority (#16163)', () => {
    const
        localSha  = 'a'.repeat(40),
        remoteSha = 'b'.repeat(40);

    test('successful fetch owns the authority without a fallback coordinate', () => {
        expect(assessDevReferenceAuthority({fetchSucceeded: true})).toEqual({
            usable: true,
            status: 'fetched'
        })
    });

    test('equal full local and remote coordinates preserve a proven-current local object', () => {
        expect(assessDevReferenceAuthority({
            fetchSucceeded: false,
            localSha,
            remoteSha     : localSha.toUpperCase()
        })).toEqual({
            usable: true,
            status: 'verified-local'
        })
    });

    test('different local and remote coordinates fail closed as stale', () => {
        expect(assessDevReferenceAuthority({
            fetchSucceeded: false,
            localSha,
            remoteSha
        })).toEqual({
            usable: false,
            status: 'stale-local'
        })
    });

    test('missing local or remote coordinates remain distinguishable', () => {
        expect(assessDevReferenceAuthority({
            fetchSucceeded: false,
            remoteSha
        })).toEqual({
            usable: false,
            status: 'local-unavailable'
        });
        expect(assessDevReferenceAuthority({
            fetchSucceeded: false,
            localSha
        })).toEqual({
            usable: false,
            status: 'remote-unavailable'
        })
    });

    test('malformed remote output never reads as an unchanged branch', () => {
        expect(assessDevReferenceAuthority({
            fetchSucceeded: false,
            localSha,
            remoteSha     : 'c'.repeat(41)
        })).toEqual({
            usable: false,
            status: 'remote-malformed'
        })
    })
});
