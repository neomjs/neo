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

test.describe('Neo.dashboard.DockLayoutAdapter', () => {
    test('projects split nodes to existing hbox and vbox layout primitives', () => {
        let model  = createModel(),
            result = DockLayoutAdapter.project(model, {
                resolveComponentRef: componentRef => componentRef === 'missing' ? null : {
                    ntype    : 'dashboard-panel',
                    reference: componentRef
                }
            });

        expect(result.ntype).toBe('container');
        expect(result.layout).toEqual({ntype: 'hbox', align: 'stretch'});
        expect(result.items.map(item => item.flex)).toEqual([0.7, 0.3]);

        expect(result.items[1].layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(result.items[1].items.map(item => item.flex)).toEqual([0.55, 0.45]);
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
            right  = row.items[1];

        expect(result.dockNodeType).toBe('edge-zone');
        expect(result.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(row.dockNodeType).toBe('edge-zone-row');
        expect(row.layout).toEqual({ntype: 'hbox', align: 'stretch'});

        expect(center.ntype).toBe('tab-container');
        expect(center.activeIndex).toBe(1);
        expect(center.items.map(item => item.header.text)).toEqual(['Strategy', 'Swarm']);

        expect(right.layout).toEqual({ntype: 'vbox', align: 'stretch'});
        expect(right.items.map(item => item.flex)).toEqual([0.55, 0.45]);
        expect(right.items.map(item => item.items[0].data.dockItemId)).toEqual(['terminal', 'inspector']);
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
            placeholder = result.items[1].items[1].items[0];

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

        expect(result.items.map(item => item.flex)).toEqual([1, 1]);
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
});
