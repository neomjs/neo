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
import WorkspaceDocument  from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations         from '../../../../src/dashboard/dock/model/Operations.mjs';

/**
 * @summary Tests for Neo.dashboard.dock.persistence.RestorePlanner — same-topology perspective restore via semantic ops.
 * Pure-JSON: fingerprint gate, deterministic diff→op planning, fail-closed sequential application, and the
 * capture → mutate → restore round-trip (fingerprint equality + empty diff + itemId continuity: no pane is
 * ever destroyed, the unit-level never-remounted assertion).
 */

/** A canonical split document: a horizontal split of a two-tab main zone and a single-tab side zone. */
function doc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {reference: 'strategy', title: 'Strategy'},
            swarm   : {reference: 'swarm',    title: 'Swarm'},
            terminal: {reference: 'terminal', title: 'Terminal'}
        },
        nodes: {
            root       : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
            'main-tabs': {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'strategy'},
            'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

const fp        = d => WorkspaceDocument.computeShapeFingerprint(d).fingerprint?.shape;
const emptyDiff = d => {
    const r = DockTopologyDiff.diffDockDocuments(d.a, d.b);
    return {moves: r.moves, adds: r.adds, removes: r.removes, resizes: r.resizes, tabReorders: r.tabReorders, autoHideFlips: r.autoHideFlips}
};
const EMPTY = {moves: [], adds: [], removes: [], resizes: [], tabReorders: [], autoHideFlips: []};

test.describe('DockRestorePlanner — same-topology restore', () => {
    test('round-trip: mutate (resize + reorder) then restore reaches the captured layout via ops', () => {
        const captured = doc();

        // mutate the live document: shrink the split + reorder main-tabs to [swarm, strategy]
        let m1 = Operations.applyOperation(doc(), {operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]});
        expect(m1.errors).toEqual([]);
        let m2 = Operations.applyOperation(m1.document, {operation: 'moveItem', itemId: 'swarm', targetNodeId: 'main-tabs', index: 0});
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
        let   m        = Operations.applyOperation(doc(), {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true});
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
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {
                strategy: {reference: 'strategy', title: 'Strategy'},
                swarm   : {reference: 'swarm',    title: 'Swarm'},
                terminal: {reference: 'terminal', title: 'Terminal'}
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
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {alpha: {reference: 'a', title: 'A'}, beta: {reference: 'b', title: 'B'}},
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
        let mm = Operations.applyOperation(doc(), {operation: 'moveItem', itemId: 'terminal', targetNodeId: 'main-tabs', index: 2});
        expect(mm.errors).toEqual([]);
        expect(fp(mm.document)).not.toBe(fp(doc()));

        const {deferred, reason, plan, surplus} = DockRestorePlanner.planRestore(mm.document, doc());
        expect(deferred).toBe(true);
        expect(reason).toBe('topology-fingerprint-mismatch');
        expect(plan).toEqual([]);
        expect(surplus).toEqual([]);
    });

    test('planRestore is deterministic for identical inputs', () => {
        let m1      = Operations.applyOperation(doc(), {operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]}),
            m2      = Operations.applyOperation(m1.document, {operation: 'moveItem', itemId: 'swarm', targetNodeId: 'main-tabs', index: 0}),
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

    /**
     * Which tab you were on is document state and the capture keeps it — but nothing reported it, so
     * a restore returned the tabs and left whichever one happened to be active.
     */
    test.describe('the active tab restores too', () => {
        test('a differing active item comes back, through one setActiveItem step', () => {
            const captured = doc();

            // live: same membership, different tab selected
            const current = Operations.applyOperation(doc(), {
                operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'swarm'
            });

            expect(current.errors).toEqual([]);
            expect(current.document.nodes['main-tabs'].activeItemId).toBe('swarm');

            const {deferred, plan, errors, document: restored} = DockRestorePlanner.restoreToward(current.document, captured);

            expect(deferred).toBe(false);
            expect(errors).toEqual([]);
            expect(plan).toEqual([{operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'strategy'}]);
            expect(restored.nodes['main-tabs'].activeItemId).toBe('strategy')
        });

        test('the step lands AFTER the move that brings its item into the node', () => {
            const captured = doc();               // main-tabs [strategy, swarm] active strategy
            const wanted   = Operations.applyOperation(captured, {
                operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'swarm'
            });

            expect(wanted.errors).toEqual([]);

            // live: swarm and terminal are SWAPPED between the two zones, so tab counts still match
            // (the fingerprint gate) and the restore has to move both before it can select swarm.
            const current = {
                schema: 'neo.dock.zone.v1',
                root  : 'root',
                items : doc().items,
                nodes : {
                    root       : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
                    'main-tabs': {type: 'tabs', items: ['strategy', 'terminal'], activeItemId: 'strategy'},
                    'side-tabs': {type: 'tabs', items: ['swarm'], activeItemId: 'swarm'}
                }
            };

            const {deferred, errors, plan, document: restored} = DockRestorePlanner.restoreToward(current, wanted.document);

            expect(deferred).toBe(false);
            expect(errors).toEqual([]);

            const
                moveIndex   = plan.findIndex(step => step.operation === 'moveItem' && step.itemId === 'swarm' && step.targetNodeId === 'main-tabs'),
                activeIndex = plan.findIndex(step => step.operation === 'setActiveItem' && step.tabsNodeId === 'main-tabs');

            expect(moveIndex, 'the move is planned').toBeGreaterThan(-1);
            expect(activeIndex, 'the selection is planned').toBeGreaterThan(-1);
            // the executor rejects an active item that is not a member, so order is the contract
            expect(activeIndex).toBeGreaterThan(moveIndex);

            expect(restored.nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
            expect(restored.nodes['main-tabs'].activeItemId).toBe('swarm')
        });

        test('an already-correct active item emits no step', () => {
            const captured = doc();
            const current  = Operations.applyOperation(doc(), {
                operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]
            });

            expect(current.errors).toEqual([]);

            const {plan} = DockRestorePlanner.restoreToward(current.document, captured);

            expect(plan.some(step => step.operation === 'setActiveItem'), 'no spurious selection').toBe(false);
            expect(plan).toHaveLength(1)
        });

        test('an active item the captured node does not list emits nothing, and the restore still succeeds', () => {
            // a capture naming a non-member: the executor would reject the operation, so the plan
            // must not carry it — a restore never destroys and must not start throwing here either
            const captured = doc();

            captured.nodes['main-tabs'].activeItemId = 'terminal';

            const current = Operations.applyOperation(doc(), {
                operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]
            });

            expect(current.errors).toEqual([]);

            const {deferred, errors, plan, document: restored} = DockRestorePlanner.restoreToward(current.document, captured);

            expect(deferred).toBe(false);
            expect(errors).toEqual([]);
            expect(plan.some(step => step.operation === 'setActiveItem')).toBe(false);
            expect(restored.nodes.root.sizes).toEqual([0.6, 0.4])
        })
    })
});

/**
 * A rail-bearing document. The fixture above roots at a `split`, so no arm here plans across an
 * edge zone carrying extents; these do, which is the only way to exercise the rail-restore path.
 * @returns {Object}
 */
function railDoc({autoHidden = false, extent = 0.11, resizable = true} = {}) {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {reference: 'strategy', title: 'Strategy'},
            queues  : {reference: 'queues',   title: 'Queues', autoHidden}
        },
        nodes: {
            root       : {
                type : 'edge-zone',
                zones: {
                    center: {nodeId: 'main-tabs'},
                    left  : {nodeId: 'left-tabs', extent, resizable}
                }
            },
            'main-tabs': {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'},
            'left-tabs': {type: 'tabs', items: ['queues'],   activeItemId: 'queues'}
        }
    }
}

/**
 * @summary Asserts a vetoed rail step against a plan that is NOT empty.
 *
 * `expect(plan).toEqual([])` cannot tell "the rail was filtered" from "the planner emitted nothing
 * for an unrelated reason" — every veto arm passes on a planner that has stopped working. So each
 * one here carries a second, unrelated pending change (an auto-hide flip, which the planner orders
 * after `edgeResizes`) and asserts the plan is exactly that one step: the rail absent, the valid
 * step present and applied. That distinguishes a filter from a no-op, which an empty plan cannot.
 * @param {Object} current
 * @param {Object} captured
 * @returns {Object} the restore receipt, for further per-case assertions
 */
function expectRailVetoedButPlanStillRuns(current, captured) {
    const receipt = DockRestorePlanner.restoreToward(current, captured);

    expect(receipt.deferred).toBe(false);
    expect(receipt.errors, 'a vetoed rail must never surface as a restore error').toEqual([]);
    expect(receipt.plan, 'exactly the unrelated valid step — no resizeEdgeZone, and NOT an empty plan')
        .toEqual([{operation: 'setItemAutoHidden', itemId: 'queues', autoHidden: false}]);
    expect(receipt.applied, 'the valid step still ran').toBe(1);
    expect(receipt.document.items.queues.autoHidden).toBe(false);

    return receipt
}

test.describe('DockRestorePlanner — edge-zone extents (#18579)', () => {
    test('a rail drag plans a step and the round trip returns the captured width', () => {
        const captured = railDoc(),
              dragged  = Operations.applyOperation(railDoc(), {
                  operation: 'resizeEdgeZone', edgeZoneId: 'root', edge: 'left', extent: 0.4
              });

        expect(dragged.errors, 'the drag itself must commit through the executor').toEqual([]);
        expect(dragged.document.nodes.root.zones.left.extent).toBe(0.4);

        const {deferred, reason, errors, plan, applied, document: restored} =
            DockRestorePlanner.restoreToward(dragged.document, captured);

        // The defect this arm exists for was not a wrong answer — it was `deferred: false,
        // errors: [], plan: []`. Success with nothing to do, on two documents that differ. A
        // consumer folding that plan concludes the layout is already restored, so asserting the
        // restored extent ALONE would still pass on a planner that silently gave up: these three
        // pin that the emptiness is gone, not just that the value happens to be right.
        expect(deferred).toBe(false);
        expect(reason).toBe(null);
        expect(errors).toEqual([]);
        expect(plan).toEqual([{operation: 'resizeEdgeZone', edgeZoneId: 'root', edge: 'left', extent: 0.11}]);
        expect(applied).toBe(1);

        expect(restored.nodes.root.zones.left.extent, 'the rail is back where it was captured').toBe(0.11);
        expect(DockTopologyDiff.diffDockDocuments(restored, captured).edgeResizes).toEqual([])
    });

    test('a zone the app has since fixed is reported but never planned', () => {
        const captured = railDoc({autoHidden: false}),
              current  = railDoc({autoHidden: true, extent: 0.4, resizable: false});

        // The differ still reports it — document truth does not depend on permission.
        expect(DockTopologyDiff.diffDockDocuments(current, captured).edgeResizes)
            .toEqual([{nodeId: 'root', edge: 'left', from: 0.4, to: 0.11}]);

        // `Operations.resizeEdgeZone` refuses a non-resizable descriptor, and application is
        // fail-closed on the FIRST error — so an unfiltered emit here would not merely skip the
        // rail, it would abort every step after it. Restore never starts throwing over a boundary
        // the app has made fixed.
        const {document: restored} = expectRailVetoedButPlanStillRuns(current, captured);

        expect(restored.nodes.root.zones.left.extent, 'and the live width is left alone').toBe(0.4)
    });

    test('the reverse polarity: a zone the app has since FREED restores its width, not its permission', () => {
        const captured = railDoc({resizable: false}),
              current  = railDoc({extent: 0.4, resizable: true});

        const {deferred, errors, plan, applied, document: restored} =
            DockRestorePlanner.restoreToward(current, captured);

        // The mirror of the arm above, and the one a filter reading the CAPTURED descriptor would
        // get wrong while still passing that one. The executor validates the descriptor it is
        // handed — the live one — so this step is acceptable and must be planned.
        expect(deferred).toBe(false);
        expect(errors).toEqual([]);
        expect(plan).toEqual([{operation: 'resizeEdgeZone', edgeZoneId: 'root', edge: 'left', extent: 0.11}]);
        expect(applied).toBe(1);

        // Geometry restores; policy does not. Returning `resizable: false` here would let a capture
        // re-fix a boundary the app deliberately freed, which is app state rather than user state —
        // the same line the differ draws by refusing to treat `resizable` as a geometry change.
        expect(restored.nodes.root.zones.left.extent).toBe(0.11);
        expect(restored.nodes.root.zones.left.resizable, 'the live permission survives the restore').toBe(true)
    });

    test('an out-of-contract captured extent is vetoed, so one illegal value cannot abort the restore', () => {
        const captured = railDoc({autoHidden: false}),
              current  = railDoc({autoHidden: true, extent: 0.4});

        // `1.5` is contract-illegal: `extent` is a finite number in the OPEN interval (0, 1). The
        // shape gate does not catch it — it validates descriptor resolvability, not the value — and
        // the differ's own bound is `Number.isFinite`, so it is reported truthfully. The executor
        // refuses it, and because application is fail-closed on the FIRST error an emitted step
        // here strands every later one: the auto-hide flip below never runs.
        captured.nodes.root.zones.left.extent = 1.5;

        expect(WorkspaceDocument.computeShapeFingerprint(captured).errors,
            'the shape gate admits it, which is why the planner has to be the one to refuse').toEqual([]);
        expect(DockTopologyDiff.diffDockDocuments(current, captured).edgeResizes,
            'and the differ reports it, because document truth is not contract validity')
            .toEqual([{nodeId: 'root', edge: 'left', from: 0.4, to: 1.5}]);

        const {document: restored} = expectRailVetoedButPlanStillRuns(current, captured);

        expect(restored.nodes.root.zones.left.extent, 'the live width is untouched by an illegal capture').toBe(0.4)
    });

    test('center is never planned: the executor refuses it, so the planner must not offer it', () => {
        const captured = railDoc({autoHidden: false}),
              current  = railDoc({autoHidden: true});

        current.nodes.root.zones.center.extent  = 0.9;
        captured.nodes.root.zones.center.extent = 0.5;
        // resizable on center is meaningless to the executor; set it to prove the edge test, not the
        // permission test, is what excludes center.
        current.nodes.root.zones.center.resizable = true;

        expect(DockTopologyDiff.diffDockDocuments(current, captured).edgeResizes,
            'the differ reports document truth').toEqual([{nodeId: 'root', edge: 'center', from: 0.9, to: 0.5}]);

        expectRailVetoedButPlanStillRuns(current, captured)
    });

    test('an unchanged rail plans nothing: restore plans stay minimal', () => {
        const {plan, errors} = DockRestorePlanner.restoreToward(railDoc(), railDoc());

        expect(errors).toEqual([]);
        expect(plan, 'a no-op step is a spurious commit').toEqual([])
    })
});

/**
 * A split-rooted document whose side pane can carry the flags and whose split can carry the sizes
 * these arms need. Separate from `doc()` because that fixture pins sizes and declares no item flags,
 * and the whole point here is a capture whose VALUES the document contract accepts.
 * @param {Object} [config]
 * @returns {Object}
 */
function flagDoc({sizes = [0.6, 0.4], autoHidden = false, pinnable, activeItemId = 'strategy'} = {}) {
    const terminal = {reference: 'terminal', title: 'Terminal', autoHidden};

    if (pinnable !== undefined) { terminal.pinnable = pinnable }

    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy: {reference: 'strategy', title: 'Strategy'},
            swarm   : {reference: 'swarm',    title: 'Swarm'},
            terminal
        },
        nodes: {
            root       : {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes},
            'main-tabs': {type: 'tabs', items: ['strategy', 'swarm'], activeItemId},
            'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/**
 * The unrelated valid step each arm carries, chosen by PLAN POSITION — the planner orders
 * `activeItems → resizes → edgeResizes → autoHideFlips`, so which survivor is honest depends on
 * where the refused step sits.
 */
const SURVIVOR = {
    /**
     * Downstream of `resizes`. This is the step a refused resize actually STRANDS, which is the
     * harm — an upstream survivor would have applied before the executor ever reached the bad step
     * and would prove only that the step was filtered, never that nothing was stranded.
     */
    afterResizes: {
        step : {operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true},
        read : document => document.items.terminal.autoHidden,
        value: true
    },
    /**
     * Upstream. `autoHideFlips` is the LAST category, so a refused flip strands nothing behind it
     * and no downstream survivor exists to offer; the harm there is the reported error plus the
     * unapplied flip. Recorded here rather than left as an unexplained difference between the two
     * arm families.
     */
    beforeValues: {
        step : {operation: 'setActiveItem', tabsNodeId: 'main-tabs', itemId: 'swarm'},
        read : document => document.nodes['main-tabs'].activeItemId,
        value: 'swarm'
    }
};

/**
 * @summary Asserts an unusable step is skipped WITHOUT taking the rest of the plan with it.
 *
 * The defect these arms exist for is not a wrong value — it is `applied: 0` on a restore that
 * reported no error worth acting on, because `applyRestorePlan` is fail-closed and one refused step
 * strands every later one. So each case carries a second, unrelated pending change and asserts the
 * plan is exactly that step: the unusable one absent, the valid one present AND applied. Asserting
 * only that the unusable field is untouched would pass on a planner that emitted nothing at all.
 * @param {Object} current
 * @param {Object} captured
 * @param {Object} survivor One of {@link SURVIVOR}
 * @returns {Object} the restore receipt, for per-case assertions
 */
function expectSkippedButPlanStillRuns(current, captured, survivor) {
    const receipt = DockRestorePlanner.restoreToward(current, captured);

    expect(receipt.deferred).toBe(false);
    expect(receipt.errors, 'a skipped step is never a restore error').toEqual([]);
    expect(receipt.plan, 'exactly the unrelated valid step — and NOT an empty plan').toEqual([survivor.step]);
    expect(receipt.applied, 'the valid step still ran').toBe(1);
    expect(survivor.read(receipt.document), 'and its effect reached the document').toBe(survivor.value);

    return receipt
}

test.describe('DockRestorePlanner — steps the executor would refuse (#18585)', () => {
    test('a split size the CONTRACT accepts and the reducer refuses is skipped, not planned', () => {
        // `[0, 1]` sums to 1 and matches the children count, so `WorkspaceDocument.validate` accepts
        // it — the document is legal. `normalizeSplitSizes` additionally requires every element > 0,
        // so `resizeSplit` refuses it. The two are different sets and this capture sits between them.
        const captured = flagDoc({sizes: [0, 1],     autoHidden: true}),
              current  = flagDoc({sizes: [0.6, 0.4], autoHidden: false});

        expect(WorkspaceDocument.validate(captured),
            'the premise: the document contract accepts this capture').toEqual([]);
        expect(DockTopologyDiff.diffDockDocuments(current, captured).resizes,
            'and the differ reports it, because document truth is not reducer acceptance')
            .toEqual([{nodeId: 'root', fromSizes: [0.6, 0.4], toSizes: [0, 1]}]);

        const {document: restored} = expectSkippedButPlanStillRuns(current, captured, SURVIVOR.afterResizes);

        expect(restored.nodes.root.sizes, 'the live split is left where it was').toEqual([0.6, 0.4])
    });

    test('a non-finite element is skipped, and the arm sees finiteness rather than positivity', () => {
        // `Infinity > 0` holds, so a planner checking positivity alone would emit this step and the
        // executor would refuse it. `NaN` cannot make that distinction: it fails `> 0` as well.
        const captured = flagDoc({sizes: [Number.POSITIVE_INFINITY, 1], autoHidden: true}),
              current  = flagDoc({sizes: [0.6, 0.4],                    autoHidden: false});

        expectSkippedButPlanStillRuns(current, captured, SURVIVOR.afterResizes);
    });

    test('a size count that does not match the live split is skipped', () => {
        // `[1]` passes every per-element check — finite, positive — and the reducer refuses it on
        // count against the split's children. The count is read from the LIVE split; the shape gate
        // upstream is what guarantees it equals the capture's.
        const captured = flagDoc({sizes: [1],        autoHidden: true}),
              current  = flagDoc({sizes: [0.6, 0.4], autoHidden: false});

        expect(DockTopologyDiff.diffDockDocuments(current, captured).resizes, 'the differ reports the length change as a resize')
            .toEqual([{nodeId: 'root', fromSizes: [0.6, 0.4], toSizes: [1]}]);

        expectSkippedButPlanStillRuns(current, captured, SURVIVOR.afterResizes);
    });

    test('finite positive elements whose total overflows are skipped: the sum is the reducer\'s own clause', () => {
        // Each element passes finiteness and positivity on its own; their sum is `Infinity`, which
        // `normalizeSplitSizes` refuses. A mirror of the per-element checks alone emits this step.
        const captured = flagDoc({sizes: [Number.MAX_VALUE, Number.MAX_VALUE], autoHidden: true}),
              current  = flagDoc({sizes: [0.6, 0.4],                           autoHidden: false});

        expectSkippedButPlanStillRuns(current, captured, SURVIVOR.afterResizes);
    });

    test('an auto-hide the reducer refuses is skipped: unpinnable panes keep their live visibility', () => {
        // `validate` requires `autoHidden` to be a boolean and says nothing about `pinnable`, so a
        // pane declared `pinnable: false, autoHidden: true` is a legal document. `setItemAutoHidden`
        // refuses to auto-hide a non-pinnable item, which is the second divergence, not the same one.
        const captured = flagDoc({autoHidden: true,  pinnable: false, activeItemId: 'swarm'}),
              current  = flagDoc({autoHidden: false, pinnable: false});

        expect(WorkspaceDocument.validate(captured), 'legal document, refused step').toEqual([]);
        expect(DockTopologyDiff.diffDockDocuments(current, captured).autoHideFlips)
            .toEqual([{itemId: 'terminal', from: false, to: true}]);

        const {document: restored} = expectSkippedButPlanStillRuns(current, captured, SURVIVOR.beforeValues);

        expect(restored.items.terminal.autoHidden, 'the pane stays visible rather than aborting the restore').toBe(false)
    });

    test('a pinned pane is not auto-hidden either, and that refusal is the reducer\'s own', () => {
        const captured = flagDoc({autoHidden: true, activeItemId: 'swarm'}),
              current  = flagDoc({autoHidden: false});

        captured.items.terminal.pinned = true;
        current.items.terminal.pinned  = true;

        expectSkippedButPlanStillRuns(current, captured, SURVIVOR.beforeValues);
    });

    test('the inverse halves: a legal size and a legal auto-hide still plan and apply', () => {
        // The control that makes every arm above mean something. Same fixtures, values inside both
        // the contract AND the reducer's domain: the steps must be planned, not filtered.
        const sized = DockRestorePlanner.restoreToward(flagDoc({sizes: [0.6, 0.4]}), flagDoc({sizes: [0.25, 0.75]}));

        expect(sized.errors).toEqual([]);
        expect(sized.plan).toEqual([{operation: 'resizeSplit', splitNodeId: 'root', sizes: [0.25, 0.75]}]);
        expect(sized.applied).toBe(1);
        expect(sized.document.nodes.root.sizes).toEqual([0.25, 0.75]);

        const hidden = DockRestorePlanner.restoreToward(flagDoc({autoHidden: false}), flagDoc({autoHidden: true}));

        expect(hidden.errors).toEqual([]);
        expect(hidden.plan).toEqual([{operation: 'setItemAutoHidden', itemId: 'terminal', autoHidden: true}]);
        expect(hidden.applied).toBe(1);
        expect(hidden.document.items.terminal.autoHidden).toBe(true)
    });

    test('un-hiding an unpinnable pane is skipped too: the reducer refuses BOTH directions', () => {
        // Not symmetry for its own sake — `setItemAutoHidden` gates on `pinnable` before it looks at
        // the value, so `autoHidden: false` is refused for an unpinnable item exactly as `true` is. A
        // filter written as `!(to && …)` alone would let this one through and abort the restore.
        const captured = flagDoc({autoHidden: false, pinnable: false, activeItemId: 'swarm'}),
              current  = flagDoc({autoHidden: true,  pinnable: false});

        expect(DockTopologyDiff.diffDockDocuments(current, captured).autoHideFlips)
            .toEqual([{itemId: 'terminal', from: true, to: false}]);

        expectSkippedButPlanStillRuns(current, captured, SURVIVOR.beforeValues);
    })
});
