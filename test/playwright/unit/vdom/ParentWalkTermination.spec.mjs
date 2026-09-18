import {setup} from '../../setup.mjs';

const appName = 'ParentWalkTerminationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';

/**
 * @summary The parent walks of `Neo.mixin.VdomLifecycle` end at an ancestor whose `parentId` is `undefined`.
 *
 * `isParentUpdating()` and `mergeIntoParentUpdate()` default their `parentId` to `this.parentId` for the first call, and
 * recurse with each ancestor's `parentId`. An ancestor created with `parentId: undefined` must end the walk, not hand
 * `undefined` to the default and restart it from the component itself.
 */
test.describe('VdomLifecycle parent walks', () => {
    let child, top;

    test.beforeEach(() => {
        top   = Neo.create(Component, {appName, id: 'parent-walk-top', parentId: undefined});
        child = Neo.create(Component, {appName, id: 'parent-walk-child', parentId: top.id})
    });

    test.afterEach(() => {
        child.destroy();
        top.destroy()
    });

    test('an ancestor with an undefined parentId ends both walks', () => {
        expect(top.parentId, 'the fixture keeps the undefined parentId it was created with').toBeUndefined();

        expect(child.mergeIntoParentUpdate(), 'nothing to merge into').toBe(false);
        expect(child.isParentUpdating(), 'no ancestor is updating').toBe(false)
    })
});
