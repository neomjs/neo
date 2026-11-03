import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'RowModelKeypressClickTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import Observable       from '../../../../src/core/Observable.mjs';
import GridRowModel     from '../../../../src/selection/grid/RowModel.mjs';
import TableRowModel    from '../../../../src/selection/table/RowModel.mjs';

class MockTableView extends Neo.core.Base {
    static observable = true;

    static config = {
        className          : 'Test.Unit.Selection.RowModelKeypress.MockTableView',
        selectedRecordField: 'selected'
    }

    recordsById = {};
    deselected  = [];

    getRecord(id) {
        return this.recordsById[id] || null
    }

    onDeselect(record) {
        this.deselected.push(record)
    }
}
MockTableView = Neo.setupClass(MockTableView);

class MockGridView extends Neo.core.Base {
    static observable = true;

    static config = {
        className          : 'Test.Unit.Selection.RowModelKeypress.MockGridView',
        selectedRecordField: 'selected'
    }

    getRecordId(record) {
        return record.id
    }
}
MockGridView = Neo.setupClass(MockGridView);

test.describe('RowModel onRowClick modifier-key and unmodified click dispatch', () => {
    test('Neo.selection.table.RowModel fires altSelect, ctrlSelect, metaSelect, and shiftSelect without toggling selection', () => {
        const record = {id: 'rec-1', name: 'Row 1'},
              view   = Neo.create(MockTableView),
              model  = Neo.create(TableRowModel),
              fired  = [];

        ComponentManager.register(view);
        view.recordsById['row-1'] = record;
        model.view                = view;
        model.toggleSelection     = id => {
            const idx = model.items.indexOf(id);
            if (idx > -1) {
                model.items.splice(idx, 1)
            } else {
                model.items.push(id)
            }
        };

        ['altSelect', 'ctrlSelect', 'metaSelect', 'shiftSelect', 'select', 'deselect'].forEach(eventName => {
            view.on(eventName, payload => fired.push({eventName, payload}))
        });

        const modifiers = [
            ['altKey',   'altSelect'],
            ['ctrlKey',  'ctrlSelect'],
            ['metaKey',  'metaSelect'],
            ['shiftKey', 'shiftSelect']
        ];

        for (const [keyProp, expectedEvent] of modifiers) {
            const domData = {currentTarget: 'row-1', [keyProp]: true};

            model.onRowClick({data: domData, record});

            expect(fired).toHaveLength(1);
            expect(fired[0].eventName).toBe(expectedEvent);
            expect(fired[0].payload.data).toBe(domData);
            expect(fired[0].payload.record).toBe(record);
            expect(model.isSelected('row-1')).toBe(false);

            fired.length = 0
        }

        // Unmodified click selects and fires 'select' with {record}
        model.onRowClick({data: {currentTarget: 'row-1'}});
        expect(model.isSelected('row-1')).toBe(true);
        expect(fired).toHaveLength(1);
        expect(fired[0].eventName).toBe('select');
        expect(fired[0].payload.record).toBe(record);

        fired.length = 0;

        // Second unmodified click deselects, invokes view.onDeselect, and fires 'deselect' with {record}
        model.onRowClick({data: {currentTarget: 'row-1'}});
        expect(model.isSelected('row-1')).toBe(false);
        expect(view.deselected).toEqual([record]);
        expect(fired).toHaveLength(1);
        expect(fired[0].eventName).toBe('deselect');
        expect(fired[0].payload.record).toBe(record);

        ComponentManager.unregister(view);
        view.destroy()
    });

    test('Neo.selection.grid.RowModel fires altSelect, ctrlSelect, metaSelect, and shiftSelect without mutating selectedRows', () => {
        const record = {id: 'rec-grid-1', name: 'Grid Row 1'},
              view   = Neo.create(MockGridView),
              model  = Neo.create(GridRowModel),
              fired  = [];

        let selectionChangeCount = 0;

        ComponentManager.register(view);
        model.view = view;
        model.toggleRowSelection = recordId => {
            const idx = model.selectedRows.indexOf(recordId);
            if (idx > -1) {
                model.selectedRows.splice(idx, 1)
            } else {
                model.selectedRows.push(recordId)
            }
        };
        model.fireRowSelectionChange = () => {
            selectionChangeCount++
        };

        ['altSelect', 'ctrlSelect', 'metaSelect', 'shiftSelect', 'select', 'deselect'].forEach(eventName => {
            view.on(eventName, payload => fired.push({eventName, payload}))
        });

        const modifiers = [
            ['altKey',   'altSelect'],
            ['ctrlKey',  'ctrlSelect'],
            ['metaKey',  'metaSelect'],
            ['shiftKey', 'shiftSelect']
        ];

        for (const [keyProp, expectedEvent] of modifiers) {
            const domData = {path: [{cls: ['neo-grid-row'], id: 'grid__row__0'}], [keyProp]: true};

            model.onRowClick({data: domData, record});

            expect(fired).toHaveLength(1);
            expect(fired[0].eventName).toBe(expectedEvent);
            expect(fired[0].payload.data).toBe(domData);
            expect(fired[0].payload.record).toBe(record);
            expect(model.isSelectedRow('rec-grid-1')).toBe(false);
            expect(selectionChangeCount).toBe(0);

            fired.length = 0
        }

        // Unmodified click selects row, fires 'select' with {record}, and notifies selectionChange
        model.onRowClick({data: {path: []}, record});
        expect(model.isSelectedRow('rec-grid-1')).toBe(true);
        expect(selectionChangeCount).toBe(1);
        expect(fired).toHaveLength(1);
        expect(fired[0].eventName).toBe('select');
        expect(fired[0].payload.record).toBe(record);

        fired.length = 0;

        // Second unmodified click deselects row and fires 'deselect' with {record}
        model.onRowClick({data: {path: []}, record});
        expect(model.isSelectedRow('rec-grid-1')).toBe(false);
        expect(selectionChangeCount).toBe(2);
        expect(fired).toHaveLength(1);
        expect(fired[0].eventName).toBe('deselect');
        expect(fired[0].payload.record).toBe(record);

        ComponentManager.unregister(view);
        view.destroy()
    });
});
