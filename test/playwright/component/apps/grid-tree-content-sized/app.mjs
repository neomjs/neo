import GridContainer from '../../../../../src/grid/Container.mjs';
import TreeModel     from '../../../../../src/data/TreeModel.mjs';
import TreeStore     from '../../../../../src/data/TreeStore.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

const LONG = 'This description is long enough to wrap across several lines in a narrow column, so its row grows to fit.';

/**
 * @summary A tree node with a label and a description.
 * @class Neo.test.playwright.GridTreeContentSizedModel
 * @extends Neo.data.TreeModel
 */
class GridTreeContentSizedModel extends TreeModel {
    static config = {
        className: 'Neo.test.playwright.GridTreeContentSizedModel',
        fields   : [
            {name: 'id',          type: 'String'},
            {name: 'name',        type: 'String'},
            {name: 'description', type: 'String'}
        ]
    }
}

GridTreeContentSizedModel = Neo.setupClass(GridTreeContentSizedModel);

/**
 * @summary Two levels of folders. The expanded `grid` folder holds a node whose label is long enough to wrap in the
 * indented tree cell; the collapsed `component` folder holds a tall description, so expanding it adds tall rows.
 * @class Neo.test.playwright.GridTreeContentSizedStore
 * @extends Neo.data.TreeStore
 */
class GridTreeContentSizedStore extends TreeStore {
    static config = {
        className: 'Neo.test.playwright.GridTreeContentSizedStore',
        model    : GridTreeContentSizedModel,
        data     : [
            {id: 'src',       name: 'src', description: 'Short.', isLeaf: false, collapsed: false},
            {id: 'component', parentId: 'src', name: 'component', description: LONG, isLeaf: false, collapsed: true},
            {id: 'base',      parentId: 'component', name: 'Base.mjs', description: `${LONG} ${LONG}`, isLeaf: true},
            {id: 'button',    parentId: 'component', name: 'Button.mjs', description: 'Short.', isLeaf: true},
            {id: 'grid',      parentId: 'src', name: 'grid', description: 'Short.', isLeaf: false, collapsed: false},
            {id: 'container', parentId: 'grid', name: 'Container.mjs with a deliberately long file name that wraps inside the indented tree cell', description: 'Short.', isLeaf: true},
            {id: 'row',       parentId: 'grid', name: 'Row.mjs', description: LONG, isLeaf: true},
            {id: 'readme',    name: 'README.md', description: 'Short.', isLeaf: true}
        ]
    }
}

GridTreeContentSizedStore = Neo.setupClass(GridTreeContentSizedStore);

/**
 * @summary A tree grid whose tree and description columns wrap their text.
 * @class Neo.test.playwright.GridTreeContentSizedGrid
 * @extends Neo.grid.Container
 */
class GridTreeContentSizedGrid extends GridContainer {
    static config = {
        className: 'Neo.test.playwright.GridTreeContentSizedGrid',
        columns  : [
            {dataField: 'name',        text: 'Name',        type: 'tree', width: 180, wrapText: true},
            {dataField: 'description', text: 'Description', width: 260, wrapText: true}
        ],
        rowHeight: 32
    }
}

GridTreeContentSizedGrid = Neo.setupClass(GridTreeContentSizedGrid);

/**
 * @summary The same tree twice: `#grid-sized` with content-sized rows and header filters, `#grid-fixed` with
 * fixed-height rows.
 * @class Neo.test.playwright.GridTreeContentSizedViewport
 * @extends Neo.container.Viewport
 */
class GridTreeContentSizedViewport extends Viewport {
    static config = {
        className: 'Neo.test.playwright.GridTreeContentSizedViewport',
        layout   : {ntype: 'hbox', align: 'stretch'},
        items    : [{
            module           : GridTreeContentSizedGrid,
            contentSizedRows : true,
            flex             : 1,
            id               : 'grid-sized',
            showHeaderFilters: true,
            store            : {module: GridTreeContentSizedStore}
        }, {
            module: GridTreeContentSizedGrid,
            flex  : 1,
            id    : 'grid-fixed',
            store : {module: GridTreeContentSizedStore}
        }]
    }
}

GridTreeContentSizedViewport = Neo.setupClass(GridTreeContentSizedViewport);

export const onStart = () => Neo.app({
    mainView: GridTreeContentSizedViewport,
    name    : 'Neo.test.playwright.GridTreeContentSized'
});
