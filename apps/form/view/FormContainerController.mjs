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
    async onSaveButtonClick(data) {
        let form       = this.getReference('main-form'),
            formValues = await form.getSubmitValues();

        Neo.main.addon.LocalStorage.updateLocalStorageItem({
            appName: this.component.appName,
            key    : 'neo-form',
            value  : JSON.stringify(formValues)
        })
    }
}

export default Neo.setupClass(FormContainerController);
