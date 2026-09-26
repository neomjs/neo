import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import http                      from 'node:http';
import os                        from 'node:os';
import path                      from 'node:path';
import {test, expect}            from '@playwright/test';
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
 * Awesome are what a consumer installs, so they are linked from this checkout instead.
 */
const
    engineRoot = path.resolve(import.meta.dirname, '../../../..'),
    LINKED     = ['@fortawesome/fontawesome-free', 'acorn', 'astring', 'fs-extra', 'html-minifier-terser', 'terser'],
    MIME       = {'.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.mjs': 'text/javascript'};

/**
 * @summary Writes create-app's generated app files around the extracted engine, plus a `components` root.
 * @param {String} workspace
 */
const createWorkspace = workspace => {
    const write = (file, content) => {
        fs.mkdirSync(path.dirname(path.join(workspace, file)), {recursive: true});
        fs.writeFileSync(path.join(workspace, file), typeof content === 'string' ? content : JSON.stringify(content, null, 4))
    };

    write('package.json', {
        ...JSON.parse(fs.readFileSync(path.join(engineRoot, 'test/playwright/unit/buildScripts/fixtures/neoAppPackage.json'), 'utf8')),
        neo: {esmSourceRoots: ['components', 'resources']}
    });
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
    write('apps/myapp/app.mjs', "import Viewport from './view/Viewport.mjs';\n\nexport const onStart = () => Neo.app({\n    mainView: Viewport,\n    name    : 'MyApp'\n});\n");
    write('apps/myapp/view/Viewport.mjs', [
        "import BaseViewport from '../../../node_modules/neo.mjs/src/container/Viewport.mjs';",
        "import Greeting     from '../../../components/Greeting.mjs';",
        '',
        'class Viewport extends BaseViewport {',
        "    static config = {className: 'MyApp.view.Viewport', id: 'myapp-viewport', items: [{module: Greeting}]}",
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
    page.on('request', request => request.url().endsWith('.mjs') && modules.push(new URL(request.url()).pathname));

    await page.goto(url);
    await expect(page.locator('p.greeting'), 'the template from the extra source root renders').toHaveText('Hello, workspace!');

    const reply = await page.evaluate(() => Neo.worker.App.getConfigs({id: 'myapp-viewport', keys: ['mounted']}));

    return {failures, modules, mounted: (reply?.data ?? reply)[0]}
};

test.describe('dist/esm: the packed engine builds a greenfield workspace, and both page forms boot', () => {
    test.describe.configure({mode: 'serial'});

    let build, origin, root, server, workspace;

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

        build = spawnSync(process.execPath, [path.join(engine, 'buildScripts/build/esmodules.mjs')], {cwd: workspace, encoding: 'utf8'});
        ({origin, server} = await serve(workspace))
    });

    test.afterAll(() => {
        server?.close();
        root && fs.rmSync(root, {force: true, recursive: true})
    });

    test('the installed engine builds the workspace and compiles its html template', () => {
        expect(build.status, `${build.stdout}${build.stderr}`).toBe(0);

        const emitted = fs.readFileSync(path.join(workspace, 'dist/esm/components/Greeting.mjs'), 'utf8');

        // Compiled at build time, through the parse5 bundle the package ships.
        expect(emitted).toContain('createVdom');
        expect(emitted).not.toContain('<p class="greeting">')
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
        // Only development loads the runtime processor, and its parse5 import must reach the packed bundle.
        expect(modules).toEqual(expect.arrayContaining([
            '/node_modules/neo.mjs/src/functional/util/HtmlTemplateProcessor.mjs',
            '/node_modules/neo.mjs/dist/parse5.mjs'
        ]))
    });

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
