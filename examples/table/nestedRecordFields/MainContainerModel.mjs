import Model from '../../../src/model/Component.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.nestedRecordFields.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.table.nestedRecordFields.MainContainerModel',
        /**
         * @member {Object} stores
         */
        stores: {
            countries: {
                module  : Store,
                autoLoad: true,
                url     : '../../../resources/examples/data/countries.json',

                model: {
                    keyProperty: 'code',

                    fields: [
                        {name: 'code'},
                        {name: 'name'}
                    ]},
            }
        }
    }
}

export default Neo.setupClass(MainContainerModel);
