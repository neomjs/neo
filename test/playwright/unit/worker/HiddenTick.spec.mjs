import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkerHiddenTickTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';
import HiddenTick     from '../../../../src/worker/HiddenTick.mjs';

/**
 * A hidden window's own timers can stall for a minute, so its cadence has to come from its worker. These arms pin the
 * lifecycle (one interval per hidden window, stopped by a visible report) and the delivery contract against the REAL
 * `Neo.worker.Base#sendMessage` and `removePort`: a tick reaches its own window, a window without a port stops ticking
 * instead of being answered through another window's port, and retiring one of a window's ports is not a departure.
 */
test.describe('Neo.worker.HiddenTick', () => {
    let posted, ticker;

    /**
     * @summary A SharedWorker stub with one live port per listed window id, carrying only what the port methods read.
     * @param {String[]} windowIds
     * @returns {Neo.worker.Base}
     */
    function createWorker(windowIds) {
        const instance = Object.create(WorkerBase.prototype);

        Object.assign(instance, {
            channelPorts     : {},
            departedWindowIds: new Set(),
            isSharedWorker   : true,
            promises         : {},
            ports            : windowIds.map((windowId, index) => ({
                id  : `port-${index}`,
                port: {postMessage: message => posted.push({port: `port-${index}`, message})},
                windowId
            }))
        });

        return instance
    }

    const ticks = () => posted.map(({port, message}) => ({port, destination: message.destination, windowId: message.windowId}));

    test.beforeEach(() => {
        posted = []
    });

    test.afterEach(() => {
        ticker?.timers.forEach((timer, windowId) => ticker.stop(windowId))
    });

    test('a hidden report starts one interval per window, and a repeated report does not stack a second', () => {
        ticker = new HiddenTick({worker: createWorker(['w1', 'w2'])});

        ticker.sync({hidden: true, windowId: 'w1'});

        const first = ticker.timers.get('w1');

        ticker.sync({hidden: true, windowId: 'w1'});
        ticker.sync({hidden: true, windowId: 'w2'});

        expect(ticker.timers.get('w1')).toBe(first);
        expect([...ticker.timers.keys()]).toEqual(['w1', 'w2'])
    });

    test('a visible report stops that window and leaves the others ticking', () => {
        ticker = new HiddenTick({worker: createWorker(['w1', 'w2'])});

        ticker.sync({hidden: true, windowId: 'w1'});
        ticker.sync({hidden: true, windowId: 'w2'});
        ticker.sync({hidden: false, windowId: 'w1'});

        expect([...ticker.timers.keys()]).toEqual(['w2'])
    });

    test('ticks keep arriving on the interval, through the window\'s own port', async () => {
        ticker = new HiddenTick({interval: 10, worker: createWorker(['w1', 'w2'])});

        ticker.sync({hidden: true, windowId: 'w2'});

        await expect.poll(() => posted.length).toBeGreaterThanOrEqual(2);

        expect(ticks().slice(0, 2)).toEqual([
            {port: 'port-1', destination: 'w2', windowId: 'w2'},
            {port: 'port-1', destination: 'w2', windowId: 'w2'}
        ])
    });

    test('a window whose port is gone stops ticking, and no other window receives its tick', () => {
        ticker = new HiddenTick({worker: createWorker(['w-other'])});

        ticker.sync({hidden: true, windowId: 'w-gone'});
        ticker.tick('w-gone');

        // Without the window id as a routing key, the real sendMessage falls back to ports[0]: `w-other`
        expect(posted).toEqual([]);
        expect(ticker.timers.has('w-gone')).toBe(false)
    });

    test('retiring one of a window\'s two ports is not a departure: the tick goes through the port left', () => {
        const worker = createWorker(['w1', 'w1']);

        ticker = new HiddenTick({worker});
        ticker.sync({hidden: true, windowId: 'w1'});

        // removePort records w1 as departed although w1 still holds a port, so a departure check would stop it here
        worker.removePort(worker.ports[0]);
        ticker.tick('w1');

        expect(worker.isWindowDeparted('w1')).toBe(true);
        expect(ticks()).toEqual([{port: 'port-1', destination: 'w1', windowId: 'w1'}]);
        expect(ticker.timers.has('w1')).toBe(true)
    });
});
