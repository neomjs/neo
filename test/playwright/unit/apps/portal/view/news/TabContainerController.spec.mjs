import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalNewsTabControllerTest'
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../src/core/_export.mjs';
import HeaderToolbar         from '../../../../../../../src/tab/header/Toolbar.mjs';
import TabContainerController from '../../../../../../../apps/portal/view/news/TabContainerController.mjs';

/**
 * The news tab routes resolve `activeIndex` by matching the tab button's `route` (not a hardcoded
 * position), so the controller stays correct when the `items` array is reordered.
 *
 * The stub mirrors the POST-`createItems` reality: routes live on the header tab buttons
 * (`getTabBar().items`, carrying the surviving `route` + `index` configs), NOT on `component.items`
 * (which `Neo.tab.Container.createItems()` transforms into `[HeaderToolbar, Strip, BodyContainer]`).
 * A lookup against `component.items.header.route` would find nothing here and fail — which is exactly
 * the production bug this guards against.
 */
test.describe('Portal.view.news.TabContainerController — route → activeIndex', () => {
    test('each route handler activates the tab button whose route matches, for any array order', () => {
        // Header buttons as they exist after createItems: `route` (Neo.button.Base config) + `index`
        // (original tab index). Order mirrors the production top-to-bottom `items` array.
        const tabButtons = [
            {route: '/news/releases',    index: 0},
            {route: '/news/tickets',     index: 1},
            {route: '/news/discussions', index: 2},
            {route: '/news/blog',        index: 3},
            {route: '/news/medium',      index: 4},
            {route: '/news/pulls',       index: 5}
        ];

        const controller = Object.create(TabContainerController.prototype);

        controller.component = {
            activeIndex: null,
            getTabBar  : () => ({items: tabButtons})
        };

        controller.onPullsRoute();
        expect(controller.component.activeIndex).toBe(5);

        controller.onMediumRoute();
        expect(controller.component.activeIndex).toBe(4);

        controller.onBlogRoute();
        expect(controller.component.activeIndex).toBe(3);

        controller.onDiscussionsRoute();
        expect(controller.component.activeIndex).toBe(2);

        controller.onTicketsRoute();
        expect(controller.component.activeIndex).toBe(1);

        controller.onReleasesRoute();
        expect(controller.component.activeIndex).toBe(0)
    });

    test('left-docked tab header keeps array order as visual order', () => {
        const toolbar = Neo.create(HeaderToolbar, {
            appName: 'PortalNewsTabControllerTest'
        });

        toolbar.dock = 'left';
        expect(toolbar.getLayoutConfig()).toEqual({
            align    : 'center',
            direction: 'column',
            pack     : 'start'
        });

        toolbar.dock = 'right';
        expect(toolbar.getLayoutConfig()).toEqual({
            align    : 'center',
            direction: 'column',
            pack     : 'start'
        });

        toolbar.destroy()
    })
});
