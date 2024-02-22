import TreeList       from '../../../src/tree/List.mjs';
import TutorialsStore from '../store/Tutorials.mjs';

/**
 * @class Docs.view.TutorialsTreeList
 * @extends Neo.tree.List
 */
class TutorialsTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='Docs.view.TutorialsTreeList'
         * @protected
         */
        className: 'Docs.view.TutorialsTreeList',
        /**
         * @member {String} ntype='tutorials-treelist'
         * @protected
         */
        ntype: 'tutorials-treelist',
        /**
         * @member {String[]} cls=['docs-tutorials-treelist']
         */
        cls: ['docs-tutorials-treelist'],
        /**
         * @member {Neo.data.Store|null} store=TutorialsStore
         * @protected
         */
        store: TutorialsStore
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Xhr.promiseJson({
            url: '../../docs/tutorials/tutorials.json'
        }).then(data => {
            me.store.data = data.json;
            me.createItems(null, me.getListItemsRoot(), 0);
            me.update();
        });
    }
}

Neo.setupClass(TutorialsTreeList);

export default TutorialsTreeList;
