/**
 * @file test/playwright/unit/grid/ViewLoadingReprojection.spec.mjs
 * @summary Clearing `isLoading` re-projects every body, because a store load that arrived while
 * loading was dropped rather than deferred.
 *
 * `Neo.grid.Body#createViewData` opens with a guard block that returns when the body cannot measure
 * — and a loading view cannot. The guard sits BEFORE the `isVdomUpdating` branch that would
 * re-register the work, so a `load` event arriving inside the loading window is not postponed, it is
 * discarded, and nothing schedules another. The rows then keep projecting the pre-load state after
 * the mask clears, with the store already correct — only the paint is missing.
 *
 * The consumer shape that hits it is the documented one: wrap a bulk store mutation in `isLoading`
 * so the grid shows a spinner while it commits. `examples/grid/treeBigData` does exactly that around
 * `expandAll()`, and three of its five e2e arms were red for it. The same symptom had been fixed and
 * closed once before on the identical assertion, which is why this arm lives in the tier CI runs.
 *
 * The re-projection is deferred one tick deliberately: the mask removal published by this very call
 * is still in flight, so a synchronous re-projection meets the guard while the body still measures as
 * masked and is dropped exactly like the load it was meant to rescue.
 *
 * @see Neo.grid.View
 * @see Neo.grid.Body#createViewData
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridViewLoadingReprojectionTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridView       from '../../../../src/grid/View.mjs';

const appName = 'GridViewLoadingReprojectionTest';

/**
 * A stand-in for one body: the view only asks it to re-project, and recording the arguments is what
 * the contract is about — `force` must be true, or a projection whose record identity is unchanged
 * (every row of a bulk expand) would be skipped as a no-op.
 * @returns {Object}
 */
function createBodyStub() {
    return {
        calls: [],

        createViewData(silent, force) {
            this.calls.push({force, silent})
        }
    }
}

test.describe('Neo.grid.View — clearing isLoading re-projects', () => {
    let view;

    const attachBodies = (...bodies) => {
        // assigned past the reactive setter: the container would instantiate real components, and the
        // contract under test is only which of its items get asked to re-project
        view._items = bodies;
        return bodies
    };

    test.beforeEach(() => {
        view = Neo.create(GridView, {appName})
    });

    test.afterEach(() => {
        view?.isDestroyed === false && view.destroy();
        view = null
    });

    test('a load dropped during loading is recovered when the flag clears', async () => {
        const [body] = attachBodies(createBodyStub());

        view.isLoading = 'Loading';

        expect(body.calls, 'entering the loading state re-projects nothing').toEqual([]);

        view.isLoading = false;

        // NOT synchronous: the mask removal this assignment published is still in flight, and a
        // re-projection landing inside it meets the same guard that dropped the original load
        expect(body.calls, 'deferred past the mask removal').toEqual([]);

        await view.timeout(10);

        expect(body.calls, 'exactly one re-projection').toHaveLength(1);
        // force:true — a bulk expand changes no record identity, so an unforced pass would skip it
        expect(body.calls[0]).toEqual({force: true, silent: false})
    });

    test('every body is asked, not only the centre one', async () => {
        const bodies = attachBodies(createBodyStub(), createBodyStub(), createBodyStub());

        view.isLoading = 'Loading';
        view.isLoading = false;

        await view.timeout(10);

        // bodyStart / body / bodyEnd project the same store through the same guard, so a
        // locked-column grid would otherwise clear its mask over two stale flanks
        expect(bodies.map(body => body.calls.length)).toEqual([1, 1, 1])
    });

    test('entering the loading state never re-projects', async () => {
        const [body] = attachBodies(createBodyStub());

        view.isLoading = 'Loading';

        await view.timeout(10);

        expect(body.calls).toEqual([])
    });

    test('a view destroyed inside the deferral does not project into its own teardown', async () => {
        const [body] = attachBodies(createBodyStub());

        view.isLoading = 'Loading';
        view.isLoading = false;
        view.destroy();

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(body.calls, 'the deferred pass saw the teardown').toEqual([]);

        view = null
    });

    /**
     * Silence is two different outcomes here and the arm above cannot tell them apart: a deferral
     * that declined to project, and a deferral whose promise rejected with nobody listening. Both
     * leave `body.calls` empty. `core.Base#destroy` rejects pending timeouts with `Neo.isDestroyed`,
     * so the second is what an unguarded chain actually produces — one `ERR_UNHANDLED_REJECTION`
     * per teardown inside the window.
     *
     * Same shape as the landed `DispatchTerminalOutcome.spec.mjs`: record both escape channels, and
     * require that the expected sentinel is consumed WITHOUT muting a real failure.
     */
    test('the destroyed deferral consumes its cancellation instead of leaking a rejection', async () => {
        const unhandled     = [],
              consoleErrors = [],
              onUnhandled   = value => unhandled.push(value),
              originalError = console.error;

        attachBodies(createBodyStub());

        process.on('unhandledRejection', onUnhandled);
        console.error = (...args) => consoleErrors.push(args);

        try {
            view.isLoading = 'Loading';
            view.isLoading = false;
            view.destroy();

            // Past the deferral, then far enough for Node to have decided a rejection is unhandled —
            // that verdict lands a macrotask after the microtask queue drains.
            await new Promise(resolve => setTimeout(resolve, 300))
        } finally {
            process.off('unhandledRejection', onUnhandled);
            console.error = originalError
        }

        expect(unhandled,     'the Neo.isDestroyed sentinel is an expected outcome').toEqual([]);
        expect(consoleErrors, 'an expected cancellation is not a reportable failure').toEqual([]);

        view = null
    })
});
