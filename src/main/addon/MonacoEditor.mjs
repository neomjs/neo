import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

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
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'createInstance',
                'getValue',
                'setValue'
            ]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadFiles()
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    createInstance(data) {
        monaco.editor.create(DomAccess.getElement(data.id), {
            language: 'javascript',
            value   : ['function x() {', '\tconsole.log("Hello world!");', '}'].join('\n')
        })
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    getValue(data) {
        console.log('getValue', data);

        return {}
    }

    /**
     *
     */
    loadFiles() {
        window.require = { paths: { vs: '../../../../node_modules/monaco-editor/min/vs' } };

        Promise.all([
            DomAccess.loadStylesheet('../../../../node_modules/monaco-editor/min/vs/editor/editor.main.css', {name: 'vs/editor/editor.main'}),
            DomAccess.loadScript('../../../../node_modules/monaco-editor/min/vs/loader.js'),
            DomAccess.loadScript('../../../../node_modules/monaco-editor/min/vs/editor/editor.main.nls.js'),
            DomAccess.loadScript('../../../../node_modules/monaco-editor/min/vs/editor/editor.main.js')
        ]).then(() => {
            // console.log('files loaded');
        })
    }

    /**
     * @param {Object} data
     */
    setValue(data) {
        console.log('setValue', data);
    }
}

Neo.applyClassConfig(MonacoEditor);

export default MonacoEditor;
