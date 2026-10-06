import {test, expect}  from '@playwright/test';
import {execFile}      from 'node:child_process';
import path            from 'node:path';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'node:url';

const root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const execute = promisify(execFile);

/**
 * @summary Runs the real registration writers and App receiver in an isolated main-thread facade.
 * The worker factory and message boundary are injected; no Worker or SharedWorker is started.
 * @returns {Promise<Object>} Initial/lazy payloads and the two-window ownership observation.
 */
async function registrationProbe() {
    const script = `
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup} from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});
        globalThis.document = {
            baseURI: 'https://example.test/mount/dist/development/',
            readyState: 'loading', hidden: false, visibilityState: 'visible',
            addEventListener: () => {}, removeEventListener: () => {},
            getElementById: () => null, querySelector: () => null,
            createElement: () => ({addEventListener: () => {}, classList: {add: () => {}, remove: () => {}}}),
            body: {addEventListener: () => {}, classList: {add: () => {}, remove: () => {}}},
            documentElement: {classList: {add: () => {}, remove: () => {}}}
        };
        globalThis.window = globalThis;
        globalThis.addEventListener = () => {};
        globalThis.removeEventListener = () => {};
        globalThis.location = {
            hash: '', search: '?example=1',
            href: 'https://example.test/mount/dist/development/apps/demo/index.html?example=1'
        };
        globalThis.screen = {orientation: {}};
        globalThis.matchMedia = () => ({matches: false, addEventListener: () => {}, removeEventListener: () => {}});
        globalThis.Worker = class {};
        globalThis.SharedWorker = class {};
        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        const {default: Manager} = await import('./src/worker/Manager.mjs');
        const initial = [], lazy = [];
        const facade = {
            windowId: 'A', workers: {data: {}},
            createWorker: () => ({}), hasWorker: () => false,
            readTopologyIdentity: () => null,
            sendMessage: (name, message) => initial.push(message.data)
        };
        Manager.createWorkers.call(facade);
        facade.sendMessage = (name, message) => lazy.push(message.data);
        Manager.startWorker.call(facade, {name: 'data'});

        delete Neo.worker.App;
        // Import the receiver class without its connect-on-init singleton startup.
        Neo.overwrites = {Neo: {worker: {App: {singleton: false}}}};
        const {default: App} = await import('./src/worker/App.mjs');
        const receiver = {ports: [], themeMapFetchStarted: true};
        Neo.config = {useSharedWorkers: false, useVdomWorker: true, useAiClient: false};
        delete Neo.windowConfigs;
        App.prototype.onRegisterNeoConfig.call(receiver, {data: {
            windowId: 'A', url: {base: 'https://example.test/apps/a/', href: 'https://example.test/apps/a/index.html'}
        }});
        App.prototype.onRegisterNeoConfig.call(receiver, {data: {
            windowId: 'B', url: {base: 'https://example.test/apps/nested/b/', href: 'https://example.test/apps/nested/b/index.html'}
        }});

        const {default: ConnectionBase} = await import('./src/data/connection/Base.mjs');
        globalThis.location = new URL('https://example.test/node_modules/neo.mjs/src/worker/App.mjs');
        const connection = Neo.create(ConnectionBase);
        const relative = connection.resolveUrl('./data.json');
        const override = connection.resolveUrl('https://example.test/apps/nested/b/data.json');
        connection.destroy();

        console.log(JSON.stringify({
            initial: initial.map(config => config.url),
            lazy: lazy.map(config => config.url),
            realmBase: Neo.config.url.base, relative, override,
            windowBBase: Neo.windowConfigs.B.url.base
        }));
    `;
    const {stdout} = await execute(process.execPath, ['--input-type=module', '-e', script], {
        cwd: root, encoding: 'utf8', timeout: 15000
    });
    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/** @summary Pins effective-base delivery without changing the realm's existing registration owner. */
test.describe('worker registration document base', () => {
    let report;

    test.beforeAll(async () => { report = await registrationProbe() });

    for (const phase of ['initial', 'lazy']) {
        test(`${phase} registration carries document.baseURI beside the original href and search`, () => {
            expect(report[phase]).toEqual([{
                base  : 'https://example.test/mount/dist/development/',
                href  : 'https://example.test/mount/dist/development/apps/demo/index.html?example=1',
                search: '?example=1'
            }])
        })
    }

    test('a later window retains its own config without replacing the realm base', () => {
        expect(report.realmBase).toBe('https://example.test/apps/a/');
        expect(report.windowBBase).toBe('https://example.test/apps/nested/b/');
        expect(report.relative).toBe('https://example.test/apps/a/data.json');
        expect(report.override).toBe('https://example.test/apps/nested/b/data.json')
    })
});
