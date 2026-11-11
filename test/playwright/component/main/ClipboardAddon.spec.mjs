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
    let createdIds,
        pageErrors;

    test.beforeEach(async ({page}) => {
        createdIds = [];
        pageErrors = [];

        page.on('pageerror', error => {
            pageErrors.push(error.message)
        });

        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        // Install main-thread clipboard spy so CI and local runs never mutate the host OS clipboard
        await page.evaluate(() => {
            const witness = globalThis.__clipboardWitness = {
                items          : [],
                readCalls      : 0,
                rejectWriteWith: null,
                unhandledCount : 0,
                writeCalls     : 0
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
                    witness.writeCalls++;
                    witness.items.push(...clipboardItems);

                    if (witness.rejectWriteWith) {
                        return Promise.reject(new DOMException(witness.rejectWriteWith, 'NotAllowedError'))
                    }

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
        for (const id of [...createdIds].reverse()) {
            await page.evaluate(cmpId => Neo.worker.App.destroyNeoInstance(cmpId), id)
        }
        createdIds = [];
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
        createdIds.push(created.id);

        await page.waitForSelector(`#${created.id} .clipboard-row`, {state: 'attached'});

        if (config.registerWithAddon !== false) {
            await expect.poll(() =>
                page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'addonRegistered'}), created.id)
            ).toBe(true)
        }

        return created.id
    }

    test('plain domListeners for copy, cut, and paste work without loading the addon and do not double-fire alongside an active registration', async ({page}) => {
        const plainId = await mountSurface(page, {
            id               : 'plain-clipboard-surface',
            registerWithAddon: false
        });

        // Wait for mixin.DomEvents#initDomEvents (150ms) to attach local domEventListener handlers on the main thread
        await page.waitForTimeout(220);

        expect(await page.evaluate(() => Boolean(Neo.main?.addon?.Clipboard))).toBe(false);

        await page.evaluate(() => {
            const
                row          = document.querySelector('#plain-clipboard-surface .clipboard-row'),
                dataTransfer = new DataTransfer();

            dataTransfer.setData('text/plain', 'plain-paste');

            row.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            row.dispatchEvent(new ClipboardEvent('copy',  {bubbles: true, cancelable: true}));
            row.dispatchEvent(new ClipboardEvent('cut',   {bubbles: true, cancelable: true}));
            row.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: dataTransfer}))
        });

        await expect.poll(async () => {
            const events = await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}), plainId);
            return events.map(entry => entry.type)
        }).toEqual(['click', 'copy', 'cut', 'paste']);

        // Still zero Clipboard addon loaded for plain listeners
        expect(await page.evaluate(() => Boolean(Neo.main?.addon?.Clipboard))).toBe(false);

        // Now mount an addon-registered sibling and wait until its local domListeners (150ms) ALSO mount on the main thread
        const registeredId = await mountSurface(page, {
            copyDelayMs      : 20,
            cutMode          : 'fulfill',
            id               : 'registered-clipboard-surface',
            registerWithAddon: true
        });
        await page.waitForTimeout(220);

        await page.evaluate(() => {
            const
                row          = document.querySelector('#registered-clipboard-surface .clipboard-row'),
                dataTransfer = new DataTransfer();

            dataTransfer.setData('text/plain', 'addon-paste');

            row.dispatchEvent(new ClipboardEvent('copy',  {bubbles: true, cancelable: true}));
            row.dispatchEvent(new ClipboardEvent('cut',   {bubbles: true, cancelable: true}));
            row.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: dataTransfer}));

            // Plain sibling continues receiving plain copy events alongside the loaded addon
            document.querySelector('#plain-clipboard-surface .clipboard-row')
                .dispatchEvent(new ClipboardEvent('copy', {bubbles: true, cancelable: true}))
        });

        await expect.poll(async () => {
            const events = await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}), registeredId);
            return events.map(entry => ({hasReq: Boolean(entry.requestId), text: entry.text ?? null, type: entry.type}))
        }).toEqual([
            {hasReq: true,  text: null,          type: 'copy'},
            {hasReq: true,  text: null,          type: 'cut'},
            {hasReq: false, text: 'addon-paste', type: 'paste'}
        ]);

        await expect.poll(async () => {
            const events = await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}), plainId);
            return events.map(entry => entry.type)
        }).toEqual(['click', 'copy', 'cut', 'paste', 'copy'])
    });

    test('loads on demand outside mainThreadAddons and fulfills async multi-MIME ClipboardItem writes from the App Worker', async ({page}) => {
        const beforeLoad = await page.evaluate(() => ({
            inDefaultAddons: Neo.config.mainThreadAddons.includes('Clipboard'),
            loaded         : Boolean(Neo.main?.addon?.Clipboard)
        }));

        expect(beforeLoad).toEqual({
            inDefaultAddons: false,
            loaded         : false
        });

        const surfaceId = await mountSurface(page, {
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
                types           : [...(globalThis.__clipboardWitness.items[0]?.types || [])],
                writeCalls      : globalThis.__clipboardWitness.writeCalls
            }
        });

        expect(syncDispatch).toEqual({
            defaultPrevented: true,
            itemCount       : 1,
            types           : ['text/plain', 'text/html'],
            writeCalls      : 1
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

        await expect.poll(() =>
            page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'lastFulfillResult'}), surfaceId)
        ).toBe(true);

        const events = await page.evaluate(
            id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
            surfaceId
        );
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('copy')
    });

    test('nested registered roots open one clipboard write per gesture and invoke the inner component once', async ({page}) => {
        const surfaceId = await mountSurface(page, {
            copyDelayMs: 30,
            copyText   : 'inner-row-copy',
            mimeTypes  : ['text/plain']
        });

        // Register the enclosing viewport as an outer Clipboard root with wider MIME types
        const outerRegistered = await page.evaluate(() => Neo.main.addon.Clipboard.register({
            componentId: 'component-test-viewport',
            id         : 'component-test-viewport',
            mimeTypes  : ['text/plain', 'text/html']
        }));
        expect(outerRegistered).toBe(true);

        // Wait past local domListeners mount window (150ms) as well
        await page.waitForTimeout(200);

        try {
            const dispatchResult = await page.evaluate(() => {
                const
                    row   = document.querySelector('.clipboard-row'),
                    event = new ClipboardEvent('copy', {bubbles: true, cancelable: true});

                row.dispatchEvent(event);

                return {
                    defaultPrevented: event.defaultPrevented,
                    types           : [...(globalThis.__clipboardWitness.items[0]?.types || [])],
                    writeCalls      : globalThis.__clipboardWitness.writeCalls
                }
            });

            expect(dispatchResult).toEqual({
                defaultPrevented: true,
                types           : ['text/plain'],
                writeCalls      : 1
            });

            await expect.poll(() =>
                page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'lastFulfillResult'}), surfaceId)
            ).toBe(true);

            const events = await page.evaluate(
                id => Neo.worker.App.getConfigs({id, keys: 'receivedEvents'}),
                surfaceId
            );
            expect(events.length).toBe(1);
            expect(events[0].requestId).toBe('clipboard-req-1')
        } finally {
            await page.evaluate(() => Neo.main.addon.Clipboard.unregister({
                componentId: 'component-test-viewport',
                id         : 'component-test-viewport'
            }))
        }
    });

    test('fulfillWrite resolves false when a declared MIME type is omitted or when navigator.clipboard.write rejects', async ({page}) => {
        // 1. Declared ['text/plain', 'text/html'] while worker supplies text only (copyItems: null)
        const surfaceId = await mountSurface(page, {
            copyDelayMs: 30,
            copyItems  : null,
            copyText   : 'plain-only-incomplete',
            mimeTypes  : ['text/plain', 'text/html']
        });

        const incompleteOutcome = await page.evaluate(async () => {
            const
                row   = document.querySelector('.clipboard-row'),
                event = new ClipboardEvent('copy', {bubbles: true, cancelable: true});

            row.dispatchEvent(event);

            const item = globalThis.__clipboardWitness.items[0];
            let htmlRejected = false, plainRejected = false;

            try {
                await item.getType('text/plain')
            } catch {
                plainRejected = true
            }

            try {
                await item.getType('text/html')
            } catch {
                htmlRejected = true
            }

            return {htmlRejected, plainRejected}
        });

        expect(incompleteOutcome).toEqual({
            htmlRejected : true,
            plainRejected: true
        });

        await expect.poll(() =>
            page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'lastFulfillResult'}), surfaceId)
        ).toBe(false);

        // 2. Browser rejects navigator.clipboard.write (e.g., unsupported MIME type) -> fulfillWrite resolves false
        await page.evaluate(() => {
            globalThis.__clipboardWitness.rejectWriteWith = 'Type text/csv not supported on write'
        });

        await page.evaluate(id => Neo.worker.App.setConfigs({
            copyItems        : {'text/csv': 'a,b', 'text/plain': 'a\tb'},
            copyText         : null,
            id,
            lastFulfillResult: null,
            mimeTypes        : ['text/plain', 'text/csv']
        }), surfaceId);

        await expect.poll(() =>
            page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'addonRegistered'}), surfaceId)
        ).toBe(true);

        await page.evaluate(() => {
            document.querySelector('.clipboard-row')
                .dispatchEvent(new ClipboardEvent('copy', {bubbles: true, cancelable: true}))
        });

        await expect.poll(() =>
            page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'lastFulfillResult'}), surfaceId)
        ).toBe(false);

        expect(await page.evaluate(() => globalThis.__clipboardWitness.unhandledCount)).toBe(0)
    });

    test('aborts intercepted ClipboardItem cleanly on cancelWrite, routes paste via clipboardData, and skips editable inputs', async ({page}) => {
        const surfaceId = await mountSurface(page, {
            copyDelayMs: 50,
            cutMode    : 'cancel',
            mimeTypes  : ['text/plain']
        });

        // Ensure local domListeners (150ms initDomEvents timer) are mounted so editable-input bypass proves domEventListener yields too
        await page.waitForTimeout(200);

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
