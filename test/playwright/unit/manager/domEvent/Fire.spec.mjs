import {setup} from '../../../setup.mjs';

const appName = 'DomEventFireTest';

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

test.describe('Neo.manager.DomEvent fire()', () => {

    test('should fire event on listener component', async () => {
        let eventFired = false;

        const component = Neo.create(Component, {
            appName,
            id: 'test-component',
            domListeners: [{
                click: () => { eventFired = true; }
            }]
        });
        await component.initVnode();

        const event = {
            eventName: 'click',
            data: {
                path: [{ id: 'test-component', cls: ['neo-component'] }, { id: 'body', cls: [] }]
            }
        };

        DomEvent.fire(event);

        expect(eventFired).toBe(true);

        component.destroy();
    });

    test('should support event bubbling', async () => {
        let parentFired = false,
            childFired  = false;

        const parent = Neo.create(Container, {
            appName,
            id: 'parent',
            domListeners: [{
                click: () => { parentFired = true; }
            }],
            items: [{
                module: Component,
                id: 'child',
                domListeners: [{
                    click: () => { childFired = true; },
                    bubble: true
                }]
            }]
        });
        await parent.initVnode();

        const event = {
            eventName: 'click',
            data: {
                path: [
                    { id: 'child', cls: ['neo-component'] },
                    { id: 'parent', cls: ['neo-container'] },
                    { id: 'body', cls: [] }
                ]
            }
        };

        DomEvent.fire(event);

        expect(childFired).toBe(true);
        expect(parentFired).toBe(true);

        parent.destroy();
    });

    test('should support stopping propagation (cancelBubble)', async () => {
        let parentFired = false,
            childFired  = false;

        const parent = Neo.create(Container, {
            appName,
            id: 'parent-stop',
            domListeners: [{
                click: () => { parentFired = true; }
            }],
            items: [{
                module: Component,
                id: 'child-stop',
                domListeners: [{
                    click: (data) => {
                        childFired = true;
                        data.cancelBubble = true; // Stop propagation
                    }
                }]
            }]
        });
        await parent.initVnode();

        const event = {
            eventName: 'click',
            data: {
                path: [
                    { id: 'child-stop', cls: ['neo-component'] },
                    { id: 'parent-stop', cls: ['neo-container'] },
                    { id: 'body', cls: [] }
                ]
            }
        };

        DomEvent.fire(event);

        expect(childFired).toBe(true);
        expect(parentFired).toBe(false); // Should NOT fire

        parent.destroy();
    });

    test('should support listener config bubble: false', async () => {
        let parentFired = false,
            childFired  = false;

        const parent = Neo.create(Container, {
            appName,
            id: 'parent-bubble-false',
            domListeners: [{
                click: () => { parentFired = true; }
            }],
            items: [{
                module: Component,
                id: 'child-bubble-false',
                domListeners: [{
                    click : () => { childFired = true; },
                    bubble: false // Listener config to stop propagation
                }]
            }]
        });
        await parent.initVnode();

        const event = {
            eventName: 'click',
            data: {
                path: [
                    { id: 'child-bubble-false', cls: ['neo-component'] },
                    { id: 'parent-bubble-false', cls: ['neo-container'] },
                    { id: 'body', cls: [] }
                ]
            }
        };

        DomEvent.fire(event);

        expect(childFired).toBe(true);
        expect(parentFired).toBe(false); // Should NOT fire

        parent.destroy();
    });

    test('should support event delegation', async () => {
        let delegatedFired = false,
            targetId       = null;

        const container = Neo.create(Container, {
            appName,
            id: 'delegate-container',
            domListeners: [{
                click   : (data) => {
                    delegatedFired = true;
                    targetId       = data.currentTarget;
                },
                delegate: '.target-cls'
            }],
            items: [{
                module: Component,
                id: 'delegate-target',
                cls: ['target-cls']
            }]
        });
        await container.initVnode();

        const event = {
            eventName: 'click',
            data: {
                path: [
                    { id: 'delegate-target', cls: ['target-cls'] },
                    { id: 'delegate-container', cls: ['neo-container'] },
                    { id: 'body', cls: [] }
                ]
            }
        };

        DomEvent.fire(event);

        expect(delegatedFired).toBe(true);
        expect(targetId).toBe('delegate-target');

        container.destroy();
    });
});
