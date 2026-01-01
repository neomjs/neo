import ComponentColumn   from './Component.mjs';
import ProgressComponent from '../../component/Progress.mjs';

/**
 * @class Neo.grid.column.Progress
 * @extends Neo.grid.column.Component
 */
class Progress extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Progress'
         * @protected
         */
        className: 'Neo.grid.column.Progress',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: ProgressComponent
        },
        /**
         * @member {String} type='progress'
         * @protected
         */
        type: 'progress'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            value: record[this.dataField],
            ...config
        }
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            defaults: this.serializeConfig(this.defaults)
        }
    }
}

export default Neo.setupClass(Progress);
