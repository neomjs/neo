import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'FunctionalButtonTest'
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/functional/button/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

const appName = 'FunctionalButtonTest';

/**
 * @summary Tests the functional Button component's VDOM rendering and update behavior.
 *
 * This test suite verifies that the functional Button component correctly creates
 * initial VDOM structures, handles single and multiple config changes with proper
 * delta generation, and manages state changes like the pressed state.
 */
test.describe('functional/Button', () => {
    let button, vnode;
    let testRun = 0;

    test.beforeEach(async () => {
        testRun++;

        button = Neo.create(Button, {
            appName,
            id     : 'my-button-' + testRun,
            iconCls: 'fa fa-home',
            text   : 'Click me'
        });

        ({vnode} = await button.initVnode());
        button.mounted = true; // Manually mount to enable updates in the test env
    });

    test.afterEach(() => {
        button?.destroy();
        button = null;
        vnode  = null;
    });

    test('should create initial vnode correctly', async () => {
        expect(vnode.nodeName).toBe('button');
        expect(vnode.className).toEqual(['neo-button', 'icon-left']);
        expect(vnode.childNodes.length).toBe(2); // icon & text. badge & ripple have removeDom:true

        const iconNode = vnode.childNodes[0];
        expect(iconNode.className).toEqual(['neo-button-glyph', 'fa', 'fa-home']);

        const textNode = vnode.childNodes[1];
        expect(textNode.className).toEqual(['neo-button-text']);
        expect(textNode.textContent).toBe('Click me');
    });

    test('should update vnode and create delta for a single config change', async () => {
        const textNodeId = vnode.childNodes[1].id;
        const {deltas} = await button.set({text: 'New Text'});

        expect(deltas.length).toBe(1); // 'Should generate exactly one delta'
        const delta = deltas[0];

        expect(delta.id).toBe(textNodeId); // 'Delta should target the text node'
        expect(delta.textContent).toBe('New Text'); // 'Delta textContent is correct'
    });

    test('should update vnode and create delta for multiple config changes', async () => {
        const iconNodeId = vnode.childNodes[0].id;
        const textNodeId = vnode.childNodes[1].id;

        const {deltas} = await button.set({
            iconCls: 'fa fa-user',
            text   : 'Submit'
        });

        expect(deltas.length).toBe(2); // 'Should generate exactly two deltas'

        const iconDelta = deltas.find(d => d.id === iconNodeId);
        const textDelta = deltas.find(d => d.id === textNodeId);

        expect(iconDelta).toBeTruthy(); // 'Should have a delta for the icon node'
        expect(iconDelta.cls.remove).toEqual(['fa-home']); // 'Icon delta should remove old class'
        expect(iconDelta.cls.add).toEqual(['fa-user']); // 'Icon delta should add new class'

        expect(textDelta).toBeTruthy(); // 'Should have a delta for the text node'
        expect(textDelta.textContent).toBe('Submit'); // 'Text delta is correct'
    });

    test('should handle pressed state change', async () => {
        expect(vnode.className.includes('pressed')).toBeFalsy(); // 'Initial vnode should not have "pressed" class'

        let updateData = await button.set({pressed: true});

        expect(updateData.deltas.length).toBe(1); // 'Should generate one delta for pressed: true'
        let delta = updateData.deltas[0];
        expect(delta.id).toBe(button.id); // 'Delta should target the button component root'
        expect(delta.cls.add).toEqual(['pressed']); // 'Delta should add "pressed" class'
        expect(updateData.vnode.className.includes('pressed')).toBeTruthy(); // 'Vnode should have "pressed" class'

        updateData = await button.set({pressed: false});

        expect(updateData.deltas.length).toBe(1); // 'Should generate one delta for pressed: false'
        delta = updateData.deltas[0];
        expect(delta.id).toBe(button.id); // 'Delta should target the button component root'
        expect(delta.cls.remove).toEqual(['pressed']); // 'Delta should remove "pressed" class'
        expect(updateData.vnode.className.includes('pressed')).toBeFalsy(); // 'Vnode should not have "pressed" class'
    });
});
