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

    test('configured navigation links omit aria-pressed initially and when pressed changes', async () => {
        const urlButton = Neo.create(Button, {
            appName,
            text   : 'Details',
            pressed: true,
            url    : '#details'
        });

        try {
            const {vnode} = await urlButton.initVnode();
            expect(vnode.nodeName).toBe('a');
            expect(vnode.attributes?.href).toBe('#details');
            expect(vnode.attributes?.['aria-pressed']).toBeUndefined();
            expect(urlButton.cls.includes('pressed')).toBe(true);

            urlButton.mounted = true;
            await urlButton.set({pressed: false});
            expect(urlButton.vdom.tag).toBe('a');
            expect(urlButton.vdom['aria-pressed']).toBeUndefined();
            expect(urlButton.cls.includes('pressed')).toBe(false);

            await urlButton.set({pressed: true});
            expect(urlButton.vdom.tag).toBe('a');
            expect(urlButton.vdom['aria-pressed']).toBeUndefined();
            expect(urlButton.cls.includes('pressed')).toBe(true)
        } finally {
            urlButton.destroy()
        }

        const routeLink = Neo.create(Button, {
            appName,
            text   : 'Overview',
            pressed: false,
            route  : 'overview'
        });

        try {
            const {vnode} = await routeLink.initVnode();
            expect(vnode.nodeName).toBe('a');
            expect(vnode.attributes?.href).toBe('#overview');
            expect(vnode.attributes?.['aria-pressed']).toBeUndefined()
        } finally {
            routeLink.destroy()
        }

        const editRouteButton = Neo.create(Button, {
            appName,
            text     : 'Edit Route',
            pressed  : true,
            route    : 'overview',
            editRoute: true
        });

        try {
            const {vnode} = await editRouteButton.initVnode();
            expect(vnode.nodeName).toBe('button');
            expect(vnode.attributes?.['aria-pressed']).toBe('true')
        } finally {
            editRouteButton.destroy()
        }
    });

    test('button to link and back restores aria-pressed matching pressed state while plain buttons keep it absent', async () => {
        const button = Neo.create(Button, {
            appName,
            text   : 'Details',
            pressed: true
        });

        try {
            const {vnode} = await button.initVnode();
            expect(vnode.nodeName).toBe('button');
            expect(vnode.attributes?.['aria-pressed']).toBe('true');

            button.mounted = true;

            await button.set({url: '#details'});
            expect(button.vdom.tag).toBe('a');
            expect(button.vdom.href).toBe('#details');
            expect(button.vdom['aria-pressed']).toBeUndefined();
            expect(button.cls.includes('pressed')).toBe(true);

            await button.set({url: null});
            expect(button.vdom.tag).toBe('button');
            expect(button.vdom.href).toBeUndefined();
            expect(button.vdom['aria-pressed']).toBe('true');
            expect(button.cls.includes('pressed')).toBe(true);

            await button.set({pressed: false, url: '#other'});
            expect(button.vdom.tag).toBe('a');
            expect(button.vdom['aria-pressed']).toBeUndefined();

            await button.set({url: null});
            expect(button.vdom.tag).toBe('button');
            expect(button.vdom['aria-pressed']).toBe('false');

            await button.set({route: 'panel'});
            expect(button.vdom.tag).toBe('a');
            expect(button.vdom['aria-pressed']).toBeUndefined();

            await button.set({route: null});
            expect(button.vdom.tag).toBe('button');
            expect(button.vdom['aria-pressed']).toBe('false')
        } finally {
            button.destroy()
        }

        const plain = Neo.create(Button, {appName, text: 'Plain'});

        try {
            await plain.initVnode();
            plain.mounted = true;
            await plain.set({url: '#plain'});
            expect(plain.vdom.tag).toBe('a');
            expect(plain.vdom['aria-pressed']).toBeUndefined();

            await plain.set({url: null});
            expect(plain.vdom.tag).toBe('button');
            expect(plain.vdom['aria-pressed']).toBeUndefined()
        } finally {
            plain.destroy()
        }

        const tabs = Neo.create(TabContainer, {
            appName,
            items: [{header: {text: 'One'}, module: Component}]
        });

        try {
            const [tabButton] = tabs.getTabButtons();
            tabButton.route = '/one';
            expect(tabButton.vdom.tag).toBe('a');
            expect(tabButton.vdom['aria-pressed']).toBeUndefined();

            tabButton.route = null;
            expect(tabButton.vdom.tag).toBe('button');
            expect(tabButton.vdom['aria-pressed']).toBeUndefined();
            expect(tabButton.vdom['aria-selected']).toBe(true)
        } finally {
            tabs.destroy()
        }
    });
});
