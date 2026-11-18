import ExampleGroup from '../model/ExampleGroup.mjs';
import Store        from '../../../src/data/Store.mjs';

/**
 * @summary The example groups that publish a card in the selected build, in definition order.
 * @class Portal.store.ExampleGroups
 * @extends Neo.data.Store
 */
class ExampleGroups extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.ExampleGroups'
         * @protected
         */
        className: 'Portal.store.ExampleGroups',
        /**
         * @member {String} keyProperty='family'
         */
        keyProperty: 'family',
        /**
         * @member {Neo.data.Model} model=ExampleGroup
         * @reactive
         */
        model: ExampleGroup
    }
}

export default Neo.setupClass(ExampleGroups);
