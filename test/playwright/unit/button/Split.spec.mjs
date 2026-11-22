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
import Container       from '../../../../src/container/Base.mjs';
import Controller      from '../../../../src/controller/Component.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import SplitButton     from '../../../../src/button/Split.mjs';

const calls = [];

/**
 * A controller that happens to define a method named like the split's own caret handler
 */
class CaretController extends Controller {
    static config = {
        className: 'Test.Unit.SplitButton.CaretController'
    }

    onCaret() {
        calls.push('named')
    }

    splitButtonHandler() {
        calls.push('controller')
    }
}

/**
 * A split button subclass with its own caret handler
 */
class OwnCaretSplit extends SplitButton {
    static config = {
        className: 'Test.Unit.SplitButton.OwnCaretSplit'
    }

    splitButtonHandler() {
        calls.push('split')
    }
}

Neo.setupClass(CaretController);
Neo.setupClass(OwnCaretSplit);

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

    test('runs the split\'s own splitButtonHandler before a controller method of that name; a named handler reaches the controller', () => {
        calls.length = 0;

        const own = Neo.create(OwnCaretSplit, {
                  appName,
                  controller         : CaretController,
                  text               : 'Save',
                  triggerButtonConfig: {useRippleEffect: false}
              }),
              named = Neo.create(SplitButton, {
                  appName,
                  controller         : CaretController,
                  text               : 'Save',
                  triggerButtonConfig: {handler: 'onCaret', useRippleEffect: false}
              });

        own.triggerButton.onClick({});
        named.triggerButton.onClick({});

        expect(calls).toEqual(['split', 'named']);

        own.destroy();
        named.destroy()
    });

    test('hands its own theme to the floating menu of its trigger, at creation and after a change', async () => {
        const host = Neo.create(Container, {
                  appName,
                  theme: 'neo-theme-light',
                  items: [{module: SplitButton, menu: [{text: 'Save as'}], text: 'Save', theme: 'neo-theme-dark'}]
              }),
              splitButton     = host.items[0],
              {triggerButton} = splitButton;

        await triggerButton.menuListReady;

        expect(splitButton.theme, 'its own theme, not the host\'s').toBe('neo-theme-dark');
        expect(triggerButton.menuList.theme).toBe('neo-theme-dark');

        splitButton.theme = 'neo-theme-neo-light';

        expect(triggerButton.menuList.theme).toBe('neo-theme-neo-light');

        host.destroy()
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

        // A trigger click bubbles to the split through its logical parent; the split leaves it to the trigger
        splitButton.onClick({path: [{id: triggerButton.id}, {id: `${splitButton.id}__wrapper`}]});

        expect(clicks).toBe(1);

        splitButton.menu = null;

        expect(triggerButton.menu).toBeNull();

        splitButton.destroy()
    });
});
