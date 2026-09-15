import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkerWindowDepartureTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

/**
 * `isWindowDeparted()` exists because `mounted` answers a different question than the one a teardown guard asks.
 * A component stays mounted in the App Worker's model after the window hosting it has closed, so `owner.mounted`
 * cannot separate a live owner from one whose window is gone — and that is the distinction `NEO_DEAD_PORT`
 * consumers need.
 *
 * The ordering is the whole point and is asserted directly: `removePort()` records the departure BEFORE
 * `onDisconnect()` fires its event, so anything a consumer learns from that event is already too late. An arm that
 * only checked "does the Set contain the id" would pass against a predicate updated from the event and would not
 * see the staleness this fixes.
 */
test.describe('Neo.worker.Base#isWindowDeparted', () => {
    let worker = null;

    /**
     * @summary A worker stub carrying only the port bookkeeping this predicate reads.
     * @returns {Object}
     */
    function create() {
        const instance = Object.create(WorkerBase.prototype);

        Object.assign(instance, {
            departedWindowIds: new Set(),
            isSharedWorker   : true,
            ports            : [],
            // removePort() also settles in-flight promises against the retired port; an empty map is the
            // honest "nothing in flight" state rather than a stub that skips that half of the method.
            promises         : {}
        });

        return instance
    }

    /**
     * @summary Registers a fake port generation for one window, carrying the identity `isCurrentPort()` checks.
     * @param {Object} instance
     * @param {String} windowId
     * @param {String} [appName='App']
     * @returns {Object} the port entry
     */
    function addPort(instance, windowId, appName='App') {
        const entry = {appNames: new Set([appName]), id: windowId, port: {onmessage: null, close() {}}, windowId};

        instance.ports.push(entry);

        return entry
    }

    test.beforeEach(() => {
        worker = create()
    });

    test('a live window is not departed', () => {
        addPort(worker, 'win-a');

        expect(worker.isWindowDeparted('win-a')).toBe(false)
    });

    test('retiring the port marks the window departed', () => {
        const entry = addPort(worker, 'win-a');

        worker.removePort(entry);

        expect(worker.isWindowDeparted('win-a')).toBe(true)
    });

    test('the departure is recorded BEFORE the disconnect event fires', () => {
        const entry = addPort(worker, 'win-a');

        let seenAtEventTime = null;

        worker.fire = function(name, data) {
            if (name === 'disconnect') {
                seenAtEventTime = this.isWindowDeparted(data.windowId)
            }
        };

        worker.onDisconnect({appName: 'App', windowId: 'win-a'}, entry);

        // A predicate fed by this event could only ever answer AFTER the port died. This one already answers.
        expect(seenAtEventTime).toBe(true)
    });

    test('an unrelated window is unaffected', () => {
        const entry = addPort(worker, 'win-a');

        addPort(worker, 'win-b');
        worker.removePort(entry);

        expect(worker.isWindowDeparted('win-b')).toBe(false)
    });

    test('a falsy windowId is never departed, so a missing id cannot read as teardown', () => {
        expect(worker.isWindowDeparted(undefined)).toBe(false);
        expect(worker.isWindowDeparted(null)).toBe(false);
        expect(worker.isWindowDeparted('')).toBe(false)
    });

    test('the record is bounded to the 16 most recent departures', () => {
        for (let i = 0; i < 17; i++) {
            worker.removePort(addPort(worker, `win-${i}`))
        }

        // It answers "did this call just lose its window", not "has this window ever departed".
        expect(worker.isWindowDeparted('win-0')).toBe(false);
        expect(worker.isWindowDeparted('win-1')).toBe(true);
        expect(worker.isWindowDeparted('win-16')).toBe(true)
    });

    test('a re-connected window that departs again stays the newest entry', () => {
        worker.removePort(addPort(worker, 'win-a'));

        for (let i = 0; i < 16; i++) {
            worker.removePort(addPort(worker, `filler-${i}`))
        }

        // win-a fell out of the window above; departing again must re-enter it rather than dedupe to its old slot.
        expect(worker.isWindowDeparted('win-a')).toBe(false);

        worker.removePort(addPort(worker, 'win-a'));

        expect(worker.isWindowDeparted('win-a')).toBe(true)
    });
});
