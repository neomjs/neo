import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalExamplesTabControllerTest'
    }
});

import {test, expect}         from '@playwright/test';
import fs                     from 'node:fs';
import path                   from 'node:path';
import {fileURLToPath}        from 'node:url';
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import ExamplesTabContainer   from '../../../../../../../apps/portal/view/examples/TabContainer.mjs';
import TabContainerController from '../../../../../../../apps/portal/view/examples/TabContainerController.mjs';

const
    directory = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot  = path.resolve(directory, '../../../../../../../'),
    dataRoot  = path.join(repoRoot, 'apps/portal/resources/data');

/**
 * The examples tab routes resolve `activeIndex` through the controller's `tabItems` array.
 * Keep that array mirrored to `TabContainer.items`, which is now authored in the left-docked
 * top-to-bottom display order.
 */
test.describe('Portal.view.examples.TabContainerController — route → activeIndex', () => {
    function createController() {
        const component = {
            activeIndex  : null,
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
    });

    test('release-gates DockDemo while retaining the visible DevIndex flagship card', () => {
        const registries = [{
            file       : 'examples_devmode.json',
            devIndexUrl: 'apps/devindex/index.html',
            dockDemoUrl: 'apps/agentos/childapps/dockdemo/index.html'
        }, {
            file       : 'examples_dist_dev.json',
            devIndexUrl: 'dist/development/apps/devindex/index.html',
            dockDemoUrl: 'dist/development/apps/agentos/childapps/dockdemo/index.html'
        }, {
            file       : 'examples_dist_esm.json',
            devIndexUrl: 'dist/esm/apps/devindex/index.html',
            dockDemoUrl: 'dist/esm/apps/agentos/childapps/dockdemo/index.html'
        }, {
            file       : 'examples_dist_prod.json',
            devIndexUrl: 'dist/production/apps/devindex/index.html',
            dockDemoUrl: 'dist/production/apps/agentos/childapps/dockdemo/index.html'
        }];

        registries.forEach(({file, devIndexUrl, dockDemoUrl}) => {
            const
                records   = JSON.parse(fs.readFileSync(path.join(dataRoot, file), 'utf8')),
                dockDemo  = records.find(record => record.name === 'Dock Layouts'),
                devIndex  = records.find(record => record.name === 'GitHub Meritocracy Index'),
                firstSeen = records.find(record => !record.hidden);

            expect(records[0], `${file}: DockDemo stays top-ranked for the v13.2 reveal`).toBe(dockDemo);
            expect(dockDemo).toMatchObject({
                hidden       : true,
                id           : 28,
                sharedWorkers: true,
                sourceUrl    : 'apps/agentos/childapps/dockdemo',
                url          : dockDemoUrl
            });
            expect(firstSeen, `${file}: DevIndex remains the first live flagship`).toBe(devIndex);
            expect(devIndex).toMatchObject({
                sourceUrl: 'https://github.com/neomjs/devindex',
                url      : devIndexUrl
            });
            expect(devIndex.hidden ?? false).toBe(false)
        })
    })
});
