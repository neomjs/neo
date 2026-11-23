import ComponentColumn   from './Component.mjs';
import ProgressComponent from '../../component/Progress.mjs';

/**
 * @summary Renders a pooled `Neo.component.Progress` cell bound to `record[dataField]`, animating width changes only on in-place updates of the same record.
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
        type: 'progress',
        /**
         * Smoothly transitions bar width when an already-bound record updates in place (`component[recordProperty] === record`).
         * Pooled row recycling (`scroll`, `sort`, `filter`) omits `.neo-progress-animate` so recycled cells snap immediately.
         * @member {Boolean} useTransition=true
         */
        useTransition: true
    }

    /**
     * @summary Maps `record[dataField]` to `value` and toggles `'neo-progress-animate'` exclusively for same-record updates.
     * @param {Object} config
     * @param {Record} record
     * @param {Object} [data]
     * @returns {Object}
     */
    applyRecordConfigs(config, record, data) {
        let component = data?.component,
            next      = {
                value: this.getRecordValue(record),
                ...config
            },
            useTransition = next.useTransition ?? this.useTransition;

        delete next.useTransition;

        if (component) {
            let animate   = Boolean(useTransition && component[this.recordProperty] === record),
                sourceCls = next.cls !== undefined ? next.cls : component.cls,
                baseCls   = (Array.isArray(sourceCls) ? sourceCls : sourceCls ? [sourceCls] : [])
                    .filter(cls => cls !== 'neo-progress-animate');

            if (animate) {
                next.cls = [...baseCls, 'neo-progress-animate']
            } else if (next.cls !== undefined || component.cls?.includes('neo-progress-animate')) {
                next.cls = baseCls
            }
        }

        return next
    }
}

export default Neo.setupClass(Progress);
