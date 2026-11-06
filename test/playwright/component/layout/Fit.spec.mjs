import {test, expect} from '@playwright/test';

let containerId;

const CHILD_ID = 'fit-layout-child';

/**
 * @summary Mounts a fixed-size container through the real App Worker and waits for its child to render.
 * @param {Object} page
 * @param {Object[]} items
 * @returns {Promise<Object>} The mounted container's locator.
 */
async function mountFit(page, items=[{id: CHILD_ID, ntype: 'component', html: 'Fit child'}]) {
    const result = await page.evaluate(items => Neo.worker.App.createNeoInstance({
        importPath: '../container/Base.mjs',
        ntype     : 'container',
        parentId  : 'component-test-viewport',
        height    : 200,
        layout    : 'fit',
        width     : 300,
        items
    }), items);

    expect(result.success, JSON.stringify(result)).toBe(true);
    containerId = result.id;

    await expect(page.locator(`#${CHILD_ID}`)).toBeVisible();
    return page.locator(`#${containerId}`)
}

test.beforeEach(async ({page}) => {
    containerId = null;
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await expect(page.locator('#component-test-viewport')).toBeAttached()
});

test.afterEach(async ({page}) => {
    if (containerId) {
        const result = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), containerId);
        expect(result.success, JSON.stringify(result)).toBe(true);
        await expect(page.locator(`#${containerId}`)).toHaveCount(0)
    }
});

test.describe('Neo.layout.Fit', () => {
    test('the child fills the rendered 300 by 200 container', async ({page}) => {
        const container = await mountFit(page), child = page.locator(`#${CHILD_ID}`);

        await expect(container).toContainClass('neo-layout-fit');
        await expect(child).toContainClass('neo-layout-fit-item');
        await expect.poll(async () => {
            const parentBox = await container.boundingBox(), childBox = await child.boundingBox();
            return parentBox && childBox && {
                parent: [parentBox.width, parentBox.height],
                child : [childBox.width, childBox.height],
                offset: [childBox.x - parentBox.x, childBox.y - parentBox.y]
            }
        }).toEqual({parent: [300, 200], child: [300, 200], offset: [0, 0]})
    });

    test('the child keeps its own class beside the layout class', async ({page}) => {
        await mountFit(page, [{id: CHILD_ID, ntype: 'component', cls: ['x'], html: 'Custom class'}]);

        const child = page.locator(`#${CHILD_ID}`);
        await expect(child).toContainClass('x');
        await expect(child).toContainClass('neo-layout-fit-item')
    });

    test('a second child that ignores the layout receives no fit-item class', async ({page}) => {
        await mountFit(page, [
            {id: CHILD_ID, ntype: 'component', html: 'Managed child'},
            {id: 'fit-layout-ignored-child', ntype: 'component', ignoreLayout: true, html: 'Ignored child'}
        ]);

        await expect(page.locator(`#${CHILD_ID}`)).toContainClass('neo-layout-fit-item');
        const ignored = page.locator('#fit-layout-ignored-child');
        await expect(ignored).toBeAttached();
        await expect(ignored).not.toContainClass('neo-layout-fit-item')
    });

    test('switching to vbox removes the fit classes from container and child', async ({page}) => {
        const container = await mountFit(page), child = page.locator(`#${CHILD_ID}`);
        await expect(container).toContainClass('neo-layout-fit');
        await expect(child).toContainClass('neo-layout-fit-item');

        await page.evaluate(id => Neo.worker.App.setConfigs({id, layout: {ntype: 'vbox'}}), containerId);

        await expect(container).toHaveCSS('flex-direction', 'column');
        await expect(container).not.toContainClass('neo-layout-fit');
        await expect(child).not.toContainClass('neo-layout-fit-item')
    })
});
