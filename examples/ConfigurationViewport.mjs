import Button       from '../src/button/Base.mjs';
import Container    from '../src/container/Base.mjs';
import Panel        from '../src/container/Panel.mjs';
import Viewport     from '../src/container/Viewport.mjs';
import {bindAppend} from '../src/util/Function.mjs';

// add custom themes here
const themes = [
    {name: 'neo-theme-light',     label: 'Theme Light'},
    {name: 'neo-theme-dark',      label: 'Theme Dark'},
    {name: 'neo-theme-neo-light', label: 'Theme Neo-Light'}
]

/**
 * Base class for example Apps which should be configurable
 * @class Neo.examples.ConfigurationViewport
 * @extends Neo.container.Viewport
 * @abstract
 */
class ConfigurationViewport extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.ConfigurationViewport'
         * @protected
         */
        className: 'Neo.examples.ConfigurationViewport',
        /**
         * @member {String} ntype='configuration-viewport'
         * @protected
         */
        ntype: 'configuration-viewport',
        /**
         * @member {String[]} baseCls=['neo-examples-configuration-viewport','neo-viewport']
         */
        baseCls: ['neo-examples-configuration-viewport', 'neo-viewport'],
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
         * @member {Number} configPanelMaxWidth=null
         */
        configPanelMaxWidth: null,
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
        exampleComponentFlex: 2,
        /**
         * @member {Object} layout={ntype:'hbox', align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * Override this method to create the components to show inside the configuration container.
     * The method can optionally be async => Use this for functional components,
     * where you want to subscribe controls to "classic" components inside functional components.
     * @see:Neo.examples.functional.hostComponent.MainContainer
     * @returns {Promise<Object[]>|Object[]|null}
     */
    async createConfigurationComponents() {
        return null
    }

    /**
     * Override this method to create the component to show inside the current example
     * @returns {Object|Neo.component.Base|null}
     */
    createExampleComponent() {
        return null
    }

    /**
     * @param {Object} data
     */
    logInstance(data) {
        console.log(this.exampleComponent)
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        this.exampleComponent[config] = opts.value
    }

    /**
     *
     */
    async onConstructed() {
        let me    = this,
            style = me.exampleContainerConfig?.style,
            exampleComponentType, theme;

        if (style) {
            delete me.exampleContainerConfig.style
        }

        me.exampleComponent = me.createExampleComponent();

        exampleComponentType = Neo.typeOf(me.exampleComponent);

        if (exampleComponentType === 'NeoClass' || exampleComponentType === 'Object') {
            me.exampleComponent = Neo.create(me.exampleComponent)
        }

        me.configurationComponents = await me.createConfigurationComponents() || [];

        theme = me.exampleComponent.getTheme?.() || 'neo-theme-light';

        me.items = [{
            module: Container,
            cls   : ['neo-example-container'],
            items : [me.exampleComponent],
            flex  : me.exampleComponentFlex,
            layout: 'base',
            style : {overflow: 'auto', padding: '20px', ...style},
            ...me.exampleContainerConfig
        }, {
            module: Panel,
            cls   : ['neo-panel', 'neo-container', 'neo-configuration-panel'],
            flex  : me.configPanelFlex,

            style: {
                maxWidth: me.configPanelMaxWidth + 'px',
                margin  : '20px',
                minWidth: me.configPanelMinWidth + 'px'
            },

            headers: [{
                cls  : ['neo-configuration-header-toolbar'],
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
                    text   : theme === 'neo-theme-dark' ? 'Theme Light' : 'Theme Dark'
                }]
            }],

            items: [{
                module: Container,
                layout: {ntype: 'vbox', align: null},
                cls   : ['neo-configuration-panel-body'],
                itemDefaults: {
                    clearToOriginalValue: true,
                    labelWidth          : me.configItemLabelWidth,
                    width               : me.configItemWidth
                },

                items: [...me.configurationComponents, {
                    module : Button,
                    handler: bindAppend(me.onSwitchTheme, me, 'cmp'),
                    style  : {marginTop: '20px'},
                    text   : theme === 'neo-theme-dark' ? 'Theme Light' : 'Theme Dark',
                    width  : 130
                }, {
                    module : Button,
                    handler: me.logInstance.bind(me),
                    text   : 'Log Instance',
                    width  : 130
                }]
            }]
        }];

        super.onConstructed()
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.exampleComponent[config] = value
        }
    }

    /**
     * @param {Object} data
     * @param {String} target
     */
    onSwitchTheme(data, target) {
        let me          = this,
            button      = data.component,
            countThemes = themes.length,
            futureIndex, newTheme, themeIndex;

        themes.forEach((theme, index) => {
            if (button.text === theme.label) {
                newTheme   = theme.name;
                themeIndex = index;
            }
        });

        futureIndex = (themeIndex + countThemes +1) % countThemes;

        button.text = themes[futureIndex].label;

        if (target === 'cmp') {
            me.exampleComponent.theme = newTheme
        } else {
            me.app.mainView.theme = newTheme
        }
    }
}

export default Neo.setupClass(ConfigurationViewport);
