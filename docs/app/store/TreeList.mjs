import Store         from '../../../src/data/Store.mjs';
import TreeListModel from '../model/TreeList.mjs';

/**
 * @class Docs.store.TreeList
 * @extends Neo.data.Store
 */
class TreeList extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.collection.Base'
         * @protected
         */
        className: 'Docs.store.TreeList',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Docs.model.TreeList} model=TreeListModel
         */
        model: TreeListModel
    }}
}

Neo.applyClassConfig(TreeList);

export {TreeList as default};