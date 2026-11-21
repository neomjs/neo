import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLES = ['gantt/basic', 'scheduler/basic', 'timeline/basic'],
    THEMES   = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'];

/**
 * @summary The time-axis header's pixels, once two screenshots in a row agree.
 * @param {import('@playwright/test').Locator} header
 * @returns {Promise<Buffer>}
 */
async function settledPixels(header) {
    let shot = null;

    await expect.poll(async () => {
        const next = await header.screenshot(), same = shot?.equals(next) ?? false;

        shot = next;
        return same
    }).toBe(true);

    return shot
}

// The time axis is a scale, not a sortable column: a hover may not restyle it
for (const example of EXAMPLES) {
    test(`hovering the time-axis header of ${example} changes nothing, in every theme`, async ({page}) => {
        const changed = [];

        await page.setViewportSize({width: 1440, height: 900});

        for (const theme of THEMES) {
            await page.goto(`/examples/${example}/index.html?theme=${theme}`);

            const header = page.locator('.neo-timeline-header').first();

            await expect(header).toBeVisible();
            await expect(page.locator(`.${theme}`).first()).toBeAttached();
            await page.mouse.move(0, 0);

            const rest = await settledPixels(header);

            await header.hover();

            const
                hovered = await settledPixels(header),
                cursor  = await header.evaluate(node => getComputedStyle(node).cursor);

            if (!rest.equals(hovered) || cursor !== 'default') {
                changed.push(`${theme}: pixels ${rest.equals(hovered) ? 'kept' : 'changed'}, cursor ${cursor}`)
            }
        }

        expect(changed).toEqual([])
    })
}
