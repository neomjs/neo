import Store from '../../src/data/Store.mjs';

/**
 * @summary A small music library for the tree list: artists hold albums, albums hold tracks, each a record linked to
 * its folder by `parentId`. The names are invented. The icon follows the level: an artist is a root folder, an album a
 * nested one, a track a leaf.
 * @class Neo.examples.tree.LibraryStore
 * @extends Neo.data.Store
 */
class LibraryStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.tree.LibraryStore'
         * @protected
         */
        className: 'Neo.examples.tree.LibraryStore',
        /**
         * @member {Object} model
         */
        model: {
            fields: [
                {name: 'collapsed', type: 'Boolean', defaultValue: true},
                {name: 'duration',  type: 'Integer', defaultValue: 0},
                {name: 'iconCls',   type: 'String',  calculate: data => data.isLeaf ? 'tree-track' : data.parentId ? 'tree-album' : 'tree-artist'},
                {name: 'id',        type: 'String'},
                {name: 'isLeaf',    type: 'Boolean', defaultValue: true},
                {name: 'name',      type: 'String'},
                {name: 'parentId',  type: 'String',  defaultValue: null}
            ]
        },
        /**
         * Tracks carry their length in seconds
         * @member {Object[]} data
         */
        data: [
            {id: 'lanterns',         name: 'The Paper Lanterns', isLeaf: false, collapsed: false},
            {id: 'lanterns-ferry',   name: 'Night Ferry',        isLeaf: false, collapsed: false, parentId: 'lanterns'},
            {id: 'lanterns-ferry-1', name: 'Harbour Lights',     duration: 222, parentId: 'lanterns-ferry'},
            {id: 'lanterns-ferry-2', name: 'Northbound',         duration: 245, parentId: 'lanterns-ferry'},
            {id: 'lanterns-ferry-3', name: 'Salt and Smoke',     duration: 198, parentId: 'lanterns-ferry'},
            {id: 'lanterns-tide',    name: 'Low Tide',           isLeaf: false, parentId: 'lanterns'},
            {id: 'lanterns-tide-1',  name: 'Undertow',           duration: 261, parentId: 'lanterns-tide'},
            {id: 'lanterns-tide-2',  name: 'Glass Bottles',      duration: 178, parentId: 'lanterns-tide'},
            {id: 'lanterns-tide-3',  name: 'Last Bus Home',      duration: 227, parentId: 'lanterns-tide'},
            {id: 'okafor',           name: 'Mira Okafor',        isLeaf: false},
            {id: 'okafor-hours',     name: 'Small Hours',        isLeaf: false, parentId: 'okafor'},
            {id: 'okafor-hours-1',   name: 'Kettle Song',        duration: 185, parentId: 'okafor-hours'},
            {id: 'okafor-hours-2',   name: 'Window Seat',        duration: 213, parentId: 'okafor-hours'},
            {id: 'okafor-hours-3',   name: 'Small Hours',        duration: 252, parentId: 'okafor-hours'},
            {id: 'copper',           name: 'Copper and Pine',    isLeaf: false},
            {id: 'copper-field',     name: 'Field Recordings',   isLeaf: false, parentId: 'copper'},
            {id: 'copper-field-1',   name: 'Morning Frost',      duration: 230, parentId: 'copper-field'},
            {id: 'copper-field-2',   name: 'Barn Dance',         duration: 164, parentId: 'copper-field'},
            {id: 'copper-field-3',   name: 'Long Road',          duration: 301, parentId: 'copper-field'},
            {id: 'copper-embers',    name: 'Embers',             isLeaf: false, parentId: 'copper'},
            {id: 'copper-embers-1',  name: 'Embers',             duration: 209, parentId: 'copper-embers'},
            {id: 'copper-embers-2',  name: 'Two Rivers',         duration: 256, parentId: 'copper-embers'},
            {id: 'static',           name: 'Velvet Static',      isLeaf: false},
            {id: 'static-signal',    name: 'Signal',             isLeaf: false, parentId: 'static'},
            {id: 'static-signal-1',  name: 'Static Bloom',       duration: 192, parentId: 'static-signal'},
            {id: 'static-signal-2',  name: 'Radio Silence',      duration: 238, parentId: 'static-signal'},
            {id: 'static-signal-3',  name: 'Satellite',          duration: 280, parentId: 'static-signal'}
        ]
    }
}

export default Neo.setupClass(LibraryStore);
