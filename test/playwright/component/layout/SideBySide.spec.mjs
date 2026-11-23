import {test, expect} from '@playwright/test';

/**
 * @summary The layouts page's controls change the frames they name: align and pack move the items of the hbox
 * and the vbox, flex makes the hbox items share their row, and Next item steps the card and turns the cube to the
 * same item.
 *
 * Driven on `examples/layout/sideBySide` with real clicks. Positions are read from the rendered boxes, and the cube
 * by a hit test at its centre, so a layout that writes the right class but draws elsewhere fails.
 *
 * Run: npx playwright test component/layout/SideBySide -c test/playwright/playwright.config.component.mjs
 */

test.use({viewport: {height: 900, width: 1440}});

test.beforeEach(async ({page}) => {
    await page.goto('examples/layout/sideBySide/index.html');
    await expect(page.locator('.examples-layouts-cube .neo-face'), 'the cube renders its six faces').toHaveCount(6, {timeout: 30000})
});

/**
 * @param {Object} page
 * @param {String} group 'align' or 'pack'
 * @param {String} value
 * @returns {Promise<void>}
 */
async function choose(page, group, value) {
    const button = page.locator('.examples-layouts-group', {hasText: group}).getByRole('button', {name: value, exact: true});

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true')
}

/**
 * The stage's content box and the bounding box around its six items.
 * @param {Object} page
 * @param {String} name The frame's layout, e.g. 'hbox'
 * @returns {Promise<Object>}
 */
function measure(page, name) {
    return page.locator(`.examples-layouts-frame-${name} .examples-layouts-stage`).evaluate(stage => {
        const style = getComputedStyle(stage),
              outer = stage.getBoundingClientRect(),
              boxes = [...stage.children].map(item => item.getBoundingClientRect());

        return {
            stage: {
                bottom: outer.bottom - parseFloat(style.paddingBottom),
                left  : outer.left   + parseFloat(style.paddingLeft),
                right : outer.right  - parseFloat(style.paddingRight),
                top   : outer.top    + parseFloat(style.paddingTop)
            },
            items: {
                bottom: Math.max(...boxes.map(box => box.bottom)),
                left  : Math.min(...boxes.map(box => box.left)),
                right : Math.max(...boxes.map(box => box.right)),
                top   : Math.min(...boxes.map(box => box.top)),
                widths: boxes.map(box => box.width)
            }
        }
    })
}

test('align and pack move the items of the hbox and the vbox', async ({page}) => {
    await choose(page, 'align', 'start');
    await choose(page, 'pack', 'end');

    await expect.poll(async () => {
        const {items, stage} = await measure(page, 'hbox');
        // a row: align start puts it at the top, pack end at the right
        return Math.abs(items.top - stage.top) < 1 && Math.abs(items.right - stage.right) < 1
    }, {message: 'the hbox items sit top right'}).toBe(true);

    await expect.poll(async () => {
        const {items, stage} = await measure(page, 'vbox');
        // a column: align start puts it at the left, pack end at the bottom
        return Math.abs(items.left - stage.left) < 1 && Math.abs(items.bottom - stage.bottom) < 1
    }, {message: 'the vbox items sit bottom left'}).toBe(true)
});

test('flex: 1 makes the hbox items share their row', async ({page}) => {
    let {items, stage} = await measure(page, 'hbox');

    // at rest the items keep their own width, centred, with room on both sides
    expect(items.left - stage.left, 'room on the left').toBeGreaterThan(10);
    expect(stage.right - items.right, 'room on the right').toBeGreaterThan(10);

    await page.getByText('flex: 1 on every item').click();

    await expect.poll(async () => {
        ({items, stage} = await measure(page, 'hbox'));
        return Math.abs(items.left - stage.left) < 1 && Math.abs(items.right - stage.right) < 1
    }, {message: 'the six items fill the row'}).toBe(true);

    expect(Math.max(...items.widths) - Math.min(...items.widths), 'in equal shares').toBeLessThan(1)
});

test('Next item steps the card and turns the cube to the same item', async ({page}) => {
    const card = page.locator('.examples-layouts-frame-card .examples-layouts-item:visible'),
          cube = page.locator('.examples-layouts-cube');

    await expect(card).toHaveText('1');

    await page.getByRole('button', {name: 'Next item'}).click();
    await page.getByRole('button', {name: 'Next item'}).click();

    await expect(card).toHaveText('3');

    // the face on top at the cube's centre, once the turn has settled
    await expect.poll(() => cube.evaluate(node => {
        const box = node.getBoundingClientRect();
        return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.textContent
    }), {message: 'the cube shows item 3 at its centre', timeout: 5000}).toBe('3')
});
