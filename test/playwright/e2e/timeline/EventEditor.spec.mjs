import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The timeline's editor, as the Gantt and the scheduler open it: it takes input on its Title field, keeps a
 * refused End in its row, and fits a phone.
 */

const examples = [
    ['the Gantt',     '/examples/gantt/basic/index.html'],
    // Piano overdubs runs 01:00 to 04:00 on one day, so a change of its End time alone can precede its start
    ['the scheduler', '/examples/scheduler/basic/index.html', 'Piano overdubs']
];

/**
 * @summary Opens the example at a viewport size, then the editor by Enter on a bar, and waits until the editor has
 * grown out of the bar and stopped moving.
 * @param {import('@playwright/test').Page} page
 * @param {String} url
 * @param {Number} width
 * @param {Number} height
 * @param {String} [title] The bar to open, else the first one
 * @returns {Promise<import('@playwright/test').Locator>} The editor
 */
async function openEditor(page, url, width, height, title) {
    const bar    = title ? page.locator('.neo-timeline-bar', {hasText: title}) : page.locator('.neo-timeline-bar').first(),
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

/**
 * @summary Saves an End that precedes the start, then expects the refusal on the changed field, beneath its `input`
 * in the End row: painted, on one line, clear of the Progress input, and Save where it was.
 * @param {import('@playwright/test').Locator} editor
 * @param {import('@playwright/test').Locator} input The End's date or time input that changed
 * @param {String} fieldCls `'neo-datefield'` or `'neo-timefield'`, the field that carries the message
 */
async function expectRefusedInRow(editor, input, fieldCls) {
    const progress = editor.locator('input[name="percentDone"]'),
          save     = editor.locator('.neo-timeline-event-editor-save'),
          saveBox  = await save.boundingBox(),
          text     = 'End date must not precede start date';

    await save.click();

    const message = editor.getByText(text);

    await expect(message).toBeVisible();
    await expect(editor.locator(`.${fieldCls}`, {hasText: text}), `${fieldCls} carries the message`).toHaveCount(1);

    for (const node of [editor.getByText('End', {exact: true}), input, progress, message]) {
        expect(await isPainted(node)).toBe(true)
    }

    const box   = await message.boundingBox(),
          lines = await message.evaluate(node => {
              const {fontSize, lineHeight} = getComputedStyle(node);

              return Math.round(node.offsetHeight / (lineHeight === 'normal' ? parseFloat(fontSize) * 1.2 : parseFloat(lineHeight)))
          });

    expect(box.y).toBeGreaterThan((await input.boundingBox()).y);
    expect(lines, 'the message reads on one line').toBe(1);
    expect(box.y + box.height, 'the message clears the Progress input').toBeLessThanOrEqual((await progress.boundingBox()).y);
    expect((await save.boundingBox()).y, 'Save stays where it was').toBeCloseTo(saveBox.y, 1)
}

for (const [name, url, sameDayBar] of examples) {
    test.describe(`The editor of ${name}`, () => {
        test('opens on its Title field and offers no maximize', async ({page}) => {
            const editor = await openEditor(page, url, 1440, 900);

            await expect(editor.locator('input[name="title"]')).toBeFocused();
            await expect(editor.getByRole('button', {name: 'maximize'})).toHaveCount(0)
        });

        test('keeps a refused End date in its row, its message on one line beneath it and Save in place', async ({page}) => {
            const editor  = await openEditor(page, url, 1440, 900),
                  endDate = editor.locator('input[name="endDate"]'),
                  start   = await editor.locator('input[name="startDate"]').inputValue(),
                  earlier = new Date(`${start}T00:00:00Z`);

            earlier.setUTCDate(earlier.getUTCDate() - 2);
            await endDate.fill(earlier.toISOString().slice(0, 10));
            await endDate.press('Tab');
            await expectRefusedInRow(editor, endDate, 'neo-datefield')
        });

        if (sameDayBar) {
            test('keeps a refused End time in its row, its message on one line beneath it and Save in place (#21747)', async ({page}) => {
                const editor  = await openEditor(page, url, 1440, 900, sameDayBar),
                      endTime = editor.locator('input[name="endDate__time"]');

                // Only the time changes, so the time field carries the message
                await endTime.fill('00:30');
                await endTime.press('Tab');
                await expectRefusedInRow(editor, endTime, 'neo-timefield')
            })
        }

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
