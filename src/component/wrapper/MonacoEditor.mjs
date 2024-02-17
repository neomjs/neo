import Base from '../../component/Base.mjs';

/**
 * @class Neo.component.wrapper.MonacoEditor
 * @extends Neo.component.Base
 */
class MonacoEditor extends Base {
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
         * @member {String|String[]} value_=''
         */
        value_: ''
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (value) {
            let opts = {
                appName: me.appName,
                id     : me.id,
                value  : me.stringifyValue(me.value)
            };

            setTimeout(() => {
                Neo.main.addon.MonacoEditor.createInstance(opts).then(() => {
                    me.onComponentMounted()
                })
            }, 50)
        }
    }

    /**
     * Triggered after the value config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        if (me.mounted) {
            Neo.main.addon.MonacoEditor.setValue({
                appName: me.appName,
                id     : me.id,
                value  : me.stringifyValue(me.value)
            })
        }
    }

    /**
     * @param args
     */
    destroy(...args) {
        Neo.main.addon.MonacoEditor.destroyInstance({
            appName: this.appName,
            id     : this.id
        });

        super.destroy(...args)
    }

    /**
     *
     */
    onComponentMounted() {
        console.log('onComponentMounted', this.id);
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
}

Neo.applyClassConfig(MonacoEditor);

export default MonacoEditor;
