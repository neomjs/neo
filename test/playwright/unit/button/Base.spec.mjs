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
import EffectButton       from '../../../../src/button/Effect.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VBox               from '../../../../src/layout/VBox.mjs';
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

    test('should preserve config-derived classes when authored cls is reapplied', async () => {
        for (const silent of [false, true]) {
            const button = Neo.create(Button, {
                appName,
                cls: ['probe-action'],
                ui : 'ghost'
            });

            await button.initVnode();
            button.mounted = true;

            const expected = [...button.cls];

            await button.set({
                cls: ['probe-action'],
                ui : 'ghost'
            }, silent);

            expect(button.cls).toEqual(expected);
            expect(button.vdom.cls).toEqual(expected);

            button.destroy()
        }
    });

    test('effect-generated classes survive unrelated owner contribution changes', () => {
        const button = Neo.create(EffectButton, {
            appName,
            cls: ['authored-action'],
            ui : 'ghost'
        });

        expect(button.vdom.cls).toEqual([
            'authored-action',
            'neo-button',
            'neo-effect-button-ghost',
            'no-text',
            'icon-left'
        ]);

        button.ui = null;

        expect(button.vdom.cls).toEqual([
            'authored-action',
            'neo-button',
            'no-text',
            'icon-left'
        ]);

        button.destroy()
    });

    test('should replace only authored cls while preserving unchanged owners', async () => {
        const button = Neo.create(Button, {
            appName,
            cls: ['authored-a'],
            ui : 'ghost'
        });

        button.cls = ['authored-b'];

        expect(button.cls).toEqual([
            'authored-b',
            'neo-button',
            'no-text',
            'neo-button-ghost',
            'icon-left'
        ]);
        expect(button.cls).not.toContain('authored-a');

        button.destroy()
    });

    test('should preserve getter provenance through a mutate-and-reassign round trip', () => {
        const button = Neo.create(Button, {
            appName,
            cls: ['authored-a'],
            ui : 'ghost'
        });
        const projectedCls = button.cls;

        projectedCls.push('authored-b');
        button.cls = projectedCls;

        expect(button.getAuthoredCls()).toEqual(['authored-a', 'authored-b']);
        expect(button.getAuthoredCls()).not.toContain('neo-button-ghost');
        expect(button.getAuthoredCls()).not.toContain('icon-left');

        button.set({
            iconPosition: 'right',
            text        : 'Ready',
            ui          : null
        });

        expect(button.cls).toEqual([
            'authored-a',
            'authored-b',
            'neo-button',
            'icon-right'
        ]);

        button.destroy()
    });

    test('should retain a token until its final logical owner releases it', () => {
        const button = Neo.create(Button, {
            appName,
            cls       : ['shared-token'],
            wrapperCls: ['shared-token']
        });

        button.wrapperCls = [];

        expect(button.cls).toContain('shared-token');
        expect(button.vdom.cls).toContain('shared-token');

        button.cls = [];

        expect(button.vdom.cls).not.toContain('shared-token');

        button.destroy()
    });

    test('should not let a config owner remove the caller contribution', () => {
        const button = Neo.create(Button, {
            appName,
            cls: ['neo-button-ghost'],
            ui : 'ghost'
        });

        button.ui = null;

        expect(button.cls).toContain('neo-button-ghost');
        expect(button.vdom.cls).toContain('neo-button-ghost');

        button.destroy()
    });

    test('should preserve layout-owned wrapper classes when wrapperCls is reapplied', () => {
        const container = Neo.create(Container, {
            appName,
            layout    : {ntype: 'vbox', align: 'start'},
            wrapperCls: ['authored-wrapper']
        });
        const expected = [...container.wrapperCls];

        container.wrapperCls = ['authored-wrapper'];

        expect(container.wrapperCls).toEqual(expected);

        container.destroy()
    });

    test('should serialize authored classes without promoting derived owners', () => {
        const button = Neo.create(Button, {
            appName,
            cls       : ['authored-root'],
            ui        : 'ghost',
            wrapperCls: ['authored-wrapper']
        });
        const
            live     = button.toJSON(),
            snapshot = button.toRecreationConfig();

        expect(live.cls).toEqual(button.cls);
        expect(live.wrapperCls).toEqual(button.wrapperCls);
        expect(live.vdom.cls).toEqual(button.vdom.cls);
        expect(snapshot.cls).toEqual(['authored-root']);
        expect(snapshot.wrapperCls).toEqual(['authored-wrapper']);
        expect(snapshot.vdom.cls).toEqual([]);

        button.destroy();

        const restored = Neo.create(Button, {...snapshot, id: 'restored-button'});

        restored.set({
            iconPosition: 'right',
            text        : 'Restored',
            ui          : null
        });

        expect(restored.cls).toEqual([
            'authored-root',
            'neo-button',
            'icon-right'
        ]);
        expect(restored.vdom.cls).toEqual([
            'authored-wrapper',
            'authored-root',
            'neo-button',
            'icon-right'
        ]);

        restored.destroy()
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
