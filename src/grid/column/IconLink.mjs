import ComponentColumn from './Component.mjs';
import IconLinkComponent from '../../component/IconLink.mjs';

/**
 * @class Neo.grid.column.IconLink
 * @extends Neo.grid.column.Component
 */
class IconLink extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.IconLink'
         * @protected
         */
        className: 'Neo.grid.column.IconLink',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: IconLinkComponent
        },
        /**
         * @member {String|null} cellIconCls=null
         */
        cellIconCls: null,
        /**
         * @member {String|null} labelField=null
         */
        labelField: null,
        /**
         * @member {Function|null} labelFormatter=null
         */
        labelFormatter: null,
        /**
         * @member {String} type='iconLink'
         * @protected
         */
        type: 'iconLink',
        /**
         * @member {Function|null} urlFormatter=null
         */
        urlFormatter: null
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        let me        = this,
            dataValue = record[me.dataField],
            url       = dataValue,
            label     = me.labelField ? record[me.labelField] : null;

        if (me.urlFormatter) {
            url = me.urlFormatter(dataValue, record)
        }

        if (me.labelFormatter) {
            label = me.labelFormatter(me.labelField ? label : dataValue, record)
        }

        return {
            cellIconCls: me.cellIconCls,
            label,
            url,
            ...config
        }
    }
}

export default Neo.setupClass(IconLink);
