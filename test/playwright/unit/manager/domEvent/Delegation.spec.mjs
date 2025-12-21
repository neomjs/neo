import {setup} from '../../../setup.mjs';

const appName = 'DomEventTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Component      from '../../../../../src/component/Base.mjs';
import Container      from '../../../../../src/container/Base.mjs';
import DomEvent       from '../../../../../src/manager/DomEvent.mjs';
import VdomHelper     from '../../../../../src/vdom/Helper.mjs';

test.describe('Neo.manager.DomEvent Delegation Verification', () => {

    test('should verify delegation via Physical Path (Phase 1)', async () => {
        const container = Neo.create(Container, {
            appName,
            autoMount: true,
            id       : 'container-1',
            items    : [{
                module: Component,
                id    : 'child-1',
                cls   : ['child-cls']
            }]
        });

        const child = container.items[0];

        const listener = {
            vnodeId: 'container-1',
            ownerId: 'container-1',
            delegate: '.child-cls'
        };

        const path = [
            { id: 'child-1', cls: ['neo-component', 'child-cls'] },
            { id: 'container-1', cls: ['neo-container'] },
            { id: 'body', cls: [] }
        ];

        const targetId = DomEvent.verifyDelegationPath(listener, path, ['child-1', 'container-1']);

        expect(targetId).toBe('child-1');

        container.destroy();
    });

    test('should verify delegation via Logical VNode Fallback (Portal/Proxy)', async () => {
        // Scenario: Component IS in parent's items (and VDOM), but physically detached.
        // This expects the VNode check to pass.

        const parent = Neo.create(Container, {
            appName,
            id: 'portal-parent',
            items: [{
                module: Component,
                id: 'portal-child',
                cls: ['target-cls']
            }]
        });
        await parent.initVnode();

        const listener = {
            vnodeId: 'portal-parent',
            ownerId: 'portal-parent',
            delegate: '.target-cls'
        };

        // Broken physical path (child -> body)
        const brokenPath = [
            { id: 'portal-child', cls: ['target-cls'] },
            { id: 'body', cls: [] }
        ];

        const componentPath = ['portal-child', 'portal-parent'];

        const targetId = DomEvent.verifyDelegationPath(listener, brokenPath, componentPath);

        expect(targetId).toBe('portal-child');

        parent.destroy();
    });

    test('should verify delegation via parentComponent (Menu)', async () => {
        // Scenario: Component is NOT in parent's items (NOT in VDOM), but linked via parentComponent.
        // This checks if we still support purely logical bubbling for things like Menus.

        const parent = Neo.create(Container, {
            appName,
            id: 'menu-parent',
            items: []
        });
        await parent.initVnode();

        const child = Neo.create(Component, {
            appName,
            id: 'menu-child',
            parentComponent: parent, // Logical link
            cls: ['menu-item']
        });
        await child.initVnode();

        const listener = {
            vnodeId: 'menu-parent',
            ownerId: 'menu-parent',
            delegate: '.menu-item'
        };

        // Broken physical path
        const path = [
            { id: 'menu-child', cls: ['menu-item'] },
            { id: 'body', cls: [] }
        ];

        const componentPath = ['menu-child', 'menu-parent'];

        const targetId = DomEvent.verifyDelegationPath(listener, path, componentPath);

        // This requires fallback to componentPath check if VNode check fails
        expect(targetId).toBe('menu-child');

        parent.destroy();
        child.destroy();
    });

    test('should fail when target is neither physically nor logically present', async () => {
        const parent = Neo.create(Container, {
            appName,
            id: 'parent-real',
            items: []
        });
        await parent.initVnode();

        const listener = {
            vnodeId: 'parent-real',
            ownerId: 'parent-real',
            delegate: '.fake-cls'
        };

        // Path has a random element not in parent
        const randomPath = [
            { id: 'random-el', cls: ['fake-cls'] },
            { id: 'body', cls: [] }
        ];

        // ComponentPath should NOT contain the random element to simulate a real failure.
        // If 'random-el' is in componentPath, Phase 3 will mistakenly accept it.
        const componentPath = ['parent-real'];

        const targetId = DomEvent.verifyDelegationPath(listener, randomPath, componentPath);

        expect(targetId).toBe(false);

        parent.destroy();
    });
});
