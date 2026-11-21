import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The timeline's editor, as the Gantt and the scheduler open it: it takes input on its Title field, keeps a
 * refused End in its row, and fits a phone.
 */

const examples = [
    ['the Gantt',     '/examples/gantt/basic/index.html'],
    ['the scheduler', '/examples/scheduler/basic/index.html']
];

/**
 * @summary Opens the example at a viewport size, then the editor by Enter on its first bar, and waits until the
 * editor has grown out of the bar and stopped moving.
 * @param {import('@playwright/test').Page} page
 * @param {String} url
 * @param {Number} width
 * @param {Number} height
 * @returns {Promise<import('@playwright/test').Locator>} The editor
 */
async function openEditor(page, url, width, height) {
    const bar    = page.locator('.neo-timeline-bar').first(),
          editor = page.locator('.neo-timeline-event-editor');
    let last = null;

    await page.setViewportSize({width, height});
    await page.goto(`${url}?theme=neo-theme-neo-light`);
    await expect(bar).toBeVisible();
    await bar.focus();
    await page.keyboard.press('Enter');
    await expect(editor).toBeVisible();

    await expect.poll(async () => {
        const box = await editor.boundingBox(),
              key = box && `${box.x},${box.y},${box.width},${box.height}`,
              set = key === last;

        last = key;
        return set
    }, {intervals: [100]}).toBe(true);

    return editor
}

/**
 * @summary Whether the page paints the node at its centre: a node an ancestor clips, or one another node covers,
 * loses the hit test.
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<Boolean>}
 */
function isPainted(locator) {
    return locator.evaluate(node => {
        const {left, top, width, height} = node.getBoundingClientRect();

        return node.contains(document.elementFromPoint(left + width / 2, top + height / 2))
    })
}

for (const [name, url] of examples) {
    test.describe(`The editor of ${name}`, () => {
        test('opens on its Title field and offers no maximize', async ({page}) => {
            const editor = await openEditor(page, url, 1440, 900);

            await expect(editor.locator('input[name="title"]')).toBeFocused();
            await expect(editor.getByRole('button', {name: 'maximize'})).toHaveCount(0)
        });

        test('keeps a refused End in its row, with the message beneath and every row in view', async ({page}) => {
            const editor  = await openEditor(page, url, 1440, 900),
                  endDate = editor.locator('input[name="endDate"]'),
                  start   = await editor.locator('input[name="startDate"]').inputValue(),
                  earlier = new Date(`${start}T00:00:00Z`);

            earlier.setUTCDate(earlier.getUTCDate() - 2);
            await endDate.fill(earlier.toISOString().slice(0, 10));
            await endDate.press('Tab');
            await editor.locator('.neo-timeline-event-editor-save').click();

            const message = editor.getByText('End date must not precede start date');

            await expect(message).toBeVisible();

            for (const node of [editor.getByText('End', {exact: true}), endDate, editor.locator('input[name="percentDone"]')]) {
                expect(await isPainted(node)).toBe(true)
            }

            expect((await message.boundingBox()).y).toBeGreaterThan((await endDate.boundingBox()).y)
        });

        test('keeps every field inside the dialog and the viewport at 390 × 844', async ({page}) => {
            const editor = await openEditor(page, url, 390, 844),
                  dialog = await editor.boundingBox(),
                  fields = editor.locator('.neo-timeline-event-editor-form .neo-input-wrapper:visible');

            expect(await fields.count()).toBeGreaterThan(3);

            for (const box of await fields.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
                expect(box.left).toBeGreaterThanOrEqual(dialog.x);
                expect(box.right).toBeLessThanOrEqual(dialog.x + dialog.width);
                expect(box.right).toBeLessThanOrEqual(390);
                expect(box.bottom).toBeLessThanOrEqual(Math.min(dialog.y + dialog.height, 844))
            }
        })
    })
}
