import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import RootConfigBase from '../../../../../../ai/configBase.mjs';

// The canonical defaults' RELATIONSHIP is the guard: the starved duration floor
// must exceed the backoff cap, or an inverted deployment emits starved-lane heal records
// for what is merely a transient outage. Pinned as literals AND as the ordered pair so an
// edit to either leaf fails loudly here instead of silently in production.
test.describe('tenantRepoSync leaf defaults — the starved ordering pin (#16312)', () => {
    let tier1Root;

    test.beforeAll(() => {
        tier1Root = Neo.create(RootConfigBase)
    });

    test.afterAll(() => {
        tier1Root?.destroy()
    });

    test('the canonical defaults hold their documented values', () => {
        const {backoffCapMs, starvedAfterMs} = tier1Root.data.orchestrator.tenantRepoSync;

        expect(backoffCapMs).toBe(2 * 60 * 60 * 1000);
        expect(starvedAfterMs).toBe(6 * 60 * 60 * 1000);
    });

    test('the starved duration floor exceeds the backoff cap', () => {
        expect(tier1Root.data.orchestrator.tenantRepoSync.starvedAfterMs)
            .toBeGreaterThan(tier1Root.data.orchestrator.tenantRepoSync.backoffCapMs);
    });
});
