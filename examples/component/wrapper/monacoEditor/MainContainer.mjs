import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import MonacoEditor          from '../../../../src/component/wrapper/MonacoEditor.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';

/**
 * @class Neo.examples.component.wrapper.monacoEditor.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.wrapper.monacoEditor.MainContainer',
        configItemLabelWidth: 170,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.contextmenu,
            labelText: 'contextmenu',
            listeners: {change: me.onConfigChange.bind(me, 'contextmenu')}
        }, {
            module        : Radio,
            checked       : me.exampleComponent.cursorBlinking === 'blink',
            hideValueLabel: false,
            labelText     : 'cursorBlinking',
            listeners     : {change: me.onRadioChange.bind(me, 'cursorBlinking', 'blink')},
            name          : 'cursorBlinking',
            style         : {marginTop: '10px'},
            valueLabelText: 'blink'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.cursorBlinking === 'expand',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'cursorBlinking', 'expand')},
            name          : 'cursorBlinking',
            valueLabelText: 'expand'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.cursorBlinking === 'phase',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'cursorBlinking', 'phase')},
            name          : 'cursorBlinking',
            valueLabelText: 'phase'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.cursorBlinking === 'smooth',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'cursorBlinking', 'smooth')},
            name          : 'cursorBlinking',
            valueLabelText: 'smooth'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.cursorBlinking === 'solid',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'cursorBlinking', 'solid')},
            name          : 'cursorBlinking',
            valueLabelText: 'solid'
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.domReadOnly,
            labelText: 'domReadOnly',
            listeners: {change: me.onConfigChange.bind(me, 'domReadOnly')},
            style    : {marginTop: '10px'}
        }, {
            module        : Radio,
            checked       : me.exampleComponent.editorTheme === 'hc-black',
            hideValueLabel: false,
            labelText     : 'editorTheme',
            listeners     : {change: me.onRadioChange.bind(me, 'editorTheme', 'hc-black')},
            name          : 'editorTheme',
            style         : {marginTop: '10px'},
            valueLabelText: 'hc-black'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.editorTheme === 'hc-light',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'editorTheme', 'hc-light')},
            name          : 'editorTheme',
            valueLabelText: 'hc-light'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.editorTheme === 'vs',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'editorTheme', 'vs')},
            name          : 'editorTheme',
            valueLabelText: 'vs'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.editorTheme === 'vs-dark',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'editorTheme', 'vs-dark')},
            name          : 'editorTheme',
            valueLabelText: 'vs-dark'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'fontSize',
            listeners: {change: me.onConfigChange.bind(me, 'fontSize')},
            maxValue : 30,
            minValue : 8,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.fontSize
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1000,
            minValue : 300,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.minimap.enabled,
            labelText: 'minimap',
            listeners: {change: me.onToggleMinimap.bind(me)},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.readOnly,
            labelText: 'readOnly',
            listeners: {change: me.onConfigChange.bind(me, 'readOnly')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.scrollBeyondLastLine,
            labelText: 'scrollBeyondLastLine',
            listeners: {change: me.onConfigChange.bind(me, 'scrollBeyondLastLine')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.showLineNumbers,
            labelText: 'showLineNumbers',
            listeners: {change: me.onConfigChange.bind(me, 'showLineNumbers')},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1000,
            minValue : 300,
            stepSize : 10,
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
            height: 500,
            value : ['function x() {', '\tconsole.log("Hello world!");', '}'],
            width : 500
        })
    }

    /**
     * @param {Object} data
     */
    onToggleMinimap(data) {
        this.exampleComponent.minimap = {
            enabled: data.value
        }
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
