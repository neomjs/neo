import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/container/PooledChildUnmount.spec.mjs
 * @summary Pooled instances whose rows leave the DOM inside a COVERING ancestor flight must end
 * unmounted, so that the next refill inserts their nodes instead of moving nodes that no longer exist.
 *
 * `syncVnodeTree` runs only for the component that receives a vnode. A pool whose update merged into
 * an ancestor's `updateDepth: -1` flight never receives one of its own, so before the fix its removed
 * pooled children kept `mounted: true` and a stale vnode; the refill then re-seated them by reference
 * and the tree builder sent placeholders for nodes the DOM no longer had — visibly, a list of EMPTY
 * rows after a settled-empty state. This is the same scenario as the unit reproducer, run through the
 * real workers and the real DOM: the pool's `<li>` rows and their nested text are the assertion.
 *
 * The fixture's reactive trigger configs are the spec's cross-worker RPC (`setConfigs` writes) and
 * `poolStateJson` the `getConfigs`-readable mirror of the pooled instances' lifecycle flags.
 */

const HOST_ID = 'pooled-host';

const readHost = async (page, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: HOST_ID, keys});

    return reply?.data ?? reply
};

const setHost = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: HOST_ID, ...configs}
);

const cards  = page => page.locator('li.pooled-card');
const inners = page => page.locator('li.pooled-card .pooled-card-inner');

const readPoolState = async page => {
    const [json] = await readHost(page, ['poolStateJson']);

    return JSON.parse(json)
};

const expectRefillRenders = async page => {
    await expect(cards(page)).toHaveCount(3);
    // the row content is what an empty `<li>` lacks — a placeholder for a departed node paints nothing
    await expect(inners(page)).toHaveCount(3);
    await expect(inners(page).nth(1)).toHaveText('card-1');

    const state = await readPoolState(page);

    expect(state.every(card => card.mounted && card.hasVnode && card.innerMounted)).toBe(true)
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/pooled-children/index.html');
    await page.waitForSelector(`#${HOST_ID}`, {state: 'attached'});
    await expect(cards(page)).toHaveCount(3);
    await expect(inners(page).nth(0)).toHaveText('card-0')
});

test.describe('pooled children removed inside a covering ancestor flight', () => {
    test('the pool emptied inside the flight unmounts its pooled children, and the refill renders them again', async ({page}) => {
        await setHost(page, {clearInsideFlightCount: 1});
        await expect(cards(page)).toHaveCount(0);

        const state = await readPoolState(page);

        // the rows left the DOM through the ancestor's flight — every pooled instance must know
        expect(state.every(card => !card.mounted && !card.hasVnode && !card.innerMounted), JSON.stringify(state)).toBe(true);

        await setHost(page, {refillCount: 1});
        await expectRefillRenders(page)
    });

    test('CONTROL: the pool emptied by its own update behaves the same', async ({page}) => {
        await setHost(page, {clearAloneCount: 1});
        await expect(cards(page)).toHaveCount(0);

        const state = await readPoolState(page);

        expect(state.every(card => !card.mounted && !card.hasVnode && !card.innerMounted), JSON.stringify(state)).toBe(true);

        await setHost(page, {refillCount: 1});
        await expectRefillRenders(page)
    });

    test('a second round trip through the covering flight renders as well', async ({page}) => {
        await setHost(page, {clearInsideFlightCount: 1});
        await expect(cards(page)).toHaveCount(0);
        await setHost(page, {refillCount: 1});
        await expectRefillRenders(page);

        await setHost(page, {clearInsideFlightCount: 2});
        await expect(cards(page)).toHaveCount(0);
        await setHost(page, {refillCount: 2});
        await expectRefillRenders(page)
    });
});
