import ComponentColumn from './Component.mjs';
import IconComponent   from '../../component/Icon.mjs';

/**
 * @class Neo.grid.column.Icon
 * @extends Neo.grid.column.Component
 */
class Icon extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Icon'
         * @protected
         */
        className: 'Neo.grid.column.Icon',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: IconComponent
        },
        /**
         * @member {String|null} cellIconCls=null
         */
        cellIconCls: null,
        /**
         * @member {String} type='icon'
         * @protected
         */
        type: 'icon'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        let me          = this,
            value       = record[me.dataField],
            cellIconCls = me.cellIconCls;

        if (cellIconCls) {
            return {
                cellIconCls,
                hidden: !value,
                ...config
            }
        }

        return {
            cellIconCls: value,
            hidden     : !value,
            ...config
        }
    }
}

export default Neo.setupClass(Icon);
