import Button       from '../src/button/Base.mjs';
import Container    from '../src/container/Base.mjs';
import Panel        from '../src/container/Panel.mjs';
import Viewport     from '../src/container/Viewport.mjs';
import {bindAppend} from '../src/util/Function.mjs';

// Default themes
const themes = [
    {name: 'neo-theme-neo-dark',  label: 'Theme Neo-Dark'},
    {name: 'neo-theme-neo-light', label: 'Theme Neo-Light'},
    {name: 'neo-theme-light',     label: 'Theme Light'},
    {name: 'neo-theme-dark',      label: 'Theme Dark'}
];

/**
 * Base class for example Apps which should be configurable (workbench stage, inspector, reset)
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
         * @member {String[]} baseCls=['neo-examples-configuration-viewport','neo-viewport','neo-workbench']
         */
        baseCls: ['neo-examples-configuration-viewport', 'neo-viewport', 'neo-workbench'],
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
         * @member {Number|null} configPanelMaxWidth=null
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
         * @member {Number} exampleComponentFlex=2
         */
        exampleComponentFlex: 2,
        /**
         * @member {Object} layout={ntype:'hbox', align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * Categorizes a configuration item into one of: 'choices', 'text', 'sizes', 'flags', 'actions'
     * @param {Object} item
     * @returns {String}
     */
    classifyControl(item) {
        if (!item) return 'text';
        const mod       = item.module;
        const ntype     = item.ntype || mod?.prototype?.ntype || '';
        const className = mod?.prototype?.className || '';
        const label     = (item.labelText || item.name || '').toLowerCase();

        // Flags (checkboxes, switches)
        if (ntype === 'checkbox' || ntype === 'switch' || className.includes('CheckBox') || className.includes('Switch')) {
            return 'flags';
        }

        // Choices (radios, comboboxes, selects)
        if (ntype === 'radio' || ntype === 'combobox' || ntype === 'select' ||
            className.includes('Radio') || className.includes('ComboBox') || className.includes('Select') ||
            typeof item.valueLabel === 'string' || item.name === 'badgePosition' || item.name === 'labelPosition') {
            return 'choices';
        }

        // Sizes (numbers, ranges, dimension configs)
        if (ntype === 'numberfield' || ntype === 'rangeslider' ||
            className.includes('Number') || className.includes('Range') ||
            label.includes('width') || label.includes('height') || label.includes('size') ||
            label.includes('margin') || label.includes('padding') || label.includes('radius')) {
            return 'sizes';
        }

        // Actions (buttons)
        if (ntype === 'button' || className.includes('Button') || item.handler) {
            return 'actions';
        }

        // Text (textfields, textareas)
        return 'text';
    }

    /**
     * Groups inspector controls by type: choices, text, sizes, flags, actions
     * @param {Object[]} components
     * @returns {Object[]}
     */
    groupConfigurationComponents(components) {
        if (!Array.isArray(components) || components.length === 0) {
            return [];
        }

        const groups = {
            choices: [],
            text   : [],
            sizes  : [],
            flags  : [],
            actions: []
        };

        const groupOrder  = ['choices', 'text', 'sizes', 'flags', 'actions'];
        const groupLabels = {
            choices: 'Choices',
            text   : 'Text',
            sizes  : 'Sizes',
            flags  : 'Flags',
            actions: 'Actions'
        };

        components.forEach(item => {
            const groupKey = this.classifyControl(item);
            (groups[groupKey] || groups.text).push(item);
        });

        const result = [];
        groupOrder.forEach(key => {
            const list = groups[key];
            if (list.length > 0) {
                result.push({
                    ntype: 'label',
                    cls  : ['neo-inspector-group-title'],
                    text : groupLabels[key]
                });
                result.push(...list);
            }
        });

        return result;
    }

    /**
     * Checks if the example component requires wide/full-width stage layout
     * @returns {Boolean}
     */
    isWideComponent() {
        const cmp = this.exampleComponent;
        if (!cmp) return false;
        const cls   = (cmp.className || '').toLowerCase();
        const ntype = (cmp.ntype || '').toLowerCase();
        return cls.includes('grid') || cls.includes('table') || cls.includes('tab.') ||
               cls.includes('tabs') || cls.includes('tabheader') || cls.includes('canvas') ||
               cls.includes('gallery') || cls.includes('portal') ||
               ntype.includes('grid') || ntype.includes('table') || ntype.includes('tab');
    }

    /**
     * Override this method to create the components to show inside the configuration container.
     * The method can optionally be async => Use this for functional components,
     * where you want to subscribe controls to "classic" components inside functional components.
     * @see Neo.examples.functional.hostComponent.MainContainer
     * @returns {Promise<Object[]>|Object[]|null}
     */
    async createConfigurationComponents() {
        return null;
    }

    /**
     * Override this method to create the component to show inside the current example
     * @returns {Object|Neo.component.Base|null}
     */
    createExampleComponent() {
        return null;
    }

    /**
     * Returns the available themes for theme switching
     * @returns {Object[]}
     */
    getAvailableThemes() {
        const configured  = Neo.config.themes;
        const themeLabels = {
            'neo-theme-neo-dark' : 'Theme Neo-Dark',
            'neo-theme-neo-light': 'Theme Neo-Light',
            'neo-theme-light'    : 'Theme Light',
            'neo-theme-dark'     : 'Theme Dark',
            'neo-theme-cyberpunk': 'Theme Cyberpunk'
        };

        if (Array.isArray(configured) && configured.length > 0) {
            return configured.map(name => ({
                name,
                label: themeLabels[name] || name
            }));
        }

        return themes;
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
        if (!this.initialConfigValues) {
            this.initialConfigValues = {};
        }
        if (!(config in this.initialConfigValues) && this.exampleComponent) {
            this.initialConfigValues[config] = this.exampleComponent[config];
        }
        this.exampleComponent[config] = opts.value;
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigRecordChange(config, opts) {
        if (!this.initialConfigValues) {
            this.initialConfigValues = {};
        }
        if (!(config in this.initialConfigValues) && this.exampleComponent) {
            this.initialConfigValues[config] = this.exampleComponent[config];
        }
        this.exampleComponent[config] = opts.value?.['id'];
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioChange(config, value, opts) {
        if (!this.initialConfigValues) {
            this.initialConfigValues = {};
        }
        if (!(config in this.initialConfigValues) && this.exampleComponent) {
            this.initialConfigValues[config] = this.exampleComponent[config];
        }
        if (opts.value === true) {
            this.exampleComponent[config] = value;
        }
    }

    /**
     * Snapshots the initial state of the example component configs and inspector controls
     */
    snapshotInitialState() {
        let me = this;

        me.initialConfigValues  = {};
        me.initialControlStates = [];

        // Snapshot original configs passed during component creation
        if (me.exampleComponent?.originalConfig) {
            Object.assign(me.initialConfigValues, Neo.clone(me.exampleComponent.originalConfig, true, true));
        }

        const inspector = me.items?.[1];

        const inspectControl = (item) => {
            if (!item) return;

            if (item.ntype !== 'button' && !item.isButton && item.ntype !== 'label') {
                const hasChecked = typeof item.checked === 'boolean';
                const hasValue   = 'value' in item;

                if (hasChecked || hasValue) {
                    me.initialControlStates.push({
                        item,
                        hasChecked,
                        initialChecked: item.checked,
                        hasValue,
                        initialValue  : item.value
                    });
                }

                if (item.name && me.exampleComponent && (item.name in me.exampleComponent)) {
                    me.initialConfigValues[item.name] = me.exampleComponent[item.name];
                }
            }

            if (Array.isArray(item.items)) {
                item.items.forEach(inspectControl);
            }
        };

        if (inspector) {
            inspectControl(inspector);
        } else if (Array.isArray(me.configurationComponents)) {
            me.configurationComponents.forEach(inspectControl);
        }
    }

    /**
     * Restores all configs of the example component and controls to their initial values
     */
    onReset() {
        let me = this;

        // 1. Reset example component configs
        if (me.initialConfigValues && me.exampleComponent) {
            Object.entries(me.initialConfigValues).forEach(([config, val]) => {
                if (config !== 'id' && config !== 'vnode' && config !== 'vdom') {
                    me.exampleComponent[config] = val;
                }
            });
        }

        // 2. Reset controls
        if (me.initialControlStates) {
            // Uncheck radios and checkboxes that were not initially checked
            me.initialControlStates.forEach(({item, hasChecked, initialChecked}) => {
                if (hasChecked && !initialChecked) {
                    item.checked = false;
                }
            });

            // Restore checked state for initially checked and values for inputs
            me.initialControlStates.forEach(({item, hasChecked, initialChecked, hasValue, initialValue}) => {
                if (hasChecked) {
                    if (initialChecked) {
                        item.checked = true;
                    }
                } else if (hasValue) {
                    item.value = initialValue;
                }
            });
        }
    }

    /**
     * Constructs the workbench stage and inspector panel
     */
    onConstructed() {
        let me = this,
            exampleComponentType, theme;

        me.exampleComponent = me.createExampleComponent();

        exampleComponentType = Neo.typeOf(me.exampleComponent);

        if (exampleComponentType === 'NeoClass' || exampleComponentType === 'Object') {
            me.exampleComponent = Neo.create(me.exampleComponent);
        }

        let configs = me.createConfigurationComponents();

        if (configs instanceof Promise) {
            configs.then(resolved => {
                if (me.isDestroyed) return;
                me.configurationComponents = resolved || [];
                const body = me.down({reference: 'inspector-body'});
                if (body && me.configurationComponents.length > 0) {
                    body.add(me.groupConfigurationComponents(me.configurationComponents));
                }
                me.snapshotInitialState();
            });
            me.configurationComponents = [];
        } else {
            me.configurationComponents = me.groupConfigurationComponents(configs || []);
        }

        if (me.isDestroyed) {
            return;
        }

        const availableThemes = me.getAvailableThemes();
        theme = me.theme || me.exampleComponent?.getTheme?.() || availableThemes[0]?.name;
        me.theme = theme;
        if (me.exampleComponent) {
            me.exampleComponent.theme = theme;
        }

        const currentThemeObj = availableThemes.find(t => t.name === theme) || availableThemes[0];
        const nextThemeIndex  = (availableThemes.indexOf(currentThemeObj) + 1) % availableThemes.length;
        const nextThemeObj    = availableThemes[nextThemeIndex] || currentThemeObj;

        const isCompact = !me.isWideComponent();
        const stageCls  = ['neo-workbench-stage'];
        if (isCompact) {
            stageCls.push('neo-stage-compact');
        }

        const compName  = me.componentName || me.exampleComponent?.className?.split('.').pop() || 'Component';
        const compClass = me.exampleComponent?.className || '';
        const compDesc  = me.description || me.exampleComponent?.description || '';

        const stageHeader = {
            module   : Container,
            cls      : ['neo-workbench-stage-header'],
            reference: 'stage-header',
            items    : [{
                ntype    : 'label',
                cls      : ['neo-workbench-stage-title'],
                reference: 'stage-title',
                text     : compName
            }, {
                ntype    : 'label',
                cls      : ['neo-workbench-stage-subtitle'],
                reference: 'stage-subtitle',
                text     : compClass
            }, ...(compDesc ? [{
                ntype    : 'label',
                cls      : ['neo-workbench-stage-desc'],
                reference: 'stage-desc',
                text     : compDesc
            }] : [])]
        };

        me.items = [{
            module: Container,
            cls   : stageCls,
            items : [stageHeader, {
                module: Container,
                cls   : ['neo-example-container'],
                flex  : 1,
                items : [me.exampleComponent],
                layout: 'base',
                ...me.exampleContainerConfig,
                style : {
                    overflow: 'auto',
                    padding : '20px',
                    position: 'relative',
                    ...me.exampleContainerConfig?.style
                }
            }],
            flex  : me.exampleComponentFlex,
            layout: 'base'
        }, {
            module: Panel,
            cls   : ['neo-panel', 'neo-container', 'neo-configuration-panel', 'neo-workbench-inspector'],
            flex  : me.configPanelFlex,

            style: {
                maxWidth: me.configPanelMaxWidth ? me.configPanelMaxWidth + 'px' : null,
                margin  : '20px',
                minWidth: me.configPanelMinWidth ? me.configPanelMinWidth + 'px' : null
            },

            headers: [{
                cls  : ['neo-configuration-header-toolbar', 'neo-workbench-toolbar'],
                dock : 'top',
                items: [{
                    ntype: 'label',
                    cls  : ['neo-workbench-title'],
                    text : 'Inspector'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    module : Button,
                    cls    : ['neo-button-reset'],
                    handler: me.onReset.bind(me),
                    id     : me.id + '__resetButton',
                    text   : 'Reset'
                }, {
                    module : Button,
                    cls    : ['neo-button-theme-switch'],
                    handler: me.onSwitchTheme.bind(me),
                    id     : me.id + '__switchThemeButton',
                    style  : {marginLeft: '8px'},
                    text   : nextThemeObj.label
                }]
            }],

            items: [{
                module      : Container,
                reference   : 'inspector-body',
                layout      : {ntype: 'vbox', align: null},
                cls         : ['neo-configuration-panel-body'],
                itemDefaults: {
                    clearToOriginalValue: true,
                    labelWidth          : me.configItemLabelWidth,
                    width               : me.configItemWidth
                },

                items: me.configurationComponents
            }]
        }];

        super.onConstructed();

        me.snapshotInitialState();
    }

    /**
     * @param {Object} data
     * @param {String} target
     */
    onSwitchTheme(data, target) {
        let me              = this,
            button          = data.component,
            availableThemes = me.getAvailableThemes(),
            countThemes     = availableThemes.length,
            futureIndex, newTheme, themeIndex;

        themeIndex = availableThemes.findIndex(t => t.label === button.text);
        if (themeIndex === -1) {
            themeIndex = 0;
        }

        newTheme = availableThemes[themeIndex].name;
        futureIndex = (themeIndex + 1) % countThemes;

        button.text = availableThemes[futureIndex].label;

        const otherBtn = me.down({id: me.id + '__switchThemeButton'});
        if (otherBtn && otherBtn !== button) {
            otherBtn.text = button.text;
        }

        if (target === 'cmp') {
            me.exampleComponent.theme = newTheme;
        } else {
            me.theme = newTheme;
            if (me.app?.mainView && me.app.mainView !== me) {
                me.app.mainView.theme = newTheme;
            }
            if (me.exampleComponent) {
                me.exampleComponent.theme = newTheme;
            }
        }
    }
}

export default Neo.setupClass(ConfigurationViewport);
