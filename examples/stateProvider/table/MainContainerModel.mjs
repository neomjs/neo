import MainStore from './MainStore.mjs';
import Model     from '../../../src/model/Component.mjs';

/**
 * @class Neo.examples.stateProvider.table.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.table.MainContainerModel'
         * @protected
         */
        className: 'Neo.examples.stateProvider.table.MainContainerModel',
        /**
         * @member {Object} stores
         */
        stores: {
            main: MainStore
        }
    }
}

export default Neo.setupClass(MainContainerModel);
