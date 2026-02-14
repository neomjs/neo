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
         * @member {String} hideMode='visibility'
         * @reactive
         */
        hideMode: 'visibility',
        /**
         * @member {String|null} iconCls=null
         */
        iconCls: null,
        /**
         * @member {String} type='iconLink'
         * @protected
         */
        type: 'iconLink'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        let me = this;

        return {
            iconCls: me.iconCls,
            url    : record[me.dataField],
            ...config
        }
    }
}

export default Neo.setupClass(IconLink);
