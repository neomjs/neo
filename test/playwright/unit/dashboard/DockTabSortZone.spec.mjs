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
    test.describe('releaseVoidsReorder — the release-boundary decision matrix', () => {
        // horizontal toolbar band: 400 wide, 32 tall — and its vertical dual
        const H_RECT = {x: 100, y: 100, width: 400, height: 32};
        const V_RECT = {x: 100, y: 100, width: 32,  height: 400};

        const makeZone = (rect, config) => {
            const zone = Neo.create(DockTabSortZone, config || {});
            zone.dockSourceToolbarRect = rect;
            return zone
        };

        test('horizontal toolbar: near releases preserve the reorder, far releases void it', () => {
            const zone = makeZone(H_RECT); // default tolerance 32

            // inside the toolbar (the legit reorder release)
            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 116})).toBe(false);
            // sloppy-but-near: 12px past the right edge, still within tolerance
            expect(zone.releaseVoidsReorder({clientX: 512, clientY: 116})).toBe(false);
            // sloppy-but-near: 20px below the band
            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 152})).toBe(false);
            // far below — another zone's territory (the flagship revert scenario)
            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 400})).toBe(true);
            // far left — beyond x - tolerance
            expect(zone.releaseVoidsReorder({clientX: 30, clientY: 116})).toBe(true);

            zone.destroy()
        });

        test('vertical toolbar: the tolerance pads the REAL bounds, never an axis-derived span', () => {
            const zone = makeZone(V_RECT); // default tolerance 32

            // inside the vertical band
            expect(zone.releaseVoidsReorder({clientX: 116, clientY: 300})).toBe(false);
            // sloppy-but-near: 20px right of the band (within tolerance)
            expect(zone.releaseVoidsReorder({clientX: 152, clientY: 300})).toBe(false);
            // far right — the case a long-axis-derived tolerance (height=400) would wrongly ADMIT
            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 300})).toBe(true);
            // far below the band's real end
            expect(zone.releaseVoidsReorder({clientX: 116, clientY: 600})).toBe(true);

            zone.destroy()
        });

        test('the tolerance is a config, not policy: an override widens the near band', () => {
            const zone = makeZone(H_RECT, {dockReleaseTolerance: 100});

            // 90px below the band: voided at the default 32, preserved at 100
            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 222})).toBe(false);
            // 110px below: beyond even the widened tolerance
            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 242})).toBe(true);

            zone.destroy()
        });

        test('fail-open guards: no snapshot or non-numeric coordinates never void a reorder', () => {
            const zone = makeZone(null);

            expect(zone.releaseVoidsReorder({clientX: 300, clientY: 400}), 'no rect = no decision').toBe(false);

            zone.dockSourceToolbarRect = H_RECT;
            expect(zone.releaseVoidsReorder({clientX: undefined, clientY: 400})).toBe(false);
            expect(zone.releaseVoidsReorder({})).toBe(false);

            zone.destroy()
        })
    })
});
