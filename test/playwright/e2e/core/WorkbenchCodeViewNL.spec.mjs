import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Waits until the configuration panel's `text` field exists in the App worker and returns its id.
 * @param {Object} app The connected Neural Link app.
 * @returns {Promise<String>}
 */
async function findTextField(app) {
    let fields = [];

    await expect.poll(async () => {
        fields = [].concat(await app.queryComponent({ntype: 'textfield', labelText: 'text'}, ['id']) ?? []);
        return fields.length
    }, {message: 'the configuration panel renders its text field', timeout: 15000}).toBeGreaterThan(0);

    return fields[0].id
}

test.describe('Workbench Code View (Stage + Inspector + Live Diff + Copy)', () => {
    test('workbench code view tracks changed configs, copies matching Neo config text, and clears on Reset', async ({context, neuralLink, page}) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/examples/button/base/index.html');

        const app        = await neuralLink.connectToApp('Neo.examples.button.base'),
              codeView   = page.locator('.neo-workbench-code-content'),
              copyButton = page.locator('.neo-button-copy-code'),
              exampleBtn = page.locator('.neo-example-container .neo-button').first();

        await expect(exampleBtn).toBeVisible({timeout: 15000});
        await expect(codeView).toBeVisible({timeout: 15000});
        await expect(codeView).toHaveText('{\n    module: Neo.button.Base\n}');

        await page.getByText('bottom-left', {exact: true}).click();

        const textFieldId = await findTextField(app),
              textInput   = page.locator(`#${textFieldId} input`);

        await textInput.fill('Save changes');
        await textInput.press('Enter');

        const btnId    = await exampleBtn.getAttribute('id'),
              btnProps = await app.getComponent(btnId, ['badgePosition', 'text']);

        expect(btnProps).toEqual({
            badgePosition: 'bottom-left',
            text         : 'Save changes'
        });

        await expect(codeView).toContainText('module');
        await expect(codeView).toContainText("badgePosition: 'bottom-left'");
        await expect(codeView).toContainText("text         : 'Save changes'");

        const displayedCode = await codeView.textContent();

        expect(displayedCode).not.toContain('iconCls');
        expect(displayedCode).not.toContain('menu');
        expect(displayedCode).not.toContain('wrapperStyle');

        await copyButton.click();

        await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()), {
            message: 'clipboard receives the displayed Neo config text',
            timeout: 10000
        }).toBe(displayedCode);

        await page.getByRole('button', {name: 'Reset', exact: true}).click();

        await expect(codeView).toHaveText('{\n    module: Neo.button.Base\n}');
    });

    test('at 390x844 mobile viewport the code view keeps the stage on the first screen', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto('/examples/form/field/text/index.html');

        const stage     = page.locator('.neo-workbench-stage'),
              body      = page.locator('.neo-configuration-panel-body'),
              codePanel = page.locator('.neo-workbench-code-panel');

        await expect(stage).toBeVisible({timeout: 15000});
        await expect(body).toBeVisible({timeout: 15000});
        await expect(codePanel).toBeVisible({timeout: 15000});

        const stageBox = await stage.boundingBox(),
              codeBox  = await codePanel.boundingBox();

        expect(stageBox).toBeTruthy();
        expect(codeBox).toBeTruthy();

        expect(stageBox.y).toBeGreaterThanOrEqual(0);
        expect(stageBox.height).toBeGreaterThanOrEqual(220);
        expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(400);

        expect(codeBox.height).toBeGreaterThan(40);
        expect(codeBox.y + codeBox.height).toBeLessThanOrEqual(844);
    });
});
