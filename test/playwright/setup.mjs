globalThis.Neo ??= {};

globalThis.Neo.config = {
    environment : 'development',
    unitTestMode: true
};

globalThis.DOMRect = class DOMRect {
    constructor(x, y, width, height) {
        this.x = x || 0;
        this.y = y || 0;
        this.width = width || 0;
        this.height = height || 0;
        this.top = this.y;
        this.left = this.x;
    }
    get right() {
        return this.x + this.width;
    }
    get bottom() {
        return this.y + this.height;
    }
    static fromRect(other) {
        return new DOMRect(other.x, other.y, other.width, other.height);
    }
};

// This file sets up the Node.js global scope to run Neo.mjs
// VDOM unit tests without a browser or jsdom.

/**
 * The pre-override values of the LAST `setup()` call's `neoConfig` keys — restored on the next
 * call so one spec file's overrides never leak into a later file in the same worker process.
 * `undefined` records a key that did not exist (restored via delete).
 * @type {Object|null}
 */
let priorNeoConfigOverrides = null;

/**
 * Configures the single-threaded Playwright unit-test runtime with the minimal
 * Neo globals required by App Worker and VDom Worker classes.
 * @param {Object} options={}
 * @param {Object} options.appConfig={} App facade overrides.
 * @param {Boolean} options.mockLocalStorage=true True installs minimal `Neo.main.addon.LocalStorage` methods.
 * @param {Boolean} options.mockMain=true True installs a minimal `Neo.Main.setRoute()` method.
 * @param {Object} options.neoConfig={} Neo.config overrides.
 */
export function setup(options = {}) {
    const {
        appConfig        = {},
        mockLocalStorage = true,
        mockMain         = true,
        neoConfig        = {}
    } = options;

    const defaultNeoConfig = {
        environment : 'development',
        unitTestMode: true,
        windowId    : 1
    };

    // Cross-file isolation in the single shared worker: restore whatever the PREVIOUS spec file's
    // `neoConfig` overrides replaced BEFORE applying this file's. Without this, a non-default key
    // (e.g. `useDomApiRenderer: true`) set by one file leaks into every later file in the process —
    // order-dependent bleed the victims cannot defend against, since `Object.assign` below only
    // re-asserts the three default keys.
    if (priorNeoConfigOverrides) {
        Object.entries(priorNeoConfigOverrides).forEach(([key, value]) => {
            if (value === undefined) {
                delete Neo.config[key]
            } else {
                Neo.config[key] = value
            }
        })
    }

    priorNeoConfigOverrides = {};
    Object.keys(neoConfig).forEach(key => {
        priorNeoConfigOverrides[key] = Neo.config[key]
    });

    Object.assign(Neo.config, defaultNeoConfig);
    Object.assign(Neo.config, neoConfig);

    const defaultAppConfig = {
        fire             : () => {},
        isMounted        : () => true,
        vnodeInitialising: false
    };

    const finalAppConfig = { ...defaultAppConfig, ...appConfig };

    Neo.apps ??= {};
    Neo.apps[appConfig.windowId || 1] = finalAppConfig;
    Neo.appsByName = {[finalAppConfig.name]: [finalAppConfig]};

    // Standardized Global Mocks to prevent cross-contamination in Playwright worker reuse
    Neo.applyDeltas ??= async () => {};

    if (mockMain) {
        Neo.ns('Neo.Main', true).setRoute ??= () => {};
    }

    Neo.main ??= {
        addon: {
            DragDrop : {},
            Navigator: {
                subscribe  : () => {},
                unsubscribe: () => {},
                navigateTo : () => {}
            },
            ResizeObserver: {
                register  : () => {},
                unregister: () => {}
            }
        },
        DomAccess: {
            focus                : () => {},
            getBoundingClientRect: async ({id}) => {
                const rect = {width: 1000, height: 1000, x: 0, y: 0};
                if (Array.isArray(id)) {
                    return id.map(() => rect);
                }
                return rect;
            },
            // The single-thread simulation has no transforms, so the layout box equals the
            // visual box: the transform-immune variant mirrors getBoundingClientRect here.
            getLayoutRect: async ({id}) => {
                const rect = {width: 1000, height: 1000, x: 0, y: 0};
                if (Array.isArray(id)) {
                    return id.map(() => rect);
                }
                return rect;
            },
            scrollIntoView: async () => {},
            scrollTo      : async () => {}
        }
    };

    // Production's App Worker always exposes the Stylesheet addon. Component-composition unit
    // specs need only its side-effect boundary (animated lists insert/delete owner-scoped rules),
    // while plugin-specific suites replace these no-ops with recording witnesses.
    Neo.main.addon.Stylesheet ??= {
        deleteCssRules: () => {},
        insertCssRules: () => {}
    };

    if (mockLocalStorage) {
        const localStorage = Neo.ns('Neo.main.addon.LocalStorage', true);

        localStorage.createLocalStorageItem  ??= async () => {};
        localStorage.destroyLocalStorageItem ??= async () => {};
        localStorage.readLocalStorageItem    ??= async ({key} = {}) => ({
            key,
            value: Array.isArray(key) ? Object.fromEntries(key.map(item => [item, null])) : null
        });
        localStorage.updateLocalStorageItem  ??= async () => {};
    }

    Neo.currentWorker ??= {
        getAddon: async () => ({
            register  : () => {},
            unregister: () => {}
        }),
        insertThemeFiles: () => {},
        isSharedWorker  : false,
        on              : () => {},
        un              : () => {},
        promiseMessage  : async (dest, msg) => {
            if (msg?.action === 'readDom') {
                if (msg.attributes?.includes('offsetHeight')) {
                     return { attributes: { offsetHeight: 600, offsetWidth: 800 } };
                }
                if (msg.functions?.[0]?.returnFnName === 'transform') {
                     return { functions: { transform: 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)' } };
                }
                // Fallback for general bounding client rect reads
                return {
                    attributes: {},
                    functions : {},
                    rects     : [{width: 1000, height: 1000, x: 0, y: 0}]
                };
            }
            return {};
        },
        sendMessage     : () => {}
    };

    Neo.worker ??= {
        App: {
            promiseMessage: async () => {}
        },
        Manager: {
            startWorker: async () => {}
        }
    };
}
