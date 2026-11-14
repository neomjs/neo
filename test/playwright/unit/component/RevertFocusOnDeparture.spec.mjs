import {setup} from '../../setup.mjs';

const appName = 'RevertFocusOnDepartureTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';

/**
 * @summary A component that departs (destroy, unmount) while it holds focus hands it back only when the main thread
 * settles the focus as lost. A focus the user moved on meanwhile, such as a tab pressed in another tabs node while a
 * dock refresh rebuilds this one's shell, stays where it is. An explicit `revertFocus()` stays immediate.
 */
test.describe('Neo.component.Base: focus handed back on departure', () => {
    let calls, departing, original, previous;

    test.beforeEach(() => {
        original  = Neo.main.DomAccess.settleFocusDeparture;
        calls     = [];
        previous  = Neo.create(Component, {appName, windowId: 'focus-window'});
        departing = Neo.create(Component, {appName, windowId: 'focus-window'});

        previous.focus           = () => calls.push('focus');
        departing.containsFocus  = true;
        departing.focusEnterData = {relatedTarget: {id: previous.id}}
    });

    test.afterEach(() => {
        Neo.main.DomAccess.settleFocusDeparture = original;
        previous.destroy()
    });

    test('a destroy whose focus the user moved on sends no focus', async () => {
        const settles = [], {id} = departing;

        Neo.main.DomAccess.settleFocusDeparture = async data => (settles.push(data), {lost: false});
        departing.destroy();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(settles, 'the main thread settles the departing element').toEqual([{id, windowId: 'focus-window'}]);
        expect(calls).toEqual([])
    });

    test('a destroy whose focus fell to the body hands it back', async () => {
        Neo.main.DomAccess.settleFocusDeparture = async () => ({lost: true});
        departing.destroy();

        await expect.poll(() => calls).toEqual(['focus'])
    });

    test('an unmount departs too', async () => {
        Neo.main.DomAccess.settleFocusDeparture = async () => ({lost: true});
        departing.mounted = true;
        departing.mounted = false;

        await expect.poll(() => calls).toEqual(['focus']);

        departing.containsFocus = false;
        departing.destroy()
    });

    test('an explicit revertFocus hands focus back at once, without a settle', () => {
        const settles = [];

        Neo.main.DomAccess.settleFocusDeparture = async data => (settles.push(data), {lost: true});
        departing.revertFocus();

        expect(calls).toEqual(['focus']);
        expect(settles).toEqual([]);

        departing.containsFocus = false;
        departing.destroy()
    })
});
