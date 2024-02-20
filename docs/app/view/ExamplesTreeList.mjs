import ExamplesStore from '../store/Examples.mjs';
import TreeList      from '../../../src/tree/List.mjs';

/**
 * @class Docs.view.ExamplesTreeList
 * @extends Neo.tree.List
 */
class ExamplesTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='Docs.view.ExamplesTreeList'
         * @protected
         */
        className: 'Docs.view.ExamplesTreeList',
        /**
         * @member {String} ntype='examples-treelist'
         * @protected
         */
        ntype: 'examples-treelist',
        /**
         * @member {String[]} cls=['docs-examples-treelist']
         */
        cls: ['docs-examples-treelist'],
        /**
         * @member {Neo.data.Store|null} store=ExamplesStore
         * @protected
         */
        store: ExamplesStore
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Xhr.promiseJson({
            url: '../../docs/examples.json'
        }).then(data => {
            me.store.data = data.json;
            me.createItems(null, me.getListItemsRoot(), 0);
            me.update();
        });
    }
}

Neo.setupClass(ExamplesTreeList);

export default ExamplesTreeList;
