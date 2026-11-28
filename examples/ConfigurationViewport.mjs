import Button      from '../src/button/Base.mjs';
import CodeView    from './workbench/CodeView.mjs';
import Container   from '../src/container/Base.mjs';
import HashHistory from '../src/util/HashHistory.mjs';
import Panel       from '../src/container/Panel.mjs';
import Viewport    from '../src/container/Viewport.mjs';
import {
    cloneConfig,
    formatExampleCode,
    parseConfigParams,
    serializeConfigParams
} from './workbench/formatConfig.mjs';

// Default themes
const themes = [
    {name: 'neo-theme-neo-dark',  label: 'Theme Neo-Dark'},
    {name: 'neo-theme-neo-light', label: 'Theme Neo-Light'},
    {name: 'neo-theme-light',     label: 'Theme Light'},
    {name: 'neo-theme-dark',      label: 'Theme Dark'}
];

/**
 * Base class for example Apps which should be configurable (workbench stage, inspector, code view, reset)
 * @class Neo.examples.ConfigurationViewport
 * @extends Neo.container.Viewport
 * @abstract
 */
class ConfigurationViewport extends Viewport {
    /**
     * Config keys excluded from code-view diffing and reset snapshots because they hold creation-only
     * structures or internal runtime/VDOM bookkeeping rather than tweakable component configs.
     * @member {Set<String>} internalExampleConfigs
     * @protected
     * @static
     */
    static internalExampleConfigs = new Set([
        'appName', 'body', 'columnDefaults', 'columns', 'handler', 'id', 'isDestroying',
        'isReady', 'isVdomUpdating', 'items', 'listeners', 'module', 'mounted',
        'needsVnodeUpdate', 'parentComponent', 'parentId', 'plugins', 'store',
        'vdom', 'vnode', 'windowId', 'wrapperStyle'
    ])
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
         * The name in the stage header ("Date field"). Null derives it from the example component's className.
         * @member {String|null} componentName=null
         * @see #getComponentName
         */
        componentName: null,
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
     * Override this method to show more on the stage than the example component, e.g. the same field in its states.
     * The items follow the example component, which stays the stage's first item: the inspector drives it,
     * and the tile recipe (`buildScripts/docs/captureExamples.mjs`) crops it alone.
     * @returns {Object[]}
     */
    createStageItems() {
        return []
    }

    /**
     * Returns the available themes for theme switching
     * @returns {Object[]}
     */
    getAvailableThemes() {
        const configured  = Neo.config.themes;
        const themeLabels = {
            'neo-theme-neo-dark'      : 'Theme Neo-Dark',
            'neo-theme-neo-light'     : 'Theme Neo-Light',
            'neo-theme-light'         : 'Theme Light',
            'neo-theme-dark'          : 'Theme Dark',
            'neo-theme-cyberpunk'     : 'Theme Cyberpunk',
            'neo-theme-material-light': 'Theme Material Light',
            'neo-theme-material-dark' : 'Theme Material Dark'
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
     * Derives the name shown in the stage header. An explicit `componentName` wins. Otherwise the last
     * className segment is used, unless it is generic (e.g. `Base`, `Container`), in which case the
     * closest namespace segment names the component (`Neo.button.Base` => `Button`).
     * @param {String} [className]
     * @returns {String}
     */
    getComponentName(className=this.exampleComponent?.className || '') {
        let me       = this,
            generic  = ['Abstract', 'Base', 'Component', 'Container'],
            segments = className.split('.').filter(Boolean);

        if (me.componentName) {
            return me.componentName
        }

        let name = segments[segments.length - 1];

        if (generic.includes(name) && segments.length > 2) {
            // Skip the leading `Neo` namespace
            name = segments[segments.length - 2];
            name = name.charAt(0).toUpperCase() + name.slice(1)
        }

        return name || 'Component'
    }

    /**
     * The config `createExampleComponent()` returned, copied before `Neo.create()` consumed it: the Code View shows it
     * overlaid with the changed configs. Null when the example returns an instance or a class, which leaves the view
     * at `module` plus changes.
     * @member {Object|null} authoredConfig=null
     * @protected
     */
    authoredConfig = null

    /**
     * Config keys currently subscribed on `exampleComponent` via `observeConfig`.
     * @member {Set<String>} #observedExampleConfigs=new Set()
     * @private
     */
    #observedExampleConfigs = new Set()
    #isRestoringUrlConfigs  = false
    #lastSyncedUrlHash      = null
    #pendingAsyncConfigs    = false
    #pendingUrlWrites       = []

    /**
     * @summary Unsubscribes the workbench's hash listener before tearing down the viewport.
     * @param {...*} args
     */
    destroy(...args) {
        HashHistory.un('change', this.onHashHistoryChange, this);
        super.destroy(...args)
    }

    /**
     * @summary Returns only tracked configs whose current value differs from initial state.
     * @returns {Object} Map of changed config keys to their current values
     */
    getChangedConfigs() {
        let me      = this,
            changed = {};

        if (!me.initialConfigValues || !me.exampleComponent) {
            return changed
        }

        Object.entries(me.initialConfigValues).forEach(([key, initialValue]) => {
            if (ConfigurationViewport.internalExampleConfigs.has(key)) {
                return
            }

            let currentValue = me.exampleComponent[key];

            if (currentValue !== undefined && !Neo.isEqual(currentValue, initialValue)) {
                changed[key] = currentValue
            }
        });

        return changed
    }

    /**
     * @summary Builds the evaluable Neo config snippet for `exampleComponent`: its {@link #authoredConfig} overlaid
     * with its changed configs.
     * @returns {String}
     */
    getCodeText() {
        const
            me       = this,
            authored = {...me.authoredConfig};

        if (!me.exampleComponent) {
            return '{\n}'
        }

        // formatExampleCode() writes the root's identity as `module`, from the live class
        delete authored.className;
        delete authored.module;
        delete authored.ntype;

        return formatExampleCode(me.exampleComponent.className || 'Neo.component.Base', {...authored, ...me.getChangedConfigs()})
    }

    /**
     * @summary Resolves the active window's initial or current URL hash string without mutating `HashHistory`.
     * @returns {String}
     * @protected
     */
    getInitialUrlHash() {
        const {windowId} = this;
        let raw;

        if (windowId !== undefined && Object.hasOwn(HashHistory.stacks, windowId)) {
            raw = HashHistory.stacks[windowId][0]?.hashString
        }

        if (raw === undefined && windowId !== undefined) {
            raw = Neo.windowConfigs?.[windowId]?.hash?.hashString
        }

        if (raw === undefined) {
            const configHash = Neo.config.hash;
            if (typeof configHash === 'string') {
                raw = configHash
            } else if (configHash && (windowId === undefined || configHash.windowId === undefined || configHash.windowId === windowId)) {
                raw = configHash.hashString
            }
        }

        return typeof raw === 'string' ? raw.replace(/^#/, '') : ''
    }

    /**
     * @summary Serializes the workbench's changed literal configs into a URL hash string.
     * @returns {String}
     */
    getUrlHash() {
        return serializeConfigParams(this.getChangedConfigs(), ConfigurationViewport.internalExampleConfigs)
    }

    /**
     * @summary Updates a tracked example config and refreshes the Code View and URL hash.
     * @param {String} config
     * @param {Object} opts
     */
    onConfigChange(config, opts) {
        this.trackExampleConfig(config);
        this.exampleComponent[config] = opts.value;
        this.updateCodeView();
        this.syncUrlState()
    }

    /**
     * @summary Updates a tracked record-id config and refreshes the Code View and URL hash.
     * @param {String} config
     * @param {Object} opts
     */
    onConfigRecordChange(config, opts) {
        this.trackExampleConfig(config);
        this.exampleComponent[config] = opts.value?.['id'];
        this.updateCodeView();
        this.syncUrlState()
    }

    /**
     * @summary Copies the Code View snippet to the clipboard via {@link Neo.examples.workbench.CodeView#copyCode}.
     * @param {Object} [data]
     * @returns {Promise<void>}
     */
    onCopyCode(data) {
        return this.down({reference: 'code-panel'})?.copyCode(data)
    }

    /**
     * @summary Applies external hash-route navigations onto the workbench while ignoring in-flight echoes of its own writes.
     * @param {Object} data
     * @protected
     */
    onHashHistoryChange(data) {
        const me = this;

        if (me.isDestroyed || me.#isRestoringUrlConfigs || me.#pendingAsyncConfigs) {
            return
        }

        if (me.windowId !== undefined && data?.windowId !== undefined && data.windowId !== me.windowId) {
            return
        }

        const
            nextHash  = typeof data?.hashString === 'string' ? data.hashString.replace(/^#/, '') : '',
            echoIndex = me.#pendingUrlWrites.indexOf(nextHash);

        if (echoIndex !== -1) {
            me.#pendingUrlWrites.splice(0, echoIndex + 1);
            return
        }

        if (me.#pendingUrlWrites.length === 0 && nextHash === me.#lastSyncedUrlHash) {
            return
        }

        me.#pendingUrlWrites.length = 0;
        me.#isRestoringUrlConfigs   = true;
        try {
            me.resetToInitialValues()
        } finally {
            me.#isRestoringUrlConfigs = false
        }

        me.#lastSyncedUrlHash = nextHash;
        me.restoreUrlConfigs(nextHash);
        me.updateCodeView()
    }

    /**
     * @summary Updates a tracked radio config when selected and refreshes the Code View and URL hash.
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioChange(config, value, opts) {
        this.trackExampleConfig(config);
        if (opts.value === true) {
            this.exampleComponent[config] = value;
            this.updateCodeView();
            this.syncUrlState()
        }
    }

    /**
     * @summary Resolves the candidate config key bound to an inspector control if present on `exampleComponent`.
     * Controls without an explicit `name` match by camel-cased `labelText` or `valueLabel` convention.
     * @param {Object} item
     * @returns {String|null}
     * @protected
     */
    resolveControlConfigKey(item) {
        let example = this.exampleComponent;

        if (!example || !item) {
            return null
        }

        for (const candidate of [item.name, item.labelText, item.valueLabel]) {
            if (typeof candidate !== 'string' || !candidate) continue;

            if (!ConfigurationViewport.internalExampleConfigs.has(candidate) &&
                (candidate in example) &&
                typeof example[candidate] !== 'function') {
                return candidate
            }

            let camel = candidate[0].toLowerCase() + candidate.slice(1);

            if (/^[a-zA-Z_$][\w$]*$/.test(camel) &&
                !ConfigurationViewport.internalExampleConfigs.has(camel) &&
                (camel in example) &&
                typeof example[camel] !== 'function') {
                return camel
            }
        }

        return null
    }

    /**
     * @summary Records initial value and subscribes to reactive changes for an exposed example config.
     * @param {String|null} configKey
     * @protected
     */
    trackExampleConfig(configKey) {
        let me = this;

        if (!configKey || ConfigurationViewport.internalExampleConfigs.has(configKey) || !me.exampleComponent) {
            return
        }

        me.initialConfigValues ??= {};

        if (!(configKey in me.initialConfigValues) && (configKey in me.exampleComponent)) {
            me.initialConfigValues[configKey] = Neo.clone(me.exampleComponent[configKey], true, true)
        }

        if (!me.#observedExampleConfigs.has(configKey) && me.exampleComponent.isConfig?.(configKey)) {
            me.#observedExampleConfigs.add(configKey);
            me.observeConfig(me.exampleComponent, configKey, () => {
                me.updateCodeView();
                me.syncUrlState()
            })
        }
    }

    /**
     * @summary Pushes the latest {@link #getCodeText} snippet into the reactive Code View component.
     */
    updateCodeView() {
        const codePanel = this.down({reference: 'code-panel'});

        if (codePanel) {
            codePanel.code = this.getCodeText()
        }
    }

    /**
     * @summary Replaces the browser URL hash in place when the serialized config diff changes.
     */
    syncUrlState() {
        const me = this;

        if (me.#isRestoringUrlConfigs || me.#pendingAsyncConfigs || me.isDestroyed) {
            return
        }

        const nextHash = me.getUrlHash();

        if (nextHash === me.#lastSyncedUrlHash) {
            return
        }

        me.#lastSyncedUrlHash = nextHash;

        if (Neo.Main?.setRoute) {
            me.#pendingUrlWrites.push(nextHash);
            if (me.#pendingUrlWrites.length > 64) {
                me.#pendingUrlWrites.shift()
            }
            Neo.Main.setRoute({
                replace : true,
                value   : nextHash,
                windowId: me.windowId
            })
        }
    }

    /**
     * @summary Restores valid typed URL hash parameters onto `exampleComponent` and its inspector controls.
     * @param {String} [hashString=this.getInitialUrlHash()]
     * @returns {Boolean}
     */
    restoreUrlConfigs(hashString=this.getInitialUrlHash()) {
        const
            me        = this,
            cleanHash = typeof hashString === 'string' ? hashString.replace(/^#/, '') : '';

        me.#lastSyncedUrlHash ??= cleanHash;

        if (!cleanHash || !me.initialConfigValues || !me.exampleComponent) {
            return false
        }

        const
            params  = parseConfigParams(cleanHash, ConfigurationViewport.internalExampleConfigs),
            entries = Object.entries(params);

        if (entries.length === 0) {
            return false
        }

        const controlsByKey = new Map();

        (me.initialControlStates || []).forEach(entry => {
            if (entry.configKey) {
                let list = controlsByKey.get(entry.configKey);
                if (!list) {
                    list = [];
                    controlsByKey.set(entry.configKey, list)
                }
                list.push(entry)
            }
        });

        let restoredAny = false;
        me.#isRestoringUrlConfigs = true;

        try {
            for (const [key, rawValue] of entries) {
                if (!Object.hasOwn(me.initialConfigValues, key) || ConfigurationViewport.internalExampleConfigs.has(key)) {
                    continue
                }

                const controls = controlsByKey.get(key) || [];
                let resolvedValue;

                if (controls.some(({item}) => item.ntype === 'radiofield' || item.className === 'Neo.form.field.Radio')) {
                    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) continue;
                    const target = controls.find(({item}) => item.valueLabel === rawValue || item.valueLabel === String(rawValue))?.item;
                    if (!target) continue;

                    target.checked = true;
                    resolvedValue  = target.valueLabel
                } else if (controls.length > 0 && controls[0].hasChecked) {
                    if (typeof rawValue !== 'boolean') continue;

                    controls.forEach(({item}) => { item.checked = rawValue });
                    resolvedValue = rawValue
                } else if (controls.length > 0 && controls[0].hasValue) {
                    const
                        {item}  = controls[0],
                        ntype   = item.ntype || '',
                        clsName = item.className || '';

                    if (item.store) {
                        if (rawValue === null) {
                            if (!item.clearable) continue
                        } else if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
                            continue
                        } else if (item.store.isLoaded !== false) {
                            const
                                valueField   = item.valueField || 'id',
                                displayField = item.displayField || 'name',
                                pool         = item.store.allItems?.items || item.store.items || [],
                                hasMatch     = Boolean(
                                    (item.store.isFiltered?.() ? item.store.allItems?.get?.(rawValue) : item.store.get?.(rawValue)) ||
                                    pool.some(rec => rec?.[valueField] === rawValue || rec?.[displayField] === rawValue)
                                );

                            if (!hasMatch) continue
                        }

                        item.value    = rawValue;
                        resolvedValue = Neo.isRecord(item.value) ? item.value[item.valueField || 'id'] : rawValue
                    } else if (ntype === 'numberfield' || ntype === 'rangefield' || clsName.includes('field.Number') || clsName.includes('field.Range')) {
                        if (!(typeof rawValue === 'number' && Number.isFinite(rawValue)) && !(rawValue === null && item.clearable)) continue;

                        item.value    = rawValue;
                        resolvedValue = rawValue
                    } else if (ntype === 'textfield' || ntype === 'textarea' || clsName.includes('field.Text')) {
                        const textValue = typeof rawValue === 'string'
                            ? rawValue
                            : (typeof rawValue === 'number' || typeof rawValue === 'boolean')
                                ? String(rawValue)
                                : (rawValue === null && item.clearable ? null : undefined);

                        if (textValue === undefined) continue;

                        item.value    = textValue;
                        resolvedValue = textValue
                    } else {
                        resolvedValue = Neo.clone(rawValue, true, true);
                        item.value    = resolvedValue
                    }
                } else {
                    continue
                }

                if (!Neo.isEqual(me.exampleComponent[key], resolvedValue)) {
                    me.exampleComponent[key] = Neo.clone(resolvedValue, true, true)
                }

                restoredAny = true
            }
        } finally {
            me.#isRestoringUrlConfigs = false
        }

        if (restoredAny) {
            me.updateCodeView()
        }

        return restoredAny
    }

    /**
     * Snapshots the initial state of the inspector controls and of the example component configs they control.
     * Only configs bound to a control (`item.name` / `labelText` / `valueLabel`) are restored by `onReset()`.
     * Creation configs (stores, columns, items, handlers) are excluded, since restoring them would re-create them.
     */
    snapshotInitialState() {
        let me = this;

        me.initialConfigValues  = {};
        me.initialControlStates = [];

        const inspector = me.items?.[1];

        const inspectControl = item => {
            if (!item || item.reference === 'code-panel') return;

            if (item.ntype !== 'button' && !item.isButton && item.ntype !== 'label') {
                const
                    configKey  = me.resolveControlConfigKey(item),
                    hasChecked = typeof item.checked === 'boolean',
                    hasValue   = 'value' in item;

                if (hasChecked || hasValue) {
                    me.initialControlStates.push({
                        configKey,
                        hasChecked,
                        hasValue,
                        initialChecked: item.checked,
                        initialValue  : item.value,
                        item
                    });
                }

                me.trackExampleConfig(configKey);
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

        me.updateCodeView()
    }

    /**
     * @summary Restores `exampleComponent` and inspector controls to their captured initial defaults.
     * @protected
     */
    resetToInitialValues() {
        let me = this;

        if (me.initialConfigValues && me.exampleComponent) {
            Object.entries(me.initialConfigValues).forEach(([config, val]) => {
                if (!ConfigurationViewport.internalExampleConfigs.has(config) && !Neo.isEqual(me.exampleComponent[config], val)) {
                    me.exampleComponent[config] = Neo.clone(val, true, true)
                }
            });
        }

        if (me.initialControlStates) {
            me.initialControlStates.forEach(({item, hasChecked, initialChecked}) => {
                if (hasChecked && !initialChecked) {
                    item.checked = false;
                }
            });

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
     * @summary Restores initial workbench state and clears changed configs from the URL hash.
     */
    onReset() {
        const me = this;

        me.#isRestoringUrlConfigs = true;
        try {
            me.resetToInitialValues()
        } finally {
            me.#isRestoringUrlConfigs = false
        }

        me.updateCodeView();
        me.syncUrlState()
    }

    /**
     * Constructs the workbench stage and inspector panel
     */
    onConstructed() {
        let me = this,
            exampleComponentType, theme;

        me.exampleComponent = me.createExampleComponent();

        exampleComponentType = Neo.typeOf(me.exampleComponent);

        if (exampleComponentType === 'Object') {
            // Creation consumes the config (setFields() removes its non-reactive keys), so the copy comes first
            me.authoredConfig = cloneConfig(me.exampleComponent)
        }

        if (exampleComponentType === 'NeoClass' || exampleComponentType === 'Object') {
            me.exampleComponent = Neo.create(me.exampleComponent);
        }

        let configs = me.createConfigurationComponents();

        if (configs instanceof Promise) {
            me.#pendingAsyncConfigs = true;
            configs.then(resolved => {
                me.#pendingAsyncConfigs = false;
                if (me.isDestroyed) return;
                me.configurationComponents = resolved || [];
                const body = me.down({reference: 'inspector-body'});
                if (body && me.configurationComponents.length > 0) {
                    body.add(me.groupConfigurationComponents(me.configurationComponents));
                }
                me.snapshotInitialState();
                me.restoreUrlConfigs();
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

        const compName  = me.getComponentName();
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
                items : [me.exampleComponent, ...me.createStageItems()],
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
            module         : Panel,
            cls            : ['neo-panel', 'neo-container', 'neo-configuration-panel', 'neo-workbench-inspector'],
            containerConfig: {
                cls   : ['neo-workbench-inspector-content'],
                layout: {ntype: 'vbox', align: 'stretch'}
            },
            flex           : me.configPanelFlex,

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
                flex        : 1,
                layout      : {ntype: 'vbox', align: null},
                cls         : ['neo-configuration-panel-body'],
                itemDefaults: {
                    clearToOriginalValue: true,
                    labelWidth          : me.configItemLabelWidth,
                    width               : me.configItemWidth
                },

                items: me.configurationComponents
            }, {
                module   : CodeView,
                code     : me.getCodeText(),
                reference: 'code-panel'
            }]
        }];

        super.onConstructed();

        me.snapshotInitialState();

        if (!me.#pendingAsyncConfigs) {
            me.restoreUrlConfigs()
        }

        HashHistory.on('change', me.onHashHistoryChange, me)
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
