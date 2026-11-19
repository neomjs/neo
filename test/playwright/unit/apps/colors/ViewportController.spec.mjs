import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ColorsViewportControllerTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import DragProxyContainer from '../../../../../src/draggable/DragProxyContainer.mjs';
import Viewport           from '../../../../../apps/colors/view/Viewport.mjs';
import ViewportController from '../../../../../apps/colors/view/ViewportController.mjs';

const appName = 'ColorsViewportControllerTest';

/**
 * @summary Undoes the main-thread stand-ins this file installed, in reverse.
 * @type {Function[]}
 */
const removeMainStubs = [];

/**
 * @summary The answers `ColorService.read()` has been asked for and has not given yet.
 * @type {Function[]}
 */
let pendingReads = [];

/**
 * @summary Counts the answers given, so an arm can name WHICH one it reads back.
 * @type {Number}
 */
let readCount = 0;

/**
 * Stands in for the remote `ColorService`. It answers only when an arm releases it: the defect lives in
 * what the tree does WHILE the first answer is in flight, so a stub that answers at once would resolve
 * every reference before the drag it is measured against had started.
 */
Neo.ns('Colors.backend.ColorService', true).read = ({amountRows}) => new Promise(resolve => {
    pendingReads.push(() => {
        const answer = ++readCount;

        resolve({
            data: {
                summaryData: [{color: `#00000${answer}`, count: amountRows}],
                tableData  : Array.from({length: amountRows}, (_, index) => ({
                    columnA: `answer-${answer}`,
                    id     : `row-${index}`
                }))
            }
        })
    })
});

test.describe('Colors ViewportController', () => {
    let dragProxy, viewport;

    /**
     * The header toolbar's number fields register their disabled chars with the main thread, and the chart
     * wrappers hand their data to the amCharts addon. Both stand-ins are installed only where nothing is
     * registered yet, and removed again below: one worker process runs every unit spec file, and a plain
     * object left on a `Neo.main` namespace makes the next file's `Neo.setupClass` of the real singleton
     * throw a collision (`src/Neo.mjs:881`).
     */
    test.beforeAll(() => {
        const
            main  = Neo.ns('Neo.main', true),
            addon = Neo.ns('Neo.main.addon', true);

        if (!main.DomEvents) {
            main.DomEvents = {registerDisabledInputChars: () => {}, unregisterDisabledInputChars: () => {}};
            removeMainStubs.push(() => delete main.DomEvents)
        }

        if (!addon.AmCharts) {
            addon.AmCharts = {create: async () => {}, destroy: () => {}, updateData: () => {}};
            removeMainStubs.push(() => delete addon.AmCharts)
        }
    });

    test.afterAll(() => {
        removeMainStubs.splice(0).forEach(remove => remove())
    });

    test.beforeEach(() => {
        pendingReads = []
    });

    test.afterEach(() => {
        dragProxy?.destroy();
        viewport?.destroy();
        dragProxy = viewport = null
    });

    test('builds the environment-aware widget popup URL', () => {
        const originalEnvironment = Neo.config.environment;

        try {
            Neo.config.environment = 'development';
            expect(ViewportController.getWidgetPopupUrl()).toBe('apps/colors/childapps/widget/index.html');

            Neo.config.environment = 'dist/production';
            expect(ViewportController.getWidgetPopupUrl()).toBe('dist/production/apps/colors/childapps/widget/index.html');
        } finally {
            Neo.config.environment = originalEnvironment
        }
    });

    /**
     * @summary Creates the real Colors Viewport, whose controller asks for its first answer while constructing.
     * @param {Object} [config={}] Configs for the Viewport, such as a controller with its own deadline
     * @returns {Object} `{controller, dashboard, grid, gridPanel}`
     */
    function createViewport(config={}) {
        // applyBodyCls is off for the same reason the stand-ins above exist: it would reach the real
        // `Neo.main.DomAccess`, and standing an object in for that namespace breaks later spec files
        viewport = Neo.create(Viewport, {appName, applyBodyCls: false, parentId: 'document.body', ...config});

        return {
            controller: viewport.controller,
            dashboard : viewport.down({reference: 'dashboard'}),
            grid      : viewport.down({reference: 'grid'}),
            gridPanel : viewport.down({reference: 'grid-panel'})
        }
    }

    /**
     * @summary Hosts the grid's panel in a `DragProxyContainer`, the way a dashboard drag does.
     *
     * Mirrors `DragZone#createDragProxy` (`parentId: proxyParentId`, `parentComponent: owner`) and
     * `dashboard/SortZone#startRemoteDrag` (the live widget as the proxy's item). The panel keeps
     * existing — it just stops being reachable from the Viewport downwards, which is the state the
     * failing `tearOutMatrix` runs were in. `moveInMainThread: false` is the remote-drag value, and it
     * keeps the main-thread addon out of the mount.
     * @param {Neo.component.Base} dashboard
     * @param {Neo.component.Base} gridPanel
     */
    function hostInDragProxy(dashboard, gridPanel) {
        dashboard.remove(gridPanel, false);

        dragProxy = Neo.create(DragProxyContainer, {
            appName,
            items           : [gridPanel],
            moveInMainThread: false,
            parentComponent : dashboard,
            parentId        : 'document.body'
        })
    }

    /**
     * @summary Lets the backend answer every read it is holding.
     */
    function releaseReads() {
        pendingReads.splice(0).forEach(answer => answer())
    }

    test('a drag hosting the grid outside the tree still delivers the answer to the same grid', async () => {
        const {controller, dashboard, grid, gridPanel} = createViewport();

        hostInDragProxy(dashboard, gridPanel);

        // Nothing was resolved before the drag: the controller asks for the first time WHILE the proxy holds
        // the panel, which is the state this app's ~1-in-3 CI red was measured in
        expect(controller.references.grid).toBeUndefined();
        expect(viewport.down({reference: 'grid'}), 'the owner reaches what the proxy holds for it').toBe(grid);

        releaseReads();

        await expect.poll(() => grid.store.getCount(), {timeout: 1000}).toBe(10);

        expect(controller.getReference('grid')).toBe(grid);
        expect(grid.store.first().columnA).toBe(`answer-${readCount}`);
        expect(controller.getReference('bar-chart').chartData).toEqual([{color: `#00000${readCount}`, count: 10}]);
        expect(viewport.getStateProvider().getData('dataSource'), 'an answer in time keeps the backend').toBe('backend')
    });

    test('a backend that does not answer in time: the app generates the batch and stops asking', async () => {
        const {controller, grid} = createViewport({controller: {module: ViewportController, backendDeadline: 50}}),
              stateProvider      = viewport.getStateProvider();

        expect(stateProvider.getData('dataSource')).toBe('backend');

        await expect.poll(() => grid.store.getCount(), {timeout: 1000}).toBe(10);

        const summary = controller.getReference('bar-chart').chartData;

        expect(stateProvider.getData('dataSource')).toBe('local');
        expect(summary).toHaveLength(10);
        expect(summary.reduce((sum, {count}) => sum + count, 0), 'ten rows of ten columns').toBe(100);

        // The answer that arrives late reaches nobody, and the next batch asks nobody
        releaseReads();
        await controller.updateWidgets();

        expect(pendingReads).toHaveLength(0);
        expect(grid.store.first().columnA).not.toContain('answer')
    });

    test('CONTROL: a widget that is gone leaves the resume returning instead of throwing', async () => {
        const {controller, dashboard, gridPanel} = createViewport();

        // Not a drag: the panel is destroyed, so no owner holds the grid and the lookup has nothing to find.
        // Without this arm, "the resume survives a missing widget" would rest on the drag case alone, where
        // the widget is never actually missing
        dashboard.remove(gridPanel, true);
        ['bar-chart', 'grid', 'pie-chart'].forEach(name => delete controller.references[name]);

        const resumed = controller.updateWidgets();

        releaseReads();

        await expect(resumed).resolves.toBeUndefined();

        expect(controller.getReference('grid')).toBeNull()
    })
});
