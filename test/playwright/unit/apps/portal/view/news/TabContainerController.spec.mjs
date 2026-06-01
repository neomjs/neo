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
 * The news tab routes resolve `activeIndex` by matching `item.header.route` (not a hardcoded position),
 * so the controller stays correct when the `items` array is reordered for the left-docked
 * `column-reverse` header. Pins each route handler against the production (reversed) array order — this
 * is exactly the regression that hardcoded indexes silently break on reorder.
 */
test.describe('Portal.view.news.TabContainerController — route → activeIndex', () => {
    test('each route handler activates the item whose header.route matches, for any array order', () => {
        // Production order (reverse of the visual top-to-bottom display, per the column-reverse header).
        const items = [
            {header: {route: '/news/pulls'}},
            {header: {route: '/news/medium'}},
            {header: {route: '/news/blog'}},
            {header: {route: '/news/discussions'}},
            {header: {route: '/news/tickets'}},
            {header: {route: '/news/releases'}}
        ];

        const controller = Object.create(TabContainerController.prototype);
        controller.component = {items, activeIndex: null};

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
