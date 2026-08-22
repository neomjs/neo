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

// The concurrency knobs left their class-config home for this subtree; a deployment that
// sets nothing must be byte-for-byte unchanged, so the defaults pin the retired class values.
// Env projection is asserted on a FRESH root created after the env write — the leaf applies its
// env layer at construct time — never by mutating a shared instance (the singleton-mutation ban).
test.describe('tenantRepoSync concurrency leaves (#17158)', () => {
    test('the canonical defaults preserve the retired class-config values', () => {
        const root = Neo.create(RootConfigBase);

        try {
            const {concurrencyGateTimeoutMs, concurrencyLimit} = root.data.orchestrator.tenantRepoSync;

            expect(concurrencyLimit).toBe(2);
            expect(concurrencyGateTimeoutMs).toBe(0);
        } finally {
            root.destroy()
        }
    });

    test('each env var projects onto its resolved leaf', () => {
        process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_CONCURRENCY_LIMIT          = '5';
        process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT_MS = '2500';

        try {
            const root = Neo.create(RootConfigBase);

            try {
                expect(root.data.orchestrator.tenantRepoSync.concurrencyLimit).toBe(5);
                expect(root.data.orchestrator.tenantRepoSync.concurrencyGateTimeoutMs).toBe(2500);
            } finally {
                root.destroy()
            }
        } finally {
            delete process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_CONCURRENCY_LIMIT;
            delete process.env.NEO_ORCHESTRATOR_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT_MS;
        }
    });
});
