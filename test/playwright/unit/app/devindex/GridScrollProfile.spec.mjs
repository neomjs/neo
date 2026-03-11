import {setup} from '../../../setup.mjs';

const appName = 'DevIndexScrollProfileTest';

setup({
    appConfig: {
        name             : appName,
        isMounted        : () => true, // Mock "Main Thread" mounted state
        vnodeInitialising: false
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
});

import {test, expect}     from '@playwright/test';
import fs                 from 'fs';
import path               from 'path';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs'; // <--- AUGMENT NEO NAMESPACE
import ComponentController from '../../../../../src/controller/Component.mjs';
import ComponentManager   from '../../../../../src/manager/Component.mjs';
import InstanceManager    from '../../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs'; // <--- RENDERER
import VdomHelper         from '../../../../../src/vdom/Helper.mjs'; // <--- ENGINE
import ContributorsStore  from '../../../../../apps/devindex/store/Contributors.mjs';
import GridContainer      from '../../../../../apps/devindex/view/home/GridContainer.mjs';

class MockController extends ComponentController {
    static config = {
        className: 'DevIndexScrollProfileTest.MockController'
    }
    onGridIsScrollingChange() {}
}
MockController = Neo.setupClass(MockController);

test.describe.serial('DevIndex Grid Scroll Profile', () => {

    test.beforeEach(async () => {
    });

    test('Profile massive VDOM delta on scroll (syncVnodeTree)', async () => {
        // 1. Initialize Store with 50k users (same as StoreFilterProfile.spec.mjs)
        const store = Neo.create(ContributorsStore, {
            autoLoad: false,
            proxy   : null
        });

        // Manually load the JSONL file
        const filePath    = path.join(process.cwd(), 'apps/devindex/resources/data/users.jsonl');
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        const data  = [];
        const lines = fileContent.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim()) {
                data.push(JSON.parse(line));
            }
        }
        store.add(data);
        expect(store.count).toBe(data.length);

        // 2. Initialize the Grid Container
        const grid = Neo.create(GridContainer, {
            appName,
            controller: MockController,
            height: 1000, // Large height to force many rows to render
            store
        });

        // 3. Initial Render
        await grid.initVnode();
        grid.mounted = true;

        // Force the grid body to generate its initial view data
        const gridBody = grid.body;

        // Manually setup column positions (normally done by HeaderToolbar)
        const colPos = grid.columns.items.map((col, index) => ({
            dataField: col.dataField,
            width    : 100,
            x        : index * 100
        }));

        gridBody.columnPositions.clear();
        gridBody.columnPositions.add(colPos);

        // Setting availableHeight allows buffer calculation to work in unit test mode
        gridBody.set({
            availableHeight: 2000,
            containerWidth : 1920,
            mountedColumns : [0, colPos.length - 1]
        });

        // 4. Wait for the initial VDOM generation to settle
        await grid.timeout(50);
        await grid.promiseUpdate();

        // At this point, the grid has rendered the first ~40-50 rows.
        // We will simulate a large scroll jump, which causes createViewData
        // to replace all existing row VDOM nodes with new ones, triggering
        // massive amounts of syncVnodeTree() overhead.

        gridBody.scrollTop = 50000; // Jump down significantly

        expect(gridBody.items.length).toBeGreaterThan(40);

        const start = performance.now();

        // Trigger the VDOM generation for the new scroll position
        gridBody.createViewData();

        // Wait for the complete VDOM update cycle (including executeVdomUpdate -> resolveVdomUpdate -> syncVnodeTree)
        await grid.promiseUpdate();

        const duration = performance.now() - start;

        // Currently, without the optimization, this might take >500ms or even >1000ms.
        // We expect it to drop drastically (e.g. < 200ms or less) with the Map fix.
        expect(duration).toBeLessThan(200);

        grid.destroy();
        store.destroy();
    });
});
