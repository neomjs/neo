import {expect, test} from '../../fixtures.mjs';

let moduleSequence = 0;

/**
 * @summary Runs a module in the page's App Worker; resolves once its top-level awaits have settled.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @returns {Promise<void>}
 */
async function runInAppWorker(page, source) {
    const
        path  = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// change-node-name-${++moduleSequence}`)}`,
        reply = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);

    expect(reply?.data ?? reply).toMatchObject({success: true})
}

/**
 * @summary When a single `updateNode` delta changes `nodeName` (`tag`) and carries keys ordered after
 * `nodeName` on `Neo.vdom.VNode` (`style`, `textContent`, `attributes`), `DeltaUpdates.updateNode`
 * must rebind `node` to the live replacement returned by `changeNodeName` so subsequent keys apply to
 * the live DOM element rather than the detached old element.
 */
test.describe('DeltaUpdates.updateNode rebinds node on changeNodeName (#19926)', () => {
    test('applies textContent and style ordered after nodeName onto the live replacement element', async ({page}) => {
        await page.goto('/examples/container/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible();

        await runInAppWorker(page, `
            const main = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.container.base').mainView;

            main.add({
                ntype: 'component',
                id   : 'change-node-name-target',
                style: {color: 'rgb(255, 0, 0)'},
                text : 'Initial text'
            }, true);
            main.updateDepth = -1;
            await main.promiseUpdate();
        `);

        await expect(page.locator('#change-node-name-target')).toHaveText('Initial text');

        await runInAppWorker(page, `
            const target = Neo.getComponent('change-node-name-target');

            target.vdom.tag   = 'span';
            target.vdom.style = {color: 'rgb(0, 128, 0)'};
            target.vdom.text  = 'Rebound text';
            await target.promiseUpdate();
        `);

        const liveState = await page.evaluate(() => {
            const el = document.getElementById('change-node-name-target');

            return {
                color      : el?.style.color ?? null,
                tagName    : el?.tagName ?? null,
                textContent: el?.textContent ?? null
            }
        });

        expect(liveState).toEqual({
            color      : 'rgb(0, 128, 0)',
            tagName    : 'SPAN',
            textContent: 'Rebound text'
        })
    })
});
