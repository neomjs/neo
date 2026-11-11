import {test, expect} from '@playwright/test';

const SURFACE_MODULE_PATH = '../../test/playwright/component/main/ClipboardSurface.mjs';

/**
 * @summary Component-tier browser witness for `Neo.main.addon.Clipboard` across Main Thread + App Worker + VDom Worker.
 *
 * `navigator.clipboard.write` is intercepted on the page's main thread so zero host OS clipboard mutations occur
 * while proving synchronous `ClipboardItem` creation inside the gesture and real browser `ClipboardItem#getType()`
 * `Blob` resolution across asynchronous App Worker `fulfillWrite` and `cancelWrite` calls.
 */
test.describe('Neo.main.addon.Clipboard (component browser)', () => {
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

        // Install main-thread clipboard spy so CI and local runs never mutate the host OS clipboard
        await page.evaluate(() => {
            const witness = globalThis.__clipboardWitness = {
                items         : [],
                readCalls     : 0,
                unhandledCount: 0
            };

            window.addEventListener('unhandledrejection', () => {
                witness.unhandledCount++
            });

            const stubClipboard = {
                readText: async () => {
                    witness.readCalls++;
                    return ''
                },
                write: clipboardItems => {
                    witness.items.push(...clipboardItems);
                    return Promise.all(clipboardItems.flatMap(item =>
                        item.types.map(type => item.getType(type))
                    ))
                }
            };

            try {
                Object.defineProperty(navigator, 'clipboard', {
                    configurable: true,
                    value       : stubClipboard
                })
            } catch {
                navigator.clipboard.write    = stubClipboard.write;
                navigator.clipboard.readText = stubClipboard.readText
            }
        })
    });

    test.afterEach(async ({page}) => {
        if (surfaceId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), surfaceId);
            surfaceId = null
        }
        expect(pageErrors).toEqual([])
    });

    async function mountSurface(page, config = {}) {
        const loaded = await page.evaluate(
            path => Neo.worker.App.loadModule({path}),
            SURFACE_MODULE_PATH
        );
        expect(loaded.success).toBe(true);

        const created = await page.evaluate(cfg => Neo.worker.App.createNeoInstance({
            appName  : 'ComponentTestApp',
            className: 'Test.Component.Main.ClipboardSurface',
            parentId : 'component-test-viewport',
            ...cfg
        }), config);

        expect(created.success).toBe(true);
        surfaceId = created.id;

        await page.waitForSelector('.clipboard-row', {state: 'attached'});
        await expect.poll(() =>
            page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'addonRegistered'}), surfaceId)
        ).toBe(true);

        return surfaceId
    }

    test('loads on demand outside mainThreadAddons and fulfills async multi-MIME ClipboardItem writes from the App Worker', async ({page}) => {
        const beforeLoad = await page.evaluate(() => ({
            inDefaultAddons: Neo.config.mainThreadAddons.includes('Clipboard'),
            loaded         : Boolean(Neo.main?.addon?.Clipboard)
        }));

        expect(beforeLoad).toEqual({
            inDefaultAddons: false,
            loaded         : false
        });

        await mountSurface(page, {
            copyDelayMs: 80,
            copyItems  : {
                'text/html' : '<table><tr><td>Row 42</td></tr></table>',
                'text/plain': 'Row 42'
            },
            mimeTypes: ['text/plain', 'text/html']
        });

        const loadedAfterMount = await page.evaluate(() => Boolean(Neo.main?.addon?.Clipboard));
        expect(loadedAfterMount).toBe(true);

        // Dispatch copy synchronously and verify ClipboardItem was submitted inside the same turn
        const syncDispatch = await page.evaluate(() => {
            const
                row   = document.querySelector('.clipboard-row'),
                event = new ClipboardEvent('copy', {bubbles: true, cancelable: true});

            row.dispatchEvent(event);

            return {
                defaultPrevented: event.defaultPrevented,
                itemCount       : globalThis.__clipboardWitness.items.length,
                types           : [...(globalThis.__clipboardWitness.items[0]?.types || [])]
            }
        });

        expect(syncDispatch).toEqual({
            defaultPrevented: true,
            itemCount       : 1,
            types           : ['text/plain', 'text/html']
        });

        // Await real browser ClipboardItem#getType() resolution once the App Worker calls fulfillWrite
        const resolvedPayloads = await page.evaluate(async () => {
            const item      = globalThis.__clipboardWitness.items[0];
            const plainBlob = await item.getType('text/plain');
            const htmlBlob  = await item.getType('text/html');

            return {
                html : await htmlBlob.text(),
                plain: await plainBlob.text()
            }
        });

        expect(resolvedPayloads).toEqual({
            html : '<table><tr><td>Row 42</td></tr></table>',
            plain: 'Row 42'
        });

        const events = await page.evaluate(
            id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
            surfaceId
        );
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('copy')
    });

    test('aborts intercepted ClipboardItem cleanly on cancelWrite, routes paste via clipboardData, and skips editable inputs', async ({page}) => {
        await mountSurface(page, {
            copyDelayMs: 50,
            cutMode    : 'cancel',
            mimeTypes  : ['text/plain']
        });

        // 1. Cut cancelled by App Worker rejects the pending ClipboardItem with zero unhandled rejections
        const cutOutcome = await page.evaluate(async () => {
            const
                row   = document.querySelector('.clipboard-row'),
                event = new ClipboardEvent('cut', {bubbles: true, cancelable: true});

            row.dispatchEvent(event);

            const item     = globalThis.__clipboardWitness.items[0];
            let   rejected = false;

            try {
                await item.getType('text/plain')
            } catch {
                rejected = true
            }

            return {
                defaultPrevented: event.defaultPrevented,
                rejected
            }
        });

        expect(cutOutcome).toEqual({
            defaultPrevented: true,
            rejected        : true
        });

        // 2. Paste forwards synchronous clipboardData without calling navigator.clipboard.readText
        const pastePrevented = await page.evaluate(() => {
            const
                row          = document.querySelector('.clipboard-row'),
                dataTransfer = new DataTransfer();

            dataTransfer.setData('text/plain', 'pasted-from-gesture');

            const event = new ClipboardEvent('paste', {
                bubbles      : true,
                cancelable   : true,
                clipboardData: dataTransfer
            });

            row.dispatchEvent(event);

            return event.defaultPrevented
        });

        expect(pastePrevented).toBe(true);

        await expect.poll(async () => {
            const events = await page.evaluate(
                id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
                surfaceId
            );
            return events.find(entry => entry.type === 'paste')?.text ?? null
        }).toBe('pasted-from-gesture');

        // 3. Editable <input type="text"> child bypasses the addon completely
        const inputBypass = await page.evaluate(() => {
            const
                input      = document.querySelector('.clipboard-editor'),
                copyEvent  = new ClipboardEvent('copy',  {bubbles: true, cancelable: true}),
                pasteEvent = new ClipboardEvent('paste', {bubbles: true, cancelable: true});

            input.dispatchEvent(copyEvent);
            input.dispatchEvent(pasteEvent);

            return {
                copyPrevented : copyEvent.defaultPrevented,
                itemCount     : globalThis.__clipboardWitness.items.length,
                pastePrevented: pasteEvent.defaultPrevented,
                readCalls     : globalThis.__clipboardWitness.readCalls,
                unhandledCount: globalThis.__clipboardWitness.unhandledCount
            }
        });

        expect(inputBypass).toEqual({
            copyPrevented : false,
            itemCount     : 1,
            pastePrevented: false,
            readCalls     : 0,
            unhandledCount: 0
        });

        const finalEvents = await page.evaluate(
            id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
            surfaceId
        );
        expect(finalEvents.map(entry => entry.type)).toEqual(['cut', 'paste'])
    });
});
