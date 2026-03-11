globalThis.Neo = {};

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

export function setup(options = {}) {
    const { neoConfig = {}, appConfig = {} } = options;

    const defaultNeoConfig = {
        environment : 'development',
        unitTestMode: true,
        windowId    : 1
    };

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

    Neo.main ??= {
        addon: {
            DragDrop: {},
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
            focus: () => {},
            getBoundingClientRect: async ({id}) => {
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

    Neo.currentWorker ??= {
        getAddon: async () => ({
            register  : () => {},
            unregister: () => {}
        }),
        insertThemeFiles: () => {},
        isSharedWorker  : false,
        on              : () => {},
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
                    functions: {},
                    rects: [{width: 1000, height: 1000, x: 0, y: 0}]
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
