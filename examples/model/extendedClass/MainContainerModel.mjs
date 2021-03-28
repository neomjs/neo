import Component from '../../../src/model/Component.mjs';

/**
 * @class ComponentModelExample.MainContainerModel
 * @extends Neo.controller.Component
 */
class MainContainerModel extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='ComponentModelExample.MainContainerModel'
         * @protected
         */
        className: 'ComponentModelExample.MainContainerModel',
        /**
         * @member {String} ntype='main-container-model'
         * @protected
         */
        ntype: 'main-container-model',
        /**
         * @member {Object} data
         */
        data: {
            button1Text: 'Button 1',
            button2Text: 'Button 2'
        }
    }}
}

Neo.applyClassConfig(MainContainerModel);

export {MainContainerModel as default};
