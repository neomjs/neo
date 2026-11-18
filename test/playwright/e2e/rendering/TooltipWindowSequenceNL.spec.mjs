import {expect, test} from '../../fixtures.mjs';

const OWN_1 = '#tooltip-departure-own-1',
      OWN_2 = '#tooltip-departure-own-2';

/**
 * @summary Holds one tooltip's insert or removal at Main, before the renderer and its App reply, and counts the
 * tooltip nodes in the document after every DOM change. Unrelated messages keep flowing.
 * @param {import('@playwright/test').Page} page
 * @param {String} tooltipId
 * @param {String} action `insertNode` or `removeNode`
 * @returns {Promise<void>}
 */
async function holdAtMain(page, tooltipId, action) {
    await page.evaluate(({action, id}) => {
        const manager  = Neo.worker.Manager,
              original = manager.handleDomUpdate,
              witness  = window.tooltipSequenceWitness = {holding: true, mostNodes: 0, pending: []},
              count    = new MutationObserver(() => {
                  witness.mostNodes = Math.max(witness.mostNodes, document.querySelectorAll('.neo-tooltip').length)
              });

        manager.handleDomUpdate = function(...args) {
            const deltas = args[1] || [];

            if (witness.holding && deltas.some(delta => delta.action === action && (delta.id || delta.vnode?.id) === id)) {
                witness.pending.push({receiver: this, args});
                return
            }

            return original.apply(this, args)
        };

        count.observe(document.body, {childList: true, subtree: true});

        witness.release = () => {
            witness.holding = false;
            witness.pending.splice(0).forEach(({receiver, args}) => original.apply(receiver, args))
        };
        witness.restore = () => {
            witness.release();
            manager.handleDomUpdate = original;
            count.disconnect()
        }
    }, {action, id: tooltipId})
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{mostNodes: Number, pending: Number}>}
 */
function readWitness(page) {
    return page.evaluate(() => ({
        mostNodes: window.tooltipSequenceWitness.mostNodes,
        pending  : window.tooltipSequenceWitness.pending.length
    }))
}

test.describe('Neo.tooltip.Base: a window holds one tooltip node, also while Main holds a retired one', () => {
    let app;

    test.beforeEach(async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/test/playwright/component/apps/tooltip-departure/index.html');
        await page.waitForSelector(OWN_1, {state: 'visible'});

        app = await neuralLink.connectToApp('Test.Playwright.TooltipDeparture')
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(() => window.tooltipSequenceWitness?.restore())
    });

    /**
     * @param {String} componentId
     * @returns {Promise<String>} The id of the tooltip a button owns
     */
    async function ownTooltipOf(componentId) {
        const [tooltip] = await app.queryComponent({ntype: 'tooltip', componentId}, ['id']);

        expect(tooltip, `control: ${componentId} owns a tooltip`).toBeTruthy();
        return tooltip.id
    }

    test('a tooltip left while Main holds its insert keeps the next instance out of the DOM until it left', async ({page}) => {
        await holdAtMain(page, await ownTooltipOf('tooltip-departure-own-1'), 'insertNode');

        await page.locator(OWN_1).hover();
        await expect.poll(async () => (await readWitness(page)).pending, 'control: its insert waits at Main').toBe(1);

        await page.locator(OWN_2).hover();
        // Past the second tooltip's show delay
        await page.waitForTimeout(400);
        await page.evaluate(() => window.tooltipSequenceWitness.release());

        await expect(page.locator('.neo-tooltip')).toHaveText('Own tooltip two');
        expect((await readWitness(page)).mostNodes, 'one tooltip node at a time').toBe(1)
    });

    test('a tooltip left while Main holds its removal keeps the next instance out of the DOM until it left', async ({page}) => {
        await holdAtMain(page, await ownTooltipOf('tooltip-departure-own-1'), 'removeNode');

        await page.locator(OWN_1).hover();
        await expect(page.locator('.neo-tooltip')).toHaveText('Own tooltip one');

        // Departed for empty space first, so the first tooltip is retired before the next target is entered
        await page.mouse.move(5, 5);
        await expect.poll(async () => (await readWitness(page)).pending, 'control: its removal waits at Main').toBe(1);

        await page.locator(OWN_2).hover();
        await page.waitForTimeout(400);
        await page.evaluate(() => window.tooltipSequenceWitness.release());

        await expect(page.locator('.neo-tooltip')).toHaveText('Own tooltip two');
        expect((await readWitness(page)).mostNodes, 'one tooltip node at a time').toBe(1)
    })
});
