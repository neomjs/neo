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
import Store              from '../../../../src/data/Store.mjs';
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

        expect(button.pressed).toBeNull();
        expect(button.getVdomRoot()['aria-pressed']).toBeUndefined();
        expect(vnode.attributes?.['aria-pressed']).toBeUndefined();
        expect(vnode.className.includes('pressed')).toBe(false);

        let updateData = await button.set({pressed: true});
        expect(updateData.deltas.length).toBe(1);
        let delta = updateData.deltas[0];
        expect(delta.id).toBe(button.id);
        expect(delta.cls.add).toEqual(['pressed']);
        expect(delta.attributes).toEqual({'aria-pressed': 'true'});
        expect(button.getVdomRoot()['aria-pressed']).toBe('true');
        expect(updateData.vnode.attributes['aria-pressed']).toBe('true');
        expect(updateData.vnode.className.includes('pressed')).toBe(true);

        updateData = await button.set({pressed: false});
        expect(updateData.deltas.length).toBe(1);
        delta = updateData.deltas[0];
        expect(delta.id).toBe(button.id);
        expect(delta.cls.remove).toEqual(['pressed']);
        expect(delta.attributes).toEqual({'aria-pressed': 'false'});
        expect(button.getVdomRoot()['aria-pressed']).toBe('false');
        expect(updateData.vnode.attributes['aria-pressed']).toBe('false');
        expect(updateData.vnode.className.includes('pressed')).toBe(false);

        updateData = await button.set({pressed: null});
        expect(button.getVdomRoot()['aria-pressed']).toBeUndefined();
        expect(updateData.vnode.attributes?.['aria-pressed']).toBeUndefined();
        expect(updateData.vnode.className.includes('pressed')).toBe(false);

        button.destroy();
    });

    test('should render aria-pressed semantics only for toggle buttons', async () => {
        const plainButton         = Neo.create(Button, {appName});
        const {vnode: plainVnode} = await plainButton.initVnode();

        expect(plainButton.getVdomRoot()['aria-pressed']).toBeUndefined();
        expect(plainVnode.attributes?.['aria-pressed']).toBeUndefined();
        expect(plainVnode.className.includes('pressed')).toBe(false);

        const unpressedButton         = Neo.create(Button, {appName, pressed: false});
        const {vnode: unpressedVnode} = await unpressedButton.initVnode();

        expect(unpressedButton.getVdomRoot()['aria-pressed']).toBe('false');
        expect(unpressedVnode.attributes['aria-pressed']).toBe('false');
        expect(unpressedVnode.className.includes('pressed')).toBe(false);

        const pressedButton         = Neo.create(Button, {appName, pressed: true});
        const {vnode: pressedVnode} = await pressedButton.initVnode();

        expect(pressedButton.getVdomRoot()['aria-pressed']).toBe('true');
        expect(pressedVnode.attributes['aria-pressed']).toBe('true');
        expect(pressedVnode.className.includes('pressed')).toBe(true);

        plainButton.destroy();
        unpressedButton.destroy();
        pressedButton.destroy();
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
            disabled: true,
            route   : 'details',
            text    : 'Internal link'
        });
        const routeVnode = (await routeButton.initVnode()).vnode;

        expect(routeVnode.nodeName).toBe('a');
        expect(routeVnode.attributes.href).toBe('#details');
        expect(routeVnode.attributes.disabled).toBeUndefined();
        expect(routeVnode.className).toContain('neo-disabled');

        routeButton.destroy();
        urlButton.destroy();
    });

    test('a url that arrives after construction opens per urlTarget, and a route link stays in this window', async () => {
        const lateButton = Neo.create(Button, {appName, text: 'Open'});
        let   {vnode}    = await lateButton.initVnode();

        lateButton.mounted = true;

        expect(vnode.nodeName).toBe('button');
        expect(vnode.attributes.target).toBeUndefined();

        ({vnode} = await lateButton.set({url: 'https://example.com/late'}));

        expect(vnode.nodeName).toBe('a');
        expect(vnode.attributes.target, 'the urlTarget default reaches a url set after construction').toBe('_blank');

        ({vnode} = await lateButton.set({urlTarget: '_self'}));

        expect(vnode.attributes.target).toBe('_self');

        ({vnode} = await lateButton.set({url: null}));

        expect(vnode.nodeName).toBe('button');
        expect(vnode.attributes.target).toBeUndefined();

        const routeButton = Neo.create(Button, {appName, route: 'details', text: 'Internal link'});
        const routeVnode  = (await routeButton.initVnode()).vnode;

        expect(routeVnode.attributes.href).toBe('#details');
        expect(routeVnode.attributes.target, 'a route link carries no target').toBeUndefined();

        routeButton.destroy();
        lateButton.destroy();
    });

    test('editRoute defaults to false (anchor tag) and editRoute: true keeps button tag and invokes Neo.Main.editRoute on click', async () => {
        const editedRoutes   = [],
              originalEditFn = Neo.Main.editRoute;

        Neo.Main.editRoute = route => editedRoutes.push(route);

        try {
            const defaultRouteButton = Neo.create(Button, {
                appName,
                route          : '/home',
                text           : 'Home',
                useRippleEffect: false
            });
            const defaultVnode = (await defaultRouteButton.initVnode()).vnode;

            expect(defaultRouteButton.editRoute).toBe(false);
            expect(defaultVnode.nodeName).toBe('a');
            expect(defaultVnode.attributes.href).toBe('#/home');

            defaultRouteButton.onClick({});
            expect(editedRoutes).toEqual([]);

            const paramRouteButton = Neo.create(Button, {
                appName,
                editRoute      : true,
                route          : 'mainview=table',
                text           : 'Table',
                useRippleEffect: false
            });
            const paramVnode = (await paramRouteButton.initVnode()).vnode;

            expect(paramRouteButton.editRoute).toBe(true);
            expect(paramVnode.nodeName).toBe('button');
            expect(paramVnode.attributes.href).toBeUndefined();

            paramRouteButton.onClick({});
            expect(editedRoutes).toEqual(['mainview=table']);

            defaultRouteButton.destroy();
            paramRouteButton.destroy();
        } finally {
            Neo.Main.editRoute = originalEditFn
        }
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

    test('SplitButton delegates per-UI borders to child .neo-button nodes (#4044)', async () => {
        const splitButton = Neo.create(SplitButton, {
            appName,
            text: 'Split UI',
            ui  : 'secondary'
        });

        let {vnode} = await splitButton.initVnode();
        splitButton.mounted = true;

        expect(vnode.className).toEqual(['neo-split-button']);
        expect(vnode.childNodes).toHaveLength(2);
        expect(vnode.childNodes[0].className).toContain('neo-button');
        expect(vnode.childNodes[0].className).toContain('neo-button-secondary');
        expect(vnode.childNodes[1].className).toContain('neo-button');
        expect(vnode.childNodes[1].className).toContain('neo-trigger-button');
        expect(vnode.childNodes[1].className).toContain('neo-button-secondary');

        ({vnode} = await splitButton.set({ui: 'tertiary'}));
        expect(vnode.childNodes[0].className).toContain('neo-button-tertiary');

        // The trigger is a child component the split references, so it renders its own ui change
        await splitButton.triggerButton.promiseUpdate();
        expect(splitButton.triggerButton.vnode.className).toContain('neo-button-tertiary');

        splitButton.destroy();
    });

    test('a size config sets its class, a change swaps it, and null leaves the size to the context', async () => {
        const button = Neo.create(Button, {appName, size: 'large', text: 'Get started', ui: 'secondary'});

        expect(button.cls).toContain('neo-size-large');
        expect(button.cls, 'the size is not a ui').toContain('neo-button-secondary');

        button.size = 'small';
        expect(button.cls).toContain('neo-size-small');
        expect(button.cls).not.toContain('neo-size-large');

        button.size = null;
        expect(button.cls.filter(cls => cls.startsWith('neo-size-'))).toEqual([]);

        button.destroy()
    });

    test('a size and a ui stay independent, even a ui named like a size', async () => {
        const button  = Neo.create(Button, {appName, size: 'large', text: 'Save', ui: 'size-large'}),
              plain   = Neo.create(Button, {appName, size: 'large', text: 'Save'}),
              sizeCls = plain.cls.filter(cls => cls.includes('size'));

        button.ui = null;
        expect(button.cls, 'clearing the ui keeps the size').toEqual(expect.arrayContaining(sizeCls));

        button.ui   = 'size-large';
        button.size = 'small';
        expect(button.cls, 'changing the size keeps the ui').toContain('neo-button-size-large');

        button.destroy();
        plain.destroy()
    });

    test('a menu change while its list loads builds one list from the latest menu, and a click meanwhile shows it (#21535)', async () => {
        const button     = Neo.create(Button, {appName, menu: [{text: 'Blog'}, {text: 'Medium'}]}),
              created    = [],
              origCreate = Neo.create,
              {align}    = Neo.main.DomAccess;

        // An opened floating list aligns itself in the main thread, which this harness does not run
        Neo.main.DomAccess.align = async () => {};
        Neo.create = (...args) => {
            const instance = origCreate(...args);
            args[0]?.parentComponent === button && created.push(instance);
            return instance
        };

        try {
            // The click lands first, then the menu changes before the list module has loaded
            const toggled = button.toggleMenu();

            button.menu = [{text: 'Medium'}];
            await toggled;

            expect(created, 'a superseded menu builds no list of its own').toHaveLength(1);
            expect(button.menuList.hidden, 'the click opens the list the button holds').toBe(false);
            expect(button.menuList.store.items.map(record => record.text)).toEqual(['Medium'])
        } finally {
            Neo.create               = origCreate;
            Neo.main.DomAccess.align = align;
            button.destroy()
        }
    });

    test('a later menu replaces the list it built before instead of orphaning it (#21535)', async () => {
        const button = Neo.create(Button, {appName, menu: [{text: 'Blog'}]});

        await button.menuListReady;

        const first = button.menuList;

        button.menu = [{text: 'Medium'}];
        await button.menuListReady;

        expect(first.isDestroyed, 'the earlier list goes with its menu').toBe(true);
        expect(button.menuList.store.items.map(record => record.text)).toEqual(['Medium']);

        button.destroy()
    });

    test('a menu cleared while its list loads builds nothing, and a click waiting on it settles without opening one (#21535)', async () => {
        const button     = Neo.create(Button, {appName, menu: [{text: 'Blog'}]}),
              created    = [],
              origCreate = Neo.create;

        Neo.create = (...args) => {
            const instance = origCreate(...args);
            args[0]?.parentComponent === button && created.push(instance);
            return instance
        };

        try {
            const toggled = button.toggleMenu();

            button.menu = null;
            await toggled;
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(created, 'the build in flight lands nothing').toHaveLength(0);
            expect(button.menuList).toBe(null)
        } finally {
            Neo.create = origCreate;
            button.destroy()
        }
    });

    test('clearing the menu takes an open list with it (#21535)', async () => {
        const button  = Neo.create(Button, {appName, menu: [{text: 'Blog'}]}),
              {align} = Neo.main.DomAccess;

        Neo.main.DomAccess.align = async () => {};

        try {
            await button.toggleMenu();

            const open = button.menuList;

            expect(open.hidden).toBe(false);

            button.menu = null;

            expect(open.isDestroyed).toBe(true);
            expect(button.menuList).toBe(null)
        } finally {
            Neo.main.DomAccess.align = align;
            button.destroy()
        }
    });

    test('a replacement menu over the same store retires the first list and keeps the store (#21535)', async () => {
        const store  = Neo.create(Store, {data: [{id: 1, text: 'Blog'}, {id: 2, text: 'Medium'}], model: {fields: [{name: 'id'}, {name: 'text'}]}}),
              button = Neo.create(Button, {appName, menu: {store}});

        await button.menuListReady;

        const first = button.menuList;

        button.menu = {cls: ['neo-test-replacement-menu'], store};
        await button.menuListReady;

        expect(first.isDestroyed, 'the first list is retired').toBe(true);
        expect(store.isDestroyed, 'a store the replacement shares survives the retired list').toBeFalsy();
        expect(button.menuList.store).toBe(store);
        expect(button.menuList.store.items.map(record => record.text)).toEqual(['Blog', 'Medium']);

        button.destroy()
    });

    test('an unknown size is refused, and the button keeps the size it has', async () => {
        const button = Neo.create(Button, {appName, size: 'medium', text: 'Save'}),
              error  = console.error;

        console.error = () => {};
        button.size   = 'huge';
        console.error = error;

        expect(button.size).toBe('medium');
        expect(button.cls).toContain('neo-size-medium');

        button.destroy()
    });

    test('ariaLabel_ projects aria-label onto Button and SplitButton native roots, survives tag transitions, and omits when cleared', async () => {
        const button = Neo.create(Button, {
            appName,
            iconCls: 'fa-solid fa-moon'
        });

        let {vnode} = await button.initVnode();
        button.mounted = true;

        expect(button.ariaLabel).toBeNull();
        expect(button.getVdomRoot()['aria-label']).toBeUndefined();
        expect(vnode.attributes?.['aria-label']).toBeUndefined();

        ({vnode} = await button.set({ariaLabel: 'Switch Theme'}));
        expect(button.ariaLabel).toBe('Switch Theme');
        expect(button.getVdomRoot()['aria-label']).toBe('Switch Theme');
        expect(vnode.attributes['aria-label']).toBe('Switch Theme');
        expect(button.toJSON().ariaLabel).toBe('Switch Theme');

        ({vnode} = await button.set({url: 'https://github.com/neomjs/neo'}));
        expect(vnode.nodeName).toBe('a');
        expect(vnode.attributes['aria-label']).toBe('Switch Theme');

        ({vnode} = await button.set({ariaLabel: ''}));
        expect(button.getVdomRoot()['aria-label']).toBeUndefined();
        expect(vnode.attributes?.['aria-label']).toBeUndefined();

        ({vnode} = await button.set({ariaLabel: 'GitHub'}));
        expect(vnode.attributes['aria-label']).toBe('GitHub');

        ({vnode} = await button.set({ariaLabel: null, url: null}));
        expect(vnode.nodeName).toBe('button');
        expect(button.getVdomRoot()['aria-label']).toBeUndefined();
        expect(vnode.attributes?.['aria-label']).toBeUndefined();

        const split = Neo.create(SplitButton, {
            appName,
            ariaLabel: 'Primary action',
            iconCls  : 'fa fa-play'
        });
        const splitVnode = (await split.initVnode()).vnode;

        expect(splitVnode.attributes?.['aria-label']).toBeUndefined();
        expect(splitVnode.childNodes[0].attributes['aria-label']).toBe('Primary action');
        expect(splitVnode.childNodes[1].attributes?.['aria-label']).toBeUndefined();

        split.destroy();
        button.destroy()
    });

    test('route buttons render clean path hrefs in pathname routerMode and hash hrefs in hash routerMode', async () => {
        const previous = {
            routerBasePath: Neo.config.routerBasePath,
            routerMode    : Neo.config.routerMode
        };

        try {
            Object.assign(Neo.config, {routerBasePath: '', routerMode: 'pathname'});

            const logoButton  = Neo.create(Button, {appName, route: '/', text: 'Neo.mjs'}),
                  learnButton = Neo.create(Button, {appName, route: '#/learn/Intro', text: 'Learn'}),
                  logoVnode   = (await logoButton.initVnode()).vnode,
                  learnVnode  = (await learnButton.initVnode()).vnode;

            expect(logoVnode.nodeName).toBe('a');
            expect(logoVnode.attributes.href).toBe('/');
            expect(logoVnode.attributes.target).toBeUndefined();
            expect(learnVnode.attributes.href).toBe('/learn/Intro');

            logoButton.mounted = true;
            Object.assign(Neo.config, {routerBasePath: '/docs', routerMode: 'pathname'});
            logoButton.updateTag();
            await logoButton.promiseUpdate();
            expect(logoButton.vnode.attributes.href).toBe('/docs/');

            logoButton.destroy();
            learnButton.destroy()
        } finally {
            Object.assign(Neo.config, previous)
        }
    });
});
