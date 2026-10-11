import {createRequire} from 'node:module';
import {test, expect}  from '@playwright/test';

/**
 * @summary Exercises the engine's Monaco build through the real Neo wrapper, App Worker and main addon.
 * A held network response makes loading-versus-destruction deterministic; the response is released
 * unchanged, and no editor implementation is substituted.
 */
const FIXTURE_URL = 'test/playwright/component/apps/monaco-editor/index.html';
const EDITOR_ID   = 'monaco-test-editor';
const HOST_ID     = 'monaco-test-viewport';

/** Mirrors `component.wrapper.MonacoEditor#editorThemes`; the browser is the only importer of the class. */
const EDITOR_THEMES = ['hc-black', 'hc-light', 'vs', 'vs-dark'];

/** A Monaco asset, from the engine's build or from the installed package that build replaces. */
const MONACO_ASSET = /\/(dist\/monaco|node_modules\/monaco-editor)\//;

/**
 * The DOMPurify npm resolves for monaco-editor, which `package-lock.json` records and Dependabot audits.
 * Read through DOMPurify's public `version`, resolved from monaco-editor's own directory.
 */
const NPM_SANITIZER = createRequire(new URL('../../../../node_modules/monaco-editor/package.json', import.meta.url))('dompurify').version;

/**
 * The version DOMPurify's factory assigns to itself, `DOMPurify.version = '…'` followed by
 * `DOMPurify.removed = []`, in plain or minified code. Code rather than the license banner, which
 * Monaco's minified AMD chunks do not carry.
 */
const SANITIZER_VERSION = /\.version\s*=\s*["'](\d+\.\d+\.\d+)["']\s*[,;]\s*[\w$]+\.removed\s*=\s*\[\]/g;

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
    }, EDITOR_ID), {message: 'the Monaco build and a native editor become ready', timeout: 20000}).toBe(true);

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

test.describe('Monaco wrapper against the engine\'s Monaco build', () => {
    let pageErrors = [], monacoRequests = [], monacoResponses = [];

    test.beforeEach(async ({page}) => {
        pageErrors      = [];
        monacoRequests  = [];
        monacoResponses = [];

        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('request', request => {
            if (MONACO_ASSET.test(request.url())) monacoRequests.push(request.url())
        });
        page.on('response', response => {
            if (MONACO_ASSET.test(response.url())) {
                monacoResponses.push({url: response.url(), status: response.status(), type: response.headers()['content-type']})
            }
        })
    });

    test.afterEach(() => {
        expect(pageErrors, 'no browser exception escapes the real editor lifecycle').toEqual([]);
        expect(monacoResponses.filter(response => response.status >= 400), 'all requested Monaco assets exist').toEqual([])
    });

    test('boots the Monaco build, its stylesheet and the initial editor before reporting mounted', async ({page}) => {
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

        expect(diagnostics, 'the build\'s language worker reads the live editor model').toEqual([]);

        // Only the TypeScript worker starts above, so the bundle every other label maps to is fetched.
        expect(await page.evaluate(labels => Promise.all(labels.map(async label =>
            `${label} ${(await fetch(Neo.main.addon.MonacoEditor.getWorkerUrl('workerMain.js', label))).status}`
        )), ['css', 'editorWorkerService', 'html', 'json', 'typescript']))
            .toEqual(['css 200', 'editorWorkerService 200', 'html 200', 'json 200', 'typescript 200']);

        await expect.poll(() => monacoResponses.find(response => response.url.endsWith('/dist/monaco/editor.css'))?.type)
            .toContain('text/css');
        expect(monacoRequests.filter(url => url.includes('/node_modules/monaco-editor/')), 'nothing loads from the installed package').toEqual([])
    });

    test('the editor executes the DOMPurify npm resolves for monaco-editor, not the copy Monaco embeds', async ({page}) => {
        // Read from the scripts the browser received. A dependency override alone moves the lockfile
        // and leaves the embedded copy running, and this is the arm that tells the two apart.
        const scripts  = [],
              executed = new Set();

        page.on('response', response => {
            MONACO_ASSET.test(response.url()) && response.headers()['content-type']?.includes('javascript') && scripts.push(response)
        });

        await page.goto(FIXTURE_URL);
        await expectEditor(page);

        for (const script of scripts) {
            for (const [, version] of (await script.text()).matchAll(SANITIZER_VERSION)) {
                executed.add(version)
            }
        }

        expect([...executed]).toEqual([NPM_SANITIZER])
    });

    test('HTML in hover markdown renders through the sanitizer, without its handlers or script links', async ({page}) => {
        await page.goto(FIXTURE_URL);
        await expectEditor(page);

        await page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            monaco.languages.registerHoverProvider('javascript', {
                provideHover: () => ({contents: [{
                    supportHtml: true,
                    value      : '<b>sanitized</b><img src="x" onerror="globalThis.monacoHoverBreach = 1"> [link](javascript:globalThis.monacoHoverBreach=2)'
                }]})
            });

            editor.focus();
            editor.setPosition({lineNumber: 1, column: 8});
            editor.trigger('test', 'editor.action.showHover', {})
        }, EDITOR_ID);

        const hover = page.locator('.monaco-hover').filter({has: page.locator('b', {hasText: 'sanitized'})});

        await expect(hover, 'the HTML reaches the hover as markup, not as text').toBeVisible();
        expect(await hover.evaluate(node => ({
            breach     : globalThis.monacoHoverBreach ?? null,
            handlers   : node.querySelectorAll('[onerror]').length,
            scriptLinks: [...node.querySelectorAll('a')].filter(link => /javascript:/i.test(`${link.getAttribute('href')} ${link.dataset.href}`)).length
        }))).toEqual({breach: null, handlers: 0, scriptLinks: 0})
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

        await page.route('**/dist/monaco/editor.mjs', async route => {
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

    test('theme awareness resolves through the component chain, not the null theme config (#18569)', async ({page}) => {
        // Asserted on the RENDERED node throughout. `editorTheme` was already the value the reader
        // never sees: the defect produced a light editor in a dark app, and a config assertion is
        // exactly what would have stayed green — `monaco.editor.setTheme` is global to the page, so
        // a correct config that never reaches creation looks identical from the worker side.
        // The rendered theme as a CLASS TOKEN, never a substring: `'vs-dark'.includes('vs')` is
        // true, so a `toContain('vs')` poll is satisfied by the dark state it is waiting to leave
        // and returns on its first evaluation. Exact token equality is what makes the poll wait.
        const themeToken = async () => {
            const cls = await page.locator(`#${EDITOR_ID} .monaco-editor`).getAttribute('class');

            return cls?.split(/\s+/).find(token => EDITOR_THEMES.includes(token)) ?? null
        };

        const setConfigs = async data => {
            const reply = await page.evaluate(config => Neo.worker.App.setConfigs(config), data);

            expect(reply?.data ?? reply).toMatchObject({success: true})
        };

        await page.goto(FIXTURE_URL, {waitUntil: 'domcontentloaded'});
        await expectEditor(page);
        await destroyEditor(page);

        // The host carries the theme; the editor is created underneath it and declares none of its
        // own. That is the whole shape of the defect — `container.Base#afterSetTheme` stamps live
        // items on a CHANGE and leaves construction to `createItem`, so an inheriting child's
        // `theme` config is null at exactly the moment `getInitialOptions` reads it.
        await setConfigs({id: HOST_ID, theme: 'neo-theme-neo-dark'});

        const reply = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            id               : EDITOR_ID,
            language         : 'javascript',
            ntype            : 'test-monaco-editor',
            parentId         : HOST_ID,
            testGeneration   : 'themed',
            useThemeAwareness: true,
            value            : 'const themed = 1;'
        });

        expect(reply?.data ?? reply).toMatchObject({success: true, id: EDITOR_ID});
        await expectEditor(page);

        // Correct AT CREATION, not corrected afterwards: nothing delays the create call any more,
        // so a fix which only fires on a later theme change would leave the first paint light —
        // and this assertion is what refuses that.
        expect(await themeToken(), 'a dark host creates a dark editor').toBe('vs-dark');
        expect((await readConfigs(page, EDITOR_ID, ['theme']))[0], 'and it inherits rather than declaring').toBeNull();

        // Both directions, on the same instance: a component hardcoded to `vs-dark` passes the
        // assertion above and fails here, which is the mirror of the bug being fixed.
        await setConfigs({id: HOST_ID, theme: 'neo-theme-neo-light'});
        await expect.poll(themeToken, {message: 'a live theme change repaints the editor'}).toBe('vs');

        // `neo-theme-cyberpunk` is dark — `--neo-background-color: #0d1117` — and says so nowhere in
        // its name. A substring test on the theme name hands it a LIGHT editor, which is the reported
        // symptom reproduced under a different theme by the code that fixes it. `themeMap` is what
        // makes the answer declared rather than guessed.
        await setConfigs({id: HOST_ID, theme: 'neo-theme-cyberpunk'});
        await expect.poll(themeToken, {message: 'a dark theme that is not named dark still reads dark'}).toBe('vs-dark');

        // The opt-out still opts out: awareness off pins the declared theme against a dark host.
        await setConfigs({id: EDITOR_ID, editorTheme: 'vs', useThemeAwareness: false});
        await setConfigs({id: HOST_ID, theme: 'neo-theme-neo-dark'});
        await expect.poll(themeToken, {message: 'useThemeAwareness:false ignores the host theme'}).toBe('vs');

        // An UNMAPPED theme falls back to the declared `editorTheme` rather than guessing, which is
        // what keeps `hc-black` and `hc-light` reachable — two of the four enum values a two-way
        // dark/light inference could never express.
        // Order matters and says something: turning awareness on under a MAPPED host re-resolves
        // `editorTheme` immediately, which is the contract — awareness means the theme decides. So
        // the host goes unmapped first, and only then is `hc-black` declared.
        await setConfigs({id: HOST_ID, theme: 'neo-theme-unmapped-by-design'});
        await setConfigs({id: EDITOR_ID, editorTheme: 'hc-black', useThemeAwareness: true});
        await expect.poll(themeToken, {message: 'an unmapped theme leaves the declared editorTheme standing'}).toBe('hc-black')
    });

    test('the actual Portal boot completes Monaco addon initialization even when home paints first', async ({page}) => {
        await page.goto('apps/portal/index.html#home', {waitUntil: 'domcontentloaded'});
        await expect(page.locator('.portal-main-content')).toBeVisible({timeout: 20000});

        // Home can paint while the addon's deferred preload still fails, so readiness is the boundary.
        await expect.poll(() => page.evaluate(() => !!globalThis.Neo?.main?.addon?.MonacoEditor?.isReady),
            {message: 'Portal Monaco preload completes through the Monaco build', timeout: 20000}).toBe(true);
        expect(await page.evaluate(() => typeof globalThis.monaco?.editor?.create)).toBe('function');
        await expect.poll(() => monacoResponses.find(response => response.url.endsWith('/dist/monaco/editor.css'))?.type)
            .toContain('text/css')
    });
});
