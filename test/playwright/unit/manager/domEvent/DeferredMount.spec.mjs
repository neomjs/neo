import {setup} from '../../../setup.mjs';

const appName = 'DomEventDeferredMountTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';

/**
 * Every path to `mountDomListeners()` arrives after a delay — `updateDomListeners()` defers 50ms,
 * `mixin.DomEvents#initDomEvents` 150ms — and a window can close inside that gap.
 *
 * `component.mounted` cannot report it: the App Worker's component model outlives its window's port,
 * so a component in a closed window still reads `mounted === true`, and the schedule-time check that
 * `updateDomListeners()` performs cannot speak for the moment the work resumes.
 *
 * Measured on the popup-over-popup whitebox battery: of 304 `addResizeObserver` calls, 9 fired for a
 * window that had already departed BEFORE the call began, and 0 lost an in-flight race. Deferred work
 * resuming into a dead window, not a race.
 *
 * These arms observe `addResizeObserver` rather than `mountDomListeners`, because that is the boundary
 * that actually issued the dead-port call — and because the guard now lives inside `mountDomListeners`,
 * stubbing it would replace the code under test.
 */
test.describe('Neo.manager.DomEvent deferred mount vs. window departure', () => {
    let observed, originalResizeObserver, originalWorker;

    /**
     * @summary A worker stub carrying only the departure predicate this guard reads.
     * @param {String[]} departed windowIds to report as gone
     * @returns {Object}
     */
    function workerStub(departed=[]) {
        return {isWindowDeparted: windowId => departed.includes(windowId)}
    }

    /**
     * @summary The minimum component shape `updateDomListeners()` reads — it dereferences `vdom.id`
     * for the delegate, so a stub without a vdom throws before reaching the code under test.
     * @param {String} id
     * @param {String} windowId
     * @returns {Object}
     */
    function stubComponent(id, windowId) {
        return {domListeners: [{resize: () => {}}], id, mounted: true, vdom: {id}, windowId}
    }

    /**
     * @summary Schedules a deferred mount the way `updateDomListeners()` does, then resolves once the
     * 50ms timer has run — waiting on the manager's own registry rather than on a fixed sleep.
     * @param {Object} component
     * @returns {Promise<void>}
     */
    function scheduleAndSettle(component) {
        DomEvent.updateDomListeners(component, component.domListeners, []);

        return new Promise(resolve => {
            const poll = () => DomEvent.mountTimeouts[component.id] ? setTimeout(poll, 10) : resolve();

            setTimeout(poll, 10)
        })
    }

    test.beforeEach(() => {
        observed               = [];
        originalWorker         = Neo.currentWorker;
        originalResizeObserver = DomEvent.addResizeObserver;

        // The remote call this defect produced. Recording it instead of issuing it keeps the arm a
        // unit, and it is the exact site the 9 dead-port errors came from.
        DomEvent.addResizeObserver = component => observed.push(component.id)
    });

    test.afterEach(() => {
        DomEvent.addResizeObserver = originalResizeObserver;
        Neo.currentWorker          = originalWorker
    });

    test('a window that departed before the timer fires issues no main-thread call', async () => {
        Neo.currentWorker = workerStub(['win-gone']);

        await scheduleAndSettle(stubComponent('cmp-departed', 'win-gone'));

        expect(observed).toEqual([])
    });

    test('CONTROL: the same setup against a LIVE window does register — so the arm above can fail', async () => {
        Neo.currentWorker = workerStub([]);

        await scheduleAndSettle(stubComponent('cmp-live', 'win-live'));

        expect(observed).toEqual(['cmp-live'])
    });

    test('a worker that cannot answer still registers — absence degrades toward the existing behaviour', async () => {
        // The optional call is the contract, and its DIRECTION is deliberate. Here a missing predicate
        // must mean "mount, as before", never "skip silently": skipping would drop real listeners in
        // any harness whose worker stub predates this guard. That is the opposite direction from a
        // RELEASE guard, where absence must not skip the release.
        Neo.currentWorker = {};

        await scheduleAndSettle(stubComponent('cmp-no-predicate', 'win-unknown'));

        expect(observed).toEqual(['cmp-no-predicate'])
    });

    test('the second scheduler is covered by the same guard, because it funnels through the same method', () => {
        // `mixin.DomEvents#initDomEvents` waits 150ms and then calls `mountDomListeners` directly —
        // with no liveness check of its own, not even at schedule time. Calling the funnel directly is
        // what that path does, so this arm is that path.
        Neo.currentWorker = workerStub(['win-gone']);

        DomEvent.mountDomListeners(stubComponent('cmp-direct', 'win-gone'));

        expect(observed).toEqual([])
    });

    test('the timer registry does not retain an entry for a skipped mount', async () => {
        Neo.currentWorker = workerStub(['win-gone']);

        await scheduleAndSettle(stubComponent('cmp-registry', 'win-gone'));

        // The skip must not leak the registry slot, or a later re-schedule for the same id would
        // clearTimeout a handle that has already run.
        expect(Object.hasOwn(DomEvent.mountTimeouts, 'cmp-registry')).toBe(false)
    });
});
