import {expect, test} from '../../fixtures.mjs';

/** @summary Exercises the real mixed-nesting example through visible controls, retained state and owned teardown. */
test('nested functional and classic components propagate root state without replacing children', async ({page, neuralLink}) => {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true, useServiceWorker: false}));
    await page.goto('/examples/functional/nestedComponents/index.html');
    const app  = await neuralLink.connectToApp('Neo.examples.functional.nestedComponents'),
        prefix = 'Neo.examples.functional.nestedComponents.';
    let root, relay, leaves;

    await expect.poll(async () => {
        [root] = await app.queryComponent({className: prefix + 'Component'}, ['mounted', 'value', 'message', 'parentId']);
        [relay] = await app.queryComponent({className: prefix + 'RelayContainer'}, ['mounted', 'parentId']);
        leaves = await app.queryComponent({className: prefix + 'CounterComponent'}, ['mounted', 'parentId']);
        return !!root?.properties.mounted && !!relay?.properties.mounted && leaves.length === 2 &&
            leaves.every(leaf => leaf.properties.mounted)
    }).toBe(true);
    expect(relay.properties.parentId).toBe(root.id);
    const nested   = leaves.find(leaf => leaf.properties.parentId === relay.id),
        direct     = leaves.find(leaf => leaf.properties.parentId === root.id),
        nestedNode = page.locator(`[id="${nested.id}"]`),
        directNode = page.locator(`[id="${direct.id}"]`),
        ids        = [relay.id, nested.id, direct.id];

    for (const id of ids) {
        await page.locator(`[id="${id}"]`).evaluate(node => { node.dataset.instanceWitness = 'retained' })
    }
    await nestedNode.getByRole('button', {name: 'Local clicks: 0', exact: true}).click();
    await nestedNode.getByRole('button', {name: 'Local clicks: 1', exact: true}).click();
    await directNode.getByRole('button', {name: 'Local clicks: 0', exact: true}).click();

    const [valueField] = await app.queryComponent({ntype: 'numberfield', labelText: 'Value'}),
        [messageField] = await app.queryComponent({ntype: 'textfield', labelText: 'Message'});
    await page.locator(`[id="${valueField.id}"] input`).fill('8');
    await page.locator(`[id="${messageField.id}"] input`).fill('Updated from root');
    await page.getByRole('button', {name: 'Apply root values', exact: true}).click();

    for (const id of [root.id, ...ids]) {
        await expect.poll(async () => app.getComponent(id, ['value', 'message']))
            .toEqual({value: 8, message: 'Updated from root'})
    }
    for (const node of [nestedNode, directNode]) {
        await expect(node.locator('.child-value')).toHaveText('Value: 8');
        await expect(node.locator('.child-message')).toHaveText('Message: Updated from root')
    }
    for (const id of ids) {
        await expect(page.locator(`[id="${id}"]`)).toHaveAttribute('data-instance-witness', 'retained')
    }
    await expect(nestedNode.getByRole('button')).toHaveText('Local clicks: 2');
    await expect(directNode.getByRole('button')).toHaveText('Local clicks: 1');
    await nestedNode.getByRole('button').click();
    await directNode.getByRole('button').click();
    await expect(nestedNode.getByRole('button')).toHaveText('Local clicks: 3');
    await expect(directNode.getByRole('button')).toHaveText('Local clicks: 2');
    await page.screenshot({path: test.info().outputPath('nested-components-updated.png')});

    const buttons    = await app.queryComponent({ntype: 'button'}, ['parentId']),
        ownedButtons = buttons.filter(button => [nested.id, direct.id].includes(button.properties.parentId));
    expect(ownedButtons).toHaveLength(2);
    const owner = await app.getComponent(root.properties.parentId, ['items']);
    expect(owner.items.map(item => item.id)).toEqual([root.id]);
    await app.callMethod(root.properties.parentId, 'removeAt', [0]);
    for (const id of [root.id, ...ids, ...ownedButtons.map(button => button.id)]) {
        await expect(page.locator(`[id="${id}"]`)).toHaveCount(0);
        expect(await app.queryComponent({id})).toEqual([])
    }
});
