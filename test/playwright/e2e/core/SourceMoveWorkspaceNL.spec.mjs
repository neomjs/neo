import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import http           from 'node:http';
import os             from 'node:os';
import path           from 'node:path';
import {expect, test} from '../../fixtures.mjs';

const engineRoot = path.resolve(import.meta.dirname, '../../../..'),
    source       = 'examples/serverside/toolbarItems',
    destination  = 'examples/reorganized/deep/serverside/toolbarItems',
    exampleFiles = ['app.mjs', 'Overwrites.mjs', 'Viewport.mjs', 'index.html', 'neo-config.json',
        'resources/data/toolbar-items.json'],
    mime = {'.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.mjs': 'text/javascript',
        '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'};

/**
 * @summary Copies the real example into a consumer workspace, adapting its original Engine-relative references.
 * Compiled base styles support native interaction; this test does not claim to rebuild moved class CSS.
 * @param {String} workspace Temporary owned source root.
 * @returns {void}
 */
function prepareWorkspace(workspace) {
    const write = (relative, value) => {
        const file = path.join(workspace, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 4))
    };

    for (const relative of exampleFiles) {
        const target = path.join(workspace, source, relative);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.copyFileSync(path.join(engineRoot, source, relative), target)
    }
    write('package.json', {name: 'source-move-workspace', type: 'module'});
    fs.mkdirSync(path.join(workspace, 'node_modules/@fortawesome'), {recursive: true});
    fs.symlinkSync(engineRoot, path.join(workspace, 'node_modules/neo.mjs'), 'junction');
    fs.symlinkSync(path.join(engineRoot, 'node_modules/@fortawesome/fontawesome-free'),
        path.join(workspace, 'node_modules/@fortawesome/fontawesome-free'), 'junction');

    const viewport = fs.readFileSync(path.join(workspace, source, 'Viewport.mjs'), 'utf8'),
        html       = fs.readFileSync(path.join(workspace, source, 'index.html'), 'utf8'),
        config     = JSON.parse(fs.readFileSync(path.join(workspace, source, 'neo-config.json'), 'utf8'));

    write(source + '/Viewport.mjs', viewport
        .replaceAll('../../../src/', '../../../node_modules/neo.mjs/src/')
        .replace(`url: '../../${source}/resources/data/toolbar-items.json'`,
            `url: '../../../../${source}/resources/data/toolbar-items.json'`));
    write(source + '/index.html', html.replace('../../../src/MicroLoader.mjs',
        '../../../node_modules/neo.mjs/src/MicroLoader.mjs'));
    write(source + '/neo-config.json', {...config,
        appPath         : '../../' + source + '/app.mjs', basePath: '../../../', mainPath: './Main.mjs',
        workerBasePath  : '../../../node_modules/neo.mjs/src/worker/', themes: ['neo-theme-light'],
        useSharedWorkers: false, useAiClient: true, useServiceWorker: false
    });

    for (const folder of ['src', 'theme-light']) {
        fs.cpSync(path.join(engineRoot, 'dist/development/css', folder),
            path.join(workspace, 'dist/development/css', folder), {recursive: true})
    }
    fs.mkdirSync(path.join(workspace, 'resources'), {recursive: true});
    fs.copyFileSync(path.join(engineRoot, 'resources/theme-map.json'), path.join(workspace, 'resources/theme-map.json'))
}

/**
 * @summary Serves only the temporary workspace, following its explicit read-only dependency links and recording requests.
 * @param {String} workspace Static root.
 * @param {Object[]} requests Server-side receipt shared by both browser phases.
 * @returns {http.Server} Unstarted HTTP server, owned by the test's finally block.
 */
function createServer(workspace, requests) {
    return http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname),
            file       = path.resolve(workspace, '.' + pathname),
            receipt    = {path: pathname, status: 200};
        requests.push(receipt);

        if (!file.startsWith(workspace + path.sep) || !fs.statSync(file, {throwIfNoEntry: false})?.isFile()) {
            receipt.status = 404;
            response.writeHead(404).end();
            return
        }
        response.writeHead(200, {'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
        fs.createReadStream(file).pipe(response)
    })
}

test.describe('source relocation in a real consumer workspace', () => {
    test.use({viewport: {width: 1280, height: 800}});

    test('the CLI preserves a native loadItems interaction before and after a folder move', async ({page, neuralLink}, testInfo) => {
        const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-source-move-browser-')),
            requests    = [];
        let server;

        try {
            prepareWorkspace(workspace);
            server = createServer(workspace, requests);
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(0, '127.0.0.1', resolve)
            });
            const origin = `http://127.0.0.1:${server.address().port}`;
            await neuralLink.routeConfig(page, config => ({...config,
                useSharedWorkers: false, useAiClient: true, useServiceWorker: false
            }));

            /**
             * @summary Clicks a fresh worker's semantic load button and verifies its own source/data request path.
             * @param {String} directory Current workspace example directory.
             * @param {String} className Expected Viewport canonical name.
             * @param {String} phase Screenshot and receipt label.
             * @returns {Promise<String>} Identity-bound App Worker session id.
             */
            const exercise = async (directory, className, phase) => {
                const requestStart = requests.length;
                await page.goto(`${origin}/${directory}/index.html`);
                const app = await neuralLink.connectToApp('Neo.examples.serverside.toolbarItems');
                let viewport, toolbar, button;

                await expect.poll(async () => {
                    [viewport] = await app.queryComponent({ntype: 'viewport'}, ['className', 'mounted']);
                    [toolbar] = await app.queryComponent({ntype: 'toolbar', reference: 'toolbar'}, ['items.length', 'mounted']);
                    [button] = await app.queryComponent({ntype: 'button', text: 'Load Toolbar Items'}, ['disabled', 'mounted']);
                    return Boolean(viewport?.properties.mounted && toolbar?.properties.mounted && button?.properties.mounted)
                }, {message: `${phase}: the real example mounts in its own worker`, timeout: 30000}).toBe(true);

                expect(viewport.properties.className).toBe(className);
                expect(toolbar.properties['items.length']).toBe(0);
                expect(button.properties.disabled).toBe(false);
                const buttonNode = page.locator(`[id="${button.id}"]`),
                    toolbarNode  = page.locator(`[id="${toolbar.id}"]`);
                await expect(buttonNode).toBeVisible();
                await buttonNode.click();

                await expect.poll(async () => {
                    const [toolbarState, buttonState] = await Promise.all([
                        app.getComponent(toolbar.id, ['items.length']), app.getComponent(button.id, ['disabled'])
                    ]);
                    return {items: toolbarState['items.length'], disabled: buttonState.disabled}
                }, {message: `${phase}: the native click loads nine items and disables the trigger`})
                    .toEqual({items: 9, disabled: true});
                await expect(buttonNode).toBeDisabled();
                const buttons = (await app.queryComponent({ntype: 'button'}, ['parent.id', 'text']))
                    .filter(item => item.properties['parent.id'] === toolbar.id);
                expect(buttons).toHaveLength(8);
                for (const label of ['Neo.mjs', 'Learn', 'Blog', 'Examples', 'Services']) {
                    expect(buttons.map(item => item.properties.text)).toContain(label);
                    await expect(toolbarNode.getByRole('link', {name: label, exact: true})).toBeVisible()
                }

                const phaseRequests = requests.slice(requestStart), paths = phaseRequests.map(item => item.path);
                expect(phaseRequests.filter(item => item.status >= 400), `${phase}: every served resource resolves`).toEqual([]);
                expect(paths.filter(value => value.endsWith('/resources/data/toolbar-items.json')))
                    .toEqual([`/${directory}/resources/data/toolbar-items.json`]);
                expect(paths.filter(value => value.startsWith('/node_modules/neo.mjs/examples/')),
                    'the installed original must not mask a stale workspace reference').toEqual([]);
                expect(paths).toEqual(expect.arrayContaining([
                    `/${directory}/app.mjs`, `/${directory}/Viewport.mjs`, `/${directory}/Overwrites.mjs`
                ]));
                await testInfo.attach(`${phase}-requests`, {body: JSON.stringify(phaseRequests, null, 2), contentType: 'application/json'});
                await page.screenshot({path: testInfo.outputPath(`${phase}-toolbar.png`)});
                return app.sessionId
            };

            const beforeSession = await exercise(source, 'Neo.examples.serverside.toolbarItems.Viewport', 'before');
            await page.goto('about:blank');
            const move = spawnSync(process.execPath, [path.join(engineRoot, 'buildScripts/create/move.mjs'),
                '--root', workspace, '--from', source, '--to', destination, '--apply', '--json'],
                {cwd: workspace, encoding: 'utf8', timeout: 30000});
            expect(move.status, move.stdout + move.stderr).toBe(0);
            const receipt = JSON.parse(move.stdout);
            expect(receipt.blockers).toEqual([]);
            expect(receipt.applied.moved).toBeGreaterThan(0);
            expect(fs.existsSync(path.join(workspace, source))).toBe(false);
            await testInfo.attach('move-plan', {body: move.stdout, contentType: 'application/json'});

            const afterSession = await exercise(destination,
                'Neo.examples.reorganized.deep.serverside.toolbarItems.Viewport', 'after');
            expect(afterSession, 'the second arm binds a newly booted App Worker').not.toBe(beforeSession)
        } finally {
            try {
                if (!page.isClosed() && page.url() !== 'about:blank') await page.goto('about:blank')
            } finally {
                try {
                    if (server?.listening) {
                        const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
                        server.closeAllConnections();
                        await closed
                    }
                } finally {
                    fs.rmSync(workspace, {recursive: true, force: true})
                }
            }
        }
    })
});
