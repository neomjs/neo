import {test, expect} from '@playwright/test';

const LIST = 'record-change-resort-list';

const appState = page => page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'observation'}), LIST);
const edit     = (page, changes) => page.evaluate(config => Neo.worker.App.setConfigs(config), {id: LIST, action: {changes}});
const domState = page => page.evaluate(id => [...document.getElementById(id).children]
    .map(node => ({id: node.id, transform: node.style.transform})), LIST);

/** @summary The DOM shows exactly what the App worker believes it shows: order and transform per item. */
async function expectDomFollowsVnode(page, label) {
    const app = await appState(page), dom = await domState(page), ids = nodes => nodes.map(node => node.id);

    expect(ids(app.vnode), `${label}: vnode follows vdom`).toEqual(ids(app.vdom));
    expect(ids(dom), `${label}: DOM order follows vnode`).toEqual(ids(app.vnode));
    expect(dom.map(node => node.transform), `${label}: DOM transforms follow vnode`).toEqual(app.vnode.map(node => node.transform))
}

/** @summary Collects page errors and console errors from every thread that reaches the page. */
function watchErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    page.on('console', message => message.type() === 'error' && errors.push(message.text()));
    return errors
}

test.beforeEach(async ({page}) => {
    await page.goto('/test/playwright/component/apps/record-change-resort/index.html');
    await expect(page.locator(`#${LIST} .neo-list-item`)).toHaveCount(9);
    await page.waitForTimeout(700)
});

test('an earlier listener re-sorting the edited record leaves one item per record', async ({page}) => {
    const errors = watchErrors(page);

    await edit(page, [[3, 1]]); // maryam drops a tier: index 6 -> 8

    const {lastVdomIds, order} = await appState(page);
    expect(order).toEqual([7, 1, 4, 5, 8, 2, 6, 9, 3]);
    expect(lastVdomIds, 'one item per record, in Store order').toEqual(order.map(id => `${LIST}__item-${id}`));

    await page.waitForTimeout(800);
    await expectDomFollowsVnode(page, 'settled');
    expect(errors).toEqual([])
});

test('a record that leaves and returns inside one transition settles where the vnode places it', async ({page}) => {
    const errors = watchErrors(page);

    await edit(page, [[3, 1]]);
    await page.waitForTimeout(150);
    await edit(page, [[3, 0]]);
    await page.waitForTimeout(900);

    await expectDomFollowsVnode(page, 'settled');
    expect(errors).toEqual([])
});
