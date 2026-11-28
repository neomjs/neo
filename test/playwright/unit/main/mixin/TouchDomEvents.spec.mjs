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
import TouchDomEvents from '../../../../../src/main/mixin/TouchDomEvents.mjs';

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
        testPathInclusion: (event, classes) => event.composedPath?.().some(node =>
            classes.some(cls => node.classList?.contains(cls))
        )
    }
}

test.describe('Neo.main.mixin.TouchDomEvents', () => {
    test('lifting a second finger preserves the tracked contact and its next raw movement', () => {
        const host = createTouchHost();

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
        expect(host.lastTouch.identifier).toBe(13);

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

        expect(host.firstTouch.identifier).toBe(13);
        expect(host.lastTouch.identifier).toBe(13);
        expect(host.sent.at(-1)).toEqual({type: 'touchmove', deltaX: 12, deltaY: -8})
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
        expect(host.firstTouch.identifier).toBe(27);
        expect(host.lastTouch.identifier).toBe(27);
        expect(host.sent.at(-1).type).toBe('touchend');
        expect(host.sent.at(-1).deltaX).toBeUndefined();

        // Next move of contact 27 by (+6, +4) measures from (400, 320), never from (100, 100)
        host.onTouchMove({
            type   : 'touchmove',
            touches: [{identifier: 27, clientX: 406, clientY: 324}]
        });

        expect(host.sent.at(-1)).toMatchObject({type: 'touchmove', deltaX: 6, deltaY: 4});

        // Cancellation clears both anchors so the next sequence measures from its own start
        host.onTouchCancel({type: 'touchcancel', touches: []});
        expect(host.firstTouch).toBeNull();
        expect(host.lastTouch).toBeNull();
        expect(host.sent.at(-1)).toEqual({type: 'touchcancel'});

        host.onTouchStart({
            type   : 'touchstart',
            touches: [{identifier: 27, clientX: 100, clientY: 100}]
        });
        host.onTouchMove({
            type   : 'touchmove',
            touches: [{identifier: 27, clientX: 97, clientY: 105}]
        });
        expect(host.sent.at(-1)).toEqual({type: 'touchmove', deltaX: -3, deltaY: 5});

        host.onTouchEnd({type: 'touchend', touches: []});
        expect(host.firstTouch).toBeNull();
        expect(host.lastTouch).toBeNull()
    });

    test('a touch move through a Helix node forwards raw movement without canceling the browser default', () => {
        const host  = createTouchHost(),
              helix = {classList: {contains: cls => cls === 'neo-helix'}},
              event = new Event('touchmove', {cancelable: true});

        event.composedPath = () => [{}, helix];
        event.touches      = [{identifier: 13, clientX: 102, clientY: 115}];

        host.onTouchStart({
            type   : 'touchstart',
            touches: [{identifier: 13, clientX: 100, clientY: 100}]
        });
        host.onTouchMove(event);

        expect(host.sent.at(-1)).toEqual({type: 'touchmove', deltaX: 2, deltaY: 15});
        expect(event.defaultPrevented).toBe(false)
    });
});
