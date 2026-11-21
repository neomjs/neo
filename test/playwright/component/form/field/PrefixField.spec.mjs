import {test, expect} from '@playwright/test';

/**
 * @summary Verifies `Neo.plugin.PrefixField` + `Neo.main.addon.PrefixField` synchronous Main-Thread input masking
 * across zero-delay back-to-back keystrokes, rapid multi-field `fill()` calls, `Backspace` across separators,
 * untouched focus/blur clearing, and live runtime config updates.
 */
const CONTAINER_ID = 'prefixfield-test-container';

async function mountFiveMaskedFields(page) {
    await page.evaluate(async () => {
        await Neo.worker.App.loadModule({path: '../form/field/Text.mjs'});
        await Neo.worker.App.loadModule({path: '../plugin/PrefixField.mjs'});
    });

    const result = await page.evaluate(async (containerId) => {
        return Neo.worker.App.createNeoInstance({
            ntype   : 'container',
            id      : containerId,
            parentId: 'component-test-viewport',
            width   : 350,
            layout  : {ntype: 'vbox', align: 'stretch'},
            items   : [{
                ntype    : 'textfield',
                id       : 'mask-phone',
                labelText: 'Phone Number',
                plugins  : [{ntype: 'plugin-prefixfield', id: 'mask-phone-plugin', pattern: '+1 (___) ___-____', slots: '_'}]
            }, {
                ntype    : 'textfield',
                id       : 'mask-date',
                labelText: 'Date',
                plugins  : [{ntype: 'plugin-prefixfield', pattern: 'dd/mm/yyyy hh:mm', slots: 'dmyh'}]
            }, {
                ntype    : 'textfield',
                id       : 'mask-mac',
                labelText: 'MAC Address',
                plugins  : [{ntype: 'plugin-prefixfield', pattern: 'XX:XX:XX:XX:XX:XX', slots: 'X', accept: '[0-9A-Fa-f]'}]
            }, {
                ntype    : 'textfield',
                id       : 'mask-code',
                labelText: 'Alphanumeric',
                plugins  : [{ntype: 'plugin-prefixfield', pattern: '__-__-__-____', slots: '_', accept: '[A-Za-z0-9_]'}]
            }, {
                ntype    : 'textfield',
                id       : 'mask-card',
                labelText: 'Credit Card',
                plugins  : [{ntype: 'plugin-prefixfield', pattern: '.... .... .... ....', slots: '.', accept: '\\d'}]
            }]
        });
    }, CONTAINER_ID);

    expect(result.success, result.error?.message).toBe(true);
    await expect(page.locator(`#${CONTAINER_ID} input[data-neo-prefix-ready="true"]`)).toHaveCount(5);
}

test.describe('Neo.plugin.PrefixField (OMT browser)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await mountFiveMaskedFields(page);
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(async (id) => {
            await Neo.worker.App.destroyNeoInstance(id);
        }, CONTAINER_ID);
    });

    test('zero-delay back-to-back keystrokes keep exact character order in date and MAC masks', async ({page}) => {
        const dateInput = page.locator('#mask-date input'),
              macInput  = page.locator('#mask-mac input');

        await dateInput.click();
        await dateInput.pressSequentially('201120260930', {delay: 0});
        await expect(dateInput).toHaveValue('20/11/2026 09:30');

        await macInput.click();
        await macInput.pressSequentially('ABCDEF123456', {delay: 0});
        await expect(macInput).toHaveValue('AB:CD:EF:12:34:56');

        const [dateVal, macVal] = await page.evaluate(() => Promise.all([
            Neo.worker.App.getConfigs({id: 'mask-date', keys: 'value'}),
            Neo.worker.App.getConfigs({id: 'mask-mac',  keys: 'value'})
        ]));

        expect(dateVal).toBe('20/11/2026 09:30');
        expect(macVal).toBe('AB:CD:EF:12:34:56');
    });

    test('consecutive pause-free fill() calls across all five masked fields format every field and sync App Worker state', async ({page}) => {
        await page.locator('#mask-phone input').fill('5552345678');
        await page.locator('#mask-date input').fill('201120260930');
        await page.locator('#mask-mac input').fill('001A2B3C4D5E');
        await page.locator('#mask-code input').fill('NEO14RC12026');
        await page.locator('#mask-card input').fill('4242424242424242');

        await expect(page.locator('#mask-phone input')).toHaveValue('+1 (555) 234-5678');
        await expect(page.locator('#mask-date input')).toHaveValue('20/11/2026 09:30');
        await expect(page.locator('#mask-mac input')).toHaveValue('00:1A:2B:3C:4D:5E');
        await expect(page.locator('#mask-code input')).toHaveValue('NE-O1-4R-C120');
        await expect(page.locator('#mask-card input')).toHaveValue('4242 4242 4242 4242');

        const synced = await page.evaluate(() => {
            const ids = ['mask-phone', 'mask-date', 'mask-mac', 'mask-code', 'mask-card'];
            return Promise.all(ids.map(id => Neo.worker.App.getConfigs({id, keys: 'value'})));
        });

        expect(synced).toEqual([
            '+1 (555) 234-5678',
            '20/11/2026 09:30',
            '00:1A:2B:3C:4D:5E',
            'NE-O1-4R-C120',
            '4242 4242 4242 4242'
        ]);
    });

    test('focus shows empty mask, untouched blur clears to emptyValue, Backspace steps across separators, and runtime config updates sync', async ({page}) => {
        const phoneInput = page.locator('#mask-phone input'),
              dateInput  = page.locator('#mask-date input');

        await phoneInput.click();
        await expect(phoneInput).toHaveValue('+1 (___) ___-____');

        await dateInput.click();
        await expect(phoneInput).toHaveValue('');
        await expect.poll(() => page.evaluate(() => Neo.worker.App.getConfigs({id: 'mask-phone', keys: 'value'}))).toBeNull();

        await dateInput.pressSequentially('20', {delay: 0});
        await expect(dateInput).toHaveValue('20/mm/yyyy hh:mm');
        await dateInput.press('Backspace');
        await dateInput.press('Backspace');
        await expect(dateInput).toHaveValue('2d/mm/yyyy hh:mm');

        // Runtime pattern/slots/accept update from App Worker re-syncs Main addon
        await page.evaluate(async () => {
            await Neo.worker.App.setConfigs({id: 'mask-phone-plugin', accept: '[A-Z]', pattern: 'ID-____', slots: '_'});
            await Neo.worker.App.setConfigs({id: 'mask-phone', value: ''});
        });

        await phoneInput.click();
        await expect(phoneInput).toHaveValue('ID-____');
        await phoneInput.pressSequentially('12NEOM99', {delay: 0});
        await expect(phoneInput).toHaveValue('ID-NEOM');
    });
});

test.describe('examples/fieldWithPrefix Input masks workbench', () => {
    test('MAC field accepts uppercase/lowercase hex digits, refuses G-Z, reflects hex label, and resets cleanly', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/fieldWithPrefix/index.html');

        const container = page.locator('.example-fieldWithPrefix');
        await expect(container).toBeVisible();
        await expect(container.locator('input[data-neo-prefix-ready="true"]')).toHaveCount(5);

        const macField = container.locator('.neo-textfield').nth(2),
              macLabel = macField.locator('.neo-textfield-label'),
              macInput = macField.locator('input');

        await expect(macLabel).toHaveText('[0-9A-Fa-f] MAC');

        await macInput.click();
        await macInput.pressSequentially('001A2B3C4D5E', {delay: 0});
        await expect(macInput).toHaveValue('00:1A:2B:3C:4D:5E');

        await macInput.fill('');
        await macInput.pressSequentially('001a2b3c4d5e', {delay: 0});
        await expect(macInput).toHaveValue('00:1a:2b:3c:4d:5e');

        // Non-hex letters G-Z / g-z are refused; untouched-slot mask clears on blur
        await macInput.fill('');
        await macInput.click();
        await macInput.pressSequentially('GHIJKLMNOPQRghijklmnopqr', {delay: 0});
        await expect(macInput).toHaveValue('XX:XX:XX:XX:XX:XX');
        await container.locator('.neo-textfield input').first().click();
        await expect(macInput).toHaveValue('');

        // Mixed string strips G-Z and fills hex slots in order
        await macInput.click();
        await macInput.pressSequentially('GG00ZZ1a2B3c4D5e', {delay: 0});
        await expect(macInput).toHaveValue('00:1a:2B:3c:4D:5e');

        // Workbench Reset clears masked fields back to empty initial state
        await page.getByRole('button', {name: /reset/i}).click();
        await expect(macInput).toHaveValue('');

        // Inspector accept ComboBox updates the first field's mask, and Reset restores pattern + accept
        const phoneInput  = container.locator('.neo-textfield input').first(),
              inspector   = page.locator('.neo-configuration-panel-body'),
              acceptCombo = inspector.locator('.neo-combobox'),
              patternIn   = inspector.locator('.neo-textfield').filter({hasText: 'pattern'}).locator('input');

        const readPhoneMask = () => phoneInput.evaluate(el => {
            const mask = Neo.main.addon.PrefixField.fields.get(el.id);

            return {accept: mask?.accept?.source, pattern: mask?.pattern}
        });

        await acceptCombo.locator('.fa-caret-down').click();
        await page.locator('.neo-picker-container .neo-list-item').filter({hasText: '[A-H]'}).click();
        await expect.poll(readPhoneMask).toEqual({accept: '[A-H]', pattern: '+1 (___) ___-____'});

        await phoneInput.click();
        await phoneInput.pressSequentially('12ABC99', {delay: 0});
        await expect(phoneInput).toHaveValue('+1 (ABC) ___-____');

        await patternIn.fill('AB-___');
        await expect.poll(readPhoneMask).toEqual({accept: '[A-H]', pattern: 'AB-___'});
        await page.getByRole('button', {name: /reset/i}).click();
        await expect(phoneInput).toHaveValue('');
        await expect.poll(readPhoneMask).toEqual({accept: '\\d', pattern: '+1 (___) ___-____'});

        await phoneInput.click();
        await phoneInput.pressSequentially('5552345678', {delay: 0});
        await expect(phoneInput).toHaveValue('+1 (555) 234-5678');
    });

    test('fits 1440x900 (350px cap) and 390x844 phone width in light and dark themes with all five fields reachable', async ({page}) => {
        await page.goto('/examples/fieldWithPrefix/index.html');

        const container = page.locator('.example-fieldWithPrefix');
        await expect(container).toBeVisible();
        await expect(container.locator('input[data-neo-prefix-ready="true"]')).toHaveCount(5);

        const viewportEl = page.locator('.neo-viewport');

        for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(viewport);

            for (const expectedTheme of ['neo-theme-light', 'neo-theme-dark']) {
                for (let step = 0; step < 6; step++) {
                    if (await viewportEl.evaluate((el, cls) => el.classList.contains(cls), expectedTheme)) {
                        break;
                    }
                    const prevClass = await viewportEl.getAttribute('class');
                    await page.locator('.neo-button-theme-switch').click();
                    await expect.poll(() => viewportEl.getAttribute('class')).not.toBe(prevClass);
                }
                await expect(viewportEl).toHaveClass(new RegExp(`\\b${expectedTheme}\\b`));

                const layout = await page.evaluate(() => {
                    const stage       = document.querySelector('.neo-workbench-stage'),
                          exContainer = document.querySelector('.neo-example-container'),
                          box         = document.querySelector('.example-fieldWithPrefix'),
                          stageRect   = stage.getBoundingClientRect(),
                          boxRect     = box.getBoundingClientRect(),
                          fields      = [...box.querySelectorAll('.neo-textfield')].map(field => {
                              const rect      = field.getBoundingClientRect(),
                                    labelRect = field.querySelector('.neo-textfield-label').getBoundingClientRect(),
                                    inputRect = (field.querySelector('.neo-input-wrapper') || field.querySelector('input')).getBoundingClientRect();

                              return {
                                  left      : rect.left,
                                  right     : rect.right,
                                  labelRight: labelRect.right,
                                  inputLeft : inputRect.left
                              };
                          });

                    return {
                        boxWidth     : Math.round(boxRect.width),
                        exClientWidth: exContainer.clientWidth,
                        exScrollWidth: exContainer.scrollWidth,
                        stageLeft    : stageRect.left,
                        stageRight   : stageRect.right,
                        fields
                    };
                });

                expect(layout.fields).toHaveLength(5);
                expect(layout.exScrollWidth).toBeLessThanOrEqual(layout.exClientWidth);

                if (viewport.width === 1440) {
                    expect(layout.boxWidth).toBe(350);
                } else {
                    expect(layout.boxWidth).toBeLessThan(350);
                }

                for (const field of layout.fields) {
                    expect(field.left).toBeGreaterThanOrEqual(layout.stageLeft);
                    expect(field.right).toBeLessThanOrEqual(layout.stageRight);
                    expect(field.labelRight).toBeLessThanOrEqual(field.inputLeft + 0.5);
                }

                // Scroll to the 5th field (Credit Card) and verify it is visible inside the stage and interactive
                const cardInput = container.locator('.neo-textfield').nth(4).locator('input');
                await cardInput.scrollIntoViewIfNeeded();

                const cardInStage = await page.evaluate(() => {
                    const stage     = document.querySelector('.neo-workbench-stage').getBoundingClientRect(),
                          cardField = document.querySelectorAll('.example-fieldWithPrefix .neo-textfield')[4].getBoundingClientRect();

                    return cardField.top >= stage.top && cardField.bottom <= stage.bottom &&
                           cardField.left >= stage.left && cardField.right <= stage.right;
                });

                expect(cardInStage).toBe(true);
                await cardInput.fill('4242424242424242');
                await expect(cardInput).toHaveValue('4242 4242 4242 4242');
                await cardInput.fill('');
            }
        }
    });
});
