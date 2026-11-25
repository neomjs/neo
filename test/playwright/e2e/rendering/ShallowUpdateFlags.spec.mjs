import {expect, test} from '../../fixtures.mjs';

let moduleSequence = 0;

/**
 * @summary Runs a module in the page's App Worker; resolves once its top-level awaits have settled.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @returns {Promise<void>}
 */
async function runInAppWorker(page, source) {
    const path  = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// shallow-update-flags-${++moduleSequence}`)}`,
          reply = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);

    expect(reply?.data ?? reply).toMatchObject({success: true})
}

/**
 * @summary Ancestor updates must preserve or settle descendant merge callbacks according to whether the ancestor's
 * payload actually renders the staged intermediate container:
 * - Depth 1 or a sparse update that prunes the intermediate leaves its `needsVdomUpdate` flag standing for its own flight.
 * - A covering ancestor flight (e.g. `depth: -1`) that expands the intermediate and merged host collects and settles
 *   the host's `promiseUpdate()` callback when its batch lands.
 */
test.describe('Ancestor updates preserve unrendered descendant flags and settle carried merge callbacks', () => {
    test('after a depth-1 update of the root, a host change merged into a staged container renders and settles once the container wakes', async ({page}) => {
        await page.goto('/examples/container/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible();

        await runInAppWorker(page, `
            const main = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.container.base').mainView,
                  root = main.add({
                      module: Neo.container.Base,
                      id    : 'owed-root',
                      items : [{
                          module: Neo.container.Base,
                          id    : 'owed-intermediate',
                          items : [{module: Neo.component.Base, id: 'owed-host', text: 'before'}]
                      }]
                  }, true);

            main.updateDepth = -1;
            await main.promiseUpdate();
            // A fresh container keeps the deep depth of its first render until its own flight resets it
            await root.promiseUpdate();

            const intermediate = Neo.getComponent('owed-intermediate'),
                  host         = Neo.getComponent('owed-host');

            intermediate.setSilent({cls: ['owed-staged']});
            intermediate.updateDepth = -1;

            host.text = 'after';
            const hostUpdate = host.promiseUpdate();

            // The root renders itself only: its payload carries neither the intermediate nor the host
            root.updateDepth = 1;
            await root.promiseUpdate();

            intermediate.needsVdomUpdate && intermediate.update();

            await Promise.race([
                hostUpdate,
                new Promise((resolve, reject) => setTimeout(() => reject(new Error('the host update merged into the intermediate never settled')), 3000))
            ]);
        `);

        await expect(page.locator('#owed-host')).toHaveText('after')
    });

    test('a deep update of the root that renders a staged container collects and settles the host callback merged into it', async ({page}) => {
        await page.goto('/examples/container/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible();

        await runInAppWorker(page, `
            const main = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.container.base').mainView,
                  root = main.add({
                      module: Neo.container.Base,
                      id    : 'carried-root',
                      items : [{
                          module: Neo.container.Base,
                          id    : 'carried-intermediate',
                          items : [{module: Neo.component.Base, id: 'carried-host', text: 'before'}]
                      }]
                  }, true);

            main.updateDepth = -1;
            await main.promiseUpdate();
            await root.promiseUpdate();

            const intermediate = Neo.getComponent('carried-intermediate'),
                  host         = Neo.getComponent('carried-host');

            intermediate.setSilent({cls: ['carried-staged']});
            intermediate.updateDepth = -1;

            host.text = 'after';
            const hostUpdate = host.promiseUpdate();

            // A full-depth ancestor flight renders both intermediate and host and clears intermediate.needsVdomUpdate,
            // so it must claim and settle the host callback parked on intermediate's merge entry.
            root.updateDepth = -1;
            await root.promiseUpdate();

            await Promise.race([
                hostUpdate,
                new Promise((resolve, reject) => setTimeout(() => reject(new Error('carried host promiseUpdate never settled')), 2000))
            ]);
        `);

        await expect(page.locator('#carried-host')).toHaveText('after')
    });

    test('a sparse depth-2 update of the root leaves a pruned staged container dirty so its merged host settles when woken', async ({page}) => {
        await page.goto('/examples/container/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible();

        await runInAppWorker(page, `
            const main = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.container.base').mainView,
                  root = main.add({
                      module: Neo.container.Base,
                      id    : 'sparse-root',
                      items : [{
                          module: Neo.container.Base,
                          id    : 'sparse-intermediate',
                          items : [{module: Neo.component.Base, id: 'sparse-host', text: 'before'}]
                      }, {
                          module: Neo.component.Base,
                          id    : 'sparse-sibling',
                          text  : 'sibling-before'
                      }]
                  }, true);

            main.updateDepth = -1;
            await main.promiseUpdate();
            await root.promiseUpdate();

            const intermediate = Neo.getComponent('sparse-intermediate'),
                  host         = Neo.getComponent('sparse-host'),
                  sibling      = Neo.getComponent('sparse-sibling');

            intermediate.setSilent({cls: ['sparse-staged']});
            intermediate.updateDepth = -1;

            host.text = 'after';
            const hostUpdate = host.promiseUpdate();

            // Merge only the sibling into root so root's depth-2 payload prunes sparse-intermediate as a reference
            root.setSilent({cls: ['sparse-root-staged']});
            root.updateDepth = 2;
            sibling.text = 'sibling-after';
            await root.promiseUpdate();

            intermediate.needsVdomUpdate && intermediate.update();

            await Promise.race([
                hostUpdate,
                new Promise((resolve, reject) => setTimeout(() => reject(new Error('pruned staged container lost its owed host flight')), 2000))
            ]);
        `);

        await expect(page.locator('#sparse-host')).toHaveText('after');
        await expect(page.locator('#sparse-sibling')).toHaveText('sibling-after')
    })
});
