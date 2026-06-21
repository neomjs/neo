import { test, expect }      from '@playwright/test';
import { detectStaleBranch } from '../../../../../../buildScripts/util/branchFreshness.mjs';

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
