import {default as Component} from '../component/Base.mjs';

/**
 * @class Neo.grid.View
 * @extends Neo.component.Base
 */
class View extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.grid.View'
         * @protected
         */
        className: 'Neo.grid.View',
        /**
         * @member {String} ntype='grid-view'
         * @protected
         */
        ntype: 'grid-view',
        /**
         * @member {Array} cls=['neo-grid-view']
         */
        cls: ['neo-grid-view'],
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['neo-grid-row'],
                cn : []
            }]
        }
    }}

    /**
     * vdom.Helper should not compare ids for table rows by default
     * @override
     */
    syncVdomIds() {}
}

Neo.applyClassConfig(View);

export {View as default};