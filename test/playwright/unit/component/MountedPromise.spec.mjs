/**
 * @file test/playwright/unit/component/MountedPromise.spec.mjs
 * @summary Pins that `mountedPromise` never hands an unmounted component a promise an earlier mount resolved.
 *
 * `container.Base#insert` copies an instance into another window's container with a raw `_mounted = false`,
 * which skips `afterSetMounted()` and therefore its reset of the promise. `updateVdom()` on an unmounted
 * component waits on `mountedPromise.then(update)`: a resolved promise fires that at once, and the component,
 * still unmounted, waits again. The browser witness is `e2e/dashboard/LegacyPopupReturnNL.spec.mjs`, whose
 * window drag takes that insert path.
 */

import {setup} from '../../setup.mjs';

const appName = 'MountedPromiseTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Whether a promise settles within the current microtask drain.
 * @param {Promise} promise
 * @returns {Promise<Boolean>}
 */
const settlesNow = async promise => {
    let settled = false;

    promise.then(() => {settled = true});
    await new Promise(resolve => setTimeout(resolve, 0));

    return settled
};

test.describe('component.Abstract: mountedPromise after an unmount that skipped afterSetMounted()', () => {
    let instances;

    const create = (module, config) => {
        const instance = Neo.create(module, {appName, ...config});

        instances.push(instance);

        return instance
    };

    test.beforeEach(() => {
        instances = []
    });

    test.afterEach(() => {
        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    test('an insert into another window that keeps the item in its previous parent: pending until the next mount', async () => {
        const source = create(Container, {windowId: 'source-window'}),
              target = create(Container, {windowId: 'target-window'}),
              widget = create(Component, {});

        source.add(widget, true);
        widget.mounted = true;

        const settled = widget.mountedPromise;

        expect(await settlesNow(settled), 'control: a mounted component\'s promise settles').toBe(true);
        expect(widget.mountedPromise, 'and stays the same promise while mounted').toBe(settled);

        target.add(widget, true, false);

        const next = widget.mountedPromise;

        expect(widget.mounted, 'the copy is unmounted in its new window').toBe(false);
        expect(await settlesNow(next), 'an earlier mount does not settle the next one').toBe(false);
        expect(widget.mountedPromise, 'every waiter gets the one pending promise').toBe(next);

        widget.mounted = true;

        expect(await settlesNow(next), 'the next mount settles it').toBe(true)
    });

    test('one update() on an unmounted component holding an earlier mount\'s promise runs once', async () => {
        const component = create(Component, {parentId: 'document.body', windowId: 'source-window'}),
              {update}  = component;
        let calls = 0;

        component.vnode            = {id: component.id, nodeName: 'div'};
        component.vnodeInitialized = true;
        component.mounted          = true;
        await settlesNow(component.mountedPromise);

        // The raw write `container.Base#insert` performs for a copy into another window
        component._mounted = false;

        // Capped, so a loop fails this arm instead of starving the worker
        component.update = function() {
            ++calls < 20 && update.call(this)
        };

        component.update();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(calls, 'the update waits for the next mount instead of re-entering itself').toBe(1)
    })
});
