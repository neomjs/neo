/**
 * @file test/playwright/unit/grid/HeaderToolbarScrollGate.spec.mjs
 * @summary Unit tests for the grid header toolbar's command/echo scroll gate.
 *
 * During a drag's overdrag walk, the toolbar's `scrollLeft` config is command-driven:
 * `scrollToIndex()` registers each commanded value and writes the backing field directly;
 * pipeline echoes (from `grid.ScrollManager`'s mirror) may only CONFIRM the latest command.
 * Out-of-order echoes — including a LATE echo from an OLDER command arriving after the latest
 * echo already cleared the pending state — must be rejected, or the regressed term re-arms the
 * overdrag loop (the runaway switch storm). Outside an active drag the gate is off and
 * self-clears, so user scrolling is never filtered.
 *
 * @see Neo.grid.header.Toolbar
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridHeaderToolbarScrollGateTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Toolbar        from '../../../../src/grid/header/Toolbar.mjs';

/**
 * The gate reads only `pendingScrollTarget` and `sortZone.itemRects`; a plain fake zone keeps
 * the probe at method level (the reviewer's original falsification shape).
 */
function makeToolbar(dragActive) {
    const toolbar = Neo.create(Toolbar, {});
    toolbar.sortZone = {itemRects: dragActive ? [{left: 0, width: 100}] : null, scrollLeft: 0};
    return toolbar;
}

test.describe('Neo.grid.header.Toolbar scroll command/echo gate', () => {
    test('latest command echo passes and clears the pending state', () => {
        const tb = makeToolbar(true);

        tb.pendingScrollTarget = 200;
        expect(tb.beforeSetScrollLeft(200, 0)).toBe(200);
        expect(tb.pendingScrollTarget).toBeNull();

        tb.destroy();
    });

    test('REGRESSION (review probe): a late OLDER echo after the latest echo cleared pending is rejected mid-drag', () => {
        const tb = makeToolbar(true);

        tb.pendingScrollTarget = 200;
        expect(tb.beforeSetScrollLeft(200, 0)).toBe(200);   // latest echo confirms + clears
        expect(tb.beforeSetScrollLeft(100, 200)).toBe(200); // stale older echo: REJECTED (returns oldValue)

        tb.destroy();
    });

    test('mid-drag, non-matching writes are rejected while a command is pending', () => {
        const tb = makeToolbar(true);

        tb.pendingScrollTarget = 500;
        expect(tb.beforeSetScrollLeft(364, 500)).toBe(500); // out-of-order echo from an earlier command
        expect(tb.pendingScrollTarget).toBe(500);           // the command stays armed for ITS echo

        tb.destroy();
    });

    test('sub-pixel echo quantization still confirms the command', () => {
        const tb = makeToolbar(true);

        tb.pendingScrollTarget = 364.5;
        expect(tb.beforeSetScrollLeft(364, 0)).toBe(364);   // |364 - 364.5| < 1 → ours
        expect(tb.pendingScrollTarget).toBeNull();

        tb.destroy();
    });

    test('outside an active drag the gate is off: any value passes and pending self-clears', () => {
        const tb = makeToolbar(false);

        tb.pendingScrollTarget = 999; // leftover from a drag that ended
        expect(tb.beforeSetScrollLeft(100, 0)).toBe(100);   // user scrolling never filtered
        expect(tb.pendingScrollTarget).toBeNull();          // self-healed

        tb.destroy();
    });
});
