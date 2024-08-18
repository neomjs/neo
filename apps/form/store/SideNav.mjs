import SideNavModel from '../model/SideNav.mjs'
import Store        from '../../../src/data/Store.mjs';

/**
 * @class Form.store.SideNav
 * @extends Neo.data.Store
 */
class SideNav extends Store {
    static config = {
        /**
         * @member {String} className='Form.store.SideNav'
         * @protected
         */
        className: 'Form.store.SideNav',
        /**
         * @member {Neo.data.Model} model=SideNavModel
         */
        model: SideNavModel
    }
}

export default Neo.setupClass(SideNav);
