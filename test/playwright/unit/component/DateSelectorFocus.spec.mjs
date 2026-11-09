import {setup} from '../../setup.mjs';

const appName = 'DateSelectorWindowFocusTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DateSelector   from '../../../../src/component/DateSelector.mjs';
import FocusManager   from '../../../../src/manager/Focus.mjs';

/**
 * @summary A settled DateSelector update restores focus only when its own window has no pending leave.
 */
test('DateSelector reads pending focusout from its own window', async () => {
    const field             = Neo.create(DateSelector, {appName, windowId: 'date-window', value: '2026-11-05'}),
          originalDomAccess = Neo.main.DomAccess,
          originalPending   = FocusManager.pendingFocusOut,
          calls             = [];

    field.containsFocus = true;
    field.selectionModel.items = ['date-focus-cell'];
    field.promiseUpdate = () => Promise.resolve();
    Neo.main.DomAccess = {focus: async data => calls.push(data)};

    try {
        FocusManager.pendingFocusOut = {'date-window': {componentPath: [field.id]}};
        field.triggerVdomUpdate();
        await expect.poll(() => field.isUpdating).toBe(false);
        expect(calls).toEqual([]);

        FocusManager.pendingFocusOut = {'other-window': {componentPath: [field.id]}};
        field.triggerVdomUpdate();
        await expect.poll(() => field.isUpdating).toBe(false);
        expect(calls).toEqual([{id: 'date-focus-cell', windowId: 'date-window'}])
    } finally {
        Neo.main.DomAccess = originalDomAccess;
        FocusManager.pendingFocusOut = originalPending;
        field.destroy()
    }
});
