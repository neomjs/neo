import { setup } from '../../setup.mjs';

setup();

import { test, expect } from '@playwright/test';

import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';

/**
 * @summary Tests the InstanceManager functionality for tracking Neo.mjs instances.
 *
 * This test suite verifies that the InstanceManager correctly tracks instances
 * when they are created and removed, and provides proper lookup functionality
 * by both reference and ID.
 */
test.describe('ManagerInstance', () => {
    let startCount;

    test('Module imports', () => {
        expect(Neo).toBeDefined();
        expect(InstanceManager).toBeDefined();
    });

    test('Adding & removing items', () => {
        startCount = InstanceManager.getCount();

        // Create 3 Neo instances
        const
            item1 = Neo.create('Neo.core.Base'),
            item2 = Neo.create('Neo.core.Base'),
            item3 = Neo.create('Neo.core.Base');

        expect(InstanceManager.getCount() - startCount).toBe(3);

        expect(InstanceManager.findFirst(item2)).toBe(item2);

        expect(InstanceManager.findFirst({id: item3.id})).toBe(item3);

        item1.destroy();
        item2.destroy();
        item3.destroy();

        expect(InstanceManager.getCount()).toBe(startCount);
    });
});
