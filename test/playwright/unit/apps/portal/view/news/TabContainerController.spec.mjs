import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalNewsTabControllerTest'
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../src/core/_export.mjs';
import TabContainerController from '../../../../../../../apps/portal/view/news/TabContainerController.mjs';

/**
 * The news tab routes resolve `activeIndex` by matching the tab button's `route` (not a hardcoded
 * position), so the controller stays correct when the `items` array is reordered for the left-docked
 * `column-reverse` header.
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
        // (original tab index). Order mirrors the production reversed `items` array.
        const tabButtons = [
            {route: '/news/pulls',       index: 0},
            {route: '/news/medium',      index: 1},
            {route: '/news/blog',        index: 2},
            {route: '/news/discussions', index: 3},
            {route: '/news/tickets',     index: 4},
            {route: '/news/releases',    index: 5}
        ];

        const controller = Object.create(TabContainerController.prototype);

        controller.component = {
            activeIndex: null,
            getTabBar  : () => ({items: tabButtons})
        };

        controller.onPullsRoute();
        expect(controller.component.activeIndex).toBe(0);

        controller.onMediumRoute();
        expect(controller.component.activeIndex).toBe(1);

        controller.onBlogRoute();
        expect(controller.component.activeIndex).toBe(2);

        controller.onDiscussionsRoute();
        expect(controller.component.activeIndex).toBe(3);

        controller.onTicketsRoute();
        expect(controller.component.activeIndex).toBe(4);

        controller.onReleasesRoute();
        expect(controller.component.activeIndex).toBe(5)
    })
});
