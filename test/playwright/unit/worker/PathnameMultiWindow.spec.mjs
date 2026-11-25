import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';

const
    root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    execute = promisify(execFile);

/**
 * @summary Runs a multi-window SharedWorker scenario in an isolated Node process over real App worker,
 * HashHistory, Controller, Button, ContentComponent, Markdown, and RuntimeService classes.
 * @param {String} body
 * @returns {Promise<Object>}
 */
async function runSharedWorkerCase(body) {
    const script = `
        import Neo       from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup}   from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true, useSharedWorkers: true}});

        globalThis.postMessage = () => {};
        globalThis.window      = new EventTarget();
        globalThis.document    = Object.assign(new EventTarget(), {body: new EventTarget(), documentElement: {}});

        delete Neo.worker.App;
        delete Neo.config.windowId;
        delete Neo.config.hash;
        Neo.apps          = {};
        Neo.windowConfigs = {};

        const mainSetRouteCalls = [];
        Neo.Main = {
            getWindowData: async () => null,
            setRoute     : payload => mainSetRouteCalls.push(payload)
        };

        const
            {default: app}              = await import('./src/worker/App.mjs'),
            {default: HashHistory}      = await import('./src/util/HashHistory.mjs'),
            {default: ControllerBase}   = await import('./src/controller/Base.mjs'),
            {default: ButtonBase}       = await import('./src/button/Base.mjs'),
            {default: ContentComponent} = await import('./src/app/content/Component.mjs'),
            {default: Markdown}         = await import('./src/component/Markdown.mjs'),
            {default: RuntimeService}   = await import('./src/ai/client/RuntimeService.mjs');

        Object.assign(app, {
            isSharedWorker   : true,
            ports            : [],
            promises         : {},
            themeMapFetchStarted: true
        });

        class WindowRouteController extends ControllerBase {
            static config = {
                className  : 'Test.Unit.Worker.PathnameMultiWindow.Controller',
                defaultHash: '/dashboard',
                routes     : {
                    '/examples': 'onExamples',
                    '/learn'   : 'onLearn',
                    '/services': 'onServices'
                }
            }

            handled = []

            onExamples(params, value) {
                this.handled.push(['examples', value.hashString, value.search ?? null])
            }

            onLearn(params, value) {
                this.handled.push(['learn', value.hashString, value.search ?? null])
            }

            onServices(params, value) {
                this.handled.push(['services', value.hashString, value.search ?? null])
            }
        }

        Neo.setupClass(WindowRouteController);

        const controllers = {};
        app.importApp = async appPath => ({
            onStart() {
                const windowId = Neo.bootingWindowId;
                Neo.apps[windowId] = {
                    fire             : () => {},
                    isMounted        : () => true,
                    name             : appPath,
                    on               : () => {},
                    un               : () => {},
                    vnodeInitialising: false,
                    windowId
                };
                controllers[windowId] = Neo.create(WindowRouteController, {
                    appName: appPath,
                    windowId
                })
            }
        });

        const registerAndBootWindow = cfg => {
            const port = {appNames: new Set(), id: 'port-' + cfg.windowId, port: {close() {}, postMessage() {}}, windowId: null};
            app.ports.push(port);
            app.onRegisterNeoConfig({data: cfg}, port);
            return app.onLoadApplication({windowId: cfg.windowId})
        };

        const report = {};

        ${body}

        console.log('PROBE ' + JSON.stringify(report));
        process.exit(0);
    `;

    const {stdout} = await execute(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root, encoding: 'utf8', timeout: 15000
    });

    return JSON.parse(stdout.split('\n').find(line => line.startsWith('PROBE ')).slice(6))
}

function multiWindowScenarioBody(order) {
    const configs = {
        path: `{
            appPath       : 'AlphaApp',
            environment   : 'development',
            hash          : {hash: {view: 'compact'}, hashString: '/learn', query: {view: 'compact'}, search: 'view=compact', windowId: 'win-path'},
            routerBasePath: '/alpha',
            routerMode    : 'pathname',
            useSharedWorkers: true,
            windowId      : 'win-path'
        }`,
        hash: `{
            appPath       : 'LegacyApp',
            environment   : 'development',
            hash          : {hash: {}, hashString: '/examples', windowId: 'win-hash'},
            routerBasePath: '',
            routerMode    : 'hash',
            useSharedWorkers: true,
            windowId      : 'win-hash'
        }`,
        empty: `{
            appPath       : 'ChildApp',
            environment   : 'development',
            hash          : null,
            routerBasePath: '/alpha',
            routerMode    : 'pathname',
            useSharedWorkers: true,
            windowId      : 'win-empty'
        }`
    };

    const sequence = order.map(key => `registerAndBootWindow(${configs[key]})`).join(',\n            ');

    return `
        await Promise.all([
            ${sequence}
        ]);
        await new Promise(resolve => setTimeout(resolve, 20));

        // Verify root '/' fallback in controller/Base respects per-window routerMode
        HashHistory.push({hash: {}, hashString: '/', query: {}, search: '', windowId: 'win-empty'});
        HashHistory.push({hash: {}, hashString: '/', windowId: 'win-hash'});

        const btnPath = Neo.create(ButtonBase, {
            appName : 'AlphaApp',
            route   : '/learn',
            windowId: 'win-path'
        });
        const btnHash = Neo.create(ButtonBase, {
            appName : 'LegacyApp',
            route   : '/learn',
            windowId: 'win-hash'
        });
        const hrefBeforeRetarget = btnHash.getVdomRoot().href;
        btnHash.windowId = 'win-path';
        const hrefAfterRetarget = btnHash.getVdomRoot().href;

        const contentPath = Neo.create(ContentComponent, {
            appName            : 'AlphaApp',
            contentRoute       : '#/learn/',
            record             : {id: 'guides/Intro'},
            updateSectionsStore: false,
            windowId           : 'win-path'
        });
        const contentHash = Neo.create(ContentComponent, {
            appName            : 'LegacyApp',
            contentRoute       : '#/learn/',
            record             : {id: 'guides/Intro'},
            updateSectionsStore: false,
            windowId           : 'win-hash'
        });

        const mdPath = Neo.create(Markdown, {
            appName         : 'AlphaApp',
            issuesUrl       : '#/news/tickets/',
            replaceTicketIds: true,
            value           : 'See #42',
            windowId        : 'win-path'
        });
        const mdHash = Neo.create(Markdown, {
            appName         : 'LegacyApp',
            issuesUrl       : '#/news/tickets/',
            replaceTicketIds: true,
            value           : 'See #42',
            windowId        : 'win-hash'
        });
        const mdExternal = Neo.create(Markdown, {
            appName         : 'AlphaApp',
            issuesUrl       : 'https://github.com/neomjs/neo/issues/',
            replaceTicketIds: true,
            value           : 'See #42',
            windowId        : 'win-path'
        });

        await new Promise(resolve => setTimeout(resolve, 30));

        const runtime = Neo.create(RuntimeService);

        report.globalWindowId    = Neo.config.windowId;
        report.globalRouterMode  = Neo.config.routerMode;
        report.handled           = {
            empty: controllers['win-empty'].handled,
            hash : controllers['win-hash'].handled,
            path : controllers['win-path'].handled
        };
        report.mainSetRouteCalls = mainSetRouteCalls;
        report.buttons           = {
            hashBeforeRetarget: hrefBeforeRetarget,
            hashAfterRetarget : hrefAfterRetarget,
            path              : btnPath.getVdomRoot().href
        };
        report.rewrittenLinks    = {
            hash: contentHash.rewriteLinks('<a href="./Routing.md#search">Routing</a>'),
            path: contentPath.rewriteLinks('<a href="./Routing.md#search">Routing</a>')
        };
        report.markdownTickets   = {
            external: mdExternal.html,
            hash    : mdHash.html,
            path    : mdPath.html
        };
        report.routeHistory      = runtime.getRouteHistory({windowId: 'win-path'});
        report.runtimeSetRoute   = runtime.setRoute({hash: '/services?tab=advisory', windowId: 'win-path'});
        report.clearedBootHashes = {
            global  : Neo.config.hash ?? null,
            winHash : Neo.windowConfigs['win-hash'].hash ?? null,
            winPath : Neo.windowConfigs['win-path'].hash ?? null
        };
    `;
}

test.describe('SharedWorker per-windowId pathname and hash routing parity', () => {
    for (const [label, order, expectedGlobalMode] of [
        ['pathname window first, hash window second, hashless child third', ['path', 'hash', 'empty'], 'pathname'],
        ['hash window first, hashless child second, pathname window third', ['hash', 'empty', 'path'], 'hash']
    ]) {
        test(`isolates route seeding, defaultHash, and link formatting (${label})`, async () => {
            const report = await runSharedWorkerCase(multiWindowScenarioBody(order));

            expect(report.globalRouterMode).toBe(expectedGlobalMode);
            expect(report.handled).toEqual({
                empty: [],
                hash : [['examples', '/examples', null]],
                path : [['learn', '/learn', 'view=compact']]
            });

            // Only 'win-empty' fires defaultHash in initAsync() and root '/' pathname fallback — never 'win-path' or 'win-hash'
            expect(report.mainSetRouteCalls).toEqual([
                {value: '/dashboard', windowId: 'win-empty'},
                {replace: true, value: '/dashboard', windowId: 'win-empty'},
                {value: '/services?tab=advisory', windowId: 'win-path'}
            ]);

            expect(report.buttons).toEqual({
                hashAfterRetarget : '/alpha/learn',
                hashBeforeRetarget: '#/learn',
                path              : '/alpha/learn'
            });

            expect(report.rewrittenLinks).toEqual({
                hash: '<a href="#/learn/guides/Routing#search">Routing</a>',
                path: '<a href="/alpha/learn/guides/Routing#search">Routing</a>'
            });

            expect(report.markdownTickets.path).toContain('<a href="/alpha/news/tickets/42">#42</a>');
            expect(report.markdownTickets.path).not.toContain('target="_blank"');
            expect(report.markdownTickets.hash).toContain('<a href="#/news/tickets/42">#42</a>');
            expect(report.markdownTickets.hash).not.toContain('target="_blank"');
            expect(report.markdownTickets.external).toContain('<a href="https://github.com/neomjs/neo/issues/42" target="_blank">#42</a>');

            expect(report.routeHistory).toEqual({
                count  : 1,
                history: [{
                    capturedRoute: '/learn',
                    hash         : {view: 'compact'},
                    hashString   : '/learn',
                    query        : {view: 'compact'},
                    search       : 'view=compact',
                    windowId     : 'win-path'
                }],
                windowId: 'win-path'
            });
            expect(report.runtimeSetRoute).toEqual({hash: '/services?tab=advisory', status: 'ok'});
            expect(report.clearedBootHashes).toEqual({global: null, winHash: null, winPath: null})
        });
    }

    test('skips delayed timeout(5) initial seed when a live route arrives first for that windowId', async () => {
        const report = await runSharedWorkerCase(`
            const bootPromise = registerAndBootWindow({
                appPath         : 'AlphaApp',
                environment     : 'development',
                hash            : {hash: {}, hashString: '/learn', query: {}, search: '', windowId: 'win-race'},
                routerBasePath  : '/alpha',
                routerMode      : 'pathname',
                useSharedWorkers: true,
                windowId        : 'win-race'
            });

            // Wait one microtask turn so importApp().then() schedules timeout(5), then push a live route before 5ms
            await Promise.resolve();
            app.onHashChange({
                data: {
                    hash      : {tab: 'live'},
                    hashString: '/services',
                    query     : {tab: 'live'},
                    search    : 'tab=live',
                    windowId  : 'win-race'
                }
            });

            await bootPromise;
            await new Promise(resolve => setTimeout(resolve, 15));

            report.count       = HashHistory.getCount('win-race');
            report.top         = HashHistory.first('win-race');
            report.handled     = controllers['win-race'].handled;
            report.clearedHash = Neo.windowConfigs['win-race'].hash ?? null;
        `);

        expect(report.count).toBe(1);
        expect(report.top).toMatchObject({
            hashString: '/services',
            query     : {tab: 'live'},
            search    : 'tab=live',
            windowId  : 'win-race'
        });
        expect(report.handled).toEqual([['services', '/services', 'tab=live']]);
        expect(report.clearedHash).toBeNull()
    });

    test('RuntimeService JSDoc documents pathname setRoute paths and additive search/query history fields', () => {
        const source = fs.readFileSync(path.join(root, 'src/ai/client/RuntimeService.mjs'), 'utf8');

        expect(source).toMatch(/search[\s\S]{0,120}query[\s\S]{0,200}getRouteHistory\(\{windowId\}\)/);
        expect(source).toMatch(/pathname[\s\S]{0,240}setRoute\(\{hash, windowId\}\)/)
    });
});
