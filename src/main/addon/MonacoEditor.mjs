import Base from './Base.mjs';

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

        console.log('MonacoEditor addon loaded')
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
     * @param {Object} data
     */
    setValue(data) {
        console.log('setValue', data);
    }
}

Neo.applyClassConfig(MonacoEditor);

export default MonacoEditor;
