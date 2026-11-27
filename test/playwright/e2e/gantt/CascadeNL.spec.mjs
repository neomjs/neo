import {test, expect} from '../../fixtures.mjs';

const
    CHAIN_IDS  = ['cabling', 'rack', 'wifi', 'desks', 'screens', 'badges', 'crates', 'first-day'],
    STATIC_IDS = ['lease', 'layout', 'mail', 'handback'],
    ALL_IDS    = [...STATIC_IDS, ...CHAIN_IDS];

/**
 * @summary Samples inline `left` offsets across animation frames for all 12 office-move task bars.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} ids
 * @param {Number} durationMs
 * @returns {Promise<Object[]>}
 */
function sampleBarLefts(page, ids, durationMs) {
    return page.evaluate(({durationMs, ids}) => new Promise(resolve => {
        const
            frames = [],
            t0     = performance.now(),
            tick   = () => {
                const snap = {};
                for (const id of ids) {
                    const bar = document.querySelector(`.neo-timeline-bar[data-event-id="${id}"]`);
                    snap[id] = bar ? parseFloat(bar.style.left) : null
                }
                frames.push(snap);
                performance.now() - t0 < durationMs ? requestAnimationFrame(tick) : resolve(frames)
            };

        requestAnimationFrame(tick)
    }), {durationMs, ids})
}

/**
 * @summary Reads current inline `left` offsets for the requested task IDs.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} ids
 * @returns {Promise<Object>}
 */
function readBarLefts(page, ids) {
    return page.evaluate(ids => Object.fromEntries(ids.map(id => {
        const bar = document.querySelector(`.neo-timeline-bar[data-event-id="${id}"]`);
        return [id, bar ? parseFloat(bar.style.left) : null]
    })), ids)
}

/**
 * @summary Opens the office-move cascade example with a deterministic `--motion-panel` duration for frame sampling.
 * @param {import('@playwright/test').Page} page
 * @param {Object} neuralLink
 * @param {String} [panelDuration='900ms']
 * @returns {Promise<{app: Object, ganttId: String}>}
 */
async function openCascadePlan(page, neuralLink, panelDuration = '900ms') {
    if (panelDuration) {
        await page.addInitScript(value => document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = `.neo-gantt { --motion-panel: ${value}; }`;
            document.head.append(style)
        }), panelDuration)
    }

    await page.goto('/examples/gantt/cascade/index.html?theme=neo-theme-neo-dark');
    await expect(page.locator('.neo-timeline-bar[data-event-id="first-day"]')).toBeVisible();
    await expect(page.locator('.cascade-move-pill')).toHaveText('Move day: Mon 16 Nov');

    const
        app     = await neuralLink.connectToApp('GanttCascade'),
        [gantt] = await app.findInstances({className: 'Neo.gantt.Container'}, ['id', 'animateCascade', 'cascadeDependencies']);

    expect(gantt.properties.animateCascade).toBe(true);
    expect(gantt.properties.cascadeDependencies).toBe(true);

    return {app, ganttId: gantt.id}
}

test.describe('Gantt office-move cascade example', () => {
    test('delaying cabling by button glides dependent tasks to Mon 23 Nov while tasks beside the chain stay', async ({page, neuralLink}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) });

        const {app, ganttId} = await openCascadePlan(page, neuralLink, '900ms');
        const readTask       = id => app.callMethod(ganttId, 'resolveTaskRecord', [id]);

        // First frame: chain and move day are readable without a click
        await expect(page.locator('.cascade-readout-text')).toContainText('First day in the new office is Mon 16 Nov');
        expect((await readTask('cabling')).startDate).toBe('2026-11-05T00:00:00.000Z');
        expect((await readTask('rack')).startDate).toBe('2026-11-07T00:00:00.000Z');
        expect((await readTask('first-day')).startDate).toBe('2026-11-16T00:00:00.000Z');
        expect((await readTask('mail')).startDate).toBe('2026-11-05T00:00:00.000Z');
        expect((await readTask('handback')).startDate).toBe('2026-11-08T00:00:00.000Z');

        const
            beforeLefts = await readBarLefts(page, ALL_IDS),
            sampling    = sampleBarLefts(page, ALL_IDS, 1300);

        await page.getByRole('button', {name: 'Delay the cabling by a week'}).click();

        const frames = await sampling;
        await expect(page.locator('.cascade-viewport.is-slipped:not(.is-cascading)')).toBeVisible();
        const afterLefts = await readBarLefts(page, ALL_IDS);

        // Cabling and all 7 downstream tasks animate across intermediate frames to +7 days
        for (const id of ['cabling', 'rack', 'first-day']) {
            const intermediate = new Set(
                frames.map(f => f[id]).filter(left => left > beforeLefts[id] && left < afterLefts[id])
            );
            expect(afterLefts[id], `${id} shifted later`).toBeGreaterThan(beforeLefts[id]);
            expect(intermediate.size, `${id} glided through intermediate frames`).toBeGreaterThanOrEqual(3)
        }

        // Upstream tasks and the 2 tasks beside the chain never move
        for (const id of STATIC_IDS) {
            expect(new Set(frames.map(f => f[id])), `${id} kept its position`).toEqual(new Set([beforeLefts[id]]));
            expect(afterLefts[id]).toBe(beforeLefts[id])
        }

        expect((await readTask('cabling')).startDate).toBe('2026-11-12T00:00:00.000Z');
        expect((await readTask('rack')).startDate).toBe('2026-11-14T00:00:00.000Z');
        expect((await readTask('first-day')).startDate).toBe('2026-11-23T00:00:00.000Z');
        expect((await readTask('mail')).startDate).toBe('2026-11-05T00:00:00.000Z');
        expect((await readTask('handback')).startDate).toBe('2026-11-08T00:00:00.000Z');

        await expect(page.locator('.cascade-move-pill')).toHaveText('Move day: Mon 16 Nov to Mon 23 Nov (+7d)');
        await expect(page.locator('.cascade-readout-text')).toContainText('slipped from Mon 16 Nov to Mon 23 Nov (+7 days)');
        await expect(page.locator('.cascade-readout-text')).toContainText('8 tasks moved (1 delayed + 7 dependent)');

        // A second +7d slip pushes move day past 30 Nov, exercising batched TimeAxis#set({end, size, tickStep})
        await page.getByRole('button', {name: 'Delay the cabling by a week'}).click();
        await expect(page.locator('.cascade-move-pill')).toHaveText('Move day: Mon 16 Nov to Mon 30 Nov (+14d)');
        expect((await readTask('first-day')).startDate).toBe('2026-11-30T00:00:00.000Z');

        // Reset restores the 28-day axis and first frame
        await page.getByRole('button', {name: 'Reset'}).click();
        await expect(page.locator('.cascade-move-pill')).toHaveText('Move day: Mon 16 Nov');
        await expect(page.locator('.cascade-readout-text')).toContainText('First day in the new office is Mon 16 Nov');
        expect((await readTask('cabling')).startDate).toBe('2026-11-05T00:00:00.000Z');
        expect((await readTask('rack')).startDate).toBe('2026-11-07T00:00:00.000Z');
        expect((await readTask('first-day')).startDate).toBe('2026-11-16T00:00:00.000Z');
        expect(await readBarLefts(page, ALL_IDS)).toEqual(beforeLefts);
        expect(errors).toEqual([])
    });

    test('dragging the cabling bar cascades its successors, Reset restores the plan, and phone + all themes hold clean', async ({page, neuralLink}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) });

        await page.setViewportSize({width: 1440, height: 900});
        const {app, ganttId} = await openCascadePlan(page, neuralLink, '900ms');
        const readTask       = id => app.callMethod(ganttId, 'resolveTaskRecord', [id]);

        const
            beforeLefts = await readBarLefts(page, ALL_IDS),
            dayPx       = (beforeLefts['first-day'] - beforeLefts['lease']) / 13,
            cablingBar  = page.locator('.neo-timeline-bar[data-event-id="cabling"]'),
            box         = await cablingBar.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2, {steps: 8});
        await expect(page.locator('.neo-dragproxy')).toBeVisible();
        await page.mouse.move(box.x + box.width / 2 + 7 * dayPx, box.y + box.height / 2, {steps: 14});

        const sampling = sampleBarLefts(page, ALL_IDS, 1300);
        await page.mouse.up();
        const frames = await sampling;

        await expect(page.locator('.cascade-viewport.is-slipped:not(.is-cascading)')).toBeVisible();
        const afterLefts = await readBarLefts(page, ALL_IDS);

        for (const id of ['rack', 'first-day']) {
            const intermediate = new Set(
                frames.map(f => f[id]).filter(left => left > beforeLefts[id] && left < afterLefts[id])
            );
            expect(intermediate.size, `${id} animated after bar drop`).toBeGreaterThanOrEqual(3)
        }

        expect((await readTask('cabling')).startDate).toBe('2026-11-12T00:00:00.000Z');
        expect((await readTask('rack')).startDate).toBe('2026-11-14T00:00:00.000Z');
        expect((await readTask('first-day')).startDate).toBe('2026-11-23T00:00:00.000Z');
        expect((await readTask('mail')).startDate).toBe('2026-11-05T00:00:00.000Z');
        expect((await readTask('handback')).startDate).toBe('2026-11-08T00:00:00.000Z');
        await expect(page.locator('.cascade-readout-text')).toContainText('slipped from Mon 16 Nov to Mon 23 Nov (+7 days)');
        await expect(page.locator('.cascade-readout-text')).toContainText('8 tasks moved (1 delayed + 7 dependent); 2 beside the chain kept their dates.');

        // Moving a beside-the-chain task updates the side-task clause and labels the latest move separately
        const mailBox = await page.locator('.neo-timeline-bar[data-event-id="mail"]').boundingBox();
        await page.mouse.move(mailBox.x + mailBox.width / 2, mailBox.y + mailBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(mailBox.x + mailBox.width / 2 + 24, mailBox.y + mailBox.height / 2, {steps: 8});
        await expect(page.locator('.neo-dragproxy')).toBeVisible();
        await page.mouse.move(mailBox.x + mailBox.width / 2 + dayPx, mailBox.y + mailBox.height / 2, {steps: 10});
        await page.mouse.up();
        await expect(page.locator('.cascade-viewport.is-slipped:not(.is-cascading)')).toBeVisible();
        await expect(page.locator('.cascade-readout-text')).toContainText('10 tasks moved (latest move: 2, 1 moved + 1 dependent); both beside the chain also moved.');

        await page.getByRole('button', {name: 'Reset'}).click();
        await expect(page.locator('.cascade-move-pill')).toHaveText('Move day: Mon 16 Nov');
        expect((await readTask('first-day')).startDate).toBe('2026-11-16T00:00:00.000Z');

        // Equal-count disjoint task sets (returning the 2 side tasks to seed while 2 chain tasks remain shifted)
        // must report the latest 2-task gesture separately rather than collapsing into a single-gesture breakdown
        await app.callMethod(ganttId, 'moveTask', ['first-day', {startDate: '2026-11-17T00:00:00Z', endDate: '2026-11-19T00:00:00Z'}]);
        await app.callMethod(ganttId, 'moveTask', ['crates',    {startDate: '2026-11-16T00:00:00Z', endDate: '2026-11-17T00:00:00Z'}]);
        await app.callMethod(ganttId, 'moveTask', ['mail',      {startDate: '2026-11-04T00:00:00Z', endDate: '2026-11-07T00:00:00Z'}]);
        await app.callMethod(ganttId, 'moveTask', ['mail',      {startDate: '2026-11-05T00:00:00Z', endDate: '2026-11-08T00:00:00Z'}]);
        expect((await readTask('mail')).startDate).toBe('2026-11-05T00:00:00.000Z');
        expect((await readTask('handback')).startDate).toBe('2026-11-08T00:00:00.000Z');
        expect((await readTask('crates')).startDate).toBe('2026-11-16T00:00:00.000Z');
        expect((await readTask('first-day')).startDate).toBe('2026-11-17T00:00:00.000Z');
        await expect(page.locator('.cascade-readout-text')).toContainText(
            '2 tasks moved (latest move: 2, 1 moved + 1 dependent); 2 beside the chain kept their dates.'
        );

        await page.getByRole('button', {name: 'Reset'}).click();
        await expect(page.locator('.cascade-move-pill')).toHaveText('Move day: Mon 16 Nov');

        // Phone viewport (390 × 844) + switch through all 5 configured themes
        await page.setViewportSize({width: 390, height: 844});
        await expect(page.locator('.cascade-viewport.cascade-is-compact')).toBeVisible();
        await expect(page.locator('.neo-timeline-bar[data-event-id="first-day"]')).toBeVisible();

        const
            switcher = page.locator('.neo-themeswitcher').first(),
            menu     = page.getByRole('menu'),
            themes   = [
                ['Light',     'neo-theme-light'],
                ['Dark',      'neo-theme-dark'],
                ['Cyberpunk', 'neo-theme-cyberpunk'],
                ['Neo Light', 'neo-theme-neo-light'],
                ['Neo Dark',  'neo-theme-neo-dark']
            ];

        for (const [label, theme] of themes) {
            await switcher.click();
            await menu.getByRole('menuitemradio', {name: label, exact: true}).click();
            await expect(page.locator(`.cascade-viewport.${theme}`)).toBeVisible()
        }

        expect(errors).toEqual([])
    })
});
