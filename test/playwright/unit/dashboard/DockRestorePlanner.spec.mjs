import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockRestorePlannerTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DockRestorePlanner from '../../../../src/dashboard/dock/persistence/RestorePlanner.mjs';
import DockTopologyDiff   from '../../../../src/dashboard/dock/model/TopologyDiff.mjs';
import DockZoneModel      from '../../../../src/dashboard/DockZoneModel.mjs';

/**
 * @summary Tests for Neo.dashboard.dock.persistence.RestorePlanner — same-topology perspective restore via semantic ops.
 * Pure-JSON: fingerprint gate, deterministic diff→op planning, fail-closed sequential application, and the
 * capture → mutate → restore round-trip (fingerprint equality + empty diff + itemId continuity: no pane is
 * ever destroyed, the unit-level never-remounted assertion).
 */

/** A canonical split document: a horizontal split of a two-tab main zone and a single-tab side zone. */
function doc() {
    return {
        schema: 'neo.harness.dockZone.v1',
        root  : 'root',
        items : {
            strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
            swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'},
            terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
        },
        nodes: {
            root       : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
            'main-tabs': {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'},
            'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

const fp        = d => DockZoneModel.computeShapeFingerprint(d).fingerprint?.shape;
const emptyDiff = d => {
    const r = DockTopologyDiff.diffDockDocuments(d.a, d.b);
    return {moves: r.moves, adds: r.adds, removes: r.removes, resizes: r.resizes, tabReorders: r.tabReorders, autoHideFlips: r.autoHideFlips}
};
const EMPTY = {moves: [], adds: [], removes: [], resizes: [], tabReorders: [], autoHideFlips: []};

test.describe('DockRestorePlanner — same-topology restore', () => {
    test('round-trip: mutate (resize + reorder) then restore reaches the captured layout via ops', () => {
        const captured = doc();

        // mutate the live document: shrink the split + reorder main-tabs to [swarm, strategy]
        let m1 = DockZoneModel.applyOperation(doc(), {operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]});
        expect(m1.errors).toEqual([]);
        let m2 = DockZoneModel.applyOperation(m1.document, {operation: 'moveItem', itemId: 'swarm', targetNodeId: 'main-tabs', index: 0});
        expect(m2.errors).toEqual([]);
        const current = m2.document;
        expect(current.nodes['main-tabs'].items).toEqual(['swarm', 'strategy']);

        const {deferred, plan, errors, applied, document: restored} = DockRestorePlanner.restoreToward(current, captured);

        expect(deferred).toBe(false);
        expect(errors).toEqual([]);
        expect(applied).toBe(plan.length);

        // reached the captured layout — via ops, not a swap
        expect(restored.nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
        expect(restored.nodes.root.sizes).toEqual([0.6, 0.4]);

        // fingerprint equality + empty diff vs the capture (the round-trip AC)
        expect(fp(restored)).toBe(fp(captured));
        expect(emptyDiff({a: restored, b: captured})).toEqual(EMPTY);

        // itemId continuity — restore never destroys (unit-level never-remounted)
        expect(Object.keys(restored.items).sort()).toEqual(Object.keys(captured.items).sort());
    });

    test('auto-hide flip round-trip: restore toggles the flag back through setItemAutoHidden', () => {
        const captured = doc();
        let   m        = DockZoneModel.applyOperation(doc(), {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true});
        expect(m.errors).toEqual([]);
        const current = m.document;
        expect(current.items.terminal.autoHidden).toBe(true);

        const {plan, document: restored} = DockRestorePlanner.restoreToward(current, captured);
        expect(plan).toContainEqual({operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: false});
        expect(restored.items.terminal.autoHidden).toBe(false);
        expect(emptyDiff({a: restored, b: captured})).toEqual(EMPTY);
    });

    test('same-fingerprint cross-node swap restores collapse-safely (no source node emptied mid-plan)', () => {
        const captured = doc(); // main-tabs [strategy, swarm], side-tabs [terminal]
        // current EXCHANGES terminal ↔ strategy across the two zones — same counts (t2, t1), same shape.
        const current = {
            schema: 'neo.harness.dockZone.v1',
            root  : 'root',
            items : {
                strategy: {componentRef: 'strategy', title: 'Strategy', kind: 'panel'},
                swarm   : {componentRef: 'swarm',    title: 'Swarm',    kind: 'panel'},
                terminal: {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'}
            },
            nodes: {
                root       : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
                'main-tabs': {type: 'tabs', items: ['terminal', 'swarm'], activeItemId: 'terminal'},
                'side-tabs': {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'}
            }
        };
        expect(fp(current)).toBe(fp(captured)); // same shape, item exchange only

        const {deferred, errors, applied, plan, document: restored} = DockRestorePlanner.restoreToward(current, captured);

        expect(deferred).toBe(false);
        expect(errors).toEqual([]);
        expect(applied).toBe(plan.length);
        expect(restored.nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
        expect(restored.nodes['side-tabs'].items).toEqual(['terminal']);
        expect(emptyDiff({a: restored, b: captured})).toEqual(EMPTY);
        expect(Object.keys(restored.items).sort()).toEqual(Object.keys(captured.items).sort());
    });

    test('unsolvable single-item swap cycle defers structurally (never crashes)', () => {
        const mk = (a, b) => ({
            schema: 'neo.harness.dockZone.v1',
            root  : 'root',
            items : {alpha: {componentRef: 'a', title: 'A', kind: 'panel'}, beta: {componentRef: 'b', title: 'B', kind: 'panel'}},
            nodes : {
                root: {type: 'split', orientation: 'horizontal', children: ['n1', 'n2'], sizes: [0.5, 0.5]},
                n1  : {type: 'tabs', items: [a], activeItemId: a},
                n2  : {type: 'tabs', items: [b], activeItemId: b}
            }
        });
        const current = mk('alpha', 'beta'), captured = mk('beta', 'alpha');
        expect(fp(current)).toBe(fp(captured));

        const {deferred, reason, plan} = DockRestorePlanner.planRestore(current, captured);
        expect(deferred).toBe(true);
        expect(reason).toBe('cross-node-singleton-cycle');
        expect(plan).toEqual([])
    });

    test('fingerprint mismatch defers structurally (never a silent partial)', () => {
        // move terminal into main-tabs → side-tabs empties + collapses → a different shape
        let mm = DockZoneModel.applyOperation(doc(), {operation: 'moveItem', itemId: 'terminal', targetNodeId: 'main-tabs', index: 2});
        expect(mm.errors).toEqual([]);
        expect(fp(mm.document)).not.toBe(fp(doc()));

        const {deferred, reason, plan, surplus} = DockRestorePlanner.planRestore(mm.document, doc());
        expect(deferred).toBe(true);
        expect(reason).toBe('topology-fingerprint-mismatch');
        expect(plan).toEqual([]);
        expect(surplus).toEqual([]);
    });

    test('planRestore is deterministic for identical inputs', () => {
        let m1      = DockZoneModel.applyOperation(doc(), {operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]}),
            m2      = DockZoneModel.applyOperation(m1.document, {operation: 'moveItem', itemId: 'swarm', targetNodeId: 'main-tabs', index: 0}),
            current = m2.document, captured = doc();

        expect(DockRestorePlanner.planRestore(current, captured).plan)
            .toEqual(DockRestorePlanner.planRestore(current, captured).plan)
    });

    test('applyRestorePlan is fail-closed: first error stops, partial application is visible', () => {
        const plan = [
            {operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.5, 0.5]},
            {operation: 'moveItem', itemId: 'nonexistent', targetNodeId: 'main-tabs', index: 0}
        ];
        const r = DockRestorePlanner.applyRestorePlan(doc(), plan);
        expect(r.applied).toBe(1);
        expect(r.errors.length).toBeGreaterThan(0);
        expect(r.document.nodes.root.sizes).toEqual([0.5, 0.5]); // the first op did land
    });
});
