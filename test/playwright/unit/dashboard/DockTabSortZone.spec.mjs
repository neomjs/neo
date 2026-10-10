import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTabSortZoneTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockTabSortZone   from '../../../../src/dashboard/dock/interaction/TabSortZone.mjs';
import ContainerSortZone from '../../../../src/draggable/container/SortZone.mjs';
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
test.describe('Neo.dashboard.dock.interaction.TabSortZone', () => {
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
                owner        : {getDomRect: () => calls.push('measure')}
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
                },
                resolveSourceOwnershipId: () => 'group-popup'
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
                dockSourceOwnershipId: 'group-popup',
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

    test.describe('asynchronous target settlement', () => {
        let coordinator, originalCleanup;

        test.beforeAll(async () => {
            coordinator = (await import('../../../../src/manager/DragCoordinator.mjs')).default
        });

        test.beforeEach(() => {
            originalCleanup = TabHeaderSortZone.prototype.processDragEnd
        });

        test.afterEach(() => {
            TabHeaderSortZone.prototype.processDragEnd = originalCleanup;
            coordinator.activeSourceZone = coordinator.activeTargetZone = null;
            coordinator.activeTransitionOwned = false
        });

        for (const stack of [false, true]) {
            for (const outcome of ['committed', 'refused', 'refused-false', 'rejected']) {
                test(`${stack ? 'stack' : 'pane'} waits for ${outcome} before its terminal and cleanup`, async () => {
                    const pending = Promise.withResolvers(),
                          calls   = [],
                          error   = new Error('target failure'),
                          zone    = {
                              dockItemIds    : ['graph'],
                              dragComponent  : {dockItemId: 'graph', id: 'graph-button'},
                              dragCoordinator: coordinator,
                              dragEnd        : () => calls.push(['cleanup']),
                              onRemoteDropOut() {
                                  calls.push(['remote-out']);
                                  this.remoteDropCommitted = true
                              },
                              owner              : {up: () => ({fire: (name, data) => calls.push([name, data])})},
                              processDragEnd     : DockTabSortZone.prototype.processDragEnd,
                              releaseVoidsReorder: () => false,
                              remoteDropCommitted: false,
                              sortGroup          : 'async-dock-test',
                              stackDragActive    : stack,
                              startIndex         : 0
                          };

                    TabHeaderSortZone.prototype.processDragEnd = async () => calls.push(['cleanup']);
                    coordinator.activeTargetZone = {onRemoteDrop: () => pending.promise};
                    const running = ContainerSortZone.prototype.onDragEnd.call(zone, {cancelled: false}),
                          settled = running.then(() => null, failure => failure);

                    expect(calls, 'pending has no source terminal, retirement or base cleanup').toEqual([]);
                    expect(zone.dragEndActive).toBe(true);
                    await ContainerSortZone.prototype.onDragEnd.call(zone, {});
                    await DockTabSortZone.prototype.onDragStart.call(zone, {path: []});
                    expect(calls).toEqual([]);

                    outcome === 'rejected' ? pending.reject(error)
                        : pending.resolve(outcome === 'committed' ? {} : outcome === 'refused-false' ? false : null);
                    expect(await settled).toBe(outcome === 'rejected' ? error : null);

                    // A pane's remote outcome needs no local terminal: a commit already left this
                    // document, and a refusal leaves the pane where the drag found it.
                    const terminal = stack ? ['dockStackDragTerminal'] : [];

                    expect(calls.map(([name]) => name)).toEqual([
                        ...(outcome === 'committed' ? ['remote-out'] : []), ...terminal, 'cleanup'
                    ]);
                    if (stack) {
                        expect(calls.find(([name]) => name === terminal[0])[1].outcome)
                            .toBe(outcome === 'committed' ? 'committed' : 'rejected')
                    }
                    expect(zone.remoteDropCommitted).toBe(false);
                    expect(zone.dragEndActive).toBe(false)
                })
            }

            test(`${stack ? 'stack' : 'pane'} destroyed during settlement receives no late work or properties`, async () => {
                const pending = Promise.withResolvers(),
                      calls   = [],
                      zone    = Neo.create(DockTabSortZone, {
                          owner: {addDomListeners() {}, cls: [], dragResortable: false,
                              items: [], on() {}, style: {}, up: () => ({fire: name => calls.push(name)})}
                      });

                try {
                    await zone.ready();
                    Object.assign(zone, {
                        dragComponent  : {dockItemId: 'graph', id: 'graph-button'},
                        dragCoordinator: coordinator,
                        onRemoteDropOut: () => calls.push('remote-out'),
                        sortGroup      : 'async-dock-destroy-test',
                        stackDragActive: stack,
                        startIndex     : 0
                    });
                    TabHeaderSortZone.prototype.processDragEnd = async () => calls.push('cleanup');
                    coordinator.activeTargetZone = {onRemoteDrop: () => pending.promise};
                    const running = zone.onDragEnd({cancelled: false});

                    expect(calls).toEqual([]);
                    zone.destroy();
                    const keys         = Object.keys(zone).sort(),
                          afterDestroy = [...calls];

                    pending.resolve({type: 'transferItem'});
                    await running;
                    expect(calls).toEqual(afterDestroy);
                    expect(Object.keys(zone).sort()).toEqual(keys);
                    expect(Object.hasOwn(zone, 'dragEndActive')).toBe(false)
                } finally {
                    zone.destroy()
                }
            })
        }
    });

    test.describe('tear-out gesture terminals — the choreography outcome routing', () => {
        // Prototype-driven like every pin above: the drag-end decision chain is the unit; the
        // base lifecycle is stubbed to nothing so only the dock routing under test runs.
        const zoneFor = (fired, overrides = {}) => ({
            dockItemIds        : ['audit', 'graph', 'inbox'],
            dockSourceNodeId   : 'tabs-main',
            dragComponent      : null,
            isWindowDragging   : false,
            owner              : {up: () => ({fire: (name, data) => fired.push([name, data])})},
            releaseVoidsReorder: () => false,
            remoteDropCommitted: false,
            sortGroup          : null,
            startIndex         : 1,
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

    // A drag shows no window the user did not drag: the window of the group that holds the pointer
    // carries it as the source's tab-header proxy, a vessel riding the hand retires on that claim as
    // it does on re-entry, and nothing is parked anywhere.
    test.describe('a window of the group that claims the pointer carries the drag', () => {
        // the target proxy is the dragged tab header: its measured extent + the grab offset inside it
        const header = {height: 32, offsetX: 12, offsetY: 9, width: 90};

        function createZone(overrides = {}) {
            const fired = [];
            const zone  = {
                dragComponent               : {id: 'graph-button', reference: 'graph'},
                dragElementRect             : {x: 40, y: 4, width: header.width, height: header.height},
                enableVesselConversion      : true,
                fire                        : (name, data) => fired.push([name, data]),
                getVesselConversionProxyRect: DockTabSortZone.prototype.getVesselConversionProxyRect,
                isWindowDragging            : true,
                offsetX                     : header.offsetX,
                offsetY                     : header.offsetY,
                ...overrides
            };

            return {fired, zone}
        }

        const resolve = (zone, overrides = {}) => DockTabSortZone.prototype.resolveRemoteDragTransition.call(zone, {
            draggedItem    : {id: 'graph'},
            pointerInTarget: true,
            ...overrides
        });

        test('the claimed window embodies the tab-header proxy and may commit at once: nothing waits on a park', () => {
            const {fired, zone} = createZone({isWindowDragging: false});

            expect(resolve(zone)).toEqual({engage: true, proxyRect: header});
            expect(fired, 'an in-window drag has no vessel to retire').toEqual([])
        });

        test('a vessel riding the hand retires through the re-entry contract the moment a window claims the pointer', () => {
            const {fired, zone} = createZone();

            expect(resolve(zone)).toMatchObject({engage: true});
            expect(fired).toEqual([['dragBoundaryEntry', {draggedItem: zone.dragComponent, proxyRect: null, sortZone: zone}]])
        });

        test('a claim-free frame belongs to the source or the void; a source that did not opt in keeps the generic path', () => {
            expect(resolve(createZone().zone, {pointerInTarget: false})).toBeNull();
            expect(resolve(createZone({enableVesselConversion: false}).zone)).toBeNull()
        });

        test('an unmeasured drag element engages nothing rather than a window-sized proxy', () => {
            const {fired, zone} = createZone({dragElementRect: null});

            expect(resolve(zone)).toEqual({engage: false});
            expect(fired).toEqual([])
        });

        test('a claimed frame is no boundary crossing, and leaving that window for the desktop exits again', () => {
            let claim = {stableId: 'workspace-a'};

            const {fired, zone} = createZone({
                boundaryContainerRect: {x: 0, y: 0, width: 400, height: 300},
                detachThreshold      : 0.8,
                dragCoordinator      : {pointerClaimArbiter: {resolve: () => claim}},
                isWindowDragging     : false,
                lastIntersectionRatio: 0,
                reattachThreshold    : 0.6
            });
            // the proxy far outside the source window: on a claimed frame this is the other window's
            const outside = {proxyRect: {x: 900, y: 600, width: 90, height: 32}};

            expect(DockTabSortZone.prototype.checkWindowBoundary.call(zone, outside), 'the frame belongs to the claim').toBe(true);
            expect(fired, 'no vessel is born over a window').toEqual([]);

            claim = null;
            DockTabSortZone.prototype.checkWindowBoundary.call(zone, outside);

            expect(fired.map(([name]) => name), 'leaving that window for the desktop').toEqual(['dragBoundaryExit']);
            expect(zone.isWindowDragging).toBe(true)
        })
    })
});
