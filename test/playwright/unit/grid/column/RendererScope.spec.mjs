import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'GridColumnRendererScopeTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import CurrencyColumn from '../../../../../src/grid/column/Currency.mjs';
import GridColumn     from '../../../../../src/grid/column/Base.mjs';
import IndexColumn    from '../../../../../src/grid/column/Index.mjs';
import Row            from '../../../../../src/grid/Row.mjs';

/**
 * @summary Which instance a grid column's renderer runs on.
 *
 * Three sources can name it, and they rank: an explicit `rendererScope` wins, then the scope a string renderer
 * resolved against — `'up.name'` walks the parent chain to the instance that defines the method — and last the
 * grid Container, the surface the column belongs to. The column is the scope only when it owns the method, as
 * the default `cellRenderer` does.
 *
 * `Neo.grid.Row#applyRendererOutput` is borrowed on a plain object (`BodyCellMapping.spec` precedent: an
 * `Object.create(Row.prototype)` trips the reactive config system's private-brand check, while the borrowed
 * method only reads plain members).
 */
test.describe('Neo.grid.column.Base renderer scope', () => {
    /**
     * An ancestor that owns a renderer, as a view or a container above the grid does. Every call records the
     * instance it ran on into `scopes`, without dereferencing it, so a wrong scope reads as a comparison.
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
     * The cache and row members `applyRendererOutput` dereferences, plus the grid Container it defaults to.
     * @param {Object} gridContainer
     * @returns {Object}
     */
    function createRowFake(gridContainer) {
        const record = {
            id     : 'r1',
            country: 'de',
            get(field)        { return this[field] },
            isModifiedField() { return false }
        };

        const gridBody = {
            getLogicalCellId: (rec, dataField) => `logical__${rec.id}__${dataField}`,
            getRecordId     : rec => rec.id
        };

        return {
            applyRendererOutput: Row.prototype.applyRendererOutput,
            cache              : {colspanField: null, gridBody, gridContainer, highlightModifiedCells: false, selectedCells: [], selectionModel: null, store: {}},
            id                 : 'body-center__row-0',
            record
        }
    }

    /**
     * Renders one cell through the borrowed method.
     * @param {Object} row
     * @param {Neo.grid.column.Base} column
     * @returns {Object} the cell vdom
     */
    function renderCell(row, column) {
        return row.applyRendererOutput({cache: row.cache, cellId: 'cell-0', column, columnIndex: 0, record: row.record, rowIndex: 0})
    }

    test('an `up.` renderer runs on the ancestor that defines it', () => {
        const scopes   = [],
              ancestor = createAncestor(scopes),
              column   = Neo.create(GridColumn, {dataField: 'country', parent: ancestor, renderer: 'up.ancestorRenderer'}),
              row      = createRowFake({id: 'grid-1'});

        const cell = renderCell(row, column);

        expect(cell.html, 'the ancestor\'s method ran').toBe('ancestor:de');
        expect(scopes, 'it ran once, on the ancestor').toEqual([ancestor])
    });

    test('a function renderer without a scope runs on the grid Container', () => {
        const scopes        = [],
              gridContainer = {id: 'grid-1'},
              column        = Neo.create(GridColumn, {
                  dataField: 'country',
                  renderer : function({value}) {
                      scopes.push(this);
                      return value
                  }
              }),
              row = createRowFake(gridContainer);

        renderCell(row, column);

        expect(scopes, 'the grid Container is the default scope, as it is for a table').toEqual([gridContainer])
    });

    test('`cellCls` follows the renderer\'s scope rule', () => {
        const rendererScopes = [],
              clsScopes      = [],
              ancestor       = createAncestor(rendererScopes),
              column         = Neo.create(GridColumn, {
                  cellCls: function() {
                      clsScopes.push(this);
                      return 'from-ancestor'
                  },
                  dataField: 'country',
                  parent   : ancestor,
                  renderer : 'up.ancestorRenderer'
              }),
              row = createRowFake({id: 'grid-1'});

        const cell = renderCell(row, column);

        expect(clsScopes, 'the same instance the renderer ran on').toEqual([ancestor]);
        expect(cell.cls, 'and its output is applied').toContain('from-ancestor')
    });

    for (const rendererScope of ['me', 'this']) {
        test(`rendererScope '${rendererScope}' keeps the column`, () => {
            const scopes = [],
                  column = Neo.create(GridColumn, {
                      dataField: 'country',
                      rendererScope,
                      renderer : function({value}) {
                          scopes.push(this);
                          return value
                      }
                  }),
                  row = createRowFake({id: 'grid-1'});

            renderCell(row, column);

            expect(scopes, 'grid.column.Component relies on this').toEqual([column])
        })
    }

    test('an explicit rendererScope instance wins over every default', () => {
        const scopes   = [],
              ancestor = createAncestor(scopes),
              explicit = {id: 'explicit-scope'},
              column   = Neo.create(GridColumn, {dataField: 'country', parent: ancestor, renderer: 'up.ancestorRenderer', rendererScope: explicit}),
              row      = createRowFake({id: 'grid-1'});

        renderCell(row, column);

        expect(scopes, 'the method ran on the configured scope').toEqual([explicit])
    });

    /**
     * A view controller above the grid, as `examples/grid/nestedRecordFields` declares one: it defines a renderer the
     * column only names. `getHandlerScope` answers as `Neo.controller.Component#getHandlerScope` does for a name
     * without a component: the controller that defines it, or null. It also defines `cellRenderer`, so a lookup
     * that asked the controller before the column would take over the column's own renderer.
     * @param {Object[]} scopes
     * @returns {Object}
     */
    function createController(scopes) {
        return {
            getHandlerScope(name) {
                return Neo.isFunction(this[name]) ? this : null
            },

            cellRenderer() {
                return 'controller-took-over'
            },

            countryRenderer({value}) {
                scopes.push(this);
                return `controller:${value}`
            }
        }
    }

    test('a plain renderer name only a view controller defines runs on that controller', () => {
        const scopes        = [],
              controller    = createController(scopes),
              gridContainer = {id: 'grid-1', parent: null, getController: () => controller},
              column        = Neo.create(GridColumn, {dataField: 'country', parent: gridContainer, renderer: 'countryRenderer'}),
              row           = createRowFake(gridContainer);

        const cell = renderCell(row, column);

        expect(cell.html, 'the controller\'s method ran').toBe('controller:de');
        expect(scopes, 'it ran once, on the controller').toEqual([controller])
    });

    test('CONTROL: a name the column defines stays the column\'s when its view controller defines it too', () => {
        const controller    = createController([]),
              gridContainer = {id: 'grid-1', parent: null, getController: () => controller},
              column        = Neo.create(GridColumn, {dataField: 'country', parent: gridContainer}),
              row           = createRowFake(gridContainer);

        const cell = renderCell(row, column);

        expect(cell.html, 'the column\'s own cellRenderer ran').toBe('de')
    });

    test('CONTROL: the default cellRenderer still resolves on the column itself', () => {
        const column = Neo.create(GridColumn, {dataField: 'country'}),
              row    = createRowFake({id: 'grid-1'});

        const cell = renderCell(row, column);

        expect(cell.html, 'the column\'s own cellRenderer returned the field value').toBe('de')
    });

    /**
     * The base `cellRenderer` returns its argument and never reads `this`, so it renders the same under every
     * scope the code could pass. These two subclasses do read `this`, which is what makes them able to fail.
     */
    test('a column whose own cellRenderer reads `this` keeps the column as its scope', () => {
        const column = Neo.create(CurrencyColumn, {dataField: 'amount'}),
              row    = createRowFake({id: 'grid-1'});

        row.record.amount = 1234.5;

        const cell = renderCell(row, column);

        expect(cell.html, 'Currency#cellRenderer reached its own formatter').toBe(column.formatter.format(1234.5))
    });

    test('an Index column reads its own zeroBased, not the grid Container\'s', () => {
        const column = Neo.create(IndexColumn, {dataField: 'index', zeroBased: true}),
              row    = createRowFake({id: 'grid-1'});

        const cell = renderCell(row, column);

        expect(cell.html, 'row 0 with zeroBased renders 0').toBe('0')
    })
});
