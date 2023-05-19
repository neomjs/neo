import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.container.dialog.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.container.dialog.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.container.dialog.MainContainerController'
    }

    /**
     * 
     * @param {*} config 
     */
    construct(config) {
        super.construct(config);
        console.log('I am here')
    }

    /**
     * 
     * @param {Object} data 
     */
    onButtonClick(data) {
        console.log(data);
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
