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
            colorScheme : context.WorkstationBootstrap?.colorScheme,
            defaultTheme: context.WorkstationBootstrap?.defaultTheme,
            schemes     : {...context.WorkstationBootstrap?.schemes},
            theme       : context.WorkstationBootstrap?.theme
        },
        frozen       : Object.isFrozen(context.WorkstationBootstrap),
        metas        : inserted.map(({content, name, tagName}) => ({content, name, tagName})),
        schemesFrozen: Object.isFrozen(context.WorkstationBootstrap?.schemes)
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
            bootstrap: {
                colorScheme : 'dark',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-dark'
            },
            frozen       : true,
            metas        : [{content: 'dark', name: 'color-scheme', tagName: 'meta'}],
            schemesFrozen: true
        }) && JSON.stringify(light) === JSON.stringify({
            bootstrap: {
                colorScheme : 'light',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-light'
            },
            frozen       : true,
            metas        : [{content: 'light', name: 'color-scheme', tagName: 'meta'}],
            schemesFrozen: true
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
 * @param {'cross-origin'|'invalid-scheme'|'native-focus-stale'|'native-move-stale'|'native-resize'|'native-resize-default-denied'|'native-resize-denied'|'navigation-failure'|'persisted-pagehide'|'same-origin'} scenario
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
                                capabilities  : {close: false, focus: true, position: true, resize: true},
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
        } else if (scenario === 'topology-identity') {
            // The boot-time reader lives on the worker manager; Main only writes and hands off.
            const {default: WorkerManager} = await import('./src/worker/Manager.mjs');
            const
                storage      = new Map(),
                childStorage = new Map(),
                inherited    = () => childStorage.set('neo-topology-identity', JSON.stringify({generationToken: 't1', groupId: 'g1', workspaceKey: 'main'}));
            globalThis.sessionStorage = {
                getItem   : key => storage.get(key) ?? null,
                removeItem: key => storage.delete(key),
                setItem   : (key, value) => storage.set(key, value)
            };
            const empty    = WorkerManager.readTopologyIdentity();
            const accepted = Main.setTopologyIdentity({generationToken: 't1', groupId: 'g1', workspaceKey: 'main'});
            const carried  = WorkerManager.readTopologyIdentity();
            storage.set('neo-topology-identity', '{not json');
            const malformed = WorkerManager.readTopologyIdentity();
            storage.set('neo-topology-identity', JSON.stringify({groupId: 'g1'}));
            const partial = WorkerManager.readTopologyIdentity();
            const popup = {
                closed        : false,
                innerHeight   : 500,
                outerWidth    : 600,
                document      : {createElement: () => ({}), head: {append() {}}},
                location      : {replace() {}},
                resizeTo() {},
                sessionStorage: {
                    getItem   : key => childStorage.get(key) ?? null,
                    removeItem: key => childStorage.delete(key),
                    setItem   : (key, value) => childStorage.set(key, value)
                }
            };
            globalThis.open       = () => popup;
            globalThis.setTimeout = () => 1;
            Main.openWindows      = {};
            inherited();
            Main.windowOpen({topologyIdentity: {generationToken: 't2', groupId: 'g1', workspaceKey: 'popup:documents'}, url: './popup.html', windowName: 'reserved'});
            const reserved = JSON.parse(childStorage.get('neo-topology-identity'));
            inherited();
            Main.windowOpen({url: './popup.html', windowName: 'plain'});
            const cleared = !childStorage.has('neo-topology-identity');
            console.log(JSON.stringify({accepted, carried, cleared, empty, malformed, partial, reserved}))
        } else {
            const
                events   = [],
                openArgs = [],
                state    = {
                    closed   : false,
                    height   : 600,
                    published: 0,
                    token    : null,
                    width    : 900,
                    x        : 1355,
                    y        : 215
                };

            const popup = {
                get closed() {
                    return state.closed
                },
                get outerHeight() {
                    return state.height
                },
                get outerWidth() {
                    return state.width
                },
                get screenX() {
                    return state.x
                },
                get screenY() {
                    return state.y
                },
                close() {
                    events.push('close');
                    state.closed = true
                },
                focus() {},
                moveTo() {},
                innerHeight: 600,
                Neo: {
                    main: {
                        addon: {
                            WindowPosition: {
                                publishGeometry() {
                                    events.push('publish');
                                    state.published++
                                }
                            }
                        }
                    }
                },
                document: {
                    createElement(tagName) {
                        return {tagName}
                    },
                    head: {
                        append(node) {
                            events.push('scheme');
                            state.stagedMeta = {
                                content: node.content,
                                name   : node.name,
                                tagName: node.tagName
                            }
                        }
                    }
                },
                resizeTo(width, height) {
                    events.push('resize');
                    state.height = height;
                    state.width  = width
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
                nativeCapabilities: scenario === 'native-resize-default-denied'
                    ? {close: true}
                    : {close: true, resize: scenario !== 'native-resize-denied'},
                stagedColorScheme: scenario === 'invalid-scheme'
                    ? 'dark light'
                    : scenario === 'missing-scheme'
                        ? undefined
                    : ['navigation-failure', 'same-origin'].includes(scenario) ? 'dark' : null,
                url,
                useTotalHeight: false,
                windowFeatures: 'popup,width=900,height=600',
                windowName    : 'tear-out'
            });
            const route = state.token
                ? Main.consumeNativeWindowRoute({targetWindowId: 'child-window', token: state.token, win: popup})
                : null;
            let
                exactCompletion = null,
                geometry = null,
                resize   = null;

            if (scenario === 'native-focus-stale') {
                popup.document = {hasFocus: () => true};
                popup.focus    = () => Main.releaseNativeWindowRoute({
                    nativeHandleKey: route.nativeHandleKey,
                    targetWindowId : route.targetWindowId,
                    win            : popup
                });
                globalThis.setTimeout = callback => {
                    callback();
                    return 1
                };
                exactCompletion = await Main.windowNativeFocus(route)
            } else if (scenario === 'native-move-stale') {
                popup.moveTo = (x, y) => {
                    state.x = x;
                    state.y = y;
                    Main.releaseNativeWindowRoute({
                        nativeHandleKey: route.nativeHandleKey,
                        targetWindowId : route.targetWindowId,
                        win            : popup
                    })
                };
                exactCompletion = await Main.windowNativeMoveTo({...route, x: 420, y: 320})
            } else if (scenario === 'native-close' || scenario === 'native-close-deferred') {
                // The verified close: a platform that keeps the window (an OS titlebar drag still
                // holding it) answers false and keeps the route for the caller's retry; one that closes
                // answers true and retires the entry.
                popup.close = () => {
                    events.push('close');
                    scenario === 'native-close' && (state.closed = true)
                };
                globalThis.setTimeout = callback => {
                    callback();
                    return 1
                };
                exactCompletion = await Main.windowNativeClose(route)
            } else if (
                scenario === 'native-resize' ||
                scenario === 'native-resize-default-denied' ||
                scenario === 'native-resize-denied'
            ) {
                resize = {
                    admitted: await Main.windowNativeResizeTo({
                        height         : 320,
                        nativeHandleKey: route?.nativeHandleKey,
                        targetWindowId : 'child-window',
                        width          : 420
                    }),
                    forged: await Main.windowNativeResizeTo({
                        height         : 200,
                        nativeHandleKey: 'forged-handle',
                        targetWindowId : 'child-window',
                        width          : 200
                    }),
                    invalid: await Main.windowNativeResizeTo({
                        height         : 0,
                        nativeHandleKey: route?.nativeHandleKey,
                        targetWindowId : 'child-window',
                        width          : 420
                    })
                };
                geometry = {
                    admitted: Main.windowNativeGetGeometry({
                        nativeHandleKey: route?.nativeHandleKey,
                        targetWindowId : 'child-window'
                    }),
                    forged: Main.windowNativeGetGeometry({
                        nativeHandleKey: 'forged-handle',
                        targetWindowId : 'child-window'
                    })
                }
            }

            console.log(JSON.stringify({
                closed   : state.closed,
                events,
                exactCompletion,
                geometry,
                hasEntry : Object.hasOwn(Main.openWindows, 'tear-out'),
                height   : state.height,
                openArgs,
                published: state.published,
                replacedUrl: state.replacedUrl ?? null,
                resize,
                route,
                stagedMeta: state.stagedMeta ?? null,
                success,
                tokenMinted: Boolean(state.token),
                width    : state.width
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

test.describe('Workstation popup canvas bootstrap (#16092, #16113)', () => {
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
        expect(Object.keys(dark.bootstrap.schemes)).toEqual(config.themes);
        expect(dark.bootstrap.defaultTheme).toBe(config.themes[0]);
        expect(contract.metaCount, 'the runtime script owns the only color-scheme meta').toBe(0);
        expect(contract.bootstrapCount).toBe(1);
        expect(contract.directHead).toBe(true);
        expect(contract.parserBlocking).toBe(true);
        expect(contract.loaderCount).toBe(1);
        expect(contract.scriptStart).toBeLessThan(contract.loaderOffset);
        expect(contract.ordered).toBe(true);
        expect(contract.valid).toBe(true);
        expect(dark).toEqual({
            bootstrap: {
                colorScheme : 'dark',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-dark'
            },
            frozen       : true,
            metas        : [{content: 'dark', name: 'color-scheme', tagName: 'meta'}],
            schemesFrozen: true
        });
        expect(light).toEqual({
            bootstrap: {
                colorScheme : 'light',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-light'
            },
            frozen       : true,
            metas        : [{content: 'light', name: 'color-scheme', tagName: 'meta'}],
            schemesFrozen: true
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
            .toEqual({
                colorScheme : 'dark',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-dark'
            });
        expect(runWorkstationBootstrap(source, '?theme=neo-theme-candidate').bootstrap)
            .toEqual({
                colorScheme : 'dark',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-dark'
            });
        expect(runWorkstationBootstrap(source, '?theme=dark%20light').bootstrap)
            .toEqual({
                colorScheme : 'dark',
                defaultTheme: 'neo-theme-neo-dark',
                schemes     : {'neo-theme-neo-dark': 'dark', 'neo-theme-neo-light': 'light'},
                theme       : 'neo-theme-neo-dark'
            })
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
        expect(result.events).toEqual(['scheme', 'storage', 'replace']);
        expect(result.stagedMeta).toEqual({content: 'dark', name: 'color-scheme', tagName: 'meta'});
        expect(result.replacedUrl).toBe('https://owner.example.test/apps/demo/popup.html?mode=tear-out');
        expect(result.hasEntry).toBe(true);
        expect(result.route).toMatchObject({
            capabilities  : {close: true, focus: true, position: true, resize: true},
            ownerWindowId : expect.any(String),
            targetWindowId: 'child-window'
        })
    });

    test('resize authority verifies exact outer dimensions and publishes the observed target geometry', async () => {
        const result = await runNativeWindowRouteProbe('native-resize');

        expect(result.resize).toEqual({admitted: true, forged: false, invalid: false});
        expect(result.geometry).toEqual({
            admitted: {height: 320, width: 420, x: 1355, y: 215},
            forged  : null
        });
        expect(result.route.capabilities.resize).toBe(true);
        expect({height: result.height, width: result.width}).toEqual({height: 320, width: 420});
        expect(result.published).toBe(1);
        expect(result.events).toEqual(['storage', 'replace', 'resize', 'publish'])
    });

    test('resize remains unavailable when the owner did not grant it', async () => {
        const result = await runNativeWindowRouteProbe('native-resize-denied');

        expect(result.route.capabilities.resize).toBe(false);
        expect(result.resize).toEqual({admitted: false, forged: false, invalid: false});
        expect({height: result.height, width: result.width}).toEqual({height: 600, width: 900});
        expect(result.published).toBe(0);
        expect(result.events).toEqual(['storage', 'replace'])
    });

    test('resize remains least-authority when the owner omits the capability', async () => {
        const result = await runNativeWindowRouteProbe('native-resize-default-denied');

        expect(result.route.capabilities.resize).toBe(false);
        expect(result.resize).toEqual({admitted: false, forged: false, invalid: false});
        expect({height: result.height, width: result.width}).toEqual({height: 600, width: 900});
        expect(result.published).toBe(0);
        expect(result.events).toEqual(['storage', 'replace'])
    });

    test('focus and move reject a predecessor completion after its exact route is invalidated', async () => {
        const [focus, move] = await Promise.all([
            runNativeWindowRouteProbe('native-focus-stale'),
            runNativeWindowRouteProbe('native-move-stale')
        ]);

        expect(focus.exactCompletion).toBe(false);
        expect(move.exactCompletion).toBe(false)
    });

    test('same-origin navigation failure retires the grant, registry entry, and popup', async () => {
        const result = await runNativeWindowRouteProbe('navigation-failure');

        expect(result.success).toBe(false);
        expect(result.openArgs[0].url).toBe('about:blank');
        expect(result.events).toEqual(['scheme', 'storage', 'replace', 'close']);
        expect(result.stagedMeta).toEqual({content: 'dark', name: 'color-scheme', tagName: 'meta'});
        expect(result.closed).toBe(true);
        expect(result.hasEntry).toBe(false);
        expect(result.route).toBeNull()
    });

    test('a native close is the VERIFIED outcome: a deferred close answers false and keeps the route, a done close retires the entry', async () => {
        // Before this contract `windowNativeClose` returned true for the attempt and dropped the route at
        // once, so a popup the OS still held by its titlebar read as closed while it stood on screen —
        // and the retirement retry that relies on the route had nothing left to retry with.
        const [deferred, done] = await Promise.all([
            runNativeWindowRouteProbe('native-close-deferred'),
            runNativeWindowRouteProbe('native-close')
        ]);

        expect(deferred.events, 'the close was asked for').toContain('close');
        expect(deferred.exactCompletion, 'a window that is still there is not closed').toBe(false);
        expect(deferred.closed).toBe(false);
        expect(deferred.hasEntry, 'the route survives for the retry').toBe(true);

        expect(done.exactCompletion).toBe(true);
        expect(done.closed).toBe(true);
        expect(done.hasEntry, 'a verified close retires the entry').toBe(false)
    });

    test('cross-origin open preserves direct browser navigation and exposes no native route', async () => {
        const result = await runNativeWindowRouteProbe('cross-origin');

        expect(result.success).toBe(true);
        expect(result.openArgs[0].url).toBe('https://other.example.test/popup');
        expect(result.events).toEqual(['storage']);
        expect(result.stagedMeta).toBeNull();
        expect(result.closed).toBe(false);
        expect(result.replacedUrl).toBeNull();
        expect(result.tokenMinted).toBe(false);
        expect(result.route).toBeNull();
        expect(result.hasEntry).toBe(true)
    });

    test('#16113 invalid staged schemes preserve route navigation without touching the blank document', async () => {
        const result = await runNativeWindowRouteProbe('invalid-scheme');

        expect(result.success).toBe(true);
        expect(result.events).toEqual(['storage', 'replace']);
        expect(result.stagedMeta).toBeNull();
        expect(result.route).toMatchObject({targetWindowId: 'child-window'})
    });

    test('#16113 removing the staged scheme exposes an unstyled blank interval before final navigation', async () => {
        const result = await runNativeWindowRouteProbe('missing-scheme');

        expect(result.success).toBe(true);
        expect(result.openArgs[0].url).toBe('about:blank');
        expect(result.events).toEqual(['storage', 'replace']);
        expect(result.stagedMeta).toBeNull();
        expect(result.replacedUrl).toBe('https://owner.example.test/apps/demo/popup.html?mode=tear-out')
    });

    test('persisted pagehide permanently retires the preserved realm instead of consuming a fresh grant', async () => {
        const result = await runNativeWindowRouteProbe('persisted-pagehide');

        expect(result.firstHandle).toBe('handle-token-a');
        expect(result.secondHandle).toBeNull();
        expect(result.consumed.map(item => item.token)).toEqual(['token-a']);
        expect(result.released).toEqual(['handle-token-a']);
        expect(result.remainingToken).toBe('token-b')
    });

    test('the topology identity rides the native route carrier: read on boot, written back, reserved for a staged child, cleared when nothing was reserved', async () => {
        const result = await runNativeWindowRouteProbe('topology-identity');

        expect(result.empty, 'no carrier yet: the worker mints').toEqual({});
        expect(result.accepted).toBe(true);
        expect(result.carried, 'the next page load presents what the worker wrote back').toEqual({generationToken: 't1', groupId: 'g1', workspaceKey: 'main'});
        expect(result.malformed, 'a broken record boots a fresh root').toEqual({});
        expect(result.partial, 'an incomplete record boots a fresh root').toEqual({});
        expect(result.reserved, 'the staged child carries the slot its opener reserved').toEqual({generationToken: 't2', groupId: 'g1', workspaceKey: 'popup:documents'});
        expect(result.cleared, 'a child opened without a reservation boots as its own root').toBe(true)
    })
});
