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
import Button         from '../../../../src/button/Base.mjs';

test.describe('Neo.button.Base aria-pressed (Node.js)', () => {

    test('plain button renders no aria-pressed', async () => {
        const button = Neo.create(Button, {appName, text: 'Plain'});
        const {vnode} = await button.initVnode();
        button.destroy();

        expect(vnode.attr?.['aria-pressed']).toBeUndefined();
    });

    test('pressed button renders aria-pressed and stays in sync', async () => {
        const button = Neo.create(Button, {appName, text: 'Toggle', pressed: true});
        const {vnode} = await button.initVnode();
        button.destroy();

        expect(vnode.attr?.['aria-pressed']).toBe('true');

        button.set({pressed: false});
        expect(button.vdom['aria-pressed']).toBe('false');
    });

    test('a Boolean->null transition removes aria-pressed', async () => {
        const button = Neo.create(Button, {appName, text: 'Back to plain', pressed: true});
        await button.initVnode();
        button.destroy();

        button.set({pressed: null});
        expect(button.vdom['aria-pressed']).toBeUndefined();
    });
});
