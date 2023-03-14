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
    async onSaveButtonClick(data) {
        let form       = this.getReference('main-form'),
            formValues = await form.getValues();

        Neo.main.addon.LocalStorage.updateLocalStorageItem({
            appName: this.component.AppName,
            key    : 'neo-form',
            value  : JSON.stringify(formValues)
        })
    }

    /**
     * @param {Object} data
     */
    async onValidateAllPagesButtonClick(data) {
        let me         = this,
            form       = me.getReference('main-form'),
            isValid    = await form.validate(),
            formValues = await form.getValues();

        console.log('All pages', {isValid, formValues});

        await me.updateRecordValidityState()
    }

    /**
     * @param {Object} data
     */
    async onValidatePageButtonClick(data) {
        let me          = this,
            activeIndex = me.getModel().data.activeIndex,
            activeCard  = me.getReference('pages-container').items[activeIndex],
            formValues  = await activeCard.getValues();

        await activeCard.validate();
        await me.updateRecordValidityState(activeIndex)

        console.log(`Current page: ${activeIndex + 1}`, formValues);
    }

    /**
     * Not passing a pageIndex validates all pages
     * @param {Number|null} [pageIndex]
     * @returns {Promise<void>}
     */
    async updateRecordValidityState(pageIndex=null) {
        let me             = this,
            model          = me.getModel(),
            pagesContainer = me.getReference('pages-container'),
            sideNav        = me.getReference('side-nav'),
            store          = model.getStore('sideNav'),
            i              = 0,
            len            = pagesContainer.items.length,
            isValid, listIndex, page;

        if (Neo.isNumber(pageIndex)) {
            i   = pageIndex;
            len = pageIndex + 1;
        }

        for (; i < len; i++) {
            page      = pagesContainer.items[i];
            listIndex = sideNav.getActiveIndex(i);
            isValid   = await page.isValid();

            store.getAt(listIndex).isValid = isValid;
        }
    }
}

Neo.applyClassConfig(ViewportController);

export default ViewportController;
