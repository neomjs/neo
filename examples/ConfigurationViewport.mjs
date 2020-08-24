import Button                 from '../src/button.Base.mjs';
import {default as Container} from '../src/container/Base.mjs';
import NeoArray               from '../src/util/Array.mjs';
import Panel                  from '../src/container/Panel.mjs';
import Viewport               from '../src/container/Viewport.mjs';

/**
 * Base class for example Apps which should be configurable
 * @class Neo.examples.ConfigurationViewport
 * @extends Neo.container.Viewport
 * @abstract
 */
class ConfigurationViewport extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.ConfigurationContainer',
        ntype    : 'configuration-viewport',

        autoMount: true,
        layout   : {ntype: 'hbox', align: 'stretch'},

        /**
         * @member {Number} configItemLabelWidth=150
         */
        configItemLabelWidth: 150,
        /**
         * @member {Number} configItemWidth=270
         */
        configItemWidth: 270,
        /**
         * @member {Number} configItemWidth=270
         */
        configPanelFlex: 1,
        /**
         * @member {Neo.component.Base|null} exampleComponent=null
         */
        exampleComponent: null,
        /**
         * @member {Number} exampleComponentFlex=1
         */
        exampleComponentFlex: 2
    }}

    onConstructed() {
        let me = this;

        me.exampleComponent        = me.createExampleComponent();
        me.configurationComponents = me.createConfigurationComponents() || [];
        
        me.items = [{
            module: Container,
            items : [me.exampleComponent],
            flex  : me.exampleComponentFlex,
            layout: 'base',
            style : {padding: '20px'}
        }, {
            module: Panel,
            cls   : ['neo-panel', 'neo-container', 'neo-configuration-panel'],
            flex  : me.configPanelFlex,
            style : {margin: '20px'},

            containerConfig: {
                style: {overflowY: 'scroll'}
            },

            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    text : 'Configuration'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    module : Button,
                    handler: me.onSwitchTheme.bind(me),
                    id     : me.id + '__' + 'switchThemeButton',
                    text   : 'Theme Dark'
                }]
            }],

            items: [{
                module: Container,
                layout: {ntype: 'vbox'},
                style : {padding: '10px'},
                cls   : ['neo-configuration-panel-body'],
                itemDefaults: {
                    clearToOriginalValue: true,
                    labelWidth          : me.configItemLabelWidth,
                    width               : me.configItemWidth
                },

                items: [...me.configurationComponents, {
                    module : Button,
                    handler: me.onSwitchTheme.bind(me, 'cmp'),
                    id     : me.id + '_cmp_' + 'switchThemeButton',
                    style  : {marginTop: '20px'},
                    text   : 'Theme Dark',
                    width  : 100
                }, {
                    module : Button,
                    handler: (() => {console.log(me.exampleComponent);}),
                    text   : 'Log Instance',
                    width  : 100
                }]
            }]
        }];

        super.onConstructed();
    }

    /**
     * Override this method to create the components to show inside the configuration container
     * @returns {Neo.component.Base[]|null}
     */
    createConfigurationComponents() {
        return null;
    }

    /**
     * Override this method to create the component to show inside the current example
     * @returns {Neo.component.Base|null}
     */
    createExampleComponent() {
        return null;
    }

    /**
     *
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        this.exampleComponent[config] = opts.value;
    }

    /**
     *
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.exampleComponent[config] = value;
        }
    }

    /**
     *
     * @param {String} target
     */
    onSwitchTheme(target) {
        let me     = this,
            button = Neo.getComponent(me.id + (target !== 'cmp' ? '__' : '_cmp_') + 'switchThemeButton'),
            cls    = target === 'cmp' ? me.exampleComponent.cls : me.cls;

        if (button.text === 'Theme Light') {
            button.text = 'Theme Dark';
            NeoArray.remove(cls, 'neo-theme-dark');
            NeoArray.add(cls, 'neo-theme-light');
        } else {
            button.text = 'Theme Light';
            NeoArray.remove(cls, 'neo-theme-light');
            NeoArray.add(cls, 'neo-theme-dark');
        }

        if (target === 'cmp') {
            me.exampleComponent.cls = cls;
        } else {
            me.cls = cls;
        }
    }
}

Neo.applyClassConfig(ConfigurationViewport);

export {ConfigurationViewport as default};