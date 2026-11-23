/**
 * @summary A table repaints changed mounted rows in one pass when its store publishes a row batch.
 * @see https://github.com/neomjs/neo/issues/20974
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'TableBodyRowsChangeTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';
import TableContainer from '../../../../src/table/Container.mjs';

test.describe('table.Body rowsChange repaint', () => {
    let body, paints, store, table, updates;

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            model          : {module: Model, fields: [
                {name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'colspan'}
            ]},
            data: [{id: 1, name: 'one'}, {id: 2, name: 'two'}, {id: 3, name: 'three'}]
        });
        await store.ready();
        table = Neo.create(TableContainer, {
            appName: 'TableBodyRowsChangeTest', store, columns: [{dataField: 'name', text: 'Name'}]
        });
        await Promise.resolve();
        body = table.body;
        body.createViewData();
        paints = [];
        updates = 0;
        const createRow = body.createRow.bind(body);
        body.createRow = options => {paints.push(options.record.id); return createRow(options)};
        body.update = () => updates++
    });

    test.afterEach(() => {table.destroy(); store.destroy()});

    test('rebuilds each changed mounted row once and sends one update', () => {
        store.updateRows([{key: 1, values: {name: 'ONE'}}, {key: 2, values: {name: 'TWO'}}]);
        expect(paints).toEqual([1, 2]);
        expect(updates).toBe(1);
        expect(JSON.stringify(body.vdom.cn[0])).toContain('ONE');
        expect(JSON.stringify(body.vdom.cn[1])).toContain('TWO')
    });

    test('ignores unmounted rows', () => {
        store.add({id: 4, name: 'four'});
        body.vdom.cn = body.vdom.cn.slice(0, 3);
        paints.length = 0;
        updates = 0;
        store.updateRows([{key: 4, values: {name: 'FOUR'}}]);
        expect(paints).toEqual([]);
        expect(updates).toBe(0)
    });

    test('keeps ordinary record edits working', () => {
        store.get(1).name = 'SINGLE';
        expect(updates).toBe(1);
        expect(JSON.stringify(body.vdom.cn[0])).toContain('SINGLE')
    });

    test('includes a colspan change in the same batch pass', () => {
        store.updateRows([{key: 1, values: {colspan: {name: 1}}}, {key: 2, values: {name: 'TWO'}}]);
        expect(paints).toEqual([1, 2]);
        expect(updates).toBe(1)
    })
});
