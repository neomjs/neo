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
    test('workbench code view shows the authored config, tracks changed configs, copies matching Neo config text, and returns to the authored config on Reset', async ({context, neuralLink, page}) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/examples/button/base/index.html');

        const app        = await neuralLink.connectToApp('Neo.examples.button.base'),
              codeView   = page.locator('.neo-workbench-code-content'),
              copyButton = page.locator('.neo-button-copy-code'),
              exampleBtn = page.locator('.neo-example-container .neo-button').first();

        await expect(exampleBtn).toBeVisible({timeout: 15000});
        await expect(codeView).toBeVisible({timeout: 15000});
        // The config the example wrote: its menu stays, each handler a comment line
        await expect(codeView).toContainText(/text\s*: 'Hello World'/);
        await expect(codeView).toContainText('menu');
        await expect(codeView).toContainText('// handler: a function, not shown');

        const authoredCode = await codeView.textContent();

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

        expect(displayedCode).not.toContain('Hello World');
        expect(displayedCode).toContain('iconCls');
        expect(displayedCode).not.toContain('wrapperStyle');

        await copyButton.click();

        await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()), {
            message: 'clipboard receives the displayed Neo config text',
            timeout: 10000
        }).toBe(displayedCode);

        await page.getByRole('button', {name: 'Reset', exact: true}).click();

        await expect(codeView).toHaveText(authoredCode);
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

    test('workbench persists changed configs in the URL hash across page reload and clears URL state on Reset', async ({neuralLink, page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.goto('/examples/button/base/index.html?theme=neo-theme-neo-dark');

        let app        = await neuralLink.connectToApp('Neo.examples.button.base'),
            codeView   = page.locator('.neo-workbench-code-content'),
            exampleBtn = page.locator('.neo-example-container .neo-button').first();

        await expect(exampleBtn).toBeVisible({timeout: 15000});
        await expect(codeView).toContainText(/text\s*: 'Hello World'/);

        const authoredCode = await codeView.textContent();

        await page.getByText('bottom-left', {exact: true}).click();

        const textFieldId = await findTextField(app),
              textInput   = page.locator(`#${textFieldId} input`);

        await textInput.fill('Bookmark me');
        await textInput.press('Enter');

        await expect.poll(() => new URL(page.url()).hash, {
            message: 'URL hash reflects changed workbench configs',
            timeout: 10000
        }).toBe('#badgePosition=bottom-left&text=Bookmark%20me');

        // Query string (?theme=...) stays intact while hash updates via replaceState
        expect(new URL(page.url()).search).toBe('?theme=neo-theme-neo-dark');

        // Reload the page at the resulting URL and confirm full restoration across component, controls, and Code View
        await page.reload();

        app        = await neuralLink.connectToApp('Neo.examples.button.base');
        codeView   = page.locator('.neo-workbench-code-content');
        exampleBtn = page.locator('.neo-example-container .neo-button').first();

        await expect(exampleBtn).toBeVisible({timeout: 15000});
        await expect(codeView).toContainText("badgePosition: 'bottom-left'");
        await expect(codeView).toContainText("text         : 'Bookmark me'");

        const btnId    = await exampleBtn.getAttribute('id'),
              btnProps = await app.getComponent(btnId, ['badgePosition', 'text']);

        expect(btnProps).toEqual({
            badgePosition: 'bottom-left',
            text         : 'Bookmark me'
        });

        const reloadedTextFieldId = await findTextField(app),
              reloadedTextField   = await app.getComponent(reloadedTextFieldId, ['value']),
              bottomLeftRadioId   = [].concat(await app.queryComponent({ntype: 'radiofield', valueLabel: 'bottom-left'}, ['id']) ?? [])[0]?.id,
              topRightRadioId     = [].concat(await app.queryComponent({ntype: 'radiofield', valueLabel: 'top-right'}, ['id']) ?? [])[0]?.id,
              bottomLeftRadio     = await app.getComponent(bottomLeftRadioId, ['checked']),
              topRightRadio       = await app.getComponent(topRightRadioId, ['checked']);

        expect(reloadedTextField.value).toBe('Bookmark me');
        expect(bottomLeftRadio.checked).toBe(true);
        expect(topRightRadio.checked).toBe(false);
        await expect(page.locator(`#${bottomLeftRadioId} input`)).toBeChecked();

        // Reset clears the URL hash cleanly without leaving a trailing '#' and restores defaults
        await page.getByRole('button', {name: 'Reset', exact: true}).click();

        await expect.poll(() => page.url(), {
            message: 'Reset clears the URL hash while preserving search params',
            timeout: 10000
        }).toMatch(/\/examples\/button\/base\/index\.html\?theme=neo-theme-neo-dark$/);

        await expect(codeView).toHaveText(authoredCode);

        const resetBtnProps  = await app.getComponent(btnId, ['badgePosition', 'text']),
              resetTextProps = await app.getComponent(reloadedTextFieldId, ['value']);

        expect(resetBtnProps).toEqual({
            badgePosition: 'top-right',
            text         : 'Hello World'
        });
        expect(resetTextProps.value).toBe('Hello World');
        expect(pageErrors).toEqual([]);
    });

    test('workbench restores valid entries beside malformed URI hash tokens on fresh load and live hash navigation', async ({neuralLink, page}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.goto('/examples/list/base/index.html?theme=neo-theme-neo-dark#bad=%E0%A4%A&width=180');

        const app         = await neuralLink.connectToApp('Neo.examples.list.base'),
              exampleList = page.locator('.neo-example-container .neo-list').first();

        await expect(exampleList).toBeVisible({timeout: 15000});

        const listId       = await exampleList.getAttribute('id'),
              widthFieldId = [].concat(await app.queryComponent({ntype: 'numberfield', labelText: 'width'}, ['id']) ?? [])[0]?.id;

        expect(await app.getComponent(listId, ['width'])).toEqual({width: 180});
        expect(await app.getComponent(widthFieldId, ['value'])).toEqual({value: 180});

        await page.evaluate(() => {
            window.location.hash = '#%E0%A4%A=broken&width=205';
        });

        await expect.poll(async () => (await app.getComponent(listId, ['width'])).width, {
            message: 'live hash change with malformed sibling entry still applies valid width',
            timeout: 10000
        }).toBe(205);

        expect(await app.getComponent(widthFieldId, ['value'])).toEqual({value: 205});
        expect(pageErrors).toEqual([]);
    });
});

/**
 * @summary Installs hermetic stubs for third-party CDN/API requests made by MWC, Video, and RealWorld Process examples,
 * then opens each workbench route in the batch and verifies stage + example component + inspector render error-free.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} routes
 */
async function smokeWorkbenchBatch(page, routes) {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(`${page.url()}: ${err.message}`));

    await page.route('**/big-buck-bunny-trailer.mp4*', route => route.abort());
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({
        body       : JSON.stringify({current_weather: {temperature: 18.4}}),
        contentType: 'application/json',
        status     : 200
    }));
    await page.route('https://unpkg.com/**', route => route.fulfill({
        body       : 'export {};',
        contentType: 'application/javascript',
        status     : 200
    }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
        body       : '',
        contentType: 'text/css',
        status     : 200
    }));

    await page.setViewportSize({width: 1280, height: 800});

    for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('.neo-workbench-stage'), `${route} stage`).toBeVisible({timeout: 15000});
        await expect(page.locator('.neo-workbench-inspector'), `${route} inspector`).toBeVisible({timeout: 15000});
        await expect(page.locator('.neo-example-container > *').first(), `${route} example component`).toBeAttached({timeout: 15000});
    }

    expect(pageErrors).toEqual([]);
}

test.describe('Workbench config-return smoke across all 37 converted examples (#22068)', () => {
    test('batch 1 (buttons & core components 1-10)', async ({page}) => {
        await smokeWorkbenchBatch(page, [
            '/examples/button/effect/index.html',
            '/examples/button/split/index.html',
            '/examples/component/canvas/index.html',
            '/examples/component/carousel/index.html',
            '/examples/component/chip/index.html',
            '/examples/component/circle/index.html',
            '/examples/component/clock/index.html',
            '/examples/component/dateSelector/index.html',
            '/examples/component/mwc/button/index.html',
            '/examples/component/mwc/textField/index.html'
        ]);
    });

    test('batch 2 (process, media, monaco & containers 11-20)', async ({page}) => {
        await smokeWorkbenchBatch(page, [
            '/examples/component/process/index.html',
            '/examples/component/process/realWorldExample/index.html',
            '/examples/component/progress/index.html',
            '/examples/component/statusbadge/index.html',
            '/examples/component/timer/index.html',
            '/examples/component/video/index.html',
            '/examples/component/wrapper/monacoEditor/index.html',
            '/examples/container/accordion/index.html',
            '/examples/container/fragment/index.html',
            '/examples/date/selectorContainer/index.html'
        ]);
    });

    test('batch 3 (fields, functional, layouts & lists 21-30, including circle sort)', async ({page}) => {
        await smokeWorkbenchBatch(page, [
            '/examples/form/field/picker/index.html',
            '/examples/form/fieldset/index.html',
            '/examples/functional/button/base/index.html',
            '/examples/layout/card/index.html',
            '/examples/layout/cube/index.html',
            '/examples/layout/form/index.html',
            '/examples/list/buffered/index.html',
            '/examples/list/chip/index.html',
            '/examples/list/color/index.html',
            '/examples/list/circle/index.html'
        ]);

        // Verify list/circle post-construction store sort listener updates Group1 Name on DESC sort
        await page.getByText('DESC', {exact: true}).click();
        await expect(page.locator('.neo-workbench-inspector input[name="group1"]')).toHaveValue('Yellow');
    });

    test('batch 4 (menus, sitemap, table & trees 31-37)', async ({page}) => {
        await smokeWorkbenchBatch(page, [
            '/examples/menu/list/index.html',
            '/examples/menu/panel/index.html',
            '/examples/menu/tree/index.html',
            '/examples/sitemap/index.html',
            '/examples/table/container/index.html',
            '/examples/tree/index.html',
            '/examples/treeAccordion/index.html'
        ]);
    });
});
