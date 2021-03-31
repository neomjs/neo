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
     * Triggered after the button1Text config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetButton1Text(value, oldValue) {
        if (oldValue !== undefined) { // we can not use the initial state change, since the view is not parsed yet
            this.updateReferences(value, 'button1', 'textfield1');
        }
    }

    /**
     * Triggered after the button2Text config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetButton2Text(value, oldValue) {
        if (oldValue !== undefined) { // we can not use the initial state change, since the view is not parsed yet
            this.updateReferences(value, 'button2', 'textfield2');
        }
    }

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
        this.button1Text = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onTextField2Change(data) {
        this.button2Text = data.value;
    }

    /**
     *
     */
    onViewParsed() {
        let me = this;

        me.updateReferences(me.button1Text, 'button1', 'textfield1');
        me.updateReferences(me.button2Text, 'button2', 'textfield2');
    }

    /**
     *
     * @param {String} value
     * @param {String} buttonReference
     * @param {String} textfieldReference
     */
    updateReferences(value, buttonReference, textfieldReference) {
        this.getReference(buttonReference)   .text  = value;
        this.getReference(textfieldReference).value = value;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};