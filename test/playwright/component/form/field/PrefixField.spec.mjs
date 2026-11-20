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
