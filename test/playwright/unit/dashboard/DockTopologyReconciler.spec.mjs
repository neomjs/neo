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
        // Disjoint live catalogs (the workspace invariant); slot 0's items straddle both windows.
        // Greedy: slot 0 eats W0 (its best, .5), stranding slot 1 (zero for W1) → cardinality 1.
        // Optimal: slot 0 takes W1 (.25) so slot 1 keeps W0 (.25) → cardinality 2.
        let saved = capture([
                tabsDoc(['p', 'q', 'r']),
                tabsDoc(['s', 't'])
            ]),
            live  = [
                tabsDoc(['p', 'q', 's']),                     // W0: slot0 j=2/4=.5  · slot1 j=1/4=.25
                tabsDoc(['r', 'u'])                           // W1: slot0 j=1/4=.25 · slot1 j=0
            ],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.mapping.map(({capturedIndex, liveIndex}) => [capturedIndex, liveIndex]))
            .toEqual([[0, 1], [1, 0]]);
        expect(result.unrestored).toEqual([]);
        expectConservation(saved, result)
    });

    test('non-identical equal-aggregate ties resolve by CONTENT, permutation-stably: both live orders advance the same window content', () => {
        // TWO cardinality-2 assignments tie on every affinity key ({S0→A,S1→B} vs {S0→B,S1→A}:
        // all four pairs share jaccard 1/4 and identical structure) — but the candidate windows
        // are NOT interchangeable: A={a,c,x} and B={b,d,y} differ in content. The content-
        // signature tie rule must map S0={a,b} to A (smallest content key) under EITHER live
        // order. (Live arity differs from captured so placements ride the adopt path — the
        // landed planner refuses to invent missing items incrementally.)
        let saved = capture([tabsDoc(['a', 'b']), tabsDoc(['c', 'd'])]),
            docA  = () => tabsDoc(['a', 'c', 'x']),
            docB  = () => tabsDoc(['b', 'd', 'y']),

            first  = DockTopologyReconciler.reconcile(saved, [docA(), docB()]),
            second = DockTopologyReconciler.reconcile(saved, [docB(), docA()]);

        const contentOf = result => result.applied
            .map(({capturedIndex, liveIndex}) => [capturedIndex, Object.keys(result.documents[liveIndex].items).sort().join(',')])
            .sort();

        expect(first.errors).toEqual([]);
        expect(second.errors).toEqual([]);
        // Same captured→content mapping, same restored set, same (empty) displaced set — the
        // live ARRAY ORDER left no fingerprint on the outcome.
        expect(contentOf(first)).toEqual(contentOf(second));
        expect([...first.restored].sort()).toEqual([...second.restored].sort());
        // displaced/unrestored compare by CONTENT — liveIndex legitimately follows the permutation.
        expect(first.displaced.map(entry => entry.itemId).sort()).toEqual(second.displaced.map(entry => entry.itemId).sort());
        expect(first.unrestored).toEqual(second.unrestored);
        expectConservation(saved, first);
        expectConservation(saved, second)
    });

    test('a straddling slot never emits a duplicate: the unmatched pass-through window convicts the placement, permutation-stably', () => {
        // Captured {a,b} straddles two disjoint live windows ({a,c,x} / {b,d,y}) with equal
        // aggregate affinity. WHICHEVER window it lands on, the OTHER stays live and keeps its
        // copy — so placing would duplicate an item across the final workspace. The reconciler
        // must route the slot to duplicate-item, leave BOTH windows reference-identical, and
        // report identically under either live order.
        let saved = capture([tabsDoc(['a', 'b'])]),
            docA  = () => tabsDoc(['a', 'c', 'x']),
            docB  = () => tabsDoc(['b', 'd', 'y']);

        [[docA(), docB()], [docB(), docA()]].forEach(live => {
            let result = DockTopologyReconciler.reconcile(saved, live);

            expect(result.errors).toEqual([]);
            expect(result.applied).toEqual([]);
            expect(result.displaced).toEqual([]);
            expect(result.documents[0]).toBe(live[0]);
            expect(result.documents[1]).toBe(live[1]);
            expect(result.unrestored).toEqual([
                {capturedIndex: 0, itemId: 'a', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM},
                {capturedIndex: 0, itemId: 'b', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM}
            ]);
            expectConservation(saved, result)
        })
    });

    test('duplicate item ids ACROSS live windows are corrupt input: fail closed, mutate nothing', () => {
        let saved  = capture([tabsDoc(['alpha'])]),
            live   = [tabsDoc(['alpha', 'solo']), tabsDoc(['alpha'])],
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors.join(' ')).toContain('both carry item "alpha"');
        expect(result.applied).toEqual([]);
        expect(result.documents[0]).toBe(live[0]);
        expect(result.documents[1]).toBe(live[1]);
        result.unrestored.forEach(entry =>
            expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED))
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

        // Non-array windowDocuments — the string AND the plain-object shape (an object reaches
        // a spread as a non-iterable: the total extractor must never throw on it).
        expectFailClosed({...valid, windowDocuments: 'nope'}, 'non-array windowDocuments');
        expectFailClosed({...valid, windowDocuments: {}},     'object windowDocuments');

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

    test('a null middle slot preserves ORIGINAL captured indices in the fail-closed report', () => {
        // Slot layout: 0 = dockZone(a1), 1 = windowDocuments[0] → nulled, 2 = windowDocuments[1](c1).
        // Compacting the null away would misreport slot 2 as index 1 — the extractor must not.
        let saved = capture([tabsDoc(['a1']), tabsDoc(['b1']), tabsDoc(['c1'])]),
            live  = [tabsDoc(['a1'])];

        saved = {...saved, windowDocuments: [null, saved.windowDocuments[1]]};

        let result;

        expect(() => { result = DockTopologyReconciler.reconcile(saved, live) }).not.toThrow();
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.documents[0]).toBe(live[0]);
        // Slot 2's items report under capturedIndex 2 — NOT 1 — with the null slot in between.
        expect(result.unrestored).toEqual([
            {capturedIndex: 0, itemId: 'a1', reason: DockTopologyReconciler.REASON_VALIDATION_FAILED},
            {capturedIndex: 2, itemId: 'c1', reason: DockTopologyReconciler.REASON_VALIDATION_FAILED}
        ])
    });

    test('the finite durable-field boundary applies to EVERY captured slot, not only the primary document', () => {
        let saved = capture([tabsDoc(['a1']), tabsDoc(['b1'])]),
            live  = [tabsDoc(['a1']), tabsDoc(['b1'])],
            slot  = saved.windowDocuments[0];

        // Runtime-bearing fields must not ride an ADDITIONAL window document into a restore:
        // a document-level window fingerprint...
        let fingerprinted = {...saved, windowDocuments: [{...slot, windowFingerprint: {windowId: 'w2'}}]},
            first         = DockTopologyReconciler.reconcile(fingerprinted, live);

        expect(first.errors.join(' ')).toContain('windowDocuments[0]');
        expect(first.errors.join(' ')).toContain('windowFingerprint');
        expect(first.applied).toEqual([]);
        first.unrestored.forEach(entry =>
            expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED));

        // ...and an item-level runtime rect both fail the restore closed, offender indexed.
        let rected = {
                ...saved,
                windowDocuments: [{...slot, items: {b1: {...slot.items.b1, runtimeRect: {x: 0, y: 0}}}}]
            },
            second = DockTopologyReconciler.reconcile(rected, live);

        expect(second.errors.join(' ')).toContain('windowDocuments[0]');
        expect(second.errors.join(' ')).toContain('runtimeRect');
        expect(second.applied).toEqual([]);
        second.unrestored.forEach(entry =>
            expect(entry.reason).toBe(DockTopologyReconciler.REASON_VALIDATION_FAILED))
    });

    test('workspace-global uniqueness: a slot whose placement would duplicate an item does not place', () => {
        // Hand-built envelope (schema-complete, passes the landed validator): two slots carrying
        // the SAME item id — a state the capture producer does not emit, but a stored layout
        // could. Live catalogs are DISJOINT (the workspace invariant). 'shared' lives in W1;
        // slot 1 restores it in place, so slot 0's placement would IMPORT a second copy into
        // W0 — live ownership convicts the importer, and the id stays single in the output.
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
            live   = [tabsDoc(['solo', 'filler', 'pad']), tabsDoc(['shared'])],
            result = DockTopologyReconciler.reconcile(shared, live);

        // 'shared' appears in EXACTLY ONE final document — the complete-output invariant, not
        // merely a per-placement count (a placed copy next to an untouched live copy would
        // still be a workspace duplicate).
        let finalShared = result.documents.filter(doc => doc.items?.shared).length;

        expect(result.errors).toEqual([]);
        expect(finalShared).toBe(1);
        expect(result.restored).toEqual(['shared']);
        // The convicted importer's window keeps reference identity — slot-atomic: BOTH its
        // items report, including the collision-free one.
        expect(result.documents[0]).toBe(live[0]);
        expect(result.unrestored).toEqual([
            {capturedIndex: 0, itemId: 'shared', reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM},
            {capturedIndex: 0, itemId: 'solo',   reason: DockTopologyReconciler.REASON_DUPLICATE_ITEM}
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
