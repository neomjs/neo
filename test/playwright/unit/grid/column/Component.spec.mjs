
import {setup} from '../../../setup.mjs';

const appName = 'ComponentColumnTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import Component       from '../../../../../src/component/Base.mjs';
import ComponentColumn from '../../../../../src/grid/column/Component.mjs';
import Model           from '../../../../../src/data/Model.mjs';
import RecordFactory   from '../../../../../src/data/RecordFactory.mjs';

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
test.describe.serial('Neo.grid.column.Component', () => {
    let column, model, record;

    test.beforeEach(() => {
        Neo.currentWorker = {
            insertThemeFiles: () => {}
        };

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
});
