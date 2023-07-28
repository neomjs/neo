import Button    from '../src/button/Base.mjs';
import Container from '../src/container/Base.mjs';
import NeoArray  from '../src/util/Array.mjs';
import Panel     from '../src/container/Panel.mjs';
import Viewport  from '../src/container/Viewport.mjs';

/**
 * Base class for example Apps which should be configurable
 * @class Neo.examples.ConfigurationViewport
 * @extends Neo.container.Viewport
 * @abstract
 */
class ConfigurationViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.ConfigurationContainer'
         * @protected
         */
        className: 'Neo.examples.ConfigurationContainer',
        /**
         * @member {String} ntype='configuration-viewport'
         * @protected
         */
        ntype: 'configuration-viewport',
        /**
         * @member {Object} layout={ntype:'hbox', align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Number} configItemLabelWidth=150
         */
        configItemLabelWidth: 150,
        /**
         * @member {Number} configItemWidth=270
         */
        configItemWidth: 270,
        /**
         * @member {Number} configPanelFlex=1
         */
        configPanelFlex: 1,
        /**
         * @member {Number} configPanelMinWidth=350
         */
        configPanelMinWidth: 350,
        /**
         * @member {Neo.component.Base|null} exampleComponent=null
         */
        exampleComponent: null,
        /**
         * @member {Number} exampleComponentFlex=1
         */
        exampleComponentFlex: 2
    }

    /**
     *
     */
    onConstructed() {
        let me = this,
            theme;

        me.exampleComponent        = me.createExampleComponent();
        me.configurationComponents = me.createConfigurationComponents() || [];

        theme = me.exampleComponent.getTheme();

        me.items = [{
            module: Container,
            items : [me.exampleComponent],
            flex  : me.exampleComponentFlex,
            layout: 'base',
            style : {overflow: 'auto', padding: '20px'},
            ...me.exampleContainerConfig
        }, {
            module: Panel,
            cls   : ['neo-panel', 'neo-container', 'neo-configuration-panel'],
            flex  : me.configPanelFlex,
            style : {margin: '20px', minWidth: me.configPanelMinWidth},

            headers: [{
                dock : 'top',
                style: {borderLeft:0, borderRight:0, borderTop:0},
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
                    text   : theme === 'neo-theme-dark' ? 'Theme Light' : 'Theme Dark'
                }]
            }],

            items: [{
                module: Container,
                layout: {ntype: 'vbox'},
                style : {overflowY: 'auto', padding: '10px'},
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
                    text   : theme === 'neo-theme-dark' ? 'Theme Light' : 'Theme Dark',
                    width  : 100
                }, {
                    module : Button,
                    handler: me.logInstance.bind(me),
                    text   : 'Log Instance',
                    width  : 100
                }]
            }]
        }];

        super.onConstructed();
    }

    /**
     * Override this method to create the components to show inside the configuration container
     * @returns {Object[]|null}
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
     * @param {Object} data
     */
    logInstance(data) {
        console.log(this.exampleComponent);
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        this.exampleComponent[config] = opts.value;
    }

    /**
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

export default ConfigurationViewport;
