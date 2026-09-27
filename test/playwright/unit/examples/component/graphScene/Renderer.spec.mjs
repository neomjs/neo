/**
 * @file test/playwright/unit/examples/component/graphScene/Renderer.spec.mjs
 * @summary Pins the graph example's level-of-detail lap without a GL context: every frame gap counts as the
 * level's time, a stall shows as the level's longest gap, the levels run in order, and a pause restarts the
 * level it interrupts.
 */

import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'GraphSceneExampleRendererTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Renderer       from '../../../../../../examples/component/graphScene/canvas/Renderer.mjs';

/**
 * @summary A lap as `startLodLap` begins it.
 * @param {Number} seconds
 * @returns {Object}
 */
const newLap = seconds => ({done: false, frames: 0, last: null, level: 'full', levels: ['full', 'far', 'mid', 'near'], maxGap: 0, restarts: 0, results: {}, seconds, time: 0});

/**
 * @summary Steps a lap through frames `step` ms apart, from `from` up to and including `to`.
 * @param {Object} lap
 * @param {Number} from
 * @param {Number} to
 * @param {Number} [step=16]
 */
const frames = (lap, from, to, step = 16) => {
    for (let now = from; now <= to; now += step) {
        Renderer.constructor.stepLap(lap, now)
    }
};

test.describe('examples/component/graphScene/canvas/Renderer: the LOD lap', () => {
    test('a stall counts as the level\'s time and shows as its longest gap', () => {
        const lap = newLap(0.5);

        frames(lap, 0, 160);                        // 10 gaps of 16 ms
        Renderer.constructor.stepLap(lap, 460);     // a 300 ms stall on a visible surface
        frames(lap, 476, 508);                      // 3 more gaps: 508 ms counted in all

        expect(lap.results.full, 'the stall lowers the rate instead of leaving it').toEqual({fps: 27.6, frames: 14, maxGapMs: 300, ms: 508});
        expect(lap.level).toBe('far')
    });

    test('the lap runs every level in order and then ends', () => {
        const lap = newLap(0.1);

        frames(lap, 0, 1000);

        expect(Object.keys(lap.results)).toEqual(['full', 'far', 'mid', 'near']);
        expect(lap.done).toBe(true);
        expect(lap.results.near).toEqual({fps: 62.5, frames: 7, maxGapMs: 16, ms: 112})
    });

    test('a pause starts the interrupted level over and counts the restart', () => {
        const renderer = Renderer;

        renderer.lodLap = newLap(0.5);
        frames(renderer.lodLap, 0, 320);

        renderer.pause();

        expect(renderer.lodLap, 'the hidden time never reaches a result').toMatchObject({frames: 0, last: null, level: 'full', maxGap: 0, restarts: 1, time: 0});
        expect(renderer.lodLap.results).toEqual({});

        frames(renderer.lodLap, 5000, 5512);

        expect(renderer.lodLap.results.full).toEqual({fps: 62.5, frames: 32, maxGapMs: 16, ms: 512});
        expect(renderer.getStats().lodLap.restarts).toBe(1);

        renderer.lodLap = null
    })
});
