import {test, expect}    from '@playwright/test';
import {execFile}        from 'child_process';
import {readFile}        from 'fs/promises';
import {parse}           from 'parse5';
import path              from 'path';
import {promisify}       from 'util';
import {runInNewContext} from 'vm';
import {fileURLToPath}   from 'url';

const
    __dirname               = path.dirname(fileURLToPath(import.meta.url)),
    REPO_ROOT               = path.resolve(__dirname, '../../../..'),
    WORKSTATION_CONFIG_PATH = path.join(REPO_ROOT, 'apps/workstation/neo-config.json'),
    WORKSTATION_HTML_PATH   = path.join(REPO_ROOT, 'apps/workstation/index.html'),
    DARK_SCHEME_MAPPING     = "'neo-theme-neo-dark': 'dark'",
    MICRO_LOADER_SCRIPT     = '<script src="../../src/MicroLoader.mjs" type="module"></script>',
    execFileAsync           = promisify(execFile);

/**
 * @summary Returns every parsed HTML element in document order.
 * @param {Object} node
 * @param {Object[]} [elements=[]]
 * @returns {Object[]}
 */
function collectElements(node, elements=[]) {
    if (node.tagName) {
        elements.push(node)
    }

    node.childNodes?.forEach(child => collectElements(child, elements));

    return elements
}

/**
 * @summary Reads one normalized parse5 attribute value.
 * @param {Object} node
 * @param {String} name
 * @returns {String|null}
 */
function getAttribute(node, name) {
    return node.attrs?.find(attribute => attribute.name === name)?.value ?? null
}

/**
 * @summary Reports whether a parsed element explicitly carries one attribute.
 * @param {Object} node
 * @param {String} name
 * @returns {Boolean}
 */
function hasAttribute(node, name) {
    return node.attrs?.some(attribute => attribute.name === name) ?? false
}

/**
 * @summary Inspects the Workstation HTML bootstrap ordering without executing application code.
 * @param {String} source
 * @returns {Object}
 */
function inspectWorkstationBootstrap(source) {
    const
        document = parse(source, {sourceCodeLocationInfo: true}),
        elements = collectElements(document),
        head     = elements.find(node => node.tagName === 'head'),
        metas    = elements.filter(node => node.tagName === 'meta'
            && getAttribute(node, 'name')?.toLowerCase() === 'color-scheme'),
        loaders         = elements.filter(node => node.tagName === 'script'
            && getAttribute(node, 'src')?.split(/[?#]/)[0].endsWith('/src/MicroLoader.mjs')),
        bootstrapScripts = elements.filter(node => node.tagName === 'script'
            && !getAttribute(node, 'src')
            && node.childNodes?.some(child => child.value?.includes('WorkstationBootstrap'))),
        bootstrapScript = bootstrapScripts[0],
        loader          = loaders[0],
        scriptText      = bootstrapScript?.childNodes?.map(child => child.value || '').join('') || '',
        directHead      = bootstrapScripts.length === 1 && bootstrapScript.parentNode === head,
        parserBlocking  = bootstrapScripts.length === 1
            && !hasAttribute(bootstrapScript, 'async')
            && !hasAttribute(bootstrapScript, 'defer')
            && [null, '', 'text/javascript'].includes(getAttribute(bootstrapScript, 'type')),
        ordered         = bootstrapScripts.length === 1
            && loaders.length === 1
            && bootstrapScript.sourceCodeLocation.startOffset < loader.sourceCodeLocation.startOffset;

    return {
        bootstrapCount: bootstrapScripts.length,
        directHead,
        loaderCount   : loaders.length,
        loaderOffset  : loader?.sourceCodeLocation.startOffset ?? null,
        metaCount     : metas.length,
        ordered,
        parserBlocking,
        scriptEnd     : bootstrapScript?.sourceCodeLocation.endOffset ?? null,
        scriptStart   : bootstrapScript?.sourceCodeLocation.startOffset ?? null,
        scriptText,
        valid         : metas.length === 0
            && directHead
            && parserBlocking
            && loaders.length === 1
            && ordered
    }
}

/**
 * @summary Executes the parser-blocking Workstation prepaint contract against a minimal document.
 * @param {String} source Workstation HTML source.
 * @param {String} search URL search to expose to the bootstrap.
 * @returns {Object} Inserted meta and frozen carried authority.
 */
function runWorkstationBootstrap(source, search) {
    const
        {scriptText} = inspectWorkstationBootstrap(source),
        inserted     = [],
        context      = {
            document: {
                createElement(tagName) {
                    if (tagName !== 'meta') throw new Error(`unexpected bootstrap element: ${tagName}`);

                    return {tagName}
                },
                currentScript: {
                    before(node) {
                        inserted.push(node)
                    }
                }
            },
            location: {search},
            URLSearchParams
        };

    context.globalThis = context;
    runInNewContext(scriptText, context);

    return {
        bootstrap: {
            colorScheme: context.WorkstationBootstrap?.colorScheme,
            theme      : context.WorkstationBootstrap?.theme
        },
        frozen: Object.isFrozen(context.WorkstationBootstrap),
        metas : inserted.map(({content, name, tagName}) => ({content, name, tagName}))
    }
}

/**
 * @summary Validates structural ordering plus the opposing-theme runtime matrix.
 * @param {String} source Workstation HTML source.
 * @returns {Boolean}
 */
function validatesWorkstationBootstrap(source) {
    const contract = inspectWorkstationBootstrap(source);

    if (!contract.valid) return false;

    try {
        const
            dark  = runWorkstationBootstrap(source, '?theme=neo-theme-neo-dark'),
            light = runWorkstationBootstrap(source, '?theme=neo-theme-neo-light');

        return JSON.stringify(dark) === JSON.stringify({
            bootstrap: {colorScheme: 'dark', theme: 'neo-theme-neo-dark'},
            frozen   : true,
            metas    : [{content: 'dark', name: 'color-scheme', tagName: 'meta'}]
        }) && JSON.stringify(light) === JSON.stringify({
            bootstrap: {colorScheme: 'light', theme: 'neo-theme-neo-light'},
            frozen   : true,
            metas    : [{content: 'light', name: 'color-scheme', tagName: 'meta'}]
        })
    } catch {
        return false
    }
}

/**
 * @summary Executes the App-Worker theme resolver after installing the Neo unit-test realm.
 * @returns {Promise<Object>} Resolution matrix for carried, absent, and invalid values.
 */
async function runWorkstationAppThemeProbe() {
    const script = `
        import Neo from './src/Neo.mjs';
        import * as core from './src/core/_export.mjs';
        import {setup} from './test/playwright/setup.mjs';

        setup({appConfig: {name: 'WorkstationThemeResolverTest'}});

        const
            {resolveBootstrapTheme} = await import('./apps/workstation/app.mjs'),
            themes = ['neo-theme-neo-dark', 'neo-theme-neo-light'],
            resolve = search => resolveBootstrapTheme({search, themes});

        console.log(JSON.stringify({
            dark      : resolve('?theme=neo-theme-neo-dark'),
            invalid   : resolve('?theme=neo-theme-candidate'),
            light     : resolve('?theme=neo-theme-neo-light'),
            missing   : resolve(''),
            schemeList: resolve('?theme=dark%20light')
        }))
    `;
    const {stdout} = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : REPO_ROOT,
        encoding: 'utf8',
        timeout : 15_000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

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

test.describe('Workstation popup canvas bootstrap (#16092)', () => {
    test('Workstation resolves one parser-blocking active-theme canvas before MicroLoader', async () => {
        const
            [source, configSource] = await Promise.all([
                readFile(WORKSTATION_HTML_PATH, 'utf8'),
                readFile(WORKSTATION_CONFIG_PATH, 'utf8')
            ]),
            config   = JSON.parse(configSource),
            contract = inspectWorkstationBootstrap(source),
            dark     = runWorkstationBootstrap(source, '?theme=neo-theme-neo-dark'),
            light    = runWorkstationBootstrap(source, '?theme=neo-theme-neo-light');

        expect(config.themes).toEqual(['neo-theme-neo-dark', 'neo-theme-neo-light']);
        expect(contract.metaCount, 'the runtime script owns the only color-scheme meta').toBe(0);
        expect(contract.bootstrapCount).toBe(1);
        expect(contract.directHead).toBe(true);
        expect(contract.parserBlocking).toBe(true);
        expect(contract.loaderCount).toBe(1);
        expect(contract.scriptStart).toBeLessThan(contract.loaderOffset);
        expect(contract.ordered).toBe(true);
        expect(contract.valid).toBe(true);
        expect(dark).toEqual({
            bootstrap: {colorScheme: 'dark', theme: 'neo-theme-neo-dark'},
            frozen   : true,
            metas    : [{content: 'dark', name: 'color-scheme', tagName: 'meta'}]
        });
        expect(light).toEqual({
            bootstrap: {colorScheme: 'light', theme: 'neo-theme-neo-light'},
            frozen   : true,
            metas    : [{content: 'light', name: 'color-scheme', tagName: 'meta'}]
        })
    });

    test('Workstation bootstrap rejects removal, duplication, late placement, scheme lists, and arbitrary themes', async () => {
        const
            source    = await readFile(WORKSTATION_HTML_PATH, 'utf8'),
            contract  = inspectWorkstationBootstrap(source),
            script    = source.slice(contract.scriptStart, contract.scriptEnd),
            mutations = {
                afterLoader: source
                    .replace(script, '')
                    .replace(MICRO_LOADER_SCRIPT, `${MICRO_LOADER_SCRIPT}\n    ${script}`),
                duplicate : source.replace(script, `${script}\n    ${script}`),
                removal   : source.replace(script, ''),
                schemeList: source.replace(DARK_SCHEME_MAPPING, "'neo-theme-neo-dark': 'dark light'")
            };

        expect(Object.fromEntries(Object.entries(mutations).map(([name, html]) => [
            name,
            validatesWorkstationBootstrap(html)
        ]))).toEqual({
            afterLoader: false,
            duplicate  : false,
            removal    : false,
            schemeList : false
        });
        expect(runWorkstationBootstrap(source, '').bootstrap)
            .toEqual({colorScheme: 'dark', theme: 'neo-theme-neo-dark'});
        expect(runWorkstationBootstrap(source, '?theme=neo-theme-candidate').bootstrap)
            .toEqual({colorScheme: 'dark', theme: 'neo-theme-neo-dark'});
        expect(runWorkstationBootstrap(source, '?theme=dark%20light').bootstrap)
            .toEqual({colorScheme: 'dark', theme: 'neo-theme-neo-dark'})
    });

    test('the App Worker resolves the same carried theme before creating its viewport', async () => {
        await expect(runWorkstationAppThemeProbe()).resolves.toEqual({
            dark      : 'neo-theme-neo-dark',
            invalid   : 'neo-theme-neo-dark',
            light     : 'neo-theme-neo-light',
            missing   : 'neo-theme-neo-dark',
            schemeList: 'neo-theme-neo-dark'
        })
    });
});

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
