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
import DockZoneModel          from '../../../../src/dashboard/DockZoneModel.mjs';

const tabsDoc = ids => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'r',
    items : Object.fromEntries(ids.map(id => [id, {componentRef: id, title: id}])),
    nodes : {
        r: {type: 'tabs', items: [...ids], activeItemId: ids[0]}
    }
});

// Fixtures ride the REAL landed producer — hand-rolled envelopes only appear in the negative
// cases that deliberately break the envelope contract.
const capture = docs => {
    let {layout, errors} = DockZoneModel.captureTopologyPerspective(docs, {layoutId: 'test-perspective', title: 'Test'});

    if (errors.length) {
        throw new Error(`fixture capture failed: ${errors[0]}`)
    }

    return layout
};

const capturedIdsOf = saved => DockTopologyReconciler.capturedSlots(saved)
    .flatMap(doc => Object.keys(doc.items || {}));

// Conservation invariant: every captured item id lands in exactly one of restored/unrestored.
const expectConservation = (saved, result) => {
    let covered = [...result.restored, ...result.unrestored.map(entry => entry.itemId)].sort();

    expect(covered).toEqual(capturedIdsOf(saved).sort())
};

test.describe('Neo.dashboard.DockTopologyReconciler', () => {
    test('shrunk topology: best-coverage assignment + reason-classed remainder + conservation', () => {
        let saved = capture([
                tabsDoc(['alpha', 'beta']),
                tabsDoc(['gamma', 'delta']),
                tabsDoc(['omega', 'psi'])
            ]),
            live  = [
                tabsDoc(['gamma', 'delta']),
                tabsDoc(['alpha', 'beta'])
            ],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.mapping.map(({capturedIndex, liveIndex}) => [capturedIndex, liveIndex]))
            .toEqual([[0, 1], [1, 0]]);
        // Slot 2 HAD affinity nowhere-free: the topology shrank underneath it — reasoned, never dropped.
        expect(result.unrestored).toEqual([
            {capturedIndex: 2, itemId: 'omega', reason: DockTopologyReconciler.REASON_UNMAPPED_SLOT},
            {capturedIndex: 2, itemId: 'psi',   reason: DockTopologyReconciler.REASON_UNMAPPED_SLOT}
        ]);
        expectConservation(saved, result)
    });

    test('the greedy trap: optimal assignment maps BOTH slots where captured-order greedy strands one', () => {
        // Slot 0 marginally prefers W0 (0.6 vs 0.5); slot 1 can ONLY use W0 (0.4, zero for W1).
        // Greedy: slot 0 eats W0, slot 1 strands (cardinality 1). Optimal: both map (cardinality 2).
        let saved = capture([
                tabsDoc(['a', 'b', 'c']),
                tabsDoc(['d', 'e'])
            ]),
            live  = [
                tabsDoc(['a', 'b', 'c', 'd', 'e']),           // W0: slot0 j=3/5=.6 · slot1 j=2/5=.4
                tabsDoc(['a', 'b', 'c', 'x', 'y', 'z'])       // W1: slot0 j=3/6=.5 · slot1 j=0
            ],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.mapping.map(({capturedIndex, liveIndex}) => [capturedIndex, liveIndex]))
            .toEqual([[0, 1], [1, 0]]);
        expect(result.unrestored).toEqual([]);
        expectConservation(saved, result)
    });

    test('exact ties resolve content-stably: identical candidate windows + live permutation → same mapping content', () => {
        let saved  = capture([tabsDoc(['alpha'])]),
            cloneA = tabsDoc(['alpha']),
            cloneB = tabsDoc(['alpha']),
            first  = DockTopologyReconciler.reconcile(saved, [cloneA, cloneB]),
            second = DockTopologyReconciler.reconcile(saved, [cloneB, cloneA]);

        // Identical candidates are interchangeable at affinity altitude: the tie rule picks the
        // smallest live index deterministically, and the CONTENT of the outcome is permutation-stable.
        expect(first.mapping).toEqual([expect.objectContaining({capturedIndex: 0, liveIndex: 0})]);
        expect(second.mapping).toEqual([expect.objectContaining({capturedIndex: 0, liveIndex: 0})]);
        expect(Object.keys(first.documents[0].items)).toEqual(Object.keys(second.documents[0].items));
        expect(first.errors).toEqual([]);
        expect(second.errors).toEqual([])
    });

    test('grown topology: excess live windows stay reference-identical; no spawning surface exists', () => {
        let saved  = capture([tabsDoc(['alpha'])]),
            live   = [tabsDoc(['zeta']), tabsDoc(['alpha']), tabsDoc(['eta'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.mapping).toEqual([
            expect.objectContaining({capturedIndex: 0, liveIndex: 1})
        ]);
        expect(result.unmatchedLive.sort()).toEqual([0, 2]);
        expect(result.documents[0]).toBe(live[0]);
        expect(result.documents[2]).toBe(live[2]);
        expect(result.unrestored).toEqual([]);
        expectConservation(saved, result)
    });

    test('envelope authority fails the ENTIRE restore closed, without throwing', () => {
        let live = [tabsDoc(['alpha'])];

        const expectFailClosed = (savedLayout, label) => {
            let result;

            expect(() => { result = DockTopologyReconciler.reconcile(savedLayout, live) },
                `${label} must not throw`).not.toThrow();
            expect(result.errors.length, `${label} must surface errors`).toBeGreaterThan(0);
            expect(result.mapping).toEqual([]);
            expect(result.documents[0]).toBe(live[0]);
            result.unrestored.forEach(entry =>
                expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED));

            return result
        };

        let valid = capture([tabsDoc(['alpha']), tabsDoc(['beta'])]);

        // Foreign wrapper schema.
        expectFailClosed({...valid, schema: 'neo.harness.dockLayout.v999'}, 'foreign schema');

        // Wrong scope smuggling windowDocuments.
        expectFailClosed({...valid, captureScope: 'window'}, 'window-scope + smuggled windowDocuments');

        // Missing primary document.
        expectFailClosed((() => { let broken = {...valid}; delete broken.dockZone; return broken })(), 'missing dockZone');

        // Non-array windowDocuments.
        expectFailClosed({...valid, windowDocuments: 'nope'}, 'non-array windowDocuments');

        // A malformed slot fails closed with its index preserved in the surfaced error.
        let badSlot = expectFailClosed({
            ...valid,
            windowDocuments: [{
                schema: 'neo.harness.dockZone.v1',
                root  : 'r',
                items : {},
                nodes : {r: {type: 'tabs', items: ['ghost'], activeItemId: 'ghost'}}
            }]
        }, 'malformed slot');
        expect(badSlot.errors.join(' ')).toContain('windowDocuments[0]');

        // Null / empty envelopes fail closed too.
        expectFailClosed(null, 'null envelope')
    });

    test('workspace-global uniqueness: a slot whose placement would duplicate an item does not place', () => {
        // Hand-built envelope (schema-complete, passes the landed validator): two slots carrying
        // the SAME item id — a state the capture producer does not emit, but a stored layout could.
        let shared = {
                schema           : DockZoneModel.LAYOUT_SCHEMA,
                layoutId         : 'dup-test',
                title            : 'Dup',
                captureScope     : 'topology',
                windowFingerprint: null,
                metadata         : {},
                dockZone         : tabsDoc(['shared', 'solo']),
                windowDocuments  : [tabsDoc(['shared'])]
            },
            live   = [tabsDoc(['shared', 'solo']), tabsDoc(['shared'])],
            result = DockTopologyReconciler.reconcile(shared, live);

        // Exactly one PLACEMENT of 'shared' across the documents that received placements —
        // a dup-blocked slot's window stays untouched (its pre-existing live content is not a
        // placement and is not this module's to rewrite).
        let placedIndexes = result.applied.map(entry => entry.liveIndex),
            placedShared  = placedIndexes.filter(index => result.documents[index].items?.shared).length;

        expect(result.errors).toEqual([]);
        expect(placedShared).toBe(1);
        // The dup-blocked slot's window keeps reference identity.
        expect(result.documents[1]).toBe(live[1]);
        expect(result.unrestored).toEqual([
            {capturedIndex: 1, itemId: 'shared', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM}
        ]);
        expectConservation(shared, result)
    });

    test('deferral reasons pass through verbatim: only topology-fingerprint-mismatch may adopt', () => {
        let saved    = capture([tabsDoc(['alpha'])]),
            live     = [tabsDoc(['alpha'])],
            original = DockRestorePlanner.restoreToward;

        try {
            DockRestorePlanner.restoreToward = () => ({
                applied: 0, deferred: true, document: live[0], errors: [],
                plan   : [], reason: 'cross-node-singleton-cycle', surplus: []
            });

            let result = DockTopologyReconciler.reconcile(saved, live);

            // NOT adopted: the live document is untouched and the foreign reason passes through.
            expect(result.documents[0]).toBe(live[0]);
            expect(result.applied).toEqual([]);
            expect(result.unrestored).toEqual([
                {capturedIndex: 0, itemId: 'alpha', reason: 'cross-node-singleton-cycle'}
            ]);
            expectConservation(saved, result)
        } finally {
            DockRestorePlanner.restoreToward = original
        }
    });

    test('executor failures report apply-error — never mislabeled as validation', () => {
        let saved    = capture([tabsDoc(['alpha'])]),
            live     = [tabsDoc(['alpha'])],
            original = DockRestorePlanner.restoreToward;

        try {
            DockRestorePlanner.restoreToward = () => ({
                applied: 0, deferred: false, document: live[0], errors: ['boom'],
                plan   : [], reason: null, surplus: []
            });

            let result = DockTopologyReconciler.reconcile(saved, live);

            expect(result.documents[0]).toBe(live[0]);
            expect(result.errors.join(' ')).toContain('boom');
            expect(result.unrestored).toEqual([
                {capturedIndex: 0, itemId: 'alpha', reason: DockTopologyReconciler.REASON_APPLY_ERROR}
            ]);
            expectConservation(saved, result)
        } finally {
            DockRestorePlanner.restoreToward = original
        }
    });

    test('composition: same shape restores incrementally through the landed planner; changed shape adopts + reports displaced', () => {
        let capturedSame = tabsDoc(['alpha', 'beta']),
            liveSame     = {...tabsDoc(['alpha', 'beta']), nodes: {r: {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'beta'}}},
            expected     = DockRestorePlanner.restoreToward(liveSame, capturedSame),

            capturedGrow = tabsDoc(['gamma', 'delta']),
            liveGrow     = tabsDoc(['gamma', 'delta', 'extra']),

            saved  = capture([capturedSame, capturedGrow]),
            result = DockTopologyReconciler.reconcile(saved, [liveSame, liveGrow]);

        expect(result.errors).toEqual([]);
        expect(result.applied.map(entry => entry.mode)).toEqual(['incremental', 'adopt']);

        expect(result.documents[0]).toEqual(expected.document);
        expect(result.applied[0].applied).toBe(expected.applied);

        expect(result.documents[1]).toEqual(DockTopologyReconciler.capturedSlots(saved)[1]);
        expect(result.documents[1]).not.toBe(DockTopologyReconciler.capturedSlots(saved)[1]);
        expect(result.displaced).toEqual([{itemId: 'extra', liveIndex: 1}]);
        expectConservation(saved, result)
    });
});
