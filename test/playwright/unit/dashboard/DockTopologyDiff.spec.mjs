import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockTopologyDiffTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import DockTopologyDiff from '../../../../src/dashboard/dock/model/TopologyDiff.mjs';

/**
 * A fresh canonical dockZone.v1 document mirroring the executor spec's fixture:
 * `inspector` stays catalog-only (never in the tree) to pin the catalog-vs-topology boundary.
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
            root        : {type: 'edge-zone', zones: {center: {nodeId: 'main-split'}}},
            'main-split': {type: 'split', orientation: 'horizontal', children: ['main-tabs', 'side-tabs'], sizes: [0.5, 0.5]},
            'main-tabs' : {type: 'tabs', items: ['strategy', 'swarm'], activeItemId: 'swarm'},
            'side-tabs' : {type: 'tabs', items: ['terminal'], activeItemId: 'terminal'}
        }
    }
}

test.describe('Neo.dashboard.dock.model.TopologyDiff (#14650)', () => {
    test('an identical pair yields only unchanged items — and catalog-only items stay invisible to topology', () => {
        const result = DockTopologyDiff.diffDockDocuments(doc(), doc());

        expect(result.errors).toEqual([]);
        expect(result.moves).toEqual([]);
        expect(result.adds).toEqual([]);
        expect(result.removes).toEqual([]);
        expect(result.resizes).toEqual([]);
        expect(result.tabReorders).toEqual([]);
        expect(result.autoHideFlips).toEqual([]);
        // inspector is in the catalog but not the tree: not unchanged, not added — invisible
        expect(result.unchanged).toEqual(['strategy', 'swarm', 'terminal'])
    });

    test('moves, adds and removes are reported with their locations', () => {
        const before = doc();
        const after  = doc();

        // strategy moves containers, inspector enters the tree, terminal leaves it
        after.nodes['main-tabs'].items = ['swarm'];
        after.nodes['side-tabs'].items = ['strategy', 'inspector'];
        after.nodes['side-tabs'].activeItemId = 'strategy';

        const result = DockTopologyDiff.diffDockDocuments(before, {
            ...after,
            nodes: {...after.nodes, 'side-tabs': {...after.nodes['side-tabs'], items: ['strategy', 'inspector']}}
        });

        expect(result.errors).toEqual([]);
        expect(result.moves).toEqual([
            {itemId: 'strategy', from: {nodeId: 'main-tabs', index: 0}, to: {nodeId: 'side-tabs', index: 0}}
        ]);
        expect(result.adds).toEqual([
            {itemId: 'inspector', to: {nodeId: 'side-tabs', index: 1}}
        ]);
        expect(result.removes).toEqual([
            {itemId: 'terminal', from: {nodeId: 'side-tabs', index: 0}}
        ]);
        // swarm kept its container but shifted 1→0 when strategy departed: index truth is
        // reported as a reorder, never silently absorbed into unchanged
        expect(result.tabReorders).toEqual([
            {itemId: 'swarm', nodeId: 'main-tabs', fromIndex: 1, toIndex: 0}
        ]);
        expect(result.unchanged).toEqual([])
    });

    test('a tab reorder inside one container is its own category, not a move', () => {
        const after = doc();

        after.nodes['main-tabs'].items = ['swarm', 'strategy'];

        const result = DockTopologyDiff.diffDockDocuments(doc(), after);

        expect(result.errors).toEqual([]);
        expect(result.moves).toEqual([]);
        expect(result.tabReorders).toEqual([
            {itemId: 'strategy', nodeId: 'main-tabs', fromIndex: 0, toIndex: 1},
            {itemId: 'swarm',    nodeId: 'main-tabs', fromIndex: 1, toIndex: 0}
        ])
    });

    test('resize epsilon: sub-epsilon drift is unchanged, beyond-epsilon is a resize (configurable)', () => {
        const drifted = doc();
        drifted.nodes['main-split'].sizes = [0.5005, 0.4995];

        const noise = DockTopologyDiff.diffDockDocuments(doc(), drifted);
        expect(noise.resizes).toEqual([]);

        const resized = doc();
        resized.nodes['main-split'].sizes = [0.7, 0.3];

        const real = DockTopologyDiff.diffDockDocuments(doc(), resized);
        expect(real.resizes).toEqual([
            {nodeId: 'main-split', fromSizes: [0.5, 0.5], toSizes: [0.7, 0.3]}
        ]);

        // tightening the tolerance turns the drift into a reported resize
        const strict = DockTopologyDiff.diffDockDocuments(doc(), drifted, {sizeEpsilon: 0.0001});
        expect(strict.resizes).toEqual([
            {nodeId: 'main-split', fromSizes: [0.5, 0.5], toSizes: [0.5005, 0.4995]}
        ])
    });

    test('an autoHidden flip is reported and excludes the item from unchanged', () => {
        const after = doc();

        after.items.terminal = {...after.items.terminal, autoHidden: true};

        const result = DockTopologyDiff.diffDockDocuments(doc(), after);

        expect(result.errors).toEqual([]);
        expect(result.autoHideFlips).toEqual([
            {itemId: 'terminal', from: false, to: true}
        ]);
        expect(result.unchanged).toEqual(['strategy', 'swarm'])
    });

    test('deterministic output: two runs over the same inputs are byte-identical', () => {
        const before = doc();
        const after  = doc();

        after.nodes['main-tabs'].items = ['swarm'];
        after.nodes['side-tabs'].items = ['terminal', 'strategy'];
        after.nodes['main-split'].sizes = [0.8, 0.2];
        after.items.swarm = {...after.items.swarm, autoHidden: true};

        const one = DockTopologyDiff.diffDockDocuments(before, after);
        const two = DockTopologyDiff.diffDockDocuments(before, after);

        expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    });

    test('malformed documents fail closed with side-named errors and empty categories', () => {
        const malformed = doc();
        malformed.nodes['main-tabs'].type = 'carousel';

        const result = DockTopologyDiff.diffDockDocuments(doc(), malformed);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('after document failed the shape gate');
        expect(result.moves).toEqual([]);
        expect(result.adds).toEqual([]);
        expect(result.removes).toEqual([]);
        expect(result.unchanged).toEqual([]);

        // a cyclic tree is caught by the same gate, on the named side
        const cyclic = doc();
        cyclic.nodes['main-split'].children = ['main-tabs', 'main-split'];

        const cycleResult = DockTopologyDiff.diffDockDocuments(cyclic, doc());

        expect(cycleResult.errors[0]).toContain('before document failed the shape gate');
        expect(cycleResult.errors[0]).toContain('cycle')
    });
});
