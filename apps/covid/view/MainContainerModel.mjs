import Component from '../../../src/model/Component.mjs';

/**
 * @class Covid.view.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.MainContainerModel'
         * @protected
         */
        className: 'Covid.view.MainContainerModel',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {String|null} data.country=null
             */
            country: null
        }
    }}
}

Neo.applyClassConfig(MainContainerModel);

export {MainContainerModel as default};
