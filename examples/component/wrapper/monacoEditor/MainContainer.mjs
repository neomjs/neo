import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import MonacoEditor          from '../../../../src/component/wrapper/MonacoEditor.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.component.wrapper.monacoEditor.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.wrapper.monacoEditor.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 300,
            minValue : 30,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 100,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    /**
     * @returns {Neo.component.Base}
     */
    createExampleComponent() {
        return Neo.create({
            module: MonacoEditor,
            height: 400,
            style : {backgroundColor: 'blue'},
            width : 400
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
