import Button       from '../src/button/Base.mjs';
import Container    from '../src/container/Base.mjs';
import {bindAppend} from '../src/util/Function.mjs';
import Panel        from '../src/container/Panel.mjs';
import Viewport     from '../src/container/Viewport.mjs';

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
        let me    = this,
            style = me.exampleContainerConfig?.style,
            theme;

        if (style) {
            delete me.exampleContainerConfig.style;
        }

        me.exampleComponent        = me.createExampleComponent();
        me.configurationComponents = me.createConfigurationComponents() || [];

        theme = me.exampleComponent.getTheme();

        me.items = [{
            module: Container,
            items : [me.exampleComponent],
            flex  : me.exampleComponentFlex,
            layout: 'base',
            style : {overflow: 'auto', padding: '20px', ...style},
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
                layout: {ntype: 'vbox', align: null},
                style : {overflowY: 'auto', padding: '10px'},
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
     * @param {Object} data
     * @param {String} target
     */
    onSwitchTheme(data, target) {
        let me          = this,
            button      = data.component,
            countThemes = themes.length,
            futureIndex, newTheme, oldIndex, oldTheme, themeIndex;

        themes.forEach((theme, index) => {
            if (button.text === theme.label) {
                newTheme   = theme.name;
                themeIndex = index;
            }
        });

        futureIndex = (themeIndex + countThemes +1) % countThemes;
        oldIndex    = (themeIndex + countThemes -1) % countThemes;
        oldTheme    = themes[oldIndex].name;


        button.text = themes[futureIndex].label;

        if (target === 'cmp') {
            me.exampleComponent.theme = newTheme;
        } else {
            Neo.applyDeltas(me.appName, {
                id : me.id, // the viewport can get imported into other apps, so an id makes sense for scoping
                cls: {
                    add   : [newTheme],
                    remove: [oldTheme]
                }
            })
        }
    }
}

Neo.setupClass(ConfigurationViewport);

export default ConfigurationViewport;
