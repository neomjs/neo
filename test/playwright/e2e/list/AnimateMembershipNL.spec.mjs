import {test, expect} from '../../fixtures.mjs';
import {writeFile}    from 'node:fs/promises';

const records = () => [
    {id: 1, name: 'echo', online: true},
    {id: 2, name: 'bravo', online: false},
    {id: 3, name: 'delta', online: true},
    {id: 4, name: 'alpha', online: false},
    {id: 5, name: 'charlie', online: true}
];

/** @summary Retains a native trace even when a later motion assertion fails. */
async function attachTrace(testInfo, name, value) {
    const path = testInfo.outputPath(`${name}.json`);
    await writeFile(path, JSON.stringify(value));
    await testInfo.attach(name, {path, contentType: 'application/json'})
}

/** @summary Records live row identities and computed presentation, including newly created DOM nodes. */
async function sample(page, listId, action) {
    await page.evaluate(id => {
        window.membershipMotion = {started: performance.now(), samples: []};
        const frame = () => {
            const state = window.membershipMotion, time = performance.now() - state.started;
            state.samples.push({time, items: [...(Neo.main.DomAccess.getElement(id)?.querySelectorAll('.neo-list-item') || [])].map(node => {
                const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
                return {id: node.id, name: node.textContent.trim().replace(/probe$/, ''), x: rect.x, y: rect.y,
                    opacity: Number(style.opacity), transition: style.transition,
                    visible: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth}
            })});
            if (time < 1100) requestAnimationFrame(frame);
            else state.done = true
        };
        frame()
    }, listId);
    await page.waitForTimeout(100);
    await action();
    await page.waitForFunction(() => window.membershipMotion.done);
    return page.evaluate(() => window.membershipMotion.samples)
}

test('native membership follows attribute-addressed DOM and remounts', async ({page, neuralLink}, testInfo) => {
    const listId = 'indexed-sort-list', storeId = 'indexed-sort-store', selector = `[data-neo-id="${listId}"]`;
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true, useDomIds: false, useDomApiRenderer: false}));
    await page.goto('/test/playwright/component/apps/animated-sort/index.html');
    await expect(page.locator(`${selector} .neo-list-item`)).toHaveCount(5);
    const app = await neuralLink.connectToApp('AnimatedSortTestApp');
    await page.waitForFunction(id => Neo.main.addon.ListMotion?.owners.has(id), listId);
    await app.callMethod(listId, 'promiseUpdate');
    await expect.poll(() => page.locator(selector).evaluate(node => node.getAnimations({subtree: true}).length)).toBe(0);

    const firstToken = await page.evaluate(id => Neo.main.addon.ListMotion.owners.get(id).token, listId);
    const insert     = await sample(page, listId, () => app.callMethod(storeId, 'insert', [0, {id: 6, name: 'newcomer', online: true}]));
    await attachTrace(testInfo, 'attribute-addressed-insert', insert);
    expect(Math.min(...trajectory(insert, 'newcomer').map(item => item.opacity))).toBeLessThan(0.2);
    assertGlide(insert, 'echo', insert[0].items[1]);

    await app.callMethod(listId, 'unmount');
    await expect(page.locator(selector)).toHaveCount(0);
    await page.waitForFunction(id => !Neo.main.addon.ListMotion.owners.has(id), listId);
    await app.callMethod(listId, 'mount');
    await expect(page.locator(`${selector} .neo-list-item`)).toHaveCount(6);
    await page.waitForFunction(({id, token}) => {
        const state = Neo.main.addon.ListMotion.owners.get(id);
        return state && state.token !== token
    }, {id: listId, token: firstToken});
    const remove = await sample(page, listId, () => app.callMethod(storeId, 'remove', [6]));
    await attachTrace(testInfo, 'remounted-remove', remove);
    assertGlide(remove, 'echo', remove[0].items[0]);
    expect((await app.inspectStore(storeId)).items.map(item => item.id)).toEqual([1, 2, 3, 4, 5])
});

/** @summary Reads one record's trajectory across physical wrapper changes in an index pool. */
function trajectory(samples, name) {
    return samples.flatMap(frame => frame.items.filter(item => item.name === name).map(item => ({...item, time: frame.time})))
}

/** @summary Requires intermediate native positions and verifies the final slot independently of worker targets. */
function assertGlide(samples, name, target) {
    const frames = trajectory(samples, name);
    expect(frames.some(item => item.visible), `${name} is observed in the viewport`).toBe(true);
    expect(new Set(frames.map(item => `${item.x.toFixed(1)},${item.y.toFixed(1)}`)).size, `${name} moves through intermediate frames`).toBeGreaterThan(5);
    expect(Math.hypot(frames.at(-1).x - target.x, frames.at(-1).y - target.y)).toBeLessThan(1)
}

/** @summary Rejects a destination jump using the fixture's distance and transition duration as the speed bound. */
function assertContinuous(samples, names, easingFactor = 1.5) {
    const all    = samples.flatMap(frame => frame.items),
        diagonal = Math.hypot(Math.max(...all.map(item => item.x)) - Math.min(...all.map(item => item.x)),
            Math.max(...all.map(item => item.y)) - Math.min(...all.map(item => item.y)));
    names.forEach(name => {
        const frames = trajectory(samples, name);
        frames.slice(1).forEach((frame, index) => {
            const prior = frames[index], distance = Math.hypot(frame.x - prior.x, frame.y - prior.y);
            expect(distance, `${name} stays continuous through each interruption`).toBeLessThanOrEqual((frame.time - prior.time) * diagonal / 500 * easingFactor + 2)
        })
    })
}

for (const kind of ['ordinary', 'keyed', 'indexed']) {
    test(`${kind} animated list paints entry and removal reflow`, async ({page, neuralLink}, testInfo) => {
        test.setTimeout(60000);
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        const ordinary = kind === 'ordinary';
        await page.goto(ordinary ? '/examples/list/animate/index.html' : '/test/playwright/component/apps/animated-sort/index.html');
        await expect(page.locator('.neo-list-item').first()).toBeVisible();
        const app = await neuralLink.connectToApp(ordinary ? 'Neo.examples.list.animate' : 'AnimatedSortTestApp');
        let listId, storeId;
        if (ordinary) {
            const [list] = await app.queryComponent({className: 'Neo.examples.list.animate.List'}, ['id']);
            listId = list.id;
            const store = await app.getComponent(listId, ['store']);
            storeId = store.store.id;
            await expect.poll(async () => (await app.getComponent(storeId, ['isLoadPending'])).isLoadPending).toBe(false)
        } else {
            listId = kind === 'indexed' ? 'indexed-sort-list' : 'animated-sort-list';
            storeId = kind === 'indexed' ? 'indexed-sort-store' : 'animated-sort-store'
        }
        const plugin = await app.callMethod(listId, 'getPlugin', ['list-animate']);
        const row    = record => ordinary ? {id: record.id, firstname: record.name, lastname: 'probe', isOnline: record.online, image: 'ai_images/000001.jpg'} : record;
        const reset  = async () => {
            await app.callMethod(storeId, 'set', [{filters: [], sorters: []}]);
            await app.callMethod(storeId, 'clear');
            await app.callMethod(storeId, 'add', [records().map(row)]);
            await expect(page.locator(`#${listId} .neo-list-item`)).toHaveCount(5);
            await page.locator(`#${listId}`).scrollIntoViewIfNeeded();
            await expect.poll(() => app.getComponent(plugin.id, ['pendingFilter', 'transitionTimeoutId']))
                .toEqual({pendingFilter: false, transitionTimeoutId: null});
            await app.callMethod(listId, 'promiseUpdate');
            await expect.poll(() => page.locator(`#${listId}`).evaluate(node =>
                node.getAnimations({subtree: true}).filter(animation => animation.playState === 'running').length)).toBe(0)
        };
        await reset();
        const control = await sample(page, listId, () => app.callMethod(storeId, 'set', [{sorters: [{property: ordinary ? 'firstname' : 'name', direction: 'ASC'}]}]));
        expect(new Set(trajectory(control, 'alpha').map(item => `${item.x},${item.y}`)).size, 'sort is a known-moving control').toBeGreaterThan(5);

        await reset();
        const before = ordinary ? null : (await app.getComponent(listId, ['observation'])).observation;
        if (kind === 'indexed') {
            await page.locator(`#${listId} .neo-list-item`).filter({hasText: 'bravo'}).evaluate(node => {
                node.style.setProperty('transition', 'opacity 2s linear, transform 500ms linear', 'important');
                node.style.setProperty('opacity', '0.6', 'important')
            })
        }
        const insert = await sample(page, listId, () => app.callMethod(storeId, 'insert', [0, row({id: 6, name: 'newcomer', online: true})]));
        await attachTrace(testInfo, 'insert', insert);
        const entering = trajectory(insert, 'newcomer');
        expect(Math.min(...entering.map(item => item.opacity))).toBeLessThan(0.2);
        expect(Math.max(...entering.map(item => item.opacity))).toBeGreaterThan(0.8);
        assertGlide(insert, 'echo', insert[0].items[1]);
        const inserted = await app.inspectStore(storeId);
        expect(inserted.items.map(item => item.id)).toEqual([6, 1, 2, 3, 4, 5]);
        if (before) {
            const after = (await app.getComponent(listId, ['observation'])).observation;
            if (kind === 'indexed') expect(after.cards.slice(0, 5).map(card => card.instanceTag)).toEqual(before.cards.map(card => card.instanceTag));
            else before.cards.forEach(card => expect(after.cards.find(item => item.recordId === card.recordId).instanceTag).toBe(card.instanceTag))
        }
        if (kind === 'indexed') {
            expect(await page.locator(`#${listId} .neo-list-item`).filter({hasText: 'echo'}).evaluate(node => ({
                transition: node.style.transition, priority: node.style.getPropertyPriority('transition'), opacity: getComputedStyle(node).opacity
            }))).toEqual({transition: 'opacity 2s linear, transform 500ms linear', priority: 'important', opacity: '0.6'})
            await page.locator(`#${listId} .neo-list-item`).filter({hasText: 'echo'}).evaluate(node => {
                node.style.removeProperty('transition');
                node.style.removeProperty('opacity')
            })
        }

        await reset();
        const remove = await sample(page, listId, () => app.callMethod(storeId, 'remove', [2]));
        await attachTrace(testInfo, 'remove', remove);
        assertGlide(remove, 'delta', remove[0].items[1]);
        await expect(page.locator(`#${listId} .neo-list-item`)).toHaveCount(4);
        expect((await app.inspectStore(storeId)).items.map(item => item.id)).toEqual([1, 3, 4, 5]);
        let rapid;
        if (kind === 'indexed') {
            await reset();
            const cardId = (await app.getComponent(listId, ['observation'])).observation.cards[1].id;
            await page.locator(`#${cardId}`).focus();
            await page.evaluate(id => { window.focusedPoolCard = document.getElementById(id) }, cardId);
            rapid = await sample(page, listId, async () => {
                await app.callMethod(storeId, 'insert', [0, row({id: 6, name: 'newcomer', online: true})]);
                await page.waitForTimeout(180);
                await app.callMethod(storeId, 'remove', [2]);
                await page.waitForTimeout(130);
                await app.callMethod(storeId, 'insert', [0, row({id: 7, name: 'latest', online: true})])
            });
            assertContinuous(rapid, ['echo', 'delta', 'charlie']);
            expect((await app.inspectStore(storeId)).items.map(item => item.id)).toEqual([7, 6, 1, 3, 4, 5]);
            expect(await page.evaluate(() => document.activeElement === window.focusedPoolCard)).toBe(true);
            await page.locator(`#${listId} .neo-list-item`).filter({hasText: 'delta'}).click();
            expect((await app.getComponent(listId, ['observation'])).observation.selection).toContain(`${listId}__3`)

            const meta        = await app.callMethod(listId, 'getVdomUpdateMeta');
            const failedBatch = await page.evaluate(({id, meta}) => {
                const addon = Neo.main.addon.ListMotion, state = addon.owners.get(id),
                    markers = () => [...document.getElementById(meta.listMotion.rootId).children].map(node => node.getAttribute('data-neo-list-record')),
                    before  = {token: state.token, effects: state.animations.size, items: JSON.stringify(markers())};
                let threw = false;
                try {
                    Neo.main.DeltaUpdates.update({deltas: [{action: 'invalidMembershipProbe'}],
                        meta: {[id]: meta}})
                } catch {
                    threw = true
                }
                return {threw, unchanged: state.token === before.token && state.animations.size === before.effects && JSON.stringify(markers()) === before.items}
            }, {id: listId, meta});
            expect(failedBatch).toEqual({threw: true, unchanged: true});
            await app.callMethod(listId, 'promiseUpdate')
        }
        const mixed = {};
        for (const first of ['sort', 'insert']) {
            await reset();
            const actions = {
                sort  : () => app.callMethod(storeId, 'set', [{sorters: [{property: ordinary ? 'firstname' : 'name', direction: 'ASC'}]}]),
                insert: () => app.callMethod(storeId, 'insert', [0, row({id: 6, name: 'newcomer', online: true})])
            };
            mixed[first] = await sample(page, listId, async () => {
                await actions[first]();
                await page.waitForTimeout(180);
                await actions[first === 'sort' ? 'insert' : 'sort']()
            });
            await attachTrace(testInfo, `mixed-${first}`, mixed[first]);
            assertContinuous(mixed[first], ['echo', 'delta', 'charlie'], ordinary ? 2.5 : 1.5);
            expect((await app.inspectStore(storeId)).items.map(item => item.id)).toEqual([4, 2, 5, 3, 1, 6])
        }
        await attachTrace(testInfo, 'membership-motion', {kind, browser: page.context().browser().version(), control, insert, remove, rapid, mixed});
        await testInfo.attach('visible-final', {body: await page.screenshot(), contentType: 'image/png'});

        await reset();
        await app.callMethod(storeId, 'insert', [0, row({id: 6, name: 'newcomer', online: true})]);
        await page.waitForFunction(id => Neo.main.addon.ListMotion.owners.get(id).animations.size > 0, listId);
        await page.emulateMedia({reducedMotion: 'reduce'});
        await expect.poll(() => page.evaluate(id => Neo.main.addon.ListMotion.owners.get(id).animations.size, listId)).toBe(0);
        await page.emulateMedia({reducedMotion: 'no-preference'});
        await app.callMethod(storeId, 'insert', [0, row({id: 7, name: 'latest', online: true})]);
        await page.waitForFunction(id => Neo.main.addon.ListMotion.owners.get(id).animations.size > 0, listId);
        await app.callMethod(listId, 'destroy');
        await page.waitForFunction(id => !Neo.main.addon.ListMotion.owners.has(id), listId)
    })
}
