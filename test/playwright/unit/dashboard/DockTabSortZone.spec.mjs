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
    test.describe('onDragStart — the snapshot precedes the base mutation (lifecycle order)', () => {
        test('the toolbar rect is captured BEFORE the base writes span dimensions onto the live style', async () => {
            // A toolbar WIDER than its button span — the exact shape where the base's
            // expandOwnerOnDrag style-write shrinks the live box at drag start. The stub owner
            // reports the wide rect only while that write has not happened: a post-`super`
            // measure would read the span box, so the assertion proves the ORDER, not a value.
            // Prototype-driven like the carried-scope pins above — the method chain is the unit,
            // never a fully-constructed zone.
            const WIDE = {x: 100, y: 100, width: 600, height: 32};
            const SPAN = {x: 100, y: 100, width: 180, height: 32};

            let styleWritten = false;

            const owner = {
                getDomRect(ids) {
                    // the no-arg call is the subclass snapshot; array calls are the base batch
                    if (ids === undefined) return Promise.resolve(styleWritten ? {...SPAN} : {...WIDE});
                    return Promise.resolve(ids.map(() => ({...SPAN})))
                },
                get style() { return {} },
                set style(value) { styleWritten = true }
            };

            // The base chain needs more scaffolding than this witness wants to carry — stub it
            // to ONLY perform the mutation whose ordering is under test.
            const original = TabHeaderSortZone.prototype.onDragStart;

            TabHeaderSortZone.prototype.onDragStart = async function() {
                this.owner.style = {width: '180px'} // the expandOwnerOnDrag write, distilled
            };

            const zone = {dockItemIds: ['audit'], dockWorkspaceId: null, dragComponent: null, owner, startIndex: 0};

            try {
                await DockTabSortZone.prototype.onDragStart.call(zone, {path: []});

                expect(styleWritten, 'the base mutation ran').toBe(true);
                expect(zone.dockSourceToolbarRect, 'the snapshot is the PRE-mutation toolbar extent').toEqual(WIDE);
            } finally {
                TabHeaderSortZone.prototype.onDragStart = original
            }
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

        test('cancelled while DETACHED retires the vessel FIRST, then the regular cancel — zero commit events', async () => {
            const fired = [];
            const zone  = zoneFor(fired, {isWindowDragging: true});

            await runDragEnd(zone, {cancelled: true});

            // order matters: vessel cleanup precedes the generic cancel affordance reset
            expect(fired.map(([name]) => name)).toEqual(['dockTearOutCancel', 'dockCrossZoneDragCancel']);
            // neither terminal nor drop — the zero-model-mutation invariant has no commit seam to reach
            expect(fired.some(([name]) => name === 'dockTearOutTerminal')).toBe(false);
            expect(fired.some(([name]) => name === 'dockCrossZoneDrop')).toBe(false)
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

        test('endWindowDrag is the symmetric close: proxy visible, base reorder un-parked — the failed-admission degrade path', () => {
            const proxyStyles = [];
            const zone        = {
                dragProxy       : {set style(value) { proxyStyles.push(value) }},
                isWindowDragging: true
            };

            DockTabSortZone.prototype.endWindowDrag.call(zone);

            expect(proxyStyles).toEqual([{opacity: 1}]);
            expect(zone.isWindowDragging).toBe(false);

            // proxy-less call (torn down mid-gesture) stays safe — the flag still resets
            DockTabSortZone.prototype.endWindowDrag.call({dragProxy: null, isWindowDragging: true})
        })
    })
});
