import {setup} from '../../setup.mjs';

const appName = 'ClassicButtonTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.button.Base VDOM (Node.js)', () => {

    test('should create initial vnode correctly', async () => {
        const button = Neo.create(Button, {
            appName,
            iconCls: 'fa fa-home',
            text   : 'Click me'
        });
        const { vnode } = await button.initVnode();
        button.destroy();

        expect(vnode.nodeName).toBe('button');
        expect(vnode.className).toEqual(['neo-button', 'icon-left']);
        expect(vnode.childNodes.length).toBe(2);

        const iconNode = vnode.childNodes[0];
        expect(iconNode.className).toEqual(['neo-button-glyph', 'fa', 'fa-home']);

        const textNode = vnode.childNodes[1];
        expect(textNode.className).toEqual(['neo-button-text']);
        expect(textNode.textContent).toBe('Click me');
    });

    test('should update vnode and create delta for a single config change', async () => {
        const button = Neo.create(Button, {
            appName,
            text: 'Click me'
        });
        await button.initVnode();
        button.mounted = true;

        const textNodeId = button.vnode.childNodes[0].id;
        const { deltas } = await button.set({text: 'New Text'});
        button.destroy();

        expect(deltas.length).toBe(1);
        const delta = deltas[0];
        expect(delta.id).toBe(textNodeId);
        expect(delta.textContent).toBe('New Text');
    });

    test('should update vnode and create delta for multiple config changes', async () => {
        const button = Neo.create(Button, {
            appName,
            iconCls: 'fa fa-home',
            text   : 'Click me'
        });
        await button.initVnode();
        button.mounted = true;

        const iconNodeId = button.vnode.childNodes[0].id;
        const textNodeId = button.vnode.childNodes[1].id;

        const { deltas } = await button.set({
            iconCls: 'fa fa-user',
            text   : 'Submit'
        });
        button.destroy();

        expect(deltas.length).toBe(2);

        const iconDelta = deltas.find(d => d.id === iconNodeId);
        const textDelta = deltas.find(d => d.id === textNodeId);

        expect(iconDelta).toBeDefined();
        expect(iconDelta.cls.remove).toEqual(['fa-home']);
        expect(iconDelta.cls.add).toEqual(['fa-user']);

        expect(textDelta).toBeDefined();
        expect(textDelta.textContent).toBe('Submit');
    });

    test('should handle pressed state change', async () => {
        const button = Neo.create(Button, {
            appName
        });
        const {vnode} = await button.initVnode();
        button.mounted = true;

        expect(vnode.className.includes('pressed')).toBe(false);

        let updateData = await button.set({pressed: true});
        expect(updateData.deltas.length).toBe(1);
        let delta = updateData.deltas[0];
        expect(delta.id).toBe(button.id);
        expect(delta.cls.add).toEqual(['pressed']);
        expect(updateData.vnode.className.includes('pressed')).toBe(true);

        updateData = await button.set({pressed: false});
        expect(updateData.deltas.length).toBe(1);
        delta = updateData.deltas[0];
        expect(delta.id).toBe(button.id);
        expect(delta.cls.remove).toEqual(['pressed']);
        expect(updateData.vnode.className.includes('pressed')).toBe(false);

        button.destroy();
    });
});
