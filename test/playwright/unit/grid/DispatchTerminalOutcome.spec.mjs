/**
 * @file test/playwright/unit/grid/DispatchTerminalOutcome.spec.mjs
 * @summary The post-load scroll dispatch owns its terminal outcome in both body classes.
 *
 * `onStoreLoad()` nudges the view back to the top through a detached dispatch: a 50ms timeout,
 * then `Neo.main.DomAccess.scrollTo`. Nothing awaits the result, so every way that dispatch can
 * fail has to be disposed of at the call site or it surfaces as `Uncaught (in promise)` — once
 * per store mutation, which on a ticking feed is once per tick.
 *
 * Two failures are expected rather than exceptional, and each is silent:
 * - the body is destroyed inside the 50ms window (`core.Base#destroy` rejects pending timeouts
 *   with the `Neo.isDestroyed` sentinel), so the dispatch never fires;
 * - the destination window has closed (`worker.Base` rejects with `code: 'NEO_DEAD_PORT'`).
 *
 * Everything else is a live failure and MUST still reach the console — a blanket catch would fix
 * the noise and destroy the signal, which is the whole reason the dead-port reason is typed.
 *
 * These arms drive the promise chain directly rather than through a rendered grid: a real
 * `GridContainer` needs browsers and would carry `NEO_TEST_SKIP_CI`, which would keep the arms
 * out of the CI job where the storm was observed. `createViewData` is stubbed because it is not
 * the subject; `onStoreLoad` itself is the real method under test.
 *
 * @see Neo.grid.Body
 * @see Neo.table.Body
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode : true,
        useVdomWorker: false
    },
    appConfig: {
        name             : 'GridDispatchTerminalTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridBody       from '../../../../src/grid/Body.mjs';
import TableBody      from '../../../../src/table/Body.mjs';

const DEAD_PORT = () => Object.assign(new Error('no live port for destination "main" — a window closed?'),
    {code: 'NEO_DEAD_PORT'});

test.describe('post-load scroll dispatch — terminal outcome is owned, never dropped', () => {
    let body, restoreDomAccess;

    /**
     * Drives one store load with `scrollTo` rejecting for the supplied reason, and records every
     * channel the outcome could escape through.
     * @param {Object}   options
     * @param {Object}   options.body       a grid or table body, already mounted
     * @param {*}        [options.reason]   what the dispatch rejects with
     * @param {Function} [options.midFlight] runs inside the 50ms window, before the dispatch
     * @returns {Promise<Object>} {unhandled, consoleErrors, dispatchCount}
     */
    const driveLoad = async ({body, reason, midFlight}) => {
        const unhandled     = [],
              consoleErrors = [],
              onUnhandled   = value => unhandled.push(value),
              originalError = console.error;

        let dispatchCount = 0;

        Neo.main.DomAccess = {
            scrollTo() {
                dispatchCount++;
                return Promise.reject(reason)
            }
        };

        process.on('unhandledRejection', onUnhandled);
        console.error = (...args) => consoleErrors.push(args);

        try {
            // Non-empty on purpose: table.Body fast-paths an empty load straight back out
            // (the removeAll() clearing path), which would skip the dispatch and leave the
            // twin's arm asserting nothing. The dispatchCount assertion is what caught it.
            body.onStoreLoad({items: [{id: 1}]});
            midFlight?.();

            // Past the 50ms dispatch window, then far enough for Node to have decided a rejection
            // is unhandled — that verdict lands a macrotask after the microtask queue drains.
            await new Promise(resolve => setTimeout(resolve, 300))
        } finally {
            process.off('unhandledRejection', onUnhandled);
            console.error = originalError
        }

        return {unhandled, consoleErrors, dispatchCount}
    };

    const makeBody = Cls => {
        const instance = Neo.create(Cls, {
            appName : 'GridDispatchTerminalTest',
            // table.Body always instantiates a selection.table.RowModel (its beforeSet coerces
            // even a null into one), and that model binds a rowClick listener to the body's
            // parent during construction. `parent` is a derived getter that prefers
            // `parentComponent`, so this is the seam a minimal Observable can occupy.
            parentComponent: {on() {}},
            windowId       : 1
        });

        instance.createViewData = () => {};
        instance.gridContainer  = {view: {id: 'probe-view'}};
        instance.mounted        = true;

        return instance
    };

    test.beforeEach(() => {
        restoreDomAccess = Neo.main?.DomAccess
    });

    test.afterEach(() => {
        body?.isDestroyed === false && body.destroy();
        body = null;

        if (restoreDomAccess === undefined) {
            delete Neo.main.DomAccess
        } else {
            Neo.main.DomAccess = restoreDomAccess
        }
    });

    test('a closed destination window settles silently — grid', async () => {
        body = makeBody(GridBody);

        const {unhandled, consoleErrors, dispatchCount} = await driveLoad({body, reason: DEAD_PORT()});

        expect(dispatchCount, 'the dispatch fired — without it nothing could have rejected and this arm is vacuous').toBe(1);
        expect(unhandled,     'a closed window is an expected outcome, not an uncaught rejection').toEqual([]);
        expect(consoleErrors, 'and it is not worth reporting either').toEqual([])
    });

    test('a closed destination window settles silently — table twin', async () => {
        body = makeBody(TableBody);

        const {unhandled, consoleErrors, dispatchCount} = await driveLoad({body, reason: DEAD_PORT()});

        expect(dispatchCount, 'the dispatch fired').toBe(1);
        expect(unhandled,     'the twin owns its terminal outcome too').toEqual([]);
        expect(consoleErrors, 'silently, for the same reason').toEqual([])
    });

    test('a LIVE failure still reaches the console — the signal survives the fix', async () => {
        body = makeBody(GridBody);

        const reason                                    = new Error('DomAccess exploded');
        const {unhandled, consoleErrors, dispatchCount} = await driveLoad({body, reason});

        expect(dispatchCount, 'the dispatch fired').toBe(1);
        expect(unhandled,     'a live failure is handled rather than left uncaught').toEqual([]);
        expect(consoleErrors, 'but it is REPORTED — a blanket catch would make this indistinguishable from teardown').toHaveLength(1);
        expect(consoleErrors[0][0]).toContain('scroll-to-top dispatch failed');
        expect(consoleErrors[0][1].reason, 'and the reason survives to the reader').toBe(reason)
    });

    test('a body destroyed inside the dispatch window settles silently', async () => {
        body = makeBody(GridBody);

        const {unhandled, consoleErrors, dispatchCount} = await driveLoad({
            body,
            reason   : DEAD_PORT(),
            midFlight: () => body.destroy()
        });

        expect(dispatchCount, 'destroy rejects the pending timeout, so the dispatch never fires — that is the subject here').toBe(0);
        expect(unhandled,     'the Neo.isDestroyed sentinel is an expected outcome').toEqual([]);
        expect(consoleErrors, 'teardown is not an error to report').toEqual([])
    })
});
