import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTopologyReconcilerTest'
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../src/Neo.mjs';
import * as core              from '../../../../src/core/_export.mjs';
import DockRestorePlanner     from '../../../../src/dashboard/DockRestorePlanner.mjs';
import DockTopologyReconciler from '../../../../src/dashboard/DockTopologyReconciler.mjs';

const tabsDoc = ids => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'r',
    items : Object.fromEntries(ids.map(id => [id, {componentRef: id, title: id}])),
    nodes : {
        r: {type: 'tabs', items: [...ids], activeItemId: ids[0]}
    }
});

const layout = (slot0, windowDocs = []) => ({
    schema         : 'neo.harness.dockLayout.v1',
    layoutId       : 'test-perspective',
    title          : 'Test',
    captureScope   : 'topology',
    dockZone       : slot0,
    windowDocuments: windowDocs
});

const capturedIdsOf = saved => DockTopologyReconciler.capturedSlots(saved)
    .flatMap(doc => Object.keys(doc.items || {}));

// Conservation invariant: every captured item id lands in exactly one of restored/unrestored.
const expectConservation = (saved, result) => {
    let covered = [...result.restored, ...result.unrestored.map(entry => entry.itemId)].sort();

    expect(covered).toEqual(capturedIdsOf(saved).sort())
};

test.describe('Neo.dashboard.DockTopologyReconciler', () => {
    test('shrunk topology: best-coverage mapping + reason-classed remainder + conservation', () => {
        let saved = layout(
                tabsDoc(['alpha', 'beta']),
                [tabsDoc(['gamma', 'delta']), tabsDoc(['omega', 'psi'])]
            ),
            live  = [
                tabsDoc(['gamma', 'delta']),   // strong match for slot 1
                tabsDoc(['alpha', 'beta'])     // strong match for slot 0
            ],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        // Slot 0 -> live 1, slot 1 -> live 0 — affinity decides, never order or ids.
        expect(result.mapping.map(({capturedIndex, liveIndex}) => [capturedIndex, liveIndex]))
            .toEqual([[0, 1], [1, 0]]);
        // Slot 2 (omega/psi) has no window left: reasoned, never dropped.
        expect(result.unrestored).toEqual([
            {capturedIndex: 2, itemId: 'omega', reason: DockTopologyReconciler.REASON_NO_LIVE_WINDOW},
            {capturedIndex: 2, itemId: 'psi',   reason: DockTopologyReconciler.REASON_NO_LIVE_WINDOW}
        ]);
        expectConservation(saved, result)
    });

    test('zero item overlap never maps: unmapped-slot even with live windows available', () => {
        let saved  = layout(tabsDoc(['alpha', 'beta'])),
            live   = [tabsDoc(['unrelated1', 'unrelated2'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.mapping).toEqual([]);
        expect(result.unrestored.map(entry => entry.reason))
            .toEqual([DockTopologyReconciler.REASON_UNMAPPED_SLOT, DockTopologyReconciler.REASON_UNMAPPED_SLOT]);
        // The available live window stays untouched.
        expect(result.unmatchedLive).toEqual([0]);
        expect(result.documents[0]).toBe(live[0]);
        expectConservation(saved, result)
    });

    test('grown topology: excess live windows stay untouched; no spawning surface exists', () => {
        let saved  = layout(tabsDoc(['alpha'])),
            live   = [tabsDoc(['zeta']), tabsDoc(['alpha']), tabsDoc(['eta'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.mapping).toEqual([
            {capturedIndex: 0, liveIndex: 1, affinity: expect.objectContaining({jaccard: 1})}
        ]);
        expect(result.unmatchedLive.sort()).toEqual([0, 2]);
        // Untouched = the SAME document references, byte-identical governance (§ excess windows).
        expect(result.documents[0]).toBe(live[0]);
        expect(result.documents[2]).toBe(live[2]);
        expect(result.unrestored).toEqual([]);
        expectConservation(saved, result)
    });

    test('determinism: permuting live-document order never changes the content of the mapping', () => {
        let slotA         = tabsDoc(['alpha', 'beta']),
            slotB         = tabsDoc(['gamma']),
            saved         = layout(slotA, [slotB]),
            liveA         = tabsDoc(['alpha', 'beta']),
            liveB         = tabsDoc(['gamma']),
            first         = DockTopologyReconciler.reconcile(saved, [liveA, liveB]),
            second        = DockTopologyReconciler.reconcile(saved, [liveB, liveA]),
            pairByContent = result => result.mapping
                .map(({capturedIndex, liveIndex}) => [capturedIndex, result.documents[liveIndex]])
                .map(([capturedIndex, doc]) => [capturedIndex, Object.keys(doc.items).sort().join(',')]);

        expect(pairByContent(first)).toEqual(pairByContent(second));
        expect(first.errors).toEqual([]);
        expect(second.errors).toEqual([])
    });

    test('fail-closed validation boundary: one invalid slot voids the ENTIRE restore, nothing mutates', () => {
        let broken = {
                schema: 'neo.harness.dockZone.v1',
                root  : 'r',
                items : {},
                nodes : {r: {type: 'tabs', items: ['ghost'], activeItemId: 'ghost'}}
            },
            saved  = layout(tabsDoc(['alpha']), [broken]),
            live   = [tabsDoc(['alpha'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.mapping).toEqual([]);
        expect(result.documents[0]).toBe(live[0]);
        // EVERY captured item reports validation-failed — including the valid slot's: no partial restore.
        expect(new Set(result.unrestored.map(entry => entry.reason)))
            .toEqual(new Set([DockTopologyReconciler.REASON_VALIDATION_FAILED]));
        expectConservation(saved, result)
    });

    test('composition: same shape restores incrementally through the landed planner; changed shape adopts + reports displaced', () => {
        // Same item set, same shape (one tabs node, two items), different active tab -> incremental.
        let capturedSame = tabsDoc(['alpha', 'beta']),
            liveSame     = {...tabsDoc(['alpha', 'beta']), nodes: {r: {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'beta'}}},
            expected     = DockRestorePlanner.restoreToward(liveSame, capturedSame),

            // Overlapping items, different shape (2 vs 3 tabs) -> wholesale adopt; live-only item displaced.
            capturedGrow = tabsDoc(['gamma', 'delta']),
            liveGrow     = tabsDoc(['gamma', 'delta', 'extra']),

            saved  = layout(capturedSame, [capturedGrow]),
            result = DockTopologyReconciler.reconcile(saved, [liveSame, liveGrow]);

        expect(result.errors).toEqual([]);
        expect(result.applied.map(entry => entry.mode)).toEqual(['incremental', 'adopt']);

        // Incremental pair equals the planner's own output — composition, not duplication.
        expect(result.documents[0]).toEqual(expected.document);
        expect(result.applied[0].applied).toBe(expected.applied);

        // Adopted pair: document becomes the captured slot (cloned), live-only content is DISPLACED.
        expect(result.documents[1]).toEqual(capturedGrow);
        expect(result.documents[1]).not.toBe(capturedGrow);
        expect(result.displaced).toEqual([{itemId: 'extra', liveIndex: 1}]);
        expectConservation(saved, result)
    });
});
