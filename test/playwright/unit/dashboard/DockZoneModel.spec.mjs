import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockZoneModelTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DockWorkspace      from '../../../../src/dashboard/dock/Workspace.mjs';
import Document           from '../../../../src/dashboard/dock/model/Document.mjs';
import LayoutAdapter      from '../../../../src/dashboard/dock/projection/LayoutAdapter.mjs';
import Operations         from '../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence        from '../../../../src/dashboard/dock/model/Persistence.mjs';
import PerspectiveLibrary from '../../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import MainContainer      from '../../../../examples/dashboard/dock/MainContainer.mjs';
import Toolbar            from '../../../../src/toolbar/Base.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Tests for Neo.dashboard.dock.model.Document — the dock-zone semantic operations executor.
 * Primarily pure JSON: validity invariants, each operation, fail-closed behavior, normalizeTree
 * collapse, and the previewToOperation descriptor seam. The standalone-example block additionally
 * mounts its persistent toolbar to pin identity reconciliation over collection mutations.
 */

/**
 * A fresh canonical dockZone.v1 document. `inspector` is a catalog-only item (not yet in the tree),
 * used to exercise insert/split of a brand-new pane.
 * @returns {Object}
 */
function doc() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            strategy : {componentRef: 'strategy',  title: 'Strategy',  kind: 'panel'},
            swarm    : {componentRef: 'swarm',     title: 'Swarm',     kind: 'panel'},
            terminal : {componentRef: 'terminal',  title: 'Terminal',  kind: 'terminal'},
            inspector: {componentRef: 'inspector', title: 'Inspector', kind: 'inspector'}
        },
        nodes: {
            root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, right: {nodeId: 'side-tabs'}}},
            'main-tabs': {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'swarm'},
            'side-tabs': {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/**
 * A canonical split document with `main-tabs` and `side-tabs` under one split, so size operations
 * do not have to build a split through drag/drop descriptors first.
 * @param {Array<Number>} [sizes=[0.5, 0.5]]
 * @returns {Object}
 */
function splitDoc(sizes=[0.5, 0.5]) {
    const d = doc();

    d.nodes['main-split'] = {
        type       : 'split',
        orientation: 'horizontal',
        children   : ['main-tabs', 'side-tabs'],
        sizes
    };
    d.nodes.root.zones.center.nodeId = 'main-split';
    delete d.nodes.root.zones.right;

    return d
}

/**
 * The final greenfield edge-zone shape: every zone owns its node id together with optional
 * committed extent and resize policy. Kept separate from {@link #doc} until the hard-cut tests
 * prove the nested contract, so the red phase isolates the missing behavior.
 * @returns {Object}
 */
function nestedEdgeDoc() {
    const d = doc();

    d.nodes.root.zones = {
        center: {nodeId: 'main-tabs'},
        right : {nodeId: 'side-tabs', extent: 0.25, resizable: true}
    };

    return d
}

/** Collects the tabs node id holding an item, across a document. */
function tabsOf(document, itemId) {
    return Document.findContainingTabsId(document, itemId)
}

/** Creates a valid saved-layout wrapper for collection tests. */
function savedLayout(layoutId, title=layoutId, mutate=()=>{}) {
    const d = doc();

    mutate(d);

    return Persistence.createSavedLayout(d, {
        layoutId,
        title
    }).layout
}

test.describe('Neo.dashboard.dock.model.Document', () => {
    test.describe('validate (invariants)', () => {
        test('accepts the canonical document', () => {
            expect(Document.validate(doc())).toEqual([])
        });

        test('treats absent lock state as unlocked and rejects non-boolean lock fields', () => {
            const input = doc();

            expect(input.items.strategy.locked).toBeUndefined();
            expect(Document.validate(input)).toEqual([]);

            input.items.strategy.locked = 'true';
            expect(Document.validate(input).join(' ')).toContain('locked must be a boolean');

            input.items.strategy.locked   = false;
            input.items.strategy.lockable = 'false';
            expect(Document.validate(input).join(' ')).toContain('lockable must be a boolean')
        });

        test('rejects a wrong schema', () => {
            const d = doc();
            d.schema = 'neo.dock.zone.v2';
            expect(Document.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects a missing root', () => {
            const d = doc();
            d.root = 'ghost';
            expect(Document.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects a dangling node reference', () => {
            const d = doc();
            d.nodes.root.zones.center.nodeId = 'does-not-exist';
            expect(Document.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects an item used in two tabs nodes', () => {
            const d = doc();
            d.nodes['side-tabs'].items.push('strategy'); // strategy now in main-tabs AND side-tabs
            expect(Document.validate(d).join(' ')).toContain('strategy');
            expect(Document.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects split sizes that mismatch or do not sum to 1', () => {
            const d = doc();
            d.nodes.split = {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5]};
            d.nodes.root.zones.center.nodeId = 'split';
            delete d.nodes.root.zones.right;
            expect(Document.validate(d).length).toBeGreaterThan(0);

            d.nodes.split.sizes = [0.5, 0.9];
            expect(Document.validate(d).join(' ')).toContain('sum to 1')
        });

        test('rejects an activeItemId not among the tab items', () => {
            const d = doc();
            d.nodes['main-tabs'].activeItemId = 'terminal';
            expect(Document.validate(d).length).toBeGreaterThan(0)
        });

        test('accepts nested edge descriptors and rejects the retired string form', () => {
            expect(Document.validate(nestedEdgeDoc())).toEqual([]);

            const legacy = doc();

            legacy.nodes.root.zones = {center: 'main-tabs', right: 'side-tabs'};

            expect(Document.validate(legacy).join('\n')).toContain('descriptor')
        });

        test('rejects malformed nested edge descriptor state', () => {
            const missingNodeId = nestedEdgeDoc(),
                invalidExtent   = nestedEdgeDoc(),
                invalidPolicy   = nestedEdgeDoc();

            delete missingNodeId.nodes.root.zones.right.nodeId;
            invalidExtent.nodes.root.zones.right.extent    = 1;
            invalidPolicy.nodes.root.zones.right.resizable = 'yes';

            expect(Document.validate(missingNodeId).join('\n')).toContain('nodeId');
            expect(Document.validate(invalidExtent).join('\n')).toContain('extent');
            expect(Document.validate(invalidPolicy).join('\n')).toContain('resizable')
        })
    });

    test.describe('saved layout persistence', () => {
        test('creates and restores a versioned saved-layout wrapper', () => {
            const {layout, errors} = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default',
                revision: 3,
                metadata: {
                    workspace: 'agent-harness'
                }
            });

            expect(errors).toEqual([]);
            expect(layout.schema).toBe(Persistence.LAYOUT_SCHEMA);
            expect(layout.layoutId).toBe('operator-default');
            expect(layout.title).toBe('Operator Default');
            expect(layout.revision).toBe(3);
            expect(layout.metadata.workspace).toBe('agent-harness');
            expect(layout.dockZone.schema).toBe(Document.SCHEMA);
            expect(Document.validate(layout.dockZone)).toEqual([]);

            const restored = Persistence.restoreSavedLayout(layout);

            expect(restored.errors).toEqual([]);
            expect(restored.document).toEqual(layout.dockZone);
            expect(restored.document).not.toBe(layout.dockZone)
        });

        test('round-trips committed lock state and policy through a perspective', () => {
            const input = doc();

            input.items.strategy.locked   = true;
            input.items.strategy.lockable = false;

            const {layout, errors} = Persistence.createSavedLayout(input, {
                layoutId: 'locked-workspace',
                title   : 'Locked Workspace'
            });

            expect(errors).toEqual([]);
            expect(layout.dockZone.items.strategy).toMatchObject({locked: true, lockable: false});

            const restored = Persistence.restoreSavedLayout(layout);

            expect(restored.errors).toEqual([]);
            expect(restored.document.items.strategy).toMatchObject({locked: true, lockable: false})
        });

        test('fails closed for unsupported wrapper schema', () => {
            const {layout} = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            layout.schema = 'neo.dock.layout.v2';

            const {document, errors} = Persistence.restoreSavedLayout(layout);

            expect(document).toBe(null);
            expect(errors.join(' ')).toContain(Persistence.LAYOUT_SCHEMA)
        });

        test('the retired neo.harness.* family is rejected fail-closed — no migration reader survives', () => {
            const {layout} = Persistence.createSavedLayout(doc(), {
                layoutId: 'legacy',
                title   : 'Legacy Layout'
            });

            // a stored-era old-family record: pre-greenfield schema tag, no perspective fields.
            // This control proves FAMILY deletion, not just version rejection: the string is a
            // well-formed old-family identity, and it must fail on schema — never fail-open
            // through a compatibility parser.
            // split literal on purpose: this is the ONE place the retired family name must keep
            // existing verbatim, immune to any future rename sweep over whole schema strings.
            const oldFamily = ['neo', 'harness', 'dockLayout', 'v1'].join('.');
            const legacy    = {...layout, schema: oldFamily};
            delete legacy.captureScope;
            delete legacy.windowFingerprint;

            const restored = Persistence.restoreSavedLayout(legacy);

            expect(restored.document).toBe(null);
            expect(restored.errors.join(' ')).toContain(Persistence.LAYOUT_SCHEMA);
            // the input record is never mutated by rejection
            expect(legacy.schema).toBe(oldFamily);
            expect('captureScope' in legacy).toBe(false)
        });

        test('round-trips the v2 perspective fields (topology scope, fingerprint, name)', () => {
            const {layout, errors} = Persistence.createSavedLayout(doc(), {
                layoutId         : 'focus',
                title            : 'Focus',
                captureScope     : 'topology',
                windowFingerprint: {windows: 2, splits: [2, 1]},
                perspectiveName  : 'Focus Mode'
            });

            expect(errors).toEqual([]);
            expect(layout.captureScope).toBe('topology');
            expect(layout.windowFingerprint).toEqual({windows: 2, splits: [2, 1]});
            expect(layout.perspectiveName).toBe('Focus Mode');
            expect(Persistence.restoreSavedLayout(layout).errors).toEqual([])
        });

        test('capturePerspective emits a v2 window-scope record with a shape-only fingerprint', () => {
            const {layout, errors} = Persistence.capturePerspective(doc(), {
                layoutId       : 'capture-1',
                title          : 'Capture One',
                perspectiveName: 'Morning Focus'
            });

            expect(errors).toEqual([]);
            expect(layout.schema).toBe(Persistence.LAYOUT_SCHEMA);
            expect(layout.captureScope).toBe('window');
            expect(layout.perspectiveName).toBe('Morning Focus');
            expect(layout.windowFingerprint.schema).toBe('neo.dock.shape.v1');
            expect(typeof layout.windowFingerprint.shape).toBe('string');
            expect(layout.windowFingerprint.itemCount).toBeGreaterThan(0);
            expect(Persistence.restoreSavedLayout(layout).errors).toEqual([])
        });

        test('stored fingerprint matches the PERSISTED document, not the pre-normalized input (single-child split collapse)', () => {
            // a split with one child normalizes away — the persisted root becomes the child tabs
            const d = splitDoc();
            d.nodes['main-split'].children = ['main-tabs'];
            d.nodes['main-split'].sizes    = [1];
            delete d.nodes['side-tabs'];
            delete d.items.terminal;

            const {layout, errors} = Persistence.capturePerspective(d, {layoutId: 'c', title: 'C'});

            expect(errors).toEqual([]);
            // the stored fingerprint must equal the persisted tree's fingerprint by construction…
            expect(layout.windowFingerprint)
                .toEqual(Document.computeShapeFingerprint(layout.dockZone).fingerprint);
            // …and must NOT carry the collapsed split wrapper the raw input had
            expect(layout.windowFingerprint.shape)
                .not.toBe(Document.computeShapeFingerprint(d).fingerprint.shape);
            expect(layout.windowFingerprint.shape).not.toContain('h(')
        });

        test('cyclic node graphs fail closed through the public return shapes, never a throw', () => {
            const cyclic = doc();
            cyclic.nodes['loop-split'] = {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'loop-split'], sizes: [0.5, 0.5]};
            cyclic.nodes.root.zones.center.nodeId = 'loop-split';

            const direct = Document.computeShapeFingerprint(cyclic);
            expect(direct.fingerprint).toBe(null);
            expect(direct.errors.join(' ')).toContain('cycle');

            const captured = Persistence.capturePerspective(cyclic, {layoutId: 'x', title: 'X'});
            expect(captured.layout).toBe(null);
            expect(captured.errors.length).toBeGreaterThan(0)
        });

        test('shape fingerprints are deterministic, id-free and shape-sensitive', () => {
            const a = Document.computeShapeFingerprint(doc()),
                  b = Document.computeShapeFingerprint(doc());

            expect(a.errors).toEqual([]);
            expect(a.fingerprint).toEqual(b.fingerprint);

            // rename every node id — the shape must not change (id-freedom)
            const renamed = JSON.parse(JSON.stringify(doc()).replaceAll('main-tabs', 'renamed-tabs'));
            expect(Document.computeShapeFingerprint(renamed).fingerprint.shape).toBe(a.fingerprint.shape);

            // structural change → different shape term
            const mutated = doc();
            mutated.nodes['main-tabs'].items.push('extra-item');
            expect(Document.computeShapeFingerprint(mutated).fingerprint.shape).not.toBe(a.fingerprint.shape)
        });

        test('topology fingerprints compose per-window terms in slot order and fail closed on bad input', () => {
            const single = Document.computeShapeFingerprint(doc()).fingerprint;

            const two = Document.composeTopologyFingerprint([single, single]);
            expect(two.errors).toEqual([]);
            expect(two.fingerprint.schema).toBe('neo.dock.topologyShape.v1');
            expect(two.fingerprint.windowCount).toBe(2);
            expect(two.fingerprint.shape).toBe(`w[${single.shape}|${single.shape}]`);
            expect(two.fingerprint.totalItems).toBe(single.itemCount * 2);

            // slot order IS meaning: reversed input must produce a different term when shapes differ
            const mutated = doc();
            mutated.nodes['main-tabs'].items.push('extra-item');
            const other = Document.computeShapeFingerprint(mutated).fingerprint;
            expect(Document.composeTopologyFingerprint([single, other]).fingerprint.shape)
                .not.toBe(Document.composeTopologyFingerprint([other, single]).fingerprint.shape);

            // degenerate single-window composition wraps the same term
            expect(Document.composeTopologyFingerprint([single]).fingerprint.shape).toBe(`w[${single.shape}]`);

            // fail-closed: empty list + non-fingerprint entry
            expect(Document.composeTopologyFingerprint([]).fingerprint).toBe(null);
            const bad = Document.composeTopologyFingerprint([single, {shape: 42}]);
            expect(bad.fingerprint).toBe(null);
            expect(bad.errors.join(' ')).toContain('entry 1')
        });

        test('topology composition rejects incomplete window fingerprints — a missing itemCount never fakes a zero', () => {
            // right schema, right shape, NO itemCount: must fail closed, never compose totalItems: 0
            const incomplete = Document.composeTopologyFingerprint([{schema: 'neo.dock.shape.v1', shape: 't1'}]);
            expect(incomplete.fingerprint).toBe(null);
            expect(incomplete.errors.join(' ')).toContain('entry 0');
            expect(incomplete.errors.join(' ')).toContain('incomplete');

            // malformed counts are rejected the same way, with the offending slot indexed
            const single = Document.computeShapeFingerprint(doc()).fingerprint;

            for (const itemCount of [NaN, -1, 1.5, '3']) {
                const malformed = Document.composeTopologyFingerprint([single, {...single, itemCount}]);
                expect(malformed.fingerprint).toBe(null);
                expect(malformed.errors.join(' ')).toContain('entry 1')
            }
        });

        test('captureTopologyPerspective: multi-window round-trip with slot-ordered windowDocuments', () => {
            const second = doc();
            second.nodes['main-tabs'].items.push('inspector');

            const {layout, errors} = Persistence.captureTopologyPerspective([doc(), second], {
                layoutId       : 'fleet',
                title          : 'Fleet',
                perspectiveName: 'Fleet View'
            });

            expect(errors).toEqual([]);
            expect(layout.captureScope).toBe('topology');
            expect(layout.windowFingerprint.schema).toBe('neo.dock.topologyShape.v1');
            expect(layout.windowFingerprint.windowCount).toBe(2);
            expect(layout.windowDocuments.length).toBe(1);
            expect(Document.validate(layout.windowDocuments[0])).toEqual([]);
            expect(Persistence.restoreSavedLayout(layout).errors).toEqual([])
        });

        test('degenerate single-document topology capture equals a window-scope capture modulo scope + fingerprint schema', () => {
            const topo = Persistence.captureTopologyPerspective([doc()], {layoutId: 'solo', title: 'Solo'}).layout,
                  win  = Persistence.capturePerspective(doc(), {layoutId: 'solo', title: 'Solo'}).layout;

            expect('windowDocuments' in topo).toBe(false);
            expect(topo.dockZone).toEqual(win.dockZone);
            expect(topo.windowFingerprint.shape).toBe(`w[${win.windowFingerprint.shape}]`);
            expect(topo.captureScope).toBe('topology');
            expect(win.captureScope).toBe('window')
        });

        test('topology fingerprint derives from the PERSISTED slot trees (collapsing-slot coherence)', () => {
            // second window: a single-child split that normalizeTree collapses — the stored slot
            // is the collapsed tree, and the composed fingerprint must describe THAT, not the input
            const collapsing = splitDoc();
            collapsing.nodes['main-split'].children = ['main-tabs'];
            collapsing.nodes['main-split'].sizes    = [1];
            delete collapsing.nodes['side-tabs'];
            delete collapsing.items.terminal;

            const {layout, errors} = Persistence.captureTopologyPerspective([doc(), collapsing], {layoutId: 't', title: 'T'});

            expect(errors).toEqual([]);
            const slotTerm = Document.computeShapeFingerprint(layout.windowDocuments[0]).fingerprint.shape;
            expect(layout.windowFingerprint.shape).toContain(slotTerm);
            expect(layout.windowFingerprint.shape).not.toContain('h(');
            expect(slotTerm.startsWith('h(')).toBe(false)
        });

        test('windowDocuments fails closed on window-scope records and on invalid slot trees', () => {
            const base = Persistence.capturePerspective(doc(), {layoutId: 'x', title: 'X'}).layout;

            const smuggled = {...base, windowDocuments: [doc()]};
            expect(Persistence.restoreSavedLayout(smuggled).errors.join(' '))
                .toContain('only valid on captureScope "topology"');

            const badTree = doc();
            badTree.root = 'ghost';
            const {layout, errors} = Persistence.captureTopologyPerspective([doc(), badTree], {layoutId: 'x', title: 'X'});
            expect(layout).toBe(null);
            expect(errors.join(' ')).toContain('documents[1]')
        });

        test('windowDocuments slots enforce the SAME finite durable-field boundary as the primary document', () => {
            const {layout} = Persistence.captureTopologyPerspective([doc(), doc()], {layoutId: 'x', title: 'X'});

            // A runtime-bearing field on an ADDITIONAL slot must fail exactly like it would on
            // `dockZone` — document-level and item-level offenders both, index preserved.
            const slot     = layout.windowDocuments[0],
                  poisoned = {...layout, windowDocuments: [{...slot, runtimeRect: {x: 0, y: 0}}]},
                  topLevel = Persistence.restoreSavedLayout(poisoned).errors.join(' ');

            expect(topLevel).toContain('windowDocuments[0]');
            expect(topLevel).toContain('runtimeRect');

            const [itemId]  = Object.keys(slot.items),
                  badItems  = {...slot, items: {[itemId]: {...slot.items[itemId], windowId: 'w2'}}},
                  itemLevel = Persistence.restoreSavedLayout({...layout, windowDocuments: [badItems]}).errors.join(' ');

            expect(itemLevel).toContain(`windowDocuments[0].items.${itemId}`);
            expect(itemLevel).toContain('windowId')
        });

        test('fingerprint walk fails closed on dangling node refs', () => {
            const broken = doc();
            broken.root = 'missing-node';

            const {fingerprint, errors} = Document.computeShapeFingerprint(broken);

            expect(fingerprint).toBe(null);
            expect(errors.join(' ')).toContain('missing-node')
        });

        test('fails closed on perspective-field contract violations', () => {
            const badScope = Persistence.createSavedLayout(doc(), {layoutId: 'x', title: 'X', captureScope: 'galaxy'});
            expect(badScope.layout).toBe(null);
            expect(badScope.errors.join(' ')).toContain('captureScope');

            const badPrint = Persistence.createSavedLayout(doc(), {layoutId: 'x', title: 'X', windowFingerprint: 'w1'});
            expect(badPrint.layout).toBe(null);
            expect(badPrint.errors.join(' ')).toContain('windowFingerprint');

            const badName = Persistence.createSavedLayout(doc(), {layoutId: 'x', title: 'X', perspectiveName: '  '});
            expect(badName.layout).toBe(null);
            expect(badName.errors.join(' ')).toContain('perspectiveName')
        });

        test('fails closed for malformed wrapper identity fields', () => {
            const created = Persistence.createSavedLayout(doc(), {
                layoutId: '',
                title   : 'Operator Default'
            });

            expect(created.layout).toBe(null);
            expect(created.errors.join(' ')).toContain('layoutId');

            const restored = Persistence.restoreSavedLayout({
                schema  : Persistence.LAYOUT_SCHEMA,
                layoutId: 'operator-default',
                title   : '',
                dockZone: doc(),
                metadata: []
            });

            expect(restored.document).toBe(null);
            expect(restored.errors.join(' ')).toContain('title');
            expect(restored.errors.join(' ')).toContain('metadata')
        });

        test('fails closed for an invalid dock-zone document', () => {
            const {layout} = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            layout.dockZone.nodes.root.zones.center.nodeId = 'missing-tabs';

            const {document, errors} = Persistence.restoreSavedLayout(layout);

            expect(document).toBe(null);
            expect(errors.join(' ')).toContain('missing-tabs')
        });

        test('rejects fields outside the saved-layout schema before save or restore', () => {
            const input = doc();

            input.items.strategy.dockPreview = {
                dockPreview: {placement: 'split-after'}
            };

            const saved = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            expect(saved.layout).toBe(null);
            expect(saved.errors.join(' ')).toContain('dockPreview');

            const {layout} = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            layout.windowId = 7;

            const restored = Persistence.restoreSavedLayout(layout);

            expect(restored.document).toBe(null);
            expect(restored.errors.join(' ')).toContain('windowId')
        });

        test('allows opaque JSON metadata and blueprints only through explicit extension fields', () => {
            const input = doc();

            input.items.strategy.metadata = {
                ownerTag: 'operator-note'
            };
            input.items.strategy.blueprint = {
                ntype: 'container',
                text : 'Strategy'
            };
            input.items.strategy.pinned = true;

            const {layout, errors} = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default',
                metadata: {
                    operatorNote: 'non-secret annotation'
                }
            });

            expect(errors).toEqual([]);
            expect(layout.metadata.operatorNote).toBe('non-secret annotation');
            expect(layout.dockZone.items.strategy.metadata.ownerTag).toBe('operator-note');
            expect(layout.dockZone.items.strategy.blueprint.ntype).toBe('container');
            expect(layout.dockZone.items.strategy.pinned).toBe(true);

            input.items.strategy.windowId = 42;

            const rejected = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            expect(rejected.layout).toBe(null);
            expect(rejected.errors.join(' ')).toContain('windowId')
        });

        test('rejects secret-like saved-layout metadata keys on save or restore', () => {
            for (const key of ['apiKey', 'sessionKey', 'authKey']) {
                const metadata = {[key]: 'secret-value'},
                      saved    = Persistence.createSavedLayout(doc(), {
                          layoutId: 'operator-default',
                          title   : 'Operator Default',
                          metadata
                      });

                expect(saved.layout).toBe(null);
                expect(saved.errors.join(' ')).toContain(key);
                expect(metadata[key]).toBe('secret-value')
            }

            const nested = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default',
                metadata: {
                    operatorNote: {
                        apiToken: 'secret-value'
                    }
                }
            });

            expect(nested.layout).toBe(null);
            expect(nested.errors.join(' ')).toContain('apiToken');

            const {layout} = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default',
                metadata: {
                    operatorNote: 'non-secret annotation'
                }
            });

            layout.metadata = {
                recovery: {
                    authKey: 'secret-value'
                }
            };

            const restored = Persistence.restoreSavedLayout(layout);

            expect(restored.document).toBe(null);
            expect(restored.errors.join(' ')).toContain('authKey')
        });

        test('rejects non-boolean pinned or autoHidden state on save or restore', () => {
            const input = doc();

            input.items.strategy.pinned = 'yes';
            input.items.terminal.autoHidden = 'yes';

            const saved = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            expect(saved.layout).toBe(null);
            expect(saved.errors.join(' ')).toContain('pinned');
            expect(saved.errors.join(' ')).toContain('autoHidden');

            const savedLayout = {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId         : 'operator-default',
                title            : 'Operator Default',
                dockZone         : doc(),
                metadata         : {},
                captureScope     : 'window',
                windowFingerprint: null
            };

            savedLayout.dockZone.items.strategy.pinned = 'yes';
            savedLayout.dockZone.items.terminal.autoHidden = 'yes';

            const restored = Persistence.restoreSavedLayout(savedLayout);

            expect(restored.document).toBe(null);
            expect(restored.errors.join(' ')).toContain('pinned');
            expect(restored.errors.join(' ')).toContain('autoHidden')
        });

        test('rejects saved layouts that pin an auto-hidden item open', () => {
            const input = doc();

            input.items.terminal.pinned = true;
            input.items.terminal.autoHidden = true;

            const saved = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            expect(saved.layout).toBe(null);
            expect(saved.errors.join(' ')).toContain('cannot be pinned and autoHidden');

            const savedLayout = {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId         : 'operator-default',
                title            : 'Operator Default',
                dockZone         : doc(),
                metadata         : {},
                captureScope     : 'window',
                windowFingerprint: null
            };

            savedLayout.dockZone.items.terminal.pinned = true;
            savedLayout.dockZone.items.terminal.autoHidden = true;

            const restored = Persistence.restoreSavedLayout(savedLayout);

            expect(restored.document).toBe(null);
            expect(restored.errors.join(' ')).toContain('cannot be pinned and autoHidden')
        });

        test('rejects non-JSON values in metadata and item blueprints', () => {
            const badMetadata = Persistence.createSavedLayout(doc(), {
                layoutId: 'operator-default',
                title   : 'Operator Default',
                metadata: {
                    onRestore: () => {}
                }
            });

            expect(badMetadata.layout).toBe(null);
            expect(badMetadata.errors.join(' ')).toContain('JSON-only');

            const input = doc();

            input.items.strategy.blueprint = {
                ntype    : 'container',
                listeners: {
                    click: () => {}
                }
            };

            const badBlueprint = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default'
            });

            expect(badBlueprint.layout).toBe(null);
            expect(badBlueprint.errors.join(' ')).toContain('listeners')
        });

        test('does not mutate caller input or expose caller-owned nested objects', () => {
            const input = doc(),
                  meta  = {workspace: 'agent-harness'};

            input.nodes.split = {
                type       : 'split',
                orientation: 'horizontal',
                children   : ['main-tabs', 'side-tabs'],
                sizes      : [0.2, 0.8]
            };
            input.nodes.root.zones.center.nodeId = 'split';
            delete input.nodes.root.zones.right;

            const snapshot         = JSON.stringify(input),
                  {layout, errors} = Persistence.createSavedLayout(input, {
                      layoutId: 'operator-default',
                      title   : 'Operator Default',
                      metadata: meta
                  });

            expect(errors).toEqual([]);
            expect(JSON.stringify(input)).toBe(snapshot);

            meta.workspace = 'mutated-by-caller';
            input.items.strategy.title = 'Caller Mutated Strategy';
            layout.metadata.workspace = 'mutated-layout';
            layout.dockZone.nodes.split.sizes[0] = 0.4;

            expect(layout.metadata.workspace).toBe('mutated-layout');
            expect(layout.dockZone.nodes.split.sizes[0]).toBe(0.4);

            const {layout: freshLayout} = Persistence.createSavedLayout(input, {
                layoutId: 'operator-default',
                title   : 'Operator Default',
                metadata: meta
            });

            expect(freshLayout.metadata.workspace).toBe('mutated-by-caller');
            expect(freshLayout.dockZone.items.strategy.title).toBe('Caller Mutated Strategy')
        })
    });

    test.describe('named saved-layout collections', () => {
        test('creates and validates a versioned collection from valid saved layouts', () => {
            const operator = savedLayout('operator-default', 'Operator Default'),
                  review   = savedLayout('review-layout', 'Review Layout', d => {
                      d.nodes['main-tabs'].activeItemId = 'strategy'
                  }),
                  {collection, errors} = PerspectiveLibrary.createSavedLayoutCollection([operator, review], {
                      activeLayoutId: 'review-layout',
                      revision      : 2,
                      metadata      : {
                          workspace: 'agent-harness'
                      }
                  });

            expect(errors).toEqual([]);
            expect(collection.schema).toBe(PerspectiveLibrary.LAYOUT_COLLECTION_SCHEMA);
            expect(collection.activeLayoutId).toBe('review-layout');
            expect(collection.revision).toBe(2);
            expect(collection.metadata.workspace).toBe('agent-harness');
            expect(Object.keys(collection.layouts)).toEqual(['operator-default', 'review-layout']);
            expect(PerspectiveLibrary.validateSavedLayoutCollection(collection)).toEqual([]);

            operator.title = 'Mutated By Caller';
            expect(collection.layouts['operator-default'].title).toBe('Operator Default');
            expect(collection.layouts['operator-default']).not.toBe(operator)
        });

        test('rejects wrong collection schema and mismatched layout keys', () => {
            const operator = savedLayout('operator-default', 'Operator Default'),
                  created  = PerspectiveLibrary.createSavedLayoutCollection([operator]);

            expect(created.errors).toEqual([]);

            const wrongSchema = Document.clone(created.collection);

            wrongSchema.schema = 'neo.dock.layoutCollection.v2';

            expect(PerspectiveLibrary.validateSavedLayoutCollection(wrongSchema).join(' ')).toContain(PerspectiveLibrary.LAYOUT_COLLECTION_SCHEMA);
            expect(PerspectiveLibrary.restoreActiveSavedLayout(wrongSchema).document).toBe(null);

            const mismatched = Document.clone(created.collection);

            mismatched.layouts.alias = mismatched.layouts['operator-default'];
            delete mismatched.layouts['operator-default'];
            mismatched.activeLayoutId = 'alias';

            expect(PerspectiveLibrary.validateSavedLayoutCollection(mismatched).join(' ')).toContain('must match')
        });

        test('upserts layouts by layoutId, clones replacements, and optionally activates them', () => {
            const operator     = savedLayout('operator-default', 'Operator Default'),
                  review       = savedLayout('review-layout', 'Review Layout'),
                  {collection} = PerspectiveLibrary.createSavedLayoutCollection([operator]),
                  updated      = PerspectiveLibrary.upsertSavedLayout(collection, review, {activate: true});

            expect(updated.errors).toEqual([]);
            expect(updated.collection.activeLayoutId).toBe('review-layout');
            expect(updated.collection.layouts['review-layout'].title).toBe('Review Layout');
            expect(collection.layouts['review-layout']).toBeUndefined();

            review.title = 'Mutated Review';
            expect(updated.collection.layouts['review-layout'].title).toBe('Review Layout');

            const invalid = Document.clone(review);

            invalid.dockZone.nodes.root.zones.center.nodeId = 'missing-tabs';

            const rejected = PerspectiveLibrary.upsertSavedLayout(collection, invalid, {activate: true});

            expect(rejected.collection).toBe(collection);
            expect(rejected.errors.join(' ')).toContain('missing-tabs')
        });

        test('selects an existing active layout and fails closed for missing ids', () => {
            const operator     = savedLayout('operator-default', 'Operator Default'),
                  review       = savedLayout('review-layout', 'Review Layout'),
                  {collection} = PerspectiveLibrary.createSavedLayoutCollection([operator, review]),
                  selected     = PerspectiveLibrary.selectSavedLayout(collection, 'review-layout');

            expect(selected.errors).toEqual([]);
            expect(selected.collection.activeLayoutId).toBe('review-layout');
            expect(collection.activeLayoutId).toBe('operator-default');

            const missing = PerspectiveLibrary.selectSavedLayout(collection, 'ghost-layout');

            expect(missing.collection).toBe(collection);
            expect(missing.errors.join(' ')).toContain('ghost-layout')
        });

        test('removes layouts and requires an explicit replacement for the active layout', () => {
            const operator     = savedLayout('operator-default', 'Operator Default'),
                  review       = savedLayout('review-layout', 'Review Layout'),
                  {collection} = PerspectiveLibrary.createSavedLayoutCollection([operator, review]),
                  denied       = PerspectiveLibrary.removeSavedLayout(collection, {layoutId: 'operator-default'});

            expect(denied.collection).toBe(collection);
            expect(denied.errors.join(' ')).toContain('replacementLayoutId');

            const removedActive = PerspectiveLibrary.removeSavedLayout(collection, {
                layoutId           : 'operator-default',
                replacementLayoutId: 'review-layout'
            });

            expect(removedActive.errors).toEqual([]);
            expect(removedActive.collection.activeLayoutId).toBe('review-layout');
            expect(removedActive.collection.layouts['operator-default']).toBeUndefined();

            const removedInactive = PerspectiveLibrary.removeSavedLayout(collection, {layoutId: 'review-layout'});

            expect(removedInactive.errors).toEqual([]);
            expect(removedInactive.collection.activeLayoutId).toBe('operator-default');
            expect(removedInactive.collection.layouts['review-layout']).toBeUndefined()
        });

        test('restores the selected saved layout through the existing restore path', () => {
            const operator = savedLayout('operator-default', 'Operator Default'),
                  review   = savedLayout('review-layout', 'Review Layout', d => {
                      d.nodes['main-tabs'].activeItemId = 'strategy'
                  }),
                  {collection} = PerspectiveLibrary.createSavedLayoutCollection([operator, review], {
                      activeLayoutId: 'review-layout'
                  }),
                  restored = PerspectiveLibrary.restoreActiveSavedLayout(collection);

            expect(restored.errors).toEqual([]);
            expect(restored.document).toEqual(review.dockZone);
            expect(restored.document).not.toBe(review.dockZone);

            const invalid = Document.clone(collection);

            invalid.activeLayoutId = 'ghost-layout';

            const rejected = PerspectiveLibrary.restoreActiveSavedLayout(invalid);

            expect(rejected.document).toBe(null);
            expect(rejected.errors.join(' ')).toContain('ghost-layout')
        });

        test('rejects invalid saved layouts and secret-like collection metadata', () => {
            const operator = savedLayout('operator-default', 'Operator Default'),
                  invalid  = Document.clone(operator);

            invalid.metadata = {
                authKey: 'secret-value'
            };

            const rejectedLayout = PerspectiveLibrary.createSavedLayoutCollection([invalid]);

            expect(rejectedLayout.collection).toBe(null);
            expect(rejectedLayout.errors.join(' ')).toContain('authKey');

            const rejectedCollection = PerspectiveLibrary.createSavedLayoutCollection([operator], {
                metadata: {
                    apiToken: 'secret-value'
                }
            });

            expect(rejectedCollection.collection).toBe(null);
            expect(rejectedCollection.errors.join(' ')).toContain('apiToken')
        })
    });

    test.describe('standalone dock example perspectives', () => {
        let originalLocalStorage;

        function createExampleHarness() {
            const example = {
                createDefaultLayoutCollection  : MainContainer.prototype.createDefaultLayoutCollection,
                createPerspectiveButton        : MainContainer.prototype.createPerspectiveButton,
                createPerspectiveToolbar       : MainContainer.prototype.createPerspectiveToolbar,
                loadLayoutCollectionFromStorage: MainContainer.prototype.loadLayoutCollectionFromStorage,
                nextSavedPerspectiveId         : MainContainer.prototype.nextSavedPerspectiveId,
                persistLayoutCollection        : MainContainer.prototype.persistLayoutCollection,
                removeActivePerspective        : MainContainer.prototype.removeActivePerspective,
                restorePerspective             : MainContainer.prototype.restorePerspective,
                saveCurrentPerspective         : MainContainer.prototype.saveCurrentPerspective,
                syncPerspectiveToolbar         : MainContainer.prototype.syncPerspectiveToolbar,

                layoutCollectionStorageKey: 'test.dashboard.dock.layoutCollection',
                refreshCount              : 0,
                savedPerspectiveCount     : 0,
                windowId                  : 1,

                onDockZoneDocumentChange(document) {
                    this.dockModel     = document;
                    this.refreshPromise = Promise.resolve(this.refreshDockWorkspace())
                },

                refreshDockWorkspace() {
                    this.refreshCount++
                }
            };

            example.layoutCollection = example.createDefaultLayoutCollection();
            example.dockModel        = PerspectiveLibrary.restoreActiveSavedLayout(example.layoutCollection).document;

            return example
        }

        test.beforeEach(() => {
            originalLocalStorage = {...Neo.main.addon.LocalStorage}
        });

        test.afterEach(() => {
            Neo.main.addon.LocalStorage = originalLocalStorage
        });

        test('saves, restores, deletes, and persists named perspectives through collection helpers', async () => {
            let writes = [];

            Neo.main.addon.LocalStorage.readLocalStorageItem = async ({key}) => ({key, value: null});
            Neo.main.addon.LocalStorage.updateLocalStorageItem = async payload => {
                writes.push(payload)
            };

            const example = createExampleHarness(),
                toolbar   = example.createPerspectiveToolbar();

            expect(Object.keys(example.layoutCollection.layouts)).toEqual(['operator-default', 'review-focus']);
            expect(example.layoutCollection.activeLayoutId).toBe('operator-default');
            expect(toolbar.items.map(item => item.text || item.html)).toEqual([
                'Perspectives',
                'Operator',
                'Review',
                'Save Current',
                'Delete Active'
            ]);
            expect(toolbar.items[1].pressed).toBe(true);
            expect(toolbar.items[2].pressed).toBe(false);

            const resized = Operations.applyOperation(example.dockModel, {
                operation  : 'resizeSplit',
                sizes      : [0.4, 0.6],
                splitNodeId: 'root-split'
            });

            expect(resized.errors).toEqual([]);
            example.dockModel = resized.document;

            const saved = example.saveCurrentPerspective();

            expect(saved.errors).toEqual([]);
            expect(saved.layout.layoutId).toBe('saved-perspective-1');
            expect(example.layoutCollection.activeLayoutId).toBe('saved-perspective-1');
            expect(example.layoutCollection.layouts['saved-perspective-1'].dockZone.nodes['root-split'].sizes).toEqual([0.4, 0.6]);

            const restored = example.restorePerspective('review-focus');

            expect(restored.errors).toEqual([]);
            expect(example.layoutCollection.activeLayoutId).toBe('review-focus');
            expect(example.dockModel.nodes['root-split'].sizes).toEqual([0.48, 0.52]);
            expect(example.dockModel.nodes['main-tabs'].activeItemId).toBe('swarm');

            const deleted = example.removeActivePerspective();

            expect(deleted.errors).toEqual([]);
            expect(example.layoutCollection.layouts['review-focus']).toBeUndefined();
            expect(example.layoutCollection.activeLayoutId).toBe('operator-default');
            expect(example.dockModel).toEqual(example.layoutCollection.layouts['operator-default'].dockZone);
            expect(example.refreshCount).toBe(3);
            expect(writes.length).toBeGreaterThanOrEqual(3);
            expect(JSON.parse(writes.at(-1).value).activeLayoutId).toBe('operator-default')
        });

        test('the perspective toolbar keeps stable controls and buttons across save and delete', () => {
            Neo.main.addon.LocalStorage.updateLocalStorageItem = async () => {};

            const
                example        = createExampleHarness(),
                toolbar        = Neo.create(Toolbar, example.createPerspectiveToolbar()),
                label          = toolbar.items[0],
                operatorButton = toolbar.items[1],
                reviewButton   = toolbar.items[2],
                saveButton     = toolbar.items[3],
                deleteButton   = toolbar.items[4];

            example.items = [toolbar];

            try {
                const saved = example.saveCurrentPerspective();

                expect(saved.errors).toEqual([]);
                example.syncPerspectiveToolbar();

                const savedButton = toolbar.items.find(item => item.reference === `dock-perspective-${saved.layout.layoutId}`);

                expect(toolbar.items[0]).toBe(label);
                expect(toolbar.items.find(item => item.reference === 'dock-perspective-operator-default')).toBe(operatorButton);
                expect(toolbar.items.find(item => item.reference === 'dock-perspective-review-focus')).toBe(reviewButton);
                expect(toolbar.items.at(-2)).toBe(saveButton);
                expect(toolbar.items.at(-1)).toBe(deleteButton);
                expect(savedButton?.pressed).toBe(true);

                const removed = example.removeActivePerspective();

                expect(removed.errors).toEqual([]);
                example.syncPerspectiveToolbar();

                expect(toolbar.items[0]).toBe(label);
                expect(toolbar.items.find(item => item.reference === 'dock-perspective-operator-default')).toBe(operatorButton);
                expect(toolbar.items.find(item => item.reference === 'dock-perspective-review-focus')).toBe(reviewButton);
                expect(toolbar.items.includes(savedButton)).toBe(false);
                expect(savedButton.isDestroyed).toBe(true);
                expect(toolbar.items.at(-2)).toBe(saveButton);
                expect(toolbar.items.at(-1)).toBe(deleteButton)
            } finally {
                toolbar.destroy()
            }
        });

        test('rehydrates a valid persisted collection and fails closed for invalid storage payloads', async () => {
            const persistedReview = savedLayout('persisted-review', 'Persisted Review', d => {
                    d.nodes['main-tabs'].activeItemId = 'strategy'
                }),
                persistedDefault = savedLayout('persisted-default', 'Persisted Default'),
                {collection} = PerspectiveLibrary.createSavedLayoutCollection([persistedDefault, persistedReview], {
                    activeLayoutId: 'persisted-review'
                });

            let readValue = JSON.stringify(collection);

            Neo.main.addon.LocalStorage.readLocalStorageItem = async ({key}) => ({key, value: readValue});
            Neo.main.addon.LocalStorage.updateLocalStorageItem = async () => {};

            const hydrated = createExampleHarness(),
                loaded     = await hydrated.loadLayoutCollectionFromStorage();

            expect(loaded.loaded).toBe(true);
            expect(hydrated.layoutCollection.activeLayoutId).toBe('persisted-review');
            expect(hydrated.dockModel).toEqual(persistedReview.dockZone);
            expect(hydrated.refreshCount).toBe(1);

            readValue = JSON.stringify({schema: 'neo.dock.layoutCollection.v0'});

            const invalid   = createExampleHarness(),
                invalidLoad = await invalid.loadLayoutCollectionFromStorage();

            expect(invalidLoad.loaded).toBe(false);
            expect(invalidLoad.errors.length).toBeGreaterThan(0);
            expect(invalid.layoutCollection.activeLayoutId).toBe('operator-default');
            expect(invalid.dockModel).toEqual(invalid.layoutCollection.layouts['operator-default'].dockZone);
            expect(invalid.refreshCount).toBe(0)
        })
    });

    test.describe('standalone dock example composition', () => {
        test('keeps the DockWorkspace holder free of Viewport responsibilities', () => {
            expect(DockWorkspace.prototype.isPrototypeOf(MainContainer.prototype)).toBe(true);
            expect(MainContainer.config.additionalThemeFiles).toEqual(['Neo.dashboard.Container']);
            expect(MainContainer.config.autoMount).toBeUndefined();
            expect(MainContainer.config.cls || []).not.toContain('neo-viewport');
            expect(Object.hasOwn(MainContainer.prototype, 'onConstructed')).toBe(false)
        })
    });

    test.describe('operation vocabulary (SSOT)', () => {
        test('the vocabulary IS the dispatch table — derived keys, bidirectional by construction', () => {
            // one structure carries both: a handler cannot exist without being exported,
            // and an exported name cannot exist without its handler
            expect(Operations.operations).toEqual(Object.keys(Operations.operationHandlers));

            for (const operation of Operations.operations) {
                expect(typeof Operations.operationHandlers[operation]).toBe('function')
            }
        });

        test('every exported operation dispatches through the executor contract', () => {
            for (const operation of Operations.operations) {
                const {errors} = Operations.applyOperation(doc(), {operation});

                // per-operation validation errors are fine; the unknown-operation rejection
                // firing for an EXPORTED name means vocabulary and dispatch have drifted
                expect(errors.join('\n')).not.toContain('unknown operation')
            }
        });

        test('an unexported operation is rejected fail-closed with the document untouched', () => {
            const input              = doc();
            const {document, errors} = Operations.applyOperation(input, {operation: 'renameItem'});

            expect(errors).toEqual(['unknown operation "renameItem"']);
            expect(document).toEqual(input)
        });

        test('inherited object keys never resolve to handlers — own-key dispatch only', () => {
            for (const hostile of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
                const {errors} = Operations.applyOperation(doc(), {operation: hostile});

                expect(errors).toEqual([`unknown operation "${hostile}"`])
            }
        });

        test('the vocabulary and the dispatch table are frozen against consumer mutation', () => {
            expect(Object.isFrozen(Operations.operations)).toBe(true);
            expect(Object.isFrozen(Operations.operationHandlers)).toBe(true);
            expect(() => Operations.operations.push('rogueOp')).toThrow()
        });
    });

    test.describe('addTab', () => {
        test('inserts a catalog-only item at index and makes it active', () => {
            const {document, errors} = Operations.addTab(doc(), {itemId: 'inspector', tabsNodeId: 'main-tabs', index: 1});
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['strategy', 'inspector', 'swarm']);
            expect(document.nodes['main-tabs'].activeItemId).toBe('inspector')
        });

        test('relocates an item already in the tree without duplicating it', () => {
            const {document, errors} = Operations.addTab(doc(), {itemId: 'terminal', tabsNodeId: 'main-tabs', index: 0});
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['terminal', 'strategy', 'swarm']);
            // side-tabs emptied -> collapsed by normalizeTree, and its edge zone pruned
            expect(document.nodes['side-tabs']).toBeUndefined();
            expect(document.nodes.root.zones.right).toBeUndefined();
            // terminal appears exactly once
            expect(Document.validate(document)).toEqual([])
        });

        test('fails closed on an unknown item (document untouched)', () => {
            const input              = doc();
            const {document, errors} = Operations.addTab(input, {itemId: 'ghost', tabsNodeId: 'main-tabs'});
            expect(errors.length).toBeGreaterThan(0);
            expect(document).toBe(input)
        });

        test('fails closed when the target is not a tabs node', () => {
            const {errors} = Operations.addTab(doc(), {itemId: 'inspector', tabsNodeId: 'root'});
            expect(errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('setActiveItem', () => {
        test('commits a member item through the exported operation vocabulary', () => {
            const input            = nestedEdgeDoc(),
                {document, errors} = Operations.applyOperation(input, {
                    operation : 'setActiveItem',
                    tabsNodeId: 'main-tabs',
                    itemId    : 'strategy'
                });

            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].activeItemId).toBe('strategy');
            expect(input.nodes['main-tabs'].activeItemId).toBe('swarm')
        });

        test('fails closed for an unknown tabs node or non-member item', () => {
            const input     = nestedEdgeDoc(),
                missingNode = Operations.applyOperation(input, {
                    operation : 'setActiveItem',
                    tabsNodeId: 'ghost',
                    itemId    : 'strategy'
                }),
                nonMember = Operations.applyOperation(input, {
                    operation : 'setActiveItem',
                    tabsNodeId: 'main-tabs',
                    itemId    : 'terminal'
                });

            expect(missingNode.errors.length).toBeGreaterThan(0);
            expect(nonMember.errors.length).toBeGreaterThan(0);
            expect(missingNode.document).toBe(input);
            expect(nonMember.document).toBe(input)
        })
    });

    test.describe('resizeEdgeZone', () => {
        test('commits one normalized extent on a resizable edge descriptor', () => {
            const input            = nestedEdgeDoc(),
                {document, errors} = Operations.applyOperation(input, {
                    operation : 'resizeEdgeZone',
                    edgeZoneId: 'root',
                    edge      : 'right',
                    extent    : 0.4
                });

            expect(errors).toEqual([]);
            expect(document.nodes.root.zones.right.extent).toBe(0.4);
            expect(input.nodes.root.zones.right.extent).toBe(0.25)
        });

        test('fails closed for center, non-resizable, unknown, and invalid extents', () => {
            const input = nestedEdgeDoc(),
                cases   = [
                    {edgeZoneId: 'root', edge: 'center', extent: 0.4},
                    {edgeZoneId: 'root', edge: 'right', extent: 0},
                    {edgeZoneId: 'root', edge: 'right', extent: 1},
                    {edgeZoneId: 'ghost', edge: 'right', extent: 0.4}
                ];

            input.nodes.root.zones.right.resizable = false;
            cases.push({edgeZoneId: 'root', edge: 'right', extent: 0.4});

            for (const descriptor of cases) {
                const {document, errors} = Operations.applyOperation(input, {
                    operation: 'resizeEdgeZone',
                    ...descriptor
                });

                expect(errors.length).toBeGreaterThan(0);
                expect(document).toBe(input)
            }
        })
    });

    test.describe('moveItem', () => {
        test('relocates an in-tree item to another tabs node', () => {
            const {document, errors} = Operations.moveItem(doc(), {itemId: 'strategy', targetNodeId: 'side-tabs', index: 0});
            expect(errors).toEqual([]);
            expect(document.nodes['side-tabs'].items).toEqual(['strategy', 'terminal']);
            expect(document.nodes['main-tabs'].items).toEqual(['swarm'])
        });

        test('fails closed when the item is not in the tree', () => {
            const {errors} = Operations.moveItem(doc(), {itemId: 'inspector', targetNodeId: 'main-tabs'});
            expect(errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('splitNode', () => {
        test('splits a node after the target, wrapping the item in a new pane', () => {
            const {document, errors} = Operations.splitNode(doc(), {
                itemId: 'inspector', targetNodeId: 'main-tabs', orientation: 'horizontal', position: 'after', sizes: [0.6, 0.4]
            });
            expect(errors).toEqual([]);
            // root.zones.center now points at a split holding [main-tabs, <new tabs with inspector>]
            const splitId = document.nodes.root.zones.center.nodeId,
                  split   = document.nodes[splitId];
            expect(split.type).toBe('split');
            expect(split.orientation).toBe('horizontal');
            expect(split.children[0]).toBe('main-tabs');
            expect(document.nodes[split.children[1]].items).toEqual(['inspector']);
            expect(split.sizes).toEqual([0.6, 0.4])
        });

        test('splits before the target (new pane first)', () => {
            const input = doc();

            Object.assign(input.nodes.root.zones.right, {extent: 0.25, resizable: true});

            const {document, errors} = Operations.splitNode(input, {
                itemId: 'inspector', targetNodeId: 'side-tabs', orientation: 'vertical', position: 'before', sizes: [0.3, 0.7]
            });
            expect(errors).toEqual([]);
            const splitId = document.nodes.root.zones.right.nodeId,
                  split   = document.nodes[splitId];
            expect(document.nodes[split.children[0]].items).toEqual(['inspector']);
            expect(split.children[1]).toBe('side-tabs');
            expect(document.nodes.root.zones.right).toEqual({
                nodeId: splitId, extent: 0.25, resizable: true
            })
        });

        test('splitting the root makes the new split the root', () => {
            const {document, errors} = Operations.splitNode(doc(), {
                itemId: 'inspector', targetNodeId: 'root', orientation: 'vertical', position: 'after'
            });
            expect(errors).toEqual([]);
            expect(document.nodes[document.root].type).toBe('split');
            expect(document.nodes[document.root].children).toContain('root')
        });

        test('detaches the item from its old location (no duplication)', () => {
            const {document, errors} = Operations.splitNode(doc(), {
                itemId: 'swarm', targetNodeId: 'side-tabs', orientation: 'vertical', position: 'after'
            });
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['strategy']);
            expect(Document.validate(document)).toEqual([])
        });

        test('fails closed on an unknown item, unknown target, or bad orientation', () => {
            expect(Operations.splitNode(doc(), {itemId: 'ghost', targetNodeId: 'main-tabs', orientation: 'horizontal'}).errors.length).toBeGreaterThan(0);
            expect(Operations.splitNode(doc(), {itemId: 'inspector', targetNodeId: 'ghost', orientation: 'horizontal'}).errors.length).toBeGreaterThan(0);
            expect(Operations.splitNode(doc(), {itemId: 'inspector', targetNodeId: 'main-tabs', orientation: 'diagonal'}).errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('resizeSplit', () => {
        test('updates split sizes with normalized finite positive values', () => {
            const input              = splitDoc(),
                  snapshot           = JSON.stringify(input),
                  ratios             = [3, 1],
                  {document, errors} = Operations.resizeSplit(input, {
                      splitNodeId: 'main-split',
                      sizes      : ratios
                  });

            expect(errors).toEqual([]);
            expect(document).not.toBe(input);
            expect(document.nodes['main-split'].sizes).toEqual([0.75, 0.25]);
            expect(Document.validate(document)).toEqual([]);
            expect(JSON.stringify(input)).toBe(snapshot);

            ratios[0] = 1;
            expect(document.nodes['main-split'].sizes).toEqual([0.75, 0.25])
        });

        test('fails closed for invalid targets and invalid size payloads', () => {
            const input    = splitDoc(),
                  snapshot = JSON.stringify(input),
                  cases    = [
                      {splitNodeId: 'ghost', sizes: [1, 1]},
                      {splitNodeId: 'root', sizes: [1, 1]},
                      {splitNodeId: 'main-split'},
                      {splitNodeId: 'main-split', sizes: [1]},
                      {splitNodeId: 'main-split', sizes: [1, 0]},
                      {splitNodeId: 'main-split', sizes: [1, -1]},
                      {splitNodeId: 'main-split', sizes: [1, Infinity]},
                      {splitNodeId: 'main-split', sizes: [1, '1']}
                  ];

            for (const args of cases) {
                const {document, errors} = Operations.resizeSplit(input, args);

                expect(errors.length).toBeGreaterThan(0);
                expect(document).toBe(input);
                expect(JSON.stringify(input)).toBe(snapshot)
            }
        })
    });

    test.describe('detachItem / closeItem', () => {
        test('detachItem removes from the tree but keeps the catalog record', () => {
            const {document, errors} = Operations.detachItem(doc(), {itemId: 'terminal'});
            expect(errors).toEqual([]);
            expect(Document.findContainingTabsId(document, 'terminal')).toBe(null);
            expect(document.items.terminal).toBeDefined()
        });

        /**
         * The docking design record's detached row once demanded the opposite of this: that detaching
         * a railed item CLEAR `autoHidden` in the same commit. The decision went the other way — the
         * flag means residency *while docked*, so it survives the round trip. Clearing it would spend
         * the return address the reintegration row guarantees and land a pane torn out of a rail back
         * expanded, which is the wrong home for exactly the users a rail serves.
         *
         * This arm is that half of the ruling made falsifiable: implementing the retired clause reds it.
         */
        test('detachItem preserves autoHidden — the committed return address reintegration spends', () => {
            const input = doc();

            input.items.terminal.autoHidden = true;

            const {document, errors} = Operations.detachItem(input, {itemId: 'terminal'});

            expect(errors).toEqual([]);
            expect(Document.findContainingTabsId(document, 'terminal')).toBe(null);
            expect(document.items.terminal.autoHidden).toBe(true)
        });

        /**
         * The other half, and the reason the commit rule was never needed: the exclusion holds one
         * layer down. Rail membership is DERIVED by walking the node tree — an item is reached only
         * through a `tabs` node's `items` array — and detaching filters the item out of exactly that
         * array. So a detached item contributes no rail entry however its catalog record reads.
         *
         * Asserted against the RENDERED projection rather than the collection helper, for the reason
         * the nested-rail arm below states: two derivations agreeing with each other is not the
         * property. Non-vacuity is the whole arm — an absent rail passes for the wrong reason if the
         * item never railed at all, so the pre-detach rail is asserted first as a control.
         */
        test('a detached item renders no rail, then rails again on return — the exclusion is structural', () => {
            const railed = doc();

            railed.items.terminal.autoHidden = true;

            const railedItemIds = d => {
                      const found = [];

                      (function walk(config) {
                          if (!config || typeof config !== 'object') return;

                          if (config.dockNodeType === 'edge-rail') {
                              config.railItems?.forEach(tab => found.push(tab.dockItemId))
                          }

                          Array.isArray(config.items) && config.items.forEach(walk)
                      })(LayoutAdapter.project(d, {
                          resolveComponentRef: componentRef => ({ntype: 'component', reference: componentRef})
                      }));

                      return found
                  };

            // `terminal` is `side-tabs`' only occupant, and detaching the last item prunes the empty
            // node — so the edge it left would not survive for it to return to. Seed a second occupant
            // through the real operation rather than by editing the fixture, so every document this arm
            // asserts against is one the reducer can actually produce.
            const seeded = Operations.addTab(railed, {itemId: 'swarm', tabsNodeId: 'side-tabs', index: 1});

            expect(seeded.errors).toEqual([]);

            // Control first: while docked, the flag really does rail this item. Without it the
            // assertion below would pass against a projection that rails nothing at all.
            expect(railedItemIds(seeded.document), 'the docked control renders a rail tab').toContain('terminal');

            const {document, errors} = Operations.detachItem(seeded.document, {itemId: 'terminal'});

            expect(errors).toEqual([]);
            expect(document.items.terminal.autoHidden, 'the catalog flag is deliberately left set').toBe(true);
            expect(railedItemIds(document), 'yet nothing rails it once it left the tree').not.toContain('terminal');

            // The return leg, and the only part that proves the flag was worth preserving. Detach
            // keeping `autoHidden` is a claim about REINTEGRATION: the item rails again when it comes
            // home, with nobody re-setting the flag. Retention and structural exclusion are both
            // observable while that claim is false — a document can preserve a flag nothing reads.
            // Only re-entry separates a return address from dead state.
            //
            // It must return to an EDGE zone, and that is a real clause rather than fixture bookkeeping:
            // `collectAutoHiddenItems` feeds `railsByEdge` per edge zone, and there is no center rail —
            // so the same item, same flag, reintegrated into `main-tabs`, rails nothing at all. The
            // return address is spendable only at an edge.
            const returned = Operations.addTab(document, {itemId: 'terminal', tabsNodeId: 'side-tabs', index: 0});

            expect(returned.errors).toEqual([]);
            expect(returned.document.items.terminal.autoHidden, 'nothing re-set the flag on the way back').toBe(true);
            expect(railedItemIds(returned.document), 'the returned item rails again, unattended').toContain('terminal')
        });

        test('closeItem removes from both the tree and the catalog', () => {
            const {document, errors} = Operations.closeItem(doc(), {itemId: 'terminal'});
            expect(errors).toEqual([]);
            expect(document.items.terminal).toBeUndefined()
        });

        test('closeItem rejects explicit non-closable policy without changing one byte', () => {
            const input = doc();

            input.items.swarm.closable = false;

            const snapshot           = JSON.stringify(input),
                  {document, errors} = Operations.closeItem(input, {itemId: 'swarm'});

            expect(errors).toEqual(['item "swarm" is not closable']);
            expect(document).toBe(input);
            expect(JSON.stringify(input)).toBe(snapshot)
        });

        test('closeItem selects a successor only for the active item and preserves other activation', () => {
            const createCloseDocument = (activeItemId='strategy') => {
                const input = doc();

                input.nodes['main-tabs'].items        = ['strategy', 'swarm', 'inspector'];
                input.nodes['main-tabs'].activeItemId = activeItemId;

                return input
            };

            const first = Operations.closeItem(createCloseDocument(), {itemId: 'strategy'});
            expect(first.errors).toEqual([]);
            expect(first.document.nodes['main-tabs'].items).toEqual(['swarm', 'inspector']);
            expect(first.document.nodes['main-tabs'].activeItemId).toBe('swarm');

            const middle = Operations.closeItem(createCloseDocument(), {itemId: 'swarm'});
            expect(middle.errors).toEqual([]);
            expect(middle.document.nodes['main-tabs'].items).toEqual(['strategy', 'inspector']);
            expect(middle.document.nodes['main-tabs'].activeItemId).toBe('strategy');

            const last = Operations.closeItem(createCloseDocument(), {itemId: 'inspector'});
            expect(last.errors).toEqual([]);
            expect(last.document.nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
            expect(last.document.nodes['main-tabs'].activeItemId).toBe('strategy');

            const activeMiddle = Operations.closeItem(createCloseDocument('swarm'), {itemId: 'swarm'});
            expect(activeMiddle.errors).toEqual([]);
            expect(activeMiddle.document.nodes['main-tabs'].items).toEqual(['strategy', 'inspector']);
            expect(activeMiddle.document.nodes['main-tabs'].activeItemId).toBe('inspector');

            const activeLast = Operations.closeItem(createCloseDocument('inspector'), {itemId: 'inspector'});
            expect(activeLast.errors).toEqual([]);
            expect(activeLast.document.nodes['main-tabs'].items).toEqual(['strategy', 'swarm']);
            expect(activeLast.document.nodes['main-tabs'].activeItemId).toBe('swarm');

            const only = Operations.closeItem(doc(), {itemId: 'terminal'});
            expect(only.errors).toEqual([]);
            expect(only.document.items.terminal).toBeUndefined();
            expect(only.document.nodes['side-tabs']).toBeUndefined();
            expect(only.document.nodes.root.zones.right).toBeUndefined()
        })
    });

    test.describe('setItemPinned', () => {
        test('updates pin state without mutating caller input', () => {
            const input = doc();

            input.items.terminal.pinnable = true;

            const snapshot = JSON.stringify(input),
                  pinned   = Operations.setItemPinned(input, {itemId: 'terminal', pinned: true});

            expect(pinned.errors).toEqual([]);
            expect(pinned.document.items.terminal.pinned).toBe(true);
            expect(JSON.stringify(input)).toBe(snapshot);
            expect(input.items.terminal.pinned).toBeUndefined();

            const unpinned = Operations.setItemPinned(pinned.document, {itemId: 'terminal', pinned: false});

            expect(unpinned.errors).toEqual([]);
            expect(unpinned.document.items.terminal.pinned).toBe(false)
        });

        test('pinning an item open clears persisted auto-hide state', () => {
            const input = doc();

            input.items.terminal.autoHidden = true;

            const pinned = Operations.setItemPinned(input, {itemId: 'terminal', pinned: true});

            expect(pinned.errors).toEqual([]);
            expect(pinned.document.items.terminal.pinned).toBe(true);
            expect(pinned.document.items.terminal.autoHidden).toBe(false);
            expect(input.items.terminal.autoHidden).toBe(true)
        });

        test('fails closed for unknown items, non-boolean state, and non-pinnable items', () => {
            const input = doc();

            input.items.terminal.pinnable = false;

            const unknown = Operations.setItemPinned(input, {itemId: 'ghost', pinned: true});
            expect(unknown.document).toBe(input);
            expect(unknown.errors.join(' ')).toContain('ghost');

            const invalid = Operations.setItemPinned(input, {itemId: 'terminal', pinned: 'true'});
            expect(invalid.document).toBe(input);
            expect(invalid.errors.join(' ')).toContain('boolean');

            const locked = Operations.setItemPinned(input, {itemId: 'terminal', pinned: true});
            expect(locked.document).toBe(input);
            expect(locked.errors.join(' ')).toContain('not pinnable')
        })
    });

    test.describe('setItemAutoHidden', () => {
        test('updates auto-hide state without mutating caller input', () => {
            const input = doc();

            input.items.terminal.pinnable = true;

            const snapshot = JSON.stringify(input),
                  hidden   = Operations.setItemAutoHidden(input, {itemId: 'terminal', autoHidden: true});

            expect(hidden.errors).toEqual([]);
            expect(hidden.document.items.terminal.autoHidden).toBe(true);
            expect(JSON.stringify(input)).toBe(snapshot);
            expect(input.items.terminal.autoHidden).toBeUndefined();

            const visible = Operations.applyOperation(hidden.document, {
                operation : 'setItemAutoHidden',
                itemId    : 'terminal',
                autoHidden: false
            });

            expect(visible.errors).toEqual([]);
            expect(visible.document.items.terminal.autoHidden).toBe(false)
        });

        test('fails closed for unknown items, non-boolean state, non-pinnable items, and pinned-open items', () => {
            const input = doc();

            input.items.terminal.pinnable = false;

            const unknown = Operations.setItemAutoHidden(input, {itemId: 'ghost', autoHidden: true});
            expect(unknown.document).toBe(input);
            expect(unknown.errors.join(' ')).toContain('ghost');

            const invalid = Operations.setItemAutoHidden(input, {itemId: 'terminal', autoHidden: 'true'});
            expect(invalid.document).toBe(input);
            expect(invalid.errors.join(' ')).toContain('boolean');

            const locked = Operations.setItemAutoHidden(input, {itemId: 'terminal', autoHidden: true});
            expect(locked.document).toBe(input);
            expect(locked.errors.join(' ')).toContain('not pinnable');

            const pinnedInput = doc();
            pinnedInput.items.terminal.pinned = true;

            const pinned = Operations.setItemAutoHidden(pinnedInput, {itemId: 'terminal', autoHidden: true});
            expect(pinned.document).toBe(pinnedInput);
            expect(pinned.errors.join(' ')).toContain('pinned')
        })
    });

    test.describe('setItemLocked', () => {
        test('updates committed lock state without mutating caller input', () => {
            const input    = doc(),
                  snapshot = JSON.stringify(input),
                  locked   = Operations.applyOperation(input, {
                      operation: 'setItemLocked',
                      itemId   : 'strategy',
                      locked   : true
                  });

            expect(locked.errors).toEqual([]);
            expect(locked.document.items.strategy.locked).toBe(true);
            expect(JSON.stringify(input)).toBe(snapshot);
            expect(input.items.strategy.locked).toBeUndefined();

            const unlocked = Operations.setItemLocked(locked.document, {
                itemId: 'strategy',
                locked: false
            });

            expect(unlocked.errors).toEqual([]);
            expect(unlocked.document.items.strategy.locked).toBe(false)
        });

        test('fails closed for unknown items, non-boolean state, and non-lockable items', () => {
            const input = doc();

            input.items.strategy.lockable = false;

            for (const result of [
                Operations.setItemLocked(input, {itemId: 'ghost', locked: true}),
                Operations.setItemLocked(input, {itemId: 'strategy', locked: 'true'}),
                Operations.setItemLocked(input, {itemId: 'strategy', locked: true})
            ]) {
                expect(result.document).toBe(input);
                expect(result.errors.length).toBeGreaterThan(0)
            }
        });

        test('guards close, detach, cross-zone move, and the addTab reorder downgrade', () => {
            const locked = Operations.setItemLocked(doc(), {itemId: 'strategy', locked: true});

            expect(locked.errors).toEqual([]);

            const snapshot = JSON.stringify(locked.document),
                  attempts = [
                      Operations.closeItem(locked.document, {itemId: 'strategy'}),
                      Operations.detachItem(locked.document, {itemId: 'strategy'}),
                      Operations.moveItem(locked.document, {itemId: 'strategy', targetNodeId: 'side-tabs'}),
                      Operations.applyOperation(locked.document, {
                          operation : 'addTab',
                          itemId    : 'strategy',
                          tabsNodeId: 'side-tabs',
                          index     : 0
                      })
                  ];

            for (const result of attempts) {
                expect(result.document).toBe(locked.document);
                expect(result.errors.join(' ')).toContain('locked');
                expect(JSON.stringify(locked.document)).toBe(snapshot)
            }
        });

        test('keeps locked headers as drop targets and restores structural operations after unlock', () => {
            const locked = Operations.setItemLocked(doc(), {itemId: 'terminal', locked: true});

            expect(locked.errors).toEqual([]);

            const intoLockedNode = Operations.moveItem(locked.document, {
                itemId      : 'strategy',
                targetNodeId: 'side-tabs',
                index       : 0
            });

            expect(intoLockedNode.errors).toEqual([]);
            expect(intoLockedNode.document.nodes['side-tabs'].items).toEqual(['strategy', 'terminal']);

            const unlocked = Operations.setItemLocked(locked.document, {itemId: 'terminal', locked: false});

            expect(unlocked.errors).toEqual([]);
            expect(Operations.closeItem(unlocked.document, {itemId: 'terminal'}).errors).toEqual([]);
            expect(Operations.detachItem(unlocked.document, {itemId: 'terminal'}).errors).toEqual([]);
            expect(Operations.moveItem(unlocked.document, {
                itemId      : 'terminal',
                targetNodeId: 'main-tabs'
            }).errors).toEqual([])
        })
    });

    test.describe('normalizeTree', () => {
        test('collapses an emptied tabs node and prunes its edge zone', () => {
            const d = doc();
            d.nodes['side-tabs'].items = [];
            const out = Document.normalizeTree(d);
            expect(out.nodes['side-tabs']).toBeUndefined();
            expect(out.nodes.root.zones.right).toBeUndefined()
        });

        test('collapses a single-child split into its child', () => {
            const d = doc();
            d.nodes.split = {type: 'split', orientation: 'horizontal', children: ['main-tabs'], sizes: [1]};
            d.nodes.root.zones.center.nodeId = 'split';
            const out = Document.normalizeTree(d);
            expect(out.nodes.split).toBeUndefined();
            expect(out.nodes.root.zones.center.nodeId).toBe('main-tabs')
        });

        test('prunes nodes unreachable from the root', () => {
            const d = doc();
            d.nodes.orphan = {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'};
            const out = Document.normalizeTree(d);
            expect(out.nodes.orphan).toBeUndefined()
        })
    });

    test.describe('applyOperation (DockPreview descriptor seam)', () => {
        test('dispatches addTab, downgrading to a move when the item is already in the tree', () => {
            const {document, errors} = Operations.applyOperation(doc(), {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs', index: 0});
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['terminal', 'strategy', 'swarm']);
            expect(Document.validate(document)).toEqual([])
        });

        test('dispatches splitNode from a previewToOperation-shaped descriptor', () => {
            const descriptor         = {operation: 'splitNode', itemId: 'inspector', targetNodeId: 'main-tabs', orientation: 'horizontal', position: 'after', sizes: [0.5, 0.5]};
            const {document, errors} = Operations.applyOperation(doc(), descriptor);
            expect(errors).toEqual([]);
            expect(document.nodes[document.nodes.root.zones.center.nodeId].type).toBe('split')
        });

        test('dispatches resizeSplit descriptors', () => {
            const {document, errors} = Operations.applyOperation(splitDoc(), {
                operation  : 'resizeSplit',
                splitNodeId: 'main-split',
                sizes      : [1, 3]
            });

            expect(errors).toEqual([]);
            expect(document.nodes['main-split'].sizes).toEqual([0.25, 0.75])
        });

        test('dispatches setItemPinned descriptors', () => {
            const input = doc();

            input.items.terminal.pinnable = true;

            const {document, errors} = Operations.applyOperation(input, {
                operation: 'setItemPinned',
                itemId   : 'terminal',
                pinned   : true
            });

            expect(errors).toEqual([]);
            expect(document.items.terminal.pinned).toBe(true)
        });

        test('rejects an unknown operation', () => {
            expect(Operations.applyOperation(doc(), {operation: 'frobnicate'}).errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('edge descriptor seam (previewToOperation edges — top/left lead, bottom/right trail)', () => {
        const cases = [
            {edge: 'top',    orientation: 'vertical',   target: 'main-tabs', zone: 'center', lead: true},
            {edge: 'left',   orientation: 'horizontal', target: 'main-tabs', zone: 'center', lead: true},
            {edge: 'bottom', orientation: 'vertical',   target: 'side-tabs', zone: 'right',  lead: false},
            {edge: 'right',  orientation: 'horizontal', target: 'side-tabs', zone: 'right',  lead: false}
        ];

        for (const c of cases) {
            test(`edge-${c.edge} places the new pane ${c.lead ? 'before (leading)' : 'after (trailing)'}`, () => {
                // exact previewToOperation edge-descriptor shape: carries `edge`, no `position`
                const descriptor         = {operation: 'splitNode', itemId: 'inspector', targetNodeId: c.target, edge: c.edge, orientation: c.orientation, sizes: [0.5, 0.5]};
                const {document, errors} = Operations.applyOperation(doc(), descriptor);
                expect(errors).toEqual([]);

                const split   = document.nodes[document.nodes.root.zones[c.zone].nodeId],
                      newPane = c.lead ? split.children[0] : split.children[1],
                      keep    = c.lead ? split.children[1] : split.children[0];

                expect(split.type).toBe('split');
                expect(split.orientation).toBe(c.orientation);
                expect(document.nodes[newPane].items).toEqual(['inspector']);
                expect(keep).toBe(c.target);
                expect(Document.validate(document)).toEqual([])
            })
        }
    });

    test.describe('restoreTab — a home that no longer exists (#18164)', () => {
        /**
         * Detaching the LAST item of a zone is the common tear-out, not the rare one: the emptied
         * tabs node is dropped on commit and a two-child split collapses behind it. Every arm here
         * starts from that state, so `tabsNodeId` names a node that is genuinely gone.
         * @param {Object} source
         * @param {String} itemId
         * @returns {{document:Object, placement:Object}}
         */
        function detachAlone(source, itemId) {
            const placement          = Document.captureItemPlacement(source, itemId),
                  {document, errors} = Operations.applyOperation(source, {operation: 'detachItem', itemId});

            expect(errors).toEqual([]);
            expect(document.nodes[placement.tabsNodeId], 'the home is gone — that is the premise').toBeUndefined();

            return {document, placement}
        }

        test('AC-1 a pane ALONE in an edge zone returns to THAT zone, asserted on the node topology', () => {
            const {document: detached, placement} = detachAlone(doc(), 'terminal');

            expect(detached.nodes.root.zones.right, 'the emptied zone collapsed').toBeUndefined();

            const {document: restored, errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors).toEqual([]);

            const zoneId = Document.getZoneNodeId(restored.nodes.root.zones.right);

            expect(zoneId, 'the right zone exists again').toBeTruthy();
            expect(restored.nodes[zoneId].items).toEqual(['terminal']);

            // The tab ORDER of main-tabs would read identically whether or not this worked, which is
            // why the assertion is on the zone and never on a tab sequence.
            expect(restored.nodes['main-tabs'].items).toEqual(['strategy', 'swarm'])
        });

        test('AC-2 RED: the pre-fix record — a tabsNodeId with no home — cannot rebuild it', () => {
            const {document: detached, placement} = detachAlone(doc(), 'terminal');

            // Exactly what `captureItemPlacement` used to return: the id of a node that is
            // guaranteed absent by the time it is read, and nothing to reconstruct it from.
            const {errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', tabsNodeId: placement.tabsNodeId, index: placement.index
            });

            expect(errors.length, 'fails closed rather than inventing a home').toBeGreaterThan(0);

            // And the old resolution's actual outcome: the FIRST tabs node in document order, which
            // is the centre — the wrong zone, reported as a successful return.
            const fallback = Object.entries(detached.nodes).find(([, node]) => node.type === 'tabs')?.[0];

            expect(fallback, 'document order hands back the CENTRE, not the right edge').toBe('main-tabs')
        });

        test('AC-3 a pane that SHARED its node returns to that node at its index — the surviving path is untouched', () => {
            const source    = doc(),
                  placement = Document.captureItemPlacement(source, 'strategy');

            const {document: detached} = Operations.applyOperation(source, {operation: 'detachItem', itemId: 'strategy'});

            expect(detached.nodes['main-tabs'], 'the home survived — it had a sibling').toBeTruthy();

            const {document: restored, errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'strategy', ...placement
            });

            expect(errors).toEqual([]);
            expect(restored.nodes['main-tabs'].items, 'back at index 0, not appended').toEqual(['strategy', 'swarm'])
        });

        test('AC-4 a pane alone in a SPLIT child returns to that side of the split, with its ratio', () => {
            const source = splitDoc([0.7, 0.3]);

            const {document: detached, placement} = detachAlone(source, 'terminal');

            expect(placement.home).toEqual({
                parentId: 'main-split', slot: 1, orientation: 'horizontal', size: 0.3, siblingId: 'main-tabs', position: 'after'
            });

            // The split lost a child and collapsed into the survivor, so the recorded PARENT is gone
            // too — the sibling anchor is the only thing left pointing at where this belonged.
            expect(detached.nodes['main-split'], 'the split collapsed with it').toBeUndefined();

            const {document: restored, errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors).toEqual([]);

            const splitId = Object.keys(restored.nodes).find(id => restored.nodes[id].type === 'split'),
                  split   = restored.nodes[splitId];

            expect(split.orientation).toBe('horizontal');
            expect(split.children[0], 'the sibling keeps the near side').toBe('main-tabs');
            expect(restored.nodes[split.children[1]].items, 'the returner keeps the far side').toEqual(['terminal']);
            expect(split.sizes[0]).toBeCloseTo(0.7, 6);
            expect(split.sizes[1]).toBeCloseTo(0.3, 6)
        });

        test('a split that KEPT other children takes the node back at its slot, scaling the survivors', () => {
            const source = splitDoc([0.5, 0.25]);

            source.nodes['main-split'].children.push('extra-tabs');
            source.nodes['main-split'].sizes = [0.5, 0.25, 0.25];
            source.nodes['extra-tabs']       = {type: 'tabs', items: ['inspector'], activeItemId: 'inspector'};

            const {document: detached, placement} = detachAlone(source, 'terminal');

            expect(detached.nodes['main-split'], 'three children minus one still splits').toBeTruthy();
            expect(detached.nodes['main-split'].children).toEqual(['main-tabs', 'extra-tabs']);

            const {document: restored, errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors).toEqual([]);

            const split = restored.nodes['main-split'];

            expect(split.children[1], 'back in the MIDDLE slot, not appended').toBe(placement.tabsNodeId);
            expect(split.sizes[1], 'it reclaims the share it recorded').toBeCloseTo(0.25, 6);
            expect(split.sizes.reduce((total, size) => total + size, 0)).toBeCloseTo(1, 6);

            // The survivors' ratio TO EACH OTHER is what is preserved — not the split's pre-detach
            // geometry, which `normalizeTree` already reset to equal when the child collapsed.
            // Restoring position is the contract here; geometry is explicitly out of its scope.
            expect(split.sizes[0] / split.sizes[2]).toBeCloseTo(
                detached.nodes['main-split'].sizes[0] / detached.nodes['main-split'].sizes[1], 6
            )
        });

        test('an OCCUPIED home is not a home — the new occupant survives, the returner goes elsewhere', () => {
            const {document: detached, placement} = detachAlone(doc(), 'terminal');

            expect(detached.nodes.root.zones.right).toBeUndefined();

            // A vessel is long-lived. While the pane is out, the user docks something else to the
            // very edge it left — an ordinary sequence, not an exotic one.
            const occupied = Document.clone(detached);

            occupied.nodes['new-right'] = {type: 'tabs', items: ['inspector'], activeItemId: 'inspector'};
            Document.setZoneNodeId(occupied.nodes.root, 'right', 'new-right');

            const {document: restored, errors} = Operations.applyOperation(occupied, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            // The recorded coordinate is VALID and NOT MINE. Writing it would orphan `new-right`:
            // an edge zone holds one node per key, so the occupant would be referenced by nothing —
            // a lost pane, and not the one being restored.
            expect(errors.length, 'an occupied slot resolves to nothing, rather than being taken').toBeGreaterThan(0);
            expect(restored, 'and the document is returned untouched').toEqual(occupied);

            // The occupant is what this arm exists for: it must still be reachable from the root.
            expect(Document.getZoneNodeId(occupied.nodes.root.zones.right)).toBe('new-right');
            expect(Document.reachableNodeIds(occupied).has('new-right')).toBe(true)
        });

        test('a slot holding the returner ITSELF is still its own — re-entry is not an overwrite', () => {
            const source    = doc(),
                  placement = Document.captureItemPlacement(source, 'terminal');

            // The ownership guard must not refuse the node its own slot: `side-tabs` is still in
            // `zones.right` here, so an occupancy check that only asked "is anything there?" would
            // send a pane away from the home it never lost.
            const {document: restored, errors} = Operations.applyOperation(source, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors).toEqual([]);
            expect(Document.getZoneNodeId(restored.nodes.root.zones.right)).toBe('side-tabs');
            expect(restored.nodes['side-tabs'].items).toEqual(['terminal'])
        });

        test('AC-6 with NO recorded placement the item still lands somewhere valid', () => {
            const {document: detached} = detachAlone(doc(), 'terminal');

            const fallback = Object.entries(detached.nodes).find(([, node]) => node.type === 'tabs')?.[0];

            const {document: restored, errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', tabsNodeId: fallback
            });

            expect(errors).toEqual([]);
            expect(restored.nodes['main-tabs'].items).toContain('terminal');
            expect(Document.validate(restored)).toEqual([])
        });

        test('the restored node reclaims its ORIGINAL id, so a round trip lands on the document it left', () => {
            const source = doc();

            const {document: detached, placement} = detachAlone(source, 'terminal');

            const {document: restored} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(restored.nodes['side-tabs'], 'the id is free, so it is reused').toBeTruthy();
            expect(restored).toEqual(source)
        });

        test('fails closed on an unknown item, and on a home whose sibling ALSO went away', () => {
            expect(Operations.applyOperation(doc(), {operation: 'restoreTab', itemId: 'ghost', tabsNodeId: 'main-tabs'}).errors)
                .toEqual(['unknown item "ghost"']);

            const {document: detached, placement} = detachAlone(splitDoc(), 'terminal');

            placement.home.parentId  = 'vanished-split';
            placement.home.siblingId = 'vanished-tabs';

            const {document: unchanged, errors} = Operations.applyOperation(detached, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors.length).toBeGreaterThan(0);
            expect(unchanged, 'a failed restore returns the input untouched').toEqual(detached)
        });

        test('restoreTab joins the derived vocabulary, so the dispatch table and Operations.operations agree', () => {
            expect(Operations.operations).toContain('restoreTab')
        })
    });

    test.describe('#18177 an edge-zone home carries its own geometry', () => {
        /**
         * `doc()`'s right zone with a committed extent — the shape `resizeEdgeZone` leaves behind,
         * and the one a sole-occupant tear-out erases along with the node.
         * @param {Object} [descriptor={extent: 0.42, nodeId: 'side-tabs', resizable: true}]
         * @returns {Object}
         */
        const sizedEdgeDoc = (descriptor={extent: 0.42, nodeId: 'side-tabs', resizable: true}) => {
            const d = doc();

            d.nodes.root.zones.right = descriptor;

            return d
        };

        test('AC-1/AC-2 the record carries the slot\'s extent and resizable — and invents neither', () => {
            expect(Document.captureNodeHome(sizedEdgeDoc(), 'side-tabs')).toEqual({
                parentId: 'root', slot: 'right', extent: 0.42, resizable: true
            });

            // A slot that declared no geometry must come back with none, so the projection default
            // keeps deciding. An invented 0.5 here would look like a restoration and be a resize.
            expect(Document.captureNodeHome(doc(), 'side-tabs')).toEqual({parentId: 'root', slot: 'right'});

            expect(Document.captureNodeHome(sizedEdgeDoc({extent: 0.3, nodeId: 'side-tabs', resizable: false}), 'side-tabs'))
                .toMatchObject({resizable: false})
        });

        test('AC-3/AC-7 the ROUND TRIP: an emptied edge slot comes back at the extent it left with', () => {
            const source = sizedEdgeDoc();

            const placement = Document.captureItemPlacement(source, 'terminal'),
                  detached  = Operations.applyOperation(source, {operation: 'detachItem', itemId: 'terminal'});

            expect(detached.errors).toEqual([]);
            expect(detached.document.nodes.root.zones.right, 'the descriptor went with the node').toBeUndefined();

            const {document: restored, errors} = Operations.applyOperation(detached.document, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors).toEqual([]);

            // The assertion is on the DOCUMENT's extent, not on a rendered width: a pixel figure also
            // moves when the projection legitimately re-lays-out, so it cannot isolate this property.
            expect(restored.nodes.root.zones.right).toMatchObject({extent: 0.42, resizable: true});
            expect(Document.getZoneNodeId(restored.nodes.root.zones.right)).toBe('side-tabs');
            expect(Document.validate(restored)).toEqual([])
        });

        test('AC-4 a SURVIVING descriptor keeps its own extent — a stale record never overwrites a live gesture', () => {
            const source    = sizedEdgeDoc(),
                  placement = Document.captureItemPlacement(source, 'terminal');

            // A vessel is long-lived: the user resizes that edge while the pane is out. The pane's
            // node survives here (it still holds the item), so the descriptor is never cleared.
            const widened = Document.clone(source);

            widened.nodes.root.zones.right.extent = 0.6;

            const {document: restored, errors} = Operations.applyOperation(widened, {
                operation: 'restoreTab', itemId: 'terminal', ...placement
            });

            expect(errors).toEqual([]);
            expect(restored.nodes.root.zones.right.extent, 'the newer gesture wins over the record').toBe(0.6)
        });

        test('AC-5 a CORRUPT recorded extent is discarded, and the document stays valid', () => {
            const source    = sizedEdgeDoc(),
                  placement = Document.captureItemPlacement(source, 'terminal');

            const {document: detached} = Operations.applyOperation(source, {operation: 'detachItem', itemId: 'terminal'});

            // `validate` rejects an extent outside the open interval (0, 1). A restore must fail
            // closed on a corrupt record rather than author a document the model would refuse.
            for (const bad of [0, 1, 1.5, -0.2, Number.NaN, Number.POSITIVE_INFINITY, '0.4']) {
                const home = {...placement.home, extent: bad};

                const {document: restored, errors} = Operations.applyOperation(detached, {
                    operation: 'restoreTab', itemId: 'terminal', ...placement, home
                });

                expect(errors, `extent ${String(bad)} still restores the pane`).toEqual([]);
                expect(Document.validate(restored), `extent ${String(bad)} never enters the document`).toEqual([]);
                expect(restored.nodes.root.zones.right.extent, `extent ${String(bad)} is dropped`).toBeUndefined()
            }
        });

        test('AC-6 the SPLIT branch is untouched — size and orientation still restore', () => {
            const source = splitDoc([0.7, 0.3]);

            const placement = Document.captureItemPlacement(source, 'terminal');

            expect(placement.home).toEqual({
                parentId: 'main-split', slot: 1, orientation: 'horizontal', size: 0.3, siblingId: 'main-tabs', position: 'after'
            });

            // No extent/resizable leaked onto a split home: they are the edge-zone counterpart, not
            // an addition to every record.
            expect(placement.home.extent).toBeUndefined();
            expect(placement.home.resizable).toBeUndefined()
        })
    });

    test.describe('captureItemPlacement (exact-position return, stored half)', () => {
        test('captures the holding tabs node and the exact index', () => {
            expect(Document.captureItemPlacement(doc(), 'strategy')).toEqual({tabsNodeId: 'main-tabs', index: 0, home: {parentId: 'root', slot: 'center'}});
            expect(Document.captureItemPlacement(doc(), 'swarm')).toEqual({tabsNodeId: 'main-tabs', index: 1, home: {parentId: 'root', slot: 'center'}});
            expect(Document.captureItemPlacement(doc(), 'terminal')).toEqual({tabsNodeId: 'side-tabs', index: 0, home: {parentId: 'root', slot: 'right'}})
        });

        test('fails closed when no tabs node holds the item — catalog presence is not placement', () => {
            expect(Document.captureItemPlacement(doc(), 'ghost')).toBeNull();

            // a DETACHED item stays in the catalog but has no placement to capture
            const {document: detached, errors} = Operations.applyOperation(doc(), {operation: 'detachItem', itemId: 'strategy'});

            expect(errors).toEqual([]);
            expect(detached.items.strategy).toBeTruthy();
            expect(Document.captureItemPlacement(detached, 'strategy')).toBeNull()
        });

        test('the ROUND TRIP: capture → detach → addTab with the stored pair restores the ORIGINAL order, not append order', () => {
            const source = doc();

            // 'strategy' sits at index 0 of ['strategy', 'swarm'] — the append default would
            // put it BACK at index 1, which is exactly the defect the stored pair compensates
            const placement = Document.captureItemPlacement(source, 'strategy');

            expect(placement).toEqual({tabsNodeId: 'main-tabs', index: 0, home: {parentId: 'root', slot: 'center'}});

            const {document: detached} = Operations.applyOperation(source, {operation: 'detachItem', itemId: 'strategy'});

            const {document: restored, errors} = Operations.applyOperation(detached, {
                operation : 'addTab',
                itemId    : 'strategy',
                tabsNodeId: placement.tabsNodeId,
                index     : placement.index
            });

            expect(errors).toEqual([]);
            expect(restored.nodes['main-tabs'].items, 'identical order, not append order').toEqual(['strategy', 'swarm']);

            // the control: WITHOUT the stored index the item lands at the tail — the append
            // default alone cannot deliver exact-position return
            const {document: appended} = Operations.applyOperation(detached, {
                operation: 'addTab', itemId: 'strategy', tabsNodeId: 'main-tabs'
            });

            expect(appended.nodes['main-tabs'].items).toEqual(['swarm', 'strategy'])
        })
    });

    test.describe('findOwningEdge (collapse-target derivation, §2.7)', () => {
        // Nested edge-zones: the OUTER root owns a `left` band holding an inner edge-zone, whose own
        // `top` band holds `buried`. Two directional ancestors, deliberately different edges, so a
        // wrong answer cannot coincide with the right one.
        const nested = () => ({
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {
                main  : {componentRef: 'main',   title: 'Main',   kind: 'panel'},
                buried: {componentRef: 'buried', title: 'Buried', kind: 'panel'},
                plain : {componentRef: 'plain',  title: 'Plain',  kind: 'panel'}
            },
            nodes: {
                root        : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}, left: {nodeId: 'inner'}}},
                'main-tabs' : {type: 'tabs', items: ['main'], activeItemId: 'main'},
                inner       : {type: 'edge-zone', zones: {center: {nodeId: 'plain-tabs'}, top: {nodeId: 'buried-tabs'}}},
                'plain-tabs': {type: 'tabs', items: ['plain'],  activeItemId: 'plain'},
                'buried-tabs': {type: 'tabs', items: ['buried'], activeItemId: 'buried'}
            }
        });

        test('an edge-owned item resolves its band; a center-owned item resolves null', () => {
            const d = doc();

            expect(Document.findOwningEdge(d, 'terminal')).toBe('right');

            // Center is not a claim: §2.7's fail-safe is that main content never rails.
            expect(Document.findOwningEdge(d, 'strategy')).toBe(null);
            expect(Document.findOwningEdge(d, 'swarm')).toBe(null)
        });

        test('resolves through an ancestor climb, not just a direct zone slot', () => {
            const d = doc();

            // `side-tabs` moves UNDER a split that occupies the right zone, so the item is now two
            // levels below the band. A derivation that only read the item's immediate parent slot
            // would answer null here and silently hide the collapse affordance.
            d.nodes['side-split']      = {type: 'split', orientation: 'vertical', children: ['side-tabs'], sizes: [1]};
            d.nodes.root.zones.right   = {nodeId: 'side-split'};

            expect(Document.findOwningEdge(d, 'terminal')).toBe('right')
        });

        test('an unknown item and a catalog-only item resolve null, never a stray edge', () => {
            const d = doc();

            expect(Document.findOwningEdge(d, 'ghost')).toBe(null);

            // `inspector` is in the catalog but not in the tree. Catalog presence is not placement —
            // the same rule `captureItemPlacement` fails closed on.
            expect(d.items.inspector).toBeTruthy();
            expect(Document.findOwningEdge(d, 'inspector')).toBe(null)
        });

        test('nested edge-zones: the OUTERMOST directional band wins, because that is the one that rails it', () => {
            const d = nested();

            // `buried` sits in inner.top, and inner sits in root.left. The projection collects the
            // root's `left` band with `collectAutoHiddenItems`, which recurses THROUGH `inner` and
            // claims the item first — so `left` is the rail it would actually reach, not `top`.
            expect(Document.findOwningEdge(d, 'buried')).toBe('left');

            // `plain` sits in the INNER edge-zone's center — but that whole edge-zone is inside root's
            // left band, and the collection recurses through it without treating a nested center as a
            // stop. So `plain` rails LEFT too. "Center never rails" is a rule about the center of the
            // edge-zone being projected, not about every center slot on the path.
            expect(Document.findOwningEdge(d, 'plain')).toBe('left');

            // The genuine fail-safe: reaching the root through the ROOT's center is no claim.
            expect(Document.findOwningEdge(d, 'main')).toBe(null)
        });

        /**
         * The agreement this query claims is with the RENDERED projection, so it is asserted against
         * `LayoutAdapter.project()` rather than against `collectAutoHiddenItems`.
         *
         * That distinction is the whole arm. The collection helper recurses correctly through nested
         * edge-zones, so it agrees with this query by construction — and a projection that disagreed
         * with BOTH sat invisible behind it: `projectEdgeZoneNode` restarted its claim set per node,
         * so a nested zone re-railed an item its ancestor already owned and simultaneously stopped
         * suppressing the ancestor's other claims in its own tab flow. Two derivations agreeing with
         * each other is not the property; agreeing with what renders is.
         */
        test('agrees with the RENDERED projection: one rail per railed item, none left in tab flow', () => {
            const d = nested();

            d.items.buried.autoHidden = true;
            d.items.plain.autoHidden  = true;
            d.items.main.autoHidden   = true;

            const projected = LayoutAdapter.project(d, {
                      resolveComponentRef: componentRef => ({ntype: 'component', reference: componentRef})
                  }),
                  rails   = [],
                  tabFlow = [];

            (function walk(config) {
                if (!config || typeof config !== 'object') return;

                if (config.dockNodeType === 'edge-rail') {
                    config.railItems?.forEach(tab => rails.push({edge: config.dockEdge, itemId: tab.dockItemId}))
                }

                // The tab flow's own id list, read where the projection actually writes it: the
                // header toolbar's SortZone config, which is the list the rendered strip is built
                // from rather than a re-derivation of it.
                config.headerToolbar?.sortZoneConfig?.dockItemIds?.forEach(itemId => tabFlow.push(itemId));
                Array.isArray(config.items) && config.items.forEach(walk)
            })(projected);

            // Non-vacuity: `not.toContain` on an empty array passes for the wrong reason, so the walk
            // must be shown to have found the tab flow at all before anything is asserted absent from it.
            expect(tabFlow.length, 'the walk reached a rendered tab flow to assert against').toBeGreaterThan(0);
            expect(rails.length, 'and reached a rendered rail').toBeGreaterThan(0);

            // `buried` sits two edge-zones deep and `plain` in the inner zone's center; both belong to
            // the ROOT's left band, which is the answer `findOwningEdge` gives. Each must render on
            // exactly one rail — `toEqual` on the collected edges is what forbids the second one.
            ['buried', 'plain'].forEach(itemId => {
                expect(rails.filter(rail => rail.itemId === itemId).map(rail => rail.edge),
                    `${itemId} rails exactly once, on the band the query names`)
                    .toEqual([Document.findOwningEdge(d, itemId)]);

                expect(tabFlow, `${itemId} left the tab flow it railed out of`).not.toContain(itemId)
            });

            // The negative half. `main` is auto-hidden in the ROOT's center: §2.7's fail-safe keeps it
            // in the tab flow rather than railing it, and the query agrees by answering null. Without
            // this the arm above could pass by railing everything.
            expect(Document.findOwningEdge(d, 'main')).toBe(null);
            expect(rails.map(rail => rail.itemId), 'center content is never railed').not.toContain('main');
            expect(tabFlow, 'and it stays visible instead of vanishing').toContain('main')
        });

        test('a cyclic document terminates instead of hanging the render thread', () => {
            const d = doc();

            // Not a shape `validate` admits — but this query also runs against documents mid-operation,
            // and an unbounded climb would spin forever rather than fail. `a` and `b` are each other's
            // parent, so the climb out of `side-tabs` returns to a node it has already visited.
            delete d.nodes.root.zones.right;

            d.nodes.a = {type: 'split', orientation: 'vertical',   children: ['b'],              sizes: [1]};
            d.nodes.b = {type: 'split', orientation: 'horizontal', children: ['a', 'side-tabs'], sizes: [0.5, 0.5]};

            // No edge-zone ancestor is reachable at all, so the fail-safe answer is null — and the
            // point of the assertion is that it ARRIVES.
            expect(Document.findOwningEdge(d, 'terminal')).toBe(null)
        })
    });

    test.describe('resolveStackRoot (whole-stack source projection)', () => {
        // The canonical vessel document: an edge-zone ROOT (window chrome) whose center zone
        // holds the stack — so the transferable whole is the root's center child, never the root.
        const vessel = () => ({
            schema: 'neo.dock.zone.v1',
            root  : 'popup-root',
            items : {
                drill : {componentRef: 'drill',  title: 'Drill',  kind: 'panel'},
                stream: {componentRef: 'stream', title: 'Stream', kind: 'panel'}
            },
            nodes : {
                'popup-root': {type: 'edge-zone', zones: {center: {nodeId: 'popup-tabs'}}},
                'popup-tabs': {type: 'tabs', items: ['drill', 'stream'], activeItemId: 'drill'}
            }
        });

        test('resolves the canonical vessel shape: the root edge-zone\'s center child IS the stack', () => {
            expect(Document.resolveStackRoot(vessel())).toBe('popup-tabs');

            // the shared main-document fixture resolves too — the rule is the document shape,
            // not a vessel special case
            expect(Document.resolveStackRoot(doc())).toBe('main-tabs')
        });

        test('fails closed on every unprovable shape', () => {
            expect(Document.resolveStackRoot(null)).toBeNull();
            expect(Document.resolveStackRoot({})).toBeNull();

            const missingRoot = vessel();
            delete missingRoot.nodes['popup-root'];
            expect(Document.resolveStackRoot(missingRoot)).toBeNull();

            // a degenerate workspace whose root IS a tabs node has no projectable stack
            expect(Document.resolveStackRoot({
                schema: 'neo.dock.zone.v1',
                root  : 'only-tabs',
                items : {},
                nodes : {'only-tabs': {type: 'tabs', items: [], activeItemId: null}}
            })).toBeNull();

            const noCenter = vessel();
            delete noCenter.nodes['popup-root'].zones.center;
            expect(Document.resolveStackRoot(noCenter)).toBeNull();

            const ghostCenter = vessel();
            ghostCenter.nodes['popup-root'].zones.center.nodeId = 'ghost';
            expect(Document.resolveStackRoot(ghostCenter)).toBeNull()
        });

        test('COMPOSES with transferNode: the resolved stack transfers whole and atomically — while the root door stays shut', () => {
            // the negative control first: the DOCUMENT ROOT still rejects — explicit resolution
            // is the only path to a whole-stack transfer
            const rejected = Operations.transferNode(vessel(), doc(), {
                nodeId           : 'popup-root',
                sourceWorkspaceId: 'popup-1',
                targetWorkspaceId: 'main',
                target           : {targetNodeId: 'main-tabs', placement: {orientation: 'horizontal', edge: 'right'}}
            });

            expect(rejected.errors.join(' ')).toContain('cannot transfer the root node');

            // the resolved stack: ONE atomic two-document transfer through the landed executor
            const
                source    = vessel(),
                stackRoot = Document.resolveStackRoot(source);

            const {sourceDocument, targetDocument, errors} = Operations.transferNode(source, doc(), {
                nodeId           : stackRoot,
                sourceWorkspaceId: 'popup-1',
                targetWorkspaceId: 'main',
                target           : {targetNodeId: 'main-tabs', placement: {orientation: 'horizontal', edge: 'right'}}
            });

            expect(errors).toEqual([]);

            // target: the stack node arrived INTACT — same node id, same member order, same active item
            expect(targetDocument.nodes['popup-tabs']).toEqual({type: 'tabs', items: ['drill', 'stream'], activeItemId: 'drill'});
            expect(targetDocument.items.drill).toBeTruthy();
            expect(targetDocument.items.stream).toBeTruthy();

            // source: emptied but VALID — the vessel document survives its stack's departure,
            // which is the precondition for the separate emptied-entry disposition decision
            expect(sourceDocument.nodes['popup-tabs']).toBeUndefined();
            expect(sourceDocument.items.drill).toBeUndefined();
            expect(sourceDocument.items.stream).toBeUndefined();
            expect(Document.validate(sourceDocument)).toEqual([])
        })
    });

    test.describe('transferItem (atomic two-document transfer)', () => {
        // A second workspace document with a distinct catalog, so a transfer into it never
        // collides on item id with the source doc()'s 'terminal'.
        const target = () => ({
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'}},
            nodes : {
                root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}},
                'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
            }
        });

        const addTabTarget = {operation: 'addTab', tabsNodeId: 'main-tabs'};

        test('moves an item across documents: source loses it (tree + catalog), target gains it, both valid', () => {
            const {sourceDocument, targetDocument, errors} = Operations.transferItem(doc(), target(), {
                itemId: 'terminal', sourceWorkspaceId: 'A', targetWorkspaceId: 'B', target: addTabTarget
            });

            expect(errors).toEqual([]);
            // source: terminal gone from catalog + tree; the emptied side-tabs collapsed + its edge zone pruned
            expect(sourceDocument.items.terminal).toBeUndefined();
            expect(Document.findContainingTabsId(sourceDocument, 'terminal')).toBeNull();
            expect(sourceDocument.nodes['side-tabs']).toBeUndefined();
            expect(sourceDocument.nodes.root.zones.right).toBeUndefined();
            // target: terminal now in catalog + main-tabs tree
            expect(targetDocument.items.terminal).toBeDefined();
            expect(targetDocument.nodes['main-tabs'].items).toContain('terminal');
            // both documents remain contract-valid
            expect(Document.validate(sourceDocument)).toEqual([]);
            expect(Document.validate(targetDocument)).toEqual([])
        });

        test('the item record travels verbatim — policy hints, metadata, and a railed autoHidden state intact', () => {
            const record = {componentRef: 'terminal', title: 'Terminal', kind: 'terminal', closable: false, pinnable: true, movable: true, autoHidden: true, metadata: {pid: 42}};
            const source = doc();

            source.items.terminal = {...record};

            const {targetDocument, errors} = Operations.transferItem(source, target(), {itemId: 'terminal', target: addTabTarget});

            expect(errors).toEqual([]);
            expect(targetDocument.items.terminal).toEqual(record);        // verbatim, incl. autoHidden
            expect(Document.validate(targetDocument)).toEqual([])    // a railed item is a valid arrival
        });

        test('atomic: a target-side placement failure leaves BOTH documents untouched (source byte-identical)', () => {
            const source         = doc();
            const tgt            = target();
            const sourceSnapshot = JSON.parse(JSON.stringify(source));
            const tgtSnapshot    = JSON.parse(JSON.stringify(tgt));

            // the nested target points at a node that does not exist → placement fails
            const {sourceDocument, targetDocument, errors} = Operations.transferItem(source, tgt, {
                itemId: 'terminal', target: {operation: 'addTab', tabsNodeId: 'ghost-tabs'}
            });

            expect(errors.length).toBeGreaterThan(0);
            expect(sourceDocument).toEqual(sourceSnapshot);   // source never half-transferred
            expect(targetDocument).toEqual(tgtSnapshot);      // target never received it
            expect(sourceDocument.items.terminal).toBeDefined()
        });

        test('rejects an unmovable item fail-closed, both documents untouched', () => {
            const source = doc();

            source.items.terminal.movable = false;

            const {sourceDocument, targetDocument, errors} = Operations.transferItem(source, target(), {itemId: 'terminal', target: addTabTarget});

            expect(errors.join(' ')).toContain('movable');
            expect(sourceDocument.items.terminal).toBeDefined();
            expect(targetDocument.items.terminal).toBeUndefined()
        });

        test('rejects an unknown item fail-closed', () => {
            const {errors} = Operations.transferItem(doc(), target(), {itemId: 'ghost', target: addTabTarget});
            expect(errors.join(' ')).toContain('unknown item')
        });

        test('rejects a transfer when the target already holds the item id', () => {
            const tgt = target();

            tgt.items.terminal = {componentRef: 'terminal', title: 'Terminal', kind: 'terminal'};

            const {errors} = Operations.transferItem(doc(), tgt, {itemId: 'terminal', target: addTabTarget});
            expect(errors.join(' ')).toContain('already exists in the target')
        });

        test('rejects a same-workspace transfer (that is a moveItem, not a transfer)', () => {
            const {errors} = Operations.transferItem(doc(), target(), {
                itemId: 'terminal', sourceWorkspaceId: 'A', targetWorkspaceId: 'A', target: addTabTarget
            });

            expect(errors.join(' ')).toContain('distinct source and target')
        });

        test('rejects a nested target that is not a placement descriptor (addTab / splitNode)', () => {
            const {errors} = Operations.transferItem(doc(), target(), {itemId: 'terminal', target: {operation: 'closeItem'}});
            expect(errors.join(' ')).toContain('addTab or splitNode')
        });

        test('reuses the landed placement validation — a malformed nested target fails closed, source untouched', () => {
            const {sourceDocument, errors} = Operations.transferItem(doc(), target(), {
                itemId: 'terminal', target: {operation: 'splitNode', targetNodeId: 'main-tabs', orientation: 'sideways'}
            });

            expect(errors.length).toBeGreaterThan(0);
            expect(sourceDocument.items.terminal).toBeDefined()
        });

        test('places via a splitNode target descriptor', () => {
            const {targetDocument, errors} = Operations.transferItem(doc(), target(), {
                itemId: 'terminal',
                target: {operation: 'splitNode', targetNodeId: 'main-tabs', orientation: 'vertical', position: 'after', sizes: [0.5, 0.5]}
            });

            expect(errors).toEqual([]);
            expect(targetDocument.items.terminal).toBeDefined();
            expect(Document.findContainingTabsId(targetDocument, 'terminal')).not.toBeNull();
            expect(Document.validate(targetDocument)).toEqual([])
        });

        test('applyOperation redirects a single-document transferItem descriptor to the two-document method', () => {
            const input              = doc();
            const {document, errors} = Operations.applyOperation(input, {operation: 'transferItem', itemId: 'terminal'});

            expect(errors.join(' ')).toContain('two-document operation');
            expect(document).toEqual(input)   // untouched
        });

        test('transferItem joins the exported operation vocabulary (SSOT)', () => {
            expect(Operations.operations).toContain('transferItem')
        })
    });

    test.describe('moveNode (grouped-drag subtree re-parent)', () => {
        test('split placement wraps target + moved subtree in a new split; old slot pruned; subtree intact', () => {
            const {document, errors} = Operations.moveNode(doc(), {
                nodeId: 'side-tabs', targetNodeId: 'main-tabs', placement: {orientation: 'vertical', position: 'after'}
            });

            expect(errors).toEqual([]);

            const centerId = document.nodes.root.zones.center.nodeId;

            expect(document.nodes[centerId].type).toBe('split');
            expect(document.nodes[centerId].children).toContain('main-tabs');
            expect(document.nodes[centerId].children).toContain('side-tabs');
            expect(document.nodes.root.zones.right).toBeUndefined();                            // moved out of its old edge slot
            expect(Document.findContainingTabsId(document, 'terminal')).toBe('side-tabs'); // the moved subtree is intact
            expect(Document.validate(document)).toEqual([])
        });

        test('tab-into placement merges the moved tabs items into the target in order, then drops the node', () => {
            const {document, errors} = Operations.moveNode(doc(), {
                nodeId: 'side-tabs', targetNodeId: 'main-tabs', placement: {kind: 'tab-into'}
            });

            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['strategy', 'swarm', 'terminal']);
            expect(document.nodes['side-tabs']).toBeUndefined();
            expect(document.nodes.root.zones.right).toBeUndefined();
            expect(Document.validate(document)).toEqual([])
        });

        test('cycle guard: moving a node into its own subtree fails closed, document untouched', () => {
            const input              = splitDoc();
            const {document, errors} = Operations.moveNode(input, {
                nodeId: 'main-split', targetNodeId: 'main-tabs', placement: {orientation: 'vertical'}
            });

            expect(errors.join(' ')).toContain('own subtree');
            expect(document).toEqual(input)
        });

        test('fails closed on unknown node, unknown target, the root, or a self-move', () => {
            const move = args => Operations.moveNode(doc(), {placement: {orientation: 'vertical'}, ...args}).errors.join(' ');

            expect(move({nodeId: 'ghost',     targetNodeId: 'main-tabs'})).toContain('unknown node');
            expect(move({nodeId: 'side-tabs', targetNodeId: 'ghost'})).toContain('unknown target');
            expect(move({nodeId: 'root',      targetNodeId: 'main-tabs'})).toContain('root');
            expect(move({nodeId: 'main-tabs', targetNodeId: 'main-tabs'})).toContain('onto itself')
        });

        test('fails closed on a bad split orientation or a tab-into targeting a non-tabs node', () => {
            expect(Operations.moveNode(doc(), {nodeId: 'side-tabs', targetNodeId: 'main-tabs', placement: {orientation: 'diagonal'}}).errors.join(' ')).toContain('orientation');
            expect(Operations.moveNode(doc(), {nodeId: 'side-tabs', targetNodeId: 'root', placement: {kind: 'tab-into'}}).errors.join(' ')).toContain('tabs nodes')
        });

        test('renormalizes surviving sizes when a node leaves a 3-child split (ratios preserved, not reset to equal)', () => {
            const d = doc();

            d.nodes = {
                root: {type: 'edge-zone', zones: {center: {nodeId: 'tri'}}},
                tri : {type: 'split', orientation: 'horizontal', children: ['a', 'b', 'c'], sizes: [0.2, 0.3, 0.5]},
                a   : {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'},
                b   : {type: 'tabs', items: ['swarm'],    activeItemId: 'swarm'},
                c   : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
            };

            // move 'a' (0.2) as a tab into 'c'; surviving [b, c] sizes (0.3, 0.5) renormalize to (0.375, 0.625)
            const {document, errors} = Operations.moveNode(d, {nodeId: 'a', targetNodeId: 'c', placement: {kind: 'tab-into'}});

            expect(errors).toEqual([]);
            expect(document.nodes.tri.children).toEqual(['b', 'c']);
            expect(document.nodes.tri.sizes[0]).toBeCloseTo(0.375);
            expect(document.nodes.tri.sizes[1]).toBeCloseTo(0.625);
            expect(Document.validate(document)).toEqual([])
        });

        test('applyOperation dispatches moveNode; the op joins the exported vocabulary', () => {
            const {document, errors} = Operations.applyOperation(doc(), {
                operation: 'moveNode', nodeId: 'side-tabs', targetNodeId: 'main-tabs', placement: {kind: 'tab-into'}
            });

            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toContain('terminal');
            expect(Operations.operations).toContain('moveNode')
        })
    });

    test.describe('transferNode (atomic two-document subtree transfer)', () => {
        // A second workspace with a distinct catalog + a `main-tabs` to attach into.
        const target = () => ({
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {alpha: {componentRef: 'alpha', title: 'Alpha', kind: 'panel'}},
            nodes : {
                root       : {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}},
                'main-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
            }
        });

        const splitInto = {targetNodeId: 'main-tabs', placement: {orientation: 'vertical', position: 'after'}};

        test('transfers a subtree across documents: source loses it, target gains its nodes + member records, both valid', () => {
            const {sourceDocument, targetDocument, errors} = Operations.transferNode(doc(), target(), {
                nodeId: 'side-tabs', sourceWorkspaceId: 'A', targetWorkspaceId: 'B', target: splitInto
            });

            expect(errors).toEqual([]);
            expect(sourceDocument.nodes['side-tabs']).toBeUndefined();
            expect(sourceDocument.items.terminal).toBeUndefined();
            expect(sourceDocument.nodes.root.zones.right).toBeUndefined();
            expect(targetDocument.nodes['side-tabs']).toBeDefined();
            expect(targetDocument.items.terminal).toBeDefined();
            expect(Document.findContainingTabsId(targetDocument, 'terminal')).toBe('side-tabs');
            expect(Document.validate(sourceDocument)).toEqual([]);
            expect(Document.validate(targetDocument)).toEqual([])
        });

        test('a multi-node subtree travels whole — every member node and item re-homes verbatim', () => {
            const source = doc();

            source.items.log   = {componentRef: 'log',   title: 'Log',   kind: 'panel'};
            source.items.watch = {componentRef: 'watch', title: 'Watch', kind: 'panel'};
            source.nodes['grp-a'] = {type: 'tabs', items: ['log'],   activeItemId: 'log'};
            source.nodes['grp-b'] = {type: 'tabs', items: ['watch'], activeItemId: 'watch'};
            source.nodes.grp      = {type: 'split', orientation: 'horizontal', children: ['grp-a', 'grp-b'], sizes: [0.5, 0.5]};
            source.nodes.root.zones.right = {nodeId: 'grp'};
            delete source.nodes['side-tabs'];
            delete source.items.terminal;

            const {sourceDocument, targetDocument, errors} = Operations.transferNode(source, target(), {
                nodeId: 'grp', target: {targetNodeId: 'main-tabs', placement: {orientation: 'vertical'}}
            });

            expect(errors).toEqual([]);
            ['grp', 'grp-a', 'grp-b'].forEach(id => expect(sourceDocument.nodes[id]).toBeUndefined());
            expect(sourceDocument.items.log).toBeUndefined();
            ['grp', 'grp-a', 'grp-b'].forEach(id => expect(targetDocument.nodes[id]).toBeDefined());
            expect(targetDocument.items.watch).toEqual(source.items.watch);   // verbatim
            expect(Document.validate(sourceDocument)).toEqual([]);
            expect(Document.validate(targetDocument)).toEqual([])
        });

        test('atomic: an attach failure after preconditions leaves BOTH documents untouched (source byte-identical)', () => {
            const source  = doc();
            const srcSnap = JSON.parse(JSON.stringify(source));

            const {sourceDocument, targetDocument, errors} = Operations.transferNode(source, target(), {
                nodeId: 'side-tabs', target: {targetNodeId: 'main-tabs', placement: {orientation: 'diagonal'}}
            });

            expect(errors.join(' ')).toContain('orientation');
            expect(sourceDocument).toEqual(srcSnap);                       // source never half-transferred
            expect(targetDocument.nodes['side-tabs']).toBeUndefined()      // target never received it
        });

        test('rejects a node-id already present in the target', () => {
            const tgt = target();

            tgt.nodes['side-tabs'] = {type: 'tabs', items: [], activeItemId: null};

            const {errors} = Operations.transferNode(doc(), tgt, {nodeId: 'side-tabs', target: splitInto});
            expect(errors.join(' ')).toContain('node "side-tabs" already exists')
        });

        test('rejects when a member item id already exists in the target', () => {
            const tgt = target();

            tgt.items.terminal = {componentRef: 'terminal', title: 'T', kind: 'terminal'};

            const {errors} = Operations.transferNode(doc(), tgt, {nodeId: 'side-tabs', target: splitInto});
            expect(errors.join(' ')).toContain('item "terminal" already exists')
        });

        test('rejects an unmovable member, the root node, and a same-workspace transfer', () => {
            const src = doc();

            src.items.terminal.movable = false;

            expect(Operations.transferNode(src, target(), {nodeId: 'side-tabs', target: splitInto}).errors.join(' ')).toContain('movable');
            expect(Operations.transferNode(doc(), target(), {nodeId: 'root', target: splitInto}).errors.join(' ')).toContain('root');
            expect(Operations.transferNode(doc(), target(), {nodeId: 'side-tabs', sourceWorkspaceId: 'X', targetWorkspaceId: 'X', target: splitInto}).errors.join(' ')).toContain('distinct source and target')
        });

        test('applyOperation redirects transferNode to the two-document method; the op joins the vocabulary', () => {
            const input              = doc();
            const {document, errors} = Operations.applyOperation(input, {operation: 'transferNode', nodeId: 'side-tabs'});

            expect(errors.join(' ')).toContain('two-document operation');
            expect(document).toEqual(input);
            expect(Operations.operations).toContain('transferNode')
        })
    });

    test.describe('runtime-only preview keys never enter committed / persisted state', () => {
        // a document smuggling a forbidden preview key through the opaque item metadata channel
        const tainted = () => {
            const d = doc();

            d.items.terminal.metadata = {groupNodeId: 'tabs'};

            return d
        };

        test('validate rejects a forbidden preview key nested in item metadata', () => {
            expect(Document.validate(tainted()).join(' ')).toContain('runtime-only preview field "groupNodeId"')
        });

        test('createSavedLayout refuses to persist a smuggled preview key (fail-closed, layout null)', () => {
            const {layout, errors} = Persistence.createSavedLayout(tainted(), {layoutId: 'x', title: 'X'});

            expect(layout).toBeNull();
            expect(errors.join(' ')).toContain('groupNodeId')
        });

        test('restoreSavedLayout rejects a saved layout whose dockZone carries a preview key', () => {
            const wrapper = {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId         : 'x',
                title            : 'X',
                dockZone         : tainted(),
                metadata         : {},
                captureScope     : 'window',
                windowFingerprint: null
            };

            const {document, errors} = Persistence.restoreSavedLayout(wrapper);

            expect(document).toBeNull();
            expect(errors.join(' ')).toContain('groupNodeId')
        });

        test('a clean document round-trips through save + restore unaffected (no false positive)', () => {
            const {layout, errors} = Persistence.createSavedLayout(doc(), {layoutId: 'x', title: 'X'});

            expect(errors).toEqual([]);
            expect(layout).not.toBeNull();
            expect(Persistence.restoreSavedLayout(layout).errors).toEqual([])
        });

        test('the forbidden-preview-key set is the model-owned SSOT (adapter projection reads the same finder)', () => {
            expect(Document.forbiddenPreviewKeys.has('groupNodeId')).toBe(true);
            expect(Document.findForbiddenPreviewKey({items: {a: {metadata: {pointerX: 1}}}})).toBe('pointerX')
        })
    });
});
