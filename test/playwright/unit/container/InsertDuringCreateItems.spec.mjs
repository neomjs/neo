import { setup } from '../../setup.mjs';

const appName = 'ContainerInsertDuringCreateItemsTest';

setup({
    appConfig: {
        name: appName
    }
});

import { test, expect } from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Instance         from '../../../../src/manager/Instance.mjs';
import Button           from '../../../../src/button/Base.mjs';
import Component        from '../../../../src/component/Base.mjs';
import Container        from '../../../../src/container/Base.mjs';
import PopoverPlugin    from '../../../../src/plugin/Popover.mjs';

test.describe('Neo.container.Base (insert while creating items)', () => {

    test('keeps an item whose construction adds a sibling to the container', () => {
        // The Popover plugin adds its popover to the button's parent while createItems() builds the button
        const container = Neo.create(Container, {
            appName,
            items: [{
                module: Component,
                height: 10
            }, {
                module : Button,
                text   : 'Click Me',
                plugins: [{
                    module: PopoverPlugin,
                    items : [{html: 'Popover body'}]
                }]
            }]
        });

        const {items} = container,
              popover = items[2];

        expect(items.length).toBe(3);
        expect(items[1]).toBeInstanceOf(Button);
        expect(popover).toBeInstanceOf(Container);
        expect(popover.vdom.anchor).toBe(items[1].id);

        // the vnodes follow the items: the button before the popover it created
        expect(container.getVdomItemsRoot().cn.map(vdom => vdom.componentId)).toEqual(items.map(item => item.id));

        // isVnodeInitializing walks the items, and threw on the button's leftover config
        expect(() => {
            container.isVnodeInitializing = true;
            container.isVnodeInitializing = false
        }).not.toThrow();

        container.destroy()
    });

    test('keeps every item when several of them add a sibling while being created', () => {
        const popoverButton = text => ({
            module : Button,
            text,
            plugins: [{
                module: PopoverPlugin,
                items : [{html: text + ' popover'}]
            }]
        });

        const container = Neo.create(Container, {
            appName,
            items: [popoverButton('First'), popoverButton('Second'), {module: Component, height: 10}]
        });

        const {items} = container;

        // the buttons and the component, then the popovers in the order their buttons were created
        expect(items.length).toBe(5);
        expect(items[0]).toBeInstanceOf(Button);
        expect(items[1]).toBeInstanceOf(Button);
        expect(items[2]).toBeInstanceOf(Component);
        expect(items[3].vdom.anchor).toBe(items[0].id);
        expect(items[4].vdom.anchor).toBe(items[1].id);

        expect(container.getVdomItemsRoot().cn.map(vdom => vdom.componentId)).toEqual(items.map(item => item.id));

        container.destroy()
    });
});
