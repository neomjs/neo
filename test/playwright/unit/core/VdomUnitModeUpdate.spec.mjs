import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'CoreVdomUnitModeUpdateTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';

/**
 * Direct contract pin for the unit-mode vdom-update semantics: when `unitTestMode` disables vdom
 * updates (`allowVdomUpdatesInTests: false`), a skipped update is a SUCCESSFUL no-op — the promise
 * RESOLVES. It must never reject: every naked `promiseUpdate().then()` chain in the framework
 * (container insert/remove and friends) would otherwise surface an unhandled `undefined` rejection
 * the moment a spec structurally mutates an unmounted container.
 *
 * The destroy-path contract (a pending update promise REJECTS when its component is destroyed)
 * is pinned separately in `test/playwright/unit/core/AsyncDestruction.spec.mjs` and is unchanged.
 */
test.describe('VdomLifecycle unit-mode update contract', () => {
    test('promiseUpdate() resolves as a successful no-op while unit mode disables vdom updates', async () => {
        const component = Neo.create(Component, {id: 'vdom-unitmode-resolve'});

        await expect(component.promiseUpdate()).resolves.toBeUndefined();

        component.destroy()
    });

    test('a structural container op on an unmounted container settles cleanly — insert event fires, nothing rejects', async () => {
        const container = Neo.create(Container, {id: 'vdom-unitmode-container', items: []});
        const inserted  = [];

        container.on('insert', data => inserted.push(data));
        container.insert(0, {module: Component, id: 'vdom-unitmode-child'});

        // insert()'s own promiseUpdate().then(fire) chain settles on the microtask queue.
        await container.promiseUpdate();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(container.items).toHaveLength(1);
        expect(inserted).toHaveLength(1);

        container.destroy()
    });
});
