import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/gantt/taskEditor/index.html',
    THEMES      = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'];

/**
 * @summary Runs `fn(gantt, arg)` in the App Worker against the page's Gantt and returns its result.
 * @param {import('@playwright/test').Page} page
 * @param {Function} fn Serialized into the worker, so it may use only its arguments
 * @param {*} [arg]
 * @returns {Promise<*>}
 */
async function inGantt(page, fn, arg) {
    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    return page.workers().find(worker => worker.url().includes('worker/App')).evaluate(([source, value]) => {
        const gantt = [...globalThis.Neo.manager.Instance.items.values()].find(item => item.className === 'Neo.gantt.Container');

        return (0, eval)(`(${source})`)(gantt, value)
    }, [fn.toString(), arg])
}

/**
 * @summary A task's start and end as UTC days, and its percent done.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @returns {Promise<String>} e.g. `2027-03-10 → 2027-03-15, 40 %`
 */
function task(page, id) {
    return inGantt(page, (gantt, id) => {
        const record = gantt.store.get(id), day = date => date.toISOString().slice(0, 10);

        return `${day(record.startDate)} → ${day(record.endDate)}, ${record.percentDone} %`
    }, id)
}

/**
 * @summary Opens the editor on "Sketch the wireframes" by double-click.
 * @param {import('@playwright/test').Page} page
 */
async function editWireframes(page) {
    await page.locator('.neo-timeline-bar[data-event-id="wireframes"]').dblclick();
    await expect(page.locator('.neo-timeline-event-editor input[name="title"]')).toHaveValue('Sketch the wireframes')
}

test('the landing editor names its visible task and can be reopened by keyboard', async ({page}) => {
    await page.setViewportSize({width: 960, height: 540});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    const editor = page.locator('.neo-timeline-event-editor'), title = editor.locator('input[name="title"]'),
          bar    = page.locator('.neo-timeline-bar[data-event-id="pages"]');
    await expect(title).toHaveValue('Design the inner pages');
    await expect(title).toBeFocused();
    await expect(editor).toBeInViewport({ratio: 1});
    await expect(bar).toBeInViewport();
    const dialogBox = await editor.boundingBox(), barBox = await bar.boundingBox();
    expect(barBox.x + barBox.width).toBeGreaterThan(dialogBox.x + dialogBox.width);
    expect(barBox.x).toBeLessThan(960);
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    await bar.focus();
    await page.keyboard.press('Enter');
    await expect(title).toHaveValue('Design the inner pages');
    await editor.getByRole('button', {name: 'close'}).click();
    await expect(editor).toBeHidden()
});

test.describe('at 1440 × 900', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.neo-timeline-bar[data-event-id="wireframes"]')).toBeVisible();
        await expect(page.locator('.neo-timeline-event-editor input[name="title"]')).toHaveValue('Design the inner pages');
        await page.locator('.neo-timeline-event-editor-cancel').click();
        await expect(page.locator('.neo-timeline-event-editor')).toBeHidden()
    });

    test('the editor opens on a task by double-click and by Enter, and Escape hands focus back to it', async ({page}) => {
        const editor = page.locator('.neo-timeline-event-editor');

        await page.locator('.neo-theme-switcher').first().click();
        await page.getByRole('menuitemradio', {name: 'Neo Light', exact: true}).click();
        await expect(page.locator('.neo-viewport').first()).toHaveClass(/\bneo-theme-neo-light\b/);
        await editWireframes(page);
        await expect(editor).toHaveClass(/\bneo-theme-neo-light\b/);
        await page.keyboard.press('Escape');
        await expect(editor).toBeHidden();
        await expect(page.locator('.neo-timeline-bar[data-event-id="wireframes"]')).toBeFocused();

        await page.locator('.neo-timeline-bar[data-event-id="home"]').focus();
        await page.keyboard.press('Enter');
        await expect(editor.locator('input[name="title"]')).toHaveValue('Design the home page')
    });

    test('a later end moves the task and every task linked after it', async ({page}) => {
        await editWireframes(page);
        await page.locator('.neo-timeline-event-editor input[name="endDate"]').fill('2027-03-22');
        await page.locator('.neo-timeline-event-editor-save').click();
        await expect(page.locator('.neo-timeline-event-editor')).toBeHidden();

        await expect.poll(() => task(page, 'wireframes')).toBe('2027-03-10 → 2027-03-22, 40 %');
        // Its successors start a week later, and the week reaches the last task of the plan
        expect(await task(page, 'home')).toBe('2027-03-22 → 2027-03-27, 0 %');
        expect(await task(page, 'pages')).toBe('2027-03-22 → 2027-03-28, 0 %');
        expect(await task(page, 'announce')).toBe('2027-04-15 → 2027-04-16, 0 %')
    });

    test('a saved percent fills the bar', async ({page}) => {
        await editWireframes(page);
        await page.locator('.neo-timeline-event-editor input[name="percentDone"]').fill('100');
        await page.locator('.neo-timeline-event-editor-save').click();

        await expect.poll(() => task(page, 'wireframes')).toBe('2027-03-10 → 2027-03-15, 100 %');
        await expect(page.locator('.neo-timeline-bar[data-event-id="wireframes"] .neo-timeline-bar-progress')).toHaveAttribute('style', /width: 100%/)
    });

    test('an end before the start is refused with a message, and Cancel then changes nothing and hands focus back', async ({page}) => {
        const editor = page.locator('.neo-timeline-event-editor');

        await editWireframes(page);
        await editor.locator('input[name="endDate"]').fill('2027-03-05');
        await page.locator('.neo-timeline-event-editor-save').click();

        await expect(editor).toContainText('End date must not precede start date');
        await expect(editor).toBeVisible();

        await page.locator('.neo-timeline-event-editor-cancel').click();
        await expect(editor).toBeHidden();
        await expect(page.locator('.neo-timeline-bar[data-event-id="wireframes"]')).toBeFocused();
        expect(await task(page, 'wireframes')).toBe('2027-03-10 → 2027-03-15, 40 %');
        expect(await task(page, 'home')).toBe('2027-03-15 → 2027-03-20, 0 %')
    })
});

test('opens cleanly at 1440 × 900 and 390 × 844 in every theme', async ({page}) => {
    const errors = [];

    // The browser asks the test server for a favicon on its own, and the server has none
    page.on('console', message => {
        const {url} = message.location();
        message.type() === 'error' && !url.endsWith('/favicon.ico') && errors.push(`${message.text()} ${url}`)
    });
    page.on('response', response => response.status() >= 400 && !response.url().endsWith('/favicon.ico') && errors.push(`${response.status()} ${response.url()}`));
    page.on('pageerror', error => errors.push(error.message));

    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        await page.setViewportSize(viewport);

        for (const theme of THEMES) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
            await expect(page.locator(`.${theme}`).first()).toBeAttached();
            await expect(page.locator('.neo-timeline-bar[data-event-id="wireframes"]')).toBeAttached()
        }
    }

    expect(errors).toEqual([])
});

test('on a phone the task column narrows to 160 px and the chart follows it, and a desktop width restores 240 px', async ({page}) => {
    // The task column's width, and how far right of it the first task's bar starts
    const layout = () => page.evaluate(() => {
        const
            header = [...document.querySelectorAll('.neo-grid-header-button.neo-locked-start')].find(button => button.innerText.trim() === 'Task'),
            bar    = document.querySelector('.neo-timeline-bar[data-event-id="interviews"]');

        return header && bar && {
            barOffset: Math.round(bar.getBoundingClientRect().left - header.getBoundingClientRect().right),
            task     : Math.round(header.getBoundingClientRect().width)
        }
    });

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
    await expect.poll(async () => (await layout())?.task).toBe(240);

    const desktop = await layout();

    await page.setViewportSize({width: 390, height: 844});
    await expect.poll(async () => (await layout())?.task).toBe(160);
    await expect.poll(async () => (await layout())?.barOffset).toBe(desktop.barOffset);

    await page.setViewportSize({width: 1440, height: 900});
    await expect.poll(async () => (await layout())?.task).toBe(240)
});

test('opens in the dark theme on a system that prefers dark, unless ?theme= names another', async ({page}) => {
    const theme = () => page.locator('.task-editor-viewport').evaluate(node => [...node.classList].find(cls => cls.startsWith('neo-theme-')));

    await page.emulateMedia({colorScheme: 'light'});
    await page.goto(EXAMPLE_URL);
    await expect.poll(theme, 'a light system gets the first configured theme').toBe('neo-theme-neo-light');

    await page.emulateMedia({colorScheme: 'dark'});
    await page.goto(EXAMPLE_URL);
    await expect.poll(theme, 'a dark system gets the dark theme').toBe('neo-theme-neo-dark');

    await page.goto(`${EXAMPLE_URL}?theme=neo-theme-light`);
    await expect.poll(theme, '?theme= wins over the system').toBe('neo-theme-light')
});
