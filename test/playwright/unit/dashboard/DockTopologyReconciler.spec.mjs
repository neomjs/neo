import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTopologyReconcilerTest'
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../src/Neo.mjs';
import * as core              from '../../../../src/core/_export.mjs';
import DockRestorePlanner     from '../../../../src/dashboard/dock/persistence/RestorePlanner.mjs';
import DockTopologyReconciler from '../../../../src/dashboard/dock/model/TopologyReconciler.mjs';
import Persistence            from '../../../../src/dashboard/dock/model/Persistence.mjs';

const tabsDoc = ids => ({
    schema: 'neo.dock.zone.v1',
    root  : 'r',
    items : Object.fromEntries(ids.map(id => [id, {componentRef: id, title: id}])),
    nodes : {
        r: {type: 'tabs', items: [...ids], activeItemId: ids[0]}
    }
});

const capture = workspaces => {
    const {topology, errors} = Persistence.captureTopologyPerspective(workspaces, {
        layoutId: 'test-topology',
        title   : 'Test Topology'
    });

    if (errors.length) {
        throw new Error(`fixture capture failed: ${errors[0]}`)
    }

    return topology
};

const restoredItemIds = result => result.restored
    .map(entry => `${entry.workspaceKey}:${entry.itemId}`)
    .sort();

/**
 * @summary Keyed topology reconciliation controls.
 *
 * The hard cut deletes positional affinity assignment entirely. A workspace key either resolves
 * the same semantic participant or reports a key-named remainder; object insertion order never
 * participates in identity.
 */
test.describe('Neo.dashboard.dock.model.TopologyReconciler — keyed topology', () => {
    test('deletes positional affinity APIs and reconciles by workspaceKey regardless of record order', () => {
        const saved = capture({
                main : tabsDoc(['alpha', 'beta']),
                popup: tabsDoc(['terminal'])
            }),
            mainLive = {...tabsDoc(['alpha', 'beta']), nodes: {r: {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'beta'}}},
            live = {
                popup: tabsDoc(['terminal']),
                main : mainLive
            },
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(DockTopologyReconciler.assignSlots).toBeUndefined();
        expect(DockTopologyReconciler.capturedSlots).toBeUndefined();
        expect(result.errors).toEqual([]);
        expect(result.unrestored).toEqual([]);
        expect(result.unmatchedLive).toEqual([]);
        expect(result.workspaces.main.nodes.r.activeItemId).toBe('alpha');
        expect(Object.keys(result.workspaces.popup.items)).toEqual(['terminal']);
        expect(result.applied.map(entry => entry.workspaceKey).sort()).toEqual(['main', 'popup']);
        expect(restoredItemIds(result)).toEqual(['main:alpha', 'main:beta', 'popup:terminal'])
    });

    test('a missing live participant reports every item under its workspaceKey; excess live workspaces stay untouched', () => {
        const saved = capture({
                main : tabsDoc(['alpha']),
                popup: tabsDoc(['terminal', 'logs'])
            }),
            extra = tabsDoc(['scratch']),
            main  = tabsDoc(['alpha']),
            live  = {extra, main},
            result = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.workspaces.main).toEqual(main);
        expect(result.workspaces.extra).toBe(extra);
        expect(result.unmatchedLive).toEqual(['extra']);
        expect(result.unrestored).toEqual([
            {workspaceKey: 'popup', itemId: 'terminal', reason: DockTopologyReconciler.REASON_NO_LIVE_WORKSPACE},
            {workspaceKey: 'popup', itemId: 'logs',     reason: DockTopologyReconciler.REASON_NO_LIVE_WORKSPACE}
        ]);
        expect(restoredItemIds(result)).toEqual(['main:alpha'])
    });

    test('changed topology adopts the captured workspace and reports displaced items by key', () => {
        const saved = capture({main: tabsDoc(['alpha', 'beta'])}),
            live    = {main: tabsDoc(['alpha', 'beta', 'extra'])},
            result  = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors).toEqual([]);
        expect(result.applied).toEqual([
            expect.objectContaining({workspaceKey: 'main', mode: 'adopt'})
        ]);
        expect(result.displaced).toEqual([{workspaceKey: 'main', itemId: 'extra'}]);
        expect(Object.keys(result.workspaces.main.items)).toEqual(['alpha', 'beta'])
    });

    test('foreign and positional topology bytes fail closed without mutating live workspaces', () => {
        const liveDocument = tabsDoc(['alpha']),
            live           = {main: liveDocument},
            valid          = capture({main: tabsDoc(['alpha'])});

        for (const topology of [
            {...valid, schema: 'neo.dock.topology.v2'},
            {...valid, captureScope: 'topology'},
            {...valid, windowDocuments: [tabsDoc(['terminal'])]},
            {
                schema           : Persistence.LAYOUT_SCHEMA,
                layoutId         : 'legacy',
                title            : 'Legacy',
                captureScope     : 'topology',
                windowFingerprint: null,
                dockZone         : tabsDoc(['alpha']),
                windowDocuments  : [tabsDoc(['terminal'])],
                metadata         : {}
            }
        ]) {
            const result = DockTopologyReconciler.reconcile(topology, live);

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.applied).toEqual([]);
            expect(result.workspaces.main).toBe(liveDocument)
        }
    });

    test('duplicate item ids across live workspaces are corrupt input and fail closed', () => {
        const saved = capture({main: tabsDoc(['alpha'])}),
            first   = tabsDoc(['alpha']),
            second  = tabsDoc(['alpha']),
            live    = {main: first, popup: second},
            result  = DockTopologyReconciler.reconcile(saved, live);

        expect(result.errors.join(' ')).toContain('both carry item "alpha"');
        expect(result.applied).toEqual([]);
        expect(result.workspaces.main).toBe(first);
        expect(result.workspaces.popup).toBe(second)
    });

    test('planner refusals stay key-named; only topology-fingerprint-mismatch adopts', () => {
        const saved  = capture({main: tabsDoc(['alpha'])}),
            live     = {main: tabsDoc(['alpha'])},
            original = DockRestorePlanner.restoreToward;

        try {
            DockRestorePlanner.restoreToward = () => ({
                applied : 0,
                deferred: true,
                document: live.main,
                errors  : [],
                plan    : [],
                reason  : 'cross-node-singleton-cycle',
                surplus : []
            });

            const result = DockTopologyReconciler.reconcile(saved, live);

            expect(result.workspaces.main).toBe(live.main);
            expect(result.applied).toEqual([]);
            expect(result.unrestored).toEqual([
                {workspaceKey: 'main', itemId: 'alpha', reason: 'cross-node-singleton-cycle'}
            ])
        } finally {
            DockRestorePlanner.restoreToward = original
        }
    })
});
