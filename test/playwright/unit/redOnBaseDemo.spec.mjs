import {test, expect} from '@playwright/test';
import {claimLimit} from '../../../buildScripts/util/contributorStanding.mjs';

// Temporary synthetic demonstration for AC-7. Removed before this PR becomes ready.
test('red-on-base demo: requires the temporary source change', () => {
    expect(claimLimit(5)).toBe(3)
});

test('red-on-base demo: passes both ways and should warn', () => {
    expect(claimLimit(0)).toBe(1)
});
