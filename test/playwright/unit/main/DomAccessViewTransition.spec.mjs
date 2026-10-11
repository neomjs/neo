import {setup} from '../../setup.mjs';

const appName = 'DomAccessViewTransitionTest';

// Imports are hoisted, so `Neo` and `Neo.main` already exist here — importing DomUtils below is
// exactly what registers `Neo.main`, and is why this file was the first spec to hit the harness's
// whole-namespace guard. Occupying ONE addon leaf reproduces the deeper half of that bug: a
// container-level `??=` would find `Neo.main.addon` non-null and suppress every sibling default.
globalThis.Neo             ??= {};
globalThis.Neo.main        ??= {};
globalThis.Neo.main.addon  ??= {};
globalThis.Neo.main.addon.ImportedSibling = {marker: 'installed before setup()'};

setup({
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    },
    neoConfig: {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DomUtils       from '../../../../src/main/DomUtils.mjs';

/**
 * The reference length a `circle()` percentage radius resolves against, per CSS Shapes:
 * `sqrt(width² + height²) / sqrt(2)`.
 * @param {Number} width
 * @param {Number} height
 * @returns {Number}
 */
function radiusReference(width, height) {
    return Math.hypot(width, height) / Math.SQRT2
}

/**
 * Extracts the numbers from `circle(<r>% at <x>% <y>%)`.
 * @param {String} clipPath
 * @returns {{r: Number, x: Number, y: Number}}
 */
function parseCircle(clipPath) {
    const match = clipPath.match(/^circle\(([\d.]+)% at ([\d.]+)% ([\d.]+)%\)$/);

    expect(match, `not a percentage circle: ${clipPath}`).not.toBe(null);

    return {r: Number(match[1]), x: Number(match[2]), y: Number(match[3])}
}

test.describe('Neo.main.DomUtils - view transition reveal', () => {

    test('converts viewport coordinates into box-relative percentages', () => {
        const {keyframes} = DomUtils.createRevealAnimation({x: 250, y: 100}, 1000, 400),
              from        = parseCircle(keyframes[0].clipPath),
              to          = parseCircle(keyframes[1].clipPath);

        // The origin is what this arm pins; the end radius is derived and has its own arm below.
        expect(from).toMatchObject({r: 0, x: 25, y: 25});
        expect(to)  .toMatchObject({x: 25, y: 25});
        expect(to.r).toBeGreaterThan(0)
    });

    test('never emits a pixel length — the unit the pseudo-element resolved differently', () => {
        const {keyframes} = DomUtils.createRevealAnimation({x: 928, y: 29}, 1062, 997);

        // The defect this guards: a browser resolved `px` inside the view transition pseudo-element
        // in device pixels while the box stayed in CSS pixels, so every length was divided by the
        // devicePixelRatio and the reveal started at half its coordinates. Percentages resolve
        // against the box itself, so asserting the ABSENCE of px is the regression contract — a
        // correct-looking pixel value would pass a coordinate check and still render halved.
        keyframes.forEach(frame => {
            expect(frame.clipPath).not.toMatch(/px/);
            expect(frame.clipPath).toMatch(/%/)
        })
    });

    test('the end radius lands exactly on the farthest corner, from any origin', () => {
        // This is what replaced a hardcoded 3000. Two properties have to hold together, and each
        // alone is satisfiable by a wrong answer: a radius that always COVERS is satisfied by any
        // large constant (the old 3000, which finished ~46% off-screen), and a radius that never
        // OVERSHOOTS is satisfied by zero. Asserting equality pins both at once.
        const width  = 1062,
              height = 997;

        // A corner origin (worst case, farthest corner is the full diagonal) and a centre origin
        // (best case, half the diagonal) — a fixed percentage cannot be exact for both.
        [{x: 0, y: 0}, {x: width / 2, y: height / 2}, {x: 928, y: 29}].forEach(origin => {
            const {keyframes} = DomUtils.createRevealAnimation(origin, width, height),
                  endRadius   = parseCircle(keyframes[1].clipPath).r / 100 * radiusReference(width, height),
                  farthest    = Math.max(
                      Math.hypot(origin.x,         origin.y),
                      Math.hypot(width - origin.x, origin.y),
                      Math.hypot(origin.x,         height - origin.y),
                      Math.hypot(width - origin.x, height - origin.y)
                  );

            expect(endRadius).toBeCloseTo(farthest, 6)
        })
    });

    test('a zero coordinate is an origin, not a missing one', () => {
        // `if (data.clientX)` read a click on the viewport's left edge as "no coordinates" and fell
        // through to the cross-fade, so the reveal silently changed shape at x === 0.
        const animation = DomUtils.createRevealAnimation({x: 0, y: 240}, 1000, 800);

        expect(animation).not.toBe(null);
        expect(parseCircle(animation.keyframes[0].clipPath)).toEqual({r: 0, x: 0, y: 30})
    });

    test('a missing origin yields no animation, leaving the UA cross-fade', () => {
        expect(DomUtils.createRevealAnimation(undefined,            1000, 800)).toBe(null);
        expect(DomUtils.createRevealAnimation({},                   1000, 800)).toBe(null);
        expect(DomUtils.createRevealAnimation({x: 10},              1000, 800)).toBe(null);
        expect(DomUtils.createRevealAnimation({x: null, y: null},   1000, 800)).toBe(null)
    });

    test('a zero-sized viewport yields no animation rather than an Infinity percentage', () => {
        // A hidden or unrendered document reports 0 for every dimension. Dividing by it produces
        // `Infinity%`, which is not a parse error — it is an accepted keyframe that renders nothing,
        // so the failure would be indistinguishable from a working cross-fade.
        expect(DomUtils.createRevealAnimation({x: 10, y: 10}, 0,    800)).toBe(null);
        expect(DomUtils.createRevealAnimation({x: 10, y: 10}, 1000, 0  )).toBe(null)
    });

    test('duration and easing stay overridable, with the reveal defaults applied otherwise', () => {
        expect(DomUtils.createRevealAnimation({x: 1, y: 1}, 100, 100).options).toEqual({
            duration     : 500,
            easing       : 'ease-in',
            fill         : 'both',
            pseudoElement: '::view-transition-new(root)'
        });

        expect(DomUtils.createRevealAnimation({duration: 800, easing: 'linear', x: 1, y: 1}, 100, 100).options)
            .toMatchObject({duration: 800, easing: 'linear'})
    });

    test('both snapshot layers stay opaque and normally blended for the complete transition', () => {
        const animation = DomUtils.createRevealAnimation({x: 20, y: 30, duration: 0}, 100, 100);

        expect(animation.oldLayer).toBeDefined();
        expect(animation.oldLayer.options).toMatchObject({
            duration     : 0,
            fill         : 'both',
            pseudoElement: '::view-transition-old(root)'
        });

        for (const layer of [animation, animation.oldLayer]) {
            expect(layer.keyframes).toHaveLength(2);
            layer.keyframes.forEach(frame => expect(frame).toMatchObject({opacity: 1, mixBlendMode: 'normal'}))
        }
    });

    test('an explicit zero duration survives — it is the reduced-motion answer, not a missing value', () => {
        // `duration || 500` rewrote 0 to 500. The same defect as reading `x: 0` as "no coordinate",
        // one object over, and it needs its own arm because the 800 control above passes either way.
        expect(DomUtils.createRevealAnimation({duration: 0, x: 1, y: 1}, 100, 100).options.duration).toBe(0);
        expect(DomUtils.createRevealAnimation({duration: 800, x: 1, y: 1}, 100, 100).options.duration).toBe(800)
    });
});

test.describe('test harness - Neo.main namespace defaults', () => {

    test('a pre-occupied addon leaf fills the gaps rather than vetoing every sibling', () => {
        // This file installed `Neo.main.addon.ImportedSibling` before setup() ran, standing in for
        // any import that registers one addon. Guarding the container instead of the leaves would
        // make setup() skip the rest — the harness bug this spec's own import first exposed, moved
        // one level deeper where it is harder to see.
        expect(Neo.main.addon.ImportedSibling.marker).toBe('installed before setup()');

        expect(Neo.main.addon.DragDrop).toBeDefined();
        expect(typeof Neo.main.addon.Navigator.subscribe).toBe('function');
        expect(typeof Neo.main.addon.ResizeObserver.register).toBe('function');
        expect(typeof Neo.main.addon.Stylesheet.insertCssRules).toBe('function');
        expect(typeof Neo.main.DomAccess.getBoundingClientRect).toBe('function')
    });
});
