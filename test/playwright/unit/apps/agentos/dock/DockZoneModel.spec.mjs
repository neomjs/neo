import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSDockZoneModelTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import DockZoneModel  from '../../../../../../apps/agentos/dock/DockZoneModel.mjs';

/**
 * @summary Tests for AgentOS.dock.DockZoneModel — the dock-zone semantic operations executor.
 * Pure-JSON: validity invariants, each operation, fail-closed behavior, normalizeTree collapse,
 * and the previewToOperation descriptor seam. No component construction needed.
 */

/**
 * A fresh canonical dockZone.v1 document. `inspector` is a catalog-only item (not yet in the tree),
 * used to exercise insert/split of a brand-new pane.
 * @returns {Object}
 */
function doc() {
    return {
        schema: 'neo.harness.dockZone.v1',
        root  : 'root',
        items : {
            strategy : {componentRef: 'strategy',  title: 'Strategy',  kind: 'panel'},
            swarm    : {componentRef: 'swarm',     title: 'Swarm',     kind: 'panel'},
            terminal : {componentRef: 'terminal',  title: 'Terminal',  kind: 'terminal'},
            inspector: {componentRef: 'inspector', title: 'Inspector', kind: 'inspector'}
        },
        nodes: {
            root        : {type: 'edge-zone', zones: {center: 'main-tabs', right: 'side-tabs'}},
            'main-tabs' : {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'swarm'},
            'side-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

/** Collects the tabs node id holding an item, across a document. */
function tabsOf(document, itemId) {
    return DockZoneModel.findContainingTabsId(document, itemId)
}

test.describe('AgentOS.dock.DockZoneModel', () => {
    test.describe('validate (invariants)', () => {
        test('accepts the canonical document', () => {
            expect(DockZoneModel.validate(doc())).toEqual([])
        });

        test('rejects a wrong schema', () => {
            const d = doc();
            d.schema = 'neo.harness.dockZone.v2';
            expect(DockZoneModel.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects a missing root', () => {
            const d = doc();
            d.root = 'ghost';
            expect(DockZoneModel.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects a dangling node reference', () => {
            const d = doc();
            d.nodes.root.zones.center = 'does-not-exist';
            expect(DockZoneModel.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects an item used in two tabs nodes', () => {
            const d = doc();
            d.nodes['side-tabs'].items.push('strategy'); // strategy now in main-tabs AND side-tabs
            expect(DockZoneModel.validate(d).join(' ')).toContain('strategy');
            expect(DockZoneModel.validate(d).length).toBeGreaterThan(0)
        });

        test('rejects split sizes that mismatch or do not sum to 1', () => {
            const d = doc();
            d.nodes.split = {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5]};
            d.nodes.root.zones.center = 'split';
            delete d.nodes.root.zones.right;
            expect(DockZoneModel.validate(d).length).toBeGreaterThan(0);

            d.nodes.split.sizes = [0.5, 0.9];
            expect(DockZoneModel.validate(d).join(' ')).toContain('sum to 1')
        });

        test('rejects an activeItemId not among the tab items', () => {
            const d = doc();
            d.nodes['main-tabs'].activeItemId = 'terminal';
            expect(DockZoneModel.validate(d).length).toBeGreaterThan(0)
        })
    });

    test.describe('addTab', () => {
        test('inserts a catalog-only item at index and makes it active', () => {
            const {document, errors} = DockZoneModel.addTab(doc(), {itemId: 'inspector', tabsNodeId: 'main-tabs', index: 1});
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['strategy', 'inspector', 'swarm']);
            expect(document.nodes['main-tabs'].activeItemId).toBe('inspector')
        });

        test('relocates an item already in the tree without duplicating it', () => {
            const {document, errors} = DockZoneModel.addTab(doc(), {itemId: 'terminal', tabsNodeId: 'main-tabs', index: 0});
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['terminal', 'strategy', 'swarm']);
            // side-tabs emptied -> collapsed by normalizeTree, and its edge zone pruned
            expect(document.nodes['side-tabs']).toBeUndefined();
            expect(document.nodes.root.zones.right).toBeUndefined();
            // terminal appears exactly once
            expect(DockZoneModel.validate(document)).toEqual([])
        });

        test('fails closed on an unknown item (document untouched)', () => {
            const input = doc();
            const {document, errors} = DockZoneModel.addTab(input, {itemId: 'ghost', tabsNodeId: 'main-tabs'});
            expect(errors.length).toBeGreaterThan(0);
            expect(document).toBe(input)
        });

        test('fails closed when the target is not a tabs node', () => {
            const {errors} = DockZoneModel.addTab(doc(), {itemId: 'inspector', tabsNodeId: 'root'});
            expect(errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('moveItem', () => {
        test('relocates an in-tree item to another tabs node', () => {
            const {document, errors} = DockZoneModel.moveItem(doc(), {itemId: 'strategy', targetNodeId: 'side-tabs', index: 0});
            expect(errors).toEqual([]);
            expect(document.nodes['side-tabs'].items).toEqual(['strategy', 'terminal']);
            expect(document.nodes['main-tabs'].items).toEqual(['swarm'])
        });

        test('fails closed when the item is not in the tree', () => {
            const {errors} = DockZoneModel.moveItem(doc(), {itemId: 'inspector', targetNodeId: 'main-tabs'});
            expect(errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('splitNode', () => {
        test('splits a node after the target, wrapping the item in a new pane', () => {
            const {document, errors} = DockZoneModel.splitNode(doc(), {
                itemId: 'inspector', targetNodeId: 'main-tabs', orientation: 'horizontal', position: 'after', sizes: [0.6, 0.4]
            });
            expect(errors).toEqual([]);
            // root.zones.center now points at a split holding [main-tabs, <new tabs with inspector>]
            const splitId = document.nodes.root.zones.center,
                  split   = document.nodes[splitId];
            expect(split.type).toBe('split');
            expect(split.orientation).toBe('horizontal');
            expect(split.children[0]).toBe('main-tabs');
            expect(document.nodes[split.children[1]].items).toEqual(['inspector']);
            expect(split.sizes).toEqual([0.6, 0.4])
        });

        test('splits before the target (new pane first)', () => {
            const {document, errors} = DockZoneModel.splitNode(doc(), {
                itemId: 'inspector', targetNodeId: 'side-tabs', orientation: 'vertical', position: 'before', sizes: [0.3, 0.7]
            });
            expect(errors).toEqual([]);
            const splitId = document.nodes.root.zones.right,
                  split   = document.nodes[splitId];
            expect(document.nodes[split.children[0]].items).toEqual(['inspector']);
            expect(split.children[1]).toBe('side-tabs')
        });

        test('splitting the root makes the new split the root', () => {
            const {document, errors} = DockZoneModel.splitNode(doc(), {
                itemId: 'inspector', targetNodeId: 'root', orientation: 'vertical', position: 'after'
            });
            expect(errors).toEqual([]);
            expect(document.nodes[document.root].type).toBe('split');
            expect(document.nodes[document.root].children).toContain('root')
        });

        test('detaches the item from its old location (no duplication)', () => {
            const {document, errors} = DockZoneModel.splitNode(doc(), {
                itemId: 'swarm', targetNodeId: 'side-tabs', orientation: 'vertical', position: 'after'
            });
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['strategy']);
            expect(DockZoneModel.validate(document)).toEqual([])
        });

        test('fails closed on an unknown item, unknown target, or bad orientation', () => {
            expect(DockZoneModel.splitNode(doc(), {itemId: 'ghost', targetNodeId: 'main-tabs', orientation: 'horizontal'}).errors.length).toBeGreaterThan(0);
            expect(DockZoneModel.splitNode(doc(), {itemId: 'inspector', targetNodeId: 'ghost', orientation: 'horizontal'}).errors.length).toBeGreaterThan(0);
            expect(DockZoneModel.splitNode(doc(), {itemId: 'inspector', targetNodeId: 'main-tabs', orientation: 'diagonal'}).errors.length).toBeGreaterThan(0)
        })
    });

    test.describe('detachItem / closeItem', () => {
        test('detachItem removes from the tree but keeps the catalog record', () => {
            const {document, errors} = DockZoneModel.detachItem(doc(), {itemId: 'terminal'});
            expect(errors).toEqual([]);
            expect(DockZoneModel.findContainingTabsId(document, 'terminal')).toBe(null);
            expect(document.items.terminal).toBeDefined()
        });

        test('closeItem removes from both the tree and the catalog', () => {
            const {document, errors} = DockZoneModel.closeItem(doc(), {itemId: 'terminal'});
            expect(errors).toEqual([]);
            expect(document.items.terminal).toBeUndefined()
        })
    });

    test.describe('normalizeTree', () => {
        test('collapses an emptied tabs node and prunes its edge zone', () => {
            const d = doc();
            d.nodes['side-tabs'].items = [];
            const out = DockZoneModel.normalizeTree(d);
            expect(out.nodes['side-tabs']).toBeUndefined();
            expect(out.nodes.root.zones.right).toBeUndefined()
        });

        test('collapses a single-child split into its child', () => {
            const d = doc();
            d.nodes.split = {type: 'split', orientation: 'horizontal', children: ['main-tabs'], sizes: [1]};
            d.nodes.root.zones.center = 'split';
            const out = DockZoneModel.normalizeTree(d);
            expect(out.nodes.split).toBeUndefined();
            expect(out.nodes.root.zones.center).toBe('main-tabs')
        });

        test('prunes nodes unreachable from the root', () => {
            const d = doc();
            d.nodes.orphan = {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'};
            const out = DockZoneModel.normalizeTree(d);
            expect(out.nodes.orphan).toBeUndefined()
        })
    });

    test.describe('applyOperation (DockPreview descriptor seam)', () => {
        test('dispatches addTab, downgrading to a move when the item is already in the tree', () => {
            const {document, errors} = DockZoneModel.applyOperation(doc(), {operation: 'addTab', itemId: 'terminal', tabsNodeId: 'main-tabs', index: 0});
            expect(errors).toEqual([]);
            expect(document.nodes['main-tabs'].items).toEqual(['terminal', 'strategy', 'swarm']);
            expect(DockZoneModel.validate(document)).toEqual([])
        });

        test('dispatches splitNode from a previewToOperation-shaped descriptor', () => {
            const descriptor = {operation: 'splitNode', itemId: 'inspector', targetNodeId: 'main-tabs', orientation: 'horizontal', position: 'after', sizes: [0.5, 0.5]};
            const {document, errors} = DockZoneModel.applyOperation(doc(), descriptor);
            expect(errors).toEqual([]);
            expect(document.nodes[document.nodes.root.zones.center].type).toBe('split')
        });

        test('rejects an unknown operation', () => {
            expect(DockZoneModel.applyOperation(doc(), {operation: 'frobnicate'}).errors.length).toBeGreaterThan(0)
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
                const descriptor = {operation: 'splitNode', itemId: 'inspector', targetNodeId: c.target, edge: c.edge, orientation: c.orientation, sizes: [0.5, 0.5]};
                const {document, errors} = DockZoneModel.applyOperation(doc(), descriptor);
                expect(errors).toEqual([]);

                const split   = document.nodes[document.nodes.root.zones[c.zone]],
                      newPane = c.lead ? split.children[0] : split.children[1],
                      keep    = c.lead ? split.children[1] : split.children[0];

                expect(split.type).toBe('split');
                expect(split.orientation).toBe(c.orientation);
                expect(document.nodes[newPane].items).toEqual(['inspector']);
                expect(keep).toBe(c.target);
                expect(DockZoneModel.validate(document)).toEqual([])
            })
        }
    })
});
