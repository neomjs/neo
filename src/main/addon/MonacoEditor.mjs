import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * Adds support for using the Monaco Code Editor within neo.
 * See: https://github.com/microsoft/monaco-editor
 * @class Neo.main.addon.MonacoEditor
 * @extends Neo.main.addon.Base
 */
class MonacoEditor extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.MonacoEditor'
         * @protected
         */
        className: 'Neo.main.addon.MonacoEditor',
        /**
         * @member {String} libraryBasePath='../../../../node_modules/monaco-editor/min/vs'
         */
        libraryBasePath: '../../../../node_modules/monaco-editor/min/vs',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'createInstance',
                'destroyInstance',
                'getValue',
                'setLanguage',
                'setOptions',
                'setTheme',
                'setValue'
            ]
        }
    }

    /**
     * Will get set to true once all Monaco related files got loaded
     * @member {Boolean} isReady=false
     */
    isReady = false
    /**
     * Stores component DOM ids as keys and editor instances as values
     * @member {Object} map={}
     */
    map = {}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadFiles()
    }

    /**
     * @param {Object}  data
     * @param {Boolean} data.contextmenu
     * @param {String}  data.cursorBlinking
     * @param {Number}  data.fontSize
     * @param {String}  data.id
     * @param {String}  data.language
     * @param {String}  data.lineNumbers
     * @param {Object}  data.minimap
     * @param {Boolean} data.readOnly
     * @param {String}  data.theme
     * @param {String}  data.value
     */
    createInstance(data) {
        let me     = this,
            editor = me.map[data.id] = monaco.editor.create(DomAccess.getElement(data.id), {
                contextmenu   : data.contextmenu,
                cursorBlinking: data.cursorBlinking,
                fontSize      : data.fontSize,
                language      : data.language,
                lineNumbers   : data.lineNumbers,
                minimap       : data.minimap,
                readOnly      : data.readOnly,
                theme         : data.theme,
                value         : data.value
            });

        editor.getModel().onDidChangeContent(me.onContentChange.bind(me, data.id))
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroyInstance(data) {
        // todo: destroy the editor instance if possible
        delete this.map[data.id]
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object}
     */
    getValue(data) {
        return this.map[data.id].getModel().getValue()
    }

    /**
     *
     */
    loadFiles() {
        const path = this.libraryBasePath;

        window.require = { paths: { vs: path } };

        Promise.all([
            DomAccess.loadStylesheet(path + '/editor/editor.main.css', {name: 'vs/editor/editor.main'}),
            DomAccess.loadScript(path + '/loader.js'),
            DomAccess.loadScript(path + '/editor/editor.main.nls.js'),
            DomAccess.loadScript(path + '/editor/editor.main.js')
        ]).then(() => {
            this.isReady = true
        })
    }

    /**
     * Forwards content changes as DOM change events to the app-worker.
     * @param {String} id
     * @param {Object} event
     */
    onContentChange(id, event) {
        let node = DomAccess.getElement(id),
            path = DomEvents.getPathFromElement(node).map(e => DomEvents.getTargetData(e));

        DomEvents.sendMessageToApp({
            event,
            id,
            path,
            type : 'change',
            value: this.map[id].getModel().getValue()
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setLanguage(data) {
        this.map[data.id].getModel().setLanguage(data.value)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.options
     */
    setOptions(data) {
        this.map[data.id].updateOptions(data.options)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setTheme(data) {
        this.map[data.id]._themeService.setTheme(data.value)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setValue(data) {
        this.map[data.id].getModel().setValue(data.value)
    }
}

Neo.applyClassConfig(MonacoEditor);

export default MonacoEditor;
