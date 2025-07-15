import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MyFunctionalComponent from './Component.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.functional.hostComponent.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.functional.hostComponent.MainContainer',
        configItemLabelWidth: 120,
        configItemWidth     : 300,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    async createConfigurationComponents() {
        // Wait one micro task queue tick, to ensure the fn render Effect is done
        await Promise.resolve();

        const button = Neo.getComponent('myButtonModule');

        return [{
            module    : TextField,
            clearable : true,
            labelText : 'Button Text',
            style     : {marginTop: '10px'},
            value     : button.text,

            listeners : {
                change({value}) {
                    button.text = value
                }
            }
        }]
    }

    /**
     * @returns {Neo.functional.Component}
     */
    createExampleComponent() {
        return {
            module: MyFunctionalComponent
        }
    }
}

export default Neo.setupClass(MainContainer);
