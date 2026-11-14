import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import http                      from 'node:http';
import os                        from 'node:os';
import path                      from 'node:path';
import {test, expect}            from '@playwright/test';
import {BROWSER_BUNDLES}         from '../../../../buildScripts/util/browserBundles.mjs';
import {withComposedNpmIgnore}   from '../../../../buildScripts/util/npmIgnoreComposition.mjs';

/**
 * @summary A consumer's `dist/esm` build, made by the engine exactly as npm packs it, booted headlessly.
 *
 * `unit/buildScripts/esmWorkspaceBuild.spec.mjs` proves every emitted import resolves, over a stub
 * engine. Resolving is necessary for a boot and not sufficient: an app that still imports part of the
 * engine from `node_modules/neo.mjs` resolves every path, mounts, and runs two engine graphs. So this
 * spec packs the real engine, extracts it into a workspace laid out the way create-app generates one,
 * runs that installed engine's build, and serves the workspace to boot both page forms.
 *
 * The tarball is extracted rather than installed: the package declares no runtime dependencies, and
 * the generated devDependency list would send an install to the registry. The build toolchain and Font
 * Awesome are what a consumer installs, so they are linked from this checkout instead. The extracted
 * engine generates its browser dependencies from those packages before building the workspace.
 */
const
    engineRoot    = path.resolve(import.meta.dirname, '../../../..'),
    ADDON_PACKAGE = '@fixture/native-hooks',
    ADDON_CLASS   = 'Fixture.main.addon.DeltaObserver',
    ADDON_PATH    = `node_modules/${ADDON_PACKAGE}/browser/hooks/DeltaObserver`,
    LINKED        = ['@fortawesome/fontawesome-free', 'acorn', 'astring', 'esbuild', 'fs-extra', 'html-minifier-terser', 'terser', 'webpack', 'webpack-hook-plugin', ...BROWSER_BUNDLES],
    MIME          = {'.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript'};

/**
 * @summary Writes create-app's generated app files around the extracted engine, plus a `components` root.
 * @param {String} workspace
 */
const createWorkspace = workspace => {
    const manifest = JSON.parse(fs.readFileSync(path.join(engineRoot, 'test/playwright/unit/buildScripts/fixtures/neoAppPackage.json'), 'utf8'));
    const write    = (file, content) => {
        fs.mkdirSync(path.dirname(path.join(workspace, file)), {recursive: true});
        fs.writeFileSync(path.join(workspace, file), typeof content === 'string' ? content : JSON.stringify(content, null, 4))
    };

    write('package.json', {
        ...manifest,
        dependencies: {...manifest.dependencies, [ADDON_PACKAGE]: '1.0.0'},
        neo         : {esmSourceRoots: ['components', 'resources']}
    });
    write(`node_modules/${ADDON_PACKAGE}/package.json`, {
        name: ADDON_PACKAGE, version: '1.0.0', type: 'module', neo: {mainAddons: ['browser/hooks']}
    });
    write(`node_modules/${ADDON_PACKAGE}/outside/Excluded.mjs`, 'export const outsideDeclaredRoot = true;\n');
    write(`${ADDON_PATH}.mjs`, [
        "import Neo from '../../../../neo.mjs/src/Neo.mjs';",
        "import CoreBase from '../../../../neo.mjs/src/core/Base.mjs';",
        "import Base from '../../../../neo.mjs/src/main/addon/Base.mjs';",
        "import DeltaUpdates from '../../../../neo.mjs/src/main/DeltaUpdates.mjs';",
        '',
        'class DeltaObserver extends Base {',
        `    static config = {className: '${ADDON_CLASS}', preloadFilesDelay: false}`,
        '',
        '    construct(config) {',
        '        super.construct(config);',
        '        this.receipt = {token: crypto.randomUUID(), moduleUrl: import.meta.url, engineIdentity: Neo.Main instanceof CoreBase, transitions: [], destroyed: false};',
        '        (globalThis.__packageAddonReceipts ??= []).push(this.receipt);',
        "        DeltaUpdates.on('update', this.onUpdate, this);",
        "        DeltaUpdates.on('updated', this.onUpdated, this)",
        '    }',
        '',
        '    onUpdate() {',
        "        this.beforeText = document.querySelector('p.greeting')?.textContent ?? null",
        '    }',
        '',
        '    onUpdated() {',
        "        const after = document.querySelector('p.greeting')?.textContent ?? null;",
        '        if (after !== this.beforeText) {',
        '            this.receipt.transitions.push({before: this.beforeText, after});',
        "            document.body.dataset.packageAddonText = after ?? ''",
        '        }',
        '    }',
        '',
        '    destroy() {',
        "        DeltaUpdates.un('update', this.onUpdate, this);",
        "        DeltaUpdates.un('updated', this.onUpdated, this);",
        '        this.receipt.destroyed = true;',
        '        super.destroy()',
        '    }',
        '}',
        '',
        'export default Neo.setupClass(DeltaObserver);',
        ''
    ].join('\n'));
    // create-app ships its own MicroLoader, and the generated page loads that copy, not the engine's.
    write('src/MicroLoader.mjs', "fetch('./neo-config.json').then(r => r.json()).then(d => {\n    self.Neo = {config: {...d}};\n    import(d.mainPath);\n});\n");
    // What `build-themes` leaves in a workspace; the App Worker fetches it on every boot.
    write('resources/theme-map.json', {Neo: {}, apps: {}});
    write('apps/myapp/index.html', '<!DOCTYPE HTML>\n<html>\n<head>\n    <meta charset="UTF-8">\n    <title>MyApp</title>\n</head>\n<body>\n    <script src="../../src/MicroLoader.mjs" type="module"></script>\n</body>\n</html>\n');
    write('apps/myapp/neo-config.json', {
        appPath       : '../../apps/myapp/app.mjs',
        basePath      : '../../',
        environment   : 'development',
        mainPath      : '../node_modules/neo.mjs/src/Main.mjs',
        themes        : [],
        workerBasePath: '../../node_modules/neo.mjs/src/worker/'
    });
    for (const mode of ['development', 'production']) {
        write(`apps/main-${mode}/index.html`, fs.readFileSync(path.join(workspace, 'apps/myapp/index.html'), 'utf8'));
        write(`apps/main-${mode}/neo-config.json`, {
            appPath : '../../apps/myapp/app.mjs',
            basePath: '../../',
            // Deliberately source App workers: this arm proves the actual Main bundle, not a full production app.
            environment   : 'development',
            mainPath      : `../dist/${mode}/main.js`,
            themes        : [],
            workerBasePath: '../../node_modules/neo.mjs/src/worker/'
        })
    }
    write('apps/myapp/app.mjs', "import Viewport from './view/Viewport.mjs';\n\nexport const onStart = () => Neo.app({\n    mainView: Viewport,\n    name    : 'MyApp'\n});\n");
    write('apps/myapp/view/Viewport.mjs', [
        "import BaseViewport from '../../../node_modules/neo.mjs/src/container/Viewport.mjs';",
        "import Greeting     from '../../../components/Greeting.mjs';",
        '',
        'class Viewport extends BaseViewport {',
        "    static config = {className: 'MyApp.view.Viewport', id: 'myapp-viewport', items: [{module: Greeting, id: 'myapp-greeting'}]}",
        '}',
        '',
        'export default Neo.setupClass(Viewport);',
        ''
    ].join('\n'));
    write('components/Greeting.mjs', [
        "import {defineComponent, html} from '../node_modules/neo.mjs/src/functional/_export.mjs';",
        '',
        'export default defineComponent({',
        "    config: {className: 'MyApp.component.Greeting', enableHtmlTemplates: true, greeting_: 'workspace'},",
        '    render(config) {',
        '        return html`<p class="greeting">Hello, ${config.greeting}!</p>`',
        '    }',
        '});',
        ''
    ].join('\n'));

    for (const name of LINKED) {
        const link = path.join(workspace, 'node_modules', name);

        fs.mkdirSync(path.dirname(link), {recursive: true});
        fs.symlinkSync(path.join(engineRoot, 'node_modules', name), link, 'junction')
    }
};

/**
 * @summary Builds the installed Engine's actual Main config; asset-copy hooks are replaced by one explicit config copy.
 * @param {String} workspace
 * @param {String} mode Development or production Webpack mode.
 * @returns {Object} The child process result, including build diagnostics.
 */
const buildMainBundle = (workspace, mode) => spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import path from 'node:path';
    import {pathToFileURL} from 'node:url';
    import webpack from 'webpack';

    const engine = path.resolve('node_modules/neo.mjs'),
          {default: config} = await import(pathToFileURL(path.join(engine,
              'buildScripts/webpack/${mode}/webpack.config.main.mjs')).href);

    config.plugins = config.plugins.filter(plugin => plugin.constructor?.name !== 'WebpackHookPlugin');
    const compiler = webpack(config);
    const stats = await new Promise((resolve, reject) => compiler.run((error, result) => error ? reject(error) : resolve(result)));
    await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
    if (stats.hasErrors()) {
        console.error(stats.toString({all: false, errors: true}));
        process.exitCode = 1
    } else {
        fs.copyFileSync(path.join(engine, 'src/DefaultConfig.mjs'), path.join(config.output.path, 'DefaultConfig.mjs'));
        console.log('MAIN-BUNDLE ' + JSON.stringify({mode: config.mode, output: config.output.path}))
    }
`], {cwd: workspace, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

/**
 * @summary Serves a directory with module-script MIME types, as a consumer's static host would.
 * @param {String} root
 * @returns {Promise<{origin: String, server: http.Server}>}
 */
const serve = async root => {
    const server = http.createServer((request, response) => {
        const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));

        if (!file.startsWith(root) || !fs.statSync(file, {throwIfNoEntry: false})?.isFile()) {
            response.writeHead(404).end();
            return
        }

        response.writeHead(200, {'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream'});
        fs.createReadStream(file).pipe(response)
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    return {origin: `http://127.0.0.1:${server.address().port}`, server}
};

/**
 * @summary Boots one page, then reports the modules it requested, what failed, and whether the viewport mounted.
 * @param {import('@playwright/test').Page} page
 * @param {String} url
 * @returns {Promise<{failures: String[], modules: String[], mounted: Boolean}>}
 */
const boot = async (page, url) => {
    const failures = [],
          modules  = [];

    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => response.status() >= 400 && failures.push(`${response.status()} ${response.url()}`));
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        /\.m?js$/.test(pathname) && modules.push(pathname)
    });

    await page.goto(url);
    await expect(page.locator('p.greeting'), 'the template from the extra source root renders').toHaveText('Hello, workspace!');

    const reply = await page.evaluate(() => Neo.worker.App.getConfigs({id: 'myapp-viewport', keys: ['mounted']}));

    return {failures, modules, mounted: (reply?.data ?? reply)[0]}
};

/**
 * @summary Imports twice through the actual Main API and observes the registered per-window instance.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
const importPackageAddon = page => page.evaluate(async ({name, className}) => {
    const firstImport  = await Neo.Main.importAddon({name}),
          first        = Neo.ns(className),
          secondImport = await Neo.Main.importAddon({name});

    return {
        imports     : [firstImport, secondImport],
        sameInstance: first === Neo.ns(className),
        registered  : Object.values(Neo.Main.addon).includes(first),
        receipts    : globalThis.__packageAddonReceipts
    }
}, {name: ADDON_PATH, className: ADDON_CLASS});

/**
 * @summary Uses this packed-workspace fixture's App proxy to cause a real VDOM/Main/DOM update.
 * @param {import('@playwright/test').Page} page
 * @param {String} greeting
 */
const changeGreeting = async (page, greeting) => {
    const reply = await page.evaluate(value => Neo.worker.App.setConfigs({id: 'myapp-greeting', greeting: value}), greeting);

    expect((reply?.data ?? reply).success, 'the owning App Worker accepts the config change').toBe(true);
    await expect(page.locator('p.greeting')).toHaveText(`Hello, ${greeting}!`);

    const state = await page.evaluate(() => Neo.worker.App.getConfigs({id: 'myapp-greeting', keys: ['greeting']}));
    expect((state?.data ?? state)[0], 'worker state and the rendered DOM agree').toBe(greeting)
};

/**
 * @summary Reads callback receipts kept outside the addon so destruction cannot erase its last observation.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object[]>}
 */
const packageReceipts = page => page.evaluate(() => globalThis.__packageAddonReceipts);

test.describe('dist/esm: the packed engine builds a greenfield workspace, and both page forms boot', () => {
    test.describe.configure({mode: 'serial'});

    let build, mainBuilds, origin, root, server, workspace;

    test.beforeAll(async () => {
        root      = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-esm-boot-')));
        workspace = path.join(root, 'workspace');

        // Skipping the lifecycle skips `prepack` too, so the .npmignore composition is applied here: without it
        // the pack takes everything the working tree holds and git ignores.
        const engine = path.join(workspace, 'node_modules/neo.mjs'),
              packed = withComposedNpmIgnore(engineRoot, () => execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--loglevel=error', '--pack-destination', root],
                  {cwd: engineRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}));

        fs.mkdirSync(engine, {recursive: true});
        execFileSync('tar', ['-xzf', path.join(root, JSON.parse(packed)[0].filename), '-C', engine, '--strip-components=1']);
        createWorkspace(workspace);

        expect(fs.existsSync(path.join(engine, 'dist')), 'the packed engine carries no generated browser dependencies').toBe(false);

        for (const name of BROWSER_BUNDLES) {
            execFileSync(process.execPath, [path.join(engine, `buildScripts/build/${name}.mjs`)], {cwd: workspace, encoding: 'utf8'})
        }

        build = spawnSync(process.execPath, [path.join(engine, 'buildScripts/build/esmodules.mjs')], {cwd: workspace, encoding: 'utf8'});
        mainBuilds = ['development', 'production'].map(mode => ({mode, result: buildMainBundle(workspace, mode)}));
        ({origin, server} = await serve(workspace))
    });

    test.afterAll(() => {
        server?.close();
        root && fs.rmSync(root, {force: true, recursive: true})
    });

    test('the installed engine builds the workspace and compiles its html template', () => {
        expect(build.status, `${build.stdout}${build.stderr}`).toBe(0);
        for (const {mode, result} of mainBuilds) {
            expect(result.status, `${mode} Main bundle:\n${result.stdout}${result.stderr}`).toBe(0)
        }

        const emitted = fs.readFileSync(path.join(workspace, 'dist/esm/components/Greeting.mjs'), 'utf8');

        // Compiled at build time, through the parse5 bundle generated by the installed engine.
        expect(emitted).toContain('createVdom');
        expect(emitted).not.toContain('<p class="greeting">');
        expect(fs.existsSync(path.join(workspace, 'dist/esm', `node_modules/${ADDON_PACKAGE}/outside/Excluded.mjs`)),
            'an installed dependency does not admit files outside its declared Main roots').toBe(false)
    });

    test('the dist/esm page boots from its own tree, without a module from node_modules/neo.mjs', async ({page}) => {
        const {failures, modules, mounted} = await boot(page, `${origin}/dist/esm/apps/myapp/index.html`);

        expect(mounted, 'the App Worker mounted the main view').toBe(true);
        expect(failures).toEqual([]);
        expect(modules.filter(url => url.startsWith('/dist/esm/src/')).length, 'the engine loads from the emitted tree').toBeGreaterThan(0);
        expect(modules.filter(url => url.includes('/node_modules/neo.mjs/')), 'one engine graph').toEqual([])
    });

    test('the same workspace boots from source, where HtmlTemplateProcessor parses the template at runtime', async ({page}) => {
        const {failures, modules, mounted} = await boot(page, `${origin}/apps/myapp/index.html`);

        expect(mounted).toBe(true);
        expect(failures).toEqual([]);
        // Only development loads the runtime processor, and its parse5 import must reach the generated bundle.
        expect(modules).toEqual(expect.arrayContaining([
            '/node_modules/neo.mjs/src/functional/util/HtmlTemplateProcessor.mjs',
            '/node_modules/neo.mjs/dist/parse5.mjs'
        ]))
    });

    for (const {mode, bundleMode} of [
        {mode: 'source'},
        {mode: 'emitted'},
        {mode: 'development Main bundle with source App workers', bundleMode: 'development'},
        {mode: 'production Main bundle with source App workers', bundleMode: 'production'}
    ]) {
        test(`${mode}: a package Main addon observes two windows, unregisters, and reloads without leaking state`, async ({page}) => {
            const second       = await page.context().newPage(),
                  prefix       = mode === 'emitted' ? '/dist/esm' : '',
                  url          = bundleMode ? `${origin}/apps/main-${bundleMode}/index.html` : `${origin}${prefix}/apps/myapp/index.html`,
                  addonUrl     = `${origin}${prefix}/${ADDON_PATH}.mjs`,
                  expectLoaded = loaded => {
                      expect(loaded).toMatchObject({imports: [true, true], sameInstance: true, registered: true});
                      expect(loaded.receipts).toHaveLength(1);
                      expect(loaded.receipts[0]).toMatchObject({engineIdentity: true, transitions: [], destroyed: false});
                      if (bundleMode) {
                          expect(loaded.receipts[0].moduleUrl.startsWith(`${origin}/dist/${bundleMode}/`),
                              'the addon executes from a Main bundle artifact').toBe(true);
                          expect(loaded.receipts[0].moduleUrl).toMatch(/\.js$/)
                      } else {
                          expect(loaded.receipts[0].moduleUrl).toBe(addonUrl)
                      }
                  };

            try {
                const firstBoot  = await boot(page, url),
                      secondBoot = await boot(second, url),
                      firstLoad  = await importPackageAddon(page),
                      secondLoad = await importPackageAddon(second);

                expect(firstBoot.mounted).toBe(true);
                expect(secondBoot.mounted).toBe(true);
                [firstLoad, secondLoad].forEach(expectLoaded);
                expect(firstLoad.receipts[0].token).not.toBe(secondLoad.receipts[0].token);

                await changeGreeting(page, 'first-one');
                let firstReceipt = (await packageReceipts(page))[0];
                expect(firstReceipt.transitions).toEqual([{before: 'Hello, workspace!', after: 'Hello, first-one!'}]);
                await expect(page.locator('body')).toHaveAttribute('data-package-addon-text', 'Hello, first-one!');
                expect(await packageReceipts(second), 'an update in the first window never reaches the second observer')
                    .toEqual(secondLoad.receipts);

                await changeGreeting(second, 'second-one');
                expect((await packageReceipts(second))[0].transitions).toEqual([
                    {before: 'Hello, workspace!', after: 'Hello, second-one!'}
                ]);
                expect(await packageReceipts(page), 'the second window owns a separate DeltaUpdates stream').toEqual([firstReceipt]);

                const repeated = await importPackageAddon(page);
                expect(repeated.receipts).toHaveLength(1);
                expect(repeated.receipts[0].token).toBe(firstLoad.receipts[0].token);
                await changeGreeting(page, 'first-two');
                firstReceipt = (await packageReceipts(page))[0];
                expect(firstReceipt.transitions).toEqual([
                    {before: 'Hello, workspace!', after: 'Hello, first-one!'},
                    {before: 'Hello, first-one!', after: 'Hello, first-two!'}
                ]);
                await expect(page.locator('body')).toHaveAttribute('data-package-addon-text', 'Hello, first-two!');

                await page.evaluate(className => Neo.ns(className).destroy(), ADDON_CLASS);
                const retired = await packageReceipts(page);
                expect(retired[0].destroyed).toBe(true);
                await changeGreeting(page, 'after-destroy');
                expect(await packageReceipts(page), 'the DOM still updates after both addon listeners are removed').toEqual(retired);
                await expect(page.locator('body')).toHaveAttribute('data-package-addon-text', 'Hello, first-two!');

                await changeGreeting(second, 'second-two');
                const secondBeforeReload = await packageReceipts(second);
                expect(secondBeforeReload[0].destroyed).toBe(false);
                expect(secondBeforeReload[0].transitions).toEqual([
                    {before: 'Hello, workspace!', after: 'Hello, second-one!'},
                    {before: 'Hello, second-one!', after: 'Hello, second-two!'}
                ]);

                await page.reload();
                await expect(page.locator('p.greeting')).toHaveText('Hello, workspace!');
                const reloaded = await importPackageAddon(page);
                expectLoaded(reloaded);
                expect(reloaded.receipts[0].token).not.toBe(firstLoad.receipts[0].token);
                await changeGreeting(page, 'remounted');
                expect((await packageReceipts(page))[0].transitions).toEqual([
                    {before: 'Hello, workspace!', after: 'Hello, remounted!'}
                ]);
                await expect(page.locator('body')).toHaveAttribute('data-package-addon-text', 'Hello, remounted!');
                expect(await packageReceipts(second), 'reloading the first realm leaves the second instance intact')
                    .toEqual(secondBeforeReload);

                for (const {failures, modules} of [firstBoot, secondBoot]) {
                    expect(failures).toEqual([]);
                    if (bundleMode) {
                        expect(modules).toContain(`/dist/${bundleMode}/main.js`);
                        expect(modules).toContain(`/dist/${bundleMode}/DefaultConfig.mjs`);
                        expect(modules.filter(module => module.includes(`/${ADDON_PACKAGE}/`)),
                            'the package addon comes from the bundle, with no raw-module fallback').toEqual([]);
                        expect(modules.some(module => module.startsWith(`/dist/${bundleMode}/chunks/main/`)),
                            'Main loads its actual asynchronous addon chunk').toBe(true)
                    } else {
                        expect(modules).toContain(`${prefix}/${ADDON_PATH}.mjs`);
                        expect(modules.filter(module => module.endsWith('/DeltaObserver.mjs'))
                            .every(module => module === `${prefix}/${ADDON_PATH}.mjs`), 'the addon stays in its page\'s module tree').toBe(true)
                    }
                    if (mode === 'emitted') {
                        expect(modules.filter(module => module.includes('/node_modules/neo.mjs/')),
                            'the addon imports Base and DeltaUpdates from the same emitted Engine graph').toEqual([])
                    } else if (!bundleMode) {
                        expect(modules).toContain('/node_modules/neo.mjs/src/main/addon/Base.mjs');
                        expect(modules).toContain('/node_modules/neo.mjs/src/main/DeltaUpdates.mjs')
                    }
                }
            } finally {
                await second.close()
            }
        })
    }

    test('a split engine graph still mounts, so only the module assertion can catch one', async ({page}) => {
        const split = path.join(workspace, 'dist/esm-split'),
              view  = path.join(split, 'apps/myapp/view/Viewport.mjs');

        fs.cpSync(path.join(workspace, 'dist/esm'), split, {recursive: true});

        const source = fs.readFileSync(view, 'utf8'),
              mutant = source.replace('"../../../src/container/Viewport.mjs"', '"../../../../../node_modules/neo.mjs/src/container/Viewport.mjs"');

        expect(mutant, 'the emitted viewport import is re-pointed at the installed engine').not.toBe(source);
        fs.writeFileSync(view, mutant);

        const {modules, mounted} = await boot(page, `${origin}/dist/esm-split/apps/myapp/index.html`);

        expect(mounted).toBe(true);
        expect(modules.filter(url => url.includes('/node_modules/neo.mjs/')).length).toBeGreaterThan(0)
    });
});
