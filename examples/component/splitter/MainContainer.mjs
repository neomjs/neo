import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Splitter              from '../../../src/component/Splitter.mjs';

/**
 * @summary An interactive example demonstrating the Neo.component.Splitter.
 *
 * This class creates a viewport that showcases the `Neo.component.Splitter`, which allows for the resizing
 * of adjacent components. It extends the `ConfigurationViewport` to provide a side-by-side view, with the
 * live component example on one side and a configuration panel on the other. The panel allows for the
 * dynamic modification of the splitter's properties, such as its orientation (`direction`), to demonstrate
 * its reactivity and flexibility.
 *
 * This class is a practical demonstration of how to compose UI and handle user interaction to dynamically
 * update component configurations.
 *
 * @class Neo.examples.component.splitter.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 * @see Neo.component.Splitter
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.splitter.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.splitter.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Number} configItemLabelWidth=110
         */
        configItemLabelWidth: 110,
        /**
         * @member {Number} configItemWidth=230
         */
        configItemWidth: 230,
        /**
         * The layout for the viewport, arranging the configuration panel and the example component horizontally.
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * Overridden from `ConfigurationViewport`. This method defines the set of form fields that will be
     * displayed in the configuration panel. These fields are bound to the properties of the example
     * component, allowing for real-time manipulation of the splitter's container and the splitter itself.
     * @returns {Object[]} An array of component configuration objects.
     */
    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1000,
            minValue : 200,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.direction === 'horizontal',
            labelText: 'horizontal',
            listeners: {change: me.switchDirection.bind(me)},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1000,
            minValue : 200,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    /**
     * Overridden from `ConfigurationViewport`. This method creates the actual component instance to be
     * demonstrated. It sets up a container with two child components separated by a `Splitter`, which
     * is the focus of this example.
     * @returns {Object} A container config object.
     */
    createExampleComponent() {
        return Neo.ntype({
            ntype : 'container',
            height: 600,
            layout: {ntype: 'hbox', align: 'stretch'},
            style : {border: '1px solid var(--panel-border-color)'},
            width : 600,
            items : [{
                ntype: 'component'
            }, {
                module: Splitter
            }, {
                ntype: 'component'
            }]
        })
    }

    /**
     * A debugging helper method to log the instance of the splitter component to the console.
     * This can be wired up to a button in the configuration panel for easy inspection.
     */
    logInstance() {
        console.log(this.exampleComponent.down({module: Splitter}))
    }

    /**
     * Handles the change event from the 'horizontal' checkbox in the configuration panel.
     * This method demonstrates how to dynamically alter the behavior and layout of components in response
     * to user input. It changes both the splitter's `direction` and the parent container's `layout`
     * to ensure the UI correctly reflects the new orientation.
     * @param {Object} data The event data from the checkbox change event.
     * @param {Boolean} data.value The new checked state of the checkbox.
     */
    switchDirection(data) {
        this.exampleComponent.down({module: Splitter}).direction = data.value ? 'horizontal' : 'vertical';

        this.exampleComponent.layout = {
            ntype: data.value ? 'vbox' : 'hbox',
            align: 'stretch'
        }
    }
}

export default Neo.setupClass(MainContainer);
