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
}
