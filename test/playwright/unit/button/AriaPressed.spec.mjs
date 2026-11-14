import {setup} from '../../setup.mjs';

const appName = 'AriaPressedTest';

// Call setup with the specific configuration for this test file
setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
// Register the core namespace and the vdom Helper first (same import block
// as button/Base.spec.mjs): mounting a real component via initVnode() needs
// Neo.vdom.Helper, and class side effects depend on this import order.
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import Component          from '../../../../src/component/Base.mjs';
import TabContainer       from '../../../../src/tab/Container.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.button.Base aria-pressed (Node.js)', () => {

    test('plain button renders no aria-pressed', async () => {
        const button = Neo.create(Button, {appName, text: 'Plain'});
        const {vnode} = await button.initVnode();
        button.destroy();

        expect(vnode.attributes?.['aria-pressed']).toBeUndefined();
    });

    test('pressed button renders aria-pressed and stays in sync', async () => {
        const button = Neo.create(Button, {appName, text: 'Toggle', pressed: true});
        const {vnode} = await button.initVnode();
        button.mounted = true;

        expect(vnode.attributes?.['aria-pressed']).toBe('true');

        await button.set({pressed: false});
        expect(button.vdom['aria-pressed']).toBe('false');
        button.destroy();
    });

    test('a Boolean->null transition removes aria-pressed', async () => {
        const button = Neo.create(Button, {appName, text: 'Back to plain', pressed: true});
        await button.initVnode();
        button.mounted = true;

        await button.set({pressed: null});
        expect(button.vdom['aria-pressed']).toBeUndefined();
        button.destroy();
    });

    test('a null->false transition renders aria-pressed="false"', async () => {
        const button = Neo.create(Button, {appName, text: 'Declared toggle'});
        await button.initVnode();
        button.mounted = true;

        await button.set({pressed: false});
        expect(button.vdom['aria-pressed']).toBe('false');
        button.destroy();
    });

    test('a tab header renders aria-selected and no aria-pressed', async () => {
        const tabs = Neo.create(TabContainer, {
            appName,
            items: [
                {header: {text: 'One'}, module: Component},
                {header: {text: 'Two'}, module: Component}
            ]
        });
        const [first, second] = tabs.getTabButtons();

        expect(first.vdom.role).toBe('tab');
        expect(first.vdom['aria-pressed'], 'ARIA allows aria-pressed on role="button" only').toBeUndefined();
        expect(first.vdom['aria-selected']).toBe(true);
        expect(second.vdom['aria-pressed']).toBeUndefined();
        expect(second.vdom['aria-selected']).toBe(false);

        tabs.activeIndex = 1;

        await expect.poll(() => second.vdom['aria-selected']).toBe(true);
        expect(first.vdom['aria-selected']).toBe(false);
        expect(first.vdom['aria-pressed']).toBeUndefined();
        expect(second.vdom['aria-pressed']).toBeUndefined();

        tabs.destroy();
    });
});
