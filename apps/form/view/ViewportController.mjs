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
    onValidatePageButtonClick(data) {
        let me             = this,
            model          = me.getModel(),
            activeIndex    = model.data.activeIndex,
            pagesContainer = me.getReference('pages-container'),
            store          = model.getStore('sideNav'),
            activeCard     = pagesContainer.items[activeIndex],
            listIndex      = me.getReference('side-nav').getActiveIndex(activeIndex),
            isValid        = activeCard.validate();

        console.log(`Current page: ${activeIndex + 1}`, activeCard.getValues());

        store.getAt(listIndex).isValid = isValid;
    }
}

Neo.applyClassConfig(ViewportController);

export default ViewportController;
