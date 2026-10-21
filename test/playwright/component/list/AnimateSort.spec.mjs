import {test, expect}        from '@playwright/test';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash}          from 'node:crypto';

const LIST       = 'animated-sort-list';
const readWorker = page => page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'observation'}), LIST);
const act        = (page, action) => page.evaluate(config => Neo.worker.App.setConfigs(config), {id: LIST, action});

test.beforeEach(async ({page}) => {
    await page.goto('/test/playwright/component/apps/animated-sort/index.html');
    await expect(page.locator(`#${LIST} .neo-list-item`)).toHaveCount(5);
    await expect(page.locator(`#${LIST} .neo-list-item`).first()).toBeVisible();
    await expect.poll(async () => (await readWorker(page)).columns).toBe(3);
    await page.waitForTimeout(600)
});

/** @summary Samples the same physical nodes throughout a sort, including its settlement boundary. */
async function recordMotion(page, action, testInfo) {
    const before = await readWorker(page);
    await testInfo.attach('visible-before', {body: await page.screenshot(), contentType: 'image/png'});
    await page.evaluate(id => {
        const nodes = [...document.querySelectorAll(`#${id} .neo-list-item`)];
        window.sortMotion = {started: performance.now(), nodes, samples: []};
        const sample = () => {
            const state = window.sortMotion;
            state.samples.push({time: performance.now() - state.started, items: state.nodes.map(node => {
                const rect = node.getBoundingClientRect();
                return {id: node.id, x: rect.x, y: rect.y, transform: node.style.transform,
                    connected: node.isConnected, sameNode: document.getElementById(node.id) === node}
            })});
            if (performance.now() - state.started < 1250) requestAnimationFrame(sample);
            else state.done = true
        };
        sample()
    }, LIST);
    const phases = [];
    for (const [index, intent] of (Array.isArray(action) ? action : [action]).entries()) {
        if (index) await page.waitForTimeout(140);
        if (Array.isArray(action)) await act(page, intent);
        else await page.locator(`#sort-${intent}`).click();
        const worker = await readWorker(page), time = await page.evaluate(() => performance.now() - window.sortMotion.started);
        phases.push({intent, time, worker})
    }
    const afterIntent = phases.at(-1).worker;
    await page.waitForFunction(() => window.sortMotion.done);
    const samples    = await page.evaluate(() => window.sortMotion.samples);
    const after      = await readWorker(page);
    const screenshot = testInfo.outputPath(`visible-${Array.isArray(action) ? 'interrupted' : action}.png`);
    await page.screenshot({path: screenshot});
    await testInfo.attach('visible-after', {path: screenshot, contentType: 'image/png'});
    const sourceHashes = {};
    for (const file of ['src/list/Base.mjs', 'src/list/Component.mjs', 'src/list/plugin/Animate.mjs', 'src/data/Store.mjs']) {
        sourceHashes[file] = createHash('sha256').update(await readFile(new URL(`../../../../${file}`, import.meta.url))).digest('hex')
    }
    const trace = {browser: page.context().browser().version(), sourceHashes, before, afterIntent, after, phases, samples};
    const label = Array.isArray(action) ? 'interrupted' : action;
    const path  = testInfo.outputPath(`motion-${label}.json`);
    await writeFile(path, JSON.stringify(trace, null, 2));
    await testInfo.attach(`motion-${label}`, {path, contentType: 'application/json'});
    return trace
}

/** @summary Distance outside the straight segment from the displayed origin to the requested slot. */
function distanceToPath(point, start, end) {
    const dx       = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
    const progress = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
    return Math.hypot(point.x - start.x - progress * dx, point.y - start.y - progress * dy)
}

/** @summary Independently derives each requested slot from the previously painted grid. */
function assertTargets(trace) {
    const initial = trace.samples[0].items,
        slots     = trace.before.order.map(key => initial.find(item => item.id === `${LIST}__item-${key}`));
    for (const [index, phase] of trace.phases.entries()) {
        for (const node of phase.worker.nodes) {
            const key = Number(node.id.split('__item-')[1]), target = slots[phase.worker.order.indexOf(key)];
            expect(node.transform, `App target for ${key}`).toBe(target.transform);
            const frames = trace.samples.filter(frame => frame.time >= phase.time + 80 &&
                frame.time < (trace.phases[index + 1]?.time ?? Infinity));
            expect(frames.length, 'target observed before the next intent').toBeGreaterThan(0);
            for (const frame of frames) {
                expect(frame.items.find(item => item.id === node.id).transform, `painted target for ${key}`).toBe(target.transform)
            }
        }
    }
}

test('record-keyed cards take one direct path in both sort directions and retain their nodes', async ({page}, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    page.on('console', async message => {
        if (message.type() === 'error') {
            errors.push(message.text());
            for (const argument of message.args()) {
                const stack = await argument.evaluate(value => value?.stack).catch(() => null);
                if (stack) errors.push(stack)
            }
        }
    });
    for (const [action, order] of [['name-asc', [4, 2, 5, 3, 1]], ['name-desc', [1, 3, 5, 2, 4]]]) {
        const trace = await recordMotion(page, action, testInfo),
            initial = trace.samples[0].items,
            slots   = trace.before.order.map(key => initial.find(item => item.id === `${LIST}__item-${key}`));
        expect(trace.after.order).toEqual(order);
        assertTargets(trace);
        expect(trace.after.cards.map(card => card.instanceTag).sort()).toEqual(trace.before.cards.map(card => card.instanceTag).sort());
        for (const item of initial) {
            const key     = Number(item.id.split('__item-')[1]), target = slots[order.indexOf(key)];
            const samples = trace.samples.map(sample => sample.items.find(row => row.id === item.id));
            expect(samples.every(row => row.connected && row.sameNode), `${item.id} remains the same physical node`).toBe(true);
            const detour = Math.max(...samples.map(row => distanceToPath(row, item, target)));
            expect.soft(detour, `${item.id} must stay on its direct path, through settlement`).toBeLessThan(2);
            const final = samples.at(-1);
            expect(Math.hypot(final.x - target.x, final.y - target.y)).toBeLessThan(1)
        }
    }
    expect(errors).toEqual([])
});

test('an in-flight sort retains focused and selected record nodes, including subsequent keyboard navigation', async ({page}, testInfo) => {
    const item = page.locator(`#${LIST}__item-3`), card = page.locator(`#${LIST}__card-3`);
    await item.click({position: {x: 190, y: 65}});
    await expect(item).toHaveAttribute('aria-selected', 'true');
    await card.focus();
    await page.evaluate(id => { window.retainedFocusedCard = document.getElementById(id) }, `${LIST}__card-3`);
    const before = await readWorker(page);

    const trace = await recordMotion(page, ['name-asc', 'name-desc', 'online'], testInfo);
    assertTargets(trace);
    expect((await readWorker(page)).order).toEqual([5, 3, 1, 4, 2]);
    await expect(card).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === window.retainedFocusedCard)).toBe(true);
    await expect(item).toHaveAttribute('aria-selected', 'true');
    expect((await readWorker(page)).cards.find(row => row.recordId === 3).instanceTag).toBe(before.cards.find(row => row.recordId === 3).instanceTag);

    await item.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(`#${LIST}__item-1`)).toBeFocused();
    expect((await readWorker(page)).focusIndex).toBe(2)
});

test('filter then sort retires the older frame and ordinary replacement loads still render current records', async ({page}) => {
    await act(page, 'filter-online');
    await act(page, 'name-desc');
    await page.waitForTimeout(650);
    expect((await readWorker(page)).order).toEqual([1, 3, 5]);
    await expect(page.locator(`#${LIST} .neo-list-item`)).toHaveCount(3);
    await act(page, 'unfilter');
    await page.waitForTimeout(650);
    await expect(page.locator(`#${LIST} .neo-list-item`)).toHaveCount(5);

    await act(page, {type: 'load', data: [{id: 1, name: 'updated', online: true}, {id: 6, name: 'joined', online: false}]});
    await act(page, 'name-asc');
    await expect(page.locator(`#${LIST} .neo-list-item`)).toHaveCount(2);
    await expect(page.locator(`#${LIST}__card-1`)).toHaveText('updated');
    await expect(page.locator(`#${LIST}__card-6`)).toHaveText('joined');
    expect((await readWorker(page)).order).toEqual([6, 1])
});

test('reduced motion reaches the requested slots without a delayed correction', async ({page}, testInfo) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const trace = await recordMotion(page, 'name-desc', testInfo);
    expect(trace.after.order).toEqual([1, 3, 5, 2, 4]);
    for (const row of trace.samples.at(-1).items) {
        expect(row.sameNode).toBe(true);
        expect(row.transform).toBe(trace.afterIntent.nodes.find(node => node.id === row.id).transform)
    }
    expect(await page.locator(`#${LIST} .neo-list-item`).first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s')
});

test('a removal followed synchronously by sort has no stale row before settlement', async ({page}) => {
    await act(page, {type: 'remove-sort', id: 1});
    await page.waitForTimeout(80);
    const state = await readWorker(page);
    expect(state.order).toEqual([4, 2, 5, 3]);
    expect(state.nodes.map(node => node.id).sort()).toEqual([2, 3, 4, 5].map(id => `${LIST}__item-${id}`));
    await expect(page.locator(`#${LIST}__item-1`)).toHaveCount(0)
});

test('a moved record changes exactly its own descriptor during the transition', async ({page}) => {
    await act(page, 'name-desc');
    await page.waitForTimeout(80);
    await act(page, {type: 'change', id: 2, online: true});
    await page.waitForTimeout(80);
    const state = await readWorker(page);
    expect(state.nodes.map(node => node.id).sort()).toEqual([1, 2, 3, 4, 5].map(id => `${LIST}__item-${id}`));
    await expect(page.locator(`#${LIST} .neo-list-item`)).toHaveCount(5);
    await expect(page.locator(`#${LIST}__card-2`)).toHaveText('bravo: changed')
});

test('index-pooled component rows do not duplicate a record changed during motion', async ({page}) => {
    const id = 'indexed-sort-list';
    await page.evaluate(config => Neo.worker.App.setConfigs(config), {id, action: 'name-desc'});
    await page.waitForTimeout(80);
    await page.evaluate(config => Neo.worker.App.setConfigs(config), {id, action: {type: 'change', id: 2, online: true}});
    await page.waitForTimeout(80);
    const labels = await page.locator(`#${id} .neo-list-item`).allTextContents();
    expect(labels.map(text => text.trim()).sort()).toEqual(['alpha', 'bravo: changed', 'charlie', 'delta', 'echo'])
});
