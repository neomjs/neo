import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ToolbarKeyboardNavigationTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Toolbar        from '../../../../src/toolbar/Base.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Pins the opt-in `keyboardNavigation` contract of `Neo.toolbar.Base`.
 *
 * The main-thread Navigator does not exist in the unit realm, so a recording stand-in replaces it:
 * these cases pin the role and the subscription lifecycle; the browser spec pins the key handling.
 */
test.describe('Neo.toolbar.Base keyboardNavigation', () => {
    let calls     = [],
        instances = [],
        snapshot  = null;

    const own = instance => {
        instances.push(instance);
        return instance
    };

    test.beforeEach(() => {
        const addons = Neo.ns('Neo.main.addon', true);

        snapshot = {existed: 'Navigator' in addons, value: addons.Navigator};
        calls    = [];

        addons.Navigator = {
            subscribe  : data => calls.push(['subscribe',   data]),
            unsubscribe: data => calls.push(['unsubscribe', data])
        }
    });

    test.afterEach(() => {
        instances.reverse().forEach(instance => !instance.isDestroyed && instance.destroy());
        instances = [];

        const addons = Neo.ns('Neo.main.addon', true);

        if (snapshot.existed) {
            addons.Navigator = snapshot.value
        } else {
            delete addons.Navigator
        }
    });

    test('a role-less toolbar becomes a toolbar and subscribes its direct enabled buttons while mounted', () => {
        const toolbar = own(Neo.create(Toolbar, {
            keyboardNavigation: true,
            items             : [{text: 'One'}, {text: 'Two'}]
        }));

        expect(toolbar.role).toBe('toolbar');
        expect(calls, 'nothing to navigate before the DOM exists').toEqual([]);

        toolbar.mounted = true;

        expect(calls.map(([name]) => name)).toEqual(['subscribe']);
        expect(calls[0][1]).toMatchObject({
            id      : toolbar.id,
            selector: `[id="${toolbar.id}"] > .neo-button:not([disabled])`,
            wrap    : true
        });

        toolbar.mounted = false;

        expect(calls.map(([name]) => name)).toEqual(['subscribe', 'unsubscribe']);
        expect(calls[1][1]).toBe(calls[0][1]);
        expect(toolbar.navigator).toBeNull()
    });

    test('a toolbar with a role of its own keeps it', () => {
        const toolbar = own(Neo.create(Toolbar, {keyboardNavigation: true, role: 'menubar'}));

        expect(toolbar.role).toBe('menubar')
    });

    test('off by default: no role and no subscription', () => {
        const toolbar = own(Neo.create(Toolbar, {items: [{text: 'One'}]}));

        expect(toolbar.keyboardNavigation).toBe(false);
        expect(toolbar.role).toBeNull();

        toolbar.mounted = true;

        expect(calls).toEqual([])
    })
});
