import {test, expect} from '@playwright/test';

const
    MOD                 = process.platform === 'darwin' ? 'Meta' : 'Control',
    SURFACE_MODULE_PATH = '../../test/playwright/component/main/ClipboardSurface.mjs';

/**
 * @summary End-to-end 3-engine (`chromium`, `webkit`, `firefox`) verification of `Neo.main.addon.Clipboard`
 * using real keyboard gestures (`Cmd/Ctrl+C`, `Cmd/Ctrl+X`, `Cmd/Ctrl+V`) on `http://localhost` with zero
 * clipboard permission overrides.
 */
test.describe('Neo.main.addon.Clipboard (3-engine real clipboard)', () => {
    let pageErrors,
        surfaceId;

    test.beforeEach(async ({page}) => {
        pageErrors = [];
        surfaceId  = null;

        page.on('pageerror', error => {
            pageErrors.push(error.message)
        });

        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        expect(await page.evaluate(() => window.isSecureContext)).toBe(true);

        await page.evaluate(() => {
            globalThis.__unhandledClipboardRejections = 0;
            window.addEventListener('unhandledrejection', () => {
                globalThis.__unhandledClipboardRejections++
            });

            const probe = document.createElement('textarea');
            probe.id    = 'clipboard-probe';
            document.body.appendChild(probe)
        });

        const loaded = await page.evaluate(
            path => Neo.worker.App.loadModule({path}),
            SURFACE_MODULE_PATH
        );
        expect(loaded.success).toBe(true);

        const created = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            appName    : 'ComponentTestApp',
            className  : 'Test.Component.Main.ClipboardSurface',
            copyDelayMs: 100,
            copyText   : 'neo-worker-clipboard-alpha',
            cutMode    : 'cancel',
            parentId   : 'component-test-viewport'
        }));
        expect(created.success).toBe(true);
        surfaceId = created.id;

        await page.waitForSelector('.clipboard-row', {state: 'attached'});
        await expect.poll(() =>
            page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'addonRegistered'}), surfaceId)
        ).toBe(true)
    });

    test.afterEach(async ({page}) => {
        const unhandled = await page.evaluate(() => globalThis.__unhandledClipboardRejections || 0);
        expect(unhandled).toBe(0);
        expect(pageErrors).toEqual([]);

        if (surfaceId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), surfaceId);
            surfaceId = null
        }
    });

    async function selectRowAndFocus(page) {
        await page.locator('.clipboard-row').click();
        await page.evaluate(() => {
            const
                row       = document.querySelector('.clipboard-row'),
                selection = window.getSelection(),
                range     = document.createRange();

            row.focus();
            range.selectNodeContents(row);
            selection.removeAllRanges();
            selection.addRange(range)
        })
    }

    async function readViaPasteIntoProbe(page) {
        const probe = page.locator('#clipboard-probe');
        await probe.fill('');
        await probe.focus();
        await page.keyboard.press(`${MOD}+v`);
        return await probe.inputValue()
    }

    test('async worker copy, cancelled cut preservation, editable input bypass, and synchronous paste across engines', async ({page}) => {
        // 1. Outbound copy fulfilled asynchronously (100ms worker turn delay) writes the worker payload
        await selectRowAndFocus(page);
        await page.keyboard.press(`${MOD}+c`);

        await expect.poll(async () => {
            const events = await page.evaluate(
                id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
                surfaceId
            );
            return events.filter(entry => entry.type === 'copy').length
        }).toBe(1);

        // Wait until the async worker fulfillment settles on the OS clipboard, verified by real paste
        await expect.poll(() => readViaPasteIntoProbe(page)).toBe('neo-worker-clipboard-alpha');

        // 2. Outbound cut cancelled from the App Worker preserves prior clipboard contents cleanly
        await selectRowAndFocus(page);
        await page.keyboard.press(`${MOD}+x`);

        // Note: on non-editable nodes some engines suppress native `cut` while others fire `cut` and run cancelWrite;
        // in both cases the prior clipboard payload MUST remain intact with zero unhandled rejections.
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
        expect(await readViaPasteIntoProbe(page)).toBe('neo-worker-clipboard-alpha');

        // 3. Editable <input type="text"> inside the registered container keeps native copy & paste untouched
        const editor = page.locator('.clipboard-editor');
        await editor.fill('native-editor-text');
        await editor.selectText();
        await page.keyboard.press(`${MOD}+c`);

        await expect.poll(() => readViaPasteIntoProbe(page)).toBe('native-editor-text');

        await editor.fill('');
        await editor.focus();
        await page.keyboard.press(`${MOD}+v`);
        await expect(editor).toHaveValue('native-editor-text');

        // 4. Inbound paste on the registered container delivers the clipboard text to the App Worker listener
        await selectRowAndFocus(page);
        await page.keyboard.press(`${MOD}+v`);

        await expect.poll(async () => {
            const events = await page.evaluate(
                id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
                surfaceId
            );
            return events.find(entry => entry.type === 'paste')?.text ?? null
        }).toBe('native-editor-text')
    });
});
