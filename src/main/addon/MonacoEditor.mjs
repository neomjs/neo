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
         * The engine's Monaco build from `buildScripts/build/monaco.mjs`: the editor, its stylesheet and
         * font, and its workers.
         * @member {String} libraryBasePath=Neo.config.basePath+'dist/monaco'
         */
        libraryBasePath: Neo.config.basePath + 'dist/monaco',
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
     * @summary Creates one native editor per mounted wrapper and routes its model changes to the worker.
     * For a complete list of options see:
     * https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IEditorOptions.html
     * @param {Object} data
     */
    createInstance(data) {
        let me                                  = this,
            {appName, id, windowId, ...options} = data,
            node                                = DomAccess.getElement(id),
            editor;

        if (me.map[id]) {
            return
        }

        if (node) {
            editor = me.map[id] = monaco.editor.create(node, options);

            editor.onDidChangeModelContent(me.onContentChange.bind(me, id))
        } else if (Neo.config.environment === 'development') {
            console.warn(`addon.MonacoEditor: node ${id} not found`)
        }
    }

    /**
     * @summary Releases the editor and its owned model/listeners before forgetting the holder.
     * Monaco owns models created from value/language options; externally supplied models remain
     * caller-owned, so model disposal must stay with the editor's ownership rules.
     * @param {Object} data
     * @param {String} data.id
     */
    destroyInstance(data) {
        this.map[data.id]?.dispose();
        delete this.map[data.id]
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object}
     */
    getValue(data) {
        return this.map[data.id]?.getModel().getValue()
    }

    /**
     * @summary Maps the label of a worker Monaco starts onto that worker's bundle in the build.
     * The labels of the language services are their language ids; every other label runs the
     * generic editor worker.
     * @param {String} moduleId Always `'workerMain.js'`
     * @param {String} label
     * @returns {String}
     */
    getWorkerUrl(moduleId, label) {
        let worker = {
            css       : 'css',
            handlebars: 'html',
            html      : 'html',
            javascript: 'ts',
            json      : 'json',
            less      : 'css',
            razor     : 'html',
            scss      : 'css',
            typescript: 'ts'
        }[label] || 'editor';

        return `${this.libraryBasePath}/${worker}.worker.mjs`
    }

    /**
     * Changing the size of the parent container will only get honored when re-triggering an editor layout
     * @param {Object} data
     * @param {String} data.id
     */
    layoutEditor(data) {
        this.map[data.id]?.layout()
    }

    /**
     * @summary Imports the Monaco build with its stylesheet, after pointing Monaco at the build's workers.
     * The module namespace becomes the `monaco` global this addon calls. Monaco's own `globalAPI` flag
     * would publish only the core API, without language namespaces such as `monaco.typescript`.
     * @returns {Promise<void>}
     */
    async loadFiles() {
        let me   = this,
            path = new URL(me.libraryBasePath, document.baseURI).href;

        globalThis.MonacoEnvironment = {getWorkerUrl: me.getWorkerUrl.bind(me)};

        [globalThis.monaco] = await Promise.all([
            // Resolved against the document like the stylesheet, and left alone by webpack
            import(/* webpackIgnore: true */ `${path}/editor.mjs`),
            DomAccess.loadStylesheet(`${path}/editor.css`).catch(error => {
                throw new Error(`Monaco stylesheet failed: ${path}/editor.css`, {cause: error})
            })
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
     * @summary Changes the current model's language through Monaco's public editor API.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setLanguage(data) {
        const model = this.map[data.id]?.getModel();

        model && monaco.editor.setModelLanguage(model, data.value)
    }

    /**
     * @summary Applies the main realm's Monaco theme through its public editor API.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setTheme(data) {
        this.map[data.id] && monaco.editor.setTheme(data.value)
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
