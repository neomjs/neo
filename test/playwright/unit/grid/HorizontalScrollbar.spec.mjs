/**
 * @file test/playwright/unit/grid/HorizontalScrollbar.spec.mjs
 * @summary Unit tests for the horizontal scrollbar's scrollport scoping in locked grids.
 *
 * In a locked-columns grid the scrollbar element historically spanned the FULL grid width while
 * its inner spacer modelled only the center content — so its max scrollLeft fell short of the
 * center toolbar's by exactly the locked-region widths, leaving the last center columns
 * unreachable by any scrolling. The fix scopes the scrollport to the center region: the locked
 * widths apply as flanking margins (`startWidth_` / `endWidth_`), fed per region from
 * `grid.Body#afterSetAvailableWidth` exactly like the existing `centerWidth` spacer feed.
 *
 * @see Neo.grid.HorizontalScrollbar
 * @see Neo.grid.Body
 * @see Neo.main.addon.GridHorizontalScrollSync
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
        name             : 'GridHorizontalScrollbarTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Body               from '../../../../src/grid/Body.mjs';
import HorizontalScrollbar from '../../../../src/grid/HorizontalScrollbar.mjs';

test.describe('Neo.grid.HorizontalScrollbar scrollport scoping', () => {
    test('locked-region widths apply as scrollport margins; defaults stay 0', () => {
        const scrollbar = Neo.create(HorizontalScrollbar, {});

        // Single-region default: both margins explicitly 0 — zero behavior change
        expect(scrollbar.style.marginLeft).toBe('0px');
        expect(scrollbar.style.marginRight).toBe('0px');

        scrollbar.startWidth = 370;
        scrollbar.endWidth   = 120;

        expect(scrollbar.style.marginLeft).toBe('370px');
        expect(scrollbar.style.marginRight).toBe('120px');

        // Runtime unlock path: a removed region releases its margin
        scrollbar.startWidth = 0;
        expect(scrollbar.style.marginLeft).toBe('0px');

        scrollbar.destroy();
    });

    test('centerWidth still drives the spacer width', () => {
        const scrollbar = Neo.create(HorizontalScrollbar, {centerWidth: 3036});

        expect(scrollbar.vdom.cn[0].style.width).toBe('3036px');

        scrollbar.destroy();
    });

    test('Body#afterSetAvailableWidth routes per region: center → spacer, locked → margins', () => {
        // Plain objects borrowing the prototype method under test (see BodyCellMapping.spec.mjs:
        // Object.create(Body.prototype) trips the #configs private-brand check, while a plain
        // `this` only needs the members the method reads).
        const scrollbar     = {centerWidth: -1, startWidth: -1, endWidth: -1};
        const gridContainer = {horizontalScrollbar: scrollbar};
        const makeBody      = () => ({gridContainer, vdom: {}, update() {}});

        const center = makeBody();
        const start  = makeBody();
        const end    = makeBody();

        gridContainer.body      = center;
        gridContainer.bodyStart = start;
        gridContainer.bodyEnd   = end;

        Body.prototype.afterSetAvailableWidth.call(center, 3036, 0);
        Body.prototype.afterSetAvailableWidth.call(start,  370,  0);
        Body.prototype.afterSetAvailableWidth.call(end,    120,  0);

        expect(scrollbar.centerWidth).toBe(3036);
        expect(scrollbar.startWidth).toBe(370);
        expect(scrollbar.endWidth).toBe(120);

        // No scrollbar present (e.g. teardown ordering): the feed must be a silent no-op
        const orphan = {gridContainer: {horizontalScrollbar: null}, vdom: {}, update() {}};
        expect(() => Body.prototype.afterSetAvailableWidth.call(orphan, 500, 0)).not.toThrow();
    });
});
