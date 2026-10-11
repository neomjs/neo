import {setup} from '../../setup.mjs';

const appName = 'TableHeaderButtonRendererScopeTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import CoreBase       from '../../../../src/core/Base.mjs';
import HeaderButton   from '../../../../src/table/header/Button.mjs';
import TableBody      from '../../../../src/table/Body.mjs';
import '../../../../src/manager/Instance.mjs'; // Neo.get, which a plain renderer name's controller lookup calls

/**
 * A column whose default renderer reads its own config: the base `cellRenderer` reads nothing, and so passes on
 * any scope.
 */
class ConfigReadingButton extends HeaderButton {
    static config = {
        className: 'Test.table.header.ConfigReadingButton'
    }

    cellRenderer({value}) {
        return `${this.dataField}:${value}`
    }
}

Neo.setupClass(ConfigReadingButton);

/**
 * @summary Which instance a table column's renderer runs on — the same ranking `grid.column.Base` uses.
 *
 * An explicit `rendererScope` wins, then the scope a string renderer resolved against — `'up.name'` walks the
 * parent chain to the instance that defines the method — and last the table Container. Before this, a table
 * kept only the resolved function and ran every renderer on the container, so a column config moved between a
 * grid and a table silently changed its `this`.
 *
 * `table.Body#applyRendererOutput` is borrowed on a plain object, with `bindCallback` from `core.Base`: the
 * method only reads the members supplied here.
 */
test.describe('Neo.table.header.Button renderer scope', () => {
    let column;

    test.afterEach(() => {
        column?.destroy();
        column = null
    });

    /**
     * An ancestor that owns a renderer. Every call records the instance it ran on, without dereferencing it,
     * so a wrong scope reads as a comparison rather than as a throw.
     * @param {Object[]} scopes
     * @returns {Object}
     */
    function createAncestor(scopes) {
        return {
            parent: null,

            ancestorRenderer({value}) {
                scopes.push(this);
                return `ancestor:${value}`
            }
        }
    }

    /**
     * Renders one cell through the borrowed method.
     * @param {Neo.table.header.Button} headerButton
     * @param {Object} tableContainer
     * @returns {Object} the cell vdom
     */
    function renderCell(headerButton, tableContainer) {
        const body = {
            applyRendererOutput   : TableBody.prototype.applyRendererOutput,
            bindCallback          : CoreBase.prototype.bindCallback,
            colspanField          : 'colspan',
            highlightModifiedCells: false,
            store                 : {model: {getField: () => true}},
            vdom                  : {cn: []}
        };

        return body.applyRendererOutput({
            cellId     : 'cell-0',
            column     : headerButton,
            columnIndex: 0,
            record     : {country: 'de'},
            rowIndex   : 0,
            tableContainer
        })
    }

    test('an `up.` renderer runs on the ancestor that defines it', () => {
        const scopes   = [],
              ancestor = createAncestor(scopes);

        column = Neo.create(HeaderButton, {appName, dataField: 'country', parentComponent: ancestor, renderer: 'up.ancestorRenderer'});

        const cell = renderCell(column, {id: 'table-1'});

        expect(cell.html, 'the ancestor\'s method ran').toBe('ancestor:de');
        expect(scopes, 'it ran once, on the ancestor').toEqual([ancestor])
    });

    test('a function renderer without a scope runs on the table Container', () => {
        const scopes         = [],
              tableContainer = {id: 'table-1'};

        column = Neo.create(HeaderButton, {
            appName,
            dataField: 'country',
            renderer : function({value}) {
                scopes.push(this);
                return value
            }
        });

        renderCell(column, tableContainer);

        expect(scopes, 'the container stays the default for a function').toEqual([tableContainer])
    });

    test('an explicit rendererScope instance wins over the resolved one', () => {
        const scopes   = [],
              ancestor = createAncestor(scopes),
              explicit = {id: 'explicit-scope'};

        column = Neo.create(HeaderButton, {appName, dataField: 'country', parentComponent: ancestor, renderer: 'up.ancestorRenderer', rendererScope: explicit});

        renderCell(column, {id: 'table-1'});

        expect(scopes, 'the method ran on the configured scope').toEqual([explicit])
    });

    test('a plain renderer name runs on the column, so its own renderer can read its configs', () => {
        column = Neo.create(ConfigReadingButton, {appName, dataField: 'country'});

        expect(renderCell(column, {id: 'table-1'}).html).toBe('country:de')
    })
});
