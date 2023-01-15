import Toolbar from '../toolbar/Base.mjs';

/**
 * @class Neo.toolbar.Breadcrumb
 * @extends Neo.toolbar.Base
 */
class Breadcrumb extends Toolbar {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.toolbar.Breadcrumb'
         * @protected
         */
        className: 'Neo.toolbar.Breadcrumb',
        /**
         * @member {Object[]} items
         */
        items: []
    }}
}

Neo.applyClassConfig(Breadcrumb);

export default Breadcrumb;
