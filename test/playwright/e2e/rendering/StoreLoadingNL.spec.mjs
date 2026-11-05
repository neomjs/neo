import {expect, test} from '../../fixtures.mjs';

const rows = [1, 2, 3, 4].map(id => ({
    id, firstname: `Person ${id}`, lastname: 'Loading', isOnline: false,
    image: `ai_images/${String(id).padStart(6, '0')}.jpg`
}));

/** @summary Holds real example requests open while checking empty, progressive and hidden loading feedback. */
test.describe('Gallery and Helix loading feedback', () => {
    test.use({viewport: {width: 1400, height: 950}});

    for (const kind of ['gallery', 'helix']) {
        test(`${kind} keeps pending feedback visible without covering delivered rows`, async ({page, context, neuralLink}) => {
            let heldRequest;
            await context.route('**/resources/examples/data/ai_contacts.json*', route => { heldRequest = route });
            await neuralLink.routeConfig(page, config => ({...config, useAiClient: true, useServiceWorker: false}));
            await page.goto(`/examples/component/${kind}/index.html`);
            const app = await neuralLink.connectToApp(`Neo.examples.component.${kind}`);
            let view;

            await expect.poll(async () => {
                [view] = await app.queryComponent({ntype: kind}, ['store.id', 'store.pipeline.id', 'store.isLoadPending', 'parent.id', 'selectionModel.id', 'mounted']);
                return !!heldRequest && view?.properties.mounted && view.properties['store.isLoadPending']
            }).toBe(true);

            const root   = page.locator(`[id="${view.id}"]`), indicator = root.locator('.neo-store-load-mask'),
                  store  = view.properties['store.id'], pipeline = view.properties['store.pipeline.id'],
                  parent = view.properties['parent.id'];

            await expect(indicator).toBeVisible();
            await expect(root).toHaveAttribute('aria-busy', 'true');
            const fullMask = await indicator.boundingBox(), viewBox = await root.boundingBox();
            expect(fullMask.width).toBeGreaterThan(viewBox.width * .9);

            await app.setProperties(view.id, {maxItems: 4});
            // Two actual pipeline data notifications exercise progressive ingestion while the HTTP request remains open.
            await app.callMethod(pipeline, 'fire', ['data', rows.slice(0, 2)]);
            await app.callMethod(pipeline, 'fire', ['data', rows.slice(2)]);
            await expect(root.locator(`.neo-${kind}-item`)).toHaveCount(4);
            await expect(root).toHaveClass(/neo-store-loading-with-items/);
            await expect(indicator).toHaveCSS('pointer-events', 'none');
            await expect(indicator).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            expect((await indicator.boundingBox()).width).toBeLessThan(viewBox.width / 4);
            expect((await app.getComponent(view.id, ['store.isLoadPending']))['store.isLoadPending']).toBe(true);
            await app.callMethod(store, 'sort', [{property: 'id', direction: 'DESC'}]);
            await expect(indicator).toBeVisible();
            await expect(indicator.locator('.fa-spinner')).toBeVisible();
            await app.callMethod(view.properties['selectionModel.id'], 'deselectAll');
            const firstItem = root.locator(`.neo-${kind}-item`).first();
            await expect(firstItem).not.toHaveClass(/neo-selected/);
            await firstItem.click();
            await expect(firstItem).toHaveClass(/neo-selected/);

            await page.screenshot({path: test.info().outputPath(`${kind}-pending-rows.png`)});
            await app.setProperties(parent, {hideMode: 'visibility'});
            await app.callMethod(parent, 'hide');
            await expect(indicator).toBeHidden();
            await app.callMethod(parent, 'show');
            await expect(indicator).toBeVisible();
            await app.callMethod(parent, 'hide');
            await expect(indicator).toBeHidden();

            await heldRequest.fulfill({contentType: 'application/json', body: JSON.stringify(rows)});
            await expect.poll(async () => (await app.getComponent(view.id, ['store.isLoadPending']))['store.isLoadPending']).toBe(false);
            await app.callMethod(parent, 'show');
            await expect(root).toBeVisible();
            await expect(indicator).toHaveCount(0);
            await expect(root).not.toHaveAttribute('aria-busy');
            await expect(root.locator(`.neo-${kind}-item`)).toHaveCount(4)
        })
    }
});
