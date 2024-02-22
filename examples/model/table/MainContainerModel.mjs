import Component from '../../../src/model/Component.mjs';
import MainStore from './MainStore.mjs';

/**
 * @class Neo.examples.model.table.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
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

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
