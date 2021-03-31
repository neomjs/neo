import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.inlineNoModel.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.inlineNoModel.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.model.inlineNoModel.MainContainerController',
        /**
         * @member {String} button1Text_='Button 1'
         */
        button1Text_: 'Button 1',
        /**
         * @member {String} button1Text_='Button 2'
         */
        button2Text_: 'Button 2'
    }}

    /**
     *
     * @param {Object} data
     */
    onButton1Click(data) {
        this.button1Text = 'Button 1';
    }

    /**
     *
     * @param {Object} data
     */
    onButton2Click(data) {
        this.button2Text = 'Button 2';
    }

    /**
     *
     * @param {Object} data
     */
    onTextField1Change(data) {
        if (data.oldValue !== null) {
            this.button1Text = data.value;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onTextField2Change(data) {
        if (data.oldValue !== null) {
            this.button2Text = data.value;
        }
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};
