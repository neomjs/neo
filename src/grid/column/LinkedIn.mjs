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
         * @member {String|null} cellIconCls='fa-brands fa-linkedin'
         */
        cellIconCls: 'fa-brands fa-linkedin',
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
            cellIconCls: me.cellIconCls,
            url,
            ...config
        }
    }
}

export default Neo.setupClass(LinkedIn);
