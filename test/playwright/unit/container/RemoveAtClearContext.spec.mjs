import {setup} from '../../setup.mjs';

const appName = 'ContainerRemoveAtClearContextTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Component        from '../../../../src/component/Base.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import Container        from '../../../../src/container/Base.mjs';

/**
 * @summary Verifies that `Neo.container.Base#removeAt(index, false)` clears `appName`, `parentId`,
 * and `parentIndex` when `keepMounted` is `false`, and restores them when re-added.
 */
test.describe('Neo.container.Base#removeAt clear context (#4066)', () => {
    let container, otherContainer;

    test.afterEach(() => {
        container?.destroy();
        otherContainer?.destroy();
        container = otherContainer = null
    });

    test('removeAt(index, false) clears appName, parentId, parentIndex, and childMap registration; re-adding restores them', () => {
        container = Neo.create(Container, {
            appName,
            items: [
                {module: Component, id: 'remove-ctx-item-0'},
                {module: Component, id: 'remove-ctx-item-1'}
            ]
        });

        otherContainer = Neo.create(Container, {
            appName: 'OtherApp',
            items  : [{module: Component, id: 'other-ctx-item-0'}]
        });

        const item0 = container.items[0];
        item0.mounted = true;

        expect(item0.appName).toBe(appName);
        expect(item0.parentId).toBe(container.id);
        expect(item0.parentIndex).toBe(0);
        expect(container.down({id: 'remove-ctx-item-0'})).toBe(item0);

        const removed = container.removeAt(0, false);

        expect(removed).toBe(item0);
        expect(item0.mounted).toBe(false);
        expect(item0.appName).toBeNull();
        expect(item0.parentId).toBeNull();
        expect(item0.parentIndex).toBeNull();
        expect(item0.parent).toBeNull();
        expect(container.down({id: 'remove-ctx-item-0'})).toBeNull();
        expect(ComponentManager.getDirectChildren(container.id)).toEqual([container.items[0]]);

        otherContainer.add(item0);

        expect(item0.appName).toBe('OtherApp');
        expect(item0.parentId).toBe(otherContainer.id);
        expect(item0.parentIndex).toBe(1);
        expect(item0.parent).toBe(otherContainer);
        expect(otherContainer.down({id: 'remove-ctx-item-0'})).toBe(item0)
    });

    test('removeAt(index, false, true, true) preserves context during atomic moves', () => {
        container = Neo.create(Container, {
            appName,
            items: [{module: Component, id: 'atomic-ctx-item-0'}]
        });

        const item = container.items[0];
        item.mounted = true;

        const removed = container.removeAt(0, false, true, true);

        expect(removed).toBe(item);
        expect(item.mounted).toBe(true);
        expect(item.appName).toBe(appName);
        expect(item.parentId).toBe(container.id);
        expect(item.parentIndex).toBe(0);

        item.destroy()
    })
});
