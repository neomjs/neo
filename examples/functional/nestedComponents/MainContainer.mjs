import Button                from '../../../src/button/Base.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Component             from './Component.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @summary Applies a pair of values to the functional root using the ordinary set() API.
 * @class Neo.examples.functional.nestedComponents.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.functional.nestedComponents.MainContainer',
        configItemLabelWidth: 90,
        configItemWidth     : 300
    }

    /** @summary Batches both root configs; their children receive the same completed update. */
    applyValues() {
        this.exampleComponent.set({
            message: Neo.getComponent(this.id + '__message').value,
            value  : Neo.getComponent(this.id + '__value').value
        })
    }

    /**
     * @summary Creates editable drafts and an explicit apply action so the propagation is easy to follow.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        return [{
            module   : NumberField,
            id       : this.id + '__value',
            labelText: 'Value',
            value    : this.exampleComponent.value
        }, {
            module   : TextField,
            id       : this.id + '__message',
            labelText: 'Message',
            value    : this.exampleComponent.message
        }, {
            module : Button,
            text   : 'Apply root values',
            handler: this.applyValues.bind(this)
        }]
    }

    /**
     * @summary Creates the functional root inside the shared classic example viewport.
     * @returns {Object}
     */
    createExampleComponent() {
        return {module: Component}
    }
}

export default Neo.setupClass(MainContainer);
