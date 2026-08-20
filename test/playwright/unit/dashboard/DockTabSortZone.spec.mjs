import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTabSortZoneTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockTabSortZone   from '../../../../src/dashboard/DockTabSortZone.mjs';
import TabHeaderSortZone from '../../../../src/draggable/tab/header/toolbar/SortZone.mjs';

/**
 * @summary Contract pins for the dock drag proxy's carried scope.
 *
 * The dock proxy mounts at `document.body` — outside the dock host AND outside the app's themed
 * subtree — so `DockTabSortZone#getDragProxyConfig` must make ownership, theme, and the host's
 * preview language travel WITH the embodiment. These pins drive the config seam directly with a
 * minimal owner chain (the method reads only `owner.cls` / `owner.getTheme()` / the `parent`
 * walk); the rendered consequence rides the visual harness.
 */
test.describe('Neo.dashboard.DockTabSortZone', () => {
    test('keeps dock headers parent-sized and toolbar-relative during a drag', () => {
        expect(DockTabSortZone.config.adjustItemRectsToParent).toBe(true);
        expect(DockTabSortZone.config.expandOwnerOnDrag).toBe(false);
        expect(DockTabSortZone.config.positionOwnerRelative).toBe(true)
    });

    test.describe('getDragProxyConfig — the carried-scope embodiment contract', () => {
        // Mirrors the real workstation shape: the workspace theme-swaps an INNER root
        // (document.body keeps the boot theme), the dock host below it owns the language,
        // and the dragged toolbar sits at the bottom of the chain.
        const themedWorkspace = {
            cls   : ['workstation-workspace', 'neo-theme-neo-light'],
            parent: null
        };

        const signalHost = {
            cls   : ['workstation-dock-host', 'neo-dashboard', 'neo-preview-lang-signal'],
            parent: themedWorkspace
        };

        const owner = parentChain => ({
            cls     : ['neo-tab-header-toolbar'],
            // the boot theme body carries forever — what a naive resolution would pick
            getTheme: () => 'neo-theme-neo-dark',
            parent  : parentChain
        });

        test('stamps ownership, the host language, and the NEAREST ancestor theme onto the proxy cls', () => {
            const config = DockTabSortZone.prototype.getDragProxyConfig.call({
                dragProxyConfig: null,
                owner          : owner({cls: ['neo-tab-container'], parent: signalHost})
            });

            expect(config.cls).toEqual([
                'neo-tab-header-toolbar',  // the base copies the owner cls
                'neo-dock-dragproxy',      // dock ownership — shared dock skins scope to this
                'neo-preview-lang-signal', // the host's language, walked off the parent chain
                // the nearest ANCESTOR theme wins over the boot theme getTheme() resolves —
                // an app that theme-swaps an inner root (body stays dark) must not produce a
                // dark proxy in light mode (the cycle-2 falsified masking path)
                'neo-theme-neo-light'
            ])
        });

        test('with no themed ancestor the boot theme is the fallback carrier', () => {
            const config = DockTabSortZone.prototype.getDragProxyConfig.call({
                dragProxyConfig: null,
                owner          : owner({cls: ['neo-tab-container'], parent: {cls: ['neo-dashboard', 'neo-preview-lang-signal'], parent: null}})
            });

            expect(config.cls).toEqual([
                'neo-tab-header-toolbar', 'neo-dock-dragproxy', 'neo-preview-lang-signal', 'neo-theme-neo-dark'
            ])
        });

        test('a language-free host yields a language-free proxy — the default family stays untouched', () => {
            const config = DockTabSortZone.prototype.getDragProxyConfig.call({
                dragProxyConfig: null,
                owner          : owner({cls: ['neo-tab-container'], parent: null})
            });

            expect(config.cls).toEqual(['neo-tab-header-toolbar', 'neo-dock-dragproxy', 'neo-theme-neo-dark'])
        });

        test('the generic tab-header base never stamps the dock marker — unrelated drags stay unstyled', () => {
            const config = TabHeaderSortZone.prototype.getDragProxyConfig.call({
                dragProxyConfig: null,
                owner          : owner({cls: ['neo-tab-container'], parent: signalHost})
            });

            // Grid / list / tree / plain tab drags ride this base path: without the marker (and
            // without the language cls), the `.neo-dock-dragproxy.neo-preview-lang-signal` skin
            // can never match their proxies — the census asserts the selector side of this pair.
            expect(config.cls).not.toContain('neo-dock-dragproxy');
            expect(config.cls).not.toContain('neo-preview-lang-signal')
        })
    });

    /**
     * The release-boundary decision matrix (near vs far × horizontal vs vertical).
     *
     * `releaseVoidsReorder` guards the ONE seam where two commit paths race: the base sort's
     * within-toolbar reorder (armed by the pointer's PATH crossing sibling buttons) vs the dock's
     * cross-zone drop. A far release must void the tracked reorder — left in place it re-adds the
     * item to its source zone and silently reverts the cross-zone commit (last write wins). A
     * near / in-toolbar release must preserve the base reorder. The decision reads the PRISTINE
     * toolbar rect snapshotted at drag start (never the base's span-trimmed `ownerRect`) plus the
     * `dockReleaseTolerance` config — pure over instance state, so the matrix drives it with
     * explicit rects for both orientations.
     */
    test.describe('onDragStart — the source-boundary snapshot precedes the base lifecycle', () => {
        test('captures the real toolbar rect before delegating to the base drag start', async () => {
            // A toolbar WIDER than its button span. DockTabSortZone disables the inherited live
            // owner-width write, but release decisions still require the pre-base toolbar rect
            // rather than the base's later span-trimmed sort geometry.
            // Prototype-driven like the carried-scope pins above — the method chain is the unit,
            // never a fully-constructed zone.
            const WIDE = {x: 100, y: 100, width: 600, height: 32};
            const SPAN = {x: 100, y: 100, width: 180, height: 32};

            const calls = [];

            const owner = {
                getDomRect(ids) {
                    calls.push(ids === undefined ? 'snapshot' : 'base-measure');

                    if (ids === undefined) return Promise.resolve({...WIDE});
                    return Promise.resolve(ids.map(() => ({...SPAN})))
                }
            };

            // The base chain needs more scaffolding than this witness wants to carry. Its stub
            // records delegation and reads the snapshot so ordering remains the tested contract.
            const original = TabHeaderSortZone.prototype.onDragStart;

            TabHeaderSortZone.prototype.onDragStart = async function() {
                calls.push('base-start')
            };

            const zone = {dockItemIds: ['audit'], dockWorkspaceId: null, dragComponent: null, owner, startIndex: 0};

            try {
                await DockTabSortZone.prototype.onDragStart.call(zone, {path: []});

                expect(calls).toEqual(['snapshot', 'base-start']);
                expect(zone.dockSourceToolbarRect, 'release truth is the pre-base toolbar extent').toEqual(WIDE);
            } finally {
                TabHeaderSortZone.prototype.onDragStart = original
            }
        })

        test('a successor start is refused while the predecessor terminal still owns the end latch', async () => {
            const calls = [];
            const zone  = {
                dragEndActive: true,
                owner        : {getDomRect: () => calls.push('measure')},
                resetVesselConversion() {
                    calls.push('reset')
                }
            };

            await DockTabSortZone.prototype.onDragStart.call(zone, {path: []});

            expect(calls, 'the predecessor retains physical + logical generation authority').toEqual([])
        })
    });

    test.describe('releaseVoidsReorder — the release-boundary decision matrix', () => {
        // horizontal toolbar band: 400 wide, 32 tall — and its vertical dual
        const H_RECT = {x: 100, y: 100, width: 400, height: 32};
        const V_RECT = {x: 100, y: 100, width: 32,  height: 400};

        // Prototype-driven over a minimal `this` (the method is pure over these two fields) —
        // the same pattern the carried-scope pins use; no zone lifecycle involved.
        const decide = (rect, coords, dockReleaseTolerance = 32) =>
            DockTabSortZone.prototype.releaseVoidsReorder.call({dockReleaseTolerance, dockSourceToolbarRect: rect}, coords);

        test('horizontal toolbar: near releases preserve the reorder, far releases void it', () => {
            // inside the toolbar (the legit reorder release)
            expect(decide(H_RECT, {clientX: 300, clientY: 116})).toBe(false);
            // sloppy-but-near: 12px past the right edge, still within tolerance
            expect(decide(H_RECT, {clientX: 512, clientY: 116})).toBe(false);
            // sloppy-but-near: 20px below the band
            expect(decide(H_RECT, {clientX: 300, clientY: 152})).toBe(false);
            // far below — another zone's territory (the flagship revert scenario)
            expect(decide(H_RECT, {clientX: 300, clientY: 400})).toBe(true);
            // far left — beyond x - tolerance
            expect(decide(H_RECT, {clientX: 30, clientY: 116})).toBe(true)
        });

        test('vertical toolbar: the tolerance pads the REAL bounds, never an axis-derived span', () => {
            // inside the vertical band
            expect(decide(V_RECT, {clientX: 116, clientY: 300})).toBe(false);
            // sloppy-but-near: 20px right of the band (within tolerance)
            expect(decide(V_RECT, {clientX: 152, clientY: 300})).toBe(false);
            // far right — the case a long-axis-derived tolerance (height=400) would wrongly ADMIT
            expect(decide(V_RECT, {clientX: 300, clientY: 300})).toBe(true);
            // far below the band's real end
            expect(decide(V_RECT, {clientX: 116, clientY: 600})).toBe(true)
        });

        test('the tolerance is a config, not policy: an override widens the near band', () => {
            // 90px below the band: voided at the default 32, preserved at 100
            expect(decide(H_RECT, {clientX: 300, clientY: 222}, 100)).toBe(false);
            // 110px below: beyond even the widened tolerance
            expect(decide(H_RECT, {clientX: 300, clientY: 242}, 100)).toBe(true)
        });

        test('fail-open guards: no snapshot or non-numeric coordinates never void a reorder', () => {
            expect(decide(null, {clientX: 300, clientY: 400}), 'no rect = no decision').toBe(false);
            expect(decide(H_RECT, {clientX: undefined, clientY: 400})).toBe(false);
            expect(decide(H_RECT, {})).toBe(false)
        })
    });

    test.describe('whole-stack gesture — existing drag lifecycle, grouped semantic terminal', () => {
        test('drag-start on the projected grip stamps the model-resolved group and bypasses tab reorder setup', async () => {
            const dragStarts = [];
            const strategy   = {id: 'strategy-button', vdom: {id: 'strategy-vdom'}};
            const swarm      = {id: 'swarm-button', vdom: {id: 'swarm-vdom'}};
            const zone       = {
                dockGroupNodeId  : 'main-tabs',
                dockItemIds      : ['strategy', 'swarm'],
                dockWorkspaceId  : 'popup',
                dragStart        : data => dragStarts.push(data),
                isStackHandleDrag: DockTabSortZone.prototype.isStackHandleDrag,
                owner            : {
                    getDomRect: async () => ({x: 10, y: 20, width: 300, height: 32}),
                    items     : [strategy, swarm],
                    getTabButtons() { return this.items }
                }
            };
            // Production DragDrop shape: the original nested mousedown survives as `target`,
            // while the custom drag:start `path` begins at the draggable button.
            const data = {
                path      : [{id: 'swarm-button'}],
                target    : {cls: ['neo-dock-stack-handle']},
                targetPath: [{cls: ['neo-dock-stack-handle']}, {id: 'swarm-button'}]
            };

            await DockTabSortZone.prototype.onDragStart.call(zone, data);

            expect(dragStarts).toEqual([data]);
            expect(zone.stackDragActive).toBe(true);
            expect(zone.dragComponent).toBe(swarm);
            expect(zone.dragElement).toBe(swarm.vdom);
            expect(zone.startIndex).toBe(1);
            expect(zone.dockSourceToolbarRect).toEqual({x: 10, y: 20, width: 300, height: 32});
            expect(swarm).toMatchObject({
                dockGroupNodeId      : 'main-tabs',
                dockItemId           : 'swarm',
                dockSourceWorkspaceId: 'popup'
            })
        });

        test('commit and cancel each report exactly one terminal, then clear grouped drag state', async () => {
            const run = async cancelled => {
                const calls = [];
                const zone  = {
                    dockGroupNodeId: 'main-tabs',
                    dockItemIds    : ['swarm'],
                    dockWorkspaceId: 'popup',
                    dragComponent  : {id: 'swarm-button'},
                    dragElement    : {id: 'swarm-vdom'},
                    dragEnd        : data => calls.push(['cleanup', data]),
                    dragCoordinator: {
                        onDragCancel: () => calls.push(['coordinator-cancel']),
                        onDragEnd   : () => calls.push(['coordinator-end'])
                    },
                    owner              : {up: () => ({fire: (name, data) => calls.push([name, data])})},
                    remoteDropCommitted: !cancelled,
                    sortGroup          : 'dock-demo',
                    stackDragActive    : true,
                    startIndex         : 0
                };
                const data = {cancelled};

                await DockTabSortZone.prototype.processDragEnd.call(zone, data);

                return {calls, zone}
            };

            const committed = await run(false);
            const cancelled = await run(true);

            expect(committed.calls.map(([name]) => name)).toEqual(['coordinator-end', 'dockStackDragTerminal', 'cleanup']);
            expect(committed.calls[1][1]).toMatchObject({
                cancelled: false, committed: true, errors: [], groupNodeId: 'main-tabs',
                itemId   : 'swarm', outcome: 'committed'
            });
            expect(cancelled.calls.map(([name]) => name)).toEqual(['coordinator-cancel', 'dockStackDragTerminal', 'cleanup']);
            expect(cancelled.calls[1][1]).toMatchObject({
                cancelled: true, committed: false, errors: [], groupNodeId: 'main-tabs',
                itemId   : 'swarm', outcome: 'cancelled'
            });

            for (const state of [committed.zone, cancelled.zone]) {
                expect(state.remoteDropCommitted).toBe(false);
                expect(state.stackDragActive).toBe(false);
                expect(state.dragComponent).toBeNull();
                expect(state.startIndex).toBe(-1)
            }
        })
    });

    test.describe('tear-out gesture terminals — the choreography outcome routing', () => {
        // Prototype-driven like every pin above: the drag-end decision chain is the unit; the
        // base lifecycle is stubbed to nothing so only the dock routing under test runs.
        const zoneFor = (fired, overrides = {}) => ({
            dockItemIds           : ['audit', 'graph', 'inbox'],
            dockSourceNodeId      : 'tabs-main',
            dragComponent         : null,
            fireDockLifecycleEvent: DockTabSortZone.prototype.fireDockLifecycleEvent,
            isWindowDragging      : false,
            owner                 : {up: () => ({fire: (name, data) => fired.push([name, data])})},
            releaseVoidsReorder   : () => false,
            remoteDropCommitted   : false,
            sortGroup             : null,
            startIndex            : 1,
            ...overrides
        });

        const runDragEnd = async (zone, data) => {
            const original = TabHeaderSortZone.prototype.processDragEnd;

            TabHeaderSortZone.prototype.processDragEnd = async function() {};

            try {
                await DockTabSortZone.prototype.processDragEnd.call(zone, data)
            } finally {
                TabHeaderSortZone.prototype.processDragEnd = original
            }
        };

        test('released while DETACHED fires the terminal — the one detachItem seam — never the in-window drop', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {isWindowDragging: true});

            await runDragEnd(zone, {cancelled: false, clientX: 5000, clientY: 400});

            expect(fired.map(([name]) => name)).toEqual(['dockTearOutTerminal']);
            expect(fired[0][1]).toEqual({itemId: 'graph', sortZone: zone, sourceNodeId: 'tabs-main'})
        });

        test('cancelled while DETACHED retires the vessel before generic cleanup clears the detached fact', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {
                dragComponent   : {id: 'graph-button'},
                fire            : (name, data) => fired.push([name, data]),
                isWindowDragging: true
            });

            zone.onDragEnd = data => runDragEnd(zone, data);

            await DockTabSortZone.prototype.onDragCancel.call(zone, {key: 'Escape'});

            // Order matters: vessel retirement observes the detached fact before the generic base
            // clears it; the ordinary cancel signal and affordance reset still follow unchanged.
            expect(fired.map(([name]) => name)).toEqual([
                'dockTearOutCancel', 'dragCancel', 'dockCrossZoneDragCancel'
            ]);
            expect(zone.isWindowDragging, 'generic cleanup still restores the in-window state').toBe(false);
            // neither terminal nor drop — the zero-model-mutation invariant has no commit seam to reach
            expect(fired.some(([name]) => name === 'dockTearOutTerminal')).toBe(false);
            expect(fired.some(([name]) => name === 'dockCrossZoneDrop')).toBe(false)
        });

        test('a converted detached cancel forwards the sole tear-out close settlement into Park', async () => {
            const fired      = [];
            const retirement = Promise.resolve(true);
            const zone       = zoneFor(fired, {
                dragComponent   : {dockItemId: 'graph', id: 'graph-button'},
                fire            : (name, data) => fired.push([name, data]),
                isWindowDragging: true,
                owner           : {up: () => ({fire(name, data) {
                    name === 'dockTearOutCancel' && (data.settlement = retirement);
                    fired.push([name, data])
                }})},
                vesselConversionSensor: {converted: true, transitioning: false}
            });

            zone.onDragEnd = data => runDragEnd(zone, data);

            await DockTabSortZone.prototype.onDragCancel.call(zone, {key: 'Escape'});

            expect(fired.map(([name]) => name)).toEqual([
                'dockTearOutCancel',
                'dockVesselConversionRetired',
                'dragCancel',
                'dockCrossZoneDragCancel'
            ]);
            expect(fired[1][1]).toMatchObject({itemId: 'graph', retirement})
        });

        test('an in-window cancel never emits a tear-out terminal', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {
                dragComponent: {id: 'graph-button'},
                fire         : (name, data) => fired.push([name, data])
            });

            zone.onDragEnd = data => runDragEnd(zone, data);

            await DockTabSortZone.prototype.onDragCancel.call(zone, {key: 'Escape'});

            expect(fired.map(([name]) => name)).toEqual(['dragCancel', 'dockCrossZoneDragCancel']);
            expect(fired.some(([name]) => name === 'dockTearOutCancel')).toBe(false)
        });

        test('an in-window release still routes the cross-zone drop exactly as before (regression pin)', async () => {
            const fired = [];
            const zone  = zoneFor(fired);

            await runDragEnd(zone, {cancelled: false, clientX: 300, clientY: 400});

            expect(fired.map(([name]) => name)).toEqual(['dockCrossZoneDrop']);
            expect(fired[0][1]).toEqual({clientX: 300, clientY: 400, itemId: 'graph', sourceNodeId: 'tabs-main'})
        });

        test('a committed remote transfer outranks the tear-out terminal — deterministic outcome order, no double commit', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {isWindowDragging: true, remoteDropCommitted: true});

            await runDragEnd(zone, {cancelled: false, clientX: 5000, clientY: 400});

            expect(fired, 'the item already left this document — every local commit seam stays silent').toEqual([]);
            expect(zone.remoteDropCommitted, 'the one-shot flag is consumed').toBe(false)
        });

        test('a converted remote commit emits one committed conversion terminal and no local terminal', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {
                dragComponent         : {dockItemId: 'graph', id: 'graph-button'},
                sortGroup             : 'dock-cross-window',
                vesselConversionSensor: {
                    converted      : true,
                    targetConverted: true,
                    transitioning  : false
                }
            });

            zone.dragCoordinator = {
                onDragEnd() {
                    zone.remoteDropCommitted = true
                }
            };

            await runDragEnd(zone, {cancelled: false, clientX: 5000, clientY: 400});

            expect(fired.map(([name]) => name)).toEqual(['dockVesselConversionTerminal']);
            expect(fired[0][1]).toMatchObject({itemId: 'graph', outcome: 'committed', settlement: false})
        });

        test('a throwing remote target retires the parked provisional vessel before rethrowing', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {
                dragComponent         : {dockItemId: 'graph', id: 'graph-button'},
                sortGroup             : 'dock-cross-window',
                vesselConversionSensor: {
                    converted      : true,
                    targetConverted: true,
                    transitioning  : false
                }
            });

            zone.dragCoordinator = {
                onDragEnd() {
                    throw new Error('target commit failed')
                }
            };

            await expect(runDragEnd(zone, {cancelled: false, clientX: 5000, clientY: 400}))
                .rejects.toThrow('target commit failed');
            expect(fired.map(([name]) => name)).toEqual([
                'dockTearOutCancel', 'dockVesselConversionRetired'
            ]);
            expect(fired[1][1]).toMatchObject({itemId: 'graph', retirement: false})
        });

        test('a release during convert-out restores before the ordinary detached terminal', async () => {
            let resolveRestore;

            const restored = new Promise(resolve => resolveRestore = resolve),
                  order    = [],
                  fired    = [],
                  zone     = zoneFor(fired, {
                      dragComponent   : {dockItemId: 'graph', id: 'graph-button'},
                      isWindowDragging: true,
                      owner           : {up: () => ({fire(name, data) {
                          order.push(name);
                          name === 'dockVesselConversionTerminal' && (data.settlement = restored);
                          fired.push([name, data])
                      }})},
                      resetVesselConversion() {
                          order.push('reset')
                      },
                      vesselConversionSensor: {
                          converted      : true,
                          targetConverted: false,
                          transitioning  : true
                      }
                  });

            const running = runDragEnd(zone, {cancelled: false, clientX: 5000, clientY: 400});

            await Promise.resolve();
            expect(order).toEqual(['dockVesselConversionTerminal', 'reset']);

            resolveRestore(true);
            await running;

            expect(order).toEqual([
                'dockVesselConversionTerminal', 'reset', 'dockTearOutTerminal'
            ])
        });

        test('the boundary events re-fire on the tab.Container with the dock identity attached', () => {
            const fired = [];
            const zone  = zoneFor(fired);
            const data  = {intersectionRatio: 0.42, proxyRect: {x: 1, y: 2}};

            DockTabSortZone.prototype.onDockBoundaryExit.call(zone, data);
            DockTabSortZone.prototype.onDockBoundaryEntry.call(zone, data);

            expect(fired.map(([name]) => name)).toEqual(['dockTearOutExit', 'dockTearOutEntry']);

            for (const [, payload] of fired) {
                expect(payload.itemId).toBe('graph');
                expect(payload.sourceNodeId).toBe('tabs-main');
                expect(payload.sortZone).toBe(zone);
                expect(payload.intersectionRatio).toBe(0.42) // the base payload rides along
            }
        });

        test('startWindowDrag arms the detached embodiment: proxy invisible-but-alive, base reorder parked, addon engaged', () => {
            const addonCalls  = [];
            const proxyStyles = [];
            const zone        = {
                dragProxy       : {set style(value) { proxyStyles.push(value) }},
                isWindowDragging: false,
                windowId        : 7
            };

            const hadDragDrop = Object.hasOwn(Neo.main.addon, 'DragDrop'),
                  original    = Neo.main.addon.DragDrop;

            Neo.main.addon.DragDrop = {startWindowDrag: data => addonCalls.push(data)};

            try {
                DockTabSortZone.prototype.startWindowDrag.call(zone, {
                    popupHeight: 480, popupWidth: 640, windowName: 'graph'
                });
            } finally {
                if (hadDragDrop) { Neo.main.addon.DragDrop = original } else { delete Neo.main.addon.DragDrop }
            }

            expect(proxyStyles).toEqual([{opacity: 0}]);   // invisible, never destroyed — it still captures pointer events
            expect(zone.isWindowDragging).toBe(true);      // parks the base reorder commit for this gesture
            expect(addonCalls).toEqual([{popupHeight: 480, popupName: 'graph', popupWidth: 640, windowId: 7}])
        });

        test('endWindowDrag closes worker + main movement ownership before the next pointer frame', () => {
            const addonCalls  = [];
            const proxyStyles = [];
            const zone        = {
                dragProxy       : {set style(value) { proxyStyles.push(value) }},
                isWindowDragging: true,
                windowId        : 7
            };

            const hadDragDrop = Object.hasOwn(Neo.main.addon, 'DragDrop'),
                  original    = Neo.main.addon.DragDrop;

            Neo.main.addon.DragDrop = {setConfigs: data => addonCalls.push(data)};

            try {
                DockTabSortZone.prototype.endWindowDrag.call(zone);

                // Proxy-less close (torn down mid-gesture) still reconciles both owners.
                DockTabSortZone.prototype.endWindowDrag.call({
                    dragProxy: null, isWindowDragging: true, windowId: 8
                })
            } finally {
                if (hadDragDrop) { Neo.main.addon.DragDrop = original } else { delete Neo.main.addon.DragDrop }
            }

            expect(proxyStyles).toEqual([{opacity: 1}]);
            expect(zone.isWindowDragging).toBe(false);
            expect(addonCalls).toEqual([
                {isWindowDragging: false, windowId: 7},
                {isWindowDragging: false, windowId: 8}
            ])
        })

        test('a winning remote pointer claim outranks popup-scale source-boundary overlap for that frame', () => {
            const fired = [];
            const zone  = {
                boundaryContainerRect: {bottom: 100, height: 100, right: 100, width: 100, x: 0, y: 0},
                dragCoordinator      : {pointerClaimArbiter: {resolve: () => ({stableId: 'workspace-a'})}},
                dragPlaceholder      : null,
                fire                 : name => fired.push(name),
                isWindowDragging     : true,
                lastIntersectionRatio: 0,
                lastProxyDims        : {height: 80, width: 80},
                onWindowDragContinue : () => fired.push('continue'),
                reattachArmed        : true,
                reattachThreshold    : 0.6
            };
            const frame = {
                proxyRect: {bottom: 80, height: 80, right: 80, width: 80, x: 0, y: 0}
            };

            expect(DockTabSortZone.prototype.checkWindowBoundary.call(zone, frame)).toBe(true);
            expect(fired, 'the claimed remote frame cannot retire the source vessel').toEqual([]);

            zone.dragCoordinator.pointerClaimArbiter.resolve = () => null;

            expect(DockTabSortZone.prototype.checkWindowBoundary.call(zone, frame)).toBe(true);
            expect(fired, 'the next claim-free source frame delegates to ordinary re-entry').toEqual([
                'dragBoundaryEntry'
            ])
        })
    });

    test.describe('vessel conversion binding — source-owned decision and pointer stability', () => {
        const sourceRect = {x: 20, y: 20, width: 200, height: 120};
        const targetRect = {x: 0, y: 0, width: 800, height: 600};

        function createZone(overrides = {}) {
            const calls = [];
            const zone  = {
                dockItemIds              : ['graph'],
                dockSourceNodeId         : 'tabs-main',
                dragComponent            : {id: 'graph-button', reference: 'graph'},
                dragCoordinator          : null,
                enableVesselConversion   : true,
                getVesselConversionSensor: DockTabSortZone.prototype.getVesselConversionSensor,
                isWindowDragging         : true,
                owner                    : {up: () => ({fire(name, data) {
                    if (name === 'dockVesselConversionSourceRectRequest') {
                        data.sourceRect = typeof overrides.liveSourceRect === 'function'
                            ? overrides.liveSourceRect(data)
                            : overrides.liveSourceRect ?? data.logicalRect;
                        return
                    }
                    if (name === 'dockVesselConversionIn') {
                        data.admission = overrides.convertInAdmission ?? true
                    } else if (name === 'dockVesselConversionOut') {
                        data.admission = overrides.convertOutAdmission ?? true
                    }
                    calls.push([name, data])
                }})},
                resolveVesselConversionSourceGeometry: DockTabSortZone.prototype.resolveVesselConversionSourceGeometry,
                resolveRemoteDragTransition          : DockTabSortZone.prototype.resolveRemoteDragTransition,
                resetVesselConversion                : DockTabSortZone.prototype.resetVesselConversion,
                scheduleVesselConversionReplay       : DockTabSortZone.prototype.scheduleVesselConversionReplay,
                startIndex                           : 0,
                vesselConversionConvertThreshold     : 0.55,
                vesselConversionCancelPromise        : null,
                vesselConversionCoordinatorFrame     : null,
                vesselConversionEpoch                : 0,
                vesselConversionItemId               : null,
                vesselConversionPointerExitGraceMs   : 0,
                vesselConversionPointerMissedAt      : null,
                vesselConversionReplayFrame          : null,
                vesselConversionReplayPromise        : null,
                vesselConversionRevertThreshold      : 0.35,
                vesselConversionSensor               : null,
                vesselConversionLogicalRect          : null,
                vesselConversionSourceRect           : null,
                vesselConversionTargetId             : null,
                vesselConversionTargetRect           : null,
                ...overrides
            };

            return {calls, zone}
        }

        const resolve = (zone, overrides = {}) => DockTabSortZone.prototype.resolveRemoteDragTransition.call(zone, {
            draggedItem      : {id: 'graph'},
            now              : 100,
            pointerInTarget  : true,
            logicalSourceRect: sourceRect,
            targetId         : 'workspace-a',
            targetRect,
            ...overrides
        });

        test('disabled or non-window sources return null — the generic coordinator path stays byte-identical', () => {
            expect(resolve(createZone({enableVesselConversion: false}).zone)).toBeNull();
            expect(resolve(createZone({isWindowDragging: false}).zone)).toBeNull()
        });

        test('the binding converts every size-pair direction through dock-owned lifecycle events', () => {
            const pairs = [
                [{x: 100, y: 100, width: 200,  height: 150}, {x: 0,   y: 0,   width: 1200, height: 800}],
                [{x: 0,   y: 0,   width: 1200, height: 800}, {x: 300, y: 200, width: 200,  height: 150}],
                [{x: 0,   y: 0,   width: 640,  height: 480}, {x: 0,   y: 0,   width: 600,  height: 500}]
            ];

            for (const [source, target] of pairs) {
                const {calls, zone} = createZone();
                const decision      = resolve(zone, {logicalSourceRect: source, targetRect: target});

                expect(decision).toEqual({
                    commitEligible: true,
                    engage        : true,
                    retain        : false,
                    sourceRect    : source
                });
                expect(calls.map(([name]) => name)).toEqual(['dockVesselConversionIn']);
                expect(calls[0][1]).toMatchObject({sourceNodeId: 'tabs-main', targetId: 'workspace-a'})
            }
        });

        test('the live vessel resolver owns the metric denominator, never the logical proxy', () => {
            const liveSourceRect = {x: 310, y: 220, width: 400, height: 300};
            const {zone}         = createZone({liveSourceRect});

            expect(resolve(zone, {
                logicalSourceRect: {x: 20, y: 20, width: 40, height: 20},
                targetRect       : {x: 300, y: 200, width: 420, height: 320}
            })).toEqual({
                commitEligible: true,
                engage        : true,
                retain        : false,
                sourceRect    : liveSourceRect
            });
            expect(zone.vesselConversionSourceRect).toEqual(liveSourceRect);
            expect(zone.vesselConversionLogicalRect).toEqual({x: 20, y: 20, width: 40, height: 20})
        });

        test('the coordinator frame carries actuator identity when no base reorder index exists', () => {
            const {calls, zone} = createZone({dockItemIds: null, startIndex: null});

            expect(resolve(zone, {draggedItem: {dockItemId: 'workbench'}})).toEqual({
                commitEligible: true,
                engage        : true,
                retain        : false,
                sourceRect    : {height: 120, width: 200, x: 20, y: 20}
            });
            expect(calls[0][1].itemId).toBe('workbench')
        });

        test('async park admission is fail-closed, then admitted frames use logical position with frozen exact extents', async () => {
            let resolvePark,
                physical = {x: 20, y: 20, width: 200, height: 120};

            const admission     = new Promise(resolve => resolvePark = resolve),
                  {calls, zone} = createZone({
                      convertInAdmission: admission,
                      liveSourceRect    : () => physical
                  });

            expect(resolve(zone)).toEqual({commitEligible: false, engage: false, retain: false});
            expect(zone.vesselConversionSensor.transitioning).toBe(true);

            // Product park output is host-authored physical placement. That observation must not
            // become the next user-trajectory sample.
            physical = {x: -10000, y: -10000, width: 200, height: 120};
            expect(resolve(zone)).toEqual({commitEligible: false, engage: false, retain: false});

            resolvePark(true);
            await zone.vesselConversionSensor.transitionPromise;

            expect(resolve(zone)).toEqual({
                commitEligible: true,
                engage        : true,
                retain        : false,
                sourceRect
            });
            expect(zone.vesselConversionSourceRect).toEqual(sourceRect);
            expect(calls.map(([name]) => name)).toEqual(['dockVesselConversionIn'])
        });

        test('settled initial park re-enters the coordinator without a second external pointer frame', async () => {
            let resolvePark;

            const
                admission         = new Promise(resolve => resolvePark = resolve),
                coordinatorFrames = [],
                proxyRect         = {},
                {calls, zone}     = createZone({
                    convertInAdmission: admission,
                    dragCoordinator   : {
                        onDragMove(frame) {
                            coordinatorFrames.push(frame)
                        }
                    }
                });

            Object.defineProperties(proxyRect, {
                height: {value: 120},
                width : {value: 200},
                x     : {value: 20},
                y     : {value: 20}
            });
            zone.vesselConversionCoordinatorFrame = {
                draggedItem   : {id: 'graph'},
                offsetX       : 10,
                offsetY       : 8,
                proxyRect,
                screenX       : 180,
                screenY       : 140,
                sourceSortZone: zone
            };

            expect(resolve(zone)).toEqual({commitEligible: false, engage: false, retain: false});

            const replay = zone.vesselConversionReplayPromise;

            resolvePark(true);
            await replay;

            expect(calls.map(([name]) => name)).toEqual(['dockVesselConversionIn']);
            expect(coordinatorFrames).toHaveLength(1);
            expect(coordinatorFrames[0]).toMatchObject({
                draggedItem          : {id: 'graph'},
                proxyRect            : {height: 120, width: 200, x: 20, y: 20},
                replayAfterTransition: true,
                screenX              : 180,
                screenY              : 140,
                sourceSortZone       : zone
            })
        });

        test('refused initial park emits no coordinator replay or automatic retry', async () => {
            let resolvePark;

            const
                admission         = new Promise(resolve => resolvePark = resolve),
                coordinatorFrames = [],
                {calls, zone}     = createZone({
                    convertInAdmission              : admission,
                    dragCoordinator                 : {onDragMove: frame => coordinatorFrames.push(frame)},
                    vesselConversionCoordinatorFrame: {
                        draggedItem   : {id: 'graph'},
                        proxyRect     : sourceRect,
                        screenX       : 180,
                        screenY       : 140,
                        sourceSortZone: null
                    }
                });

            expect(resolve(zone)).toEqual({commitEligible: false, engage: false, retain: false});

            const replay = zone.vesselConversionReplayPromise;

            resolvePark(false);
            await replay;

            expect(calls.map(([name]) => name)).toEqual(['dockVesselConversionIn']);
            expect(coordinatorFrames).toEqual([]);
            expect(zone.vesselConversionSensor.converted).toBe(false);
            expect(zone.vesselConversionReplayPromise).toBeNull()
        });

        test('gesture reset invalidates a successful late park before coordinator replay', async () => {
            let resolvePark;

            const
                admission         = new Promise(resolve => resolvePark = resolve),
                coordinatorFrames = [],
                {zone}            = createZone({
                    convertInAdmission              : admission,
                    dragCoordinator                 : {onDragMove: frame => coordinatorFrames.push(frame)},
                    vesselConversionCoordinatorFrame: {
                        draggedItem   : {id: 'graph'},
                        proxyRect     : sourceRect,
                        screenX       : 180,
                        screenY       : 140,
                        sourceSortZone: null
                    }
                });

            resolve(zone);

            const replay = zone.vesselConversionReplayPromise;

            DockTabSortZone.prototype.resetVesselConversion.call(zone);
            resolvePark(true);
            await replay;

            expect(coordinatorFrames).toEqual([]);
            expect(zone.vesselConversionCoordinatorFrame).toBeNull();
            expect(zone.vesselConversionSensor.converted).toBe(false)
        });

        test('the latest low-overlap frame replays after async park so stale admission cannot convert', async () => {
            let resolvePark;

            const admission     = new Promise(resolve => resolvePark = resolve),
                  {calls, zone} = createZone({convertInAdmission: admission});

            expect(resolve(zone)).toEqual({commitEligible: false, engage: false, retain: false});

            // The pointer remains inside the target but retreats below convertThreshold while the
            // host effect is pending, then stops. No third browser frame may be required.
            expect(resolve(zone, {
                logicalSourceRect: {x: 760, y: 20, width: 200, height: 120}
            })).toEqual({commitEligible: false, engage: false, retain: false});

            const replay = zone.vesselConversionReplayPromise;

            resolvePark(true);
            await replay;

            expect(zone.vesselConversionSensor.converted).toBe(false);
            expect(zone.vesselConversionSensor.transitioning).toBe(false);
            expect(calls.map(([name]) => name)).toEqual([
                'dockVesselConversionIn', 'dockVesselConversionOut'
            ])
        });

        test('the latest re-entry frame replays after async re-show without waiting for another move', async () => {
            let resolveRestore;

            const restoration   = new Promise(resolve => resolveRestore = resolve),
                  {calls, zone} = createZone({convertOutAdmission: restoration});

            expect(resolve(zone)).toEqual({
                commitEligible: true,
                engage        : true,
                retain        : false,
                sourceRect    : {height: 120, width: 200, x: 20, y: 20}
            });
            expect(resolve(zone, {pointerInTarget: false, targetId: null, targetRect: null}))
                .toEqual({commitEligible: false, engage: false, retain: false});

            expect(resolve(zone)).toEqual({commitEligible: false, engage: false, retain: false});

            const replay = zone.vesselConversionReplayPromise;

            resolveRestore(true);
            await replay;

            expect(zone.vesselConversionSensor.converted).toBe(true);
            expect(calls.map(([name]) => name)).toEqual([
                'dockVesselConversionIn', 'dockVesselConversionOut', 'dockVesselConversionIn'
            ])
        });

        test('re-show replay ignores a stale parked manager rect after the pointer remains below threshold', async () => {
            let resolveRestore,
                physical = sourceRect;

            const restoration   = new Promise(resolve => resolveRestore = resolve),
                  {calls, zone} = createZone({
                      convertOutAdmission: restoration,
                      liveSourceRect     : () => physical
                  });

            expect(resolve(zone)).toEqual({
                commitEligible: true,
                engage        : true,
                retain        : false,
                sourceRect    : {height: 120, width: 200, x: 20, y: 20}
            });
            physical = {x: 0, y: 0, width: 200, height: 120};

            expect(resolve(zone, {pointerInTarget: false, targetId: null, targetRect: null}))
                .toEqual({commitEligible: false, engage: false, retain: false});
            expect(resolve(zone, {
                logicalSourceRect: {x: 760, y: 20, width: 200, height: 120}
            })).toEqual({commitEligible: false, engage: false, retain: false});

            const replay = zone.vesselConversionReplayPromise;

            resolveRestore(true);
            await replay;

            expect(zone.vesselConversionSensor.converted).toBe(false);
            expect(calls.map(([name]) => name)).toEqual([
                'dockVesselConversionIn', 'dockVesselConversionOut'
            ])
        });

        test('raw claim loss drops commit immediately while a bounded visual grace emits no flip', () => {
            const {calls, zone} = createZone({vesselConversionPointerExitGraceMs: 50});

            expect(resolve(zone)).toMatchObject({commitEligible: true, engage: true});
            expect(resolve(zone, {now: 110, pointerInTarget: false, targetId: null, targetRect: null}))
                .toEqual({
                    commitEligible: false,
                    engage        : true,
                    retain        : true,
                    sourceRect    : {height: 120, width: 200, x: 20, y: 20}
                });
            expect(resolve(zone, {now: 159, pointerInTarget: false, targetId: null, targetRect: null}))
                .toEqual({
                    commitEligible: false,
                    engage        : true,
                    retain        : true,
                    sourceRect    : {height: 120, width: 200, x: 20, y: 20}
                });

            expect(calls.map(([name]) => name)).toEqual(['dockVesselConversionIn']);

            expect(resolve(zone, {now: 160, pointerInTarget: false, targetId: null, targetRect: null}))
                .toEqual({commitEligible: false, engage: false, retain: false});
            expect(calls.map(([name]) => name)).toEqual([
                'dockVesselConversionIn', 'dockVesselConversionOut'
            ])
        });

        test('A→B target identity cannot inherit conversion — A exits before B decides fresh', () => {
            const {calls, zone} = createZone();

            resolve(zone);
            resolve(zone, {targetId: 'workspace-b'});

            expect(calls.map(([name]) => name)).toEqual([
                'dockVesselConversionIn',
                'dockVesselConversionOut',
                'dockVesselConversionIn'
            ]);
            expect(calls[1][1].targetId).toBe('workspace-a');
            expect(calls[2][1].targetId).toBe('workspace-b')
        });

        test('gesture reset is silent and clears every binding-owned identity/timestamp', () => {
            const {calls, zone} = createZone({vesselConversionPointerExitGraceMs: 50});

            resolve(zone);
            resolve(zone, {now: 110, pointerInTarget: false, targetId: null, targetRect: null});
            DockTabSortZone.prototype.resetVesselConversion.call(zone);

            expect(calls.map(([name]) => name)).toEqual(['dockVesselConversionIn']);
            expect(zone.vesselConversionSensor.converted).toBe(false);
            expect(zone.vesselConversionItemId).toBeNull();
            expect(zone.vesselConversionPointerMissedAt).toBeNull();
            expect(zone.vesselConversionLogicalRect).toBeNull();
            expect(zone.vesselConversionSourceRect).toBeNull();
            expect(zone.vesselConversionTargetId).toBeNull();
            expect(zone.vesselConversionTargetRect).toBeNull()
        })
    })
});
