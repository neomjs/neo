import TreeList from '../../../src/tree/List.mjs';
import ApiStore from '../store/Api.mjs';

/**
 * @class Docs.view.ApiTreeList
 * @extends Neo.tree.List
 */
class ApiTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='Docs.view.ApiTreeList'
         * @protected
         */
        className: 'Docs.view.ApiTreeList',
        /**
         * @member {String} ntype='api-treelist'
         * @protected
         */
        ntype: 'api-treelist',
        /**
         * @member {Neo.data.Store|null} store=ApiStore
         * @protected
         */
        store: ApiStore
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.store.load()
    }
}

export default Neo.setupClass(ApiTreeList);
