import CellModel     from '../../../../../src/selection/grid/CellModel.mjs';
import ComboBox      from '../../../../../src/form/field/ComboBox.mjs';
import DateField     from '../../../../../src/form/field/Date.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import NumberField   from '../../../../../src/form/field/Number.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import TreeModel     from '../../../../../src/data/TreeModel.mjs';
import TreeStore     from '../../../../../src/data/TreeStore.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for cell editing over records that are not flat: a nested object and a tree.
 *
 * `#grid-cell-editing-nested` edits `user.firstname` and `user.lastname`, fields inside a nested `user` object, next to
 * the flat `country`. A dotted `dataField` reaches the record through its path, so the commit, the cell lookup and the
 * modified marker each take the dotted name. The model tracks modified fields and the body highlights them:
 * `neo-is-modified` is the one DOM trace of what the record holds against its original value.
 *
 * `#grid-cell-editing-tree` edits a `TreeStore`. Its `name` column is a `tree` column, whose cells hold a component
 * (indent, toggle, label): the editor takes that component's place and has to give it back. `src` and `grid` start
 * expanded and `component` collapsed, so a toggle click has rows to take away.
 *
 * Both grids also carry one column per non-text editor, over a typed field: a `NumberField` over an `Int`, a `DateField`
 * over a `Date`, and a `ComboBox` whose value (`id`) differs from what the cell shows (`name`). The record converts what
 * each editor commits, so a round trip proves the value reached the record in its own type, not just the cell text.
 * Dates start as `Date` objects and render as their UTC day, the form the editor reads back: only a committed date
 * arrives as the editor's string, so only a commit depends on the record converting it.
 *
 * Both select cells with a `CellModel`, and both keep `cellEditing: true`, the public entry point. The fixture is its
 * own app: a third grid in `grid-cell-editing` would shrink the row windows its pooling arms depend on.
 */
const teams = [{id: 'core', name: 'Core'}, {id: 'docs', name: 'Docs'}, {id: 'grid', name: 'Grid'}];

const dayOf        = ({value}) => value ? value.toISOString().slice(0, 10) : '',
      teamNameOf   = ({value}) => teams.find(team => team.id === value)?.name ?? '',
      // One config object per column: an editor config is the column's own, never shared between columns
      dateEditor   = () => ({module: DateField,   clearable: false}),
      numberEditor = () => ({module: NumberField, clearable: false, maxValue: 99999, minValue: 0});

const nestedStore = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridCellEditingNestedStore',
        keyProperty: 'id',

        model: {
            trackModifiedFields: true,

            fields: [
                {name: 'id',      type: 'Integer'},
                {name: 'country', type: 'String'},
                {name: 'user',    type: 'Object', fields: [
                    {name: 'firstname', type: 'String'},
                    {name: 'lastname',  type: 'String'},
                    {name: 'age',       type: 'Int'},
                    {name: 'joined',    type: 'Date'},
                    {name: 'team',      type: 'String'}
                ]}
            ]
        },

        data: Array.from({length: 6}, (_, i) => ({
            id     : i + 1,
            country: ['DE', 'FR', 'IT'][i % 3],
            user   : {
                firstname: `First ${i + 1}`,
                lastname : `Last ${i + 1}`,
                age      : 20 + i,
                joined   : new Date(`2024-12-1${i}`),
                team     : teams[i % 3].id
            }
        }))
    }
});

const treeModel = Neo.setupClass(class extends TreeModel {
    static config = {
        className: 'Neo.test.playwright.GridCellEditingTreeModel',

        fields: [
            {name: 'id',       type: 'String'},
            {name: 'name',     type: 'String'},
            {name: 'type',     type: 'String'},
            {name: 'size',     type: 'String'},
            {name: 'lines',    type: 'Int'},
            {name: 'modified', type: 'Date'}
        ]
    }
});

const treeStore = Neo.setupClass(class extends TreeStore {
    static config = {
        className: 'Neo.test.playwright.GridCellEditingTreeStore',
        model    : treeModel,

        data: [
            {id: 'src',        name: 'src',           type: 'folder', isLeaf: false, collapsed: false},
            {id: 'component',  name: 'component',     type: 'folder', isLeaf: false, collapsed: true,  parentId: 'src'},
            {id: 'base',       name: 'Base.mjs',      type: 'file',   isLeaf: true,  size: '12 KB', lines: 1200, modified: new Date('2024-12-01'), parentId: 'component'},
            {id: 'grid',       name: 'grid',          type: 'folder', isLeaf: false, collapsed: false, parentId: 'src'},
            {id: 'container',  name: 'Container.mjs', type: 'file',   isLeaf: true,  size: '45 KB', lines: 4500, modified: new Date('2024-12-02'), parentId: 'grid'},
            {id: 'row',        name: 'Row.mjs',       type: 'file',   isLeaf: true,  size: '20 KB', lines: 2000, modified: new Date('2024-12-03'), parentId: 'grid'},
            {id: 'readme',     name: 'README.md',     type: 'file',   isLeaf: true,  size: '5 KB',  lines: 120,  modified: new Date('2024-12-04')}
        ]
    }
});

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},

        items: [{
            module     : GridContainer,
            id         : 'grid-cell-editing-nested',
            body       : {highlightModifiedCells: true},
            cellEditing: true,
            flex       : 1,
            store      : nestedStore,
            viewConfig : {selectionModel: CellModel},

            columns: [
                {dataField: 'id',             text: '#',         width: 60},
                {dataField: 'user.firstname', text: 'Firstname', width: 200, editable: true},
                {dataField: 'user.lastname',  text: 'Lastname',  width: 200, editable: true},
                {dataField: 'country',        text: 'Country',   width: 160, editable: true},
                {dataField: 'user.age',       text: 'Age',       width: 120, editable: true, editor: numberEditor()},
                {dataField: 'user.joined',    text: 'Joined',    width: 160, editable: true, editor: dateEditor(), renderer: dayOf},
                {dataField: 'user.team',      text: 'Team',      width: 160, editable: true, renderer: teamNameOf, editor: {
                    module        : ComboBox,
                    clearable     : false,
                    forceSelection: true,
                    store         : teams
                }}
            ]
        }, {
            module     : GridContainer,
            id         : 'grid-cell-editing-tree',
            cellEditing: true,
            flex       : 1,
            store      : treeStore,
            viewConfig : {selectionModel: CellModel},

            columns: [
                {dataField: 'name',     text: 'Name',     type: 'tree', width: 250, editable: true},
                {dataField: 'type',     text: 'Type',     width: 120, editable: true, editor: {
                    module        : ComboBox,
                    clearable     : false,
                    forceSelection: true,
                    store         : ['file', 'folder']
                }},
                {dataField: 'size',     text: 'Size',     width: 100, editable: true},
                {dataField: 'lines',    text: 'Lines',    width: 100, editable: true, editor: numberEditor()},
                {dataField: 'modified', text: 'Modified', width: 160, editable: true, editor: dateEditor(), renderer: dayOf}
            ]
        }]
    },
    name: 'Test.Playwright.GridCellEditingRecordShapes'
});
