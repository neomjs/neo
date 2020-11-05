import ApiModel from '../model/Api.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Docs.app.store.Api
 * @extends Neo.data.Store
 */
class Api extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.app.store.Api'
         * @protected
         */
        className: 'Docs.app.store.Api',
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