// This file sets up the Node.js global scope to run Neo.mjs
// VDOM unit tests without a browser or jsdom.

const appName = 'ClassicButtonTest';

globalThis.Neo = {
    apps: {
        [appName]: {
            name             : appName,
            fire             : () => {},
            isMounted        : () => true,
            vnodeInitialising: false
        }
    },
    config: {
        allowVdomUpdatesInTests: true,
        environment            : 'development',
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
};

// Running the unit tests directly inside nodejs requires a mock for DOMRect.
globalThis.DOMRect = class DOMRect {
    constructor(x, y, width, height) {
        this.x = x || 0;
        this.y = y || 0;
        this.width = width || 0;
        this.height = height || 0;
        this.top = this.y;
        this.left = this.x;
        this.right = this.x + this.width;
        this.bottom = this.y + this.height;
    }
    static fromRect(other) {
        return new DOMRect(other.x, other.y, other.width, other.height);
    }
};
