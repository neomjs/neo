import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.extendedClass.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.extendedClass.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.model.extendedClass.MainContainerController'
    }}

    /**
     *
     * @param {Object} data
     */
    onButton1Click(data) {
        this.updateButton1Text('Button 1');
    }

    /**
     *
     * @param {Object} data
     */
    onButton2Click(data) {
        this.updateButton2Text('Button 2');
    }

    /**
     *
     * @param {Object} data
     */
    onLogModelIntoConsoleButtonClick(data) {
        console.log(this.getModel());
    }

    /**
     *
     * @param {Object} data
     */
    onTextField1Change(data) {
        if (data.oldValue !== null) {
            this.updateButton1Text(data.value);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onTextField2Change(data) {
        if (data.oldValue !== null) {
            this.updateButton2Text(data.value);
        }
    }

    /**
     *
     * @param {String} value
     */
    updateButton1Text(value) {
        this.getModel().data['button1Text'] = value;
    }

    /**
     *
     * @param {String} value
     */
    updateButton2Text(value) {
        this.getModel().setData({
            button2Text: value
        });
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};
