import {setup} from '../../../../setup.mjs';

const appName = 'KBSyncBoundaryTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Boundary coverage for the kbSync script-level lease-yield wiring — the seam the direct `VectorService`
 * embed tests cannot reach. The exports are imported (the auto-run is guarded), so this asserts the real
 * script wiring against two defects:
 *   - the yield predicate must read `AiConfig.orchestrator.heavyMaintenance.maxActiveHoldMs`, NOT the sibling
 *     `orchestrator.heavyMaintenanceLease` branch (which holds only `staleAfterMs` → undefined → never yields);
 *   - a cooperative yield must classify as a DEFERRED partial sync (supervisor records `skipped`), NOT a
 *     false-green `completed` that refreshes lastSuccessAt.
 */
test.describe.configure({mode: 'serial'});

test.describe('syncKnowledgeBase — lease-yield boundary wiring', () => {
    let buildLeaseYieldPredicate, classifyKbSyncOutcome, AiConfig;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/maintenance/syncKnowledgeBase.mjs');
        buildLeaseYieldPredicate = mod.buildLeaseYieldPredicate;
        classifyKbSyncOutcome    = mod.classifyKbSyncOutcome;
        AiConfig = (await import('../../../../../../ai/config.mjs')).default;
    });

    test('predicate reads the heavyMaintenance.maxActiveHoldMs leaf — an over-bound hold yields', () => {
        // Guards the heavyMaintenance-vs-heavyMaintenanceLease config-branch trap: maxActiveHoldMs lives
        // under heavyMaintenance; the sibling branch holds only staleAfterMs (→ undefined → never yields).
        const bound = AiConfig.orchestrator.heavyMaintenance.maxActiveHoldMs;
        expect(Number.isFinite(bound)).toBe(true);

        const overBoundAt = new Date(Date.now() - (bound + 60_000)).toISOString();
        const freshAt     = new Date().toISOString();

        expect(buildLeaseYieldPredicate({lease: {acquiredAt: overBoundAt}})()).toBe(true);
        expect(buildLeaseYieldPredicate({lease: {acquiredAt: freshAt}})()).toBe(false);
    });

    test('a cooperative yield classifies as a DEFERRED partial sync, not completed', () => {
        const yielded = classifyKbSyncOutcome({status: 'completed', result: {yielded: true, embedded: 50}});
        expect(yielded).toMatchObject({deferred: true, reason: 'heavy-maintenance-lease-yield', embedded: 50});
    });

    test('a real sync classifies as completed (deferred:false, no reason)', () => {
        const done = classifyKbSyncOutcome({status: 'completed', result: {embedded: 120, deleted: 3}});
        expect(done).toMatchObject({deferred: false, embedded: 120, deleted: 3});
        expect(done.reason).toBeUndefined();
    });

    test('a lease-held run classifies as deferred (skipped, not completed)', () => {
        const held = classifyKbSyncOutcome({
            status: 'held',
            lease : {owner: 'sandman', reason: 'rem-cycle', pid: 4242, acquiredAt: new Date().toISOString()}
        });
        expect(held).toMatchObject({deferred: true, reason: 'heavy-maintenance-lease-held'});
        expect(held.holder.owner).toBe('sandman');
    });
});
