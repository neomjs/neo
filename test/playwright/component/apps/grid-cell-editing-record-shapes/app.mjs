import CellModel     from '../../../../../src/selection/grid/CellModel.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
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
 * Both select cells with a `CellModel`, and both keep `cellEditing: true`, the public entry point. The fixture is its
 * own app: a third grid in `grid-cell-editing` would shrink the row windows its pooling arms depend on.
 */
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
                    {name: 'lastname',  type: 'String'}
                ]}
            ]
        },

        data: Array.from({length: 6}, (_, i) => ({
            id     : i + 1,
            country: ['DE', 'FR', 'IT'][i % 3],
            user   : {firstname: `First ${i + 1}`, lastname: `Last ${i + 1}`}
        }))
    }
});

const treeModel = Neo.setupClass(class extends TreeModel {
    static config = {
        className: 'Neo.test.playwright.GridCellEditingTreeModel',

        fields: [
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'},
            {name: 'type', type: 'String'},
            {name: 'size', type: 'String'}
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
            {id: 'base',       name: 'Base.mjs',      type: 'file',   isLeaf: true,  size: '12 KB',    parentId: 'component'},
            {id: 'grid',       name: 'grid',          type: 'folder', isLeaf: false, collapsed: false, parentId: 'src'},
            {id: 'container',  name: 'Container.mjs', type: 'file',   isLeaf: true,  size: '45 KB',    parentId: 'grid'},
            {id: 'row',        name: 'Row.mjs',       type: 'file',   isLeaf: true,  size: '20 KB',    parentId: 'grid'},
            {id: 'readme',     name: 'README.md',     type: 'file',   isLeaf: true,  size: '5 KB'}
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
                {dataField: 'country',        text: 'Country',   width: 160, editable: true}
            ]
        }, {
            module     : GridContainer,
            id         : 'grid-cell-editing-tree',
            cellEditing: true,
            flex       : 1,
            store      : treeStore,
            viewConfig : {selectionModel: CellModel},

            columns: [
                {dataField: 'name', text: 'Name', type: 'tree', width: 250, editable: true},
                {dataField: 'type', text: 'Type', width: 100},
                {dataField: 'size', text: 'Size', width: 100, editable: true}
            ]
        }]
    },
    name: 'Test.Playwright.GridCellEditingRecordShapes'
});
