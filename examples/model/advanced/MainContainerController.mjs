import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.model.advanced.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.advanced.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.model.advanced.MainContainerController'
    }}

    /**
     *
     * @param {Object} data
     */
    onAddButtonTextfieldButtonClick(data) {
        let me = this;

        data.component.disabled = true;

        me.getReference('content-container').insert(2, {
            ntype     : 'textfield',
            flex      : 'none',
            labelText : 'Button3 text:',
            labelWidth: 110,
            width     : 300,

            bind: {
                value: 'button3Text'
            },

            listeners: {
                change: me.onTextField3Change,
                scope : me
            }
        });

        me.getReference('header-toolbar').add({
            handler     : me.onButton3Click,
            handlerScope: me,
            iconCls     : 'fa fa-user',
            style       : {marginLeft: '10px'},

            bind: {
                text: 'button3Text'
            }
        });
    }

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
    onButton3Click(data) {console.log(this);
        this.updateButton3Text('Button 3');
    }

    /**
     *
     * @param {Object} data
     */
    onLogChildModelIntoConsoleButtonClick(data) {
        console.log(this.getReference('panel').model);
    }

    /**
     *
     * @param {Object} data
     */
    onLogMainModelIntoConsoleButtonClick(data) {
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
     * @param {Object} data
     */
    onTextField3Change(data) {
        if (data.oldValue !== null) {
            this.updateButton3Text(data.value);
        }
    }

    /**
     *
     * @param {String} value
     */
    updateButton1Text(value) {
        // test to access a child model instead to check if the data value bubbles up
        this.getReference('panel').getModel().setData('button1Text', value);

        // of course a direct access will work as well
        // this.getModel().data['button1Text'] = value;
    }

    /**
     *
     * @param {String} value
     */
    updateButton2Text(value) {
        this.getReference('panel').getModel().setData({
            button2Text: value
        });
    }

    /**
     *
     * @param {String} value
     */
    updateButton3Text(value) {
        this.getModel().data['button3Text'] = value;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};
