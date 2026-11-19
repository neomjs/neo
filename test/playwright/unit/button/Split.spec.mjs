import {setup} from '../../setup.mjs';

const appName = 'SplitButtonTriggerTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import SplitButton     from '../../../../src/button/Split.mjs';

test.describe('Neo.button.Split: its trigger button', () => {

    test('is a child the split references, and moves to the split\'s window', () => {
        const splitButton     = Neo.create(SplitButton, {appName, text: 'Save'}),
              {triggerButton} = splitButton;

        expect(splitButton.vdom.cn[1]).toEqual(triggerButton.createVdomReference());
        expect(triggerButton.parentId).toBe(splitButton.id);
        expect(triggerButton.windowId).toBe(splitButton.windowId);

        splitButton.windowId = 2;

        expect(triggerButton.windowId).toBe(2);
        expect(triggerButton.appName).toBe(appName);

        splitButton.destroy()
    });

    test('runs splitButtonHandler in the scope of the split', () => {
        let scope;

        const splitButton = Neo.create(SplitButton, {
            appName,
            text               : 'Save',
            triggerButtonConfig: {useRippleEffect: false},

            splitButtonHandler() {
                scope = this
            }
        });

        splitButton.triggerButton.onClick({});

        expect(scope).toBe(splitButton);

        splitButton.destroy()
    });

    test('owns the menu, so a click on the main button runs only its handler', async () => {
        let clicks = 0;

        const splitButton = Neo.create(SplitButton, {
                appName,
                handler        : () => clicks++,
                menu           : [{text: 'Save as'}],
                text           : 'Save',
                useRippleEffect: false
              }),
              {triggerButton} = splitButton;

        await triggerButton.menuListReady;

        expect(triggerButton.menuList.align.target).toBe(triggerButton.id);
        expect(splitButton.menuList).toBeUndefined();

        splitButton.onClick({});

        expect(clicks).toBe(1);
        expect(triggerButton.menuList.hidden).toBe(true);

        splitButton.menu = null;

        expect(triggerButton.menu).toBeNull();

        splitButton.destroy()
    });
});
