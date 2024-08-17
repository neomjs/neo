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
         * Will get set to true once all Monaco related files got loaded
         * @member {Boolean} isReady_=false
         * @protected
         */
        isReady_: false,
        /**
         * @member {String} libraryBasePath='../../node_modules/monaco-editor/min/vs'
         */
        libraryBasePath: Neo.config.basePath + 'node_modules/monaco-editor/min/vs',
        /**
         * Amount in ms to delay the loading of library files, unless remote method access happens
         * @member {Number} loadFilesDelay=5000
         * @protected
         */
        loadFilesDelay: 5000,
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
     * @member {Object[]} cache=[]
     */
    cache = []
    /**
     * Will get set to true once we start loading Monaco related files
     * @member {Boolean} isLoading=false
     */
    isLoading = false
    /**
     * Internal flag to store the setTimeout() id for loading external files
     * @member {Number|null} loadingTimeoutId=null
     */
    loadingTimeoutId = null
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

        let me = this;

        me.loadingTimeoutId = setTimeout(() => {
            me.loadFiles()
        }, me.loadFilesDelay)
    }

    /**
     * Triggered after the isReady config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsReady(value, oldValue) {
        if (value) {
            let me = this,
                returnValue;

            me.cache.forEach(item => {
                returnValue = me[item.fn](item.data);
                item.resolve(returnValue)
            });

            me.cache = []
        }
    }

    /**
     * Internally caches call when isReady===false
     * Loads the library files in case this is not already happening
     * @param item
     * @returns {Promise<unknown>}
     */
    cacheMethodCall(item) {
        let me = this;

        if (!me.isLoading) {
            clearTimeout(me.loadingTimeoutId);
            me.loadingTimeoutId = null;
            me.loadFiles()
        }

        return new Promise((resolve, reject) => {
            me.cache.push({...item, resolve})
        })
    }

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

        await DomAccess.loadStylesheet(path + '/editor/editor.main.css', {name: 'vs/editor/editor.main'});
        await DomAccess.loadScript(path + '/loader.js');
        await DomAccess.loadScript(path + '/editor/editor.main.nls.js');
        await DomAccess.loadScript(path + '/editor/editor.main.js');

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

Neo.setupClass(MonacoEditor);

export default MonacoEditor;
