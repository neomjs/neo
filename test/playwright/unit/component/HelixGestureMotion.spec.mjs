import {setup} from '../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'HelixGestureMotionUnit'}
});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Helix          from '../../../../src/component/Helix.mjs';

test.describe('Helix gesture motion', () => {
    let helix, frame, frameRequests, applied;
    const originalFrame = Neo.Main.nextAnimationFrame;

    test.beforeEach(() => {
        frame         = Promise.withResolvers();
        frameRequests = 0;
        applied       = [];

        Neo.Main.nextAnimationFrame = () => {
            frameRequests++;
            return frame.promise
        };

        helix = Neo.create(Helix, {
            gestureBounds   : {rotationAngle: [-20, 20], translateZ: [-100, 100]},
            mouseWheelDeltaX: 2,
            perspective     : 800,
            rotationAngle   : 0,
            translateZ      : 0
        });
        helix._mounted = true;
        helix[Symbol.for('lockWheel')] = false;
        helix.refresh = async () => {
            applied.push([helix.rotationAngle, helix.translateZ])
        }
    });

    test.afterEach(() => {
        Neo.Main.nextAnimationFrame = originalFrame;
        helix._mounted = false;
        helix.destroy()
    });

    test('pan and pinch coalesce into one bounded refresh with terminal motion', async () => {
        helix.onGesturePan({gestureId: 1, phase: 'start', stepX: 2});
        helix.onGesturePan({gestureId: 1, phase: 'move', stepX: 2});
        helix.onGesturePinch({gestureId: 2, phase: 'start', scale: 1});
        helix.onGesturePinch({gestureId: 2, phase: 'move', scale: 1.1});
        helix.onGesturePan({gestureId: 1, phase: 'end', stepX: 4});
        helix.onGesturePinch({gestureId: 2, phase: 'end', scale: 1.2});

        expect(frameRequests).toBe(1);
        expect(applied).toEqual([]);

        frame.resolve(16);
        await frame.promise;
        expect(applied).toEqual([[20, 100]])
    });

    test('cancel drops unpainted motion without dropping a prior accepted release', async () => {
        helix.onGesturePan({gestureId: 1, phase: 'start', stepX: 1});
        helix.onGesturePan({gestureId: 1, phase: 'end', stepX: 2});
        helix.onGesturePan({gestureId: 2, phase: 'start', stepX: -5});
        helix.onGesturePan({gestureId: 2, phase: 'cancel', stepX: -5});
        helix.onGesturePan({gestureId: 2, phase: 'end', stepX: -5});
        helix.onGesturePinch({gestureId: 3, phase: 'start', scale: 1});
        helix.onGesturePinch({gestureId: 3, phase: 'move', scale: 0.9});
        helix.onGesturePinch({gestureId: 3, phase: 'cancel', scale: 0.9});

        expect(frameRequests).toBe(1);

        frame.resolve(16);
        await frame.promise;
        expect(applied).toEqual([[9, 0]])
    })
});
