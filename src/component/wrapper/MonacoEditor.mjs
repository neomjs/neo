import Base                                from '../../component/Base.mjs';
import {declaredScheme, reapplyOnThemeMap} from '../../util/Theme.mjs';

/**
 * Using this wrapper component requires to import the related main thread addon: Neo.main.addon.MonacoEditor
 * @class Neo.component.wrapper.MonacoEditor
 * @extends Neo.component.Base
 */
class MonacoEditor extends Base {
    /**
     * Valid values for cursorBlinking
     * @member {String[]} cursorBlinkings=['blink','expand','phase','smooth','solid']
     * @protected
     * @static
     */
    static cursorBlinkings = ['blink', 'expand', 'phase', 'smooth', 'solid']
    /**
     * @member {Object} delayable
     * @protected
     * @static
     */
    static delayable = {
        layoutEditor: {type: 'buffer', timer: 50}
    }
    /**
     * Valid values for editorTheme
     * @member {String[]} editorThemes=['hc-black','hc-light','vs','vs-dark']
     * @protected
     * @static
     */
    static editorThemes = ['hc-black', 'hc-light', 'vs', 'vs-dark']
    /**
     * Valid values for language
     * @member {String[]} languages=['javascript','markdown','mermaid']
     * @protected
     * @static
     */
    static languages = ['javascript', 'markdown', 'mermaid']

    static config = {
        /**
         * @member {String} className='Neo.component.wrapper.MonacoEditor'
         * @protected
         */
        className: 'Neo.component.wrapper.MonacoEditor',
        /**
         * @member {String} ntype='monaco-editor'
         * @protected
         */
        ntype: 'monaco-editor',
        /**
         * @member {String[]} baseCls=['neo-monaco-editor']
         * @protected
         */
        baseCls: ['neo-monaco-editor'],
        /**
         * @member {Boolean} contextmenu_=false
         * @reactive
         */
        contextmenu_: false,
        /**
         * Options are: 'blink', 'expand', 'phase', 'smooth', 'solid'
         * @member {String} cursorBlinking_='blink'
         * @reactive
         */
        cursorBlinking_: 'blink',
        /**
         * additional property to only use in combination with readOnly === true.
         * domReadOnly additionally sets the readonly attribute to the underlying textarea.
         * @member {Boolean} domReadOnly_=false
         * @reactive
         */
        domReadOnly_: false,
        /**
         * Options are: 'vs', 'vs-dark', 'hc-black', 'hc-light'
         * @member {String} editorTheme_='vs'
         * @reactive
         */
        editorTheme_: 'vs',
        /**
         * @member {Number} fontSize_=14
         * @reactive
         */
        fontSize_: 14,
        /**
         * @member {String} language_='javascript'
         * @reactive
         */
        language_: 'javascript',
        /**
         * @member {Object} minimap_={enabled: false}
         * @reactive
         */
        minimap_: {enabled: false},
        /**
         * A generic config which allows changing all editor options which are not exposed as configs here.
         * For a full list of available options see:
         * https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IEditorOptions.html
         *
         * For initial options this config will win over related class configs.
         * However, run-time changes of related class configs will dynamically change their option values.
         * @member {Object} options_={}
         * @reactive
         */
        options_: {},
        /**
         * @member {Boolean} readOnly_=false
         * @reactive
         */
        readOnly_: false,
        /**
         * The editor theme for a Neo theme that {@link #themeMap} does not name, by the color scheme that
         * theme declares.
         * @member {Object} schemeMap
         */
        schemeMap: {dark: 'vs-dark', light: 'vs'},
        /**
         * @member {Boolean} scrollBeyondLastLine_=false
         * @reactive
         */
        scrollBeyondLastLine_: false,
        /**
         * @member {Boolean} showLineNumbers_=true
         * @reactive
         */
        showLineNumbers_: true,
        /**
         * Maps a Neo theme onto one of {@link #editorThemes}.
         *
         * A map rather than a substring test on the theme name, because the name does not carry the
         * answer: `neo-theme-cyberpunk` is dark — `--neo-global-background-color: #0d1117`, and its own
         * `--neo-color-scheme` says `dark` — and is named neither. The theme build reads that token into
         * the theme map, so a theme this map does not name answers through {@link #schemeMap} once the
         * map reaches the App worker. Same shape and same reason as the sibling
         * {@link Neo.component.wrapper.Mermaid#themeMap}, and a config rather than a constant so a
         * consumer can extend it for a theme Neo does not ship — or map one onto a high-contrast
         * editor theme, which a two-way guess could never express.
         * @member {Object} themeMap
         */
        themeMap: {
            'neo-theme-cyberpunk': 'vs-dark',
            'neo-theme-dark'     : 'vs-dark',
            'neo-theme-light'    : 'vs',
            'neo-theme-neo-dark' : 'vs-dark',
            'neo-theme-neo-light': 'vs'
        },
        /**
         * @member {String|String[]} value_=''
         * @reactive
         */
        value_: '',
        /**
         * @member {Boolean} useThemeAwareness_=true
         * @reactive
         */
        useThemeAwareness_: true
    }

    /**
     * Invalidates mounted callbacks when a holder unmounts or moves to another browser window.
     * @member {Number} editorMountGeneration=0
     * @protected
     */
    editorMountGeneration = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            editorChange: me.onContentChange,
            resize      : me.layoutEditor,
            scope       : me
        });

        reapplyOnThemeMap(me, () => me.applyLateColorScheme())
    }

    /**
     * @summary Brings an editor built before the theme map arrived to where a warm boot builds it. An editor with an
     * explicit `options.theme` keeps it. Monaco paints one theme per window, so an editor the map does not change
     * sends its creation theme again: the editors end on the theme the last one built sets, as when the map arrives
     * first.
     * @protected
     */
    applyLateColorScheme() {
        let me            = this,
            {editorTheme} = me;

        me.options.theme || me.applyColorScheme();
        me.editorTheme === editorTheme && me.afterSetEditorTheme(me.getInitialOptions().theme)
    }

    /**
     * Triggered after the contextmenu config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetContextmenu(value, oldValue) {
        this.updateOptions({contextmenu: value})
    }

    /**
     * Triggered after the cursorBlinking config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCursorBlinking(value, oldValue) {
        this.updateOptions({cursorBlinking: value})
    }

    /**
     * Triggered after the domReadOnly config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDomReadOnly(value, oldValue) {
        this.updateOptions({domReadOnly: value})
    }

    /**
     * @summary Starts native editor creation after DOM mount and accepts only the current mount's reply.
     * The mounted signal already observes DOM admission; no elapsed-time guess is needed before
     * sending the create request. Unmounting or moving windows invalidates its completion callback.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me         = this,
            generation = ++me.editorMountGeneration,
            windowId   = me.windowId;

        value && Neo.main.addon.MonacoEditor.createInstance(me.getInitialOptions()).then(() => {
            if (!me.isDestroyed && me.mounted && me.windowId === windowId && me.editorMountGeneration === generation) {
                // use this custom method as needed inside your class extensions
                me.onEditorMounted?.()
            }
        }).catch(error => {
            if (error !== Neo.isDestroyed) throw error
        })
    }

    /**
     * Triggered after the editorTheme config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEditorTheme(value, oldValue) {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MonacoEditor.setTheme({
                id      : me.id,
                value,
                windowId: me.windowId
            })
        }
    }

    /**
     * Triggered after the fontSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFontSize(value, oldValue) {
        this.updateOptions({fontSize: value})
    }

    /**
     * Triggered after the language config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLanguage(value, oldValue) {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MonacoEditor.setLanguage({
                id      : me.id,
                value,
                windowId: me.windowId
            })
        }
    }

    /**
     * Triggered after the minimap config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetMinimap(value, oldValue) {
        this.updateOptions({minimap: value})
    }

    /**
     * Triggered after the options config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetOptions(value, oldValue) {
        this.updateOptions(value)
    }

    /**
     * Triggered after the readOnly config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetReadOnly(value, oldValue) {
        this.updateOptions({readOnly: value})
    }

    /**
     * Triggered after the scrollBeyondLastLine config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetScrollBeyondLastLine(value, oldValue) {
        this.updateOptions({scrollBeyondLastLine: value})
    }

    /**
     * Triggered after the showLineNumbers config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowLineNumbers(value, oldValue) {
        this.updateOptions({lineNumbers: value ? 'on' : 'off'})
    }

    /**
     * Triggered after the useThemeAwareness config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseThemeAwareness(value, oldValue) {
        value && (this.editorTheme = this.resolveEditorTheme())
    }

    /**
     * Triggered after the value config got changed
     * @param {String|String[]} value
     * @param {String|String[]} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MonacoEditor.setValue({
                id      : me.id,
                value   : me.stringifyValue(me.value),
                windowId: me.windowId
            })
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        this.applyColorScheme()
    }

    /**
     * @summary Sets the editor theme the resolved Neo theme maps onto. Also called once the theme map arrives.
     * @protected
     */
    applyColorScheme() {
        this.editorTheme = this.resolveEditorTheme()
    }

    /**
     * @summary Maps this component's resolved theme onto one of Monaco's own theme names.
     *
     * Resolution goes through {@link Neo.component.Base#getTheme}, never the `theme` config. A child
     * inside a themed scope carries no theme class of its own by design, so that config is `null`
     * for precisely the components which inherit a theme — and `container.Base#afterSetTheme` only
     * stamps live items on a CHANGE, leaving construction to `createItem`. Reading the config
     * therefore answers `null` on first render and the right value only after a theme toggle, which
     * is exactly the asymmetry this repairs. `getTheme()` answers the component's own **`theme`**
     * first, so a component declaring one is not overruled by the scope it sits in.
     *
     * For a theme {@link #themeMap} does not name, an `options.theme` from {@link #editorThemes} answers
     * next, as {@link #options} outranks the configs when the editor is created, then the theme's declared
     * scheme through {@link #schemeMap}. `editorTheme` answers last, and alone with awareness off, so a
     * declared `hc-black` survives a theme nothing else answers and is replaced by a mapped one. Set
     * `useThemeAwareness: false` to pin it against every theme.
     *
     * Pure, so {@link #getInitialOptions} can build a correctly themed editor rather than create a
     * light one and repaint it. Only a theme map that arrives after creation repaints.
     * @returns {String} One of {@link #editorThemes}
     * @protected
     */
    resolveEditorTheme() {
        let me       = this,
            theme    = me.useThemeAwareness && me.getTheme(),
            explicit = me.options.theme;

        if (!theme) return me.editorTheme;

        if (Object.hasOwn(me.themeMap, theme)) return me.themeMap[theme];

        return (me.getStaticConfig('editorThemes').includes(explicit) ? explicit : me.schemeMap[declaredScheme(theme)]) ?? me.editorTheme
    }

    /**
     * @summary Retires the old window's native editor and invalidates pending mount callbacks.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        this.editorMountGeneration++;

        oldValue && Neo.main.addon.MonacoEditor.destroyInstance({
            id      : this.id,
            windowId: oldValue
        })
    }

    /**
     * Triggered before the cursorBlinking config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetCursorBlinking(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'cursorBlinking')
    }

    /**
     * Triggered before the editorTheme config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetEditorTheme(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'editorTheme')
    }

    /**
     * Triggered before the language config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetLanguage(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'language')
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        // `componentId` names the holder to drop. The addon refcounts observation per component and
        // unobserves only once a target's holder list is empty, so a payload carrying just `id`
        // removes nothing and leaves the native observer attached to a destroyed editor.
        me.mounted && Neo.main.addon.ResizeObserver.unregister({
            componentId: me.id,
            id         : me.id,
            windowId   : me.windowId
        });

        Neo.main.addon.MonacoEditor.destroyInstance({
            id      : me.id,
            windowId: me.windowId
        });

        super.destroy(...args)
    }

    /**
     * Fetches the current value from the editor instance
     * @returns {Promise<*>}
     */
    async getEditorValue() {
        let me = this;

        return Neo.main.addon.MonacoEditor.getValue({
            id      : me.id,
            windowId: me.windowId
        })
    }

    /**
     * Override this method as needed inside your own class extensions
     * @returns {Object}
     */
    getInitialOptions() {
        let me = this;

        return {
            appName             : me.appName,
            contextmenu         : me.contextmenu,
            cursorBlinking      : me.cursorBlinking,
            domReadOnly         : me.domReadOnly,
            id                  : me.id,
            fontSize            : me.fontSize,
            language            : me.language,
            lineNumbers         : me.showLineNumbers ? 'on' : 'off',
            minimap             : me.minimap,
            readOnly            : me.readOnly,
            scrollBeyondLastLine: me.scrollBeyondLastLine,
            theme               : me.resolveEditorTheme(),
            value               : me.stringifyValue(me.value),
            windowId            : me.windowId,

            scrollbar: {
                alwaysConsumeMouseWheel: false // enables page scrolling when over-scrolling the content box
            },

            ...me.options
        }
    }

    /**
     *
     */
    layoutEditor() {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MonacoEditor.layoutEditor({
                id      : me.id,
                windowId: me.windowId
            })
        }
    }

    /**
     * @param {Object} data
     * @param {Object} data.event
     * @param {String} data.id
     * @param {String} data.value
     */
    onContentChange(data) {
        this.fire('editorChange', data)
    }

    /**
     *
     * @param {String|String[]} value
     * @returns {String}
     */
    stringifyValue(value) {
        if (Array.isArray(value)) {
            value = value.join('\n')
        }

        return value
    }

    /**
     * @param {Object} options
     */
    updateOptions(options) {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MonacoEditor.updateOptions({
                id      : me.id,
                windowId: me.windowId,
                options
            })
        }
    }

    /**
     * Serializes the MonacoEditor into a JSON-compatible object.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            contextmenu         : me.contextmenu,
            cursorBlinking      : me.cursorBlinking,
            domReadOnly         : me.domReadOnly,
            editorTheme         : me.editorTheme,
            fontSize            : me.fontSize,
            language            : me.language,
            minimap             : me.serializeConfig(me.minimap),
            options             : me.serializeConfig(me.options),
            readOnly            : me.readOnly,
            scrollBeyondLastLine: me.scrollBeyondLastLine,
            showLineNumbers     : me.showLineNumbers,
            value               : me.stringifyValue(me.value)
        }
    }
}

export default Neo.setupClass(MonacoEditor);
