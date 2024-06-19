import Base from '../../component/Base.mjs';

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
         */
        contextmenu_: false,
        /**
         * Options are: 'blink', 'expand', 'phase', 'smooth', 'solid'
         * @member {String} cursorBlinking_='blink'
         */
        cursorBlinking_: 'blink',
        /**
         * additional property to only use in combination with readOnly === true.
         * domReadOnly additionally sets the readonly attribute to the underlying textarea.
         * @member {Boolean} domReadOnly_=false
         */
        domReadOnly_: false,
        /**
         * Options are: 'vs', 'vs-dark', 'hc-black', 'hc-light'
         * @member {String} editorTheme_='vs'
         */
        editorTheme_: 'vs',
        /**
         * @member {Number} fontSize_=14
         */
        fontSize_: 14,
        /**
         * @member {String} language_='javascript'
         */
        language_: 'javascript',
        /**
         * @member {Object} minimap_={enabled: false}
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
         */
        options_: {},
        /**
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * @member {Boolean} scrollBeyondLastLine_=false
         */
        scrollBeyondLastLine_: false,
        /**
         * @member {Boolean} showLineNumbers_=true
         */
        showLineNumbers_: true,
        /**
         * @member {String|String[]} value_=''
         */
        value_: ''
    }

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
        })
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
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        value && setTimeout(() => {
            let me = this;

            Neo.main.addon.MonacoEditor.createInstance(me.getInitialOptions()).then(() => {
                // use this custom method as needed inside your class extensions
                me.onEditorMounted?.()
            })
        }, 150)
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
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.mounted && Neo.main.addon.ResizeObserver.unregister({
            id      : me.id,
            windowId: me.windowId
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
            theme               : me.editorTheme,
            value               : me.stringifyValue(me.value),
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
}

Neo.setupClass(MonacoEditor);

export default MonacoEditor;
