import {test, expect}  from '@playwright/test';
import {execFile}      from 'child_process';
import path            from 'path';
import {promisify}     from 'util';
import {fileURLToPath} from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = path.resolve(__dirname, '../../../..');
const execFileAsync = promisify(execFile);

/**
 * @summary Runs one native-window authority scenario against the real Main singleton in an isolated process.
 * @param {'cross-origin'|'navigation-failure'|'persisted-pagehide'|'same-origin'} scenario
 * @returns {Promise<Object>}
 */
async function runNativeWindowRouteProbe(scenario) {
    const script = `
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup} from './test/playwright/setup.mjs';

        setup({mockMain: false, neoConfig: {unitTestMode: true}});

        const windowListeners = new Map();

        globalThis.document = {
            readyState         : 'loading',
            hidden             : false,
            visibilityState    : 'visible',
            addEventListener   : () => {},
            removeEventListener: () => {},
            getElementById     : () => null,
            querySelector      : () => null,
            createElement      : () => ({
                addEventListener: () => {},
                classList       : {add: () => {}, remove: () => {}}
            }),
            body: {
                addEventListener: () => {},
                classList       : {add: () => {}, remove: () => {}}
            },
            documentElement: {classList: {add: () => {}, remove: () => {}}}
        };
        globalThis.window              = globalThis;
        globalThis.addEventListener    = (name, listener) => windowListeners.set(name, listener);
        globalThis.removeEventListener = () => {};
        globalThis.location            = {
            hash  : '',
            href  : 'https://owner.example.test/apps/demo/index.html',
            origin: 'https://owner.example.test',
            reload: () => {}
        };
        globalThis.screen = {
            availHeight: 900,
            availLeft  : 0,
            availTop   : 0,
            availWidth : 1440,
            colorDepth : 24,
            height     : 900,
            orientation: {},
            pixelDepth : 24,
            width      : 1440
        };
        globalThis.innerHeight = 700;
        globalThis.innerWidth  = 1000;
        globalThis.outerHeight = 760;
        globalThis.outerWidth  = 1080;
        globalThis.screenLeft  = 10;
        globalThis.screenTop   = 20;
        globalThis.matchMedia  = () => ({
            matches            : false,
            addEventListener   : () => {},
            removeEventListener: () => {}
        });
        globalThis.Worker       = class {};
        globalThis.SharedWorker = class {};

        Neo.insideWorker = true;
        delete Neo.main.DomAccess;
        delete Neo.worker.Manager;

        const {default: Main} = await import('./src/Main.mjs');
        const scenario        = ${JSON.stringify(scenario)};

        if (scenario === 'persisted-pagehide') {
            const
                consumed = [],
                released = [],
                storage  = new Map([['neo-native-window-route', 'token-a']]);

            globalThis.sessionStorage = {
                getItem   : key => storage.get(key) ?? null,
                removeItem: key => storage.delete(key),
                setItem   : (key, value) => storage.set(key, value)
            };
            globalThis.opener = {
                closed: false,
                Neo   : {
                    Main: {
                        nativeRouteStorageKey: 'neo-native-window-route',
                        consumeNativeWindowRoute({targetWindowId, token}) {
                            consumed.push({targetWindowId, token});

                            return {
                                capabilities  : {close: false, focus: true, position: true},
                                nativeHandleKey: 'handle-' + token,
                                ownerWindowId  : 'owner-window',
                                targetWindowId
                            }
                        },
                        releaseNativeWindowRoute(route) {
                            released.push(route.nativeHandleKey);
                            return true
                        }
                    }
                }
            };

            const first = Main.getWindowData().nativeRoute;

            windowListeners.get('pagehide')?.({persisted: true});
            storage.set('neo-native-window-route', 'token-b');

            const second = Main.getWindowData().nativeRoute;

            console.log(JSON.stringify({
                consumed,
                firstHandle : first?.nativeHandleKey ?? null,
                remainingToken: storage.get('neo-native-window-route') ?? null,
                released,
                secondHandle: second?.nativeHandleKey ?? null
            }))
        } else {
            const
                events   = [],
                openArgs = [],
                state    = {closed: false, token: null};

            const popup = {
                get closed() {
                    return state.closed
                },
                close() {
                    events.push('close');
                    state.closed = true
                },
                focus() {},
                moveTo() {},
                innerHeight: 600,
                outerWidth : 900,
                resizeTo() {
                    events.push('resize')
                },
                sessionStorage: {
                    setItem(key, value) {
                        events.push('storage');

                        if (scenario === 'cross-origin') {
                            throw new Error('cross-origin storage denied')
                        }

                        state.token = value
                    }
                },
                location: {
                    replace(url) {
                        events.push('replace');

                        if (scenario === 'navigation-failure') {
                            throw new Error('navigation rejected')
                        }

                        state.replacedUrl = url
                    }
                }
            };

            globalThis.open = (url, targetName, features) => {
                openArgs.push({features, targetName, url});
                return popup
            };
            globalThis.setTimeout = () => 1;
            Main.openWindows      = {};

            const url = scenario === 'cross-origin'
                ? 'https://other.example.test/popup'
                : './popup.html?mode=tear-out';
            const success = Main.windowOpen({
                nativeCapabilities: {close: true},
                url,
                useTotalHeight: false,
                windowFeatures: 'popup,width=900,height=600',
                windowName    : 'tear-out'
            });
            const route = state.token
                ? Main.consumeNativeWindowRoute({targetWindowId: 'child-window', token: state.token, win: popup})
                : null;

            console.log(JSON.stringify({
                closed   : state.closed,
                events,
                hasEntry : Object.hasOwn(Main.openWindows, 'tear-out'),
                openArgs,
                replacedUrl: state.replacedUrl ?? null,
                route,
                success,
                tokenMinted: Boolean(state.token)
            }))
        }
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary Pins exact native-window authority staging and persisted-document cache retirement.
 */
test.describe('Neo.Main native window routes (#15396)', () => {
    test('same-origin open stages the route before final navigation and admits the exact popup', async () => {
        const result = await runNativeWindowRouteProbe('same-origin');

        expect(result.success).toBe(true);
        expect(result.openArgs).toHaveLength(1);
        expect(result.openArgs[0].url).toBe('about:blank');
        expect(result.events).toEqual(['storage', 'replace']);
        expect(result.replacedUrl).toBe('https://owner.example.test/apps/demo/popup.html?mode=tear-out');
        expect(result.hasEntry).toBe(true);
        expect(result.route).toMatchObject({
            capabilities  : {close: true, focus: true, position: true},
            ownerWindowId : expect.any(String),
            targetWindowId: 'child-window'
        })
    });

    test('same-origin navigation failure retires the grant, registry entry, and popup', async () => {
        const result = await runNativeWindowRouteProbe('navigation-failure');

        expect(result.success).toBe(false);
        expect(result.openArgs[0].url).toBe('about:blank');
        expect(result.events).toEqual(['storage', 'replace', 'close']);
        expect(result.closed).toBe(true);
        expect(result.hasEntry).toBe(false);
        expect(result.route).toBeNull()
    });

    test('cross-origin open preserves direct browser navigation and exposes no native route', async () => {
        const result = await runNativeWindowRouteProbe('cross-origin');

        expect(result.success).toBe(true);
        expect(result.openArgs[0].url).toBe('https://other.example.test/popup');
        expect(result.events).toEqual(['storage']);
        expect(result.closed).toBe(false);
        expect(result.replacedUrl).toBeNull();
        expect(result.tokenMinted).toBe(false);
        expect(result.route).toBeNull();
        expect(result.hasEntry).toBe(true)
    });

    test('persisted pagehide permanently retires the preserved realm instead of consuming a fresh grant', async () => {
        const result = await runNativeWindowRouteProbe('persisted-pagehide');

        expect(result.firstHandle).toBe('handle-token-a');
        expect(result.secondHandle).toBeNull();
        expect(result.consumed.map(item => item.token)).toEqual(['token-a']);
        expect(result.released).toEqual(['handle-token-a']);
        expect(result.remainingToken).toBe('token-b')
    })
});
