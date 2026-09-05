import {test, expect} from '@playwright/test';

/**
 * @summary Exercises the installed Monaco distribution through the real Neo wrapper, App Worker,
 * AMD loader and main addon. A held network response makes loading-versus-destruction deterministic;
 * the response is released unchanged, and no editor or loader implementation is substituted.
 */
const FIXTURE_URL = 'test/playwright/component/apps/monaco-editor/index.html';
const EDITOR_ID   = 'monaco-test-editor';
const HOST_ID     = 'monaco-test-viewport';

/**
 * @summary Reads the App Worker's native component observation surface.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @param {String[]} keys
 * @returns {Promise<Array>}
 */
const readConfigs = async (page, id, keys) => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

/**
 * @summary Waits for a native editor, rather than treating the wrapper's empty div as readiness.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const expectEditor = async page => {
    await expect.poll(() => page.evaluate(id => {
        const addon  = globalThis.Neo?.main?.addon?.MonacoEditor,
              editor = addon?.map?.[id];

        return !!(addon?.isReady && editor?.getModel())
    }, EDITOR_ID), {message: 'the real Monaco AMD module and native editor become ready', timeout: 20000}).toBe(true);

    await expect(page.locator(`#${EDITOR_ID} .monaco-editor`)).toBeVisible()
};

/**
 * @summary Creates the next wrapper generation through the ordinary worker/container API.
 * @param {import('@playwright/test').Page} page
 * @param {String} generation
 * @returns {Promise<void>}
 */
const createEditor = async (page, generation) => {
    const reply = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
        editorTheme      : 'vs',
        id               : EDITOR_ID,
        language         : 'javascript',
        ntype            : 'test-monaco-editor',
        parentId         : HOST_ID,
        testGeneration   : generation,
        useThemeAwareness: false,
        value            : `const ${generation} = 2;`
    });

    expect(reply?.data ?? reply).toMatchObject({success: true, id: EDITOR_ID})
};

/**
 * @summary Destroys the wrapper through its real parent removal and remote teardown path.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const destroyEditor = async page => {
    const reply = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), EDITOR_ID);

    expect(reply?.data ?? reply).toMatchObject({success: true});
    await expect(page.locator(`#${EDITOR_ID}`)).toHaveCount(0)
};

test.describe('Monaco wrapper against the installed browser distribution', () => {
    let pageErrors = [], monacoRequests = [], monacoResponses = [];

    test.beforeEach(async ({page}) => {
        pageErrors      = [];
        monacoRequests  = [];
        monacoResponses = [];

        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('request', request => {
            if (request.url().includes('/node_modules/monaco-editor/')) monacoRequests.push(request.url())
        });
        page.on('response', response => {
            if (response.url().includes('/node_modules/monaco-editor/')) {
                monacoResponses.push({url: response.url(), status: response.status(), type: response.headers()['content-type']})
            }
        })
    });

    test.afterEach(() => {
        expect(pageErrors, 'no browser exception escapes the real editor lifecycle').toEqual([]);
        expect(monacoResponses.filter(response => response.status >= 400), 'all requested Monaco assets exist').toEqual([])
    });

    test('boots the AMD module, its stylesheet and the initial editor before reporting mounted', async ({page}) => {
        await page.goto(FIXTURE_URL);
        await expectEditor(page);
        await expect.poll(async () => (await readConfigs(page, HOST_ID, ['mountReceipts']))[0]).toEqual(['initial']);

        const native = await page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            return {value: editor.getValue(), language: editor.getModel().getLanguageId(), width: editor.getLayoutInfo().width}
        }, EDITOR_ID);

        expect(native).toMatchObject({value: 'const boot = 1;', language: 'javascript'});
        expect(native.width).toBeGreaterThan(100);

        const diagnostics = await page.evaluate(async id => {
            const model     = Neo.main.addon.MonacoEditor.map[id].getModel(),
                  getWorker = await monaco.typescript.getJavaScriptWorker(),
                  worker    = await getWorker(model.uri);

            return worker.getSyntacticDiagnostics(model.uri.toString())
        }, EDITOR_ID);

        expect(diagnostics, 'the installed language worker reads the live editor model').toEqual([]);
        await expect.poll(() => monacoResponses.find(response => response.url.endsWith('/editor/editor.main.css'))?.type)
            .toContain('text/css');
        expect(monacoRequests.some(url => url.endsWith('/editor/editor.main.nls.js')), 'the retired NLS file is never requested').toBe(false)
    });

    test('reactive wrapper configs reach public Monaco value, language, theme and option APIs', async ({page}) => {
        await page.goto(FIXTURE_URL);
        await expectEditor(page);

        await page.evaluate(configs => Neo.worker.App.setConfigs(configs), {
            id      : EDITOR_ID, value: '# Updated', language: 'markdown', editorTheme: 'vs-dark', fontSize: 21,
            readOnly: true, minimap: {enabled: true}
        });

        await expect.poll(() => page.evaluate(id => {
            const editor  = Neo.main.addon.MonacoEditor.map[id],
                  options = editor.getRawOptions();

            return {
                value   : editor.getValue(), language: editor.getModel().getLanguageId(), fontSize: options.fontSize,
                readOnly: options.readOnly, minimap: options.minimap.enabled
            }
        }, EDITOR_ID)).toEqual({value: '# Updated', language: 'markdown', fontSize: 21, readOnly: true, minimap: true});
        await expect(page.locator(`#${EDITOR_ID} .monaco-editor`)).toHaveClass(/\bvs-dark\b/)
    });

    test('real keyboard edits deliver the changed value back to the App Worker', async ({page}) => {
        await page.goto(FIXTURE_URL);
        await expectEditor(page);

        const [before] = await readConfigs(page, EDITOR_ID, ['changeCount']);

        await page.evaluate(id => {
            const editor     = Neo.main.addon.MonacoEditor.map[id],
                  model      = editor.getModel(),
                  lineNumber = model.getLineCount();

            editor.focus();
            editor.setPosition({lineNumber, column: model.getLineMaxColumn(lineNumber)})
        }, EDITOR_ID);
        await page.keyboard.insertText('\nconst edited = 3;');

        const nativeValue = await page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].getValue(), EDITOR_ID);

        await expect.poll(async () => (await readConfigs(page, EDITOR_ID, ['lastChangedValue']))[0])
            .toBe(nativeValue);
        expect(nativeValue.replace(/\r\n/g, '\n')).toBe('const boot = 1;\nconst edited = 3;');
        expect((await readConfigs(page, EDITOR_ID, ['changeCount']))[0]).toBeGreaterThan(before)
    });

    test('destroy disposes the owned model and recreation gives the same holder a fresh editor', async ({page}) => {
        await page.goto(FIXTURE_URL);
        await expectEditor(page);
        await page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            window.monacoLifecycleProbe = {editor, model: editor.getModel(), disposed: false};
            editor.onDidDispose(() => { window.monacoLifecycleProbe.disposed = true })
        }, EDITOR_ID);

        await destroyEditor(page);
        await expect.poll(() => page.evaluate(id => ({
            disposed     : window.monacoLifecycleProbe.disposed,
            modelDisposed: window.monacoLifecycleProbe.model.isDisposed(),
            registered   : !!Neo.main.addon.MonacoEditor.map[id]
        }), EDITOR_ID)).toEqual({disposed: true, modelDisposed: true, registered: false});

        await createEditor(page, 'replacement');
        await expectEditor(page);
        expect(await page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            return {fresh: editor !== window.monacoLifecycleProbe.editor, value: editor.getValue(), models: monaco.editor.getModels().length}
        }, EDITOR_ID)).toEqual({fresh: true, value: 'const replacement = 2;', models: 1})
    });

    test('retiring a mounted wrapper while the real module loads cannot resurrect its generation', async ({page}) => {
        let release, entered;
        const gate    = new Promise(resolve => { release = resolve }),
              blocked = new Promise(resolve => { entered = resolve });

        await page.route('**/node_modules/monaco-editor/min/vs/editor/editor.main.js', async route => {
            entered();
            await gate;
            await route.continue()
        });

        try {
            await page.goto(FIXTURE_URL, {waitUntil: 'domcontentloaded'});
            await blocked;
            await expect.poll(async () => (await readConfigs(page, EDITOR_ID, ['mounted']))[0]).toBe(true);
            expect(await page.evaluate(() => Neo.main.addon.MonacoEditor.isReady)).toBe(false);

            await destroyEditor(page);
            await createEditor(page, 'replacement');
        } finally {
            release()
        }

        await expectEditor(page);
        await expect.poll(async () => (await readConfigs(page, HOST_ID, ['mountReceipts']))[0]).toEqual(['replacement']);
        expect(await page.evaluate(id => ({
            value: Neo.main.addon.MonacoEditor.map[id].getValue(), models: monaco.editor.getModels().length
        }), EDITOR_ID)).toEqual({value: 'const replacement = 2;', models: 1})
    });

    test('the actual Portal boot completes Monaco addon initialization even when home paints first', async ({page}) => {
        await page.goto('apps/portal/index.html#home', {waitUntil: 'domcontentloaded'});
        await expect(page.locator('.portal-main-content')).toBeVisible({timeout: 20000});

        // Home can paint while the addon's deferred preload still fails. Readiness is the missing
        // boundary: a visible Portal shell alone did not observe the obsolete NLS request.
        await expect.poll(() => page.evaluate(() => !!globalThis.Neo?.main?.addon?.MonacoEditor?.isReady),
            {message: 'Portal Monaco preload completes through the real AMD module', timeout: 20000}).toBe(true);
        expect(await page.evaluate(() => typeof globalThis.monaco?.editor?.create)).toBe('function');
        await expect.poll(() => monacoResponses.find(response => response.url.endsWith('/editor/editor.main.css'))?.type)
            .toContain('text/css');
        expect(monacoRequests.some(url => url.endsWith('/editor/editor.main.nls.js'))).toBe(false)
    });
});
