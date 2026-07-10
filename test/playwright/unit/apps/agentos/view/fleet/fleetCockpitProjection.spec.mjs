import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: 'FleetCockpitProjectionTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * Covers the cockpit's dock projection wiring — the live half of the §01 layout: the
 * committed `dockZone.v1` document as the layout SSOT, projected through
 * `Neo.dashboard.DockLayoutAdapter`, with the reducer / view-sync commit loop the splitters,
 * cross-zone drops and NL operations all funnel through.
 *
 * The units are the loop's own contracts (prototype-call granularity, spy owners — the
 * adapter's projection internals and the panes' rendering have their own suites):
 * fail-closed reducer purity, the one-tick deferral + destroy guard (the example's documented
 * use-after-destroy trap), instance-bound callback threading, layout-blind panes per the
 * docking design's pane contract, and owner-held pane state surviving re-projection.
 */
test.describe('Fleet cockpit — dock projection wiring (the resize commit loop)', () => {
    let ActivityStream, DockZoneModel, FleetCockpit, FleetGrid, cockpitDockDocument;

    // a projection-capable spy owner: the REAL prototype methods over controlled state, without
    // provider/store/bridge wiring (their routing has its own suite in fleetCockpit.spec.mjs)
    const makeHost = (overrides = {}) => Object.assign(Object.create(FleetCockpit.prototype), {
        dockModel         : cockpitDockDocument(),
        gridAdapterState  : 'sample',
        isDestroyed       : false,
        streamAdapterState: 'sample',
        streamEvents      : [],
        timeout           : ms => new Promise(resolve => setTimeout(resolve, ms))
    }, overrides);

    // flatten a projected config tree (items recursion) for structural assertions
    const collect = (config, out = []) => {
        out.push(config);
        (config.items || []).forEach(item => collect(item, out));
        return out
    };

    test.beforeAll(async () => {
        ActivityStream      = (await import('../../../../../../../apps/agentos/view/fleet/ActivityStream.mjs')).default;
        DockZoneModel       = (await import('../../../../../../../src/dashboard/DockZoneModel.mjs')).default;
        FleetCockpit        = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs')).default;
        FleetGrid           = (await import('../../../../../../../apps/agentos/view/fleet/FleetGrid.mjs')).default;
        cockpitDockDocument = (await import('../../../../../../../apps/agentos/view/fleet/cockpitDockDocument.mjs')).default
    });

    test('the reducer is pure and fail-closed: a commit advances a NEW document, the held one never mutates', () => {
        const host   = makeHost(),
              before = JSON.stringify(host.dockModel);

        const result = FleetCockpit.prototype.applyDockZoneOperation.call(host, {
            operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: [0.4, 0.6]
        });

        expect(result.errors).toEqual([]);
        expect(result.document.nodes['primary-split'].sizes).toEqual([0.4, 0.6]);

        // purity: the reducer returned a NEW document — the held SSOT is untouched until the
        // view-sync stores the committed result
        expect(JSON.stringify(host.dockModel)).toBe(before);

        // fail-closed: a bogus operation reports errors and cannot advance state
        const rejected = FleetCockpit.prototype.applyDockZoneOperation.call(host, {
            operation: 'resizeSplit', splitNodeId: 'ghost-split', sizes: [0.5, 0.5]
        });

        expect(rejected.errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(host.dockModel)).toBe(before)
    });

    test('the view-sync stores synchronously but re-projects one tick DEFERRED — the committing splitter must survive its own onDragEnd', async () => {
        let refreshed = 0;

        const host = makeHost({refreshDockWorkspace() { refreshed++ }}),
              next = DockZoneModel.applyOperation(host.dockModel, {
                  operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: [0.3, 0.7]
              }).document;

        FleetCockpit.prototype.onDockZoneDocumentChange.call(host, next);

        // the document is the SSOT immediately (a follow-up reducer call must see it)...
        expect(host.dockModel).toBe(next);
        // ...but the re-projection has NOT run inside the committing call stack
        expect(refreshed).toBe(0);

        await new Promise(resolve => setTimeout(resolve, 5));
        expect(refreshed).toBe(1)
    });

    test('the deferral honors teardown: a host destroyed before the tick never re-projects (the isDestroyed guard)', async () => {
        let refreshed = 0;

        const host = makeHost({refreshDockWorkspace() { refreshed++ }});

        FleetCockpit.prototype.onDockZoneDocumentChange.call(host, cockpitDockDocument());
        host.isDestroyed = true;

        await new Promise(resolve => setTimeout(resolve, 5));
        expect(refreshed).toBe(0)
    });

    test('the projection threads INSTANCE-BOUND callbacks: a projected affordance routes its commit into this host\'s document', () => {
        const host   = makeHost(),
              config = FleetCockpit.prototype.projectDockModel.call(host);

        // the projection root carries the dock token scope by construction
        expect(config.cls).toContain('neo-dashboard');

        // find a projected affordance carrying the reducer callback (the splitter contract)
        const armed = collect(config).find(node => typeof node.applyDockZoneOperation === 'function');
        expect(armed, 'the projection must thread the reducer onto an affordance').toBeTruthy();

        // behavioral instance-binding proof: invoking the THREADED callback operates on THIS
        // host's committed document (not a stale or global one)
        const result = armed.applyDockZoneOperation({
            operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: [0.25, 0.75]
        });

        expect(result.errors).toEqual([]);
        expect(result.document.nodes['primary-split'].sizes).toEqual([0.25, 0.75])
    });

    test('panes are layout-blind (§2.6) and re-materialize from OWNER-held state — a re-projection can never reset a live surface', () => {
        const host = makeHost({gridAdapterState: 'live', streamAdapterState: 'stale', streamEvents: [{type: 'pr-activity', payload: {text: 'held'}}]});

        const grid = FleetCockpit.prototype.resolveDockComponentRef.call(host, 'fleet-grid', {title: 'Fleet'}, 'fleet');

        expect(grid.module).toBe(FleetGrid);
        expect(grid.adapterState).toBe('live');                       // owner-held truth, not the config default
        expect(grid.bind).toEqual({store: 'stores.fleetRoster'});     // provider-scope binding survives projection depth
        expect(grid.cls).toContain('dock-flip-item-fleet');           // the stable FLIP correlation key

        const stream = FleetCockpit.prototype.resolveDockComponentRef.call(host, 'activity-stream', {title: 'Activity'}, 'stream');

        expect(stream.module).toBe(ActivityStream);
        expect(stream.adapterState).toBe('stale');
        expect(stream.events).toEqual(host.streamEvents);
        expect(stream.cls).toContain('dock-flip-item-stream');

        // §2.6 layout-blind: NOTHING dock-specific reaches a pane config beyond the marker class
        for (const pane of [grid, stream]) {
            for (const forbidden of ['applyDockZoneOperation', 'onDockZoneDocumentChange', 'onDockCrossZoneDrop', 'dockZoneDocument', 'dockNodeId']) {
                expect(pane[forbidden], `a pane config must not carry ${forbidden}`).toBeUndefined()
            }
        }

        // sibling-leaf refs render an HONEST labelled placeholder, never a blank pane
        const detail = FleetCockpit.prototype.resolveDockComponentRef.call(host, 'agent-detail', {title: 'Agent detail'}, 'detail');

        expect(detail.cls).toContain('fm-pane-placeholder');
        expect(detail.cls).toContain('dock-flip-item-detail');
        expect(detail.html).toContain('Agent detail')
    });

    test('the projected tree renders the document\'s zones: both live panes present, exactly once each', () => {
        const host  = makeHost(),
              nodes = collect(FleetCockpit.prototype.projectDockModel.call(host));

        expect(nodes.filter(node => node.module === FleetGrid).length).toBe(1);
        expect(nodes.filter(node => node.module === ActivityStream).length).toBe(1);

        // the auto-hidden chrome (detail + perspectives) must NOT render as full panes — the
        // document declares them rail material (their reveal chain is the shipped machinery)
        expect(nodes.filter(node => node.cls?.includes('fm-pane-placeholder')).length).toBe(0)
    });
});
