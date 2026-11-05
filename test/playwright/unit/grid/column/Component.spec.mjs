
import {setup} from '../../../setup.mjs';

const appName = 'ComponentColumnTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import InstanceManager  from '../../../../../src/manager/Instance.mjs';
import Component        from '../../../../../src/component/Base.mjs';
import ComponentColumn  from '../../../../../src/grid/column/Component.mjs';
import FunctionalButton from '../../../../../src/functional/button/Base.mjs';
import GridRow          from '../../../../../src/grid/Row.mjs';
import Model            from '../../../../../src/data/Model.mjs';
import RecordFactory    from '../../../../../src/data/RecordFactory.mjs';

class MockComponent extends Component {
    static config = {
        className: 'Test.Unit.Grid.Column.Component.MockComponent',
        ntype    : 'mock-component',
        myValue  : null
    }

    set(config) {
        this.setCallCount = (this.setCallCount || 0) + 1;
        super.set(config);
    }
}
MockComponent = Neo.setupClass(MockComponent);

/**
 * @summary Unit tests for Neo.grid.column.Component optimization logic.
 *
 * Verifies that the 'cellRenderer' method short-circuits execution when:
 * 1. The component instance is reused (recycled).
 * 2. The record instance is identical.
 * 3. The record version has not changed.
 *
 * This optimization prevents redundant execution of component factory functions
 * and avoidable calls to component.set().
 */
test.describe('Neo.grid.column.Component', () => {
    let column, model, record;

    test.beforeEach(() => {
        column = Neo.create(ComponentColumn, {
            component: ({record}) => ({
                module : MockComponent,
                myValue: record.name
            })
        });

        model = Neo.create(Model, {
            fields: [{name: 'id'}, {name: 'name'}]
        });

        record = RecordFactory.createRecord(model, {
            id: '1',
            name: 'John'
        });
    });

    test('cellRenderer optimization works', () => {
        const gridContainer = {
            appName,
            windowId: 'win-1',
            body: {
                getStateProvider: () => null
            }
        };

        const row = {
            id: 'row-1'
        };

        // 1. First render
        const cmp1 = column.cellRenderer({
            gridContainer,
            record,
            row
        });

        expect(cmp1.lastRecordVersion).toBe(1);
        expect(cmp1.setCallCount).toBeUndefined(); // Created via Neo.create, set() not called explicitly on it yet

        // 2. Second render (same record, same version)
        // We need to simulate passing the existing component back (recycling)
        const cmp2 = column.cellRenderer({
            component: cmp1,
            gridContainer,
            record,
            row
        });

        expect(cmp2).toBe(cmp1);
        // set() should NOT be called (optimization)
        expect(cmp1.setCallCount).toBeUndefined();

        // 3. Update record (version increments)
        record.name = 'Jane';
        expect(record.version).toBe(2);

        const cmp3 = column.cellRenderer({
            component: cmp1,
            gridContainer,
            record,
            row
        });

        expect(cmp3).toBe(cmp1);
        // set() SHOULD be called because version changed
        expect(cmp1.setCallCount).toBe(1);
        expect(cmp1.lastRecordVersion).toBe(2);

        // 4. Different record
        const record2 = RecordFactory.createRecord(model, {
            id: '2',
            name: 'Bob'
        });

        const cmp4 = column.cellRenderer({
            component: cmp1,
            gridContainer,
            record: record2,
            row
        });

        expect(cmp4).toBe(cmp1);
        // set() SHOULD be called because record reference changed
        expect(cmp1.setCallCount).toBe(2);
        expect(cmp1.lastRecordVersion).toBe(1); // record2 starts at version 1
    });

    test('Neo.grid.Row#applyRendererOutput registers functional components (Neo.component.Abstract) in row.components and emits createVdomReference() (#20364)', () => {
        const fnColumn = Neo.create(ComponentColumn, {
            dataField: 'name',
            component: ({record}) => ({
                module: FunctionalButton,
                text  : record.name
            })
        });

        const gridContainer = {
            appName,
            windowId: 'win-1',
            body    : {
                getStateProvider: () => null
            }
        };

        const gridBody = {
            getRecordId: rec => rec.id
        };

        const store = {
            getKey       : rec => rec.id,
            valueBandsMap: null
        };

        const row = Neo.create(GridRow, {
            appName,
            record,
            rowIndex: 0
        });

        const cellConfig = row.applyRendererOutput({
            cache      : {gridBody, gridContainer, store},
            cellId     : `${row.id}__name`,
            column     : fnColumn,
            columnIndex: 0,
            record,
            rowIndex   : 0
        });

        const createdFnBtn = row.components?.name;

        expect(createdFnBtn instanceof FunctionalButton).toBe(true);
        expect(cellConfig.cn).toEqual([{componentId: createdFnBtn.id}]);

        // Lifecycle relay (mounted / theme / windowId) reaches the functional cell component
        row.mounted  = true;
        row.theme    = 'neo-theme-dark';
        row.windowId = 'win-2';

        expect(createdFnBtn.mounted).toBe(true);
        expect(createdFnBtn.theme).toBe('neo-theme-dark');
        expect(createdFnBtn.windowId).toBe('win-2');

        row.destroy();
        fnColumn.destroy();
        expect(createdFnBtn.isDestroyed).toBe(true)
    });
});
