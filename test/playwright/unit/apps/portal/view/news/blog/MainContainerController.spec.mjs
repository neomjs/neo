import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalBlogControllerTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import BlogController from '../../../../../../../../apps/portal/view/news/blog/MainContainerController.mjs';

/**
 * @summary Verifies that `Portal.view.news.blog.MainContainerController` emits `/news/blog/<slug>` routes
 * and resolves both `/news/blog/<slug>` (with or without `#fragment`) and legacy `/news/blog/blog/<slug>`
 * routes back to the store's `blog/<slug>` leaf records.
 */
function createHarness() {
    const
        records        = new Map([['blog/where-an-agent-institution-sits', {id: 'blog/where-an-agent-institution-sits', isLeaf: true}]]),
        routes         = [],
        expandedScroll = [],
        expandedParent = [],
        stateProvider  = {
            data    : {},
            getStore: () => ({
                get     : id => records.get(id) || null,
                getAt   : () => records.get('blog/where-an-agent-institution-sits'),
                getCount: () => records.size
            })
        },
        tree = {
            routePrefix          : null,
            expandAndScrollToItem: async id => expandedScroll.push(id),
            expandParents        : id => expandedParent.push(id)
        },
        controller = Object.create(BlogController.prototype);

    controller.component        = {windowId: 'portal-window-1'};
    controller.getStateProvider = () => stateProvider;
    controller.getReference     = () => tree;

    Neo.Main = {
        setRoute: payload => routes.push(payload)
    };

    return {controller, expandedParent, expandedScroll, records, routes, stateProvider, tree}
}

test.describe('Portal.view.news.blog.MainContainerController', () => {
    test('navigateTo strips the leading blog/ prefix from record ids so the route is /news/blog/<slug>', () => {
        const {controller, routes} = createHarness();

        controller.navigateTo('blog/where-an-agent-institution-sits');
        controller.navigateTo('where-an-agent-institution-sits');

        expect(routes).toEqual([
            {value: '/news/blog/where-an-agent-institution-sits', windowId: 'portal-window-1'},
            {value: '/news/blog/where-an-agent-institution-sits', windowId: 'portal-window-1'}
        ])
    });

    test('onRouteItem resolves /news/blog/<slug>, strips #fragments, and sets tree.routePrefix to /news', async () => {
        const {controller, expandedScroll, records, stateProvider, tree} = createHarness();

        await controller.onRouteItem({itemId: 'where-an-agent-institution-sits#section-1'}, {}, {});

        expect(tree.routePrefix).toBe('/news');
        expect(`${tree.routePrefix}/${records.get('blog/where-an-agent-institution-sits').id}`).toBe('/news/blog/where-an-agent-institution-sits');
        expect(stateProvider.data.currentPageRecord).toEqual({id: 'blog/where-an-agent-institution-sits', isLeaf: true});
        expect(expandedScroll).toEqual(['blog/where-an-agent-institution-sits'])
    });

    test('onRouteItem keeps resolving legacy /news/blog/blog/<slug> deep links', async () => {
        const {controller, expandedParent, stateProvider} = createHarness();

        await controller.onRouteItem(
            {itemId: 'blog/where-an-agent-institution-sits'},
            {},
            {hashString: '/news/blog/other-post'}
        );

        expect(stateProvider.data.currentPageRecord).toEqual({id: 'blog/where-an-agent-institution-sits', isLeaf: true});
        expect(expandedParent).toEqual(['blog/where-an-agent-institution-sits'])
    })
});
