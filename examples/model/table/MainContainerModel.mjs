import Component from '../../../src/model/Component.mjs';
import MainStore from './MainStore.mjs';

/**
 * @class Neo.examples.model.table.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static getConfig() {return {
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
    }}
}

Neo.applyClassConfig(MainContainerModel);

export {MainContainerModel as default};