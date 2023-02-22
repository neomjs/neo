import Component from '../../../src/controller/Component.mjs';

/**
 * @class Form.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Form.view.ViewportController'
         * @protected
         */
        className: 'Form.view.ViewportController'
    }

    /**
     * @param {Object} data
     */
    async onValidateAllPagesButtonClick(data) {
        let me         = this,
            form       = me.getReference('main-form'),
            isValid    = await form.validate(),
            formValues = await form.getValues();

        console.log({isValid, formValues});
    }

    /**
     * @param {Object} data
     */
    async onValidatePageButtonClick(data) {
        let me             = this,
            model          = me.getModel(),
            activeIndex    = model.data.activeIndex,
            pagesContainer = me.getReference('pages-container'),
            store          = model.getStore('sideNav'),
            activeCard     = pagesContainer.items[activeIndex],
            listIndex      = me.getReference('side-nav').getActiveIndex(activeIndex),
            isValid        = await activeCard.validate(),
            formValues     = await activeCard.getValues();

        console.log(`Current page: ${activeIndex + 1}`, formValues);

        store.getAt(listIndex).isValid = isValid;
    }
}

Neo.applyClassConfig(ViewportController);

export default ViewportController;
