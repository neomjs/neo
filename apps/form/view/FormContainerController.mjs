import Component from '../../../src/controller/Component.mjs';

/**
 * @class Form.view.FormContainerController
 * @extends Neo.controller.Component
 */
class FormContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Form.view.FormContainerController'
         * @protected
         */
        className: 'Form.view.FormContainerController'
    }

    /**
     * @param {Object} data
     */
    onNextPageButtonClick(data) {
        this.getModel().data.activeIndex++;
    }

    /**
     * @param {Object} data
     */
    onPrevPageButtonClick(data) {
        this.getModel().data.activeIndex--;
    }

    /**
     * @param {Object} data
     */
    onSaveButtonClick(data) {
        console.log('onSaveButtonClick');
    }
}

Neo.applyClassConfig(FormContainerController);

export default FormContainerController;
