import MainStore from './MainStore.mjs';
import Model     from '../../../src/model/Component.mjs';

/**
 * @class Neo.examples.model.table.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.table.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.model.table.MainContainerModel',
        /**
         * @member {Object} stores
         */
        stores: {
            main: MainStore
        }
    }
}

export default Neo.setupClass(MainContainerModel);
