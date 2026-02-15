import ComponentColumn   from './Component.mjs';
import IconLinkComponent from '../../component/IconLink.mjs';

/**
 * @class Neo.grid.column.LinkedIn
 * @extends Neo.grid.column.Component
 */
class LinkedIn extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.LinkedIn'
         * @protected
         */
        className: 'Neo.grid.column.LinkedIn',
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
         * @member {String|null} iconCls='fa-brands fa-linkedin'
         */
        iconCls: 'fa-brands fa-linkedin',
        /**
         * @member {String} type='linkedin'
         * @protected
         */
        type: 'linkedin'
    }

    /**
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        let me  = this,
            url = record[me.dataField];

        if (url && !url.startsWith('http')) {
            url = `https://www.linkedin.com/in/${url}/`
        }

        return {
            iconCls: me.iconCls,
            url,
            ...config
        }
    }
}

export default Neo.setupClass(LinkedIn);
