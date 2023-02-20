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
    onValidatePageButtonClick(data) {
        let me             = this,
            activeIndex    = me.getModel().data.activeIndex,
            pagesContainer = me.getReference('pages-container'),
            activeCard     = pagesContainer.items[activeIndex];

        console.log(`Current page: ${activeIndex + 1}`, activeCard.getValues());

        activeCard.validate();
    }
}

Neo.applyClassConfig(FormContainerController);

export default FormContainerController;
