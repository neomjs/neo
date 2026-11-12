import {setup} from '../../setup.mjs';

const appName = 'ButtonAriaPressedTest';

// The vdom projections of `pressed` are read off the vnode this suite builds, so the renderer has to stay on.
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
import Neo           from '../../../../src/Neo.mjs';
import * as core     from '../../../../src/core/_export.mjs';
import Button        from '../../../../src/button/Base.mjs';
// Loaded for their side effect: `Neo.vdom.Helper` is registered by the import, not by the namespace.
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * A mounted button whose vnode exists, so a config change produces deltas the way it does in an app.
 */
const mountedButton = async config => {
    const button = Neo.create(Button, {appName, ...config});

    const {vnode} = await button.initVnode();

    button.mounted = true;

    return {button, vnode}
};

test.describe('Neo.button.Base aria-pressed projection (Node.js)', () => {

    test('a plain button renders no aria-pressed, and a later update does not add one', async () => {
        const {button, vnode} = await mountedButton({text: 'Plain'});

        expect(button.pressed).toBeNull();
        expect(vnode.attributes['aria-pressed']).toBeUndefined();
        expect(vnode.className).not.toContain('pressed');

        const {vnode: nextVnode} = await button.set({text: 'Still plain'});

        expect(nextVnode.attributes['aria-pressed']).toBeUndefined();

        button.destroy()
    });

    test('a toggle button renders its state from creation', async () => {
        const {button, vnode} = await mountedButton({pressed: true, text: 'Bold'});

        expect(vnode.attributes['aria-pressed']).toBe('true');
        expect(vnode.className).toContain('pressed');

        button.destroy()
    });

    test('the attribute changes in the same update as the pressed class', async () => {
        const {button, vnode} = await mountedButton({pressed: false, text: 'Bold'});

        expect(vnode.attributes['aria-pressed']).toBe('false');
        expect(vnode.className).not.toContain('pressed');

        let updateData = await button.set({pressed: true});

        expect(updateData.vnode.attributes['aria-pressed']).toBe('true');
        expect(updateData.deltas).toHaveLength(1);
        expect(updateData.deltas[0].id).toBe(button.id);
        expect(updateData.deltas[0].cls.add).toEqual(['pressed']);
        expect(updateData.deltas[0].attributes['aria-pressed']).toBe('true');

        updateData = await button.set({pressed: false});

        expect(updateData.vnode.attributes['aria-pressed']).toBe('false');
        expect(updateData.deltas[0].cls.remove).toEqual(['pressed']);
        expect(updateData.deltas[0].attributes['aria-pressed']).toBe('false');

        button.destroy()
    });

    test('returning to null retires the attribute, so the button stops announcing itself as a toggle', async () => {
        const {button} = await mountedButton({pressed: true, text: 'Bold'});

        const {vnode} = await button.set({pressed: null});

        expect(vnode.attributes['aria-pressed']).toBeUndefined();
        expect(vnode.className).not.toContain('pressed');

        button.destroy()
    });
});
