import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerWindowGeometryTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary `Neo.manager.Window#calculateGeometry` reads `screenLeft` / `screenTop` as the window
 * FRAME's origin on every engine that does not publish a viewport origin of its own.
 *
 * Three measurements settled it: headed Chromium moved by CDP to `top: 120` reports `screenY 120`
 * with 87 px of chrome; a live Chrome window filling a 1728×1117 display under the menu bar reports
 * `screenTop 33` with the same 87 px; a second headed Chromium on another host repeats the first.
 * Reading those values as the viewport origin puts the frame ABOVE the screen (y = −54 in the second
 * case), which the OS does not allow. Firefox is the one engine with an explicit viewport origin
 * (`mozInnerScreenX/Y`) and keeps its own branch.
 */
test.describe('Neo.manager.Window#calculateGeometry — the frame origin', () => {
    let WindowManager;

    test.beforeAll(async () => {
        WindowManager = (await import('../../../../src/manager/Window.mjs')).default
    });

    test('Chromium moved to top 120 by CDP: the frame is at 120, the viewport at 207', () => {
        const {chrome, innerRect, outerRect} = WindowManager.calculateGeometry({
            innerHeight: 613,
            innerWidth : 900,
            outerHeight: 700,
            outerWidth : 900,
            screenLeft : 200,
            screenTop  : 120
        });

        expect(chrome).toEqual({bottom: 0, left: 0, right: 0, top: 87});
        expect([outerRect.x, outerRect.y, outerRect.width, outerRect.height]).toEqual([200, 120, 900, 700]);
        expect([innerRect.x, innerRect.y, innerRect.width, innerRect.height]).toEqual([200, 207, 900, 613])
    });

    test('a live Chrome filling the display under the menu bar: frame top 33, viewport top 120', () => {
        const {innerRect, outerRect} = WindowManager.calculateGeometry({
            innerHeight: 997,
            innerWidth : 1728,
            outerHeight: 1084,
            outerWidth : 1728,
            screenLeft : 0,
            screenTop  : 33
        });

        expect(outerRect.y).toBe(33);
        expect(innerRect.y).toBe(120);
        // the viewport reading would have put the frame above the screen
        expect(outerRect.y).not.toBe(-54)
    });

    test('side borders split symmetrically, so the viewport shifts on both axes', () => {
        const {chrome, innerRect, outerRect} = WindowManager.calculateGeometry({
            innerHeight: 500,
            innerWidth : 600,
            outerHeight: 540,
            outerWidth : 620,
            screenLeft : 100,
            screenTop  : 80
        });

        expect(chrome).toEqual({bottom: 10, left: 10, right: 10, top: 30});
        expect([outerRect.x, outerRect.y]).toEqual([100, 80]);
        expect([innerRect.x, innerRect.y]).toEqual([110, 110])
    });

    test('Firefox keeps its explicit viewport origin', () => {
        const {innerRect, outerRect} = WindowManager.calculateGeometry({
            innerHeight    : 613,
            innerWidth     : 900,
            mozInnerScreenX: 200,
            mozInnerScreenY: 207,
            outerHeight    : 700,
            outerWidth     : 900,
            screenLeft     : 200,
            screenTop      : 120
        });

        expect([innerRect.x, innerRect.y]).toEqual([200, 207]);
        expect([outerRect.x, outerRect.y]).toEqual([200, 120])
    });
});
