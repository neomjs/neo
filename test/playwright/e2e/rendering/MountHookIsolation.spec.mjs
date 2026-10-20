import {expect, test} from '../../fixtures.mjs';

let moduleSequence = 0;

/**
 * @summary Runs a module in the page's App Worker; resolves once its top-level awaits have settled.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @returns {Promise<void>}
 */
async function runInAppWorker(page, source) {
    const path  = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// mount-hook-${++moduleSequence}`)}`,
          reply = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);

    expect(reply?.data ?? reply).toMatchObject({success: true})
}

/**
 * @summary Reads one property of an App Worker instance.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @param {String} key
 * @returns {Promise<*>}
 */
function read(page, id, key) {
    return page.evaluate(({id, key}) => Neo.worker.App.getConfigs({id, keys: key}), {id, key})
}

/**
 * @summary A view whose first item throws in `afterSetMounted`, rendered into a live host through the real
 * App → VDom → Main → App round trip: the shape of a list that subscribes to an absent main-thread addon on mount.
 *
 * The render's deltas reach the DOM before the hook runs. A failed mount must neither fail that render nor leave
 * the view's other items without a vnode, or the view's next update inserts them a second time.
 */
test.describe('A mount hook that throws (#19916)', () => {
    test('resolves its render and mounts its siblings, so no later update inserts a node twice', async ({page, workerErrors}) => {
        const logged = /^App Worker: syncVnodeTree: a mount hook failed mount-hook-view /;

        workerErrors.expect(logged);

        await page.goto('/examples/container/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible();

        await runInAppWorker(page, `
            const main = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.container.base').mainView;

            main.add({ntype: 'container', id: 'mount-hook-host', items: [{ntype: 'component', id: 'mount-hook-existing', text: 'Existing'}]}, true);
            main.updateDepth = -1;
            await main.promiseUpdate();
        `);
        await expect(page.locator('#mount-hook-existing')).toHaveText('Existing');

        await runInAppWorker(page, `
            class Thrower extends Neo.component.Base {
                static config = {className: 'Test.E2E.MountHookIsolation.Thrower'}

                afterSetMounted(value, oldValue) {
                    if (value) throw new TypeError('mount hook failed');
                    super.afterSetMounted(value, oldValue)
                }
            }

            const host = Neo.getComponent('mount-hook-host');

            host.add({ntype: 'container', id: 'mount-hook-view', items: [
                {module: Neo.setupClass(Thrower), id: 'mount-hook-thrower', text: 'Thrower'},
                {ntype: 'component', id: 'mount-hook-b', text: 'B'},
                {ntype: 'component', id: 'mount-hook-c', text: 'C'}
            ]}, true);
            host.updateDepth = -1; // what a non-silent add() sends
            host.mountHookFlight = await host.promiseUpdate().then(() => 'resolved', error => 'rejected: ' + error.message);
        `);

        const flight  = await read(page, 'mount-hook-host', 'mountHookFlight'),
              mounted = [await read(page, 'mount-hook-b', 'mounted'), await read(page, 'mount-hook-c', 'mounted')];

        // The view, then the host, each with a change of its own
        await runInAppWorker(page, `
            for (const id of ['mount-hook-view', 'mount-hook-host']) {
                const component = Neo.getComponent(id);

                component.setSilent({style: {color: 'green'}});
                component.mountHookNext = await component.promiseUpdate().then(() => 'resolved', error => 'rejected: ' + error.message);
            }
        `);

        expect({
            flight,
            mounted,
            next      : [await read(page, 'mount-hook-view', 'mountHookNext'), await read(page, 'mount-hook-host', 'mountHookNext')],
            duplicates: await page.evaluate(() => {
                const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
                return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
            })
        }).toEqual({flight: 'resolved', mounted: [true, true], next: ['resolved', 'resolved'], duplicates: []});

        await expect.poll(() => workerErrors.lines.some(line => logged.test(line)), {
            message: 'the hook\'s error still reaches the console, naming the component whose mount failed'
        }).toBe(true)
    })
});
