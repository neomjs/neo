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
 * @summary A depth-1 update of an ancestor renders the ancestor alone, so it leaves a descendant's owed update standing.
 * The descendant wakes on its own flag, as `Neo.layout.Base#set` wakes a container after its silent window, and an
 * update merged into it reaches the DOM and settles its promise.
 */
test.describe('A shallow ancestor update leaves an owed descendant update standing', () => {
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

            intermediate.silentVdomUpdate = true;
            intermediate.updateDepth      = -1;
            intermediate.update();

            host.text = 'after';
            const hostUpdate = host.promiseUpdate();

            // The root renders itself only: its payload carries neither the intermediate nor the host
            root.updateDepth = 1;
            await root.promiseUpdate();

            intermediate.silentVdomUpdate = false;
            intermediate.needsVdomUpdate && intermediate.update();

            await Promise.race([
                hostUpdate,
                new Promise((resolve, reject) => setTimeout(() => reject(new Error('the host update merged into the intermediate never settled')), 3000))
            ]);
        `);

        await expect(page.locator('#owed-host')).toHaveText('after')
    })
});
