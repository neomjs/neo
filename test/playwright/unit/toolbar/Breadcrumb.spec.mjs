import {setup} from '../../setup.mjs';

const appName = 'ToolbarBreadcrumbTest';

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
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import Breadcrumb         from '../../../../src/toolbar/Breadcrumb.mjs';

const sampleRoutes = [
    {id: 1, name: 'Home',          parentId: null, route: '/home/'},
    {id: 2, name: 'Accessibility', parentId: 1,    route: '/home/accessibility/'},
    {id: 3, name: 'News',          parentId: 1,    route: '/home/news/'},
    {id: 4, name: 'Breadcrumbs',   parentId: 2,    route: '/home/accessibility/breadcrumbs/'},
    {id: 9, name: 'SelfCycle',     parentId: 9,    route: '/cycle/'}
];

const readButtonText = vnode =>
    vnode.childNodes?.find(node => node.className?.includes('neo-button-text'))?.textContent;

test.describe('Neo.toolbar.Breadcrumb landmark, aria-current, and Depth-2 VDOM sync', () => {
    const owned = [];
    const own   = instance => {
        owned.push(instance);
        return instance
    };

    test.afterEach(() => {
        owned.splice(0).forEach(instance => instance?.destroy?.())
    });

    test('renders <nav aria-label="Breadcrumb"> and marks only the trailing active crumb with aria-current="page"', async () => {
        const breadcrumb = own(Neo.create(Breadcrumb, {
            appName,
            activeKey         : 2,
            store             : {data: sampleRoutes.map(item => ({...item}))},
            updateOnHashChange: false
        }));

        const {vnode} = await breadcrumb.initVnode();
        breadcrumb.mounted = true;

        expect(vnode.nodeName).toBe('nav');
        expect(vnode.attributes?.['aria-label']).toBe('Breadcrumb');
        expect(vnode.childNodes.length).toBe(2);

        expect(breadcrumb.items[0].ariaCurrent).toBeNull();
        expect(vnode.childNodes[0].nodeName).toBe('a');
        expect(vnode.childNodes[0].attributes?.['aria-current']).toBeUndefined();
        expect(readButtonText(vnode.childNodes[0])).toBe('Home');

        expect(breadcrumb.items[1].ariaCurrent).toBe('page');
        expect(vnode.childNodes[1].nodeName).toBe('a');
        expect(vnode.childNodes[1].attributes?.['aria-current']).toBe('page');
        expect(vnode.childNodes[1].className).toContain('neo-disabled');
        expect(readButtonText(vnode.childNodes[1])).toBe('Accessibility');

        breadcrumb.ariaLabel = 'Folder trail';
        await breadcrumb.promiseUpdate();
        expect(breadcrumb.vnode.attributes?.['aria-label']).toBe('Folder trail');

        breadcrumb.ariaLabel = null;
        await breadcrumb.promiseUpdate();
        expect(breadcrumb.vdom['aria-label']).toBeUndefined();
        expect(breadcrumb.vnode.attributes?.['aria-label']).toBeUndefined()
    });

    test('propagates silent reused-item mutations in one batch across deeper, shorter, and sibling activeKey transitions', async () => {
        const breadcrumb = own(Neo.create(Breadcrumb, {
            appName,
            activeKey         : 2,
            store             : {data: sampleRoutes.map(item => ({...item}))},
            updateOnHashChange: false
        }));

        await breadcrumb.initVnode();
        breadcrumb.mounted = true;

        const firstButton  = breadcrumb.items[0],
              secondButton = breadcrumb.items[1];

        // 1. Deeper path (2 -> 3 crumbs): second crumb loses aria-current="page", new third crumb gains it
        breadcrumb.activeKey = 4;
        let {deltas} = await breadcrumb.promiseUpdate();

        expect(deltas.length).toBeGreaterThan(0);
        expect(breadcrumb.items[0]).toBe(firstButton);
        expect(breadcrumb.items[1]).toBe(secondButton);
        expect(secondButton.vnode.attributes?.['aria-current']).toBeUndefined();
        expect(secondButton.vnode.className).not.toContain('neo-disabled');

        const thirdButton = breadcrumb.items[2];
        expect(thirdButton.vnode.attributes?.['aria-current']).toBe('page');
        expect(readButtonText(thirdButton.vnode)).toBe('Breadcrumbs');

        // 2. Shorter path (3 -> 2 crumbs): third crumb unmounts via removeDom and clears ariaCurrent; second regains aria-current="page"
        breadcrumb.activeKey = 2;
        ({deltas} = await breadcrumb.promiseUpdate());

        expect(deltas.some(delta => delta.action === 'removeNode' && delta.id === thirdButton.id)).toBe(true);
        expect(thirdButton.hidden).toBe(true);
        expect(thirdButton.ariaCurrent).toBeNull();
        expect(thirdButton.vnode).toBeNull();
        expect(thirdButton.mounted).toBe(false);
        expect(secondButton.vnode.attributes?.['aria-current']).toBe('page');
        expect(secondButton.vnode.className).toContain('neo-disabled');
        expect(readButtonText(secondButton.vnode)).toBe('Accessibility');

        // 3. Same-depth sibling path (2 -> 2 crumbs): reuses secondButton in place and updates rendered href + text in one batch
        breadcrumb.activeKey = 3;
        ({deltas} = await breadcrumb.promiseUpdate());

        expect(deltas.some(delta => delta.id === secondButton.id && delta.attributes?.href === '#/home/news/')).toBe(true);
        expect(breadcrumb.items[1]).toBe(secondButton);
        expect(secondButton.vnode.attributes?.href).toBe('#/home/news/');
        expect(secondButton.vnode.attributes?.['aria-current']).toBe('page');
        expect(readButtonText(secondButton.vnode)).toBe('News');

        // 4. Clearing activeKey hides all crumbs cleanly
        breadcrumb.activeKey = null;
        ({deltas} = await breadcrumb.promiseUpdate());

        expect(deltas).toEqual([{action: 'removeAll', parentId: breadcrumb.id}]);
        expect(firstButton.vnode).toBeNull();
        expect(secondButton.vnode).toBeNull();
        expect(secondButton.ariaCurrent).toBeNull()
    });

    test('handles pre-store activeKey, late store population (config and Store instance), unknown keys, and cyclic parentId safely', async () => {
        const routed       = [];
        const prevSetRoute = Neo.Main.setRoute;
        Neo.Main.setRoute = payload => routed.push(payload);

        try {
            const breadcrumb = own(Neo.create(Breadcrumb, {
                appName,
                activeKey         : 2,
                updateOnHashChange: false
            }));

            expect(breadcrumb.store).toBeNull();
            expect(breadcrumb.items.length).toBe(0);

            await breadcrumb.initVnode();
            breadcrumb.mounted = true;

            // Populating store config after activeKey renders the trail once Store's load microtask fires
            breadcrumb.store = {data: sampleRoutes.map(item => ({...item}))};
            await Promise.resolve();
            await breadcrumb.promiseUpdate();

            expect(breadcrumb.items.length).toBe(2);
            expect(breadcrumb.items[0].vnode.attributes?.['aria-current']).toBeUndefined();
            expect(breadcrumb.items[1].vnode.attributes?.['aria-current']).toBe('page');
            expect(routed).toEqual([{value: '/home/accessibility/'}]);

            // Adopting an already-constructed Store instance whose initial load microtask already settled
            const preloadedStore = own(Neo.create(Store, {
                ...breadcrumb.defaultStoreConfig,
                data: sampleRoutes.map(item => ({...item}))
            }));
            await Promise.resolve();

            const breadcrumbFromInstance = own(Neo.create(Breadcrumb, {
                appName,
                activeKey         : 3,
                updateOnHashChange: false
            }));
            await breadcrumbFromInstance.initVnode();
            breadcrumbFromInstance.mounted = true;

            routed.length = 0;
            breadcrumbFromInstance.store = preloadedStore;
            await breadcrumbFromInstance.promiseUpdate();

            expect(readButtonText(breadcrumbFromInstance.items[1].vnode)).toBe('News');
            expect(breadcrumbFromInstance.items[1].vnode.attributes?.['aria-current']).toBe('page');
            expect(routed).toEqual([{value: '/home/news/'}]);

            // Unknown activeKey does not throw, does not route, and hides prior crumbs
            routed.length = 0;
            breadcrumb.activeKey = 999;
            await breadcrumb.promiseUpdate();

            expect(breadcrumb.items[0].vnode).toBeNull();
            expect(breadcrumb.items[1].vnode).toBeNull();
            expect(routed).toEqual([]);

            // Cyclic parentId terminates cleanly without infinite loop
            breadcrumb.activeKey = 9;
            await breadcrumb.promiseUpdate();

            expect(readButtonText(breadcrumb.items[0].vnode)).toBe('SelfCycle');
            expect(breadcrumb.items[0].vnode.attributes?.['aria-current']).toBe('page');
            expect(breadcrumb.items[1].vnode).toBeNull()
        } finally {
            Neo.Main.setRoute = prevSetRoute
        }
    })
});
