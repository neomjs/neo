import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DelayableDestroyTest'}});

import {test, expect}               from '@playwright/test';
import Neo                          from '../../../../src/Neo.mjs';
import * as core                    from '../../../../src/core/_export.mjs';
import GridContainer                from '../../../../src/grid/Container.mjs';
import InstanceManager              from '../../../../src/manager/Instance.mjs';
import {buffer, debounce, throttle} from '../../../../src/util/Function.mjs';

/**
 * @summary Runs synchronous assertions with browser-style numeric timer ids and a controlled clock.
 * @param {Function} action Receives the pending timers and a function to advance time
 */
function withTimers(action) {
    const originalSetTimeout   = globalThis.setTimeout,
          originalClearTimeout = globalThis.clearTimeout,
          originalDateNow      = Date.now,
          pending              = new Map();
    let now = 1000, nextId = 0;

    globalThis.setTimeout = (callback, delay=0) => {
        const id = ++nextId;
        pending.set(id, {callback, at: now + delay});
        return id
    };
    globalThis.clearTimeout = id => pending.delete(id);
    Date.now = () => now;

    const tick = elapsed => {
        const end = now + elapsed;
        let next;

        while ((next = [...pending].filter(([, timer]) => timer.at <= end)
            .sort((a, b) => a[1].at - b[1].at)[0])) {
            const [id, timer] = next;
            pending.delete(id);
            now = timer.at;
            timer.callback()
        }

        now = end
    };

    try {
        action({pending, tick})
    } finally {
        globalThis.setTimeout   = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        Date.now                = originalDateNow
    }
}

test.describe('core.Base delayable destruction', () => {
    for (const type of ['buffer', 'debounce', 'throttle']) {
        for (const source of ['inherited', 'instance']) {
            test(`${source} ${type} is cancelled on destroy without cancelling a sibling`, () => {
                const calls = [];

                class Parent extends core.Base {
                    static config = {
                        className: `Test.Unit.Core.DelayableDestroy.${type}.${source}.Parent`
                    }

                    static delayable = source === 'inherited' ? {ping: {type, timer: 30}} : {};

                    /**
                     * @summary Records the receiver and arguments of a delayed invocation.
                     * @param {String} value The call's payload
                     */
                    ping(value) {
                        calls.push({scope: this, value})
                    }
                }

                class Child extends Neo.setupClass(Parent) {
                    static config = {
                        className: `Test.Unit.Core.DelayableDestroy.${type}.${source}.Child`
                    }
                }

                const Class    = Neo.setupClass(Child),
                      config   = source === 'instance' ? {delayable: {ping: {type, timer: 30}}} : {},
                      instance = Neo.create(Class, Neo.clone(config)),
                      sibling  = Neo.create(Class, Neo.clone(config));

                try {
                    withTimers(({pending, tick}) => {
                        instance.ping('first');
                        instance.ping('last');
                        sibling.ping('first');
                        sibling.ping('last');

                        const before = calls.filter(call => call.scope === instance);
                        expect(before.map(call => call.value)).toEqual(type === 'buffer' ? [] : ['first']);
                        expect(pending.size).toBe(2);

                        instance.destroy();
                        tick(60);

                        expect(calls.filter(call => call.scope === instance)).toEqual(before);
                        expect(calls.filter(call => call.scope === sibling).map(call => call.value))
                            .toEqual(type === 'buffer' ? ['last'] : ['first', 'last']);
                        expect(pending.size).toBe(0)
                    })
                } finally {
                    instance.destroy();
                    sibling.destroy()
                }
            })
        }
    }

    for (const [type, wrap] of Object.entries({buffer, debounce, throttle})) {
        test(`${type}.cancel clears pending work and allows a fresh call`, () => {
            withTimers(({pending, tick}) => {
                const calls   = [],
                      scope   = {id: 'delayable-cancel'},
                      wrapper = wrap(value => calls.push(value), scope, 30);

                wrapper.cancel(); // Cancelling before the first call is harmless.
                wrapper('first');
                wrapper('cancelled');
                expect(pending.size).toBe(1);

                const before = [...calls];
                wrapper.cancel();
                wrapper.cancel();
                expect(pending.size).toBe(0);

                wrapper('fresh');
                expect(calls).toEqual(type === 'buffer' ? before : [...before, 'fresh']);
                tick(60);
                expect(calls).toEqual([...before, 'fresh']);
                expect(pending.size).toBe(0)
            })
        })
    }

    test('destroying a grid during a scroll cancels onScrollEnd', async () => {
        const grid = Neo.create(GridContainer, {
            appName: 'DelayableDestroyTest',
            columns: [{dataField: 'name', text: 'Name'}],
            height : 200,
            width  : 400,
            store  : {model: {fields: [{name: 'name', type: 'String'}]}, data: [{name: 'row'}]}
        });

        try {
            await grid.ready();

            withTimers(({pending, tick}) => {
                const manager = grid.scrollManager;

                manager.rowHoverSync = false;
                manager.onContainerScroll({scrollLeft: 0, scrollTop: 0, target: {id: grid.view.id}});
                expect(manager.onScrollEnd.isPending).toBe(true);

                grid.destroy();
                expect(manager.isDestroyed).toBe(true);
                expect(() => tick(300)).not.toThrow();
                expect(pending.size).toBe(0)
            })
        } finally {
            grid.destroy()
        }
    })
});
