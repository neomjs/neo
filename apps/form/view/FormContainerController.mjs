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
            model          = me.getModel(),
            activeIndex    = model.data.activeIndex,
            pagesContainer = me.getReference('pages-container'),
            store          = model.getStore('sideNav'),
            activeCard     = pagesContainer.items[activeIndex],
            isValid        = activeCard.validate();

        console.log(`Current page: ${activeIndex + 1}`, activeCard.getValues());

        store.getAt(activeIndex).isValid = isValid;
    }
}

Neo.applyClassConfig(FormContainerController);

export default FormContainerController;
