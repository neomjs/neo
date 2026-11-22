import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The task id of the focused bar, or what holds focus instead.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String>}
 */
function focusedTask(page) {
    return page.evaluate(() => {
        const node = document.activeElement;

        return node?.closest('.neo-timeline-bar')?.dataset.eventId ?? `not a bar: ${node?.tagName}#${node?.id}`
    })
}

/**
 * @summary Opens the task editor on the "Design the beds" bar, by double-click or by Enter on the focused bar.
 * @param {import('@playwright/test').Page} page
 * @param {Boolean} keyboard
 */
async function openEditor(page, keyboard) {
    const bar = page.locator('.neo-timeline-bar[data-event-id="design"]');

    if (keyboard) {
        await bar.focus();
        await page.keyboard.press('Enter')
    } else {
        await bar.dblclick()
    }

    await expect(page.locator('.neo-timeline-event-editor')).toBeVisible()
}

/**
 * @summary Waits for the opening flight before targeting a button that moves during the animation.
 * @param {import('@playwright/test').Page} page
 */
async function openEditorForPointerInput(page) {
    await openEditor(page, false);

    const id        = await page.locator('.neo-timeline-event-editor').getAttribute('id'),
          appWorker = page.workers().find(worker => worker.url().includes('worker/App'));

    await expect.poll(() => appWorker.evaluate(id => {
        const editor = Neo.get(id);

        return Boolean(editor?.mounted && !editor.hidden && editor.mountFlight === null)
    }, id), {message: 'The task editor has finished opening'}).toBe(true)
}

test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/examples/gantt/basic/index.html?theme=neo-theme-neo-light');
    await expect(page.locator('.neo-timeline-bar[data-event-id="design"]')).toBeVisible()
});

for (const [opened, keyboard] of [['by double-click', false], ['by Enter', true]]) {
    test(`an editor opened ${opened} hands focus back to its task on Escape`, async ({page}) => {
        await openEditor(page, keyboard);
        await page.keyboard.press('Escape');

        await expect(page.locator('.neo-timeline-event-editor')).toBeHidden();
        await expect.poll(() => focusedTask(page)).toBe('design')
    })
}

test('the editor hands focus back to its task on Cancel and on Save', async ({page}) => {
    await openEditorForPointerInput(page);
    await page.locator('.neo-timeline-event-editor-cancel').click();
    await expect(page.locator('.neo-timeline-event-editor')).toBeHidden();
    await expect.poll(() => focusedTask(page)).toBe('design');

    await openEditorForPointerInput(page);
    await page.locator('.neo-timeline-event-editor input[name="percentDone"]').fill('50');
    await page.locator('.neo-timeline-event-editor-save').click();
    await expect(page.locator('.neo-timeline-event-editor')).toBeHidden();
    await expect.poll(() => focusedTask(page)).toBe('design')
});
