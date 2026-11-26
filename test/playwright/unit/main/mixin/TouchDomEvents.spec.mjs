import {setup} from '../../../setup.mjs';

const appName = 'TouchDomEventsUnitTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Helix          from '../../../../../src/component/Helix.mjs';
import TouchDomEvents from '../../../../../src/main/mixin/TouchDomEvents.mjs';

const lockWheel = Symbol.for('lockWheel');

/**
 * @summary Builds an isolated host carrying the real TouchDomEvents methods and captured App messages.
 * @returns {Object}
 */
function createTouchHost() {
    const sent = [];

    return {
        firstTouch       : null,
        lastTouch        : null,
        sent,
        findTouch        : TouchDomEvents.prototype.findTouch,
        getEventData     : event => ({type: event.type}),
        onTouchCancel    : TouchDomEvents.prototype.onTouchCancel,
        onTouchEnd       : TouchDomEvents.prototype.onTouchEnd,
        onTouchMove      : TouchDomEvents.prototype.onTouchMove,
        onTouchStart     : TouchDomEvents.prototype.onTouchStart,
        sendMessageToApp : data => sent.push(data),
        syncTrackedTouch : TouchDomEvents.prototype.syncTrackedTouch,
        testPathInclusion: () => false
    }
}

/**
 * @summary Builds a minimal Helix stub bound to real `onTouchMove` and `onMouseWheel`.
 * @returns {Object}
 */
function createHelixStub() {
    return {
        [lockWheel]      : false,
        mouseWheelDeltaX : 5,
        mouseWheelDeltaY : 50,
        mouseWheelEnabled: true,
        _rotationAngle   : 780,
        _translateZ      : -5000,
        get rotationAngle() {return this._rotationAngle},
        get translateZ()    {return this._translateZ},
        fire        : () => {},
        onMouseWheel: Helix.prototype.onMouseWheel,
        onTouchMove : Helix.prototype.onTouchMove,
        refresh     : () => {}
    }
}

test.describe('Neo.main.mixin.TouchDomEvents & Helix partial-lift touch safety', () => {
    test('lifting a second finger preserves the tracked contact delta on the next move and keeps Helix finite', () => {
        const host  = createTouchHost(),
              helix = createHelixStub();

        // Put down contact 13 at (200, 200)
        host.onTouchStart({
            type   : 'touchstart',
            touches: [{identifier: 13, clientX: 200, clientY: 200}]
        });

        // Add contact 27 at (420, 360), even if the browser places 27 first in `touches`
        host.onTouchStart({
            type   : 'touchstart',
            touches: [
                {identifier: 27, clientX: 420, clientY: 360},
                {identifier: 13, clientX: 200, clientY: 200}
            ]
        });

        // Lift only contact 27; contact 13 remains down at (200, 200)
        host.onTouchEnd({
            type   : 'touchend',
            touches: [{identifier: 13, clientX: 200, clientY: 200}]
        });

        // Move contact 13 by (+12, -8)
        host.onTouchMove({
            type   : 'touchmove',
            touches: [{identifier: 13, clientX: 212, clientY: 192}]
        });

        const movePayload = host.sent.at(-1);

        expect(movePayload.deltaX).toBe(12);
        expect(movePayload.deltaY).toBe(-8);

        helix.onTouchMove({...movePayload});

        expect(Number.isFinite(helix.rotationAngle)).toBe(true);
        expect(Number.isFinite(helix.translateZ)).toBe(true);
        expect(helix.rotationAngle).toBe(780 + 12 * 1.5 * 5);
        expect(helix.translateZ).toBe(-5000 + (-8) * 3 * 50)
    });

    test('lifting the tracked finger while another remains re-anchors by identifier without a jump delta', () => {
        const host = createTouchHost();

        host.onTouchStart({
            type   : 'touchstart',
            touches: [{identifier: 13, clientX: 100, clientY: 100}]
        });
        host.onTouchStart({
            type   : 'touchstart',
            touches: [
                {identifier: 13, clientX: 100, clientY: 100},
                {identifier: 27, clientX: 400, clientY: 320}
            ]
        });

        // Lift the tracked contact 13; contact 27 stays at (400, 320)
        host.onTouchEnd({
            type   : 'touchend',
            touches: [{identifier: 27, clientX: 400, clientY: 320}]
        });
        expect(host.sent.at(-1).type).toBe('touchend');
        expect(host.sent.at(-1).deltaX).toBeUndefined();

        // Next move of contact 27 by (+6, +4) measures from (400, 320), never from (100, 100)
        host.onTouchMove({
            type   : 'touchmove',
            touches: [{identifier: 27, clientX: 406, clientY: 324}]
        });

        expect(host.sent.at(-1)).toMatchObject({type: 'touchmove', deltaX: 6, deltaY: 4});

        // Final lift clears both anchors
        host.onTouchCancel({type: 'touchcancel', touches: []});
        expect(host.firstTouch).toBeNull();
        expect(host.lastTouch).toBeNull()
    });

    test('Helix#onTouchMove ignores events without finite deltas instead of poisoning rotationAngle/translateZ', () => {
        const helix = createHelixStub();

        helix.onTouchMove({type: 'touchmove'});
        helix.onTouchMove({type: 'touchmove', deltaX: NaN, deltaY: 4});
        helix.onTouchMove({type: 'touchmove', deltaX: 4, deltaY: undefined});

        expect(helix.rotationAngle).toBe(780);
        expect(helix.translateZ).toBe(-5000)
    });
});
