import Store     from '../../../src/data/TreeStore.mjs';
import MainModel from './MainModel.mjs';

/**
 * @class Neo.examples.grid.tree.MainStore
 * @extends Neo.data.TreeStore
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.tree.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.tree.MainStore',
        /**
         * @member {Neo.data.Model} model=MainModel
         */
        model: MainModel,
        /**
         * @member {Array} data
         */
        data: [
            { id: 'root-1', name: 'src', type: 'folder', isLeaf: false, collapsed: false },
            { id: 'child-1-1', parentId: 'root-1', name: 'component', type: 'folder', isLeaf: false, collapsed: true },
            { id: 'child-1-1-1', parentId: 'child-1-1', name: 'Base.mjs', type: 'file', isLeaf: true, size: '12 KB' },
            { id: 'child-1-1-2', parentId: 'child-1-1', name: 'Button.mjs', type: 'file', isLeaf: true, size: '8 KB' },
            { id: 'child-1-2', parentId: 'root-1', name: 'grid', type: 'folder', isLeaf: false, collapsed: false },
            { id: 'child-1-2-1', parentId: 'child-1-2', name: 'Container.mjs', type: 'file', isLeaf: true, size: '45 KB' },
            { id: 'child-1-2-2', parentId: 'child-1-2', name: 'Row.mjs', type: 'file', isLeaf: true, size: '20 KB' },
            { id: 'root-2', name: 'package.json', type: 'file', isLeaf: true, size: '2 KB' },
            { id: 'root-3', name: 'README.md', type: 'file', isLeaf: true, size: '5 KB' }
        ]
    }
}

export default Neo.setupClass(MainStore);
