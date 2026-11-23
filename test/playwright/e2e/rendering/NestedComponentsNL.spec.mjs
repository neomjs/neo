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
    const rootNode = page.locator(`[id="${root.id}"]`),
        nested     = leaves.find(leaf => leaf.properties.parentId === relay.id),
        direct     = leaves.find(leaf => leaf.properties.parentId === root.id),
        nestedNode = page.locator(`[id="${nested.id}"]`),
        directNode = page.locator(`[id="${direct.id}"]`),
        ids        = [relay.id, nested.id, direct.id];

    await expect(rootNode.locator('> p').first()).toHaveText(
        'Change the root values in the Inspector, then apply them. Each child keeps its own click count.'
    );
    await expect(rootNode.locator('h2, h3')).toHaveText([
        '1 · Functional root',
        '2 · Classic container',
        '2.1 · Functional child through the classic container',
        '3 · Direct functional child'
    ]);

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

/** @summary Verifies the functional button rests inside the stage at desktop and mobile sizes and increments badgeText on click. */
test('functional button rests in view at desktop and mobile widths and counts clicks in badgeText', async ({page, neuralLink}) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
    });

    await page.setViewportSize({width: 1440, height: 900});
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true, useServiceWorker: false}));
    await page.goto('/examples/functional/button/base/index.html');
    const app = await neuralLink.connectToApp('Neo.examples.functional.button.base');

    let btn, badgeField;
    await expect.poll(async () => {
        [btn]        = await app.queryComponent({ntype: 'functional-button'}, ['mounted', 'badgeText', 'text']);
        [badgeField] = await app.queryComponent({ntype: 'textfield', labelText: 'badgeText'}, ['mounted', 'value']);
        return !!btn?.properties.mounted && !!badgeField?.properties.mounted
    }).toBe(true);

    const buttonNode = page.locator(`[id="${btn.id}"]`),
        stageNode    = page.locator('.neo-workbench-stage');

    for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
        await page.setViewportSize(size);
        await expect.poll(async () => {
            const box    = await buttonNode.boundingBox(),
                stageBox = await stageNode.boundingBox();
            return !!box && !!stageBox &&
                box.x >= stageBox.x && box.y >= stageBox.y &&
                box.x + box.width <= stageBox.x + stageBox.width &&
                box.y + box.height <= stageBox.y + stageBox.height &&
                box.y + box.height <= size.height
        }).toBe(true)
    }

    expect(btn.properties.badgeText).toBe('0');
    await expect(buttonNode.locator('.neo-button-badge')).toHaveText('0');

    await buttonNode.click();
    await expect.poll(async () => app.getComponent(btn.id, ['badgeText'])).toEqual({badgeText: '1'});
    await expect.poll(async () => app.getComponent(badgeField.id, ['value'])).toEqual({value: '1'});
    await expect(buttonNode.locator('.neo-button-badge')).toHaveText('1');

    await buttonNode.click();
    await expect.poll(async () => app.getComponent(btn.id, ['badgeText'])).toEqual({badgeText: '2'});
    await expect.poll(async () => app.getComponent(badgeField.id, ['value'])).toEqual({value: '2'});
    await expect(buttonNode.locator('.neo-button-badge')).toHaveText('2');

    expect(errors).toEqual([])
});
