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
/**
 * @summary A worker stub carrying only the port bookkeeping these arms read.
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
        promises             : {},
        settledDepartureCount: 0
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

test.describe('Neo.worker.Base#isWindowDeparted', () => {
    let worker = null;

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

    test('a worker that cannot answer must not silence a defect — absence reads as "not departed"', () => {
        // Consumers call this optionally, because `Neo.currentWorker` is a stub in some harnesses and carried no
        // such method before this ticket. The direction of that fallback is the contract: an environment that
        // cannot answer has to REPORT, never suppress. I shipped this the wrong way round first — the guard threw,
        // its catch swallowed the throw, and the arm proving a live-owner defect still surfaces went silent.
        const absent = {};

        expect(Boolean(absent.isWindowDeparted?.('win-a'))).toBe(false);
        expect(Boolean(undefined?.isWindowDeparted?.('win-a'))).toBe(false)
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

/**
 * A teardown call nobody awaits — an addon `unregister` after its window closed — rejects with nobody to tell. These
 * arms fix what reaches the page: only the departure of the window the call targeted is settled; an unreachable
 * window that never existed, and every other failure, are still mirrored.
 */
test.describe('Neo.worker.Base#onUnhandledRejection', () => {
    let forwarded = null,
        worker    = null;

    /**
     * @summary A rejection event as the browser dispatches it: cancelable, carrying its reason.
     * @param {*} reason
     * @returns {Object}
     */
    function rejectionEvent(reason) {
        return {defaultPrevented: false, reason, preventDefault() {this.defaultPrevented = true}}
    }

    /**
     * @summary The rejection `promiseMessage()` produces for a destination with no live port, caught as a caller would.
     * @param {String} destination
     * @param {String|null} windowId
     * @returns {Promise<Error>}
     */
    async function deadPortReason(destination, windowId) {
        worker.sendMessage = () => undefined;

        try {
            await worker.promiseMessage(destination, {
                action         : 'remoteMethod',
                remoteClassName: 'Neo.main.addon.ScrollSync',
                remoteMethod   : 'unregister',
                windowId
            })
        } catch (reason) {
            return reason
        }

        return null
    }

    test.beforeEach(() => {
        forwarded = [];
        worker    = create();

        worker.forwardErrorToMainThread = message => forwarded.push(message)
    });

    test('a dead-port rejection still reaches a caller that catches it, naming its destination and window', async () => {
        worker.removePort(addPort(worker, 'win-a'));

        expect(await deadPortReason('win-a', 'win-a')).toMatchObject({code: 'NEO_DEAD_PORT', destination: 'win-a', windowId: 'win-a'})
    });

    test('an unhandled call into a window that departed is settled, not mirrored', async () => {
        worker.removePort(addPort(worker, 'win-a'));

        const event = rejectionEvent(await deadPortReason('win-a', 'win-a'));

        worker.onUnhandledRejection(event);

        expect(forwarded).toEqual([]);
        expect(event.defaultPrevented).toBe(true);
        // Settled, not lost: a component that keeps calling into a gone window stays measurable.
        expect(worker.settledDepartureCount).toBe(1)
    });

    test('without a windowId, the destination identifies the departed window', async () => {
        worker.removePort(addPort(worker, 'win-a'));

        const event = rejectionEvent(await deadPortReason('win-a', null));

        worker.onUnhandledRejection(event);

        expect(forwarded).toEqual([])
    });

    test('the same rejection for a window that never existed is mirrored — unreachable is not departed', async () => {
        const event = rejectionEvent(await deadPortReason('win-ghost', 'win-ghost'));

        worker.onUnhandledRejection(event);

        expect(forwarded).toHaveLength(1);
        expect(event.defaultPrevented).toBe(false);
        expect(worker.settledDepartureCount).toBe(0)
    });

    test('any other rejection is mirrored, even while its window is departed', () => {
        worker.removePort(addPort(worker, 'win-a'));

        worker.onUnhandledRejection(rejectionEvent(Object.assign(new Error('a live defect'), {windowId: 'win-a'})));

        expect(forwarded).toHaveLength(1)
    });

    test('a rejection another listener already handled is not mirrored', () => {
        const event = rejectionEvent(new Error('handled elsewhere'));

        event.defaultPrevented = true;
        worker.onUnhandledRejection(event);

        expect(forwarded).toEqual([])
    });
});

/**
 * The one predicate every settlement asks: the central unhandled boundary and each catch that also names its
 * subsystem. Both halves or nothing — the code alone is "unreachable", which a window that never existed also is.
 */
test.describe('Neo.worker.Base#isDeparture', () => {
    const deadPort = fields => Object.assign(new Error('no live port'), {code: 'NEO_DEAD_PORT', ...fields});

    let worker = null;

    test.beforeEach(() => {
        worker = create();
        worker.removePort(addPort(worker, 'win-a'))
    });

    test('a dead port to a departed window is a departure', () => {
        expect(worker.isDeparture(deadPort({windowId: 'win-a'}))).toBe(true)
    });

    test('a dead port to a window that never departed is not', () => {
        expect(worker.isDeparture(deadPort({windowId: 'win-ghost'}))).toBe(false)
    });

    test('any other rejection is not, even while its window is departed', () => {
        expect(worker.isDeparture(Object.assign(new Error('live defect'), {windowId: 'win-a'}))).toBe(false)
    });

    test('the window defaults to the one the rejection names, then its destination; an explicit one wins', () => {
        expect(worker.isDeparture(deadPort({destination: 'win-a'}))).toBe(true);
        expect(worker.isDeparture(deadPort({windowId: 'win-ghost'}), 'win-a')).toBe(true);
        expect(worker.isDeparture(deadPort({}))).toBe(false)
    });
});
