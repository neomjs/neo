import {test, expect} from '../../fixtures.mjs';

const URL  = '/examples/gantt/dependencies/index.html';
const SEED = ['bugs>notes:FF', 'bugs>submit:FS', 'freeze>bugs:FS', 'golive>beta:SF', 'landing>golive:FS',
    'submit>golive:FS', 'video>landing:FF', 'video>landing:SS'];

/**
 * @summary Opens the launch plan once its links are drawn.
 * @param {Object} page
 */
async function openPlan(page) {
    await page.goto(URL);
    await expect(page.locator('.neo-gantt-dependency-arrow')).toHaveCount(8)
}

/**
 * @summary Reads the drawn links as `from>to:type`, sorted. Each arrow carries its record's endpoints and type.
 * @param {Object} page
 * @returns {Promise<String[]>}
 */
async function links(page) {
    return (await page.locator('.neo-gantt-dependency-arrow').evaluateAll(paths =>
        paths.map(({dataset}) => `${dataset.fromId}>${dataset.toId}:${dataset.type}`))).sort()
}

/**
 * @summary A task's bar.
 * @param {Object} page
 * @param {String} id
 * @returns {Object} Locator
 */
const bar = (page, id) => page.locator(`.neo-timeline-bar[data-event-id="${id}"]`);

/**
 * @summary Presses on a task's finish dot and moves the pointer over another task, without releasing.
 * @param {Object} page
 * @param {String} fromId
 * @param {String} toId
 */
async function dragLink(page, fromId, toId) {
    await bar(page, fromId).hover();
    const port = bar(page, fromId).locator('.neo-gantt-link-terminal');
    await expect(port).toBeVisible();
    const a = await port.boundingBox(), b = await bar(page, toId).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 16})
}

test('the plan opens with eight links in all four types, a legend of the four, and six tasks unlinked', async ({page}) => {
    await openPlan(page);
    expect(await links(page)).toEqual(SEED);

    await expect(page.locator('.launch-legend-item')).toHaveText(['Finish to start', 'Start to start', 'Finish to finish', 'Start to finish']);
    for (const id of ['translate', 'teaser', 'press', 'emails', 'support', 'retro']) {
        await expect(page.locator(`[data-from-id="${id}"], [data-to-id="${id}"]`)).toHaveCount(0)
    }
});

test('a drag from a finish dot to another task adds a finish-to-start link, and the next move of the first task moves the second', async ({page}) => {
    await openPlan(page);
    const emails = bar(page, 'emails'), translate = bar(page, 'translate');
    const before = await emails.boundingBox();

    await dragLink(page, 'translate', 'emails');
    await expect(emails).toHaveClass(/neo-gantt-link-target/);
    await expect(page.locator('.neo-gantt-link-preview')).toHaveCSS('border-top-style', 'solid');
    await page.mouse.up();

    await expect(page.locator('[data-from-id="translate"][data-to-id="emails"]')).toHaveAttribute('data-type', 'FS');
    expect(await links(page)).toEqual([...SEED, 'translate>emails:FS'].sort());
    await expect(page.locator('.launch-status')).toHaveText('Linked “Translate the app” to “Draft the emails”, finish to start.');
    // The new link moves nothing by itself: drafting the emails still starts before translating ends
    expect((await emails.boundingBox()).x).toBeCloseTo(before.x, 0);

    // A day later for translating: drafting the emails now starts where translating ends
    const label = await emails.getAttribute('aria-label');
    await translate.focus();
    await page.keyboard.press('ArrowRight');
    await expect(emails).not.toHaveAttribute('aria-label', label);
    await expect.poll(async () => {
        const from = await translate.boundingBox(), to = await emails.boundingBox();
        return Math.abs(to.x - (from.x + from.width)) < 1.5
    }).toBe(true)
});

test('a drop on the same task or on a predecessor is refused: the line turns dashed and no link is added', async ({page}) => {
    await openPlan(page);
    const preview = page.locator('.neo-gantt-link-preview');

    // Freezing the features already precedes fixing the bugs: the reverse link would close a cycle
    await dragLink(page, 'bugs', 'freeze');
    await expect(preview).toHaveCSS('border-top-style', 'dashed');
    await expect(bar(page, 'freeze')).not.toHaveClass(/neo-gantt-link-target/);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);

    await dragLink(page, 'bugs', 'bugs');
    await expect(preview).toHaveCSS('border-top-style', 'dashed');
    await expect(bar(page, 'bugs')).not.toHaveClass(/neo-gantt-link-target/);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);

    expect(await links(page)).toEqual(SEED)
});

for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk']) {
    test(`${theme}: the plan, its links and a legend in the links' colour at 1440 × 900 and 390 × 844`, async ({page}) => {
        for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);
            await page.goto(`${URL}?theme=${theme}`);
            await expect(page.locator(`.launch-viewport.${theme}`)).toHaveCount(1);
            await expect(page.locator('.neo-gantt-dependency-arrow').first()).toBeVisible();
            await expect(page.locator('.launch-legend-item')).toHaveCount(4);
            // The chart's and the example's theme sheets can arrive in either order: compare once both apply
            await expect.poll(async () => {
                const glyph = await page.locator('.launch-legend-glyph').first().evaluate(node => getComputedStyle(node).color),
                      arrow = await page.locator('.neo-gantt-dependency-arrow').first().evaluate(node => getComputedStyle(node).stroke);
                return arrow !== '' && arrow !== 'none' && glyph === arrow
            }).toBe(true)
        }
    })
}

test('a keyboard user links two tasks with L on each, and Reset restores the starting plan', async ({page}) => {
    await openPlan(page);

    await bar(page, 'press').focus();
    await page.keyboard.press('l');
    await expect(page.locator('.neo-gantt-link-status')).toHaveText('Link from Brief the press. Focus the destination and press L, or press Escape to cancel.');
    await bar(page, 'retro').focus();
    await page.keyboard.press('l');
    await expect(page.locator('[data-from-id="press"][data-to-id="retro"]')).toHaveAttribute('data-type', 'FS');
    await expect(page.locator('.launch-status')).toHaveText('Linked “Brief the press” to “Retrospective”, finish to start.');

    await page.getByRole('button', {name: 'Reset', exact: true}).click();
    await expect.poll(() => links(page)).toEqual(SEED);
    await expect(page.locator('.launch-status')).toContainText('Drag the dot at a task')
});
