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

/**
 * @summary A docked devtools panel is not a window border, and the border assumptions cannot
 * describe it.
 *
 * `outerWidth - innerWidth` says how much width the viewport lost; it cannot say to WHICH edge. A
 * panel docked left and one docked right produce byte-identical input, so no split, clamp or
 * heuristic can separate them — the side is absent from the numbers. A measured viewport offset
 * carries it, and is the only thing that does.
 *
 * The truth column below is computed independently of the model: the viewport starts below the
 * browser's own 87 px of top chrome, plus the panel only when the panel sits on that edge.
 * Reported by @tobiu against a live window, docked right: `screenX - clientX` read 64 where the
 * split said 303.5, on a 479 px panel — an error of exactly 479 / 2.
 */
test.describe('Neo.manager.Window#calculateGeometry — a measured viewport origin', () => {
    let WindowManager;

    const FRAME = {height: 1000, width: 1600, x: 100, y: 50},
          // The browser's own chrome with no panel on that edge: 87 px of tab strip + omnibox.
          MEASURED = {x: 0, y: 87},

          read = (innerWidth, innerHeight, extra = {}) => WindowManager.calculateGeometry({
              innerHeight, innerWidth,
              outerHeight: FRAME.height, outerWidth: FRAME.width,
              screenLeft : FRAME.x,      screenTop : FRAME.y,
              ...extra
          });

    test.beforeAll(async () => {
        WindowManager = (await import('../../../../src/manager/Window.mjs')).default
    });

    test('every dock position resolves to its own true viewport origin', () => {
        // Each row carries the offset a real probe WOULD read on that layout — the left and top rows
        // differ from the right and bottom ones by exactly the panel, which is the whole point: the
        // sizes are identical between right/left and between bottom/top, so only the measurement
        // separates them. Right and bottom are the positions in normal use.
        const cases = [
            ['no panel',      1600, 913, {x: 0,   y: 87},  {bottom: 0,   left: 0,   right: 0,   top: 87}],
            ['docked right',  1121, 913, {x: 0,   y: 87},  {bottom: 0,   left: 0,   right: 479, top: 87}],
            ['docked bottom', 1600, 513, {x: 0,   y: 87},  {bottom: 400, left: 0,   right: 0,   top: 87}],
            ['docked left',   1121, 913, {x: 479, y: 87},  {bottom: 0,   left: 479, right: 0,   top: 87}],
            ['docked top',    1600, 513, {x: 0,   y: 487}, {bottom: 0,   left: 0,   right: 0,   top: 487}]
        ];

        for (const [label, innerWidth, innerHeight, viewportOffset, expectedChrome] of cases) {
            const {chrome, innerRect, outerRect} = read(innerWidth, innerHeight, {viewportOffset});

            expect([innerRect.x, innerRect.y], `${label}: the viewport origin is measured, not inferred`)
                .toEqual([FRAME.x + viewportOffset.x, FRAME.y + viewportOffset.y]);
            expect([innerRect.width, innerRect.height], `${label}: the size was always right`)
                .toEqual([innerWidth, innerHeight]);
            expect([outerRect.x, outerRect.y], `${label}: the frame never moved`).toEqual([FRAME.x, FRAME.y]);
            expect(chrome, `${label}: chrome names WHICH edge lost the space`).toEqual(expectedChrome)
        }
    });

    test('left and right are indistinguishable without a measurement, and separable with one', () => {
        // The claim the whole design rests on. Identical inputs, so the fallback cannot tell them
        // apart by construction; the measured branch puts 479 px of viewport between them.
        const sizes = [1121, 913];

        expect(read(...sizes).innerRect.x, 'the fallback answers one number for both docks').toBe(339.5);

        expect(read(...sizes, {viewportOffset: {x: 0,   y: 87}}).innerRect.x).toBe(FRAME.x);
        expect(read(...sizes, {viewportOffset: {x: 479, y: 87}}).innerRect.x).toBe(FRAME.x + 479)
    });

    test('without a measurement the panel splits itself across both sides, and the top chrome goes negative', () => {
        // The documented fallback, pinned so the difference the measurement makes stays visible.
        // A 479 px panel on the right becomes 239.5 px of phantom border on each side, and the
        // remaining height difference is 239.5 px short of the real title bar.
        const {chrome, innerRect} = read(1121, 913);

        expect(chrome).toEqual({bottom: 239.5, left: 239.5, right: 239.5, top: -152.5});
        expect([innerRect.x, innerRect.y]).toEqual([339.5, -102.5]);

        // 239.5 px of drop-zone error on both axes, which is what a pointer over the panel maps into.
        const measured = read(1121, 913, {viewportOffset: MEASURED});

        expect(innerRect.x - measured.innerRect.x).toBe(239.5);
        expect(innerRect.y - measured.innerRect.y).toBe(-239.5)
    });

    test('Firefox keeps priority: an explicit viewport origin outranks a measured one', () => {
        const {innerRect} = read(900, 613, {
            mozInnerScreenX: 700, mozInnerScreenY: 707, viewportOffset: {x: 0, y: 87}
        });

        expect([innerRect.x, innerRect.y]).toEqual([700, 707])
    });

    test('an offset that cannot describe this frame is refused, and the fallback answers', () => {
        // Under browser page zoom `clientX` is page CSS pixels while `screenX` is screen CSS pixels,
        // so the reading can drift. Bounding it inside the frame degrades a bad sample to today's
        // behaviour instead of trusting it past the edges of the window it claims to describe.
        const fallback = read(1121, 913).innerRect;

        for (const [label, offset] of [
            ['negative x',        {x: -10, y: 87}],
            ['negative y',        {x: 0,   y: -1}],
            ['wider than the frame allows', {x: 480, y: 87}],
            ['taller than the frame allows', {x: 0, y: 88}],
            ['non-finite',        {x: NaN, y: 87}],
            ['absent',            null]
        ]) {
            const {innerRect} = read(1121, 913, {viewportOffset: offset});

            expect([innerRect.x, innerRect.y], `${label}: refused, so the assumptions answer`)
                .toEqual([fallback.x, fallback.y])
        }

        // The exact bounds ARE admissible — a viewport flush against either edge is a real window.
        expect(read(1121, 913, {viewportOffset: {x: 479, y: 0}}).innerRect.x).toBe(FRAME.x + 479)
    })
});
