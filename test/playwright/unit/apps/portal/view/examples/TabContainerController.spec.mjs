import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesTabControllerTest'
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import ExamplesTabContainer   from '../../../../../../../apps/portal/view/examples/TabContainer.mjs';
import TabContainerController from '../../../../../../../apps/portal/view/examples/TabContainerController.mjs';

/**
 * The examples tab routes resolve `activeIndex` through the controller's `tabItems` array.
 * Keep that array mirrored to `TabContainer.items`, which is now authored in the left-docked
 * top-to-bottom display order.
 */
test.describe('Portal.view.examples.TabContainerController — route → activeIndex', () => {
    function createController() {
        const component = {
            activeIndex   : null,
            isConstructed: true,
            on           : () => {}
        };

        const controller = Neo.create(TabContainerController, {component});

        controller.getReference = reference => ({
            store: {
                getCount: () => 1,
                load    : () => {
                    throw new Error(`Unexpected load for ${reference}`)
                }
            }
        });

        return controller
    }

    test('keeps tab item ids mirrored to the authored display order', () => {
        const
            controller = createController(),
            itemIds    = ExamplesTabContainer.config.items.map(item => item.header.route.replace('/examples/', ''));

        expect(itemIds).toEqual(['dist_prod', 'dist_esm', 'dist_dev', 'devmode']);
        expect(controller.tabItems).toEqual(itemIds);

        controller.destroy()
    });

    test('defaults to dist_prod at the top tab and resolves each route index', () => {
        const controller = createController();

        controller.onExamplesRoute();
        expect(controller.component.activeIndex).toBe(0);

        controller.onExamplesRoute({itemId: 'dist_esm'});
        expect(controller.component.activeIndex).toBe(1);

        controller.onExamplesRoute({itemId: 'dist_dev'});
        expect(controller.component.activeIndex).toBe(2);

        controller.onExamplesRoute({itemId: 'devmode'});
        expect(controller.component.activeIndex).toBe(3);

        controller.destroy()
    });

    test('updates route indexes when tabs are manually resorted', () => {
        const controller = createController();

        controller.onMoveTab({
            fromIndex: 0,
            toIndex  : 3
        });

        expect(controller.tabItems).toEqual(['dist_esm', 'dist_dev', 'devmode', 'dist_prod']);

        controller.onExamplesRoute({itemId: 'dist_prod'});
        expect(controller.component.activeIndex).toBe(3);

        controller.destroy()
    })
});
