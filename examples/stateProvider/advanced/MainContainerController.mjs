import Controller from '../../../src/controller/Component.mjs';

/**
 * Controller for the advanced StateProvider example.
 * This class contains the logic for handling user interactions and demonstrates different
 * ways to update and interact with hierarchical state providers.
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
     * Dynamically adds a third button and textfield to the view.
     * This demonstrates that components added at runtime can still connect to the
     * existing state provider hierarchy.
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
     * Resets the value of button1Text.
     * @param {Object} data
     */
    onButton1Click(data) {
        this.updateButton1Text('Button 1')
    }

    /**
     * Resets the value of button2Text.
     * @param {Object} data
     */
    onButton2Click(data) {
        this.updateButton2Text('Button 2')
    }

    /**
     * Resets the value of button3Text.
     * @param {Object} data
     */
    onButton3Click(data) {
        this.updateButton3Text('Button 3')
    }

    /**
     * Logs the child (Panel) state provider instance to the console.
     * @param {Object} data
     */
    onLogChildStateProviderIntoConsoleButtonClick(data) {
        console.log(this.getReference('panel').stateProvider)
    }

    /**
     * Logs the main (Viewport) state provider instance to the console.
     * @param {Object} data
     */
    onLogMainStateProviderIntoConsoleButtonClick(data) {
        console.log(this.getStateProvider())
    }

    /**
     * Handles the change event from the first textfield and updates the state.
     * @param {Object} data Event data
     */
    onTextField1Change(data) {
        if (data.oldValue !== null) {
            this.updateButton1Text(data.value || '')
        }
    }

    /**
     * Handles the change event from the second textfield and updates the state.
     * @param {Object} data Event data
     */
    onTextField2Change(data) {
        if (data.oldValue !== null) {
            this.updateButton2Text(data.value || '')
        }
    }

    /**
     * Handles the change event from the dynamically added third textfield.
     * @param {Object} data Event data
     */
    onTextField3Change(data) {
        if (data.oldValue !== null) {
            this.updateButton3Text(data.value || '')
        }
    }

    /**
     * This method demonstrates a key concept: updating a state property on a component
     * (`panel`) that does not own the property in its own StateProvider.
     *
     * The framework will automatically walk up the component tree to find the StateProvider
     * that *does* own `button1Text` (in this case, the MainContainer's provider) and update
     * the value there. This makes state updates predictable regardless of where they are initiated.
     * @param {String} value
     */
    updateButton1Text(value) {
        // By setting the state on the child panel, we test to ensure the data change
        // correctly bubbles up to the parent state provider that owns the property.
        this.getReference('panel').setState('button1Text', value)
    }

    /**
     * Updates the `button2Text` property. This method uses `setState` on the panel,
     * which owns `button2Text` in its own StateProvider. The update is therefore
     * handled locally by the panel's provider.
     * @param {String} value
     */
    updateButton2Text(value) {
        this.getReference('panel').setState({
            button2Text: value
        })
    }

    /**
     * Updates the `button3Text` property. This method demonstrates updating the state
     * by directly accessing the top-level state provider and modifying its `data` object.
     * This is a valid and highly performant way to update state.
     * @param {String} value
     */
    updateButton3Text(value) {
        this.getStateProvider().data['button3Text'] = value
    }
}

export default Neo.setupClass(MainContainerController);
