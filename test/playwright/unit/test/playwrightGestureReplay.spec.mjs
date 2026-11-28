import {expect, test}        from '@playwright/test';
import {driveBrowserGesture} from '../../playwrightGestureReplay.mjs';

test('a liveness check crossing the deadline cancels the contact and releases the page', async () => {
    const originalNow = performance.now,
          sent        = [],
          events      = [],
          eventTypes  = {touchStart: 'touchstart', touchEnd: 'touchend', touchCancel: 'touchcancel'},
          point       = {clientX: 1, clientY: 1, identifier: 1, inside: true};

    let now = 0, checks = 0;

    const state = {
              events,
              left : 0,
              top  : 0,
              start: 0,

              isLive() {
                  // The second transport liveness response arrives after the first trace's deadline.
                  if (++checks === 2) now = 101;
                  return true
              },

              dispose() {
                  events.length = 0
              }
          },
          cdp = {
              async send(_method, {type}) {
                  sent.push(type);
                  events.push({
                      active : type === 'touchStart' ? [point] : [],
                      changed: [point],
                      time   : now,
                      type   : eventTypes[type]
                  })
              },
              async detach() {}
          },
          page = {
              context       : () => ({newCDPSession: async () => cdp}),
              evaluate      : async () => true,
              evaluateHandle: async () => ({evaluate: async fn => fn(state), dispose: async () => {}}),
              isClosed      : () => false
          },
          options = {pages: () => [page], workerId: 'worker'},
          request = {
              provider : 'browser',
              target   : 'body',
              timeoutMs: 100,
              windowId : '1',
              frames   : [
                  {t: 0, contacts: [{id: 'A', x: 1, y: 1, state: 'down'}]},
                  {t: 0, contacts: [{id: 'A', x: 1, y: 1, state: 'up'}]}
              ]
          };

    performance.now = () => now;

    try {
        await expect(driveBrowserGesture(request, options)).resolves.toMatchObject({
            cleanup: {attempted: true, succeeded: true},
            error  : {code: 'GESTURE_TIMEOUT'},
            status : 'interrupted',
            success: false
        });
        expect(sent).toEqual(['touchStart', 'touchCancel']);

        now = 0;
        await expect(driveBrowserGesture(request, options)).resolves.toMatchObject({status: 'complete', success: true});
        expect(sent).toEqual(['touchStart', 'touchCancel', 'touchStart', 'touchEnd'])
    } finally {
        performance.now = originalNow
    }
});
