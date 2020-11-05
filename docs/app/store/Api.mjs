import ApiModel from '../model/Api.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Docs.store.Api
 * @extends Neo.data.Store
 */
class Api extends Store {
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
         * @member {Neo.data.Model} model=ApiModel
         */
        model: ApiModel
    }}
}

Neo.applyClassConfig(Api);

export {Api as default};