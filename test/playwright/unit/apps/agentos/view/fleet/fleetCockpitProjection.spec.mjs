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
    let ActivityStream, AgentDetail, DockProjectionReconciler, DockZoneModel, FleetCockpit, FleetGrid, cockpitDockDocument;

    // a projection-capable spy owner: the REAL prototype methods over controlled state, without
    // provider/store/bridge wiring (their routing has its own suite in fleetCockpit.spec.mjs)
    const makeHost = (overrides = {}) => {
        const
            host   = Object.create(FleetCockpit.prototype),
            values = {
                // the stream resolver joins roster actor facts; this host owns no roster, and
                // the honest empty directory is exactly what an unmaterialized grid yields
                buildActivityActorDirectory: () => ({}),
                dockModel         : cockpitDockDocument(),
                gridAdapterState  : 'sample',
                isDestroyed       : false,
                refreshPromise    : null,
                streamAdapterState: 'sample',
                streamEvents      : [],
                timeout           : ms => new Promise(resolve => setTimeout(resolve, ms)),
                ...overrides
            };

        Object.defineProperties(host, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
            configurable: true,
            value,
            writable    : true
        }])));

        return host
    };

    // flatten a projected config tree (items recursion) for structural assertions
    const collect = (config, out = []) => {
        out.push(config);
        (config.items || []).forEach(item => collect(item, out));
        return out
    };

    test.beforeAll(async () => {
        ActivityStream      = (await import('../../../../../../../apps/agentos/view/fleet/ActivityStream.mjs')).default;
        AgentDetail         = (await import('../../../../../../../apps/agentos/view/fleet/AgentDetail.mjs')).default;
        DockProjectionReconciler = (await import('../../../../../../../src/dashboard/DockProjectionReconciler.mjs')).default;
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

        await host.refreshPromise;
        expect(refreshed).toBe(1)
    });

    test('the deferral honors teardown: a host destroyed before the tick never re-projects (the isDestroyed guard)', async () => {
        let refreshed = 0;

        const host = makeHost({refreshDockWorkspace() { refreshed++ }});

        FleetCockpit.prototype.onDockZoneDocumentChange.call(host, cockpitDockDocument());
        host.isDestroyed = true;

        await host.refreshPromise;
        expect(refreshed).toBe(0)
    });

    test('two rapid commits serialize their captured document snapshots instead of overlapping shells', async () => {
        const
            first = DockZoneModel.applyOperation(cockpitDockDocument(), {
                operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: [0.3, 0.7]
            }).document,
            second = DockZoneModel.applyOperation(first, {
                operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: [0.4, 0.6]
            }).document,
            starts   = [],
            releases = [],
            host     = makeHost({
                refreshDockWorkspace(document) {
                    starts.push(document);
                    return new Promise(resolve => releases.push(resolve))
                }
            });

        FleetCockpit.prototype.onDockZoneDocumentChange.call(host, first);
        FleetCockpit.prototype.onDockZoneDocumentChange.call(host, second);

        await new Promise(resolve => setTimeout(resolve, 5));
        expect(starts).toEqual([first]);

        releases.shift()();
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(starts).toEqual([first, second]);

        releases.shift()();
        await host.refreshPromise
    });

    test('refresh reconciles shell index 1, preserves flex, and decorates a genuinely absent pane', async () => {
        const
            document = cockpitDockDocument(),
            original = DockProjectionReconciler.reconcileProjection,
            preset   = {reference: 'fleet-preset-fleet', set(values) { Object.assign(this, values) }},
            error    = {set(values) { Object.assign(this, values) }},
            host     = makeHost({
                id              : 'fleet-test-host',
                items           : [{items: [preset]}],
                perspectiveStore: {collection: {activeLayoutId: 'fleet'}},
                presetError     : null,
                getReference(reference) {
                    return reference === 'fleet-preset-error' ? error : null
                }
            });

        let options;

        DockProjectionReconciler.reconcileProjection = async value => {
            options = value
        };

        try {
            await FleetCockpit.prototype.refreshDockWorkspace.call(host, document);

            expect(options.host).toBe(host);
            expect(options.shellIndex).toBe(1);
            expect(options.nextConfig.flex).toBe(1);

            const absent = options.resolveItem('fleet');

            expect(absent.module).toBe(FleetGrid);
            expect(absent.header).toEqual({text: 'Fleet', dockItemId: 'fleet'});
            expect(absent.dockItemId).toBe('fleet');
            expect(absent.data).toMatchObject({componentRef: 'fleet-grid', dockItemId: 'fleet'})
        } finally {
            options?.placeholders?.forEach(placeholder => !placeholder.isDestroyed && placeholder.destroy());
            DockProjectionReconciler.reconcileProjection = original
        }
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

    test('panes are layout-blind (§2.6) and absent-item fallback reads OWNER-held state', () => {
        const
            definitions = {id: 'definitions-store'},
            tenants     = {id: 'tenants-store'},
            host        = makeHost({
                detailRecord    : {agentId: 'vega', displayName: 'Vega'},
                getStateProvider: () => ({
                    getStore: name => ({
                        agentDefinitions: definitions,
                        fleetTenants    : tenants
                    })[name]
                }),
                gridAdapterState  : 'live',
                streamAdapterState: 'stale',
                streamEvents      : [{type: 'pr-activity', payload: {text: 'held'}}]
            });

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

        // agent-detail now renders the real drill-in view from OWNER-held fallback state
        // (the selected record), so returning from true absence never drops the selection
        const detail = FleetCockpit.prototype.resolveDockComponentRef.call(host, 'agent-detail', {title: 'Agent detail'}, 'detail');

        expect(detail.module).toBe(AgentDetail);
        expect(detail.record).toBe(host.detailRecord);   // owner-held selection survives re-projection
        expect(detail.agentDefinitions).toBe(definitions);
        expect(detail.fleetTenants).toBe(tenants);
        expect(detail.cls).toContain('dock-flip-item-detail');

        // §2.6 layout-blind: NOTHING dock-specific reaches a pane config beyond the marker class
        for (const pane of [grid, stream, detail]) {
            for (const forbidden of ['applyDockZoneOperation', 'onDockZoneDocumentChange', 'onDockCrossZoneDrop', 'dockZoneDocument', 'dockNodeId']) {
                expect(pane[forbidden], `a pane config must not carry ${forbidden}`).toBeUndefined()
            }
        }

        // perspectives remains a sibling-leaf placeholder — an HONEST labelled pane, never a blank one
        const perspectives = FleetCockpit.prototype.resolveDockComponentRef.call(host, 'perspectives', {title: 'Perspectives'}, 'perspectives');

        expect(perspectives.cls).toContain('fm-pane-placeholder');
        expect(perspectives.cls).toContain('dock-flip-item-perspectives');
        expect(perspectives.html).toContain('Perspectives')
    });

    test('the projected tree renders the document\'s zones: both live panes present, exactly once each', () => {
        const host  = makeHost(),
              nodes = collect(FleetCockpit.prototype.projectDockModel.call(host));

        expect(nodes.filter(node => node.module === FleetGrid).length).toBe(1);
        expect(nodes.filter(node => node.module === ActivityStream).length).toBe(1);

        // the auto-hidden chrome (detail + perspectives) must NOT render as full panes — the
        // document declares them rail material (their reveal chain is the shipped machinery)
        expect(nodes.filter(node => node.cls?.includes('fm-pane-placeholder')).length).toBe(0);

        const rails = nodes.filter(node => node.dockNodeType === 'edge-rail');

        expect(rails).toHaveLength(1);
        expect(rails[0].dockEdge).toBe('right');
        expect(rails[0].railItems.map(item => item.dockItemId)).toEqual([
            'detail',
            'perspectives',
            'defineAgent',
            'catchUp',
            'memories',
            'wakeRoutes',
            'operator'
        ])
    });
});

/**
 * Covers the perspective presets — named workspace-scope layouts switching the committed
 * document through the SAME commit loop every other dock gesture uses. The units: the seeded
 * library validates and adopts, a switch restores fail-closed and commits deferred, pane
 * continuity is STATE continuity (owner-held fields and the preset library untouched by a
 * switch), a refused switch renders visibly with the live layout byte-untouched, and the
 * control bar derives from store state.
 */
test.describe('Fleet cockpit — perspective presets (the switch through the commit loop)', () => {
    let DockPerspectiveStore, DockZoneModel, FleetCockpit, cockpitPresetCollection, Neo;

    const makePresetHost = async (overrides = {}) => {
        const
            store  = Neo.create(DockPerspectiveStore, {collection: cockpitPresetCollection()}),
            host   = Object.create(FleetCockpit.prototype),
            values = {
                // the stream resolver joins roster actor facts; the preset host owns no roster,
                // and the honest empty directory is exactly what an unmaterialized grid yields
                buildActivityActorDirectory: () => ({}),
                dockModel         : (await import('../../../../../../../apps/agentos/view/fleet/cockpitDockDocument.mjs')).default(),
                gridAdapterState  : 'sample',
                isDestroyed       : false,
                perspectiveStore  : store,
                presetError       : null,
                refreshPromise    : null,
                streamAdapterState: 'sample',
                streamEvents      : [],
                timeout           : ms => new Promise(resolve => setTimeout(resolve, ms)),
                ...overrides
            };

        Object.defineProperties(host, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
            configurable: true,
            value,
            writable    : true
        }])));

        return host
    };

    test.beforeAll(async () => {
        Neo                     = (await import('../../../../../../../src/Neo.mjs')).default;
        DockPerspectiveStore    = (await import('../../../../../../../src/dashboard/DockPerspectiveStore.mjs')).default;
        DockZoneModel           = (await import('../../../../../../../src/dashboard/DockZoneModel.mjs')).default;
        FleetCockpit            = (await import('../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs')).default;
        cockpitPresetCollection = (await import('../../../../../../../apps/agentos/view/fleet/cockpitPresets.mjs')).default
    });

    test('the seeded library validates whole and lists the three duty presets, Fleet active', () => {
        const collection = cockpitPresetCollection();

        expect(DockZoneModel.validateSavedLayoutCollection(collection)).toEqual([]);
        expect(collection.activeLayoutId).toBe('fleet');

        const store = Neo.create(DockPerspectiveStore, {collection});

        expect(store.list().map(preset => preset.perspectiveName)).toEqual(['Fleet', 'Focus', 'Review']);
        store.destroy()
    });

    test('a switch restores the preset document through the standard commit loop — stored synchronously, re-projected deferred', async () => {
        let refreshed = 0;

        const host = await makePresetHost({refreshDockWorkspace() { refreshed++ }});

        const verdict = FleetCockpit.prototype.activatePerspective.call(host, 'Focus');

        expect(verdict).toEqual({errors: [], switched: true});
        expect(host.presetError).toBeNull();
        // the restored document is the live SSOT immediately, with Focus geometry
        expect(host.dockModel.nodes['primary-split'].sizes).toEqual([0.85, 0.15]);
        // the preset library tracks the active record
        expect(host.perspectiveStore.collection.activeLayoutId).toBe('focus');
        // deferred view-sync, same as every commit
        expect(refreshed).toBe(0);
        await host.refreshPromise;
        expect(refreshed).toBe(1);

        // Review opens the detail band and leans the split toward the trail
        FleetCockpit.prototype.activatePerspective.call(host, 'Review');
        expect(host.dockModel.nodes['primary-split'].sizes).toEqual([0.45, 0.55]);
        expect(host.dockModel.items.detail.autoHidden).toBe(false);

        host.perspectiveStore.destroy()
    });

    test('pane continuity across a switch is STATE continuity: owner-held fields and the resolver output survive untouched', async () => {
        const events = [{type: 'pr-activity', payload: {text: 'live-held'}}],
              host   = await makePresetHost({
                  gridAdapterState  : 'live',
                  refreshDockWorkspace() {},
                  streamAdapterState: 'live',
                  streamEvents      : events
              });

        FleetCockpit.prototype.activatePerspective.call(host, 'Focus');

        // the switch touched the LAYOUT SSOT only — held pane state is not its surface
        expect(host.gridAdapterState).toBe('live');
        expect(host.streamAdapterState).toBe('live');
        expect(host.streamEvents).toBe(events);

        // and a genuinely absent pane's next materialization carries that state
        const grid = FleetCockpit.prototype.resolveDockComponentRef.call(host, 'fleet-grid', {title: 'Fleet'}, 'fleet');
        expect(grid.adapterState).toBe('live');

        host.perspectiveStore.destroy()
    });

    test('the persistent control bar keeps identities while preset and refusal state change', async () => {
        const
            buttons = ['fleet', 'focus', 'review'].map(layoutId => ({
                pressed  : false,
                reference: `fleet-preset-${layoutId}`,
                set(values) { Object.assign(this, values) }
            })),
            error = {
                hidden: true,
                html  : '',
                set(values) { Object.assign(this, values) }
            },
            host = await makePresetHost({
                items: [{items: buttons}],
                getReference(reference) {
                    return reference === 'fleet-preset-error' ? error : null
                }
            }),
            identities = [...buttons];

        FleetCockpit.prototype.syncControlBar.call(host);
        expect(buttons.map(button => button.pressed)).toEqual([true, false, false]);

        host.perspectiveStore.loadPerspective('Focus');
        host.presetError = 'refused visibly';
        FleetCockpit.prototype.syncControlBar.call(host);

        expect(buttons).toEqual(identities);
        expect(buttons.map(button => button.pressed)).toEqual([false, true, false]);
        expect(error).toMatchObject({hidden: false, html: 'refused visibly'});

        host.perspectiveStore.destroy()
    });

    test('a refused switch fails closed VISIBLY: the live layout stays byte-identical and the error syncs in place', async () => {
        let synced = 0;

        const host   = await makePresetHost({syncControlBar() { synced++ }}),
              before = JSON.stringify(host.dockModel);

        const verdict = FleetCockpit.prototype.activatePerspective.call(host, 'ghost');

        expect(verdict.switched).toBe(false);
        expect(verdict.errors.join(' ')).toContain('no perspective named');
        expect(JSON.stringify(host.dockModel)).toBe(before);
        expect(host.presetError).toContain('ghost');
        // the error path updates the persistent bar, without a document commit or shell refresh
        expect(synced).toBe(1);

        // the bar derives from state: pressed follows the active record, the error chip renders
        const bar = FleetCockpit.prototype.buildWorkspaceItems.call(host)[0];
        expect(bar.items.filter(item => item.cls?.includes('fm-preset-button')).map(item => item.pressed)).toEqual([true, false, false]);
        expect(bar.items.find(item => item.cls?.includes('fm-preset-error'))?.html).toContain('ghost');

        host.perspectiveStore.destroy()
    });
});
