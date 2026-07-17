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
import SplitButton        from '../../../../src/button/Split.mjs';
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

    test('should project disabled state onto Button and SplitButton native roots', async () => {
        const button = Neo.create(Button, {
            appName,
            text: 'Native semantics'
        });
        let {vnode} = await button.initVnode();
        button.mounted = true;

        expect(vnode.attributes.disabled).toBeUndefined();
        expect(vnode.className).not.toContain('neo-disabled');

        ({vnode} = await button.set({disabled: true}));

        expect(button.getVdomRoot().disabled).toBe(true);
        expect(vnode.attributes.disabled).toBe('true');
        expect(vnode.className).toContain('neo-disabled');

        ({vnode} = await button.set({disabled: false}));

        expect(vnode.attributes.disabled).toBeUndefined();
        expect(vnode.className).not.toContain('neo-disabled');

        const splitButton = Neo.create(SplitButton, {
            appName,
            disabled: true,
            text    : 'Split action'
        });
        const splitVnode = (await splitButton.initVnode()).vnode;

        expect(splitVnode.childNodes).toHaveLength(2);
        expect(splitVnode.childNodes[0].nodeName).toBe('button');
        expect(splitVnode.childNodes[0].attributes.disabled).toBe('true');
        expect(splitVnode.childNodes[1].nodeName).toBe('button');
        expect(splitVnode.childNodes[1].attributes.disabled).toBe('true');

        await splitButton.set({disabled: false});

        expect(splitButton.getVdomRoot().disabled).toBeUndefined();
        expect(splitButton.triggerButton.getVdomRoot().disabled).toBeUndefined();

        splitButton.destroy();
        button.destroy();
    });

    test('should keep native disabled aligned with button-to-anchor transitions', async () => {
        const urlButton = Neo.create(Button, {
            appName,
            disabled: true,
            text    : 'External link',
            url     : 'https://example.com'
        });
        let {vnode} = await urlButton.initVnode();

        urlButton.mounted = true;

        expect(vnode.nodeName).toBe('a');
        expect(vnode.attributes.disabled).toBeUndefined();
        expect(vnode.className).toContain('neo-disabled');

        ({vnode} = await urlButton.set({url: null}));

        expect(vnode.nodeName).toBe('button');
        expect(vnode.attributes.disabled).toBe('true');

        ({vnode} = await urlButton.set({url: 'https://example.com/again'}));

        expect(vnode.nodeName).toBe('a');
        expect(vnode.attributes.disabled).toBeUndefined();

        const routeButton = Neo.create(Button, {
            appName,
            disabled : true,
            editRoute: false,
            route    : 'details',
            text     : 'Internal link'
        });
        const routeVnode = (await routeButton.initVnode()).vnode;

        expect(routeVnode.nodeName).toBe('a');
        expect(routeVnode.attributes.href).toBe('#details');
        expect(routeVnode.attributes.disabled).toBeUndefined();
        expect(routeVnode.className).toContain('neo-disabled');

        routeButton.destroy();
        urlButton.destroy();
    });

    test('Prototype VDOM mutation check', async () => {
        // Manually clean prototype to verify the fix or demonstrate the bug
        // Note: We need to access the prototype from the class constructor
        const protoVdom = Button.prototype._vdom;
        if (protoVdom.cn[1].id) {
            delete protoVdom.cn[1].id;
        }

        const button1 = Neo.create(Button, {
            appName,
            id: 'my-button-1',
            text: 'Button 1'
        });

        // Instance should have it
        // Updated expectation: The text node ID is no longer explicitly set by ensureStableIds
        expect(button1.textNode.id).toBeUndefined();

        // Prototype should NOT have it (this will fail if bug is present)
        expect(Button.prototype._vdom.cn[1].id).toBeUndefined();

        button1.destroy();
    });
});
