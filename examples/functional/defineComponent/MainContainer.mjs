import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MyFunctionalComponent from './Component.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.functional.defineComponent.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.functional.defineComponent.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module    : TextField,
            clearable : true,
            labelText : 'greeting',
            listeners : {change: me.onConfigChange.bind(me, 'greeting')},
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.greeting
        }]
    }

    /**
     * @returns {Neo.functional.Component}
     */
    createExampleComponent() {
        return {
            module  : MyFunctionalComponent,
            greeting: 'Hi'
        }
    }
}

export default Neo.setupClass(MainContainer);
