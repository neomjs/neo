import ApiModel from '../model/Api.mjs';
import Store    from '../../../src/data/Store.mjs';

/**
 * @class Docs.app.store.Api
 * @extends Neo.data.Store
 */
class Api extends Store {
    static config = {
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
        model: ApiModel,
        /**
         * @member {String} url='../../docs/output/structure.json'
         */
        url: '../../docs/output/structure.json'
    }
}

export default Neo.setupClass(Api);
