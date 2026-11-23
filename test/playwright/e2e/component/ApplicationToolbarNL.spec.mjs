import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Covers the JSON action source and the split button's independent primary and menu actions.
 */
test('the application toolbar loads JSON actions and keeps its split menu separate from the draft', async ({page, neuralLink}) => {
    await page.setViewportSize({width: 390, height: 844});
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto('/examples/toolbar/application/index.html');

    const status  = page.getByRole('status'),
          toolbar = page.locator('.neo-toolbar-application-actions'),
          draft   = page.locator('textarea');

    await expect(status).toHaveText('Toolbar ready');

    const app       = await neuralLink.connectToApp('Neo.examples.toolbar.application'),
          [editor]  = await app.queryComponent({className: 'Neo.form.field.TextArea'}, ['value']),
          initial   = editor.properties.value,
          heading   = `${initial}\n## Highlights`,
          readDraft = async () => (await app.queryComponent({id: editor.id}, ['value']))[0]?.properties.value;

    const buttons = toolbar.getByRole('button');

    await expect(buttons).toHaveCount(4);
    await expect.poll(() => buttons.evaluateAll(nodes => nodes.every(node => {
        const box = node.getBoundingClientRect();

        return box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= innerWidth &&
            node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    }))).toBe(true);

    await toolbar.getByRole('button', {name: 'Insert', exact: true}).click();
    await expect(draft).toHaveValue(heading);
    await expect.poll(readDraft).toBe(heading);

    await toolbar.getByRole('button', {name: 'Insert options', exact: true}).click();

    const checklist = page.getByText('Checklist item', {exact: true});

    await expect(checklist).toBeVisible();
    await expect(draft).toHaveValue(heading);
    await expect.poll(readDraft).toBe(heading);

    await checklist.click();
    await expect(status).toHaveText('Checklist item inserted');
    await expect(draft).toHaveValue(`${heading}\n- [ ] Confirm the release`);

    const monospace = toolbar.getByRole('button', {name: 'Monospace', exact: true});

    await monospace.click();
    await expect(monospace).toHaveAttribute('aria-pressed', 'true');
    await expect(draft).toHaveCSS('font-family', /monospace/);

    await toolbar.getByRole('button', {name: 'Clear', exact: true}).click();
    await expect(draft).toHaveValue('');
    await expect.poll(readDraft).toBeNull();

    await page.route('**/toolbar/application/resources/data/toolbar-items.json', async route => {
        const response = await route.fetch(),
              data     = await response.json();

        data.items.find(item => item.text === 'Clear').text = 'Wipe';

        await route.fulfill({response, json: data})
    });

    await page.reload();
    await expect(status).toHaveText('Toolbar ready');
    await expect(toolbar.getByRole('button', {name: 'Clear', exact: true})).toHaveCount(0);
    await expect(draft).toHaveValue(initial);
    await toolbar.getByRole('button', {name: 'Wipe', exact: true}).click();
    await expect(draft).toHaveValue('')
});
