import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockLayoutAdapterTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockLayoutAdapter from '../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockSplitter      from '../../../../src/dashboard/DockSplitter.mjs';
import DockZoneModel     from '../../../../src/dashboard/DockZoneModel.mjs';

const createModel = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy: {
            componentRef: 'strategy',
            title       : 'Strategy',
            kind        : 'panel'
        },
        swarm: {
            componentRef: 'swarm',
            title       : 'Swarm',
            kind        : 'panel'
        },
        terminal: {
            componentRef: 'terminal',
            title       : 'Terminal',
            kind        : 'terminal'
        },
        missing: {
            componentRef: 'missing',
            title       : 'Missing',
            kind        : 'panel'
        }
    },
    nodes: {
        root: {
            type       : 'split',
            orientation: 'horizontal',
            children   : ['main-tabs', 'side-split'],
            sizes      : [0.7, 0.3]
        },
        'main-tabs': {
            type        : 'tabs',
            items       : ['strategy', 'swarm'],
            activeItemId: 'swarm'
        },
        'side-split': {
            type       : 'split',
            orientation: 'vertical',
            children   : ['terminal-tabs', 'missing-tabs'],
            sizes      : [0.55, 0.45]
        },
        'terminal-tabs': {
            type        : 'tabs',
            items       : ['terminal'],
            activeItemId: 'terminal'
        },
        'missing-tabs': {
            type        : 'tabs',
            items       : ['missing'],
            activeItemId: 'missing'
        }
    }
});

const createEdgeZoneModel = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        strategy: {
            componentRef: 'strategy',
            title       : 'Strategy',
            kind        : 'panel'
        },
        swarm: {
            componentRef: 'swarm',
            title       : 'Swarm',
            kind        : 'panel'
        },
        terminal: {
            componentRef: 'terminal',
            title       : 'Terminal',
            kind        : 'terminal'
        },
        inspector: {
            componentRef: 'inspector',
            title       : 'Inspector',
            kind        : 'inspector'
        }
    },
    nodes: {
        root: {
            type : 'edge-zone',
            zones: {
                center: 'main-tabs',
                right : 'side-split'
            }
        },
        'main-tabs': {
            type        : 'tabs',
            items       : ['strategy', 'swarm'],
            activeItemId: 'swarm'
        },
        'side-split': {
            type       : 'split',
            orientation: 'vertical',
            children   : ['terminal-tabs', 'inspector-tabs'],
            sizes      : [0.55, 0.45]
        },
        'terminal-tabs': {
            type        : 'tabs',
            items       : ['terminal'],
            activeItemId: 'terminal'
        },
        'inspector-tabs': {
            type        : 'tabs',
            items       : ['inspector'],
            activeItemId: 'inspector'
        }
    }
});

const getProjectedChildren = splitConfig => splitConfig.items.filter(item => item.dockNodeType !== 'splitter');

const getProjectedSplitters = splitConfig => splitConfig.items.filter(item => item.dockNodeType === 'splitter');

test.describe('Neo.dashboard.DockLayoutAdapter', () => {
    test('projects split nodes to existing hbox and vbox layout primitives', () => {
        let model  = createModel(),
            result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => componentRef === 'missing' ? null : {
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                }
            }),
            rootChildren = getProjectedChildren(result),
            sideSplit    = rootChildren[1],
            sideChildren = getProjectedChildren(sideSplit);

        expect(result.ntype).toBe('container');
        expect(result.layout).toEqual({ntype: 'hbox', align: 'stretch'});
        expect(rootChildren.map(item => item.flex)).toEqual([0.7, 0.3]);

        expect(sideSplit.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(sideChildren.map(item => item.flex)).toEqual([0.55, 0.45]);
    });

    test('projects resize splitter affordances between adjacent split children', () => {
        let result = DockLayoutAdapter.project(createModel(), {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            rootSplitter = getProjectedSplitters(result)[0],
            sideSplit    = getProjectedChildren(result)[1],
            sideSplitter = getProjectedSplitters(sideSplit)[0];

        expect(result.items.map(item => item.dockNodeType)).toEqual(['tabs', 'splitter', 'split']);
        expect(rootSplitter).toMatchObject({
            dockNodeId            : 'root',
            dockNodeType          : 'splitter',
            dockSplitBoundaryIndex: 0,
            dockSplitOrientation  : 'horizontal',
            module                : DockSplitter,
            ntype                 : 'dashboard-dock-splitter',
            orientation           : 'horizontal',
            size                  : DockLayoutAdapter.splitterSize,
            splitNodeId           : 'root',
            width                 : DockLayoutAdapter.splitterSize
        });
        expect(rootSplitter.height).toBeUndefined();
        expect(rootSplitter.data).toMatchObject({
            boundaryIndex: 0,
            dockSplitter : true,
            operation    : 'resizeSplit',
            orientation  : 'horizontal',
            splitNodeId  : 'root'
        });

        expect(sideSplit.items.map(item => item.dockNodeType)).toEqual(['tabs', 'splitter', 'tabs']);
        expect(sideSplitter).toMatchObject({
            dockNodeId            : 'side-split',
            dockNodeType          : 'splitter',
            dockSplitBoundaryIndex: 0,
            dockSplitOrientation  : 'vertical',
            height                : DockLayoutAdapter.splitterSize,
            module                : DockSplitter,
            ntype                 : 'dashboard-dock-splitter',
            orientation           : 'vertical',
            size                  : DockLayoutAdapter.splitterSize,
            splitNodeId           : 'side-split'
        });
        expect(sideSplitter.width).toBeUndefined();
    });

    test('creates resizeSplit operation descriptors from splitter affordance metadata', () => {
        let model    = createModel(),
            result   = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            sizes    = [3, 1],
            splitter = getProjectedSplitters(result)[0],
            descriptor,
            resized;

        descriptor = DockLayoutAdapter.createResizeSplitOperation(splitter, sizes);
        sizes[0]   = 1;

        expect(descriptor).toEqual({
            operation  : 'resizeSplit',
            sizes      : [3, 1],
            splitNodeId: 'root'
        });

        resized = DockZoneModel.applyOperation(model, descriptor);

        expect(resized.errors).toEqual([]);
        expect(resized.document.nodes.root.sizes).toEqual([0.75, 0.25]);
        expect(model.nodes.root.sizes).toEqual([0.7, 0.3]);
    });

    test('projects tab nodes to tab.Container-compatible configs', () => {
        let result = DockLayoutAdapter.project(createModel(), {
            resolveComponentRef: componentRef => ({
                ntype    : 'dashboard-panel',
                reference: componentRef
            })
        });

        expect(result.items[0].ntype).toBe('tab-container');
        expect(result.items[0].activeIndex).toBe(1);
        expect(result.items[0].items.map(item => item.header.text)).toEqual(['Strategy', 'Swarm']);
        expect(result.items[0].items.map(item => item.data.dockItemId)).toEqual(['strategy', 'swarm']);
    });

    test('projects the documented edge-zone root model through the dashboard adapter', () => {
        let result = DockLayoutAdapter.project(createEdgeZoneModel(), {
                resolveComponentRef: componentRef => ({
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                })
            }),
            row    = result.items[0],
            center = row.items[0],
            right  = row.items[1],
            rightChildren = getProjectedChildren(right);

        expect(result.dockNodeType).toBe('edge-zone');
        expect(result.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(row.dockNodeType).toBe('edge-zone-row');
        expect(row.layout).toEqual({ntype: 'hbox', align: 'stretch'});

        expect(center.ntype).toBe('tab-container');
        expect(center.activeIndex).toBe(1);
        expect(center.items.map(item => item.header.text)).toEqual(['Strategy', 'Swarm']);

        expect(right.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(rightChildren.map(item => item.flex)).toEqual([0.55, 0.45]);
        expect(rightChildren.map(item => item.items[0].data.dockItemId)).toEqual(['terminal', 'inspector']);
    });

    test('falls back to recoverable placeholders without mutating the source model', () => {
        let model    = createModel(),
            snapshot = JSON.parse(JSON.stringify(model)),
            result   = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => componentRef === 'missing' ? null : {
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                }
            }),
            placeholder = getProjectedChildren(getProjectedChildren(result)[1])[1].items[0];

        expect(placeholder.ntype).toBe('dashboard-panel');
        expect(placeholder.data).toEqual({
            componentRef       : 'missing',
            dockItemId         : 'missing',
            missingComponentRef: true
        });
        expect(placeholder.header.text).toBe('Missing');
        expect(model).toEqual(snapshot);
    });

    test('normalizes invalid split sizes without rewriting the model', () => {
        let model = createModel();

        model.nodes.root.sizes = [0, Number.NaN];

        let result = DockLayoutAdapter.project(model, {
            resolveComponentRef: componentRef => ({
                ntype    : 'dashboard-panel',
                reference: componentRef
            })
        });

        expect(getProjectedChildren(result).map(item => item.flex)).toEqual([1, 1]);
        expect(model.nodes.root.sizes.length).toBe(2);
    });

    test('rejects preview-only fields at the adapter boundary', () => {
        let model = {
            ...createModel(),
            dockPreview: {
                previewId: 'preview-1'
            }
        };

        expect(() => DockLayoutAdapter.project(model)).toThrow(/preview-only field "dockPreview"/);
    });

    test('rejects runtime-only drag metadata from the full contract list', () => {
        let model = createModel();

        model.items.strategy.metadata = {
            sourceSortZone: 'left'
        };

        expect(() => DockLayoutAdapter.project(model)).toThrow(/preview-only field "sourceSortZone"/);
    });

    test('projects an autoHidden edge item into an edge rail and drops it from the tab flow', () => {
        let model = createEdgeZoneModel();

        model.items.terminal.autoHidden = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row          = result.items[0],
            rail         = row.items.find(item => item.dockNodeType === 'edge-rail'),
            side         = row.items.find(item => item.dockNodeId === 'side-split'),
            terminalTabs = getProjectedChildren(side)[0];

        // The auto-hidden item surfaces as a right-edge rail tab.
        expect(rail).toBeTruthy();
        expect(rail.dockEdge).toBe('right');
        expect(rail.layout).toEqual({ntype: 'vbox', align: 'start'});
        expect(rail.items.map(item => item.dockItemId)).toEqual(['terminal']);
        expect(rail.items[0].dockNodeType).toBe('edge-rail-tab');
        expect(rail.items[0].text).toBe('Terminal');
        expect(rail.items[0].data).toEqual({dockEdge: 'right', dockItemId: 'terminal', dockRailTab: true});

        // ...and is gone from its tab flow (the now-empty terminal-tabs).
        expect(terminalTabs.dockNodeId).toBe('terminal-tabs');
        expect(terminalTabs.items).toEqual([]);
        expect(terminalTabs.activeIndex).toBeNull();
    });

    test('does not rail an item that is pinned but not autoHidden', () => {
        let model = createEdgeZoneModel();

        model.items.terminal.pinned = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row = result.items[0];

        expect(row.items.find(item => item.dockNodeType === 'edge-rail')).toBeUndefined();
    });

    test('leaves a center-zone autoHidden item in the tab flow as a fail-safe (no center rail)', () => {
        let model = createEdgeZoneModel();

        model.items.strategy.autoHidden = true;

        let result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => ({ntype: 'dashboard-panel', reference: componentRef})
            }),
            row    = result.items[0],
            center = row.items[0];

        // Center never auto-hides to a rail; the item stays visible rather than vanishing.
        expect(row.items.find(item => item.dockNodeType === 'edge-rail')).toBeUndefined();
        expect(center.items.map(item => item.data.dockItemId)).toEqual(['strategy', 'swarm']);
    });
});
