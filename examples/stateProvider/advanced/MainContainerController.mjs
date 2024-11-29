import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.stateProvider.advanced.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onAddButtonTextfieldButtonClick(data) {
        let me = this;

        data.component.disabled = true;

        me.getReference('content-container').insert(2, {
            items: [{
                ntype     : 'textfield',
                flex      : 'none',
                labelText : 'data.button3Text:',
                labelWidth: 150,
                width     : 300,

                bind: {
                    value: data => data.button3Text
                },

                listeners: {
                    change: 'onTextField3Change'
                }
            }, {
                ntype    : 'displayfield',
                labelText: 'Button3 formatter:',
                style    : {marginLeft: '2em'},
                value    : '${data.button3Text}',
                width    : 600
            }]
        });

        me.getReference('header-toolbar').add({
            handler     : me.onButton3Click,
            handlerScope: me,
            iconCls     : 'fa fa-user',
            style       : {marginLeft: '10px'},

            bind: {
                text: data => `${data.button3Text}`
            }
        })
    }

    /**
     * @param {Object} data
     */
    onButton1Click(data) {
        this.updateButton1Text('Button 1')
    }

    /**
     * @param {Object} data
     */
    onButton2Click(data) {
        this.updateButton2Text('Button 2')
    }

    /**
     * @param {Object} data
     */
    onButton3Click(data) {
        this.updateButton3Text('Button 3')
    }

    /**
     * @param {Object} data
     */
    onLogChildStateProviderIntoConsoleButtonClick(data) {
        console.log(this.getReference('panel').stateProvider)
    }

    /**
     * @param {Object} data
     */
    onLogMainStateProviderIntoConsoleButtonClick(data) {
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
     * @param {Object} data
     */
    onTextField3Change(data) {
        if (data.oldValue !== null) {
            this.updateButton3Text(data.value || '')
        }
    }

    /**
     * @param {String} value
     */
    updateButton1Text(value) {
        // test to access a child model instead to check if the data value bubbles up
        this.getReference('panel').getStateProvider().setData('button1Text', value)
    }

    /**
     * @param {String} value
     */
    updateButton2Text(value) {
        this.getReference('panel').getStateProvider().setData({
            button2Text: value
        })
    }

    /**
     * @param {String} value
     */
    updateButton3Text(value) {
        this.getStateProvider().data['button3Text'] = value
    }
}

export default Neo.setupClass(MainContainerController);
