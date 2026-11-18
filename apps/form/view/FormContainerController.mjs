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
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        this.component.on({
            fieldChange    : data => console.log('fieldChange'    , data),
            fieldFocusLeave: data => console.log('fieldFocusLeave', data),
            fieldUserChange: data => console.log('fieldUserChange', data)
        })
    }

    /**
     * @param {Object} data
     */
    onNextPageButtonClick(data) {
        this.getStateProvider().data.activeIndex++;
    }

    /**
     * @param {Object} data
     */
    onPrevPageButtonClick(data) {
        this.getStateProvider().data.activeIndex--;
    }

    /**
     * @summary Stores the form's submit values in localStorage under `neo-form`.
     * @param {Object} data
     */
    async onSaveButtonClick(data) {
        let me         = this,
            form       = me.getReference('main-form'),
            formValues = await form.getSubmitValues();

        Neo.main.addon.LocalStorage.updateLocalStorageItem({
            key     : 'neo-form',
            value   : JSON.stringify(formValues),
            windowId: me.windowId
        })
    }
}

export default Neo.setupClass(FormContainerController);
