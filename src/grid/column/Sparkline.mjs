import ComponentColumn    from './Component.mjs';
import SparklineComponent from '../../component/Sparkline.mjs';

/**
 * @class Neo.grid.column.Sparkline
 * @extends Neo.grid.column.Component
 */
class Sparkline extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Sparkline'
         * @protected
         */
        className: 'Neo.grid.column.Sparkline',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: SparklineComponent
        },
        /**
         * @member {String|null} rendererClassName=null
         */
        rendererClassName: null,
        /**
         * @member {String|null} rendererImportPath=null
         */
        rendererImportPath: null,
        /**
         * @member {String} type='sparkline'
         * @protected
         */
        type: 'sparkline'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            values: record[this.dataField],
            ...config
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.rendererClassName || me.rendererImportPath) {
            me.defaults = {
                ...me.defaults,
                rendererClassName : me.rendererClassName,
                rendererImportPath: me.rendererImportPath
            }
        }
    }
}

export default Neo.setupClass(Sparkline);
