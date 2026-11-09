import {test, expect} from '../../fixtures.mjs';

const NODE    = 'right-top-tabs',
      asArray = value => Array.isArray(value) ? value : value ? [value] : [];

/**
 * @summary A tab dragged far below its strip leaves its sibling resting, and still docks where it is released.
 *
 * The strip's reorder used to follow the pointer's x alone: Metrics dragged 300 px below its two-tab strip slid
 * Audit across the strip every time the pointer crossed Audit's midline, while the dock hover painted elsewhere and
 * the release voided that reorder anyway. Audit's header is sampled on every animation frame while the
 * pointer is beyond the release band; the gesture ends as a dock drop into the scale zone. It runs under a 4× CPU
 * throttle, the operator's manual test on a loaded machine.
 *
 * The press focuses the pane, whose focus-gated actions do not fit this strip beside both tabs. A press held as long
 * as a person holds one before dragging used to let them reveal and withhold Audit, and the drag then froze it out of
 * the strip for the whole sweep.
 * @param {Object} fixtures
 * @param {Number} pressMs How long the press rests before the pointer moves
 */
async function dragFarBelow({page, neuralLink}, pressMs) {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
    await page.evaluate(() => document.fonts.ready);

    // Layout readiness: a drag against a pane still measuring 0×0 would aim at the wrong zone
    await page.waitForFunction(() => {
        const zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')].find(el => el.querySelector('.neo-grid-container'));
        return zone && zone.getBoundingClientRect().height > 100
    }, {timeout: 60000});

    const app         = await neuralLink.connectToApp('Workstation'),
          workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
          model       = async () => (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
          chrome      = await app.callMethod(workspaceId, 'getTabChromeIdentity', [NODE]),
          tab         = await page.locator(`#${chrome.buttons.metrics}`).boundingBox(),
          sibling     = await page.locator(`#${chrome.buttons.audit}`).boundingBox(),
          strip       = await page.locator(`#${chrome.headerId}`).boundingBox(),
          scale       = await page.evaluate(() => {
              const zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')].find(el => el.querySelector('.neo-grid-container')),
                    rect = zone.getBoundingClientRect();
              return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}
          }),
          cdp         = await page.context().newCDPSession(page);

    expect((await model()).nodes[NODE].items, `${NODE} holds Metrics and its one sibling`).toEqual(['metrics', 'audit']);
    expect(sibling.x, 'Audit rests right of Metrics').toBeGreaterThan(tab.x + tab.width / 2);

    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});

    try {
        const grab  = {x: tab.x + tab.width / 2, y: tab.y + tab.height / 2},
              below = strip.y + strip.height + 300; // far beyond the 32 px release band

        await page.mouse.move(grab.x, grab.y);
        await page.mouse.down();
        pressMs > 0 && await page.waitForTimeout(pressMs);
        await page.mouse.move(grab.x, grab.y + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await page.mouse.move(grab.x, below, {steps: 12});

        // Every frame from here to the release: the pointer stays below the band. The header is resolved per
        // frame, so a frame without it records null rather than throwing.
        await page.evaluate(id => {
            globalThis.siblingFrames   = [];
            globalThis.siblingSampling = true;

            (function sample() {
                if (!globalThis.siblingSampling) return;
                const header = document.getElementById(id);
                globalThis.siblingFrames.push(header ? Math.round(header.getBoundingClientRect().x) : null);
                requestAnimationFrame(sample)
            })()
        }, chrome.buttons.audit);

        await page.mouse.move(sibling.x + sibling.width * 0.8, below, {steps: 15}); // across Audit's midline
        await page.mouse.move(grab.x, below, {steps: 15});                         // and back
        await page.mouse.move(sibling.x + sibling.width * 0.8, below, {steps: 15});
        await page.mouse.move(scale.x, scale.y, {steps: 20});
        await expect(page.locator('.neo-dock-preview-affordance').first(), 'the hover previews the scale zone').toBeVisible({timeout: 10000});

        const frames = await page.evaluate(() => {
            globalThis.siblingSampling = false;
            return globalThis.siblingFrames
        });

        expect(frames.length, 'the sweep was sampled').toBeGreaterThan(10);
        expect(frames.filter(x => x === null).length, 'Audit is in the strip on every frame of the sweep').toBe(0);
        expect([...new Set(frames)], 'Audit holds one x on every frame beyond the band').toEqual([frames[0]]);

        await page.mouse.up();

        await expect.poll(async () => {
            const {nodes} = await model();

            return {
                scale : Object.values(nodes).find(node => node.type === 'tabs' && node.items?.includes('scale'))?.items.includes('metrics'),
                source: nodes[NODE]?.items
            }
        }, {message: 'Metrics docks into the scale zone, Audit stays home', timeout: 15000}).toEqual({scale: true, source: ['audit']})
    } finally {
        await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1})
    }
}

test.describe('Workstation — a tab dragged far below its strip', () => {
    test.setTimeout(120000);

    // Playwright reads the fixtures a test needs from its destructured first argument
    test('leaves its sibling resting while the sweep crosses it, and docks where it is released', async ({page, neuralLink}) => {
        await dragFarBelow({page, neuralLink}, 0)
    });

    test('leaves its sibling in the strip when the press rests before the drag', async ({page, neuralLink}) => {
        await dragFarBelow({page, neuralLink}, 400)
    })
});
