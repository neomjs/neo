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
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=SideNavModel
         */
        model: SideNavModel,
        /**
         * @member {String} url='../../resources/examples/data/formSideNav.json'
         */
        url: '../../resources/examples/data/formSideNav.json'
    }
}

Neo.applyClassConfig(SideNav);

export default SideNav;
