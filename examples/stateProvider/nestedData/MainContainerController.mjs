import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.stateProvider.nestedData.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.nestedData.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.nestedData.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onButton1Click(data) {
        this.updateButton1Text('Nils')
    }

    /**
     * @param {Object} data
     */
    onButton2Click(data) {
        this.updateButton2Text('Dehl')
    }

    /**
     * @param {Object} data
     */
    onLogStateProviderIntoConsoleButtonClick(data) {
        console.log(this.getStateProvider())
    }

    /**
     * @param {Object} data
     */
    onTextField1Change(data) {
        if (data.oldValue !== null) {
            this.updateButton1Text(data.value || '')
        }
    }

    /**
     * @param {Object} data
     */
    onTextField2Change(data) {
        if (data.oldValue !== null) {
            this.updateButton2Text(data.value || '')
        }
    }

    /**
     * @param {String} value
     */
    updateButton1Text(value) {
        this.getStateProvider().data.user.details.firstname = value
    }

    /**
     * @param {String} value
     */
    updateButton2Text(value) {
        this.setState({
            'user.details.lastname': value
        })
    }
}

export default Neo.setupClass(MainContainerController);
