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
            editor;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'createInstance', data})
        } else {
            delete data.appName;
            delete data.id;

            editor = me.map[id] = monaco.editor.create(DomAccess.getElement(id), data);

            editor.getModel().onDidChangeContent(me.onContentChange.bind(me, id))
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroyInstance(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'destroyInstance', data})
        } else {
            // todo: destroy the editor instance if possible
            delete this.map[data.id]
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object}
     */
    getValue(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'getValue', data})
        } else {
            return me.map[data.id].getModel().getValue()
        }
    }

    /**
     * Changing the size of the parent container will only get honored when re-triggering an editor layout
     * @param {Object} data
     * @param {String} data.id
     */
    layoutEditor(data) {
        this.isReady && this.map[data.id].layout()
    }

    /**
     *
     */
    async loadFiles() {
        let me   = this,
            path = me.libraryBasePath;

        me.isLoading = true;

        window.require = {paths: {vs: path}};

        await Promise.all([
            DomAccess.loadStylesheet(path + '/editor/editor.main.css', {name: 'vs/editor/editor.main'}),
            DomAccess.loadScript(path + '/loader.js'),
            DomAccess.loadScript(path + '/editor/editor.main.nls.js'),
            DomAccess.loadScript(path + '/editor/editor.main.js')
        ])

        me.isLoading = false;
        me.isReady   = true
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
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'setLanguage', data})
        } else {
            me.map[data.id].getModel().setLanguage(data.value)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setTheme(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'setTheme', data})
        } else {
            me.map[data.id]._themeService.setTheme(data.value)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setValue(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'setValue', data})
        } else {
            me.map[data.id].getModel().setValue(data.value)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.options
     */
    updateOptions(data) {
        let me = this;

        if (!me.isReady) {
            return me.cacheMethodCall({fn: 'updateOptions', data})
        } else {
            me.map[data.id].updateOptions(data.options)
        }
    }
}

export default Neo.setupClass(MonacoEditor);
