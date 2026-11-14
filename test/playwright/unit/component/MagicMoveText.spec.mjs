import {setup} from '../../setup.mjs';

const appName = 'MagicMoveTextUnitTest';

const visibilityListeners = new Set();

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false,
        on(eventName, fn, scope) {
            if (eventName === 'visibilitychange') {
                visibilityListeners.add({fn, scope})
            }
        },
        un(eventName, fn, scope) {
            if (eventName === 'visibilitychange') {
                for (const entry of visibilityListeners) {
                    if (entry.fn === fn && entry.scope === scope) {
                        visibilityListeners.delete(entry)
                    }
                }
            }
        },
        fire(eventName, data) {
            if (eventName === 'visibilitychange') {
                for (const entry of [...visibilityListeners]) {
                    entry.fn.call(entry.scope, data)
                }
            }
        }
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import MagicMoveText      from '../../../../src/component/MagicMoveText.mjs';

/**
 * Tracks live setInterval handles created while fn() executes and guarantees cleanup.
 * @param {Function} fn
 * @returns {Promise<void>}
 */
async function withIntervalTracker(fn) {
    const
        originalSetInterval   = globalThis.setInterval,
        originalClearInterval = globalThis.clearInterval,
        liveIntervals         = new Set();

    globalThis.setInterval = (...args) => {
        const id = originalSetInterval(...args);
        liveIntervals.add(id);
        return id
    };

    globalThis.clearInterval = id => {
        liveIntervals.delete(id);
        return originalClearInterval(id)
    };

    try {
        await fn(liveIntervals)
    } finally {
        for (const id of liveIntervals) {
            originalClearInterval(id)
        }
        globalThis.setInterval   = originalSetInterval;
        globalThis.clearInterval = originalClearInterval
    }
}

test.describe('Neo.component.MagicMoveText timer lifecycle', () => {
    test('startAutoCycle(true) is idempotent (two starts leave one interval, stop leaves zero)', async () => {
        await withIntervalTracker(async liveIntervals => {
            const component = Neo.create(MagicMoveText, {
                appName,
                autoCycle        : false,
                autoCycleInterval: 500,
                cycleTexts       : ['First', 'Second', 'Third']
            });

            try {
                await component.initVnode();
                component.mounted = true;

                expect(liveIntervals.size).toBe(0);

                component.startAutoCycle(true);
                expect(liveIntervals.size).toBe(1);

                component.startAutoCycle(true);
                expect(liveIntervals.size).toBe(1);

                component.startAutoCycle(false);
                expect(liveIntervals.size).toBe(0)
            } finally {
                component.destroy()
            }
        })
    });

    test('defers interval while hidden, starts one on return, and cleans up on destroy', async () => {
        await withIntervalTracker(async liveIntervals => {
            const
                app       = Neo.apps[1],
                component = Neo.create(MagicMoveText, {
                    appName,
                    autoCycle        : false,
                    autoCycleInterval: 500,
                    cycleTexts       : ['First', 'Second', 'Third']
                });

            await component.initVnode();
            component.mounted = true;

            app.fire('visibilitychange', {hidden: true, visibilityState: 'hidden', windowId: 1});
            component.autoCycle = true;
            expect(liveIntervals.size).toBe(0);

            app.fire('visibilitychange', {hidden: false, visibilityState: 'visible', windowId: 1});
            expect(liveIntervals.size).toBe(1);

            component.destroy();
            expect(liveIntervals.size).toBe(0);
            expect(visibilityListeners.size).toBe(0)
        })
    })
});
