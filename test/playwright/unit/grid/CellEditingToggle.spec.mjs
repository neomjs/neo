/**
 * @file test/playwright/unit/grid/CellEditingToggle.spec.mjs
 * @summary Pins `Neo.grid.Container#cellEditing` as a reactive config in BOTH directions.
 *
 * The grid owns one cell-editing plugin for its lifetime. Turning the config off disables that plugin, turning it
 * back on re-enables the same instance, and a plugin whose dynamic import lands after the config changed again
 * arrives matching the current value. One instance is what keeps a single edit session authoritative for the grid.
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridCellEditingToggleTest',
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import CellEditingPlugin from '../../../../src/grid/plugin/CellEditing.mjs';
import GridContainer     from '../../../../src/grid/Container.mjs';
import InstanceManager   from '../../../../src/manager/Instance.mjs';
import Store             from '../../../../src/data/Store.mjs';
import VdomHelper        from '../../../../src/vdom/Helper.mjs';

/**
 * The plugin arrives through a dynamic import, so every arm waits for it rather than for a fixed timeout.
 * @param {Neo.grid.Container} grid
 * @returns {Promise<Neo.plugin.Base|null>}
 */
async function awaitPlugin(grid) {
    for (let i = 0; i < 50; i++) {
        const plugin = grid.getPlugin('grid-cell-editing');

        if (plugin) {
            return plugin
        }

        await grid.timeout(10)
    }

    return null
}

/**
 * How many cell-editing plugins the grid actually holds. The defect was a second instance, so the arms count
 * rather than merely resolve one.
 * @param {Neo.grid.Container} grid
 * @returns {Number}
 */
function countPlugins(grid) {
    return (grid.plugins || []).filter(plugin => plugin.ntype === 'plugin-grid-cell-editing').length
}

test.describe('Grid cellEditing toggled at runtime', () => {
    let grid, store;

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [
                {id: 1, firstname: 'Tobias'},
                {id: 2, firstname: 'Rich'}
            ],
            model: {
                fields: [
                    {name: 'id',        type: 'Integer'},
                    {name: 'firstname', type: 'String'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName       : 'GridCellEditingToggleTest',
            cellEditing   : false,
            height        : 200,
            width         : 300,
            rowHeight     : 40,
            store,
            columnDefaults: {editable: true, width: 150},
            columns       : [
                {dataField: 'id',        text: 'ID'},
                {dataField: 'firstname', text: 'Firstname'}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        await grid.timeout(20)
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('a grid constructed with cellEditing false has no plugin', async () => {
        expect(countPlugins(grid)).toBe(0)
    });

    test('turning it on registers exactly one enabled plugin', async () => {
        grid.cellEditing = true;

        const plugin = await awaitPlugin(grid);

        expect(plugin).not.toBeNull();
        expect(countPlugins(grid)).toBe(1);
        expect(plugin.disabled).toBe(false)
    });

    test('turning it off disables the plugin instead of leaving it live', async () => {
        grid.cellEditing = true;

        const plugin = await awaitPlugin(grid);

        grid.cellEditing = false;

        await grid.timeout(20);

        // The config and the plugin agree: a grid whose cellEditing reads false does not edit.
        expect(plugin.disabled).toBe(true);
        expect(countPlugins(grid)).toBe(1)
    });

    test('an off and on cycle reuses the instance instead of adding a second one', async () => {
        grid.cellEditing = true;

        const plugin = await awaitPlugin(grid);

        grid.cellEditing = false;
        await grid.timeout(20);

        grid.cellEditing = true;
        await grid.timeout(50);

        // One instance, so one session owns the grid's edit; a second plugin would hold its own in parallel.
        expect(countPlugins(grid)).toBe(1);
        expect(grid.getPlugin('grid-cell-editing')).toBe(plugin);
        expect(plugin.disabled).toBe(false)
    });

    test('a grid whose cellEditing is off refuses to start an edit', async () => {
        grid.cellEditing = true;

        const plugin = await awaitPlugin(grid);

        grid.cellEditing = false;
        await grid.timeout(20);

        // The refusal itself, not the flag that causes it: `startEdit` reports false and opens no session.
        expect(plugin.startEdit(store.getAt(0), 'firstname', true)).toBe(false);
        expect(plugin.session).toBeNull()
    });

    test('a plugin declared by hand is not disabled by this config default', async () => {
        const declared = Neo.create(GridContainer, {
            appName  : 'GridCellEditingToggleTest',
            height   : 200,
            width    : 300,
            rowHeight: 40,
            // Enabled by declaring the plugin directly, never through cellEditing, which stays at its default
            plugins: [{module: CellEditingPlugin, id: 'declared-cell-editing-plugin'}],
            store  : Neo.create(Store, {
                keyProperty: 'id',
                data       : [{id: 1, firstname: 'Tobias'}],
                model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'firstname', type: 'String'}]}
            }),
            columnDefaults: {editable: true, width: 150},
            columns       : [{dataField: 'firstname', text: 'Firstname'}]
        });

        await declared.initVnode();
        declared.mounted = true;
        await declared.timeout(20);

        const plugin = declared.getPlugin('grid-cell-editing');

        expect(plugin).not.toBeNull();
        expect(declared.cellEditing).toBe(false);
        expect(plugin.disabled).toBe(false);

        declared.destroy()
    });

    test('a plugin whose import lands after the config went off arrives disabled', async () => {
        grid.cellEditing = true;
        grid.cellEditing = false;

        const plugin = await awaitPlugin(grid);

        // The import is in flight while the config changes again, so the plugin's own config is read at push time
        // rather than captured when the import started.
        expect(plugin).not.toBeNull();
        expect(countPlugins(grid)).toBe(1);
        expect(plugin.disabled).toBe(true)
    })
});
