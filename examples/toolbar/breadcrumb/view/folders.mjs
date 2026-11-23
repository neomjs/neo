/**
 * @summary A real hierarchy for the breadcrumb: folders of the engine's own repository, each with its route and a
 * line on what it holds. Each route ends with a '/', which `Neo.toolbar.Breadcrumb` expects.
 * @module Neo.examples.toolbar.breadcrumb.view.folders
 */
export default [
    {id: 1,  parentId: null, name: 'neo',       route: '/neo/',                    description: 'The engine\'s repository: its source, its runnable examples and its learning content.'},
    {id: 2,  parentId: 1,    name: 'src',       route: '/neo/src/',                description: 'The engine itself: components, data, layouts and the workers they run in.'},
    {id: 3,  parentId: 2,    name: 'button',    route: '/neo/src/button/',         description: 'Buttons, split buttons and the menus a button opens.'},
    {id: 4,  parentId: 2,    name: 'data',      route: '/neo/src/data/',           description: 'Stores, models and the tree store that hold an application\'s records.'},
    {id: 5,  parentId: 2,    name: 'grid',      route: '/neo/src/grid/',           description: 'The data grid: its columns, its rows and the buffered body that renders them.'},
    {id: 6,  parentId: 2,    name: 'menu',      route: '/neo/src/menu/',           description: 'Menus: a list of items, the submenus it opens and the floating context menu.'},
    {id: 7,  parentId: 2,    name: 'toolbar',   route: '/neo/src/toolbar/',        description: 'Toolbars: the base toolbar, this breadcrumb and the paging toolbar.'},
    {id: 8,  parentId: 1,    name: 'examples',  route: '/neo/examples/',           description: 'Runnable examples, one folder each, grouped as the Portal\'s examples section groups them.'},
    {id: 9,  parentId: 8,    name: 'menu',      route: '/neo/examples/menu/',      description: 'Menu examples: a list, a menu driven by a tree store and two context menus.'},
    {id: 10, parentId: 8,    name: 'toolbar',   route: '/neo/examples/toolbar/',   description: 'Toolbar examples: this breadcrumb and a paging toolbar.'},
    {id: 11, parentId: 1,    name: 'learn',     route: '/neo/learn/',              description: 'Guides, tutorials and the concepts behind the engine.'},
    {id: 12, parentId: 11,   name: 'guides',    route: '/neo/learn/guides/',       description: 'Guides to components, data handling and the multi-threaded core.'},
    {id: 13, parentId: 11,   name: 'tutorials', route: '/neo/learn/tutorials/',    description: 'Tutorials that build an application step by step.'},
    {id: 14, parentId: 12,   name: 'datahandling',     route: '/neo/learn/guides/datahandling/',     description: 'Collections, records and stores, and the grids, boards and schedulers that show them.'},
    {id: 15, parentId: 12,   name: 'uibuildingblocks', route: '/neo/learn/guides/uibuildingblocks/', description: 'Components, containers, layouts, dock layouts and templates: the pieces an application is built from.'}
];
