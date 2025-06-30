import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * Adds support for using the Monaco Code Editor within neo.
 * Repository: https://github.com/microsoft/monaco-editor
 * API: https://microsoft.github.io/monaco-editor/typedoc/index.html
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
         * List methods which must get cached until the addon reaches its `isReady` state
         * @member {String[]} interceptRemotes
         */
        interceptRemotes: [
            'createInstance',
            'destroyInstance',
            'getValue',
            'layoutEditor',
            'setLanguage',
            'setTheme',
            'setValue',
            'updateOptions'
        ],
        /**
         * @member {String} libraryBasePath='../../node_modules/monaco-editor/min/vs'
         */
        libraryBasePath: Neo.config.basePath + 'node_modules/monaco-editor/min/vs',
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
                'layoutEditor',
                'setLanguage',
                'setTheme',
                'setValue',
                'updateOptions'
            ]
        }
    }

    /**
     * Stores component DOM ids as keys and editor instances as values
     * @member {Object} map={}
     */
    map = {}

    /**
     * For a complete list of options see:
     * https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IEditorOptions.html
     * @param {Object} data
     */
    createInstance(data) {
        let me   = this,
            {id} = data,
            node = DomAccess.getElement(id),
            editor;

        delete data.appName;
        delete data.id;

        if (node) {
            editor = me.map[id] = monaco.editor.create(node, data);

            editor.getModel().onDidChangeContent(me.onContentChange.bind(me, id))
        } else if (Neo.config.environment === 'development') {
            console.warn(`addon.MonacoEditor: node ${id} not found`)
        }
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
     * Changing the size of the parent container will only get honored when re-triggering an editor layout
     * @param {Object} data
     * @param {String} data.id
     */
    layoutEditor(data) {
        this.map[data.id].layout()
    }

    /**
     *
     */
    async loadFiles() {
        let me   = this,
            path = me.libraryBasePath;

        window.require = {paths: {vs: path}};

        await DomAccess.loadScript(path + '/loader.js');

        await Promise.all([
            DomAccess.loadStylesheet(path + '/editor/editor.main.css', {name: 'vs/editor/editor.main'}),
            DomAccess.loadScript(path + '/editor/editor.main.nls.js'),
            DomAccess.loadScript(path + '/editor/editor.main.js')
        ])
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
            type : 'editorChange', // we must not use "change", since the editor contains a textarea tag which also fires change.
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

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.options
     */
    updateOptions(data) {
        this.map[data.id].updateOptions(data.options)
    }
}

export default Neo.setupClass(MonacoEditor);
