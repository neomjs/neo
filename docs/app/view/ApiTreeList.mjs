import TreeList from '../../../src/tree/List.mjs';

/**
 * @class Docs.view.ApiTreeList
 * @extends Neo.tree.List
 * @summary Displays a root-scoped projection of the Docs structure index owned by the root state provider.
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
         * The root state provider owns the bound navigation store.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false
    }
}

export default Neo.setupClass(ApiTreeList);
